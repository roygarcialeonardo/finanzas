/* ============================================================================
   Importar estado de cuenta en PDF (BANDEC) — Finanzas FRANWE
   ----------------------------------------------------------------------------
   - Botón "PDF" en cada pestaña de cuenta (Chequera / Tarjeta CUP / Tarjeta USD).
   - Lee uno o varios PDF de estado de cuenta y extrae de cada operación:
     fecha, concepto (observaciones), monto, tipo (Cr=ingreso, Db=gasto),
     Ref_Corriente y Ref_Origen.
   - Deduplica por Ref_Corriente + Ref_Origen (nunca importa dos veces la
     misma operación, ni siquiera entre varios PDF).
   - Del encabezado captura titular, banco, sucursal y número de
     cuenta/tarjeta (extraerCabecera) y los guarda en la cuenta
     financiera destino al confirmar la importación.
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

/* La página principal encapsula sus funciones en un IIFE; expone lo necesario
   en window.FinanzasPDF (ver index.html). Sin eso, hay que recargar. */
function API() {
    if (!window.FinanzasPDF) throw new Error('API no disponible: cierra y vuelve a abrir la página.');
    return window.FinanzasPDF;
}

/* ================= CLASIFICACIÓN AUTOMÁTICA =================
   Reglas (2026-10-24):
   1) «transferencia entre cuentas» → transferencia entre cuentas
      propias: no cuenta como ingreso ni gasto, pero mueve el saldo.
   2) «comercio electrónico» → marca QR en el movimiento.
   2b) «CREDITO RECIBIDO POR CORREO ELECTRONICO» → marca QR
       (pedido de Leonardo 2026-10-24: todo crédito con ese concepto
       bancario es un cobro por QR; solo la marca, sin tocar la clase).
       EXCEPCIÓN (también 2026-10-24): si la clase final es
       «transferencia» (entre cuentas propias), la marca QR se quita:
       un traspaso propio no es un cobro por QR.
   2c) CONTABILIZACIÓN DE ESAS VENTAS (2026-10-25): si además el
       movimiento es un INGRESO de clase normal con esa frase, aquí se
       levanta la bandera «ventaCorreo» (solo informativa para la
       vista previa) y el NÚCLEO CONTABLE lo asienta contra la
       801-000 «Ingresos por Venta de Mercancías y Productos»
       (ctaEsVentaCorreo en el núcleo: también cubre los movimientos
       ya importados al regenerar; la imputación manual manda).
   3) Pago de impuestos con el CÓDIGO del tributo en el concepto →
      «Pago de ONAT» vinculado a las obligaciones del Vector Fiscal;
      alimenta la Declaración Jurada (tributos por concepto).
   La detección ONAT es SOLO por código: el texto literal del concepto
   bancario no aparece en fuentes públicas. Si el concepto no trae un
   código reconocido NO se fuerza la clasificación: se marca «sospecha»
   para revisión manual en la vista previa.
   Códigos verificados: Vector Fiscal real 2025 + Manual del Tenedor de
   Libros Rev. 01/2025 + Res. 306/2023 MFP (informe de códigos ONAT).
   La cuota consolidada del régimen simplificado no tiene código
   explícito en las fuentes: por verificar (no está en la tabla). */
function normTxtPdf(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function normCodigoLocal(v) {
    var d = String(v || '').replace(/\D/g, '');
    return d.replace(/^0+(?=\d)/, '');
}
/* Clave: código normalizado (sin ceros a la izquierda).
   cat: categoría para la Declaración Jurada. */
var TABLA_TRIBUTOS_LOCAL = {
    '114022': { codigo: '0114022', nombre: 'Impuesto sobre las Ventas y Servicios', cat: 'deducible', fuente: 'verificado' },
    '114822': { codigo: '0114822', nombre: 'Impuesto sobre las Ventas y Servicios', cat: 'deducible', fuente: 'verificado' },
    '11482':  { codigo: '011482',  nombre: 'Impuesto sobre las Ventas y Servicios', cat: 'deducible', fuente: 'verificado' },
    '510122': { codigo: '0510122', nombre: 'IIP · aporte mensual (anticipo 5 %)', cat: 'anticipo_iip', fuente: 'verificado' },
    '520522': { codigo: '0520522', nombre: 'IIP · retención a trabajadores', cat: 'deducible', fuente: 'verificado' },
    '520322': { codigo: '0520322', nombre: 'IIP · retención a trabajadores', cat: 'deducible', fuente: 'verificado' },
    '52032':  { codigo: '052032',  nombre: 'IIP · retenciones y pagos parciales', cat: 'deducible', fuente: 'verificado' },
    '530222': { codigo: '0530222', nombre: 'IIP · liquidación anual (DJ-08)', cat: 'liquidacion', fuente: 'verificado' },
    '53022':  { codigo: '053022',  nombre: 'IIP · liquidación adicional / dividendos', cat: 'liquidacion', fuente: 'verificado' },
    '610322': { codigo: '0610322', nombre: 'Impuesto por la Utilización de la Fuerza de Trabajo', cat: 'deducible', fuente: 'verificado' },
    '610122': { codigo: '0610122', nombre: 'Impuesto por la Utilización de la Fuerza de Trabajo', cat: 'deducible', fuente: 'inferencia' },
    '61012':  { codigo: '061012',  nombre: 'Impuesto por la Utilización de la Fuerza de Trabajo', cat: 'deducible', fuente: 'verificado' },
    '810132': { codigo: '0810132', nombre: 'Contribución a la Seguridad Social', cat: 'deducible', fuente: 'verificado' },
    '81013':  { codigo: '081013',  nombre: 'Contribución a la Seguridad Social', cat: 'deducible', fuente: 'verificado' },
    '820132': { codigo: '0820132', nombre: 'Contribución a la Seguridad Social (propia del TCP)', cat: 'deducible', fuente: 'verificado' },
    '820232': { codigo: '0820232', nombre: 'Contribución Especial a la Seguridad Social (trabajadores)', cat: 'deducible', fuente: 'verificado' },
    '82023':  { codigo: '082023',  nombre: 'Contribución Especial a la Seguridad Social (trabajadores)', cat: 'deducible', fuente: 'verificado' },
    '730122': { codigo: '0730122', nombre: 'Impuesto sobre Documentos', cat: 'deducible', fuente: 'verificado' },
    '900122': { codigo: '0900122', nombre: 'Tasa por radicación de anuncios y propaganda', cat: 'deducible', fuente: 'verificado' },
    '740122': { codigo: '0740122', nombre: 'Contribución Territorial para el Desarrollo Local', cat: 'deducible', fuente: 'inferencia' },
    '74012':  { codigo: '074012',  nombre: 'Contribución Territorial para el Desarrollo Local', cat: 'deducible', fuente: 'verificado' },
    '400722': { codigo: '0400722', nombre: 'Impuesto sobre Utilidades (pago a cuenta / liquidación)', cat: 'pago_cuenta_utilidades', fuente: 'inferencia' },
    '40072':  { codigo: '040072',  nombre: 'Impuesto sobre Utilidades (pago a cuenta / liquidación)', cat: 'pago_cuenta_utilidades', fuente: 'verificado' }
};
function categoriaDjPorCodigo(crudo) {
    var hit = TABLA_TRIBUTOS_LOCAL[normCodigoLocal(crudo)];
    return hit ? hit.cat : 'otros';
}
/* Resuelve un código: primero el Vector Fiscal importado en la app
   (precedencia), después la tabla local verificada. */
function resolverCodigoPdf(crudo) {
    var limpio = String(crudo || '').replace(/\D/g, '');
    if (!limpio) return null;
    try {
        var api = API();
        if (api.fiscalTributos && api.codigoAporteNorm) {
            var trib = api.fiscalTributos() || {};
            for (var k in trib) {
                if (Object.prototype.hasOwnProperty.call(trib, k) && api.codigoAporteNorm(k) === api.codigoAporteNorm(limpio)) {
                    return { codigo: k, nombre: trib[k], cat: categoriaDjPorCodigo(limpio), fuente: 'vector' };
                }
            }
        }
        if (api.resolverAporte) {
            var r = api.resolverAporte(limpio);
            if (r && r.nombre) return { codigo: r.codigo || limpio, nombre: r.nombre, cat: categoriaDjPorCodigo(limpio), fuente: 'vector' };
        }
    } catch (e) { /* sin app (pruebas): cae a la tabla local */ }
    var hit = TABLA_TRIBUTOS_LOCAL[normCodigoLocal(limpio)];
    if (hit) return { codigo: hit.codigo, nombre: hit.nombre, cat: hit.cat, fuente: hit.fuente };
    return null;
}
function extraerCodigosConcepto(concepto) {
    var runs = String(concepto || '').match(/\d+/g) || [];
    return runs.filter(function (r) { return r.length === 6 || r.length === 7; });
}
var MESES_TXT_PDF = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function capMesPdf(m) { return m.charAt(0).toUpperCase() + m.slice(1); }
function detectarPeriodoConcepto(concepto) {
    var t = ' ' + normTxtPdf(concepto) + ' ';
    for (var i = 0; i < 12; i++) {
        var m = t.match(new RegExp(MESES_TXT_PDF[i] + '\\s*(?:de\\s*)?(20\\d{2})'));
        if (m) return capMesPdf(MESES_TXT_PDF[i]) + ' ' + m[1];
    }
    var m2 = t.match(/\b(0[1-9]|1[0-2])[\/\-](20\d{2})\b/);
    if (m2) return capMesPdf(MESES_TXT_PDF[+m2[1] - 1]) + ' ' + m2[2];
    var m3 = t.match(/\b(20\d{2})[\/\-](0[1-9]|1[0-2])\b/);
    if (m3) return capMesPdf(MESES_TXT_PDF[+m3[2] - 1]) + ' ' + m3[1];
    return null;
}
function clasificarOperacion(op) {
    var t = normTxtPdf(op.concepto || '');
    var res = { clase: 'normal', qr: false, onat: null, sospechaOnat: false };
    if (/transferencia entre cuentas|traspaso entre cuentas/.test(t)) res.clase = 'transferencia';
    if (/comercio electronico/.test(t)) res.qr = true;
    /* Pedido de Leonardo (2026-10-24): todo movimiento cuyo concepto
       diga «CREDITO RECIBIDO POR CORREO ELECTRONICO» es un cobro por
       QR. Solo pone la marca (mov.qr → Registro QR del cierre); NO
       toca la clase ni el resto de reglas. Las comisiones bancarias
       dicen «DEBITO RECIBIDO POR CORREO ELECTRONICO» y quedan fuera.
       Se prueba con los espacios colapsados y también sin espacios,
       por si BANDEC parte una palabra de la frase entre dos líneas y
       unirLinea la deja separada («ELECTRO NICO»). */
    var tCol = t.replace(/\s+/g, ' ');
    var esCorreo = /credito recibido por correo electronico/.test(tCol) ||
        tCol.replace(/ /g, '').indexOf('creditorecibidoporcorreoelectronico') >= 0;
    if (esCorreo) res.qr = true;
    var cods = extraerCodigosConcepto(op.concepto || '');
    for (var i = 0; i < cods.length; i++) {
        var r = resolverCodigoPdf(cods[i]);
        if (r) {
            res.onat = { codigo: r.codigo, nombre: r.nombre, cat: r.cat, fuente: r.fuente, periodo: detectarPeriodoConcepto(op.concepto) };
            break;
        }
    }
    if (res.onat) res.clase = 'onat';
    else if (/\bonat\b/.test(t) || (/pago|aporte/.test(t) && /tributo|impuesto/.test(t))) res.sospechaOnat = true;

    /* Clasificaciones de movimiento pedidas por Leonardo (ronda 5):
       solo salidas (gasto) y solo cuando la clase quedó 'normal' — un
       pago ONAT con código o una transferencia mandan sobre el concepto.
       Si el concepto no lo dice con claridad, NO se clasifica aquí y el
       movimiento sigue el flujo normal (rojo en contabilidad hasta que
       Leonardo lo clasifique en la app). */
    /* Pedido de Leonardo (2026-10-24): las transferencias entre cuentas
       PROPIAS nunca llevan la marca QR — un traspaso entre sus cuentas
       no es un cobro por QR, aunque el concepto traiga también la frase
       «CREDITO RECIBIDO POR CORREO ELECTRONICO» (así viene la pata de
       entrada en la tarjeta: la operación real VB60003597380 de
       2 096 880,46). Va AL FINAL, con la clase ya definitiva, y aplica
       a TODAS las vías de detección QR (regla 2 y regla 2b). Si un
       código ONAT resolvió, la clase ya no es 'transferencia' y el
       ajuste no aplica. */
    if (res.clase === 'transferencia') res.qr = false;
    res.claseMov = null;
    if (op.tipo === 'gasto' && res.clase === 'normal') {
        if (/contingencia/.test(t)) {
            res.claseMov = 'contingencia';        /* salida del Fondo: NO es gasto */
        } else if (/dividendo/.test(t) || (/utilidad/.test(t) && /socio/.test(t))) {
            res.claseMov = 'utilidades';         /* pago a socios: NO es gasto */
        } else if (/salario|nomina/.test(t)) {
            res.claseMov = 'salario';             /* SÍ es gasto; se cruza con la nómina */
        }
    }
    /* Regla 2c (2026-10-25): bandera informativa para la vista previa.
       Con la clase YA definitiva: solo ingresos normales con la frase
       (las transferencias quedan fuera — se asientan entre bancos — y
       los pagos ONAT ya salieron por su vía). La marca QR no cambia. */
    res.ventaCorreo = !!(esCorreo && op.tipo === 'ingreso' && res.clase === 'normal');
    return res;
}
/* Corrección manual desde la vista previa (índice = fila de ultimoLote) */
window.__pdfSetClase = function (idx, val) {
    var f = ultimoLote[idx];
    if (f && f.op && f.op._clasif) {
        /* Las clasificaciones de la ronda 5 viven en claseMov (la clase
           sigue siendo 'normal': ni transferencia ni pago ONAT). */
        if (val === 'contingencia' || val === 'utilidades' || val === 'salario') {
            f.op._clasif.clase = 'normal';
            f.op._clasif.claseMov = val;
        } else {
            f.op._clasif.clase = val;
            f.op._clasif.claseMov = null;
        }
    }
};
window.__pdfSetQr = function (idx, val) {
    var f = ultimoLote[idx];
    if (f && f.op && f.op._clasif) f.op._clasif.qr = !!val;
};
/* Ronda -35 (T4): confirmación expresa de una operación fuera de rango */
window.__pdfSetFuera = function (idx, val) {
    var f = ultimoLote[idx];
    if (f) f.confirmadaFuera = !!val;
};

/* Escape HTML local (la app tiene su propio esc() dentro del IIFE) */
function pdfEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}

/* Une una palabra partida entre dos líneas: "C"+"OMISION" -> "COMISION".
   BANDEC envuelve el texto de las observaciones a ancho fijo cortando el
   flujo de caracteres a mitad de palabra, así que también se pega sin
   espacio cuando la línea anterior termina en letra y la siguiente
   empieza con minúscula ("Tran"+"sferencia", "Comerci"+"o:"). El resto
   se une con espacio para no corromper palabras legítimas. */
function unirLinea(prev, nueva) {
    if (/(?:^|[^A-Za-z])[A-Z]$/.test(prev) && /^[A-Z]/.test(nueva)) return prev + nueva;
    if (/[A-Za-z]$/.test(prev) && /^[a-z]/.test(nueva)) return prev + nueva;
    return prev + ' ' + nueva;
}

/* Limpia el concepto: quita etiquetas XML incrustadas y colapsa espacios */
function limpiarConcepto(t) {
    return String(t).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/* 'YYYY-MM-DD' -> 'Septiembre 2026' (usa el formato de la app) */
function mesDeFecha(f) {
    var p = String(f).split('-');
    return API().getFechaStr(parseInt(p[1], 10), parseInt(p[0], 10));
}

/* 'YYYY-MM-DD' -> 'DD/MM/YYYY' para mostrar */
function fechaCorta(f) {
    var p = String(f).split('-');
    return p[2] + '/' + p[1] + '/' + p[0];
}

/* ---------------- Carga de pdf.js bajo demanda ----------------
   D7 (ronda -35): primero la copia LOCAL (vendor/) — en la instalación
   sin conexión el servidor la trae dentro (weblibs) y el importador
   funciona sin internet; en la versión en línea esa ruta no existe y
   se cae al CDN de siempre. El manifiesto del actualizador NO cambia:
   las librerías viajan en el ejecutable, no en el frontend. */
var PDFJS_URL_LOCAL = 'vendor/pdf.min.js';
var PDFJS_WORKER_LOCAL = 'vendor/pdf.worker.min.js';
var pdfjsPromesa = null;
function intentarCargaPdfJs(url, worker) {
    return new Promise(function (resolve, reject) {
        var listo = false;
        function fail(err) { if (!listo) { listo = true; reject(err); } }
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () {
            if (listo) return; listo = true;
            try {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
                resolve();
            } catch (e) { fail(e); }
        };
        s.onerror = function () { fail(new Error('no-cdn')); };
        document.head.appendChild(s);
        setTimeout(function () { fail(new Error('timeout')); }, 25000);
    });
}
function cargarPdfJs() {
    if (window.pdfjsLib) return Promise.resolve();
    if (pdfjsPromesa) return pdfjsPromesa;
    pdfjsPromesa = intentarCargaPdfJs(PDFJS_URL_LOCAL, PDFJS_WORKER_LOCAL)
        .catch(function () { return intentarCargaPdfJs(PDFJS_URL, PDFJS_WORKER); })
        .catch(function (e) { pdfjsPromesa = null; throw e; });
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

/* Extrae el fin de la operación (importe + Cr/Db [+ saldo corrido]) la
   PRIMERA vez que aparece en el texto acumulado, lo guarda en buf.fin y
   trunca obs en ese punto. En el formato 1 el importe va al final de la
   PRIMERA línea, pero el concepto continúa en las líneas siguientes
   (el código del tributo ONAT, «sferencia entre cuentas», el DET_PAGO…):
   la operación NO se cierra aquí; el buf queda abierto acumulando
   continuaciones hasta la siguiente operación o una línea de cierre.
   Solo se extrae una vez: importes sueltos dentro de las continuaciones
   («Imp: 77040.00», sin Cr/Db detrás) nunca disparan una extracción
   falsa, y el saldo corrido del formato 2 (grupo 3 de RE_FIN) se sigue
   guardando igual en buf.fin.saldo. */
function extraerFin(buf) {
    if (buf.fin) return;
    var m = RE_FIN.exec(buf.obs);
    if (!m) return;
    buf.fin = {
        monto: Math.abs(parseFloat(m[1].replace(/,/g, ''))),
        tipo: m[2] === 'Cr' ? 'ingreso' : 'gasto',
        saldo: (m[3] !== undefined && m[3] !== '') ? parseFloat(m[3].replace(/,/g, '')) : null
    };
    buf.obs = buf.obs.slice(0, m.index).replace(/\s+$/, '');
}

/* Cierra una fila y devuelve la operación (o null si está incompleta).
   Si el fin ya fue extraído (buf.fin), la operación se construye desde
   los datos guardados y el concepto es TODO el texto acumulado (línea
   inicial + continuaciones); si no, se busca el RE_FIN clásico en obs. */
function cerrarBuf(buf) {
    extraerFin(buf);
    if (!buf.fin) return null;
    return {
        fecha: buf.y + '-' + buf.mo + '-' + buf.d,
        refC: buf.refC, refO: buf.refO,
        concepto: limpiarConcepto(buf.obs),
        monto: buf.fin.monto,
        tipo: buf.fin.tipo,
        saldo: buf.fin.saldo
    };
}

/* 'DD/MM/YYYY' -> 'YYYY-MM-DD' (para el rango del estado) */
function fechaISOdeDMY(t) {
    var p = String(t || '').split('/');
    if (p.length !== 3) return '';
    return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
}

/* Parsea líneas a operaciones. `buf` permite continuar una fila abierta
   que viene de la página anterior. Devuelve {ops, resto, saldoLinea}.
   La operación se cierra SOLO al llegar la siguiente fila o una línea
   RE_OMITIR: aunque el importe ya venga en la primera línea (formato 1),
   el buf sigue abierto acumulando las continuaciones, que son parte del
   concepto (ver extraerFin). El resto sin cerrar lo cierra parsearPdf
   al final del documento.
   saldoLinea: último importe de una línea «Saldo Contable/Disponible»
   (formato 1, que no trae saldo corrido por operación) — candidato a
   saldo final según banco si no hay saldo corrido (ronda 7). Las líneas
   reales del estado terminan en «905195.53 Cr»: se tolera el sufijo
   Cr/Db tras el importe. */
/* ¿La fecha ISO existe en el calendario? (D8, ronda -35): el patrón de
   fecha casa con «99/99/2026», pero ese día no existe: sin esta
   validación la operación crearía un mes fantasma «2026-99». */
function fechaCalendarioOk(f) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(f || ''));
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/* Cierra el buf y vuelca la operación: a `ops` si su fecha existe en
   el calendario; a `invalidas` si no (nunca se convierte en movimiento
   ni se pierde en silencio: la vista previa y la cuarentena la enseñan). */
function volcarOp(buf, ops, invalidas) {
    var p = cerrarBuf(buf);
    if (!p) return;
    if (fechaCalendarioOk(p.fecha)) ops.push(p);
    else if (invalidas) invalidas.push(p);
}

function parsearLineas(lineas, buf) {
    var ops = [], invalidas = [], saldoLinea = null, saldoLineaIni = null, cantidadDeclarada = null;
    lineas.forEach(function (line) {
        var ms = RE_INICIO.exec(line);
        if (ms) {                                   /* inicio de fila primero */
            if (buf) { volcarOp(buf, ops, invalidas); }
            buf = { d: ms[1], mo: ms[2], y: ms[3], refC: ms[4], refO: ms[5], obs: ms[6] || '' };
            extraerFin(buf);   /* guarda el importe si ya viene en la 1ª línea; el buf SIGUE abierto */
            return;
        }
        if (RE_OMITIR.test(line)) {                 /* cabeceras, saldos, pies */
            if (/^Saldo (Contable|Disponible)\b/.test(line)) {
                var msl = /(-?[\d,]+\.\d{2})(?:\s+(?:Cr|Db))?\s*$/.exec(line);
                if (msl) {
                    saldoLinea = parseFloat(msl[1].replace(/,/g, ''));
                    /* «Saldo Contable Anterior: …» = saldo inicial del
                       estado (control de totales T3, ronda -35) */
                    if (saldoLineaIni == null && /^Saldo (Contable|Disponible) Anterior\b/.test(line)) saldoLineaIni = saldoLinea;
                }
            }
            /* Cantidad de movimientos DECLARADA por el banco: se captura
               ANTES de omitir la línea (control T1, ronda -35) */
            var mcd = /^Cantidad de Movimientos:\s*(\d+)/.exec(line);
            if (mcd && cantidadDeclarada == null) cantidadDeclarada = parseInt(mcd[1], 10);
            if (buf) { volcarOp(buf, ops, invalidas); buf = null; }
            return;
        }
        if (buf) {                                  /* continuación de la fila */
            buf.obs = unirLinea(buf.obs, line);
            extraerFin(buf);   /* por si el importe venía en una continuación; solo la 1ª vez */
        }
    });
    return { ops: ops, resto: buf, saldoLinea: saldoLinea, saldoLineaIni: saldoLineaIni, cantidadDeclarada: cantidadDeclarada, invalidas: invalidas };
}

/* ---------------- Cabecera del estado (pedido de Leonardo, 2026-10-24) ----
   Del encabezado de la PRIMERA página se capturan los datos de la
   cuenta para guardarlos en la cuenta financiera de la app y usarlos
   en su panel y en los documentos (CON-02, documentos de cuenta…).
   Formato 1 «Estados de Cuenta» (chequera):
     «Titular: MPM- FRANWE S.U.R.L.»
     «Sucursal y Cuenta: 3801 [0638034000008114]»
   Formato 2 «Movimientos Tarjetas Magnéticas» (CUP/USD):
     «Titular: MPM- FRANWE S.U.R.L.»
     «Tarjeta [Cuenta]: 9233069990009552 [40313480019850]»
     (sin sucursal en el encabezado: queda vacía, no se inventa)
   El BANCO sí viene en el texto de ambos formatos: la primera línea
   del PDF es «<fecha>, <hora> Banca Remota - BANDEC»; se extrae de
   ahí tal cual. Si ninguna línea lo identifica, banco queda vacío. */
function extraerCabecera(lineas) {
    var cab = { titular: '', sucursal: '', numeroCuenta: '', numeroTarjeta: '', banco: '' };
    var primeras = (lineas || []).slice(0, 12);
    primeras.forEach(function (line) {
        var m;
        if (!cab.titular && (m = /^Titular:\s*(.+)$/.exec(line))) cab.titular = m[1].trim();
        if ((m = /^Sucursal y Cuenta:\s*(\d+)\s*\[(\d{6,20})\]/.exec(line))) { cab.sucursal = m[1]; cab.numeroCuenta = m[2]; }
        if ((m = /^Tarjeta \[Cuenta\]:\s*(\d{10,20})\s*\[(\d{6,20})\]/.exec(line))) { cab.numeroTarjeta = m[1]; if (!cab.numeroCuenta) cab.numeroCuenta = m[2]; }
        if (!cab.banco) {
            var mb = /Banca Remota\s*-\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/.exec(line) || /\b(BANDEC|BANMET|BPA)\b/.exec(line);
            if (mb) cab.banco = mb[1].toUpperCase();
        }
    });
    return cab;
}

async function parsearPdf(arrayBuffer, nombreArchivo, onProgreso) {
    var pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    var ops = [], invalidas = [], buf = null, cuenta = '', periodo = '', textoLen = 0, desde = '', hasta = '', saldoLinea = null, cabecera = null;
    var cantidadDeclarada = null, saldoInicial = null;
    for (var n = 1; n <= pdf.numPages; n++) {
        var lineas = await lineasDePagina(pdf, n);
        textoLen += lineas.join(' ').length;
        if (onProgreso) { try { onProgreso(n, pdf.numPages); } catch (e) {} }
        if (n === 1) {
            var txt = lineas.join('\n');
            var mc = RE_CUENTA.exec(txt);
            if (mc) cuenta = mc[1];
            var mp = RE_PERIODO.exec(txt);
            if (mp) { periodo = mp[1] + ' al ' + mp[2]; desde = fechaISOdeDMY(mp[1]); hasta = fechaISOdeDMY(mp[2]); }
            cabecera = extraerCabecera(lineas);
        }
        var r = parsearLineas(lineas, buf);
        ops = ops.concat(r.ops);
        invalidas = invalidas.concat(r.invalidas || []);
        buf = r.resto;
        if (r.saldoLinea != null) saldoLinea = r.saldoLinea;
        if (r.cantidadDeclarada != null && cantidadDeclarada == null) cantidadDeclarada = r.cantidadDeclarada;
        if (r.saldoLineaIni != null && saldoInicial == null) saldoInicial = r.saldoLineaIni;
    }
    if (buf) { var op = cerrarBuf(buf); if (op) { if (fechaCalendarioOk(op.fecha)) ops.push(op); else invalidas.push(op); } }
    /* Saldo final SEGÚN BANCO del estado (ronda 7, para la conciliación):
       manda el saldo corrido de la ÚLTIMA operación del documento; si el
       formato no lo trae, la última línea «Saldo Contable/Disponible». */
    var saldoBancoFin = null, saldoFinFuente = null;
    for (var i = 0; i < ops.length; i++) { if (ops[i].saldo != null) saldoBancoFin = ops[i].saldo; }
    if (saldoBancoFin != null) saldoFinFuente = 'corrido';
    else if (saldoLinea != null) { saldoBancoFin = saldoLinea; saldoFinFuente = 'linea'; }
    return { nombre: nombreArchivo, cuenta: cuenta, periodo: periodo, desde: desde, hasta: hasta, saldoBancoFin: saldoBancoFin, saldoFinFuente: saldoFinFuente, saldoInicial: saldoInicial, cantidadDeclarada: cantidadDeclarada, invalidas: invalidas, ops: ops, textoLen: textoLen, cabecera: cabecera, origen: 'pdf_banco' };
}

/* Arma el mismo `info` que parsearPdf pero desde líneas ya extraídas
   (banco de pruebas y reutilizable por otras vías de entrada). */
function infoDesdeLineas(nombre, paginas) {
    var ops = [], invalidas = [], buf = null, saldoLinea = null, cantidadDeclarada = null, saldoInicial = null, textoLen = 0;
    (paginas || []).forEach(function (lineas) {
        textoLen += lineas.join(' ').length;
        var r = parsearLineas(lineas, buf);
        ops = ops.concat(r.ops);
        invalidas = invalidas.concat(r.invalidas || []);
        buf = r.resto;
        if (r.saldoLinea != null) saldoLinea = r.saldoLinea;
        if (r.cantidadDeclarada != null && cantidadDeclarada == null) cantidadDeclarada = r.cantidadDeclarada;
        if (r.saldoLineaIni != null && saldoInicial == null) saldoInicial = r.saldoLineaIni;
    });
    if (buf) { var op = cerrarBuf(buf); if (op) { if (fechaCalendarioOk(op.fecha)) ops.push(op); else invalidas.push(op); } }
    var primeras = (paginas && paginas[0]) || [];
    var txt = primeras.join('\n');
    var cuenta = '', periodo = '', desde = '', hasta = '';
    var mc = RE_CUENTA.exec(txt); if (mc) cuenta = mc[1];
    var mp = RE_PERIODO.exec(txt);
    if (mp) { periodo = mp[1] + ' al ' + mp[2]; desde = fechaISOdeDMY(mp[1]); hasta = fechaISOdeDMY(mp[2]); }
    var saldoBancoFin = null, saldoFinFuente = null;
    for (var i = 0; i < ops.length; i++) { if (ops[i].saldo != null) saldoBancoFin = ops[i].saldo; }
    if (saldoBancoFin != null) saldoFinFuente = 'corrido';
    else if (saldoLinea != null) { saldoBancoFin = saldoLinea; saldoFinFuente = 'linea'; }
    return { nombre: nombre, cuenta: cuenta, periodo: periodo, desde: desde, hasta: hasta, saldoBancoFin: saldoBancoFin, saldoFinFuente: saldoFinFuente, saldoInicial: saldoInicial, cantidadDeclarada: cantidadDeclarada, invalidas: invalidas, ops: ops, textoLen: textoLen, cabecera: extraerCabecera(primeras), origen: 'pdf_banco' };
}

/* ---------------- Control de totales del estado (ronda -35) ----------------
   validarTotales(info, ops, ctx) — función PURA: coteja lo que el banco
   DECLARA contra lo que el parser EXTRAJO, antes de importar nada.
     T1  cantidad declarada == extraídas (+ inválidas aparte)
     T2  cadena de saldos corridos, si el corrido es fiable
     T3  saldo inicial + neto == saldo final, si ambos son fiables
     T4  operaciones fuera del rango declarado (o con fecha imposible)
     T5  la cuenta de la cabecera == la cuenta elegida (ctx.cuentaSel +
         ctx.datosBanco: lo guardado en la ficha de cada cuenta)
   Bloquean la importación del estado: T1, T2 y T5 (el estado va a
   cuarentena). T3 NO bloquea (decisión de Leonardo): importa con aviso
   fuerte y el registro queda marcado «con diferencia». T4 retiene solo
   las operaciones marcadas, que entran únicamente con confirmación
   expresa por fila.
   Fiabilidad del saldo (regla R2): un saldo corrido vale si no son
   todos 0.00 (las tarjetas reales de BANDEC lo traen a cero: ahí el
   «saldo» no dice nada); la línea «Saldo Contable» del formato 1 sí es
   el saldo del banco. Tolerancia: 0,005 (la de ctaConciliacion). */
var TOL_TOTALES = 0.005;
function fmtNum(n) { return (Math.round((+n || 0) * 100) / 100).toFixed(2); }

function validarTotales(info, ops, ctx) {
    info = info || {}; ops = ops || []; ctx = ctx || {};
    var ingSuma = 0, gasSuma = 0, ingN = 0, gasN = 0;
    ops.forEach(function (o) { if (o.tipo === 'ingreso') { ingSuma += o.monto; ingN++; } else { gasSuma += o.monto; gasN++; } });
    var neto = ingSuma - gasSuma;
    var invalidas = info.invalidas || [];

    /* T1 — cantidad declarada contra extraídas */
    var T1;
    if (info.cantidadDeclarada == null) T1 = { estado: 'na', detalle: 'el estado no declara su cantidad de movimientos' };
    else if (ops.length + invalidas.length === info.cantidadDeclarada) T1 = { estado: 'ok', detalle: info.cantidadDeclarada + ' movimientos declarados y ' + ops.length + ' extraídos' + (invalidas.length ? ' (+' + invalidas.length + ' con fecha inválida)' : '') };
    else T1 = { estado: 'fallo', detalle: 'el banco declara ' + info.cantidadDeclarada + ' movimientos y se extrajeron ' + ops.length + (invalidas.length ? ' (+' + invalidas.length + ' con fecha inválida)' : '') + ': el archivo está incompleto o el formato cambió' };

    /* Fiabilidad del saldo corrido y del saldo final */
    var conSaldo = ops.filter(function (o) { return o.saldo != null; });
    var todosCero = ops.length > 0 && ops.every(function (o) { return o.saldo == null || o.saldo === 0; });
    var cadenaFiable = ops.length > 0 && conSaldo.length === ops.length && !todosCero;
    var saldoFinFiable = false;
    if (info.saldoBancoFin != null) {
        if (info.saldoFinFuente === 'linea') saldoFinFiable = true;
        else if (info.saldoFinFuente === 'corrido') saldoFinFiable = !todosCero;
    }

    /* T2 — cadena de saldos operación a operación */
    var T2;
    if (!cadenaFiable) T2 = { estado: 'na', detalle: 'sin saldo corrido fiable (el formato no lo trae o viene a 0.00)' };
    else {
        T2 = { estado: 'ok', detalle: 'la cadena de saldos cuadra operación a operación' };
        for (var i = 1; i < ops.length; i++) {
            var esp = ops[i - 1].saldo + (ops[i].tipo === 'ingreso' ? ops[i].monto : -ops[i].monto);
            if (Math.abs(esp - ops[i].saldo) > TOL_TOTALES) {
                T2 = { estado: 'fallo', detalle: 'la cadena de saldos se rompe en la operación ' + (i + 1) + ' (' + ops[i].fecha + '): con el saldo anterior el saldo sería ' + fmtNum(esp) + ' y el estado trae ' + fmtNum(ops[i].saldo) };
                break;
            }
        }
    }

    /* T3 — identidad del saldo: inicial + neto == final */
    var saldoIni = (info.saldoInicial != null) ? info.saldoInicial : (ctx.saldoInicialApp != null ? ctx.saldoInicialApp : null);
    var T3;
    if (!saldoFinFiable) T3 = { estado: 'na', detalle: 'el saldo final del estado no es fiable (viene a 0.00)' };
    else if (saldoIni == null) T3 = { estado: 'na', detalle: 'sin saldo inicial conocido (ni en el estado ni en la app)' };
    else if (Math.abs(saldoIni + neto - info.saldoBancoFin) <= TOL_TOTALES) T3 = { estado: 'ok', detalle: 'saldo inicial ' + fmtNum(saldoIni) + ' + neto ' + fmtNum(neto) + ' = saldo final ' + fmtNum(info.saldoBancoFin) };
    else T3 = { estado: 'fallo', detalle: 'saldo inicial ' + fmtNum(saldoIni) + ' + neto ' + fmtNum(neto) + ' = ' + fmtNum(saldoIni + neto) + ', pero el banco dice que el saldo final es ' + fmtNum(info.saldoBancoFin) + ' (diferencia de ' + fmtNum(saldoIni + neto - info.saldoBancoFin) + '): puede faltar un movimiento o sobrar uno' };

    /* T4 — fuera del rango declarado o fecha imposible */
    var fuera = [];
    ops.forEach(function (o, ix) {
        if (!fechaCalendarioOk(o.fecha)) { fuera.push(ix); return; }
        if (info.desde && info.hasta && (o.fecha < info.desde || o.fecha > info.hasta)) fuera.push(ix);
    });
    var T4 = !ops.length ? { estado: 'na', detalle: '', fueraDeRango: fuera }
        : fuera.length ? { estado: 'fallo', detalle: fuera.length + ' operación(es) fuera del rango del estado (' + (info.periodo || info.desde + ' al ' + info.hasta) + '): quedan retenidas hasta que las confirmes una a una', fueraDeRango: fuera }
        : { estado: (info.desde && info.hasta) ? 'ok' : 'na', detalle: (info.desde && info.hasta) ? 'todas las fechas caen dentro del rango del estado' : 'el estado no declara rango de fechas', fueraDeRango: fuera };

    /* T5 — la cabecera contra la cuenta elegida */
    var T5 = { estado: 'na', detalle: 'sin datos bancarios guardados con qué contrastar la cabecera' };
    if (ctx.cuentaSel && ctx.datosBanco) {
        var datos = ctx.datosBanco[ctx.cuentaSel];
        var cab = info.cabecera || {};
        var numCab = ctx.cuentaSel === 'chequera' ? (cab.numeroCuenta || '') : (cab.numeroTarjeta || cab.numeroCuenta || '');
        var numGuardado = datos ? (ctx.cuentaSel === 'chequera' ? (datos.numeroCuenta || '') : (datos.numeroTarjeta || datos.numeroCuenta || '')) : '';
        if (datos && numCab && numGuardado) {
            if (numCab === numGuardado) T5 = { estado: 'ok', detalle: 'la cabecera coincide con la cuenta elegida (' + numCab + ')' };
            else {
                var otra = '';
                Object.keys(ctx.datosBanco).forEach(function (k) {
                    var d = ctx.datosBanco[k] || {};
                    if (numCab === d.numeroCuenta || numCab === d.numeroTarjeta) otra = k;
                });
                T5 = { estado: 'fallo', detalle: 'el estado es de la cuenta ' + numCab + (otra ? ' (guardada como «' + otra + '»)' : '') + ' y elegiste «' + ctx.cuentaSel + '» (' + numGuardado + '): cambia la cuenta destino o el estado irá a cuarentena' };
            }
        }
    }

    var bloqueado = T1.estado === 'fallo' || T2.estado === 'fallo' || T5.estado === 'fallo';
    return {
        T1: T1, T2: T2, T3: T3, T4: T4, T5: T5,
        saldoFinFiable: saldoFinFiable, cadenaFiable: cadenaFiable,
        bloqueado: bloqueado, avisoFuerte: T3.estado === 'fallo',
        sumas: { ingN: ingN, ingSuma: ingSuma, gasN: gasN, gasSuma: gasSuma, neto: neto }
    };
}

/* ---------------- Validación del lote y paneles (ronda -35) ---------------- */
var validacionesLote = {};

function datosBancoGuardados() {
    try { var api = API(); return (api && api.datosBancoCuentas) ? api.datosBancoCuentas() : null; } catch (e) { return null; }
}
function clavesEstadosRegistrados() {
    try { var api = API(); return (api && api.clavesEstadosBanco) ? api.clavesEstadosBanco() : {}; } catch (e) { return {}; }
}
function clavesDescartadasCuarentena() {
    try { var api = API(); return (api && api.clavesDescartadasCuarentena) ? api.clavesDescartadasCuarentena() : {}; } catch (e) { return {}; }
}
/* Saldo inicial según la app para T3 cuando el estado no lo trae: suma
   con signo de los movimientos de ESA cuenta anteriores al rango. */
function saldoInicialAppPara(info, cuentaSel) {
    if (!info || info.saldoInicial != null || !info.desde || !cuentaSel) return null;
    try {
        var api = API(), suma = 0, hay = false;
        function add(m) {
            if (m && m.cuenta === cuentaSel && m.fecha && m.fecha < info.desde) {
                hay = true;
                suma += ((m.tipo === 'gasto' || m.tipo === 'onat') ? -1 : 1) * (parseFloat(m.monto) || 0);
            }
        }
        api.movs().forEach(add);
        api.getHistorial().forEach(function (h) { (h.movimientos || []).forEach(add); });
        return hay ? Math.round(suma * 100) / 100 : null;
    } catch (e) { return null; }
}

/* Valida cada info del lote (puro; marca en las ops las fuera de rango) */
function validarLote(infos, cuentaSel) {
    var map = {}, db = datosBancoGuardados();
    (infos || []).forEach(function (info) {
        if (!info) return;
        (info.ops || []).forEach(function (op) { delete op._fueraDeRango; });
        var v = validarTotales(info, info.ops || [], { cuentaSel: cuentaSel, datosBanco: db, saldoInicialApp: saldoInicialAppPara(info, cuentaSel) });
        (v.T4.fueraDeRango || []).forEach(function (ix) { if (info.ops[ix]) info.ops[ix]._fueraDeRango = true; });
        info._val = v;
        map[info.nombre] = v;
    });
    validacionesLote = map;
    return map;
}

function panelArchivoHtml(info) {
    var v = validacionesLote[info.nombre] || validarTotales(info, info.ops || [], {});
    var ops = info.ops || [];
    var invalidas = info.invalidas || [];
    var esFormato = !ops.length && info.textoLen >= 500 && !info.esTabla;
    var sem, semCls, semTxt;
    if (info.necesitaMapeo) { sem = '⚠'; semCls = 'bg-warning text-dark'; semTxt = 'Falta asignar columnas'; }
    else if (esFormato || v.bloqueado) { sem = '✘'; semCls = 'bg-danger'; semTxt = esFormato && !v.bloqueado ? 'Formato no reconocido' : 'Retenido por control de totales'; }
    else if (v.avisoFuerte || (v.T4.fueraDeRango || []).length || invalidas.length) { sem = '⚠'; semCls = 'bg-warning text-dark'; semTxt = 'Importa con avisos'; }
    else { sem = '✔'; semCls = 'bg-success'; semTxt = 'Cuadra con lo declarado'; }
    var h = '<div class="pdf-panel-archivo border rounded p-2 mb-2" data-archivo="' + pdfEsc(info.nombre) + '">';
    h += '<div class="d-flex flex-wrap align-items-center gap-2 mb-1"><span class="pdf-semaforo badge ' + semCls + '">' + sem + ' ' + semTxt + '</span><b class="small">' + pdfEsc(info.nombre) + '</b>' +
        (info.periodo ? '<span class="small text-secondary">' + pdfEsc(info.periodo) + '</span>' : '') + '</div>';
    if (info.necesitaMapeo) {
        var camposMapa = [['fecha', 'Fecha'], ['concepto', 'Concepto'], ['importe', 'Importe'], ['signo', 'Cr/Db o Tipo'], ['debe', 'Debe / Débito'], ['haber', 'Haber / Crédito'], ['refC', 'Ref. Corriente'], ['refO', 'Ref. Origen'], ['saldo', 'Saldo']];
        var cabs = info.necesitaMapeo.cabeceras || [];
        h += '<div class="small">No reconozco las columnas de esta tabla (faltan: ' + pdfEsc((info.necesitaMapeo.faltan || []).join(', ') || '—') + (info.necesitaMapeo.ambiguo && info.necesitaMapeo.ambiguo.length ? '; ambiguas: ' + pdfEsc(info.necesitaMapeo.ambiguo.join(', ')) : '') + '). Asígnalas una vez y la app lo recordará para las exportaciones iguales de este negocio:</div>';
        h += '<div class="row g-1 mt-1">' + camposMapa.map(function (par) {
            return '<div class="col-md-4"><label class="small mb-0">' + par[1] + '</label><select class="form-select form-select-sm pdf-mapa-sel" data-archivo="' + pdfEsc(info.nombre) + '" data-campo="' + par[0] + '"><option value="">— Sin asignar —</option>' + cabs.map(function (cab, ix) { return '<option value="' + ix + '">' + pdfEsc(cab || ('Columna ' + (ix + 1))) + '</option>'; }).join('') + '</select></div>';
        }).join('') + '</div>';
        var filasPrev = (info.filasCrudas || []).slice(1, 3).map(function (f) { return f.join(' · '); }).join(' / ');
        if (filasPrev) h += '<div class="small text-secondary mt-1">Primeras filas: ' + pdfEsc(filasPrev.slice(0, 220)) + '</div>';
        h += '<button type="button" class="btn btn-sm btn-primary mt-2" data-archivo="' + pdfEsc(info.nombre) + '" onclick="window.__pdfAplicarMapeo(this.getAttribute(\'data-archivo\'))">Aplicar mapeo</button>';
    } else if (esFormato) {
        h += '<div class="small text-danger">El archivo trae texto pero ninguna operación con el formato conocido (¿otro banco u otra versión de Banca Remota?). Al confirmar quedará retenido en la cuarentena de Contabilidad con este diagnóstico.</div>';
    } else if (!ops.length) {
        h += '<div class="small text-secondary">Sin texto legible (¿un PDF escaneado o una foto?): el lector no puede extraer operaciones de este archivo.</div>';
    } else {
        h += '<table class="table table-sm mb-1"><tbody>';
        if (info.cantidadDeclarada != null) h += '<tr><td class="small">Movimientos: declarados / extraídos</td><td class="text-end small"><b>' + info.cantidadDeclarada + ' / ' + ops.length + '</b>' + (invalidas.length ? ' (+' + invalidas.length + ' con fecha inválida)' : '') + '</td></tr>';
        h += '<tr><td class="small">Ingresos</td><td class="text-end small">' + v.sumas.ingN + ' · $' + fmtNum(v.sumas.ingSuma) + '</td></tr>';
        h += '<tr><td class="small">Gastos</td><td class="text-end small">' + v.sumas.gasN + ' · $' + fmtNum(v.sumas.gasSuma) + '</td></tr>';
        if (info.saldoInicial != null) h += '<tr><td class="small">Saldo inicial (del estado)</td><td class="text-end small">$' + fmtNum(info.saldoInicial) + '</td></tr>';
        if (info.saldoBancoFin != null) h += '<tr><td class="small">Saldo final según banco</td><td class="text-end small">$' + fmtNum(info.saldoBancoFin) + ' ' + (v.saldoFinFiable ? '<span class="text-success">✔ fiable</span>' : '<span class="text-warning">⚠ no fiable (el estado lo trae a 0.00)</span>') + '</td></tr>';
        h += '</tbody></table>';
        var reglas = [['T1', v.T1], ['T2', v.T2], ['T3', v.T3], ['T4', v.T4], ['T5', v.T5]];
        reglas.forEach(function (par) {
            var r = par[1];
            if (!r || r.estado === 'na') return;
            var icono = r.estado === 'ok' ? '<span class="text-success">✔</span>' : ((par[0] === 'T3' || par[0] === 'T4') ? '<span class="text-warning">⚠</span>' : '<span class="text-danger">✘</span>');
            h += '<div class="small">' + icono + ' <b>' + par[0] + '</b> · ' + pdfEsc(r.detalle || '') + '</div>';
        });
        if (invalidas.length) h += '<div class="small text-danger">✘ ' + invalidas.length + ' operación(es) con fecha inválida de calendario (' + invalidas.map(function (o) { return pdfEsc(o.fecha); }).join(', ') + '): rechazadas por el parser; al confirmar irán a cuarentena.</div>';
        if (info.origen === 'csv_banco') {
            var nSint = ops.filter(function (o) { return o.refSintetica; }).length;
            h += '<div class="small text-secondary">Tabla (CSV/Excel): sin cabecera de banco, los controles T1/T5 no aplican.' + (nSint ? ' ' + nSint + ' operación(es) sin referencias: se deduplican por contenido (clave sintética) y en la tabla puedes forzar una si es un pago repetido legítimo.' : '') + '</div>';
            if ((info.filasError || []).length) h += '<div class="small text-danger">⚠ ' + info.filasError.length + ' fila(s) no se pudieron leer y NO entran: ' + info.filasError.map(function (fe) { return 'fila ' + fe.fila + ': ' + pdfEsc(fe.motivo); }).join(' · ') + '</div>';
        }
        var desc = clavesDescartadasCuarentena();
        var nDesc = ops.filter(function (o) { return desc[o.refC + '|' + o.refO]; }).length;
        if (nDesc) h += '<div class="small text-secondary">Este estado ya pasó por la cuarentena y descartaste ' + nDesc + ' de sus operaciones: no se importan.</div>';
        if (v.bloqueado) h += '<div class="small text-danger fw-semibold">⛔ Ninguna operación de este estado se importa: al confirmar, el estado completo va a la «Cuarentena de importaciones» de Contabilidad.</div>';
        else if (v.avisoFuerte) h += '<div class="small fw-semibold" style="color:#92400e">⚠ Aviso fuerte: el estado importa, pero su registro quedará marcado «con diferencia» para que lo revises.</div>';
    }
    h += '</div>';
    return h;
}

function htmlPaneles(infos) {
    var h = (infos || []).map(function (info) { return panelArchivoHtml(info); }).join('');
    (ultimosErrores || []).forEach(function (er) {
        h += '<div class="pdf-panel-archivo pdf-panel-error border rounded p-2 mb-2 border-danger" data-archivo="' + pdfEsc(er.nombre) + '"><span class="badge bg-danger">✘ Error de lectura</span> <b class="small">' + pdfEsc(er.nombre) + '</b><div class="small text-danger">' + pdfEsc(er.mensaje || '') + ' — este archivo no se importó; el resto del lote continúa.</div></div>';
    });
    return h;
}

function conteoConfirmar() {
    var importables = ultimoLote.filter(function (f) { return f.estado === 'nueva' && f.destino && !f.fueraDeRango; }).length;
    var retenidas = ultimoLote.filter(function (f) { return f.fueraDeRango && f.estado === 'nueva'; }).length;
    var invalidas = 0, archivosCuar = 0;
    (ultimosInfos || []).forEach(function (info) {
        invalidas += (info.invalidas || []).length;
        var v = validacionesLote[info.nombre];
        if ((v && v.bloqueado) || (!info.ops.length && info.textoLen >= 500)) archivosCuar++;
    });
    return { importables: importables, retenidas: retenidas, invalidas: invalidas, archivosCuar: archivosCuar, accionCuarentena: (archivosCuar > 0 || retenidas > 0 || invalidas > 0) };
}
function textoBotonConfirmar() {
    var c = conteoConfirmar();
    if (c.importables) return '<i class="bi bi-download me-1"></i> Importar ' + c.importables + ' operaciones' + (c.accionCuarentena ? ' (y retener en cuarentena)' : '');
    if (c.accionCuarentena) return '<i class="bi bi-shield-lock me-1"></i> Retener en cuarentena';
    return '<i class="bi bi-bank me-1"></i> Guardar datos del banco';
}
function actualizarBotonConfirm() {
    var btn = document.getElementById('pdfImportConfirm');
    if (!btn) return;
    var c = conteoConfirmar();
    var hayCab = (ultimosInfos || []).some(function (r) { return r && r.cabecera && (r.cabecera.titular || r.cabecera.banco || r.cabecera.numeroCuenta || r.cabecera.numeroTarjeta); });
    btn.disabled = !(c.importables || hayCab || c.accionCuarentena);
    btn.innerHTML = textoBotonConfirmar();
}

/* ---------------- CSV / Excel (ronda -35, P5) ----------------
   La otra vía de entrada de estados: la exportación tabular de Banca
   Remota (o una hoja armada a mano). Produce el MISMO info+ops que el
   PDF y entra en la misma vista previa con los mismos controles.
   [SV] El formato exacto de la exportación real de BANDEC no consta:
   por eso el mapeo es por NOMBRE de cabecera (insensible a mayúsculas
   y acentos) y, si no alcanza, Leonardo asigna las columnas una vez y
   el mapeo se guarda por negocio (fiscal.importCfg). */
var XLSX_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
var XLSX_URL_LOCAL = 'vendor/xlsx.full.min.js';
var _xlsxPromesa = null;
function intentarCargaSheetJS(url) {
    return new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = url;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('No se pudo cargar el lector de hojas de cálculo.')); };
        document.head.appendChild(s);
    });
}
function cargarSheetJSImp() {
    if (window.XLSX) return Promise.resolve();
    if (_xlsxPromesa) return _xlsxPromesa;
    /* D7: primero la copia local (instalación sin conexión) y si no
       existe (versión en línea), el CDN de siempre */
    _xlsxPromesa = intentarCargaSheetJS(XLSX_URL_LOCAL)
        .catch(function () { return intentarCargaSheetJS(XLSX_URL); })
        .catch(function (e) { _xlsxPromesa = null; throw e; });
    return _xlsxPromesa;
}

/* Importe con miles y decimales en cualquier convención:
   «1,234.56», «1.234,56», «1234,56», «1 234.56», «$ 1,234.56»… */
function parseImporte(txt) {
    var t = String(txt == null ? '' : txt).replace(/[^0-9,.\-]/g, '').trim();
    if (!t || t === '-' || t === '.') return NaN;
    var neg = /^-/.test(t);
    t = t.replace(/-/g, '');
    var hayPunto = t.indexOf('.') >= 0, hayComa = t.indexOf(',') >= 0;
    if (hayPunto && hayComa) {
        if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
        else t = t.replace(/,/g, '');
    } else if (hayComa) {
        if (/,\d{1,2}$/.test(t) && t.indexOf(',') === t.lastIndexOf(',')) t = t.replace(',', '.');
        else t = t.replace(/,/g, '');
    }
    var v = parseFloat(t);
    return isNaN(v) ? NaN : (neg ? -v : v);
}

/* CSV con comillas y separador ; , o tabulador (se detecta solo) */
function dividirCsv(texto) {
    var t = String(texto || '').replace(/^﻿/, '');
    var primera = t.split(/\r?\n/)[0] || '';
    var sep = '\t';
    if (primera.split(';').length <= primera.split(',').length) sep = ',';
    if (primera.split(';').length > primera.split(',').length) sep = ';';
    var filas = [], fila = [], campo = '', enComillas = false;
    for (var i = 0; i < t.length; i++) {
        var ch = t[i];
        if (enComillas) {
            if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else enComillas = false; }
            else campo += ch;
        } else if (ch === '"') enComillas = true;
        else if (ch === sep) { fila.push(campo); campo = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && t[i + 1] === '\n') i++;
            fila.push(campo); campo = '';
            filas.push(fila); fila = [];
        } else campo += ch;
    }
    fila.push(campo); filas.push(fila);
    return filas.filter(function (f) { return f.some(function (c) { return String(c).trim() !== ''; }); });
}

function normalizarCabecera(s) {
    return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
var SINONIMOS_COL = {
    fecha: ['fecha', 'fecha contab', 'fecha contable', 'fecha operacion', 'fecha valor'],
    concepto: ['concepto', 'observaciones', 'descripcion', 'detalle', 'movimiento', 'observacion'],
    importe: ['importe', 'monto', 'valor', 'importe total'],
    signo: ['cr db', 'crdb', 'tipo', 'tipo de movimiento'],
    debe: ['debe', 'debito', 'cargo', 'cargos'],
    haber: ['haber', 'credito', 'abono', 'abonos'],
    refC: ['ref corriente', 'refcorriente', 'referencia', 'ref', 'referencia corriente', 'ref corriente '],
    refO: ['ref origen', 'referencia origen', 'ref origen '],
    saldo: ['saldo', 'saldo contable', 'saldo final']
};
function mapearColumnas(filas) {
    var cab = (filas && filas[0]) || [];
    var norm = cab.map(normalizarCabecera);
    var mapa = {}, ambiguo = [];
    Object.keys(SINONIMOS_COL).forEach(function (campo) {
        var hits = [];
        norm.forEach(function (n, ix) { if (SINONIMOS_COL[campo].indexOf(n) >= 0) hits.push(ix); });
        if (campo === 'refO') hits = hits.filter(function (ix) { return mapa.refC !== ix; });
        if (hits.length === 1) mapa[campo] = hits[0];
        else if (hits.length > 1) ambiguo.push(campo);
    });
    var faltan = [];
    if (mapa.fecha == null) faltan.push('fecha');
    if (mapa.concepto == null) faltan.push('concepto');
    if (mapa.importe == null && !(mapa.debe != null && mapa.haber != null)) faltan.push('importe');
    return { mapa: mapa, faltan: faltan, ambiguo: ambiguo, cabeceras: cab };
}
function firmaCabeceras(filas) {
    return ((filas && filas[0]) || []).map(normalizarCabecera).join('|');
}
function hashCorto(t) {
    var h = 5381;
    for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
    return ('0000000' + h.toString(16)).slice(-8);
}
function fechaDeTabla(txt) {
    var t = String(txt == null ? '' : txt).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/.exec(t);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/.exec(t);
    if (m) return '20' + m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return '';
}

/* filas crudas (arrays de celdas) → info+ops. mapaManual: {campo: idx}
   cuando el mapeo por nombre no alcanzó (o el guardado por negocio). */
function infoDesdeFilas(nombre, filas, mapaManual) {
    filas = (filas || []).map(function (f) { return (f || []).map(function (c) { return c == null ? '' : String(c); }); });
    var det = mapearColumnas(filas);
    var mapa = det.mapa;
    if (mapaManual) { mapa = Object.assign({}, det.mapa, mapaManual); det.faltan = []; det.ambiguo = []; }
    var info = { nombre: nombre, cuenta: '', periodo: '', desde: '', hasta: '', saldoBancoFin: null, saldoFinFuente: null, saldoInicial: null, cantidadDeclarada: null, invalidas: [], filasError: [], ops: [], textoLen: filas.map(function (f) { return f.join(' ').length; }).reduce(function (a, b) { return a + b; }, 0), cabecera: { titular: '', sucursal: '', numeroCuenta: '', numeroTarjeta: '', banco: '' }, origen: 'csv_banco', esTabla: true, filasCrudas: filas };
    if (det.faltan.length || det.ambiguo.length) { info.necesitaMapeo = { faltan: det.faltan, ambiguo: det.ambiguo, cabeceras: det.cabeceras }; return info; }
    var cel = function (fila, campo) { var ix = mapa[campo]; return ix == null ? '' : String(fila[ix] == null ? '' : fila[ix]).trim(); };
    for (var r = 1; r < filas.length; r++) {
        var fila = filas[r], nro = r + 1;
        var fecha = fechaDeTabla(cel(fila, 'fecha'));
        if (!fecha || !fechaCalendarioOk(fecha)) { info.filasError.push({ fila: nro, motivo: 'fecha no válida: «' + cel(fila, 'fecha') + '»' }); continue; }
        var concepto = cel(fila, 'concepto');
        if (!concepto) { info.filasError.push({ fila: nro, motivo: 'sin concepto' }); continue; }
        var monto = NaN, tipo = null;
        if (mapa.importe != null) {
            monto = parseImporte(cel(fila, 'importe'));
            var sg = cel(fila, 'signo').toLowerCase();
            if (/^(db|d|deb|debito|cargo|gasto|egreso)/.test(sg)) tipo = 'gasto';
            else if (/^(cr|c|cred|credito|abono|ingreso)/.test(sg)) tipo = 'ingreso';
            else if (monto < 0) tipo = 'gasto';
            else tipo = 'ingreso';
        } else {
            var db = parseImporte(cel(fila, 'debe')), hb = parseImporte(cel(fila, 'haber'));
            if (!isNaN(db) && db !== 0 && (isNaN(hb) || hb === 0)) { monto = Math.abs(db); tipo = 'gasto'; }
            else if (!isNaN(hb) && hb !== 0 && (isNaN(db) || db === 0)) { monto = Math.abs(hb); tipo = 'ingreso'; }
        }
        if (isNaN(monto)) { info.filasError.push({ fila: nro, motivo: 'importe no numérico: «' + cel(fila, 'importe') + cel(fila, 'debe') + cel(fila, 'haber') + '»' }); continue; }
        var op = { fecha: fecha, refC: cel(fila, 'refC'), refO: cel(fila, 'refO'), concepto: limpiarConcepto(concepto), monto: Math.round(Math.abs(monto) * 100) / 100, tipo: tipo || 'ingreso', saldo: null };
        var sTxt = cel(fila, 'saldo');
        if (sTxt) { var sv = parseImporte(sTxt); if (!isNaN(sv)) { op.saldo = sv; info.saldoBancoFin = sv; info.saldoFinFuente = 'corrido'; } }
        if (!op.refC && !op.refO) {
            op.refSintetica = 'H' + hashCorto(op.fecha + '|' + op.monto.toFixed(2) + '|' + normalizarCabecera(op.concepto));
        }
        info.ops.push(op);
    }
    /* Clave sintética: un mismo estado puede traer dos operaciones
       IDÉNTICAS en contenido (misma fecha, importe y concepto — dos
       transferencias iguales el mismo día) que sin referencias solo
       se distinguen por su orden en el archivo. La 2ª, 3ª… copia de
       una misma clave lleva sufijo «#n» por ocurrencia: la clave es
       estable al reimportar el MISMO archivo (dedupe intacta) y
       ninguna operación real se pierde por parecerse a otra. */
    var ocurrencias = {};
    info.ops.forEach(function (op) {
        if (!op.refSintetica) return;
        ocurrencias[op.refSintetica] = (ocurrencias[op.refSintetica] || 0) + 1;
        if (ocurrencias[op.refSintetica] > 1) op.refSintetica = op.refSintetica + '#' + ocurrencias[op.refSintetica];
    });
    return info;
}
function infoDesdeCsv(nombre, texto) {
    return infoDesdeFilas(nombre, dividirCsv(texto), null);
}

/* Si el mapeo por nombre no alcanzó pero este negocio ya asignó las
   columnas de una exportación con las mismas cabeceras, se aplica el
   mapeo recordado sin volver a preguntar. */
function aplicarMapaRecordado(info) {
    if (!info || !info.necesitaMapeo || !info.filasCrudas) return info;
    try {
        var api = API();
        if (!api || !api.importCfg) return info;
        var cfg = api.importCfg() || {};
        var mapa = (cfg.csvMap || {})[firmaCabeceras(info.filasCrudas)];
        if (!mapa) return info;
        var nuevo = infoDesdeFilas(info.nombre, info.filasCrudas, mapa);
        if (!nuevo.necesitaMapeo) nuevo.mapaRecordado = true;
        return nuevo.necesitaMapeo ? info : nuevo;
    } catch (e) { return info; }
}

/* Clave de deduplicación de una operación: referencias del banco o,
   sin ellas (CSV), la clave sintética por contenido. */
function claveOpDe(op) {
    if (op.refC && op.refO) return op.refC + '|' + op.refO;
    if (op.refSintetica) return 'S:' + op.refSintetica;
    return (op.refC || '') + '|' + (op.refO || '');
}

/* Forzar la importación de una fila sintética marcada duplicada
   (puede ser un pago repetido legítimo: mismo día, importe y concepto) */
window.__pdfForzarFila = function (idx, val) {
    var f = ultimoLote[idx];
    if (!f) return;
    if (val && f.estado === 'duplicada' && f.op.refSintetica) {
        f.estado = 'nueva'; f.forzada = true; f.destino = destinoDe(f.op);
        if (!f.op._clasif) { try { f.op._clasif = clasificarOperacion(f.op); } catch (e) { f.op._clasif = null; } }
    } else if (!val && f.forzada) {
        f.estado = 'duplicada'; f.forzada = false;
    }
    actualizarBotonConfirm();
};

/* Aplicar el mapeo manual de columnas de un archivo de tabla: se
   reconstruye su info, el mapeo se guarda por negocio (para que la
   próxima exportación igual no pregunte) y la vista previa se rehace. */
window.__pdfAplicarMapeo = function (nombre) {
    var info = (ultimosInfos || []).filter(function (i) { return i.nombre === nombre; })[0];
    if (!info || !info.filasCrudas) return;
    var mapa = {};
    document.querySelectorAll('.pdf-mapa-sel[data-archivo="' + nombre + '"]').forEach(function (sel) {
        if (sel.value !== '') mapa[sel.getAttribute('data-campo')] = parseInt(sel.value, 10);
    });
    var nuevo = infoDesdeFilas(nombre, info.filasCrudas, mapa);
    if (nuevo.necesitaMapeo) { alert('Todavía faltan columnas obligatorias (fecha, concepto e importe). Revisa la asignación.'); return; }
    try {
        var api = API();
        if (api && api.saveImportCfg && api.importCfg) {
            var cfg = api.importCfg() || {};
            cfg.csvMap = cfg.csvMap || {};
            cfg.csvMap[firmaCabeceras(info.filasCrudas)] = mapa;
            api.saveImportCfg(cfg);
        }
    } catch (e) {}
    var ix = ultimosInfos.indexOf(info);
    if (ix >= 0) ultimosInfos[ix] = nuevo;
    var ops = [];
    ultimosInfos.forEach(function (inf) { (inf.ops || []).forEach(function (op) { if (!op.archivo) op.archivo = inf.nombre; ops.push(op); }); });
    if (ultimoModalPdf) { try { ultimoModalPdf.hide(); } catch (e) {} }
    setTimeout(function () { mostrarVistaPrevia(ops, ultimosInfos); }, 60);
};

/* ---------------- Deduplicación ---------------- */
function clavesExistentes() {
    var api = API(), set = {};
    function add(m) {
        if (m && m.refCorriente && m.refOrigen) set[m.refCorriente + '|' + m.refOrigen] = true;
        if (m && m.refSintetica) set['S:' + m.refSintetica] = true;
    }
    api.movs().forEach(add);
    api.getHistorial().forEach(function (h) { (h.movimientos || []).forEach(add); });
    return set;
}

/* ---------------- Interfaz: botones + selector de archivo ---------------- */
var archivoInput = null;
var cuentaPreseleccionada = 'chequera';

function abrirSelectorPdf(cuenta) {
    try {
        if (!API().puedeEditar()) { alert('No tienes permiso de edición.'); return; }
    } catch (e) { alert(e.message); return; }
    cuentaPreseleccionada = cuenta || 'chequera';
    if (!archivoInput) {
        archivoInput = document.createElement('input');
        archivoInput.type = 'file';
        archivoInput.accept = '.pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
var ultimosInfos = [];
var ultimosErrores = [];
var ultimoModalPdf = null;

async function procesarArchivos(e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    var btn = document.querySelector('.btn-pdf-import');
    var txtOriginal = btn ? btn.innerHTML : '';
    function estadoBtn(t) { if (btn) { btn.disabled = true; btn.innerHTML = t; } }
    function restaurarBtn() { if (btn) { btn.disabled = false; btn.innerHTML = txtOriginal; } }
    /* El lector de PDF solo se carga si el lote trae PDFs (un CSV no
       debe pagar esa espera ni depender de esa conexión). */
    var hayPdf = files.some(function (f) { return /\.pdf$/i.test(f.name || ''); });
    if (hayPdf) {
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
    }
    var todos = [], infos = [], textoTotal = 0, erroresArchivos = [];
    /* D6 (ronda -35): cada archivo se lee en SU propio try — un archivo
       corrupto o de otro banco ya no tumba el lote entero; su error se
       nombra en la vista previa y el resto continúa. */
    for (var i = 0; i < files.length; i++) {
        estadoBtn('<i class="bi bi-hourglass-split"></i> Leyendo ' + (i + 1) + '/' + files.length + '…');
        try {
            var nombreF = files[i].name || ('archivo-' + (i + 1));
            var r;
            if (/\.pdf$/i.test(nombreF)) {
                var buf = await files[i].arrayBuffer();
                r = await parsearPdf(buf, nombreF, function (n, total) {
                    estadoBtn('<i class="bi bi-hourglass-split"></i> Pág. ' + n + '/' + total + '…');
                });
            } else if (/\.csv$/i.test(nombreF) || /text\/csv/.test(files[i].type || '')) {
                r = infoDesdeCsv(nombreF, await files[i].text());
                r = aplicarMapaRecordado(r);
            } else if (/\.xlsx?$/i.test(nombreF)) {
                await cargarSheetJSImp();
                var libro = window.XLSX.read(await files[i].arrayBuffer(), { type: 'array' });
                var hoja = libro.Sheets[libro.SheetNames[0]];
                var filasX = window.XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' });
                r = infoDesdeFilas(nombreF, filasX, null);
                r = aplicarMapaRecordado(r);
            } else {
                throw new Error('formato no admitido (usa PDF, CSV o Excel)');
            }
            r.ops.forEach(function (op) { op.archivo = nombreF; });
            todos = todos.concat(r.ops);   /* orden: archivos elegidos, páginas y filas en orden */
            textoTotal += r.textoLen;
            infos.push(r);
        } catch (err) {
            console.error('Error parseando ' + files[i].name + ':', err);
            erroresArchivos.push({ nombre: files[i].name, mensaje: (err && err.message) ? err.message : String(err) });
        }
    }
    ultimosErrores = erroresArchivos;
    restaurarBtn();
    /* Sin operaciones pero con texto: el archivo es de un formato no
       reconocido — se abre la vista previa igual, para que el panel lo
       diga y al confirmar quede retenido en cuarentena (ronda -35). */
    if (!todos.length && !infos.some(function (i) { return i.textoLen >= 500; })) {
        if (erroresArchivos.length && !infos.length) {
            alert('No se pudo leer ningún archivo:\n' + erroresArchivos.map(function (x) { return '· ' + x.nombre + ': ' + x.mensaje; }).join('\n'));
        } else if (textoTotal < 500) {
            alert('No se encontró texto en el PDF. Si es un documento escaneado (foto), el lector no puede leerlo.');
        } else {
            alert('No se encontraron operaciones con el formato reconocido (estados de cuenta BANDEC).');
        }
        return;
    }
    try {
        mostrarVistaPrevia(todos, infos);
    } catch (err) {
        console.error('Error mostrando vista previa:', err);
        alert('Se leyeron ' + todos.length + ' operaciones pero falló la vista previa: ' + (err && err.message ? err.message : err));
    }
}

/* ---------------- Vista previa ---------------- */
function estadoFila(op, existentes, vistos) {
    var k = claveOpDe(op);
    if (existentes[k] || vistos[k]) return 'duplicada';
    vistos[k] = true;
    return 'nueva';
}

function destinoDe(op) {
    var api = API();
    var mesOp = mesDeFecha(op.fecha);
    if (api.enEdicion()) {
        return mesOp === api.mesEdicion() ? mesOp + ' (en edición)' : null;
    }
    if (api.mesEstaBloqueado(mesOp) && !api.isAdmin()) return null;
    return mesOp;
}

function mostrarVistaPrevia(ops, infos) {
    ultimosInfos = infos || [];
    var existentes = clavesExistentes();
    var vistos = {};
    var filas = ops.map(function (op) {
        return { op: op, estado: estadoFila(op, existentes, vistos), destino: destinoDe(op) };
    });
    ultimoLote = filas;

    /* Control de totales (ronda -35): la validación por archivo va
       ANTES de clasificar. Un estado bloqueado (T1/T2/T5) no deja pasar
       ni una operación suya; las fuera de rango (T4) quedan retenidas
       salvo confirmación expresa por fila; las operaciones de un estado
       ya importado que faltan entre los movimientos se marcan
       «resucitadas» (D10) y las ya descartadas en cuarentena no entran. */
    var valMap = validarLote(ultimosInfos, cuentaPreseleccionada);
    var clavesEst = clavesEstadosRegistrados();
    var clavesDesc0 = clavesDescartadasCuarentena();
    filas.forEach(function (f) {
        var v = valMap[f.op.archivo];
        /* La marca de descartada es por operación y manda sobre el
           bloqueo del archivo: es la decisión que Leonardo ya tomó. */
        if (f.estado === 'nueva' && clavesDesc0[f.op.refC + '|' + f.op.refO]) { f.descartadaCuarentena = true; f.estado = 'descartada'; }
        if (v && v.bloqueado) { f.bloqueado = true; if (f.estado === 'nueva') f.estado = 'bloqueada'; }
        if (f.op._fueraDeRango) f.fueraDeRango = true;
        if (f.estado === 'nueva' && clavesEst[f.op.refC + '|' + f.op.refO]) f.resucitada = true;
    });

    /* Clasificación automática de las filas importables (reglas 1-3) */
    filas.forEach(function (f) {
        if (f.estado === 'nueva' && f.destino) {
            try { f.op._clasif = clasificarOperacion(f.op); } catch (e) { f.op._clasif = null; }
        }
    });
    /* Contabilidad (ronda 3): con la contabilidad activa, cada fila nueva se
       evalúa contra las reglas del negocio: lo claro se contabilizará solo al
       importar; lo dudoso va EN ROJO y espera clasificación en la bandeja. */
    var evalConta = null;
    try {
        if (window.__contaEvalImport) {
            var itemsEval = filas.map(function (f) {
                if (!(f.estado === 'nueva' && f.destino)) return null;
                var cl = f.op._clasif || {};
                return { concepto: f.op.concepto, tipo: f.op.tipo, cuenta: (typeof cuentaPreseleccionada !== 'undefined' ? cuentaPreseleccionada : 'chequera'), fecha: f.op.fecha, monto: f.op.monto,
                    clasificacion: cl.claseMov || (cl.clase === 'transferencia' ? 'transferencia' : 'operacional'), clase: cl.clase || 'normal', sospechaOnat: !!cl.sospechaOnat,
                    refCorriente: f.op.refC || '', refOrigen: f.op.refO || '' };
            });
            var rEval = window.__contaEvalImport(itemsEval);
            if (Array.isArray(rEval)) evalConta = rEval;
        }
    } catch (e) { evalConta = null; }
    var nContaClaros = 0, nContaRojos = 0;
    if (evalConta) evalConta.forEach(function (r) { if (!r) return; if (r.claro) nContaClaros++; else nContaRojos++; });
    /* Cruce salario↔nómina (ronda 5): aviso AMARILLO junto a cada fila
       «Salario» cuya suma del mes no coincida con el neto de la nómina
       (o sin nómina ese mes). No bloquea la importación. */
    var evalSalario = null;
    try {
        if (window.__salarioEvalImport) {
            var itemsSal = filas.map(function (f) {
                if (!(f.estado === 'nueva' && f.destino)) return null;
                var cl = f.op._clasif || {};
                return { concepto: f.op.concepto, tipo: f.op.tipo, cuenta: (typeof cuentaPreseleccionada !== 'undefined' ? cuentaPreseleccionada : 'chequera'), fecha: f.op.fecha, monto: f.op.monto,
                    clasificacion: cl.claseMov || (cl.clase === 'transferencia' ? 'transferencia' : 'operacional') };
            });
            var rSal = window.__salarioEvalImport(itemsSal);
            if (Array.isArray(rSal)) evalSalario = rSal;
        }
    } catch (e) { evalSalario = null; }
    function esNueva(f) { return f.estado === 'nueva' && f.destino && f.op._clasif; }
    var nTransf = filas.filter(function (f) { return esNueva(f) && f.op._clasif.clase === 'transferencia'; }).length;
    var nConting = filas.filter(function (f) { return esNueva(f) && f.op._clasif.claseMov === 'contingencia'; }).length;
    var nUtilSoc = filas.filter(function (f) { return esNueva(f) && f.op._clasif.claseMov === 'utilidades'; }).length;
    var nSalario = filas.filter(function (f) { return esNueva(f) && f.op._clasif.claseMov === 'salario'; }).length;
    var nOnat = filas.filter(function (f) { return esNueva(f) && f.op._clasif.clase === 'onat'; }).length;
    var nQR = filas.filter(function (f) { return esNueva(f) && f.op._clasif.qr; }).length;
    var nVentasCorreo = filas.filter(function (f) { return esNueva(f) && f.op._clasif.ventaCorreo; }).length;
    var nSospecha = filas.filter(function (f) { return esNueva(f) && f.op._clasif.sospechaOnat && f.op._clasif.clase !== 'onat'; }).length;

    var nuevas = filas.filter(function (f) { return f.estado === 'nueva' && f.destino; }).length;
    var dups = filas.filter(function (f) { return f.estado === 'duplicada'; }).length;
    var omitidas = filas.length - nuevas - dups;
    /* Ronda -35: contadores del control de totales */
    var nBloqueadas = filas.filter(function (f) { return f.estado === 'bloqueada'; }).length;
    var nRetenidas = filas.filter(function (f) { return f.fueraDeRango && f.estado === 'nueva'; }).length;
    var nResucitadas = filas.filter(function (f) { return f.resucitada; }).length;
    var panelesHtml = htmlPaneles(ultimosInfos);

    var cuentasDetectadas = infos.map(function (r) {
        return pdfEsc(r.nombre) + (r.cuenta ? ' → cuenta …' + pdfEsc(r.cuenta.slice(-4)) : '') +
               (r.periodo ? ' (' + pdfEsc(r.periodo) + ')' : '');
    }).join('<br>');
    /* ¿El lote trae datos bancarios en algún encabezado? Si no hay
       operaciones nuevas pero sí cabecera, el botón de confirmar queda
       habilitado como «Guardar datos del banco»: reimportar un estado
       ya importado (todo duplicado) también debe guardarlos. */
    var hayCabeceras = (infos || []).some(function (r) {
        return r && r.cabecera && (r.cabecera.titular || r.cabecera.banco || r.cabecera.numeroCuenta || r.cabecera.numeroTarjeta);
    });

    var nombresCuenta = { chequera: 'Chequera', tarjeta_cup: 'Tarjeta CUP', tarjeta_usd: 'Tarjeta USD' };
    var filasCompactas = [];
    var filasHtmlArr = filas.map(function (f, idxFila) {
        var op = f.op;
        var badge = op.tipo === 'ingreso'
            ? '<span class="badge bg-success">Ingreso</span>'
            : '<span class="badge bg-danger">Gasto</span>';
        var est = f.estado === 'bloqueada'
            ? '<span class="badge bg-danger">Bloqueada</span>'
            : f.estado === 'descartada'
            ? '<span class="badge bg-dark">Descartada en cuarentena</span>'
            : f.estado === 'duplicada'
            ? '<span class="badge bg-secondary">Duplicada</span>'
            : (f.destino ? '<span class="badge bg-primary">Nueva</span>'
                         : '<span class="badge bg-warning text-dark">Se omite</span>');
        var concepto = pdfEsc(op.concepto);
        var corto = concepto.length > 90 ? concepto.slice(0, 90) + '…' : concepto;
        var ctrl = '';
        if (f.estado === 'nueva' && f.destino && op._clasif) {
            var c = op._clasif;
            var selVal = c.claseMov || c.clase;
            var evS = evalSalario ? evalSalario[idxFila] : null;
            var notaMov = '';
            if (c.claseMov === 'contingencia') notaMov = '<div class="small text-secondary">🛡️ Contingencia: sale del Fondo de contingencia — NO es un gasto y descuenta el fondo una sola vez.</div>';
            else if (c.claseMov === 'utilidades') notaMov = '<div class="small text-secondary">👥 Utilidades a socios: distribución de utilidades — NO es un gasto ni deducible.</div>';
            else if (c.claseMov === 'salario') {
                if (evS && evS.amarillo) notaMov = '<div class="small fw-semibold" style="color:#92400e">⚠ No coincide con la nómina: ' + pdfEsc(evS.motivo || '') + ' (aviso, no bloquea).</div>';
                else if (evS) notaMov = '<div class="small text-success">✓ Salario: coincide con la nómina del mes.</div>';
                else notaMov = '<div class="small text-secondary">👷 Salario: se cruzará con la nómina del mes al importar.</div>';
            }
            else if (c.ventaCorreo) notaMov = '<div class="small text-secondary">💰 Venta por correo electrónico: se contabilizará en la 801-000 Ingresos por Venta de Mercancías y Productos.</div>';
            ctrl = '<div class="d-flex flex-wrap gap-1 align-items-center mt-1">' +
                '<select class="form-select form-select-sm" style="width:auto" title="Clasificación del movimiento" onchange="window.__pdfSetClase(' + idxFila + ',this.value)">' +
                '<option value="normal"' + (selVal === 'normal' ? ' selected' : '') + '>Normal</option>' +
                '<option value="transferencia"' + (selVal === 'transferencia' ? ' selected' : '') + '>Transferencia entre cuentas</option>' +
                '<option value="onat"' + (selVal === 'onat' ? ' selected' : '') + (c.onat ? '' : ' disabled') + '>Pago de ONAT</option>' +
                '<option value="contingencia"' + (selVal === 'contingencia' ? ' selected' : '') + '>Contingencia (no es gasto)</option>' +
                '<option value="utilidades"' + (selVal === 'utilidades' ? ' selected' : '') + '>Utilidades a socios (no es gasto)</option>' +
                '<option value="salario"' + (selVal === 'salario' ? ' selected' : '') + '>Salario</option>' +
                '</select>' +
                '<label class="form-check form-check-inline m-0 small"><input type="checkbox" class="form-check-input" onchange="window.__pdfSetQr(' + idxFila + ',this.checked)"' + (c.qr ? ' checked' : '') + '> QR</label></div>' +
                (c.onat ? '<div class="small">ONAT: <b>' + pdfEsc(c.onat.codigo) + '</b> ' + pdfEsc(c.onat.nombre) + (c.onat.periodo ? ' · ' + pdfEsc(c.onat.periodo) : '') + '</div>' : '') +
                (c.sospechaOnat && c.clase !== 'onat' ? '<div class="small text-warning">⚠ Parece un pago de impuestos, pero el concepto no trae un código reconocido: no se clasificó solo.</div>' : '') +
                notaMov;
        }
        var evF = evalConta ? evalConta[idxFila] : null;
        filasCompactas.push('<tr><td class="text-nowrap">' + pdfEsc(fechaCorta(op.fecha)) + '</td><td title="' + concepto + '">' + corto + '</td><td class="text-end text-nowrap">$' + Number(op.monto).toFixed(2) + '</td><td class="small">' + (evF ? (evF.claro ? '<span class="text-success">✓ Automática: ' + pdfEsc(evF.via || 'regla clara') + '</span>' : '<span class="text-danger">● Pendiente de clasificar</span>') : (f.estado === 'bloqueada' ? 'Bloqueada: va a cuarentena' : f.estado === 'descartada' ? 'Descartada en cuarentena' : f.estado === 'duplicada' ? 'Duplicada (se omite)' : (f.destino ? 'Nueva' : 'Se omite'))) + '</td></tr>');
        var evSalF = evalSalario ? evalSalario[idxFila] : null;
        var rojoHtml = (evF && !evF.claro) ? '<div class="small text-danger fw-semibold">● En rojo: no se contabilizará hasta clasificarlo. ' + pdfEsc(evF.motivo || '') + ' Quedará en la bandeja «Por clasificar» de la pestaña Contabilidad.</div>' : '';
        var claroHtml = (evF && evF.claro) ? '<div class="small text-success">✓ Se contabilizará automáticamente (' + pdfEsc(evF.via || 'regla clara') + ').</div>' : '';
        /* Ronda -35: notas del control de totales por fila */
        var notaTot = '';
        if (f.estado === 'bloqueada') notaTot = '<div class="small text-danger fw-semibold">⛔ Su estado no pasó el control de totales (mira el panel del archivo arriba): esta operación NO se importa; al confirmar, el estado completo irá a la «Cuarentena de importaciones» de Contabilidad.</div>';
        else if (f.estado === 'descartada') notaTot = '<div class="small text-secondary">Ya pasó por la cuarentena y la descartaste: no se importa.</div>';
        else if (f.fueraDeRango && f.estado === 'nueva') notaTot = '<div class="small fw-semibold" style="color:#92400e">⚠ Fuera del rango de fechas del estado: queda retenida y NO se importa salvo que la confirmes: <label class="form-check form-check-inline m-0"><input type="checkbox" class="form-check-input pdf-fuera-check" onchange="window.__pdfSetFuera(' + idxFila + ',this.checked)"> Importar igualmente</label></div>';
        else if (f.resucitada) notaTot = '<div class="small fw-semibold" style="color:#92400e">↩ Resucitada: estaba en un estado ya importado pero no está en tus movimientos (¿la borraste a mano?). Si confirmas, vuelve a importarse.</div>';
        if (f.estado === 'duplicada' && op.refSintetica) notaTot += '<div class="small">Sin referencias del banco: parece duplicada <b>por contenido</b> (misma fecha, importe y concepto). Si es un pago repetido legítimo: <label class="form-check form-check-inline m-0"><input type="checkbox" class="form-check-input pdf-forzar-check" onchange="window.__pdfForzarFila(' + idxFila + ',this.checked)"> Forzar importación</label></div>';
        return '<tr' + ((evF && !evF.claro) ? ' style="background:#fdeaea"' : (evSalF && evSalF.amarillo ? ' style="background:#fff8e1"' : '')) + '>' +
            '<td class="text-nowrap">' + pdfEsc(fechaCorta(op.fecha)) + '</td>' +
            '<td title="' + concepto + '">' + corto + ctrl + rojoHtml + claroHtml + notaTot + '</td>' +
            '<td class="text-end text-nowrap">$' + Number(op.monto).toFixed(2) + '</td>' +
            '<td>' + badge + '</td>' +
            '<td class="text-nowrap small">' + (f.destino ? pdfEsc(f.destino) : '—') + '</td>' +
            '<td>' + est + '</td></tr>';
    });

    /* Presentación pedida por Leonardo (2026-10-25): en la tabla
       principal quedan SOLO las filas que necesitan su clasificación
       (las rojas); las que el motor ya resolvió — y las duplicadas u
       omitidas, que tampoco piden acción — van colapsadas en un
       «detalles» encima, como resumen. Si la contabilidad no evalúa
       (inactiva) o no hay rojas, la vista es la de siempre. */
    var idxAccionables = filas.map(function (f, i) {
        var ev = evalConta ? evalConta[i] : null;
        return (f.estado === 'nueva' && f.destino && ev && !ev.claro) ? i : -1;
    }).filter(function (i) { return i >= 0; });
    var filasHtml, autoHtml = '';
    if (evalConta && idxAccionables.length && idxAccionables.length < filas.length) {
        var setAcc = {};
        idxAccionables.forEach(function (i) { setAcc[i] = true; });
        filasHtml = filasHtmlArr.filter(function (_, i) { return setAcc[i]; }).join('');
        autoHtml = '<details class="mb-3"><summary class="small fw-semibold text-success">✓ ' + (filas.length - idxAccionables.length) + ' operación(es) ya resueltas por el motor o sin acción (duplicadas/omitidas) — tocar para ver</summary>' +
            '<div class="table-responsive mt-2"><table class="table table-sm align-middle mb-0"><thead><tr><th>Fecha</th><th>Concepto</th><th class="text-end">Monto</th><th>Resultado</th></tr></thead><tbody>' +
            filasCompactas.filter(function (_, i) { return !setAcc[i]; }).join('') +
            '</tbody></table></div></details>' +
            '<div class="small fw-semibold text-danger mb-1">● ' + idxAccionables.length + ' necesitan tu clasificación — son las únicas que esperan por ti:</div>';
    } else {
        filasHtml = filasHtmlArr.join('');
    }

    var html =
    '<div class="modal fade" id="pdfImportModal" tabindex="-1">' +
      '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">' +
        '<div class="modal-content">' +
          '<div class="modal-header"><h5 class="modal-title"><i class="bi bi-file-earmark-pdf me-2"></i>Importar estado de cuenta</h5>' +
          '<button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>' +
          '<div class="modal-body">' +
            '<div class="small text-secondary mb-2">' + cuentasDetectadas + '</div>' +
            '<div id="pdfImportPaneles">' + panelesHtml + '</div>' +
            '<div class="d-flex flex-wrap align-items-center gap-2 mb-3">' +
              '<span class="badge bg-primary">' + nuevas + ' nuevas</span>' +
              '<span class="badge bg-secondary">' + dups + ' duplicadas (se omiten)</span>' +
              (omitidas ? '<span class="badge bg-warning text-dark">' + omitidas + ' omitidas</span>' : '') +
              (nBloqueadas ? '<span class="badge bg-danger">' + nBloqueadas + ' bloqueadas (a cuarentena)</span>' : '') +
              (nRetenidas ? '<span class="badge bg-warning text-dark">' + nRetenidas + ' fuera de rango (retenidas)</span>' : '') +
              (nResucitadas ? '<span class="badge bg-warning text-dark">↩ ' + nResucitadas + ' resucitadas</span>' : '') +
              (nTransf ? '<span class="badge bg-info text-dark">' + nTransf + ' transferencias</span>' : '') +
              (nConting ? '<span class="badge bg-secondary">' + nConting + ' contingencia (no es gasto)</span>' : '') +
              (nUtilSoc ? '<span class="badge bg-secondary">' + nUtilSoc + ' utilidades a socios (no es gasto)</span>' : '') +
              (nSalario ? '<span class="badge bg-secondary">' + nSalario + ' salario</span>' : '') +
              (nOnat ? '<span class="badge bg-dark">' + nOnat + ' pagos ONAT</span>' : '') +
              (nQR ? '<span class="badge bg-info">' + nQR + ' con QR</span>' : '') +
              (nVentasCorreo ? '<span class="badge bg-success">' + nVentasCorreo + ' ventas a 801-000</span>' : '') +
              (nSospecha ? '<span class="badge bg-warning text-dark">⚠ ' + nSospecha + ' posible ONAT sin código</span>' : '') +
              (evalConta ? '<span class="badge bg-success">✓ ' + nContaClaros + ' se contabilizarán automáticamente</span>' : '') +
              (evalConta && nContaRojos ? '<span class="badge bg-danger">● ' + nContaRojos + ' en rojo: esperan clasificación</span>' : '') +
              '<span class="ms-auto d-flex align-items-center gap-2"><label class="small mb-0">Importar a:</label>' +
              '<select id="pdfImportCuenta" class="form-select form-select-sm" style="width:auto">' +
                Object.keys(nombresCuenta).map(function (k) {
                    return '<option value="' + k + '"' + (k === cuentaPreseleccionada ? ' selected' : '') + '>' + nombresCuenta[k] + '</option>';
                }).join('') +
              '</select></span>' +
            '</div>' +
            autoHtml +
            '<div class="table-responsive"><table class="table table-sm table-hover align-middle">' +
            '<thead><tr><th>Fecha</th><th>Concepto</th><th class="text-end">Monto</th><th>Tipo</th><th>Mes destino</th><th>Estado</th></tr></thead>' +
            '<tbody>' + filasHtml + '</tbody></table></div>' +
            '<div class="small text-secondary mt-2">Las duplicadas se detectan por Ref_Corriente + Ref_Origen y no se importan. El orden de las operaciones se conserva. Con la contabilidad activa, al importar se dispara la cadena sola: clasificación → plantilla de contrapartida → asiento. Lo claro se contabiliza automáticamente; lo que aparece en rojo NO genera asiento ni cuenta como contabilizado: queda en la bandeja «Por clasificar / Pendientes de contabilizar» de la pestaña Contabilidad hasta que lo clasifiques (y puedes guardar la decisión como regla para que el mes próximo ya no salga en rojo). La clasificación (transferencia / comercio electrónico QR / pago ONAT por código del tributo) se detecta sola y puedes corregirla por fila antes de importar: las transferencias no cuentan como ingreso ni gasto pero sí mueven el saldo; los pagos ONAT se vinculan al Vector Fiscal y alimentan la Declaración Jurada.</div>' +
          '</div>' +
          '<div class="modal-footer">' +
            '<button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>' +
            '<button type="button" class="btn btn-primary" id="pdfImportConfirm" ' + ((conteoConfirmar().importables || hayCabeceras || conteoConfirmar().accionCuarentena) ? '' : 'disabled') + '>' +
            textoBotonConfirmar() + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>';

    var viejo = document.getElementById('pdfImportModal');
    if (viejo) viejo.remove();
    document.body.insertAdjacentHTML('beforeend', html);
    var modal = new bootstrap.Modal(document.getElementById('pdfImportModal'));
    ultimoModalPdf = modal;
    document.getElementById('pdfImportConfirm').addEventListener('click', function () {
        var cuenta = document.getElementById('pdfImportCuenta').value;
        /* T4: las fuera de rango NO confirmadas quedan retenidas (no
           entran como movimientos; al importar irán a cuarentena) */
        ultimoLote.forEach(function (f) {
            if (f.fueraDeRango && f.estado === 'nueva' && !f.confirmadaFuera) f.estado = 'retenida';
        });
        modal.hide();
        importarLote(cuenta);
    });
    /* Cambiar la cuenta destino revalida el lote en el sitio (la T5
       depende de ella): paneles y bloqueos se refrescan sin reabrir. */
    var selCuentaEl = document.getElementById('pdfImportCuenta');
    if (selCuentaEl) selCuentaEl.addEventListener('change', function () {
        cuentaPreseleccionada = selCuentaEl.value;
        var map2 = validarLote(ultimosInfos, cuentaPreseleccionada);
        ultimoLote.forEach(function (f) {
            var v = map2[f.op.archivo];
            if (v && v.bloqueado && f.estado === 'nueva') { f.bloqueado = true; f.estado = 'bloqueada'; }
            else if ((!v || !v.bloqueado) && f.estado === 'bloqueada') { f.bloqueado = false; f.estado = 'nueva'; }
        });
        var cont = document.getElementById('pdfImportPaneles');
        if (cont) cont.innerHTML = htmlPaneles(ultimosInfos);
        actualizarBotonConfirm();
    });
    modal.show();
}

/* Guarda en la cuenta destino los datos bancarios capturados de los
   encabezados de los estados del lote (titular, banco, sucursal y
   número de cuenta/tarjeta), vía el gancho de la app (que fusiona sin
   sobrescribir con vacíos). Se llama al CONFIRMAR la importación,
   ANTES de cualquier retorno de importarLote: también cuando todas
   las operaciones ya estaban importadas (duplicadas) o se importa en
   modo edición. Antes el guardado vivía al final de importarLote,
   tras esos retornos, y reimportar un estado ya importado — el caso
   típico al estrenar esta función — nunca guardaba los datos: la
   tarjeta CUP se quedaba sin banco en su panel y en la CON-02
   (reporte de Leonardo, 2026-10-25). */
function guardarCabecerasImportadas(cuenta) {
    try {
        if (window.__cuentaGuardarDatosBanco && ultimosInfos.length) {
            ultimosInfos.forEach(function (info) {
                if (info && info.cabecera) window.__cuentaGuardarDatosBanco(cuenta, info.cabecera);
            });
        }
    } catch (e) { /* la importación sigue; los datos del banco se capturan en la próxima */ }
}

/* ---------------- Importación ---------------- */
function detalleBloqueo(v) {
    if (!v) return '';
    return ['T1', 'T2', 'T5'].filter(function (r) { return v[r] && v[r].estado === 'fallo'; })
        .map(function (r) { return r + ': ' + (v[r].detalle || ''); }).join(' · ');
}
function totalesDeInfo(info) {
    var v = info._val || validarTotales(info, info.ops || [], {});
    return { declaradas: (info.cantidadDeclarada != null ? info.cantidadDeclarada : null), extraidas: (info.ops || []).length, ingSuma: Math.round(v.sumas.ingSuma * 100) / 100, gasSuma: Math.round(v.sumas.gasSuma * 100) / 100, saldoFin: (info.saldoBancoFin != null ? info.saldoBancoFin : null), saldoFiable: !!v.saldoFinFiable };
}
function opCuarentena(op) {
    return { fecha: op.fecha, concepto: op.concepto, monto: op.monto, tipo: op.tipo, refC: op.refC || '', refO: op.refO || '', saldo: (op.saldo != null ? op.saldo : null) };
}

/* Lo que el control de totales retiene al confirmar: estados
   bloqueados y de formato no reconocido (completos), operaciones
   fuera de rango no confirmadas y operaciones con fecha inválida
   (sueltas). Va a la cuarentena vía el gancho de la app; en modo
   edición el gancho no escribe y solo queda el aviso. Devuelve el
   texto para la alerta final. */
var ultimoEnvioCuarentena = 0;
function enviarCuarentenaAlConfirmar(cuenta) {
    var valFinal = validarLote(ultimosInfos, cuenta);
    var envios = [];
    ultimoEnvioCuarentena = 0;
    (ultimosInfos || []).forEach(function (info) {
        if (info._liberacion) return;   /* liberar de cuarentena no vuelve a cuarentena */
        var v = valFinal[info.nombre];
        var esFormato = !info.ops.length && info.textoLen >= 500;
        if ((v && v.bloqueado) || esFormato) {
            envios.push({ info: info, motivo: (esFormato && !(v && v.bloqueado)) ? 'formato' : 'totales', detalle: (esFormato && !(v && v.bloqueado)) ? 'formato no reconocido: el archivo trae texto pero ninguna operación con el formato conocido' : detalleBloqueo(v), ops: info.ops || [] });
            info._noRegistrar = true;
        }
        if ((info.invalidas || []).length) {
            envios.push({ info: info, motivo: 'formato', detalle: 'operaciones con fecha inválida de calendario (rechazadas por el parser)', ops: info.invalidas });
        }
    });
    var retenidas = ultimoLote.filter(function (f) { return f.estado === 'retenida'; });
    if (retenidas.length) {
        var porArch = {};
        retenidas.forEach(function (f) { (porArch[f.op.archivo] = porArch[f.op.archivo] || []).push(f.op); });
        Object.keys(porArch).forEach(function (nombre) {
            var infoR = (ultimosInfos || []).filter(function (i) { return i.nombre === nombre; })[0] || { nombre: nombre, periodo: '', desde: '', hasta: '' };
            envios.push({ info: infoR, motivo: 'manual', detalle: 'operaciones fuera del rango del estado, no confirmadas en la vista previa', ops: porArch[nombre] });
        });
    }
    ultimoEnvioCuarentena = envios.length;
    if (!envios.length) return '';
    if (!window.__contaGuardarCuarentena) {
        return '\nOJO: ' + envios.length + ' estado(s)/grupo(s) no pasaron el control de totales y NO se importaron.';
    }
    var nC = 0, nOpsC = 0, omitidoEdicion = false;
    envios.forEach(function (env) {
        var entrada = { archivo: env.info.nombre, cuenta: cuenta, periodoTexto: env.info.periodo || '', desde: env.info.desde || '', hasta: env.info.hasta || '', motivo: env.motivo, detalle: env.detalle, totales: totalesDeInfo(env.info), ops: (env.ops || []).map(opCuarentena) };
        var rr = window.__contaGuardarCuarentena(entrada);
        if (rr && rr.ok) { nC++; nOpsC += entrada.ops.length; }
        else if (rr && rr.omitido === 'edicion') omitidoEdicion = true;
    });
    if (nC) return '\nCuarentena: ' + nC + ' lote(s) retenido(s) (' + nOpsC + ' operaciones) en la pestaña Contabilidad («Cuarentena de importaciones»): NO se importaron; libéralos o descártalos allí cuando los revises.';
    if (omitidoEdicion) return '\nOJO: el control de totales retuvo estados/operaciones, pero en modo edición la cuarentena no se escribe: no se importaron.';
    return '';
}

/* Liberar un lote (o una operación suelta) de la cuarentena: entra
   por el MISMO camino que una importación normal — deduplicación por
   referencias, clasificación automática, registro del estado para la
   conciliación (solo cuando se libera el estado completo de una vez:
   una liberación parcial no debe firmar el saldo final del banco) y
   la cadena de contabilidad. Lo invoca la pestaña Contabilidad. */
window.__pdfLiberarCuarentena = function (datos, ops) {
    try {
        datos = datos || {};
        var lote = (ops || []).map(function (o) {
            return { fecha: o.fecha, refC: o.refC || '', refO: o.refO || '', concepto: o.concepto || '', monto: o.monto, tipo: o.tipo, saldo: (o.saldo != null ? o.saldo : null), archivo: datos.archivo };
        });
        var info = { nombre: datos.archivo, cuenta: '', periodo: datos.periodoTexto || '', desde: datos.desde || '', hasta: datos.hasta || '', saldoBancoFin: (datos.saldoBancoFin != null ? datos.saldoBancoFin : null), saldoFinFuente: null, saldoInicial: null, cantidadDeclarada: null, invalidas: [], ops: lote, textoLen: 9999, cabecera: null, origen: 'cuarentena', _liberacion: true };
        if (datos.registrarEstado === false) info._noRegistrar = true;
        var existentes = clavesExistentes(), vistos = {};
        var filas = lote.map(function (op) { return { op: op, estado: estadoFila(op, existentes, vistos), destino: destinoDe(op) }; });
        filas.forEach(function (f) {
            if (f.estado === 'nueva' && f.destino) { try { f.op._clasif = clasificarOperacion(f.op); } catch (e) { f.op._clasif = null; } }
        });
        var nNuevas = filas.filter(function (f) { return f.estado === 'nueva' && f.destino; }).length;
        ultimoLote = filas;
        ultimosInfos = [info];
        importarLote(datos.cuenta);
        return { ok: true, nuevas: nNuevas, duplicadas: lote.length - nNuevas };
    } catch (e) {
        console.error('Error liberando de cuarentena:', e);
        return { ok: false, motivo: 'error' };
    }
};

/* La MISMA clave con la que el núcleo registra el estado para la
   conciliación (ctaRegistrarEstadoBanco): cuenta | refs ordenadas |
   saldo final. El registro de importaciones (P4) la usa para saber
   qué lote es qué sin duplicar estados. */
function claveEstadoDe(cuenta, info) {
    var refs = (info.ops || []).map(function (o) { return String(o.refC || '') + '|' + String(o.refO || ''); }).sort().join(',');
    return cuenta + '|' + refs + '|' + (info.saldoBancoFin == null ? '' : info.saldoBancoFin);
}
function cerrarPlanesLote(claves) {
    try {
        if (!window.__contaCerrarImportacion) return;
        (claves || []).forEach(function (clave) { window.__contaCerrarImportacion(clave); });
    } catch (e) {}
}

function textoAvisoT3() {
    var nombres = (ultimosInfos || []).filter(function (info) {
        var v = info._val;
        return v && v.T3 && v.T3.estado === 'fallo' && !v.bloqueado;
    }).map(function (info) { return '«' + info.nombre + '»'; });
    if (!nombres.length) return '';
    return '\n⚠ AVISO FUERTE: el estado ' + nombres.join(', ') + ' no cuadra con el saldo del banco (saldo inicial + neto ≠ saldo final): se importó, pero revísalo — puede faltar un movimiento o sobrar uno.';
}

function importarLote(cuenta) {
    var api = API();
    /* Datos bancarios del encabezado: primero que nada, para que se
       guarden también sin operaciones nuevas o en modo edición. */
    guardarCabecerasImportadas(cuenta);
    /* Control de totales (ronda -35): lo retenido va a cuarentena y los
       estados bloqueados no se registran en la conciliación. */
    var cuarTxt = '';
    try { cuarTxt = enviarCuarentenaAlConfirmar(cuenta); } catch (e) { cuarTxt = ''; }
    /* Atomicidad práctica (ronda -35, P4): el registro del lote se abre
       en «aplicando» ANTES de guardar el primer movimiento. Si el
       proceso se corta a mitad, queda «aplicando», la app avisa y el
       reintento con el mismo estado converge sin duplicar. */
    var planesLote = [];
    try {
        if (window.__contaPlanImportacion) {
            (ultimosInfos || []).forEach(function (info) {
                if (info._noRegistrar || !info.ops || !info.ops.length) return;
                var clave = claveEstadoDe(cuenta, info);
                var nOpsInfo = ultimoLote.filter(function (f) { return f.op.archivo === info.nombre && f.estado === 'nueva' && f.destino; }).length;
                var rr = window.__contaPlanImportacion({ claveEstado: clave, archivo: info.nombre, cuenta: cuenta, nOps: nOpsInfo, nCuarentena: ultimoEnvioCuarentena || 0, conDiferencia: !!(info._val && info._val.T3 && info._val.T3.estado === 'fallo') });
                if (rr && rr.ok) planesLote.push(clave);
            });
        }
    } catch (e) { planesLote = []; }
    var nuevas = ultimoLote.filter(function (f) { return f.estado === 'nueva' && f.destino; });
    if (!nuevas.length) {
        /* Sin nada nuevo: si un intento anterior quedó «aplicando» y
           todo ya está, el lote en realidad SÍ se aplicó: se cierra. */
        cerrarPlanesLote(planesLote);
        alert('ℹ️ No hay operaciones nuevas en el estado (ya estaban importadas).\nLos datos del banco del encabezado (titular, banco, sucursal y número de cuenta/tarjeta) sí quedaron guardados en la cuenta destino.' + cuarTxt);
        return;
    }

    var enEdicion = api.enEdicion();
    var actual = api.periodoNominaActual();
    var historial = enEdicion ? null : api.getHistorial();
    var movs = api.movs();
    var histModificado = false;
    var porMes = {};
    var n = 0;

    nuevas.forEach(function (f) {
        var op = f.op;
        var mesOp = mesDeFecha(op.fecha);
        var infoOp = (ultimosInfos || []).filter(function (i) { return i.nombre === op.archivo; })[0];
        var mov = {
            id: api.nextId(),
            concepto: op.concepto,
            tipo: op.tipo,
            clasificacion: 'operacional',
            cuenta: cuenta,
            monto: Math.round(op.monto * 100) / 100,
            fecha: op.fecha,
            refCorriente: op.refC,
            refOrigen: op.refO,
            origen: (infoOp && infoOp.origen) || 'pdf_banco'
        };
        if (op.refSintetica) mov.refSintetica = op.refSintetica;
        /* Clasificación automática (corregible en la vista previa):
           - transferencia: clasificacion 'transferencia' + tipo según
             Cr/Db → mueve el saldo de la cuenta sin contar en totales.
           - onat: tipo 'onat' con código/nombre/período y vínculo a la
             obligación del Vector Fiscal (queda marcada como pagada).
           - qr: marca en el movimiento (registro QR del cierre). */
        var cl = op._clasif;
        if (cl) {
            if (cl.qr) mov.qr = true;
            if (cl.clase === 'transferencia') {
                mov.clasificacion = 'transferencia';
                mov.autoBanco = 'transferencia';
            } else if (cl.clase === 'onat' && cl.onat) {
                var periodoOnat = cl.onat.periodo || mesDeFecha(op.fecha);
                mov.tipo = 'onat';
                mov.aporteNumero = cl.onat.codigo;
                mov.tributoCodigo = cl.onat.codigo;
                mov.aporteNombre = cl.onat.nombre;
                mov.aportePeriodoTexto = periodoOnat;
                mov.fiscalPeriodo = periodoOnat;
                mov.aporteDesde = op.fecha;
                mov.aporteHasta = op.fecha;
                mov.autoBanco = 'onat';
                try {
                    if (api.obligacionParaAporte) {
                        var ob = api.obligacionParaAporte(cl.onat.codigo, op.fecha, op.fecha);
                        if (ob && ob.id) mov.fiscalId = ob.id;
                    }
                } catch (e) { /* el vínculo por código+período queda igual */ }
            } else if (cl.claseMov) {
                /* Ronda 5: 'contingencia' (no es gasto, descuenta el Fondo),
                   'utilidades' (no es gasto, distribución a socios) o
                   'salario' (sí es gasto; la app lo cruza con la nómina). */
                mov.clasificacion = cl.claseMov;
                mov.autoBanco = cl.claseMov;
            }
        }
        if (enEdicion) {
            movs.push(mov);          /* copia de trabajo; se guarda con "Guardar" */
        } else if (mesOp === actual) {
            movs.push(mov);
        } else {
            var h = null;
            for (var i = 0; i < historial.length; i++) {
                if (historial[i].mes === mesOp) { h = historial[i]; break; }
            }
            if (!h) {
                h = { mes: mesOp, fechaCierre: api.hoy(), tasa: api.tasaVista(), movimientos: [] };
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
        api.renderAll();
        alert('✅ ' + n + ' operaciones agregadas al mes en edición (' + api.mesEdicion() + ').\nPulsa "Guardar" para conservarlas.\nLa contabilidad se generará al guardar, desde la pestaña Contabilidad («Generar contabilidad»): lo claro se contabiliza solo y lo dudoso quedará en rojo en la bandeja.' + cuarTxt);
        return;
    }
    api.saveMovimientos(movs);
    if (histModificado) {
        /* Refrescar el Registro QR de los meses cerrados que recibieron
           operaciones con marca de comercio electrónico. */
        if (typeof api.registroQRDeMovs === 'function') {
            Object.keys(porMes).forEach(function (m) {
                if (m === actual) return;
                for (var i = 0; i < historial.length; i++) {
                    if (historial[i].mes === m) historial[i].registroQR = api.registroQRDeMovs(historial[i].movimientos || []);
                }
            });
        }
        api.saveHistorial(historial);
        /* Los meses cerrados que recibieron operaciones cambian su saldo final:
           encadenar saldos hacia adelante (incluye el mes en curso). */
        Object.keys(porMes).forEach(function (m) {
            if (m !== actual && typeof api.propagarSaldos === 'function') api.propagarSaldos(m);
        });
    }
    api.renderAll();

    /* Los datos bancarios del encabezado ya se guardaron al inicio de
       importarLote (guardarCabecerasImportadas): aquí no hace falta
       repetirlo. */

    /* Conciliación (ronda 7): cada estado importado se registra con su
       saldo final según banco y sus operaciones referenciadas, para que
       la conciliación de la pestaña Contabilidad se alimente sola de
       esta misma importación, sin pasos nuevos. Se registran TODAS las
       operaciones del estado (también las duplicadas: el banco las
       trae igual), deduplicadas por estado en el núcleo. */
    var concTxt = '';
    try {
        if (window.__contaRegistrarEstadoBanco && ultimosInfos.length) {
            var nReg = 0;
            ultimosInfos.forEach(function (info) {
                /* Los estados retenidos en cuarentena NO se registran:
                   su registro nace al liberarlos (ronda -35). Los de
                   formato no reconocido no traen operaciones. */
                if (info._noRegistrar || !info.ops || !info.ops.length) return;
                var rr = window.__contaRegistrarEstadoBanco({
                    cuenta: cuenta, archivo: info.nombre, periodoTexto: info.periodo,
                    desde: info.desde || '', hasta: info.hasta || '',
                    saldoBancoFin: (info.saldoBancoFin == null ? null : info.saldoBancoFin),
                    ops: (info.ops || []).map(function (op) { return { refC: op.refC, refO: op.refO, fecha: op.fecha, concepto: op.concepto, monto: op.monto, tipo: op.tipo }; })
                });
                if (rr && rr.ok && !rr.duplicado) nReg++;
            });
            if (nReg) concTxt = '\nConciliación: ' + nReg + ' estado(s) de cuenta guardado(s) con su saldo según banco (pestaña Contabilidad).';
        }
    } catch (e) { /* la importación ya quedó guardada; el estado puede reimportarse para registrarlo */ }

    /* P4: con movimientos, historial y estados ya guardados, el lote
       se cierra como «aplicada» ANTES de reconstruir la contabilidad. */
    cerrarPlanesLote(planesLote);

    var contaTxt = '';
    try {
        if (window.__contaTrasImportar) {
            var rc = window.__contaTrasImportar();
            if (rc && !rc.omitido) contaTxt = '\nContabilidad: ' + (rc.creados || 0) + ' asiento(s) generados automáticamente.' + (rc.pendientes ? ' ' + rc.pendientes + ' movimiento(s) en rojo esperan clasificación en la bandeja «Por clasificar» (pestaña Contabilidad).' : ' Sin pendientes en rojo.');
            else if (rc && rc.razon === 'edicion') contaTxt = '\nContabilidad: se generará al guardar el mes en edición.';
        }
    } catch (e) { /* la importación ya quedó guardada; la contabilidad puede generarse desde su pestaña */ }

    var detalle = Object.keys(porMes).map(function (m) { return m + ': ' + porMes[m]; }).join(', ');
    var cT = 0, cO = 0, cQ = 0;
    nuevas.forEach(function (f) {
        if (f.op._clasif) {
            if (f.op._clasif.clase === 'transferencia') cT++;
            if (f.op._clasif.clase === 'onat') cO++;
            if (f.op._clasif.qr) cQ++;
        }
    });
    var extraClasif = (cT || cO || cQ) ? '\nClasificadas: ' + cT + ' transferencias entre cuentas, ' + cO + ' pagos ONAT, ' + cQ + ' con marca QR.' : '';
    alert('✅ Importadas ' + n + ' operaciones del estado de cuenta.\n' + detalle + extraClasif + contaTxt + concTxt + textoAvisoT3() + cuarTxt);
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
    cerrarBuf: cerrarBuf,
    limpiarConcepto: limpiarConcepto,
    unirLinea: unirLinea,
    fechaISOdeDMY: fechaISOdeDMY,
    mesDeFecha: mesDeFecha,
    clasificarOperacion: clasificarOperacion,
    extraerCabecera: extraerCabecera,
    extraerCodigosConcepto: extraerCodigosConcepto,
    detectarPeriodoConcepto: detectarPeriodoConcepto,
    TABLA_TRIBUTOS_LOCAL: TABLA_TRIBUTOS_LOCAL,
    /* Ronda -35: control de totales y armado de infos desde líneas */
    fechaCalendarioOk: fechaCalendarioOk,
    validarTotales: validarTotales,
    infoDesdeLineas: infoDesdeLineas,
    /* Ronda -35 (P5): vía CSV/Excel */
    infoDesdeCsv: infoDesdeCsv,
    infoDesdeFilas: infoDesdeFilas,
    dividirCsv: dividirCsv,
    mapearColumnas: mapearColumnas,
    parseImporte: parseImporte,
    vistaPrevia: function (infos, cuentaSel) {
        var ops = [];
        (infos || []).forEach(function (inf) { (inf.ops || []).forEach(function (op) { if (!op.archivo) op.archivo = inf.nombre; ops.push(op); }); });
        if (cuentaSel) cuentaPreseleccionada = cuentaSel;
        mostrarVistaPrevia(ops, infos || []);
    },
    ultimoLote: function () { return ultimoLote; },
    ultimosInfos: function () { return ultimosInfos; }
};

})();
