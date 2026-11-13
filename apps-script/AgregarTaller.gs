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
  LOG_CAMBIOS: 'LOG CAMBIOS',
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

    var accion = limpiar_(body.accion, 20).toLowerCase() || 'crear';
    var ciudad = limpiar_(body.ciudad, CONFIG.MAX.ciudad).toUpperCase();
    var taller = limpiar_(body.taller, CONFIG.MAX.taller);
    var marca = limpiar_(body.marca, CONFIG.MAX.marca);
    var contacto = limpiar_(body.contacto, CONFIG.MAX.contacto);
    var gps = limpiar_(body.gps, CONFIG.MAX.gps);
    var usuario = limpiar_(body.usuario, CONFIG.MAX.usuario);

    if (!ciudad) return responder_({ ok: false, error: 'falta_ciudad' });
    if (!taller) return responder_({ ok: false, error: 'falta_taller' });
    if (accion !== 'actualizar' && !contacto && !gps) {
      return responder_({ ok: false, error: 'sin_contacto' });
    }

    var lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return responder_({ ok: false, error: 'ocupado' });

    try {
      var ss = SpreadsheetApp.getActiveSpreadsheet();
      var hoja = ss.getSheetByName(CONFIG.HOJA);
      if (!hoja) return responder_({ ok: false, error: 'hoja_no_encontrada' });

      // Actualizar un taller existente: agrega la marca y/o corrige contacto/GPS.
      if (accion === 'actualizar') {
        return actualizar_(ss, hoja, {
          ciudad: ciudad,
          taller: taller,
          marca: marca,
          contacto: body.contacto === undefined ? null : contacto,
          gps: body.gps === undefined ? null : gps,
          usuario: usuario
        });
      }

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

// Actualiza una fila existente. No crea talleres nuevos.
function actualizar_(ss, hoja, datos) {
  var actual = buscarFila_(hoja, datos.ciudad, datos.taller);
  if (!actual) {
    return responder_({
      ok: false, error: 'no_encontrado',
      ciudad: datos.ciudad, taller: datos.taller
    });
  }

  var marcaFinal = actual.marca;
  var marcaDuplicada = false;
  var detalle = [];

  if (datos.marca) {
    marcaFinal = agregarMarca_(actual.marca, datos.marca);
    if (norm_(marcaFinal) === norm_(actual.marca)) {
      marcaDuplicada = true;
    } else {
      detalle.push('Marca: ' + (actual.marca || '(vacía)') + ' → ' + marcaFinal);
    }
  }

  var contactoFinal = datos.contacto === null ? actual.contacto : datos.contacto;
  var gpsFinal = datos.gps === null ? actual.gps : datos.gps;

  if (contactoFinal !== actual.contacto) {
    detalle.push('Contacto: ' + (actual.contacto || '(vacío)') + ' → ' + (contactoFinal || '(vacío)'));
  }
  if (gpsFinal !== actual.gps) {
    detalle.push('GPS: ' + (actual.gps || '(vacío)') + ' → ' + (gpsFinal || '(vacío)'));
  }

  if (!detalle.length) {
    return responder_({
      ok: true, accion: 'actualizar', sinCambios: true,
      marcaDuplicada: marcaDuplicada,
      fila: actual.fila, ciudad: actual.ciudad, taller: actual.taller,
      marca: actual.marca, contacto: actual.contacto, gps: actual.gps
    });
  }

  if (norm_(marcaFinal) !== norm_(actual.marca)) {
    hoja.getRange(actual.fila, 4).setNumberFormat('@').setValue(marcaFinal);
  }
  if (contactoFinal !== actual.contacto) {
    hoja.getRange(actual.fila, 3).setNumberFormat('@').setValue(contactoFinal);
  }
  if (gpsFinal !== actual.gps) {
    hoja.getRange(actual.fila, 5).setNumberFormat('@').setValue(gpsFinal);
  }
  SpreadsheetApp.flush();

  registrarCambio_(ss, datos.usuario, actual.ciudad, actual.taller, actual.fila, detalle.join(' | '));

  return responder_({
    ok: true, accion: 'actualizar',
    fila: actual.fila, ciudad: actual.ciudad, taller: actual.taller,
    marca: marcaFinal, contacto: contactoFinal, gps: gpsFinal,
    marcaDuplicada: marcaDuplicada
  });
}

// Suma una marca a la lista existente, sin repetirla (comparación normalizada).
function agregarMarca_(actual, nueva) {
  var partes = String(actual || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean);

  var existe = partes.some(function (p) { return norm_(p) === norm_(nueva); });
  if (!existe) partes.push(String(nueva).trim());

  return partes.join(', ');
}

// Busca una fila por taller + ciudad y devuelve también sus datos actuales.
// La ciudad se arrastra hacia abajo porque la hoja deja celdas vacías
// para las filas que pertenecen a la misma ciudad.
function buscarFila_(hoja, ciudad, taller) {
  var ultima = hoja.getLastRow();
  if (ultima < 2) return null;

  var datos = hoja.getRange(2, 1, ultima - 1, CONFIG.COLS).getValues();
  var ciudadActual = '';
  var buscada = norm_(taller) + '|' + norm_(ciudad);

  for (var i = 0; i < datos.length; i++) {
    if (String(datos[i][0] || '').trim()) ciudadActual = String(datos[i][0]).trim();
    var nombre = norm_(datos[i][1]);
    if (nombre && (nombre + '|' + norm_(ciudadActual)) === buscada) {
      return {
        fila: i + 2,
        ciudad: ciudadActual,
        taller: String(datos[i][1] || ''),
        contacto: String(datos[i][2] == null ? '' : datos[i][2]),
        marca: String(datos[i][3] == null ? '' : datos[i][3]),
        gps: String(datos[i][4] == null ? '' : datos[i][4])
      };
    }
  }
  return null;
}

function buscarDuplicado_(hoja, ciudad, taller) {
  var encontrado = buscarFila_(hoja, ciudad, taller);
  return encontrado
    ? { fila: encontrado.fila, ciudad: encontrado.ciudad, taller: encontrado.taller }
    : null;
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

// Auditoría de cambios: quién agregó una marca o corrigió datos.
// Si falla, no rompe la actualización.
function registrarCambio_(ss, usuario, ciudad, taller, fila, detalle) {
  try {
    var log = ss.getSheetByName(CONFIG.LOG_CAMBIOS);
    if (!log) {
      log = ss.insertSheet(CONFIG.LOG_CAMBIOS);
      log.appendRow(['FECHA', 'USUARIO', 'CIUDAD', 'TALLER', 'FILA', 'CAMBIO']);
      log.getRange(1, 1, 1, 6).setFontWeight('bold');
      log.setFrozenRows(1);
    }
    log.appendRow([new Date(), usuario || '—', ciudad, taller, fila, detalle]);
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
