(function() {
  'use strict';

  var LIVE_PREFIX = '[Dismac Assist][Live]';
  var ENUM_APPOINTMENT_STATUS = {
    1: 'NINGUNO', 2: 'PROGRAMADO', 3: 'ENVIADO', 4: 'EN_CAMINO',
    5: 'EN_CURSO', 6: 'NO_SE_PUEDE_COMPLETAR', 7: 'COMPLETADO',
    8: 'CANCELADO', 9: 'ERROR'
  };
  var lastRefreshAt = 0;
  var shownShape = {};

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function getXSRFToken() {
    var meta = document.querySelector('meta[name="x-xsrf-token"]');
    if (meta && meta.getAttribute('content')) return meta.getAttribute('content');
    var parts = document.cookie.split('; ');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf('.AspNetCore.Antiforgery.') === 0) {
        return decodeURIComponent(parts[i].substring(parts[i].indexOf('=') + 1));
      }
    }
    return '';
  }

  function toForm(obj) {
    return Object.keys(obj).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(obj[k]);
    }).join('&');
  }

  async function tidyFetch(url, options) {
    var opts = options || {};
    var headers = { 'Tidy-Fetch': 'true', 'X-XSRF-TOKEN': getXSRFToken() };
    if (opts.body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    var res;
    try {
      res = await fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body || null,
        credentials: 'include'
      });
    } catch (e) {
      console.warn(LIVE_PREFIX, 'Fetch fallo:', url, e && e.message);
      return { ok: false, error: 0, json: null };
    }
    var text = await res.text();
    var json = null;
    try { json = JSON.parse(text); } catch (e) {}
    if (json && (json.Errors || []).some(function(er) { return er.ErrorCode === 401; })) {
      console.warn(LIVE_PREFIX, 'Sesion expirada (401 interno) en', url);
      return { ok: false, error: 401, json: null };
    }
    return { ok: res.ok, json: json };
  }

  function pick(row, names) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return '';
    var rk = Object.keys(row);
    for (var i = 0; i < names.length; i++) {
      var want = names[i];
      for (var j = 0; j < rk.length; j++) {
        if (norm(rk[j]) === want) return String(row[rk[j]] || '').trim();
      }
    }
    for (var k = 0; k < names.length; k++) {
      var w = names[k];
      for (var m = 0; m < rk.length; m++) {
        if (norm(rk[m]).indexOf(w) !== -1) return String(row[rk[m]] || '').trim();
      }
    }
    return '';
  }

  function logShape(tag, data) {
    if (shownShape[tag]) return;
    shownShape[tag] = true;
    var sample = data;
    if (Array.isArray(data)) sample = data[0];
    console.log(LIVE_PREFIX, 'Forma respuesta [' + tag + ']:', sample);
  }

  function makeCita(parts) {
    return {
      odt: parts.odt || '',
      cliente: parts.cliente || '',
      producto: parts.producto || '',
      marca: parts.marca || '',
      direccion: parts.direccion || '',
      servicioTecnico: parts.servicioTecnico || '',
      tecnico: parts.tecnico || '',
      fechaCita: parts.fechaCita || '',
      estadoCita: parts.estadoCita || '',
      subEstadoCita: parts.subEstadoCita || '',
      estado: parts.estado || '',
      contacto: parts.contacto || '',
      contactoCel: parts.contactoCel || '',
      fuente: parts.fuente || 'live'
    };
  }

  function readDataTableHeaders() {
    var table = document.querySelector('table.dataTable');
    if (!table) return [];
    var ths = table.querySelectorAll('thead th');
    var headers = [];
    for (var i = 0; i < ths.length; i++) headers.push(norm(ths[i].textContent));
    return headers;
  }

  function normalizeFilterRow(row, headers) {
    var fixed = [1, 2, 3, 4, 5, 6, 7, 8];
    var odtIdx = 1, tipoIdx = 2, estadoIdx = 3, subIdx = 4, tecIdx = 5, cliIdx = 6, docIdx = 7, ciuIdx = 8;
    if (headers && headers.length > 0) {
      var idx = function(keys, fallback) {
        for (var i = 0; i < headers.length; i++) {
          for (var j = 0; j < keys.length; j++) {
            if (headers[i].indexOf(keys[j]) !== -1) return i;
          }
        }
        return fallback;
      };
      odtIdx = idx(['nrotrabajo', 'nroorden', 'nrotrabajodetrabajo'], 1);
      tipoIdx = idx(['tipo'], 2);
      estadoIdx = idx(['estado'], 3);
      subIdx = idx(['subestado'], 4);
      tecIdx = idx(['tecnico'], 5);
      cliIdx = idx(['cliente'], 6);
      docIdx = idx(['documento', 'nrodocumento'], 7);
      ciuIdx = idx(['ciudad'], 8);
    }
    var cell = function(i) {
      return (row[i] === undefined || row[i] === null) ? '' : String(row[i]).trim();
    };
    if (Array.isArray(row)) {
      var estadoCita = cell(estadoIdx);
      return makeCita({
        odt: cell(odtIdx),
        producto: cell(tipoIdx),
        estadoCita: estadoCita,
        subEstadoCita: cell(subIdx),
        servicioTecnico: cell(tecIdx),
        tecnico: cell(tecIdx),
        cliente: cell(cliIdx),
        contacto: cell(docIdx),
        direccion: cell(ciuIdx),
        estado: estadoCita
      });
    }
    return makeCita({
      odt: pick(row, ['nrotrabajo', 'nroorden', 'nrotrabajodetrabajo', 'orden']),
      producto: pick(row, ['tipodeservicio', 'tipo', 'producto']),
      estadoCita: pick(row, ['estadocita', 'estado']),
      subEstadoCita: pick(row, ['subestadocita', 'subestado']),
      servicioTecnico: pick(row, ['serviciotecnico', 'taller', 'tecnico']),
      tecnico: pick(row, ['tecnico', 'technical']),
      cliente: pick(row, ['clientenombre', 'cuentanombredelacuenta', 'cliente', 'customer']),
      contacto: pick(row, ['documento', 'nrodocumento', 'celular', 'contacto']),
      direccion: pick(row, ['ciudad', 'territorioservicio', 'municipio', 'address']),
      estado: pick(row, ['estado', 'status']),
      fechaCita: pick(row, ['fechacita', 'fechaprogramada', 'start', 'startdate'])
    });
  }

  function logStructure(json, tag) {
    if (!json || typeof json !== 'object') return;
    var brief = {};
    Object.keys(json).forEach(function(k) {
      var v = json[k];
      brief[k] = Array.isArray(v) ? 'arr(' + v.length + ')' : (v && typeof v === 'object' ? 'obj' : typeof v);
    });
    console.log(LIVE_PREFIX, 'Estructura [' + tag + ']:', JSON.stringify(brief));
    Object.keys(json).forEach(function(k) {
      var v = json[k];
      var sample = '';
      if (Array.isArray(v) && v.length) sample = JSON.stringify(v[0]);
      else if (v && typeof v === 'object' && !Array.isArray(v)) sample = JSON.stringify(v);
      if (sample) console.log(LIVE_PREFIX, '[' + tag + '][' + k + '] ejemplo:', sample.slice(0, 600));
    });
  }

  function findDataArray(json) {
    if (!json || typeof json !== 'object') return null;
    var order = ['data', 'aaData', 'rows', 'Data', 'Result', 'result', 'records', 'list', 'items', 'Appoiments', 'appointments', 'Appointments'];
    for (var i = 0; i < order.length; i++) {
      var v = json[order[i]];
      if (Array.isArray(v) && v.length > 0) return v;
      if (v && typeof v === 'object' && Array.isArray(v.data)) return v.data;
      if (v && typeof v === 'object' && Array.isArray(v.aaData)) return v.aaData;
    }
    var found = Object.keys(json).filter(function(k) {
      return Array.isArray(json[k]) && json[k].length > 0;
    });
    return found.length > 0 ? json[found[0]] : null;
  }

  function extractCitasFromFilterJson(json) {
    if (!json) { console.warn(LIVE_PREFIX, 'Appointment/Filter: json vacio'); return []; }
    logStructure(json, 'Filter');
    var data = findDataArray(json);
    if (!data) {
      console.warn(LIVE_PREFIX, 'Appointment/Filter: sin arreglo reconocible, claves:', Object.keys(json).join(', '));
      ['Data', 'Object', 'Result'].forEach(function(k) {
        var v = json[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          console.log(LIVE_PREFIX, 'Appointment/Filter[' + k + '] claves internas:', Object.keys(v).join(', '));
          var s = JSON.stringify(v);
          if (s) console.log(LIVE_PREFIX, 'Appointment/Filter[' + k + '] muestra:', s.slice(0, 500));
        }
      });
      return [];
    }
    var headers = readDataTableHeaders();
    logShape('Appointment/Filter.data', data[0]);
    var citas = [];
    for (var i = 0; i < data.length; i++) {
      var c = normalizeFilterRow(data[i], headers);
      if (c.odt) citas.push(c);
    }
    return citas;
  }

  async function getAllTerritoryIds() {
    var r = await tidyFetch(location.origin + '/WorkOrder/GetTerritorys', {
      method: 'POST',
      body: toForm({ territoryId: 1 })
    });
    if (!r.ok || !r.json) return [];
    var data = r.json.Data || r.json.data || [];
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) {}
    }
    if (!Array.isArray(data)) return [];
    return data.map(function(t) { return t.Id !== undefined && t.Id !== null ? t.Id : t.id; })
      .filter(function(id) { return id !== undefined && id !== null; });
  }

  async function fetchAppointmentsFromApi() {
    var hoy = new Date();
    var from = new Date(hoy);
    from.setDate(from.getDate() - 7);
    var to = new Date(hoy);
    to.setDate(to.getDate() + 30);

    var yyyymmdd = function(d) {
      return d.getFullYear() + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0');
    };
    var ddmmYYYY = function(d) {
      return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    };

    var territoryIds = await getAllTerritoryIds();
    console.log(LIVE_PREFIX, 'Territorios obtenidos:', territoryIds.length);

    function parseErrors(json) {
      var errs = [];
      if (!json) return errs;
      if (Array.isArray(json.Errors)) {
        json.Errors.forEach(function(e) {
          if (!e) return;
          var d = e.Description || e.Message || e.ErrorMessage;
          if (d) errs.push({ Description: d, ErrorCode: e.ErrorCode });
          else if (typeof e === 'string' && e) errs.push({ Description: e });
        });
      }
      if (json.Error && typeof json.Error === 'object') {
        var ed = json.Error.Description || json.Error.Message || json.Error.ErrorMessage;
        if (ed) errs.push({ Description: ed });
      }
      if (typeof json.ErrosAll === 'string' && json.ErrosAll) errs.push({ Description: json.ErrosAll });
      return errs;
    }

    var attempts = [
      { name: 'yyyy/MM/dd', f: yyyymmdd },
      { name: 'dd/MM/yyyy', f: ddmmYYYY }
    ];

    for (var i = 0; i < attempts.length; i++) {
      var attempt = attempts[i];
      var filter = {
        TerritoryId: JSON.stringify(territoryIds),
        WokTypeIds: JSON.stringify([]),
        Technicals: JSON.stringify([]),
        StatusIds: JSON.stringify([]),
        StartDate: attempt.f(from),
        EndDate: attempt.f(to),
        Coment: 'NONE'
      };

      var r = await tidyFetch(location.origin + '/Appointment/Filter', {
        method: 'POST',
        body: toForm({ filter: JSON.stringify(filter) })
      });
      console.log(LIVE_PREFIX, 'Appointment/Filter[' + attempt.name + '] -> ok=' + r.ok, 'error=' + (r.error || 0));

      if (!r.ok || !r.json) {
        console.warn(LIVE_PREFIX, 'Appointment/Filter no respondio ok:', r);
        continue;
      }

      var errs = parseErrors(r.json);
      var hasOverflow = errs.some(function(e) {
        var d = (e && (e.Description || e.Message)) || '';
        return typeof d === 'string' && d.toLowerCase().indexOf('overflow') !== -1;
      });
      if (hasOverflow) {
        console.warn(LIVE_PREFIX, 'Appointment/Filter[' + attempt.name + '] overflow de fecha, probando otro formato');
        continue;
      }
      if (r.json.Success === false) {
        console.warn(LIVE_PREFIX, 'Appointment/Filter[' + attempt.name + '] Success=false:', errs.map(function(e) { return (e && e.Description) || JSON.stringify(e); }).join(' | '));
        continue;
      }
      if (errs.length) {
        console.log(LIVE_PREFIX, 'Appointment/Filter[' + attempt.name + '] errores NO bloqueantes (Success!=false):', errs.map(function(e) { return (e && e.Description) || JSON.stringify(e); }).join(' | '));
      }

      var citas = extractCitasFromFilterJson(r.json);
      if (citas.length > 0) {
        console.log(LIVE_PREFIX, 'Appointment/Filter[' + attempt.name + '] citas:', citas.length);
        return citas;
      }
      console.log(LIVE_PREFIX, 'Appointment/Filter[' + attempt.name + '] ok pero 0 filas');
    }
    return [];
  }

  function normalizeControlAppointment(item) {
    var raw = item || {};
    var statusId = pick(raw, ['statusid']) || pick(raw, ['status']);
    var statusName = ENUM_APPOINTMENT_STATUS[statusId] || pick(raw, ['statusname', 'estado']) || '';
    return makeCita({
      odt: pick(raw, ['nrotrabajo', 'nroorden', 'workorder', 'workorderid', 'id']) || pick(raw, ['nro']),
      cliente: pick(raw, ['clientenombre', 'cuenta', 'cliente', 'customer']),
      producto: pick(raw, ['producto', 'tipo']),
      direccion: pick(raw, ['ciudad', 'municipio', 'address', 'direccion']),
      servicioTecnico: pick(raw, ['serviciotecnico', 'taller', 'tecnico']),
      tecnico: pick(raw, ['tecnico', 'technical', 'technicalname']),
      fechaCita: pick(raw, ['startdate', 'start', 'fechacita', 'appointmentdate']),
      estadoCita: statusName,
      estado: statusName,
      subEstadoCita: pick(raw, ['subestado']),
      contacto: pick(raw, ['celular', 'contacto', 'documento'])
    });
  }

  async function fetchControlFromApi() {
    var hoy = new Date();
    var from = new Date(hoy);
    from.setDate(from.getDate() - 1);
    var to = new Date(hoy);
    to.setDate(to.getDate() + 7);

    var fmt = function(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + ' 00:00:00';
    };

    var params = {
      StartDate: fmt(from),
      EndDate: fmt(to)
    };

    var qs = Object.keys(params).map(function(k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
    }).join('&');

    var r = await tidyFetch(location.origin + '/Control/GetEvents?' + qs);
    if (!r.ok || !r.json) {
      console.warn(LIVE_PREFIX, 'Control/GetEvents no respondio ok:', r);
      return [];
    }
    var json = r.json;
    var list = json.Appoiments || json.appoiments || json.Appointments || json.data || json;
    var raw = Array.isArray(list) ? list : (list && list.rows) || [];
    logShape('Control/GetEvents', raw);
    var citas = [];
    for (var i = 0; i < raw.length; i++) {
      var c = normalizeControlAppointment(raw[i]);
      if (c.odt) citas.push(c);
    }
    return citas;
  }

  async function upsertCitas(citas) {
    if (!citas || citas.length === 0) return;
    return new Promise(function(resolve) {
      chrome.storage.local.get(['citas'], function(data) {
        var existing = data.citas || [];
        var map = {};
        existing.forEach(function(c) {
          var key = String(c.odt) + '|' + (c.estadoCita || c.estado || '');
          map[key] = c;
        });
        var added = 0, updated = 0;
        citas.forEach(function(c) {
          var key = String(c.odt) + '|' + (c.estadoCita || c.estado || '');
          c.updatedAt = new Date().toISOString();
          if (map[key]) {
            c.createdAt = map[key].createdAt;
            map[key] = { ...map[key], ...c };
            updated++;
          } else {
            c.createdAt = c.createdAt || new Date().toISOString();
            map[key] = c;
            added++;
          }
        });
        var merged = Object.keys(map).map(function(k) { return map[k]; });
        chrome.storage.local.set({ citas: merged }, function() {
          console.log(LIVE_PREFIX, 'Citas sync: ' + added + ' nuevas, ' + updated + ' actualizadas (total ' + merged.length + ')');
          resolve({ added: added, updated: updated, total: merged.length });
        });
      });
    });
  }

  function notifySidepanel(stats) {
    chrome.runtime.sendMessage({
      type: 'CITAS_LIVE_UPDATED',
      stats: stats
    }).catch(function() {});
  }

  function syncAppointmentsFromDom() {
    var tables = document.querySelectorAll('table.dataTable');
    var citas = [];
    tables.forEach(function(table) {
      var headers = [];
      var ths = table.querySelectorAll('thead th');
      for (var i = 0; i < ths.length; i++) headers.push(norm(ths[i].textContent));
      var rows = table.querySelectorAll('tbody tr');
      rows.forEach(function(row) {
        var cells = row.querySelectorAll('td');
        if (cells.length < 9) return;
        var arrayRow = [];
        for (var c = 0; c < cells.length; c++) arrayRow.push(cells[c].textContent.trim());
        var cita = normalizeFilterRow(arrayRow, headers);
        if (cita.odt) citas.push(cita);
      });
    });
    return citas;
  }

  function updateLiveBadge(text) {
    var host = document.getElementById('dismac-assist-panel');
    if (!host) return;
    var el = document.getElementById('dismac-live-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dismac-live-badge';
      el.style.cssText = 'font-size:0.62rem;color:#94a3b8;padding:4px 10px 2px;';
      host.appendChild(el);
    }
    el.textContent = text;
  }

  function saveLiveStatus(stats) {
    chrome.storage.local.set({ liveStatus: { ...stats, at: new Date().toISOString() } }, function() {
      var msg = 'Live: ' + (stats.total || 0) + ' citas (' + (stats.source || '?') + ')';
      updateLiveBadge(msg);
    });
  }

  async function refreshLive(kind) {
    var now = Date.now();
    if (now - lastRefreshAt < 2000) return;
    lastRefreshAt = now;

    var citas = [];
    var source = 'none';
    if (kind === 'api') {
      citas = await fetchAppointmentsFromApi();
      source = citas.length > 0 ? 'api' : 'none';
      if (citas.length === 0) {
        var dom = syncAppointmentsFromDom();
        if (dom.length > 0) {
          citas = dom;
          source = 'dom';
        }
      }
    } else if (kind === 'control') {
      var controlCitas = await fetchControlFromApi();
      if (controlCitas.length === 0) controlCitas = syncAppointmentsFromDom();
      citas = controlCitas;
      source = controlCitas.length > 0 ? 'api' : 'none';
    } else {
      citas = syncAppointmentsFromDom();
      source = 'dom';
    }

    if (citas.length === 0) {
      console.log(LIVE_PREFIX, 'Sin citas para sincronizar (source=' + source + ')');
      saveLiveStatus({ total: 0, source: source, message: 'Sin citas' });
      return;
    }
    var stats = await upsertCitas(citas);
    saveLiveStatus({ ...stats, source: source });
    notifySidepanel({ ...stats, source: source, page: location.pathname });
  }

  function pageKind() {
    var p = location.pathname.toLowerCase();
    if (p.indexOf('/appointment') === 0) return 'appointment';
    if (p.indexOf('/control') === 0) return 'control';
    return 'other';
  }

  function triggerRefresh() {
    var kind = pageKind();
    if (kind === 'appointment') refreshLive('api');
    else if (kind === 'control') refreshLive('control');
  }

  function installFetchWatcher() {
    if (window.__dismacTidyLiveInstalled) return;
    window.__dismacTidyLiveInstalled = true;
    var script = document.createElement('script');
    script.id = 'dismac-tidy-live-watcher';
    script.src = chrome.runtime.getURL('content/fetch-watcher.js');
    (document.head || document.documentElement).appendChild(script);
  }

  window.addEventListener('message', function(ev) {
    if (ev.source !== window || !ev.data || ev.data.src !== 'dismac-tidy-live') return;
    console.log(LIVE_PREFIX, 'Cambio detectado en TidyWork:', ev.data.url, 'status=' + ev.data.status);
    triggerRefresh();
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && pageKind() !== 'other') triggerRefresh();
  });

  var lastUrl = location.href;
  function watchUrl() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      if (pageKind() !== 'other') triggerRefresh();
    }
  }
  setInterval(watchUrl, 1500);

  setTimeout(function() {
    console.log(LIVE_PREFIX, 'Cargado. Ruta:', location.pathname, '| Pagina:', pageKind(), '| Token XSRF:', getXSRFToken() ? 'SI' : 'NO');
    installFetchWatcher();
    if (pageKind() !== 'other') triggerRefresh();
  }, 2500);

  setInterval(function() {
    if (document.visibilityState === 'visible' && pageKind() !== 'other') refreshLive(pageKind() === 'control' ? 'control' : 'api');
  }, 60000);
})();