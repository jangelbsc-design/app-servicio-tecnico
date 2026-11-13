/**
 * DISMAC · Alta de talleres desde la app
 * --------------------------------------
 * Script VINCULADO a la hoja de cálculo (Extensiones → Apps Script).
 * Recibe un POST de la PWA y agrega una fila al final de "RED DE TALLERES".
 *
 * Antes de publicar:
 *   1. Cambiar TOKEN por una clave propia (la misma que se escribe en la app).
 *   2. Implementar → Nueva implementación → Aplicación web
 *        · Ejecutar como: Yo
 *        · Quién tiene acceso: Cualquier persona
 *   3. Copiar la URL que termina en /exec.
 *
 * El detalle de los pasos está en apps-script/README.md.
 */

var CONFIG = {
  TOKEN: 'CAMBIA-ESTA-CLAVE',
  HOJA: 'RED DE TALLERES',
  LOG: 'LOG AGREGADOS',
  COLS: 5,
  MAX: { ciudad: 80, taller: 140, marca: 400, contacto: 140, gps: 600, usuario: 120 }
};

// GET sirve para comprobar desde el navegador que el Web App está publicado.
function doGet() {
  return responder_({ ok: true, servicio: 'agregar-taller', version: 1 });
}

function doPost(e) {
  try {
    var body;
    try {
      body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    } catch (err) {
      return responder_({ ok: false, error: 'json_invalido' });
    }

    if (String(body.token || '') !== String(CONFIG.TOKEN)) {
      return responder_({ ok: false, error: 'clave_invalida' });
    }

    var ciudad = limpiar_(body.ciudad, CONFIG.MAX.ciudad).toUpperCase();
    var taller = limpiar_(body.taller, CONFIG.MAX.taller);
    var marca = limpiar_(body.marca, CONFIG.MAX.marca);
    var contacto = limpiar_(body.contacto, CONFIG.MAX.contacto);
    var gps = limpiar_(body.gps, CONFIG.MAX.gps);
    var usuario = limpiar_(body.usuario, CONFIG.MAX.usuario);

    if (!ciudad) return responder_({ ok: false, error: 'falta_ciudad' });
    if (!taller) return responder_({ ok: false, error: 'falta_taller' });
    if (!contacto && !gps) return responder_({ ok: false, error: 'sin_contacto' });

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return responder_({ ok: false, error: 'ocupado' });

    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var hoja = ss.getSheetByName(CONFIG.HOJA);
      if (!hoja) return responder_({ ok: false, error: 'hoja_no_encontrada' });

      var dup = buscarDuplicado_(hoja, ciudad, taller);
      if (dup) {
        return responder_({
          ok: false, error: 'duplicado',
          fila: dup.fila, ciudad: dup.ciudad, taller: dup.taller
        });
      }

      // Math.max evita pisar el encabezado si la hoja estuviera vacía.
      var fila = Math.max(hoja.getLastRow() + 1, 2);
      hoja.getRange(fila, 1, 1, CONFIG.COLS)
        .setNumberFormat('@') // texto: conserva ceros y evita fórmulas accidentales
        .setValues([[ciudad, taller, contacto, marca, gps]]);
      SpreadsheetApp.flush();

      registrar_(ss, usuario, ciudad, taller, fila);

      return responder_({ ok: true, fila: fila, ciudad: ciudad, taller: taller });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return responder_({
      ok: false, error: 'error_interno',
      detalle: String((err && err.message) || err)
    });
  }
}

// Compara nombre + ciudad normalizados (sin tildes, mayúsculas ni signos).
// La ciudad se arrastra hacia abajo porque la hoja deja celdas vacías
// para las filas que pertenecen a la misma ciudad.
function buscarDuplicado_(hoja, ciudad, taller) {
  var ultima = hoja.getLastRow();
  if (ultima < 2) return null;

  var datos = hoja.getRange(2, 1, ultima - 1, 2).getValues();
  var ciudadActual = '';
  var buscada = norm_(taller) + '|' + norm_(ciudad);

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][0] || '').trim()) ciudadActual = String(datos[i][0]).trim();
    var nombre = norm_(datos[i][1]);
    if (nombre && (nombre + '|' + norm_(ciudadActual)) === buscada) {
      return { fila: i + 2, ciudad: ciudadActual, taller: String(datos[i][1]) };
    }
  }
  return null;
}

// Auditoría opcional: quién agregó qué. Si falla, no rompe la carga.
function registrar_(ss, usuario, ciudad, taller, fila) {
  try {
    var log = ss.getSheetByName(CONFIG.LOG);
    if (!log) {
      log = ss.insertSheet(CONFIG.LOG);
      log.appendRow(['FECHA', 'USUARIO', 'CIUDAD', 'TALLER', 'FILA']);
      log.getRange(1, 1, 1, 5).setFontWeight('bold');
      log.setFrozenRows(1);
    }
    log.appendRow([new Date(), usuario || '—', ciudad, taller, fila]);
  } catch (err) {
    // El log es opcional.
  }
}

function limpiar_(valor, max) {
  var s = String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  return max ? s.slice(0, max) : s;
}

function norm_(valor) {
  return String(valor == null ? '' : valor)
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, '');
}

function responder_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
