/* ============================================================
   iconos.js — Iconos animados para Finanzas (FUENTE OFICIAL:
   Lordicon, colección Wired Lineal) con respaldo local dibujado.
   ------------------------------------------------------------
   FORMATO DE EMBED OFICIAL (verificado el 2026-10-25 en
   lordicon.com y en su documentación/FAQ de «Embed HTML»):
     <script src="https://cdn.lordicon.com/lordicon.js"></script>
     <lord-icon src="https://cdn.lordicon.com/<key>.json"
                trigger="hover" style="width:..px;height:..px">
   El reproductor oficial SOLO acepta Lottie JSON (su loader hace
   fetch + response.json()). Los archivos .li del catálogo web son
   un formato propietario que únicamente decodifica el reproductor
   interno del sitio; NO se usan aquí.
   La <key> de 8 caracteres de cada icono es su identificador
   oficial público: sale en la API de la biblioteca que usa el
   propio lordicon.com (GET /api/library/icons?family=wired&
   style=lineal&query=…), junto al flag «premium». En OFICIALES
   solo hay iconos con premium=false (FREE), elegidos como el
   gratuito más cercano a cada hueco de la app; la página de cada
   icono queda en «pagina» para poder comprobarlo.
   RESILIENCIA: ningún hueco queda vacío nunca. Cada marcador se
   monta primero con el icono DIBUJADO local (los 69 trazos de
   ICONOS, estilo Wired Lineal, sin red). El reproductor oficial
   se carga diferido; cuando está listo, los huecos con oficial
   asignado se MEJORAN a <lord-icon>. Si el reproductor no carga
   (sin internet, timeout de 4 s) o un icono concreto no
   renderiza en 4 s, ese hueco se queda con su dibujado.
   Sin peticiones por icono hasta que el reproductor confirma:
   sin conexión no se desperdicia ni un byte.
   Atribución oficial en la pestaña «Ayuda»: «Animated icons by
   Lordicon.com» (https://lordicon.com) — exigida para FREE.
   ============================================================ */
(function () {
  'use strict';
  var ICONOS = {"velocimetro":"<path pathLength=\"100\" class=\"tr\" d=\"M4.6 19a9 9 0 1 1 14.8 0\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 14.6 15.8 9.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 16.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.5 19.4h17\"/>","banco":"<path pathLength=\"100\" class=\"tr\" d=\"M3 8.6 12 3.5 21 8.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M5.2 8.6v8.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.4 8.6v8.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M14.6 8.6v8.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M18.8 8.6v8.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.4 16.8h17.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M2.8 20.4h18.4\"/>","tarjeta":"<path pathLength=\"100\" class=\"tr\" d=\"M3.2 6.4A1.6 1.6 0 0 1 4.8 4.8h14.4a1.6 1.6 0 0 1 1.6 1.6v11.2a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.2 9.6h17.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.4 14.8h4\"/>","dolar":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M15.2 8.4c-.7-1-1.8-1.5-3.2-1.5-1.9 0-3.3 1-3.3 2.4 0 3.3 6.6 2 6.6 4.1 0 1.5-1.5 2.4-3.3 2.4-1.4 0-2.6-.6-3.3-1.5\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 5.6v12.8\"/>","usuarios":"<path pathLength=\"100\" class=\"tr\" d=\"M9 11.2a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.4 19.6c.6-3.1 2.8-4.7 5.6-4.7s5 1.6 5.6 4.7\"/><path pathLength=\"100\" class=\"tr\" d=\"M15.6 4.5a3.6 3.6 0 0 1 0 6.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.2 15.2c1.9.5 3.1 1.9 3.6 4.4\"/>","usuario":"<path pathLength=\"100\" class=\"tr\" d=\"M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z\"/><path pathLength=\"100\" class=\"tr\" d=\"M5 20.4c.8-3.7 3.6-5.4 7-5.4s6.2 1.7 7 5.4\"/>","usuario-mas":"<path pathLength=\"100\" class=\"tr\" d=\"M10.4 10.8a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.6 19.8c.7-3.3 3.4-4.9 6.8-4.9 1.2 0 2.3.2 3.3.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M18.4 15.2v6\"/><path pathLength=\"100\" class=\"tr\" d=\"M15.4 18.2h6\"/>","tarjeta-id":"<path pathLength=\"100\" class=\"tr\" d=\"M3.2 6.4A1.6 1.6 0 0 1 4.8 4.8h14.4a1.6 1.6 0 0 1 1.6 1.6v11.2a1.6 1.6 0 0 1-1.6 1.6H4.8a1.6 1.6 0 0 1-1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.2 13.4a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M5.9 16.6c.4-1.4 1.2-2 2.3-2s1.9.6 2.3 2\"/><path pathLength=\"100\" class=\"tr\" d=\"M14 9.4h4.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M14 13h4.4\"/>","grafico":"<path pathLength=\"100\" class=\"tr\" d=\"M4 4v16.2h16.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 16.2v-5\"/><path pathLength=\"100\" class=\"tr\" d=\"M12.4 16.2V8\"/><path pathLength=\"100\" class=\"tr\" d=\"M16.4 16.2v-3.4\"/>","tendencia":"<path pathLength=\"100\" class=\"tr\" d=\"M3.6 16.6 9.2 11l3.4 3.4L20.4 6.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M14.8 6.2h5.6v5.6\"/>","doc":"<path pathLength=\"100\" class=\"tr\" d=\"M6.5 3.8h7L18.6 9v10.7a1.6 1.6 0 0 1-1.6 1.6H6.5a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.4 3.8V9h5.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 13h7.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 16.6h7.2\"/>","doc-check":"<path pathLength=\"100\" class=\"tr\" d=\"M6.5 3.8h7L18.6 9v10.7a1.6 1.6 0 0 1-1.6 1.6H6.5a1.6 1.6 0 0 1-1.6-1.6V5.4a1.6 1.6 0 0 1 1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.4 3.8V9h5.2\"/><path pathLength=\"100\" class=\"tr\" d=\"m8.6 14.8 2.3 2.3 4.4-4.6\"/>","libro":"<path pathLength=\"100\" class=\"tr\" d=\"M6.5 3.2h13.2v17.6H6.5a2.6 2.6 0 0 0-2.6 2.6V5.8a2.6 2.6 0 0 1 2.6-2.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.9 18.4a2.6 2.6 0 0 1 2.6-2.6h13.2\"/>","calculadora":"<path pathLength=\"100\" class=\"tr\" d=\"M6.2 2.8h11.6A1.6 1.6 0 0 1 19.4 4.4v15.2a1.6 1.6 0 0 1-1.6 1.6H6.2a1.6 1.6 0 0 1-1.6-1.6V4.4a1.6 1.6 0 0 1 1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.2 6.6h7.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.2 11.2h1.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M14 11.2h1.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.2 14.8h1.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M14 14.8h1.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.2 18.4h1.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M14 18.4h1.8\"/>","factura":"<path pathLength=\"100\" class=\"tr\" d=\"M6 3.2h12v17.2l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.2 8h5.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.2 11.8h5.6\"/>","intercambio":"<path pathLength=\"100\" class=\"tr\" d=\"M17 3.6 20.4 7 17 10.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M20.4 7H9.2a4.2 4.2 0 0 0-4.2 4.2v1.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M7 20.4 3.6 17 7 13.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.6 17h11.2a4.2 4.2 0 0 0 4.2-4.2v-1.4\"/>","monitor":"<path pathLength=\"100\" class=\"tr\" d=\"M5 4.2h14a1.6 1.6 0 0 1 1.6 1.6v9a1.6 1.6 0 0 1-1.6 1.6H5A1.6 1.6 0 0 1 3.4 14.8v-9A1.6 1.6 0 0 1 5 4.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 16.4v3.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 20.6h7.2\"/>","cuadricula":"<path pathLength=\"100\" class=\"tr\" d=\"M4.2 4.2h6.8v6.8H4.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13 4.2h6.8v6.8H13z\"/><path pathLength=\"100\" class=\"tr\" d=\"M4.2 13h6.8v6.8H4.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13 13h6.8v6.8H13z\"/>","tabla":"<path pathLength=\"100\" class=\"tr\" d=\"M4.2 4h15.6a.6.6 0 0 1 .6.6v14.8a.6.6 0 0 1-.6.6H4.2a.6.6 0 0 1-.6-.6V4.6A.6.6 0 0 1 4.2 4z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.6 9.6h16.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.6 15h16.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.4 3.8v16.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M15.2 3.8v16.4\"/>","archivo":"<path pathLength=\"100\" class=\"tr\" d=\"M3.8 4.2h16.4a.5.5 0 0 1 .5.5v4a.5.5 0 0 1-.5.5H3.8a.5.5 0 0 1-.5-.5v-4a.5.5 0 0 1 .5-.5z\"/><path pathLength=\"100\" class=\"tr\" d=\"M5.2 9.2h13.6v9.4a1.6 1.6 0 0 1-1.6 1.6H6.8a1.6 1.6 0 0 1-1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M10 13.6h4\"/>","maletin":"<path pathLength=\"100\" class=\"tr\" d=\"M4 7.6h16a1.6 1.6 0 0 1 1.6 1.6v9.2a1.6 1.6 0 0 1-1.6 1.6H4a1.6 1.6 0 0 1-1.6-1.6V9.2A1.6 1.6 0 0 1 4 7.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M9 7.6V6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 6v1.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M2.4 12.8h19.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M10 12.8h4v2.6h-4z\"/>","ajustes":"<path pathLength=\"100\" class=\"tr\" d=\"M4.5 6.8h6.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.2 6.8h2.3\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.9 8.8a2 2 0 1 0 0-4 2 2 0 0 0 0 4z\"/><path pathLength=\"100\" class=\"tr\" d=\"M4.5 12h2.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M13 12h6.5\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.7 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z\"/><path pathLength=\"100\" class=\"tr\" d=\"M4.5 17.2h10\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.8 17.2h1.7\"/><path pathLength=\"100\" class=\"tr\" d=\"M16.1 19.2a2 2 0 1 0 0-4 2 2 0 0 0 0 4z\"/>","ayuda":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.3 9.3A2.9 2.9 0 0 1 12 7.4c1.6 0 2.9 1.2 2.9 2.7 0 1.9-2.9 2.1-2.9 3.9\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 16.9v.4\"/>","impresora":"<path pathLength=\"100\" class=\"tr\" d=\"M6.5 9V3.4h11V9\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.5 18H4.6A1.8 1.8 0 0 1 2.8 16.2V11a1.8 1.8 0 0 1 1.8-1.8h14.8A1.8 1.8 0 0 1 21.2 11v5.2a1.8 1.8 0 0 1-1.8 1.8h-1.9\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.5 14h11v7h-11z\"/>","papelera":"<path pathLength=\"100\" class=\"tr\" d=\"M4 6.6h16\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.6 6.2V4.6A1.5 1.5 0 0 1 11.1 3.1h1.8a1.5 1.5 0 0 1 1.5 1.5v1.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.2 6.6l.7 11.6a2 2 0 0 0 2 1.9h6.2a2 2 0 0 0 2-1.9l.7-11.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M10 10.4v6\"/><path pathLength=\"100\" class=\"tr\" d=\"M14 10.4v6\"/>","lapiz":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.2h8.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M16.6 3.6a2.1 2.1 0 0 1 3 3L7.2 19l-4.2 1.1L4.1 15.9z\"/>","mas":"<path pathLength=\"100\" class=\"tr\" d=\"M12 5v14\"/><path pathLength=\"100\" class=\"tr\" d=\"M5 12h14\"/>","mas-circulo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 8.4v7.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 12h7.2\"/>","menos-circulo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 12h7.2\"/>","check":"<path pathLength=\"100\" class=\"tr\" d=\"m4.6 12.6 5 5L19.6 6.8\"/>","check-circulo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"m8.4 12.3 2.5 2.5 4.7-5.2\"/>","check-cuadro":"<path pathLength=\"100\" class=\"tr\" d=\"M5 4.4h14a1.6 1.6 0 0 1 1.6 1.6v12A1.6 1.6 0 0 1 19 19.6H5A1.6 1.6 0 0 1 3.4 18V6A1.6 1.6 0 0 1 5 4.4z\"/><path pathLength=\"100\" class=\"tr\" d=\"m8.4 12.3 2.5 2.5 4.7-5.2\"/>","calendario":"<path pathLength=\"100\" class=\"tr\" d=\"M4.6 6h14.8a1.6 1.6 0 0 1 1.6 1.6v10.8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18.4V7.6A1.6 1.6 0 0 1 4.6 6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3 10.2h18\"/><path pathLength=\"100\" class=\"tr\" d=\"M8 3.4v3\"/><path pathLength=\"100\" class=\"tr\" d=\"M16 3.4v3\"/><path pathLength=\"100\" class=\"tr\" d=\"M7.6 14h3\"/><path pathLength=\"100\" class=\"tr\" d=\"M7.6 17h3\"/>","calendario-check":"<path pathLength=\"100\" class=\"tr\" d=\"M4.6 6h14.8a1.6 1.6 0 0 1 1.6 1.6v10.8a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 18.4V7.6A1.6 1.6 0 0 1 4.6 6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M3 10.2h18\"/><path pathLength=\"100\" class=\"tr\" d=\"M8 3.4v3\"/><path pathLength=\"100\" class=\"tr\" d=\"M16 3.4v3\"/><path pathLength=\"100\" class=\"tr\" d=\"m8.8 15.6 2.2 2.2 4.2-4.4\"/>","monedas":"<path pathLength=\"100\" class=\"tr\" d=\"M9.2 15.6a5.6 5.6 0 1 0 0-11.2 5.6 5.6 0 0 0 0 11.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M14.8 5a5.6 5.6 0 0 1 4.4 6.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M14.8 19.4a5.6 5.6 0 0 0 4.4-4.2\"/>","billete":"<path pathLength=\"100\" class=\"tr\" d=\"M3 6.6h18a.6.6 0 0 1 .6.6v9.6a.6.6 0 0 1-.6.6H3a.6.6 0 0 1-.6-.6V7.2A.6.6 0 0 1 3 6.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z\"/><path pathLength=\"100\" class=\"tr\" d=\"M6 9.4h.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.6 14.6h.4\"/>","tienda":"<path pathLength=\"100\" class=\"tr\" d=\"M4.6 10.2v9.6h14.8v-9.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.2 6.2 4.8 3h14.4L20.8 6.2a3 3 0 0 1-5.7 1.3 3.2 3.2 0 0 1-6.2 0 3 3 0 0 1-5.7-1.3z\"/><path pathLength=\"100\" class=\"tr\" d=\"M9.6 19.8v-5h4.8v5\"/>","salir":"<path pathLength=\"100\" class=\"tr\" d=\"M13.8 4h4.6A1.6 1.6 0 0 1 20 5.6v12.8a1.6 1.6 0 0 1-1.6 1.6h-4.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.6 12h11\"/><path pathLength=\"100\" class=\"tr\" d=\"M10.4 7.4 15 12l-4.6 4.6\"/>","flecha-der":"<path pathLength=\"100\" class=\"tr\" d=\"M4.4 12h14.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.4 6.4 18.8 12l-5.4 5.6\"/>","flecha-izq":"<path pathLength=\"100\" class=\"tr\" d=\"M19.6 12H5.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M10.6 6.4 5.2 12l5.4 5.6\"/>","alerta":"<path pathLength=\"100\" class=\"tr\" d=\"M10.8 4.4 3.2 18.6A1.7 1.7 0 0 0 4.7 21h14.6a1.7 1.7 0 0 0 1.5-2.4L13.2 4.4a1.5 1.5 0 0 0-2.4 0z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 9.6V14\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 17.2v.4\"/>","info":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 11v5.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 7.6v.4\"/>","candado":"<path pathLength=\"100\" class=\"tr\" d=\"M8 11V7.2a4 4 0 0 1 8 0V11\"/><path pathLength=\"100\" class=\"tr\" d=\"M5.6 11h12.8a1.6 1.6 0 0 1 1.6 1.6v6.8a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19.4v-6.8A1.6 1.6 0 0 1 5.6 11z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 14.8v2.6\"/>","llave":"<path pathLength=\"100\" class=\"tr\" d=\"M8.2 15.4a4.4 4.4 0 1 0 0-8.8 4.4 4.4 0 0 0 0 8.8z\"/><path pathLength=\"100\" class=\"tr\" d=\"M11.4 12.2 19.8 3.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M15.8 8l3 3\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.4 10.4l2 2\"/>","ojo":"<path pathLength=\"100\" class=\"tr\" d=\"M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z\"/>","guardar":"<path pathLength=\"100\" class=\"tr\" d=\"M5.2 3.6h10.6l4.6 4.6v10.6a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6V5.2a1.6 1.6 0 0 1 1.6-1.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.2 3.6v5h7.4v-5\"/><path pathLength=\"100\" class=\"tr\" d=\"M8 20.4v-6h8v6\"/>","edificio":"<path pathLength=\"100\" class=\"tr\" d=\"M5.4 20.8V5.6A1.6 1.6 0 0 1 7 4h6.4a1.6 1.6 0 0 1 1.6 1.6v15.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M15 9.4h3.4a1.6 1.6 0 0 1 1.6 1.6v9.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.4 20.8h17.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 8h1.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 12h1.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 16h1.4\"/>","porciento":"<path pathLength=\"100\" class=\"tr\" d=\"M18.6 5.4 5.4 18.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.6 8.6a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.4 19.6a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2z\"/>","bandera":"<path pathLength=\"100\" class=\"tr\" d=\"M5 21.6v-17\"/><path pathLength=\"100\" class=\"tr\" d=\"M5 4.8c4.4-2.2 7.4 1.8 13.6 0v8.8c-6.2 1.8-9.2-2.2-13.6 0\"/>","nodos":"<path pathLength=\"100\" class=\"tr\" d=\"M6.4 8a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 6.4 8z\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.6 8a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 17.6 8z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 20.8a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z\"/><path pathLength=\"100\" class=\"tr\" d=\"M8.4 6.6h7.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M7.4 8.2 10.4 17\"/><path pathLength=\"100\" class=\"tr\" d=\"M16.6 8.2 13.6 17\"/>","idea":"<path pathLength=\"100\" class=\"tr\" d=\"M9.6 17.8h4.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M10.4 20.8h3.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 3.4a6 6 0 0 1 3.5 10.9c-.5.4-.6.8-.6 1.5h-5.8c0-.7-.1-1.1-.6-1.5A6 6 0 0 1 12 3.4z\"/>","reloj":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 7.4V12l3 2\"/>","carpeta":"<path pathLength=\"100\" class=\"tr\" d=\"M3.6 6.6A1.6 1.6 0 0 1 5.2 5h4l2 2.6h7.6a1.6 1.6 0 0 1 1.6 1.6v8.6a1.6 1.6 0 0 1-1.6 1.6H5.2a1.6 1.6 0 0 1-1.6-1.6z\"/>","qr":"<path pathLength=\"100\" class=\"tr\" d=\"M4.2 4.2h6v6h-6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.8 4.2h6v6h-6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M4.2 13.8h6v6h-6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.8 13.8h2.6v2.6h-2.6z\"/><path pathLength=\"100\" class=\"tr\" d=\"M17.2 17.2h2.6v2.6h-2.6z\"/>","escudo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 3.2 5.2 5.9v5.3c0 4.5 2.9 7.5 6.8 9.4 3.9-1.9 6.8-4.9 6.8-9.4V5.9z\"/><path pathLength=\"100\" class=\"tr\" d=\"m9 11.6 2.3 2.3 4-4.3\"/>","subir":"<path pathLength=\"100\" class=\"tr\" d=\"M4.2 15.2v3.4A1.6 1.6 0 0 0 5.8 20.2h12.4a1.6 1.6 0 0 0 1.6-1.6v-3.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 13.4V3.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.6 8.2 12 3.8l5.4 4.4\"/>","descargar":"<path pathLength=\"100\" class=\"tr\" d=\"M4.2 15.2v3.4A1.6 1.6 0 0 0 5.8 20.2h12.4a1.6 1.6 0 0 0 1.6-1.6v-3.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 3.8v9.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.6 9.4 12 13.8l5.4-4.4\"/>","buscar":"<path pathLength=\"100\" class=\"tr\" d=\"M10.8 17.4a6.6 6.6 0 1 0 0-13.2 6.6 6.6 0 0 0 0 13.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M15.6 15.6 20.8 20.8\"/>","filtro":"<path pathLength=\"100\" class=\"tr\" d=\"M4 5h16l-6.1 7.1v6.1L10.1 20v-7.9z\"/>","equis":"<path pathLength=\"100\" class=\"tr\" d=\"M6 6l12 12\"/><path pathLength=\"100\" class=\"tr\" d=\"M18 6 6 18\"/>","menu":"<path pathLength=\"100\" class=\"tr\" d=\"M4.4 7h15.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M4.4 12h15.2\"/><path pathLength=\"100\" class=\"tr\" d=\"M4.4 17h15.2\"/>","casa":"<path pathLength=\"100\" class=\"tr\" d=\"M4.2 11.2 12 4.4l7.8 6.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M6.6 9.6v9.6h10.8V9.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M10.4 19.2v-4.8h3.2v4.8\"/>","billetera":"<path pathLength=\"100\" class=\"tr\" d=\"M3.6 7A1.8 1.8 0 0 1 5.4 5.2h12.4a1.6 1.6 0 0 1 1.6 1.6v1.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M3.6 6.8v10.6A1.8 1.8 0 0 0 5.4 19.2h14a1.6 1.6 0 0 0 1.6-1.6v-7a1.6 1.6 0 0 0-1.6-1.6H5.4A1.8 1.8 0 0 1 3.6 7.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M16.6 13.8h.4\"/>","fabrica":"<path pathLength=\"100\" class=\"tr\" d=\"M3.6 20.6V10.4l5.2 3v-3l5.2 3V6.8h4.4v13.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M2.8 20.6h18.4\"/><path pathLength=\"100\" class=\"tr\" d=\"M7.4 17h2.6v3.6H7.4z\"/><path pathLength=\"100\" class=\"tr\" d=\"M13.4 17h2.6v3.6h-2.6z\"/>","sincronizar":"<path pathLength=\"100\" class=\"tr\" d=\"M19.8 12a7.8 7.8 0 1 1-2.2-5.5\"/><path pathLength=\"100\" class=\"tr\" d=\"M20.2 3.4v4.2h-4.2\"/>","luna":"<path pathLength=\"100\" class=\"tr\" d=\"M19.8 14.6A8.4 8.4 0 1 1 9.4 4.2a6.8 6.8 0 0 0 10.4 10.4z\"/>","flecha-arriba-circulo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 16.4V7.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M7.4 12 12 7.4l4.6 4.6\"/>","flecha-abajo-circulo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 7.6v8.8\"/><path pathLength=\"100\" class=\"tr\" d=\"M7.4 12 12 16.6 16.6 12\"/>","flecha-izq-circulo":"<path pathLength=\"100\" class=\"tr\" d=\"M12 20.6a8.6 8.6 0 1 0 0-17.2 8.6 8.6 0 0 0 0 17.2z\"/><path pathLength=\"100\" class=\"tr\" d=\"M16.4 12H7.6\"/><path pathLength=\"100\" class=\"tr\" d=\"M12 7.4 7.4 12l4.6 4.6\"/>"};
  var MAPA_BI = {"bi-speedometer2":"velocimetro","bi-bank":"banco","bi-credit-card":"tarjeta","bi-currency-dollar":"dolar","bi-people":"usuarios","bi-people-fill":"usuarios","bi-person":"usuario","bi-person-plus":"usuario-mas","bi-person-vcard":"tarjeta-id","bi-bar-chart-line":"grafico","bi-bar-chart-line-fill":"grafico","bi-graph-up-arrow":"tendencia","bi-file-earmark-check":"doc-check","bi-file-check":"doc-check","bi-file-earmark-text":"doc","bi-file-text":"doc","bi-file-earmark":"doc","bi-file-earmark-diff":"doc","bi-journal-text":"doc","bi-journal-bookmark":"libro","bi-book":"libro","bi-calculator":"calculadora","bi-receipt":"factura","bi-receipt-cutoff":"factura","bi-currency-exchange":"intercambio","bi-pc-display-horizontal":"monitor","bi-grid-1x2":"cuadricula","bi-grid-3x3-gap":"cuadricula","bi-archive":"archivo","bi-briefcase":"maletin","bi-gear-fill":"ajustes","bi-gear":"ajustes","bi-sliders":"ajustes","bi-question-circle":"ayuda","bi-printer":"impresora","bi-trash3":"papelera","bi-trash":"papelera","bi-pencil":"lapiz","bi-pencil-square":"lapiz","bi-plus-lg":"mas","bi-plus-circle":"mas-circulo","bi-dash-circle":"menos-circulo","bi-check":"check","bi-check-lg":"check","bi-check2-circle":"check-circulo","bi-check-circle":"check-circulo","bi-check2-square":"check-cuadro","bi-calendar3":"calendario","bi-calendar":"calendario","bi-calendar-heart":"calendario","bi-calendar-check":"calendario-check","bi-calendar2-check":"calendario-check","bi-cash-coin":"monedas","bi-cash-stack":"billete","bi-cash":"billete","bi-shop":"tienda","bi-box-arrow-right":"salir","bi-arrow-right-circle":"flecha-der","bi-arrow-right-short":"flecha-der","bi-arrow-left":"flecha-izq","bi-arrow-return-left":"flecha-izq","bi-exclamation-triangle":"alerta","bi-exclamation-octagon":"alerta","bi-info-circle":"info","bi-lock":"candado","bi-lock-fill":"candado","bi-key":"llave","bi-eye":"ojo","bi-save":"guardar","bi-building":"edificio","bi-percent":"porciento","bi-flag-checkered":"bandera","bi-diagram-3":"nodos","bi-lightbulb":"idea","bi-clock":"reloj","bi-clock-history":"reloj","bi-folder":"carpeta","bi-folder2":"carpeta","bi-qr-code":"qr","bi-qr-code-scan":"qr","bi-shield":"escudo","bi-shield-check":"escudo","bi-shield-lock":"escudo","bi-upload":"subir","bi-cloud-upload":"subir","bi-download":"descargar","bi-search":"buscar","bi-funnel":"filtro","bi-x":"equis","bi-x-lg":"equis","bi-list":"menu","bi-house":"casa","bi-house-door":"casa","bi-wallet":"billetera","bi-wallet2":"billetera","bi-table":"tabla","bi-arrow-repeat":"sincronizar","bi-arrow-clockwise":"sincronizar","bi-plus":"mas","bi-piggy-bank":"monedas","bi-person-list":"usuarios","bi-person-badge":"tarjeta-id","bi-pen":"lapiz","bi-magic":"idea","bi-kanban":"cuadricula","bi-journal-check":"doc-check","bi-gear-wide-connected":"ajustes","bi-filetype-pdf":"doc","bi-file-plus":"doc","bi-clipboard":"doc","bi-file-earmark-spreadsheet":"tabla","bi-cloud-download":"descargar","bi-calendar-lock":"calendario","bi-box-arrow-up-right":"flecha-der","bi-arrow-left-right":"intercambio","bi-unlock":"candado","bi-arrow-up-circle":"flecha-arriba-circulo","bi-arrow-down-circle":"flecha-abajo-circulo","bi-arrow-left-circle":"flecha-izq-circulo","bi-arrow-right":"flecha-der"};
  var OFICIALES = {
    "ajustes": {"icono": "409-wrench", "src": "https://cdn.lordicon.com/fvkvwmsp.json", "pagina": "https://lordicon.com/icons/wired/lineal/409-wrench"},
    "alerta": {"icono": "1140-warning-triangle", "src": "https://cdn.lordicon.com/pilfbsjh.json", "pagina": "https://lordicon.com/icons/wired/lineal/1140-warning-triangle"},
    "ayuda": {"icono": "475-lifebuoy", "src": "https://cdn.lordicon.com/mvklskkc.json", "pagina": "https://lordicon.com/icons/wired/lineal/475-lifebuoy"},
    "banco": {"icono": "403-bank", "src": "https://cdn.lordicon.com/ylscktzo.json", "pagina": "https://lordicon.com/icons/wired/lineal/403-bank"},
    "billete": {"icono": "290-coin", "src": "https://cdn.lordicon.com/cukgelaw.json", "pagina": "https://lordicon.com/icons/wired/lineal/290-coin"},
    "buscar": {"icono": "19-magnifier", "src": "https://cdn.lordicon.com/iuvnsegf.json", "pagina": "https://lordicon.com/icons/wired/lineal/19-magnifier"},
    "carpeta": {"icono": "120-folder", "src": "https://cdn.lordicon.com/lzsupfwm.json", "pagina": "https://lordicon.com/icons/wired/lineal/120-folder"},
    "casa": {"icono": "63-home", "src": "https://cdn.lordicon.com/pgirtdfe.json", "pagina": "https://lordicon.com/icons/wired/lineal/63-home"},
    "check": {"icono": "37-check", "src": "https://cdn.lordicon.com/pxixoqxa.json", "pagina": "https://lordicon.com/icons/wired/lineal/37-check"},
    "doc": {"icono": "56-file-text", "src": "https://cdn.lordicon.com/tbabdzcy.json", "pagina": "https://lordicon.com/icons/wired/lineal/56-file-text"},
    "edificio": {"icono": "1713-buildings-downtown", "src": "https://cdn.lordicon.com/hyvuvsxh.json", "pagina": "https://lordicon.com/icons/wired/lineal/1713-buildings-downtown"},
    "escudo": {"icono": "966-file-policy", "src": "https://cdn.lordicon.com/yseqjcer.json", "pagina": "https://lordicon.com/icons/wired/lineal/966-file-policy"},
    "flecha-der": {"icono": "3380-arrows-right", "src": "https://cdn.lordicon.com/mfsbdaxh.json", "pagina": "https://lordicon.com/icons/wired/lineal/3380-arrows-right"},
    "flecha-izq": {"icono": "3381-arrows-left", "src": "https://cdn.lordicon.com/zxeehkox.json", "pagina": "https://lordicon.com/icons/wired/lineal/3381-arrows-left"},
    "grafico": {"icono": "153-bar-chart-vertical-grow", "src": "https://cdn.lordicon.com/fcwmlcjj.json", "pagina": "https://lordicon.com/icons/wired/lineal/153-bar-chart-vertical-grow"},
    "intercambio": {"icono": "220-arrows-right-left", "src": "https://cdn.lordicon.com/cddatbnq.json", "pagina": "https://lordicon.com/icons/wired/lineal/220-arrows-right-left"},
    "lapiz": {"icono": "35-pencil", "src": "https://cdn.lordicon.com/cbtlerlm.json", "pagina": "https://lordicon.com/icons/wired/lineal/35-pencil"},
    "libro": {"icono": "112-book-bookmark", "src": "https://cdn.lordicon.com/zbtbhzsg.json", "pagina": "https://lordicon.com/icons/wired/lineal/112-book-bookmark"},
    "maletin": {"icono": "187-briefcase", "src": "https://cdn.lordicon.com/obyhgzls.json", "pagina": "https://lordicon.com/icons/wired/lineal/187-briefcase"},
    "mas-circulo": {"icono": "49-plus-circle", "src": "https://cdn.lordicon.com/ueoydrft.json", "pagina": "https://lordicon.com/icons/wired/lineal/49-plus-circle"},
    "monedas": {"icono": "298-coins", "src": "https://cdn.lordicon.com/kkdnopsh.json", "pagina": "https://lordicon.com/icons/wired/lineal/298-coins"},
    "ojo": {"icono": "69-eye", "src": "https://cdn.lordicon.com/knitbwfa.json", "pagina": "https://lordicon.com/icons/wired/lineal/69-eye"},
    "papelera": {"icono": "185-trash-bin", "src": "https://cdn.lordicon.com/sxhqklqh.json", "pagina": "https://lordicon.com/icons/wired/lineal/185-trash-bin"},
    "qr": {"icono": "1335-qr-code", "src": "https://cdn.lordicon.com/vxnxofpy.json", "pagina": "https://lordicon.com/icons/wired/lineal/1335-qr-code"},
    "reloj": {"icono": "45-clock", "src": "https://cdn.lordicon.com/gdowkrjt.json", "pagina": "https://lordicon.com/icons/wired/lineal/45-clock"},
    "salir": {"icono": "1725-person-exit", "src": "https://cdn.lordicon.com/txuhvtae.json", "pagina": "https://lordicon.com/icons/wired/lineal/1725-person-exit"},
    "sincronizar": {"icono": "212-four-arrows-rotate", "src": "https://cdn.lordicon.com/veoztjjj.json", "pagina": "https://lordicon.com/icons/wired/lineal/212-four-arrows-rotate"},
    "tendencia": {"icono": "948-stock-market", "src": "https://cdn.lordicon.com/jwmqentq.json", "pagina": "https://lordicon.com/icons/wired/lineal/948-stock-market"},
    "tienda": {"icono": "139-shopping-basket", "src": "https://cdn.lordicon.com/xktzfwru.json", "pagina": "https://lordicon.com/icons/wired/lineal/139-shopping-basket"},
    "usuario": {"icono": "21-avatar", "src": "https://cdn.lordicon.com/hhljfoaj.json", "pagina": "https://lordicon.com/icons/wired/lineal/21-avatar"},
    "usuarios": {"icono": "981-avatars-chatting", "src": "https://cdn.lordicon.com/xvmmqwjv.json", "pagina": "https://lordicon.com/icons/wired/lineal/981-avatars-chatting"}
  };
  var CSS = "\n.icono-anim{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:0 0 auto;color:inherit;vertical-align:-7px}\n.icono-anim svg{width:100%;height:100%;display:block;overflow:visible}\n.icono-anim .tr{stroke-dasharray:100;stroke-dashoffset:0}\n.nav-link .icono-anim{width:22px;height:22px;vertical-align:-6px}\nh5 .icono-anim,.h5 .icono-anim{width:28px;height:28px}\nh6 .icono-anim,.h6 .icono-anim,.card-title .icono-anim{width:23px;height:23px}\n.btn .icono-anim{width:19px;height:19px;vertical-align:-5px}\n.btn-sm .icono-anim{width:17px;height:17px}\n.badge .icono-anim{width:14px;height:14px;vertical-align:-3px}\n.module-kpi .icono-anim{width:26px;height:26px}\n#loginContainer .icono-anim.bi-shop svg{width:36px;height:36px}\n#loginContainer .icono-anim.bi-shop{width:36px;height:36px}\n.icono-anim lord-icon{width:100%;height:100%;display:block}\n@keyframes iaTrazo{from{stroke-dashoffset:100}to{stroke-dashoffset:0}}\n@keyframes iaSalto{0%{transform:translateY(0)}40%{transform:translateY(-1.6px)}100%{transform:translateY(0)}}\nbutton:hover .icono-anim .tr,a:hover .icono-anim .tr,.nav-link:hover .icono-anim .tr,label:hover .icono-anim .tr,.icono-anim:hover .tr{animation:iaTrazo .6s ease both;animation-delay:var(--d,0s)}\nbutton:hover .icono-anim svg,a:hover .icono-anim svg,.nav-link:hover .icono-anim svg,.icono-anim:hover svg{animation:iaSalto .5s ease}\n.icono-anim.bucle .tr{animation:iaTrazoBucle 3.4s ease-in-out infinite;animation-delay:var(--d,0s)}\n@keyframes iaTrazoBucle{0%{stroke-dashoffset:100}42%,100%{stroke-dashoffset:0}}\n@media print{.icono-anim .tr{animation:none!important;stroke-dashoffset:0!important}.icono-anim svg{animation:none!important}}\n@media (prefers-reduced-motion:reduce){.icono-anim .tr,.icono-anim svg{animation:none!important}}\n";

  function inyectarCSS() {
    try {
      if (document.getElementById('icono-anim-css')) return;
      var st = document.createElement('style');
      st.id = 'icono-anim-css';
      st.textContent = CSS;
      (document.head || document.documentElement).appendChild(st);
    } catch (e) {}
  }

  function svgDe(nombre) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONOS[nombre] + '</svg>';
  }

  /* ---------- montaje dibujado (respaldo local, sin red) ---------- */
  function montarDibujado(el) {
    try {
      var n = el.getAttribute('data-icono');
      if (!n || !ICONOS[n]) return;
      el.innerHTML = svgDe(n);
      el.setAttribute('data-modo', 'dibujado');
      var hijos = el.querySelectorAll('.tr');
      for (var i = 0; i < hijos.length; i++) {
        hijos[i].style.setProperty('--d', (i * 55) + 'ms');
      }
    } catch (e) {}
  }

  /* ---------- montaje OFICIAL Lordicon ---------- */
  var estadoPlayer = 'pendiente'; /* pendiente | listo | fallo */

  function montarOficial(el) {
    try {
      var n = el.getAttribute('data-icono');
      var of = n && OFICIALES[n];
      if (!of) return;
      var li = document.createElement('lord-icon');
      li.setAttribute('src', of.src);
      li.setAttribute('trigger', el.classList && el.classList.contains('bucle') ? 'loop' : 'hover');
      el.innerHTML = '';
      el.appendChild(li);
      el.setAttribute('data-modo', 'oficial');
      /* Si el JSON no llega o no renderiza en 4 s, vuelve el dibujado:
         el hueco nunca se queda vacío ni con un hueco roto. */
      setTimeout(function () {
        try {
          if (el.getAttribute('data-modo') !== 'oficial') return;
          if (!li.querySelector('svg')) montarDibujado(el);
        } catch (e) {}
      }, 4000);
    } catch (e) {
      try { montarDibujado(el); } catch (e2) {}
    }
  }

  function mejorarMontados() {
    try {
      var spans = document.querySelectorAll('.icono-anim[data-icono][data-modo="dibujado"]');
      for (var i = 0; i < spans.length; i++) {
        if (OFICIALES[spans[i].getAttribute('data-icono')]) montarOficial(spans[i]);
      }
    } catch (e) {}
  }

  function cargarReproductor() {
    try {
      if (window.customElements && customElements.get('lord-icon')) {
        estadoPlayer = 'listo';
        mejorarMontados();
        return;
      }
      var s = document.createElement('script');
      s.src = 'https://cdn.lordicon.com/lordicon.js';
      s.async = true;
      var avisar = function () {
        try {
          if (window.customElements && customElements.get('lord-icon')) {
            if (estadoPlayer !== 'listo') { estadoPlayer = 'listo'; mejorarMontados(); }
          }
        } catch (e) {}
      };
      s.onload = function () {
        avisar();
        var t = 0;
        var iv = setInterval(function () {
          t += 150;
          avisar();
          if (estadoPlayer === 'listo' || t >= 2400) clearInterval(iv);
        }, 150);
      };
      s.onerror = function () { if (estadoPlayer === 'pendiente') estadoPlayer = 'fallo'; };
      setTimeout(function () {
        if (estadoPlayer === 'pendiente') estadoPlayer = 'fallo';
      }, 4000);
      (document.head || document.documentElement).appendChild(s);
    } catch (e) { estadoPlayer = 'fallo'; }
  }

  function montar(el) {
    try {
      if (!el || el.getAttribute('data-listo')) return;
      var n = el.getAttribute('data-icono');
      if (!n || !ICONOS[n]) return;
      el.setAttribute('data-listo', '1');
      if (OFICIALES[n] && estadoPlayer === 'listo') montarOficial(el);
      else montarDibujado(el);
    } catch (e) {}
  }

  function nombreDesdeBi(el) {
    var nombre = null;
    try {
      var cls = (el.getAttribute('class') || '').split(/\s+/);
      for (var i = 0; i < cls.length; i++) {
        if (MAPA_BI[cls[i]]) { nombre = MAPA_BI[cls[i]]; break; }
      }
    } catch (e) {}
    return nombre;
  }

  function potable(el) {
    try {
      if (!el || el.nodeType !== 1) return false;
      if (el.id) return false; /* con id: posible gancho de JS */
      if (el.classList && el.classList.contains('theme-icon')) return false; /* el toggle de tema cambia la clase en vivo */
      if (el.closest && el.closest('.docof,.sc406,#printHeader')) return false; /* documentos oficiales: intocables */
      return true;
    } catch (e) { return false; }
  }

  function convertir(el) {
    try {
      if (!potable(el)) return;
      var nombre = nombreDesdeBi(el);
      if (!nombre || !ICONOS[nombre]) return;
      var s = document.createElement('span');
      var conservar = [];
      var cls = (el.getAttribute('class') || '').split(/\s+/);
      for (var i = 0; i < cls.length; i++) {
        var c = cls[i];
        if (/^(me|ms|mt|mb)-/.test(c) || c === 'text-danger' || c === 'text-success' || c === 'text-primary' || c === 'text-secondary' || c === 'text-warning' || /^fs-/.test(c)) conservar.push(c);
      }
      s.className = ('icono-anim ' + conservar.join(' ')).trim();
      var st = el.getAttribute('style');
      if (st) s.setAttribute('style', st);
      s.setAttribute('data-icono', nombre);
      el.replaceWith(s);
      montar(s);
    } catch (e) {}
  }

  function barrer(raiz) {
    try {
      var r = raiz && raiz.querySelectorAll ? raiz : document;
      var spans = r.querySelectorAll('.icono-anim[data-icono]');
      for (var i = 0; i < spans.length; i++) montar(spans[i]);
      var viejos = r.querySelectorAll('i.bi');
      for (var j = 0; j < viejos.length; j++) convertir(viejos[j]);
    } catch (e) {}
  }

  var pendiente = false;
  function programarBarrido() {
    if (pendiente) return;
    pendiente = true;
    var cb = function () { pendiente = false; barrer(document); };
    if (window.requestAnimationFrame) requestAnimationFrame(cb); else setTimeout(cb, 60);
  }

  function iniciar() {
    inyectarCSS();
    barrer(document);
    cargarReproductor();
    try {
      var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          if (muts[i].addedNodes && muts[i].addedNodes.length) { programarBarrido(); return; }
        }
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
  window.__iconosAnimListos = true;
})();
