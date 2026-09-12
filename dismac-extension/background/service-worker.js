const SHEETS_CONFIG = {
  talleres: {
    id: '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
    sheetName: 'RED%20DE%20TALLERES'
  },
  seguimiento: {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'REPORTE%20GLOBAL'
  },
  adicionales: {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'REPORTE%20GLOBAL%20ADICIONALES'
  },
  encuesta: {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'nps%20por%20regional'
  },
  usuarios: {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'Usuarios_App'
  },
  transporte: {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'TRANSPORTE'
  }
};

const GARANTIA_DIAS_DEFAULT = 365;
const GARANTIA_DIAS_POR_MARCA = {};
const GARANTIA_DIAS_POR_TIPO = [
  {
    dias: 730,
    keywords: ['sony'],
    require: ['tv', 'televisor', 'bravia'],
    exclude: []
  },
  {
    dias: 730,
    keywords: [
      'lavadora', 'secadora', 'torre de lavado', 'lavavajilla',
      'refrigerador', 'refrigeradora', 'freezer', 'frio seco', 'frio convencional',
      'cocina', 'encimera', 'horno', 'microondas', 'campana', 'extractora',
      'aire acondicionado', 'split', 'btu', 'termotanque', 'calefon'
    ],
    exclude: ['cabello', 'pelo', 'oster']
  }
];

function diasGarantia(producto) {
  if (!producto) return GARANTIA_DIAS_DEFAULT;
  const p = producto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const key of Object.keys(GARANTIA_DIAS_POR_MARCA)) {
    if (p.includes(key.toUpperCase())) return GARANTIA_DIAS_POR_MARCA[key];
  }
  for (const rango of GARANTIA_DIAS_POR_TIPO) {
    const excluido = rango.exclude && rango.exclude.some(x => new RegExp(`\\b${x}\\b`, 'i').test(p));
    if (excluido) continue;
    const match = rango.keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p));
    if (!match) continue;
    if (rango.require && !rango.require.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p))) continue;
    return rango.dias;
  }
  return GARANTIA_DIAS_DEFAULT;
}

function parseFecha(str) {
  if (!str) return null;
  const s = str.toString().trim();
  let m;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function diasDesde(fechaStr) {
  const f = parseFecha(fechaStr);
  if (!f) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return Math.floor((hoy - f) / 86400000);
}

function diasEntre(fecha1Str, fecha2Str) {
  const f1 = parseFecha(fecha1Str);
  const f2 = parseFecha(fecha2Str);
  if (!f1 || !f2) return null;
  return Math.floor(Math.abs(f2 - f1) / 86400000);
}

function getWarrantyInfo(o) {
  const fechaCompra = o['Fecha de compra'] || "";
  const f = parseFecha(fechaCompra);
  if (!f) return { status: 'sin_datos', daysRemaining: null, fechaCompra };
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const vence = new Date(f);
  vence.setDate(vence.getDate() + diasGarantia(o['Producto ST']));
  const daysRemaining = Math.floor((vence - hoy) / 86400000);
  if (daysRemaining < 0) return { status: 'vencida', daysRemaining, fechaCompra };
  if (daysRemaining <= 30) return { status: 'por_vencer', daysRemaining, fechaCompra };
  return { status: 'en_garantia', daysRemaining, fechaCompra };
}

function normalizarTexto(str) {
  return (str || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function isOrderInRegion(o, region) {
  if (!o || !region) return false;
  const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
  if (region === 'Municipios') return municipios.some(m => terr.includes(m));
  if (region === 'Regionales') {
    const excluidas = ['santa cruz', 'el alto', 'cochabamba', 'la paz', 'achocalla'];
    if (excluidas.some(x => terr.includes(x))) return false;
    return true;
  }
  if (region === 'Santa Cruz') {
    const isMunicipio = municipios.some(m => terr.includes(m));
    return terr.includes('santa cruz') && !isMunicipio;
  }
  const regionNormalized = region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return terr.includes(regionNormalized);
}

function parseAllData(workshopData, globalData, adicionalesData) {
  let parsedWorkshopData = [];
  let parsedOrdersData = [];
  let currentCity = "";

  parsedWorkshopData = workshopData.map(row => {
    const getVal = (row, ...keys) => {
      const rowKeys = Object.keys(row);
      for (const key of keys) {
        const exactKey = rowKeys.find(k => k.trim().toUpperCase() === key.toUpperCase());
        if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null) {
          return row[exactKey].toString().trim();
        }
      }
      return "";
    };
    const ciudad = getVal(row, 'CIUDAD', 'Ciudad', 'ciudad');
    const taller = getVal(row, 'TALLER', 'Taller', 'taller');
    const marca = getVal(row, 'MARCA', 'Marca', 'marca');
    let contacto = getVal(row, 'CONTACTO', 'Contacto', 'contacto', 'CONTACTOS', 'CELULAR', 'TELEFONO');
    if (!contacto) {
      const rowKeys = Object.keys(row);
      const contactKey = rowKeys.find(k => k.toUpperCase().includes('CONTACTO') || k.toUpperCase().includes('TEL') || k.toUpperCase().includes('CEL'));
      if (contactKey && row[contactKey]) {
        contacto = row[contactKey].toString().trim();
      }
    }
    if (taller && taller.toUpperCase().includes("ELECTRONICA DIGITAL JKA") && !contacto) {
      contacto = "60263531 - 60264988";
    }
    if (taller && taller.toUpperCase().includes("FRIO GAS") && !contacto) {
      contacto = "69308611 - 75501753";
    }
    const ubicacion = getVal(row, 'UBICACIÓN POR GPS', 'Ubicación', 'UBICACION', 'UBICACIÓN GPS');
    if (ciudad !== "") currentCity = ciudad;
    return { ...row, CIUDAD: currentCity, TALLER: taller, MARCA: marca, CONTACTO: contacto, UBICACION: ubicacion };
  }).filter(t => t.TALLER && t.TALLER.trim() !== "");

  let adicionalesMap = new Map();
  if (adicionalesData && adicionalesData.length > 0) {
    adicionalesData.forEach(item => {
      const ref = (item.Referencia || '').toString().trim().toUpperCase();
      if (ref) adicionalesMap.set(ref, item);
    });
  }

  parsedOrdersData = globalData.map(o => {
    const mainTidy = (o['Referencia'] || '').toString().trim().toUpperCase();
    let resultOrder = { ...o };
    if (mainTidy && adicionalesMap.has(mainTidy)) {
      const adic = adicionalesMap.get(mainTidy);
      resultOrder = {
        ...resultOrder,
        adicTelefono: adic['Teléfono'] || adic['Telefono'] || "",
        adicCuenta: adic['Cuenta: Nombre de la cuenta'] || adic['Cuenta'] || "",
        adicTecnico: adic['Técnico'] || adic['Tecnico'] || adic['tecnico'] || "",
        adicDetalleFalla: adic['Detalle de falla'] || "",
        adicDetalleSolucion: adic['Detalle de solución'] || adic['Detalle de solucion'] || "",
        adicObservaciones: adic['Observaciones técnico'] || adic['Observaciones tecnico'] || "",
        adicComentarios: adic['Comentarios'] || "",
        adicFechaCita: adic['Fecha Cita'] || "",
        adicEstadoCita: adic['Estado Cita'] || "",
        adicSubEstadoCita: adic['Sub Estado Cita'] || "",
        adicionalesEnriched: true
      };
    }
    return resultOrder;
  });

  return { parsedWorkshopData, parsedOrdersData };
}

async function fetchGoogleSheet(id, sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
  const csvText = await res.text();
  return new Promise((resolve, reject) => {
    const rows = [];
    const lines = csvText.split('\n');
    if (lines.length < 2) return resolve([]);
    const headers = parseCSVLine(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const vals = parseCSVLine(lines[i]);
      const obj = {};
      headers.forEach((h, idx) => { obj[h.trim()] = (vals[idx] || '').trim(); });
      rows.push(obj);
    }
    resolve(rows);
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { current += c; }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { result.push(current); current = ''; }
      else { current += c; }
    }
  }
  result.push(current);
  return result;
}

async function syncAllData() {
  console.log('[Dismac Assist] Syncing data from Google Sheets...');
  try {
    const [workshopData, globalData, adicionalesData, encuestaData] = await Promise.all([
      fetchGoogleSheet(SHEETS_CONFIG.talleres.id, SHEETS_CONFIG.talleres.sheetName),
      fetchGoogleSheet(SHEETS_CONFIG.seguimiento.id, SHEETS_CONFIG.seguimiento.sheetName),
      fetchGoogleSheet(SHEETS_CONFIG.adicionales.id, SHEETS_CONFIG.adicionales.sheetName).catch(() => []),
      fetchGoogleSheet(SHEETS_CONFIG.encuesta.id, SHEETS_CONFIG.encuesta.sheetName).catch(() => [])
    ]);

    const parsed = parseAllData(workshopData, globalData, adicionalesData);

    await chrome.storage.local.set({
      talleres: parsed.parsedWorkshopData,
      ordenes: parsed.parsedOrdersData,
      encuestas: encuestaData,
      lastSync: new Date().toISOString(),
      syncStatus: 'ok'
    });

    console.log(`[Dismac Assist] Sync OK: ${parsed.parsedWorkshopData.length} talleres, ${parsed.parsedOrdersData.length} órdenes`);

    chrome.runtime.sendMessage({
      type: 'SYNC_COMPLETE',
      talleres: parsed.parsedWorkshopData.length,
      ordenes: parsed.parsedOrdersData.length
    }).catch(() => {});
  } catch (error) {
    console.error('[Dismac Assist] Sync error:', error);
    await chrome.storage.local.set({ syncStatus: 'error', lastSync: new Date().toISOString() });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('[Dismac Assist] Extension installed');
  syncAllData();
  chrome.alarms.create('syncData', { periodInMinutes: 5 });
});

chrome.runtime.onStartup.addListener(() => {
  syncAllData();
  chrome.alarms.create('syncData', { periodInMinutes: 5 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncData') {
    syncAllData();
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'REQUEST_SYNC') {
    syncAllData().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message.type === 'GET_DATA') {
    chrome.storage.local.get(['talleres', 'ordenes', 'encuestas', 'lastSync', 'syncStatus'], (data) => {
      sendResponse(data);
    });
    return true;
  }

  if (message.type === 'FIND_ORDER') {
    const odt = message.odt;
    const odtClean = odt.replace(/^TD-/i, '').trim();
    const odtWithPrefix = 'TD-' + odtClean;
    console.log('[Dismac Assist] Buscando ODT:', odt, '| Limpio:', odtClean, '| Con prefijo:', odtWithPrefix);
    chrome.storage.local.get(['ordenes'], (data) => {
      const ordenes = data.ordenes || [];
      console.log('[Dismac Assist] Total ordenes en storage:', ordenes.length);
      const found = ordenes.filter(o => {
        const numOdt = (o['Número de orden de trabajo'] || '').toString().trim();
        const ref = (o['Referencia'] || '').toString().trim();
        const refClean = ref.replace(/^TD-/i, '').trim();
        return numOdt === odt || ref === odt || ref === odtWithPrefix || refClean === odtClean;
      });
      console.log('[Dismac Assist] Encontradas:', found.length);
      sendResponse({ found, total: ordenes.length });
    });
    return true;
  }

  if (message.type === 'FIND_WORKSHOP') {
    const workshopName = message.name;
    chrome.storage.local.get(['talleres'], (data) => {
      const talleres = data.talleres || [];
      const nameUpper = workshopName.toUpperCase();
      const found = talleres.filter(t => {
        const tName = (t.TALLER || '').toUpperCase();
        const tClean = tName.replace(/^ST\s+/, '');
        return tName === nameUpper || tClean === nameUpper ||
               tName.includes(nameUpper) || nameUpper.includes(tClean);
      });
      sendResponse({ found });
    });
    return true;
  }

  if (message.type === 'GET_ORDER_BY_TIDYWORK_ID') {
    const tidyworkId = message.tidyworkId;
    const idClean = tidyworkId.replace(/^TD-/i, '').trim();
    const idWithPrefix = 'TD-' + idClean;
    chrome.storage.local.get(['ordenes'], (data) => {
      const ordenes = data.ordenes || [];
      const found = ordenes.filter(o => {
        const ref = (o['Referencia'] || '').toString().trim();
        const numOdt = (o['Número de orden de trabajo'] || '').toString().trim();
        const refClean = ref.replace(/^TD-/i, '').trim();
        return ref === tidyworkId || ref === idWithPrefix || refClean === idClean || numOdt === tidyworkId;
      });
      sendResponse({ found });
    });
    return true;
  }

  if (message.type === 'GET_STATS') {
    chrome.storage.local.get(['talleres', 'ordenes', 'encuestas'], (data) => {
      const ordenes = data.ordenes || [];
      const estadosExcluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
      const activas = ordenes.filter(o => {
        const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return !estadosExcluidos.some(ex => e.includes(ex));
      });
      const estancadas = activas.filter(o => {
        const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
        const diasMod = diasDesde(o['Fecha de la última modificación']);
        return (diasMod !== null && diasMod >= 4) || diasCreacion >= 8;
      });
      sendResponse({
        talleres: (data.talleres || []).length,
        ordenes: ordenes.length,
        activas: activas.length,
        estancadas: estancadas.length,
        encuestas: (data.encuestas || []).length
      });
    });
    return true;
  }

  if (message.type === 'SAVE_APPOINTMENT') {
    const apt = message.appointment;
    if (!apt || !apt.odt) { sendResponse({ ok: false }); return true; }
    chrome.storage.local.get(['citas'], (data) => {
      const citas = data.citas || [];
      const key = apt.odt + '|' + (apt.estadoCita || apt.estado || '');
      const existIdx = citas.findIndex(c => (c.odt + '|' + (c.estadoCita || c.estado || '')) === key);
      if (existIdx >= 0) {
        citas[existIdx] = { ...citas[existIdx], ...apt, updatedAt: new Date().toISOString() };
      } else {
        citas.push({ ...apt, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      }
      chrome.storage.local.set({ citas }, () => {
        console.log('[Dismac Assist] Cita guardada:', apt.odt, apt.estadoCita);
        sendResponse({ ok: true, total: citas.length });
      });
    });
    return true;
  }

  if (message.type === 'GET_CITAS') {
    chrome.storage.local.get(['citas'], (data) => {
      sendResponse({ citas: data.citas || [] });
    });
    return true;
  }
});
