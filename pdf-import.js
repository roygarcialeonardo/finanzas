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
    '820132': { codigo: '0820132', nombre: 'Contribución Especial a la Seguridad Social (propia del TCP)', cat: 'deducible', fuente: 'verificado' },
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
function parsearLineas(lineas, buf) {
    var ops = [], saldoLinea = null;
    lineas.forEach(function (line) {
        var ms = RE_INICIO.exec(line);
        if (ms) {                                   /* inicio de fila primero */
            if (buf) { var p0 = cerrarBuf(buf); if (p0) ops.push(p0); }
            buf = { d: ms[1], mo: ms[2], y: ms[3], refC: ms[4], refO: ms[5], obs: ms[6] || '' };
            extraerFin(buf);   /* guarda el importe si ya viene en la 1ª línea; el buf SIGUE abierto */
            return;
        }
        if (RE_OMITIR.test(line)) {                 /* cabeceras, saldos, pies */
            if (/^Saldo (Contable|Disponible)\b/.test(line)) {
                var msl = /(-?[\d,]+\.\d{2})(?:\s+(?:Cr|Db))?\s*$/.exec(line);
                if (msl) saldoLinea = parseFloat(msl[1].replace(/,/g, ''));
            }
            if (buf) { var p2 = cerrarBuf(buf); if (p2) ops.push(p2); buf = null; }
            return;
        }
        if (buf) {                                  /* continuación de la fila */
            buf.obs = unirLinea(buf.obs, line);
            extraerFin(buf);   /* por si el importe venía en una continuación; solo la 1ª vez */
        }
    });
    return { ops: ops, resto: buf, saldoLinea: saldoLinea };
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
    var ops = [], buf = null, cuenta = '', periodo = '', textoLen = 0, desde = '', hasta = '', saldoLinea = null, cabecera = null;
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
        buf = r.resto;
        if (r.saldoLinea != null) saldoLinea = r.saldoLinea;
    }
    if (buf) { var op = cerrarBuf(buf); if (op) ops.push(op); }
    /* Saldo final SEGÚN BANCO del estado (ronda 7, para la conciliación):
       manda el saldo corrido de la ÚLTIMA operación del documento; si el
       formato no lo trae, la última línea «Saldo Contable/Disponible». */
    var saldoBancoFin = null;
    for (var i = 0; i < ops.length; i++) { if (ops[i].saldo != null) saldoBancoFin = ops[i].saldo; }
    if (saldoBancoFin == null) saldoBancoFin = saldoLinea;
    return { nombre: nombreArchivo, cuenta: cuenta, periodo: periodo, desde: desde, hasta: hasta, saldoBancoFin: saldoBancoFin, ops: ops, textoLen: textoLen, cabecera: cabecera };
}

/* ---------------- Deduplicación ---------------- */
function clavesExistentes() {
    var api = API(), set = {};
    function add(m) {
        if (m && m.refCorriente && m.refOrigen) set[m.refCorriente + '|' + m.refOrigen] = true;
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
var ultimosInfos = [];

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
    try {
        mostrarVistaPrevia(todos, infos);
    } catch (err) {
        console.error('Error mostrando vista previa:', err);
        alert('Se leyeron ' + todos.length + ' operaciones pero falló la vista previa: ' + (err && err.message ? err.message : err));
    }
}

/* ---------------- Vista previa ---------------- */
function estadoFila(op, existentes, vistos) {
    var k = op.refC + '|' + op.refO;
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
        var est = f.estado === 'duplicada'
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
        filasCompactas.push('<tr><td class="text-nowrap">' + pdfEsc(fechaCorta(op.fecha)) + '</td><td title="' + concepto + '">' + corto + '</td><td class="text-end text-nowrap">$' + Number(op.monto).toFixed(2) + '</td><td class="small">' + (evF ? (evF.claro ? '<span class="text-success">✓ Automática: ' + pdfEsc(evF.via || 'regla clara') + '</span>' : '<span class="text-danger">● Pendiente de clasificar</span>') : (f.estado === 'duplicada' ? 'Duplicada (se omite)' : (f.destino ? 'Nueva' : 'Se omite'))) + '</td></tr>');
        var evSalF = evalSalario ? evalSalario[idxFila] : null;
        var rojoHtml = (evF && !evF.claro) ? '<div class="small text-danger fw-semibold">● En rojo: no se contabilizará hasta clasificarlo. ' + pdfEsc(evF.motivo || '') + ' Quedará en la bandeja «Por clasificar» de la pestaña Contabilidad.</div>' : '';
        var claroHtml = (evF && evF.claro) ? '<div class="small text-success">✓ Se contabilizará automáticamente (' + pdfEsc(evF.via || 'regla clara') + ').</div>' : '';
        return '<tr' + ((evF && !evF.claro) ? ' style="background:#fdeaea"' : (evSalF && evSalF.amarillo ? ' style="background:#fff8e1"' : '')) + '>' +
            '<td class="text-nowrap">' + pdfEsc(fechaCorta(op.fecha)) + '</td>' +
            '<td title="' + concepto + '">' + corto + ctrl + rojoHtml + claroHtml + '</td>' +
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
            '<div class="d-flex flex-wrap align-items-center gap-2 mb-3">' +
              '<span class="badge bg-primary">' + nuevas + ' nuevas</span>' +
              '<span class="badge bg-secondary">' + dups + ' duplicadas (se omiten)</span>' +
              (omitidas ? '<span class="badge bg-warning text-dark">' + omitidas + ' omitidas</span>' : '') +
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
            '<button type="button" class="btn btn-primary" id="pdfImportConfirm" ' + ((nuevas || hayCabeceras) ? '' : 'disabled') + '>' +
            (nuevas
                ? '<i class="bi bi-download me-1"></i> Importar ' + nuevas + ' operaciones</button>'
                : '<i class="bi bi-bank me-1"></i> Guardar datos del banco</button>') +
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
function importarLote(cuenta) {
    var api = API();
    /* Datos bancarios del encabezado: primero que nada, para que se
       guarden también sin operaciones nuevas o en modo edición. */
    guardarCabecerasImportadas(cuenta);
    var nuevas = ultimoLote.filter(function (f) { return f.estado === 'nueva' && f.destino; });
    if (!nuevas.length) {
        alert('ℹ️ No hay operaciones nuevas en el estado (ya estaban importadas).\nLos datos del banco del encabezado (titular, banco, sucursal y número de cuenta/tarjeta) sí quedaron guardados en la cuenta destino.');
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
            origen: 'pdf_banco'
        };
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
        alert('✅ ' + n + ' operaciones agregadas al mes en edición (' + api.mesEdicion() + ').\nPulsa "Guardar" para conservarlas.\nLa contabilidad se generará al guardar, desde la pestaña Contabilidad («Generar contabilidad»): lo claro se contabiliza solo y lo dudoso quedará en rojo en la bandeja.');
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
    alert('✅ Importadas ' + n + ' operaciones del estado de cuenta.\n' + detalle + extraClasif + contaTxt + concTxt);
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
    TABLA_TRIBUTOS_LOCAL: TABLA_TRIBUTOS_LOCAL
};

})();
