/* ============================================================================
   Importar estado de cuenta en PDF (BANDEC) — Finanzas FRANWE
   ----------------------------------------------------------------------------
   - Botón "PDF" en cada pestaña de cuenta (Chequera / Tarjeta CUP / Tarjeta USD).
   - Lee uno o varios PDF de estado de cuenta y extrae de cada operación:
     fecha, concepto (observaciones), monto, tipo (Cr=ingreso, Db=gasto),
     Ref_Corriente y Ref_Origen.
   - Deduplica por Ref_Corriente + Ref_Origen (nunca importa dos veces la
     misma operación, ni siquiera entre varios PDF).
   - Conserva el orden del documento: archivos en el orden elegido, páginas y
     filas de arriba hacia abajo.
   - Cada operación va al mes que le corresponde según su fecha (mes abierto o
     historial). Muestra vista previa antes de importar.
   ============================================================================ */
(function () {
'use strict';

/* ---------------- Expresiones de los formatos BANDEC ----------------
   Formato 1 "Estados de Cuenta" (chequera):  1800.00 Cr
   Formato 2 "Movimientos Tarjetas" (CUP):    -8377.47 Db 0.00 (con saldo) */
var RE_INICIO = /^(\d{2})\/(\d{2})\/(\d{4})\s+([A-Z0-9]{13})\s+([A-Z0-9]{6,14})\s*(.*)$/;
var RE_FIN    = /(-?[\d,]+\.\d{2})\s+(Cr|Db)(?:\s+(-?[\d,]+\.\d{2}))?\s*$/;
var RE_OMITIR = /^(Saldo (Contable|Reservado|Sobre Giro|Disponible)|Estados de Cuenta|Movimientos Tarjetas|Titular:|Tarjeta \[Cuenta\]:|Sucursal y Cuenta:|Fecha de Emisi|Rango de Fecha|Cantidad de Movimientos|Diferencia entre|FechaContab|Fecha Ref_Corriente|https?:\/\/|\d{1,2}\/\d{1,2}\/\d{2},)/;
var RE_CUENTA = /\[(\d{6,20})\]/;
var RE_PERIODO = /(\d{1,2}\/\d{1,2}\/\d{4})\s+al\s+(\d{1,2}\/\d{1,2}\/\d{4})/;

var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

/* Une una palabra partida entre dos líneas: "C"+"OMISION" -> "COMISION".
   Solo se aplica al caso seguro (letra mayúscula suelta al final); el resto
   se une con espacio para no corromper palabras legítimas. */
function unirLinea(prev, nueva) {
    if (/(?:^|[^A-Za-z])[A-Z]$/.test(prev) && /^[A-Z]/.test(nueva)) return prev + nueva;
    return prev + ' ' + nueva;
}

/* Limpia el concepto: quita etiquetas XML incrustadas y colapsa espacios */
function limpiarConcepto(t) {
    return String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* 'YYYY-MM-DD' -> 'Septiembre 2026' (usa el formato de la app) */
function mesDeFecha(f) {
    var p = String(f).split('-');
    return getFechaStr(parseInt(p[1], 10), parseInt(p[0], 10));
}

/* 'YYYY-MM-DD' -> 'DD/MM/YYYY' para mostrar */
function fechaCorta(f) {
    var p = String(f).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

/* ---------------- Carga de pdf.js bajo demanda ---------------- */
var pdfjsPromesa = null;
function cargarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (pdfjsPromesa) return pdfjsPromesa;
    pdfjsPromesa = new Promise(function (resolve, reject) {
        var listo = false;
        function fail(err) { if (!listo) { listo = true; reject(err); } }
        var s = document.createElement('script');
        s.src = PDFJS_URL;
        s.onload = function () {
            if (listo) return; listo = true;
            try {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
                resolve();
            } catch (e) { fail(e); }
        };
        s.onerror = function () { fail(new Error('no-cdn')); };
        document.head.appendChild(s);
        setTimeout(function () { fail(new Error('timeout')); }, 25000);
    });
    return pdfjsPromesa;
}

/* ---------------- Extracción de líneas con pdf.js ---------------- */
async function lineasDePagina(pdf, n) {
    var page = await pdf.getPage(n);
    var tc = await page.getTextContent();
    var grupos = [];
    tc.items.forEach(function (it) {
        var y = Math.round(it.transform[5]), x = it.transform[4];
        var g = null;
        for (var i = 0; i < grupos.length; i++) {
            if (Math.abs(grupos[i].y - y) <= 3) { g = grupos[i]; break; }
        }
        if (!g) { g = { y: y, items: [] }; grupos.push(g); }
        g.items.push({ x: x, str: it.str });
    });
    grupos.sort(function (a, b) { return b.y - a.y; });
    return grupos.map(function (g) {
        g.items.sort(function (a, b) { return a.x - b.x; });
        return g.items.map(function (i) { return i.str; }).join(' ').replace(/\s+/g, ' ').trim();
    }).filter(function (s) { return s.length > 0; });
}

/* Cierra una fila abierta y devuelve la operación (o null si está incompleta) */
function cerrarBuf(buf) {
    var m = RE_FIN.exec(buf.obs);
    if (!m) return null;
    return {
        fecha: buf.y + '-' + buf.mo + '-' + buf.d,
        refC: buf.refC, refO: buf.refO,
        concepto: limpiarConcepto(buf.obs.slice(0, m.index)),
        monto: Math.abs(parseFloat(m[1].replace(/,/g, ''))),
        tipo: m[2] === 'Cr' ? 'ingreso' : 'gasto'
    };
}

/* Parsea líneas a operaciones. `buf` permite continuar una fila abierta
   que viene de la página anterior. Devuelve {ops, resto}. */
function parsearLineas(lineas, buf) {
    var ops = [];
    lineas.forEach(function (line) {
        var ms = RE_INICIO.exec(line);
        if (ms) {                                   /* inicio de fila primero */
            if (buf) { var p0 = cerrarBuf(buf); if (p0) ops.push(p0); }
            buf = { d: ms[1], mo: ms[2], y: ms[3], refC: ms[4], refO: ms[5], obs: ms[6] || '' };
            if (RE_FIN.test(buf.obs)) { var p1 = cerrarBuf(buf); if (p1) ops.push(p1); buf = null; }
            return;
        }
        if (RE_OMITIR.test(line)) {                 /* cabeceras, saldos, pies */
            if (buf) { var p2 = cerrarBuf(buf); if (p2) ops.push(p2); buf = null; }
            return;
        }
        if (buf) {                                  /* continuación de la fila */
            buf.obs = unirLinea(buf.obs, line);
            if (RE_FIN.test(line)) { var p3 = cerrarBuf(buf); if (p3) ops.push(p3); buf = null; }
        }
    });
    return { ops: ops, resto: buf };
}

async function parsearPdf(arrayBuffer, nombreArchivo, onProgreso) {
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var ops = [], buf = null, cuenta = '', periodo = '', textoLen = 0;
    for (var n = 1; n <= pdf.numPages; n++) {
        var lineas = await lineasDePagina(pdf, n);
        textoLen += lineas.join(' ').length;
        if (onProgreso) { try { onProgreso(n, pdf.numPages); } catch (e) {} }
        if (n === 1) {
            var txt = lineas.join('\n');
            var mc = RE_CUENTA.exec(txt);
            if (mc) cuenta = mc[1];
            var mp = RE_PERIODO.exec(txt);
            if (mp) periodo = mp[1] + ' al ' + mp[2];
        }
        var r = parsearLineas(lineas, buf);
        ops = ops.concat(r.ops);
        buf = r.resto;
    }
    if (buf) { var op = cerrarBuf(buf); if (op) ops.push(op); }
    return { nombre: nombreArchivo, cuenta: cuenta, periodo: periodo, ops: ops, textoLen: textoLen };
}

/* ---------------- Deduplicación ---------------- */
function clavesExistentes() {
    var set = {};
    function add(m) {
        if (m && m.refCorriente && m.refOrigen) set[m.refCorriente + '|' + m.refOrigen] = true;
    }
    (typeof movimientos !== 'undefined' ? movimientos : []).forEach(add);
    getHistorial().forEach(function (h) { (h.movimientos || []).forEach(add); });
    return set;
}

/* ---------------- Interfaz: botones + selector de archivo ---------------- */
var archivoInput = null;
var cuentaPreseleccionada = 'chequera';

function abrirSelectorPdf(cuenta) {
    if (typeof puedeEditar === 'function' && !puedeEditar()) {
        alert('No tienes permiso de edición.');
        return;
    }
    cuentaPreseleccionada = cuenta || 'chequera';
    if (!archivoInput) {
        archivoInput = document.createElement('input');
        archivoInput.type = 'file';
        archivoInput.accept = '.pdf,application/pdf';
        archivoInput.multiple = true;
        archivoInput.style.display = 'none';
        archivoInput.addEventListener('change', procesarArchivos);
        document.body.appendChild(archivoInput);
    }
    archivoInput.click();
}

function inyectarBotonesPdf() {
    var pares = [
        ['botonesChequera', 'chequera'],
        ['botonesCUP', 'tarjeta_cup'],
        ['botonesUSD', 'tarjeta_usd']
    ];
    pares.forEach(function (par) {
        var barra = document.getElementById(par[0]);
        if (!barra || barra.querySelector('.btn-pdf-import')) return;
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-outline-primary btn-pdf-import';
        b.innerHTML = '<i class="bi bi-file-earmark-pdf"></i> PDF';
        b.title = 'Adjuntar estado de cuenta en PDF';
        b.addEventListener('click', function () { abrirSelectorPdf(par[1]); });
        barra.appendChild(b);
    });
}

/* ---------------- Procesamiento de archivos ---------------- */
var ultimoLote = [];

async function procesarArchivos(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    var btn = document.querySelector('.btn-pdf-import');
    var txtOriginal = btn ? btn.innerHTML : '';
    function estadoBtn(t) { if (btn) { btn.disabled = true; btn.innerHTML = t; } }
    function restaurarBtn() { if (btn) { btn.disabled = false; btn.innerHTML = txtOriginal; } }
    estadoBtn('<i class="bi bi-hourglass-split"></i> Cargando lector…');
    try {
        await cargarPdfJs();
    } catch (err) {
        restaurarBtn();
        if (err && err.message === 'timeout') {
            alert('El lector de PDF tardó demasiado en cargar (internet lento). Inténtalo de nuevo con mejor conexión.');
        } else {
            alert('No se pudo cargar el lector de PDF. Revisa tu conexión e inténtalo de nuevo.');
        }
        return;
    }
    var todos = [], infos = [], textoTotal = 0;
    try {
        for (var i = 0; i < files.length; i++) {
            estadoBtn('<i class="bi bi-hourglass-split"></i> Leyendo ' + (i + 1) + '/' + files.length + '…');
            var buf = await files[i].arrayBuffer();
            var r = await parsearPdf(buf, files[i].name, function (n, total) {
                estadoBtn('<i class="bi bi-hourglass-split"></i> Pág. ' + n + '/' + total + '…');
            });
            r.ops.forEach(function (op) { op.archivo = files[i].name; });
            todos = todos.concat(r.ops);   /* orden: archivos elegidos, páginas y filas en orden */
            textoTotal += r.textoLen;
            infos.push(r);
        }
    } catch (err) {
        console.error('Error parseando PDF:', err);
        restaurarBtn();
        alert('No se pudo leer el PDF. Asegúrate de que sea un estado de cuenta válido.');
        return;
    }
    restaurarBtn();
    if (!todos.length) {
        if (textoTotal < 500) {
            alert('No se encontró texto en el PDF. Si es un documento escaneado (foto), el lector no puede leerlo.');
        } else {
            alert('No se encontraron operaciones con el formato reconocido (estados de cuenta BANDEC).');
        }
        return;
    }
    mostrarVistaPrevia(todos, infos);
}

/* ---------------- Vista previa ---------------- */
function estadoFila(op, existentes, vistos) {
    var k = op.refC + '|' + op.refO;
    if (existentes[k] || vistos[k]) return 'duplicada';
    vistos[k] = true;
    return 'nueva';
}

function destinoDe(op) {
    var mesOp = mesDeFecha(op.fecha);
    if (typeof modoEdicionActivo !== 'undefined' && modoEdicionActivo) {
        return mesOp === edicionMesNombre ? mesOp + ' (en edición)' : null;
    }
    if (mesEstaBloqueado(mesOp) && !isAdmin()) return null;
    return mesOp;
}

function mostrarVistaPrevia(ops, infos) {
    var existentes = clavesExistentes();
    var vistos = {};
    var filas = ops.map(function (op) {
        return { op: op, estado: estadoFila(op, existentes, vistos), destino: destinoDe(op) };
    });
    ultimoLote = filas;

    var nuevas = filas.filter(function (f) { return f.estado === 'nueva' && f.destino; }).length;
    var dups = filas.filter(function (f) { return f.estado === 'duplicada'; }).length;
    var omitidas = filas.length - nuevas - dups;

    var cuentasDetectadas = infos.map(function (r) {
        return esc(r.nombre) + (r.cuenta ? ' → cuenta …' + esc(r.cuenta.slice(-4)) : '') +
               (r.periodo ? ' (' + esc(r.periodo) + ')' : '');
    }).join('<br>');

    var nombresCuenta = { chequera: 'Chequera', tarjeta_cup: 'Tarjeta CUP', tarjeta_usd: 'Tarjeta USD' };
    var filasHtml = filas.map(function (f) {
        var op = f.op;
        var badge = op.tipo === 'ingreso'
            ? '<span class="badge bg-success">Ingreso</span>'
            : '<span class="badge bg-danger">Gasto</span>';
        var est = f.estado === 'duplicada'
            ? '<span class="badge bg-secondary">Duplicada</span>'
            : (f.destino ? '<span class="badge bg-primary">Nueva</span>'
                         : '<span class="badge bg-warning text-dark">Se omite</span>');
        var concepto = esc(op.concepto);
        var corto = concepto.length > 90 ? concepto.slice(0, 90) + '…' : concepto;
        return '<tr>' +
            '<td class="text-nowrap">' + esc(fechaCorta(op.fecha)) + '</td>' +
            '<td title="' + concepto + '">' + corto + '</td>' +
            '<td class="text-end text-nowrap">$' + Number(op.monto).toFixed(2) + '</td>' +
            '<td>' + badge + '</td>' +
            '<td class="text-nowrap small">' + (f.destino ? esc(f.destino) : '—') + '</td>' +
            '<td>' + est + '</td></tr>';
    }).join('');

    var html =
    '<div class="modal fade" id="pdfImportModal" tabindex="-1">' +
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
        '<div class="modal-content">' +
          '<div class="modal-header"><h5 class="modal-title"><i class="bi bi-file-earmark-pdf me-2"></i>Importar estado de cuenta</h5>' +
          '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
          '<div class="modal-body">' +
            '<div class="small text-secondary mb-2">' + cuentasDetectadas + '</div>' +
            '<div class="d-flex flex-wrap align-items-center gap-2 mb-3">' +
              '<span class="badge bg-primary">' + nuevas + ' nuevas</span>' +
              '<span class="badge bg-secondary">' + dups + ' duplicadas (se omiten)</span>' +
              (omitidas ? '<span class="badge bg-warning text-dark">' + omitidas + ' omitidas</span>' : '') +
              '<span class="ms-auto d-flex align-items-center gap-2"><label class="small mb-0">Importar a:</label>' +
              '<select id="pdfImportCuenta" class="form-select form-select-sm" style="width:auto">' +
                Object.keys(nombresCuenta).map(function (k) {
                    return '<option value="' + k + '"' + (k === cuentaPreseleccionada ? ' selected' : '') + '>' + nombresCuenta[k] + '</option>';
                }).join('') +
              '</select></span>' +
            '</div>' +
            '<div class="table-responsive"><table class="table table-sm table-hover align-middle">' +
            '<thead><tr><th>Fecha</th><th>Concepto</th><th class="text-end">Monto</th><th>Tipo</th><th>Mes destino</th><th>Estado</th></tr></thead>' +
            '<tbody>' + filasHtml + '</tbody></table></div>' +
            '<div class="small text-secondary mt-2">Las duplicadas se detectan por Ref_Corriente + Ref_Origen y no se importan. El orden de las operaciones se conserva.</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
            '<button type="button" class="btn btn-primary" id="pdfImportConfirm" ' + (nuevas ? '' : 'disabled') + '>' +
            '<i class="bi bi-download me-1"></i> Importar ' + nuevas + ' operaciones</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    var viejo = document.getElementById('pdfImportModal');
    if (viejo) viejo.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    var modal = new bootstrap.Modal(document.getElementById('pdfImportModal'));
    document.getElementById('pdfImportConfirm').addEventListener('click', function () {
        var cuenta = document.getElementById('pdfImportCuenta').value;
        modal.hide();
        importarLote(cuenta);
    });
    modal.show();
}

/* ---------------- Importación ---------------- */
function importarLote(cuenta) {
    var nuevas = ultimoLote.filter(function (f) { return f.estado === 'nueva' && f.destino; });
    if (!nuevas.length) return;

    var enEdicion = (typeof modoEdicionActivo !== 'undefined' && modoEdicionActivo);
    var actual = periodoNominaActual();
    var historial = enEdicion ? null : getHistorial();
    var histModificado = false;
    var porMes = {};
    var n = 0;

    nuevas.forEach(function (f) {
        var op = f.op;
        var mesOp = mesDeFecha(op.fecha);
        var mov = {
            id: nextId++,
            concepto: op.concepto,
            tipo: op.tipo,
            clasificacion: 'operacional',
            cuenta: cuenta,
            monto: Math.round(op.monto * 100) / 100,
            fecha: op.fecha,
            refCorriente: op.refC,
            refOrigen: op.refO,
            origen: 'pdf_banco'
        };
        if (enEdicion) {
            movimientos.push(mov);          /* copia de trabajo; se guarda con "Guardar" */
        } else if (mesOp === actual) {
            movimientos.push(mov);
        } else {
            var h = null;
            for (var i = 0; i < historial.length; i++) {
                if (historial[i].mes === mesOp) { h = historial[i]; break; }
            }
            if (!h) {
                h = { mes: mesOp, fechaCierre: hoy(), tasa: tasaVista(), movimientos: [] };
                historial.push(h);
            }
            if (!Array.isArray(h.movimientos)) h.movimientos = [];
            h.movimientos.push(mov);
            histModificado = true;
        }
        porMes[mesOp] = (porMes[mesOp] || 0) + 1;
        n++;
    });

    if (enEdicion) {
        renderAll();
        alert('✅ ' + n + ' operaciones agregadas al mes en edición (' + edicionMesNombre + ').\nPulsa "Guardar" para conservarlas.');
        return;
    }
    saveMovimientos(movimientos);
    if (histModificado) saveHistorial(historial);
    renderAll();

    var detalle = Object.keys(porMes).map(function (m) { return m + ': ' + porMes[m]; }).join(', ');
    alert('✅ Importadas ' + n + ' operaciones del estado de cuenta.\n' + detalle);
}

/* ---------------- Arranque ---------------- */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inyectarBotonesPdf);
} else {
    inyectarBotonesPdf();
}

/* Gancho para pruebas */
window.__pdfImportTest = {
    parsearLineas: parsearLineas,
    limpiarConcepto: limpiarConcepto,
    unirLinea: unirLinea,
    mesDeFecha: mesDeFecha
};

})();
