// El gid es obligatorio para leer con /export (ver fetchSheetCsv): Google
// cachea /gviz durante horas y deja las hojas desactualizadas.
const USERS_SHEET_CONFIG = {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'Usuarios_App',
    gid: '932622720'
};

const SHEETS_CONFIG = {
    talleres: {
        id: '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
        sheetName: 'RED%20DE%20TALLERES',
        gid: '0'
    },
    seguimiento: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'REPORTE%20GLOBAL',
        gid: '0'
    },
    // zapia removed
    adicionales: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'REPORTE%20GLOBAL%20ADICIONALES',
        gid: '1801135280'
    },
    encuesta: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'nps%20por%20regional',
        gid: '1279258090'
    },
    transporte: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'TRANSPORTE',
        gid: '669612858'
    }
};

// Alta de talleres desde la app (Web App de Apps Script, ver apps-script/README.md).
// La URL /exec y la clave se piden una vez y quedan en este dispositivo.
// Si se deja endpoint vacío, cada administrador lo pega la primera vez.
const AGREGAR_TALLER_CONFIG = {
    endpoint: '',
    storageKey: 'dismatec_agregar_taller_v1'
};

// Municipios de Santa Cruz: agrupación usada por la vista "Municipios (SCZ)".
const MUNICIPIOS_SCZ = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata', 'buena vista', 'la angostura', 'yapacani'];

// Regionales que además supervisan los municipios de Santa Cruz (acuerdo interno).
const REGIONALES_CON_MUNICIPIOS = ['tarija', 'sucre'];

// La regla de escalamiento exige una falla confirmada (columna "Detalle de falla" de ADICIONALES).
// Poner en false para volver al criterio anterior (solo los 30 días compra -> inicio).
const ESCALAMIENTO_REQUIERE_FALLA = true;

// Reglas numéricas compartidas (antes repetidas en 4-8 lugares distintos).
const ESTADOS_FINALES = ['cancelado', 'error', 'entregado', 'cerrado'];
const DIAS_SIN_CAMBIOS_ALERTA = 4;
const DIAS_APERTURA_ALERTA = 8;
const DIAS_ESCALAMIENTO_MAX = 30;

// Lectura de Google Sheets: corte por intento y reintentos.
const FETCH_TIMEOUT_MS = 12000;
const FETCH_REINTENTOS = 1;

// Respaldo local del último volcado, para poder ver la app sin conexión.
const CACHE_DATOS_KEY = 'dismatec_datos_cache_v1';

// Normaliza rol y regional: minúsculas, sin acentos y sin espacios sobrantes
// (así "Regional", "REGIONAL" o "Súcre" se comparan igual).
function normalizarRol(valor) {
    return (valor || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Trazas de diagnóstico: en la consola del navegador, ejecutar  DEBUG_APP = true  para verlas.
let DEBUG_APP = false;
const debugLog = (...args) => { if (DEBUG_APP) console.log(...args); };

// Utilidad debounce para buscadores
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

// Descarga el CSV crudo de una hoja.
// Se usa /export?format=csv&gid=... porque /gviz/tq sirve una copia cacheada
// por Google durante horas (eso dejaba talleres sin teléfono aunque la hoja ya
// los tuviera). Si no hay gid o /export falla, se intenta /gviz como respaldo.
function urlExportHoja(id, gid) {
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function urlGvizHoja(id, sheet) {
    return `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
}

async function fetchSheetCsv(id, sheet, gid) {
    const urls = [];
    if (gid !== undefined && gid !== null && gid !== '') urls.push(urlExportHoja(id, gid));
    urls.push(urlGvizHoja(id, sheet));

    let ultimoError = null;
    for (const url of urls) {
        for (let intento = 0; intento <= FETCH_REINTENTOS; intento++) {
            const controlador = new AbortController();
            const temporizador = setTimeout(() => controlador.abort(), FETCH_TIMEOUT_MS);
            try {
                const res = await fetch(url, { signal: controlador.signal, cache: 'no-store' });
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const texto = await res.text();
                if (!texto || !texto.trim()) throw new Error('La hoja devolvió una respuesta vacía');
                const limpio = texto.replace(/^\uFEFF/, '');
                // Si Google responde una página de error/login en vez del CSV,
                // se descarta y se prueba la siguiente URL.
                if (limpio.trim().startsWith('<')) throw new Error('La hoja devolvió HTML en vez de CSV');
                return limpio;
            } catch (err) {
                ultimoError = err;
                debugLog(`Fallo al leer la hoja "${sheet}" (intento ${intento + 1}):`, err);
            } finally {
                clearTimeout(temporizador);
            }
        }
    }
    throw ultimoError || new Error(`No se pudo leer la hoja "${sheet}"`);
}

// PapaParse en modo sincrónico: el CSV ya está descargado.
function parseCsvLocal(csvText) {
    if (!csvText) return [];
    const res = window.Papa.parse(csvText, { header: true, skipEmptyLines: true });
    return res && res.data ? res.data : [];
}

async function fetchGoogleSheet(id, sheet, gid) {
    return parseCsvLocal(await fetchSheetCsv(id, sheet, gid));
}
            
// ── Respaldo local del volcado (permite ver la app sin conexión) ────────────
function leerRespaldoDatos() {
    try {
        const crudo = localStorage.getItem(CACHE_DATOS_KEY);
        if (!crudo) return null;
        const datos = JSON.parse(crudo);
        if (!datos || !datos.csv) return null;
        return datos;
    } catch (err) {
        console.warn('El respaldo local está ilegible, se ignora:', err);
        return null;
    }
}

function guardarRespaldoDatos(csvPorHoja) {
    try {
        localStorage.setItem(CACHE_DATOS_KEY, JSON.stringify({ v: 1, ts: Date.now(), csv: csvPorHoja }));
    } catch (err) {
        // Si no hay espacio, la app sigue funcionando: solo no habrá respaldo.
        console.warn('No se pudo guardar el respaldo local:', err);
    }
}

function fechaHoraLegible(ts) {
    try {
        return new Date(ts).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (err) {
        return '';
    }
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Igual que escapeHTML pero también escapa comillas: para interpolar en atributos.
function escapeAttr(str) {
    return escapeHTML(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function mesValido(mes) {
    return mes >= 1 && mes <= 12;
}

function diaValido(dia) {
    return dia >= 1 && dia <= 31;
}

function parseFecha(str) {
    if (!str) return null;
    const s = str.toString().trim();
    let m;
    // dd/mm/aaaa y dd-mm/aaaa (formato de las hojas). Se valida el mes para no
    // "rodar" fechas mal ordenadas tipo 12/22/2025 y poder reintentar el resto.
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m && mesValido(+m[2]) && diaValido(+m[1])) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m && mesValido(+m[2]) && diaValido(+m[3])) return new Date(+m[1], +m[2] - 1, +m[3]);
    // Último recurso: lo que interprete el navegador (p. ej. 12/22/2025 en formato US).
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

// Configuración de garantía (días).
const GARANTIA_DIAS_DEFAULT = 365;

// Garantía por marca (prioridad máxima). Ej.: 'CAMPANA X': 365
const GARANTIA_DIAS_POR_MARCA = {};

// Línea blanca: 2 años (730 días). Clasificación por tipo de producto.
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

function warrantyBadgeHtml(o) {
    const info = getWarrantyInfo(o);
    if (info.status === 'sin_datos') return '';
    const style = {
        en_garantia: { bg: '#dcfce7', color: '#166534', icon: 'bi-patch-check-fill', text: 'Garantía', title: `En garantía · vence en ${info.daysRemaining} días` },
        por_vencer:  { bg: '#fef3c7', color: '#b45309', icon: 'bi-exclamation-triangle-fill', text: `Vence ${info.daysRemaining}d`, title: `La garantía vence en ${info.daysRemaining} días` },
        vencida:     { bg: '#fee2e2', color: '#b91c1c', icon: 'bi-x-circle-fill', text: 'Vencida', title: 'Garantía vencida' }
    }[info.status];
    return `<span title="${style.title}" style="display:inline-flex; align-items:center; gap:4px; background:${style.bg}; color:${style.color}; padding:4px 10px; border-radius:12px; font-size:0.68rem; font-weight:700; white-space:nowrap;"><i class="bi ${style.icon}"></i> ${style.text}</span>`;
}

function warrantyDetailHtml(o) {
    const info = getWarrantyInfo(o);
    if (info.status === 'sin_datos') {
        return '<p style="margin:0;"><strong>Garantía:</strong> <span style="color:#94a3b8;">Sin fecha de compra para evaluar</span></p>';
    }
    const total = diasGarantia(o['Producto ST']);
    const vence = new Date(parseFecha(info.fechaCompra));
    vence.setDate(vence.getDate() + total);
    const venceStr = vence.toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    if (info.status === 'en_garantia') {
        return `<p style="margin:0;"><strong>Garantía:</strong> <span style="color:#166534;">✓ En garantía hasta ${venceStr} (${info.daysRemaining} días restantes)</span></p>`;
    }
    if (info.status === 'por_vencer') {
        return `<p style="margin:0;"><strong>Garantía:</strong> <span style="color:#b45309;">⚠ Vence en ${info.daysRemaining} días (hasta ${venceStr})</span></p>`;
    }
    return `<p style="margin:0;"><strong>Garantía:</strong> <span style="color:#b91c1c;">✗ Vencida desde ${venceStr}</span></p>`;
}

function parseAllData(workshopData, globalData, adicionalesData) {
    let parsedWorkshopData = [];
    let parsedOrdersData = [];

    // Parseo de Talleres
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

        // Los números pueden venir en CONTACTO o en columnas alternativas
        // ("CONTACTO 2", "CELULAR", "TELÉFONO"...). Se juntan todas las que
        // tengan valor: antes se tomaba la primera columna que coincidía por
        // nombre aunque estuviera vacía y se perdían los demás números.
        let contacto = getVal(row, 'CONTACTO', 'Contacto', 'contacto', 'CONTACTOS', 'CELULAR', 'TELEFONO');
        const contactosExtra = [];
        Object.keys(row).forEach((k) => {
            const nombre = k.toUpperCase();
            if (!(nombre.includes('CONTACTO') || nombre.includes('TEL') || nombre.includes('CEL'))) return;
            const valor = (row[k] || '').toString().trim();
            if (valor && valor !== contacto && !contactosExtra.includes(valor)) contactosExtra.push(valor);
        });
        if (contactosExtra.length) {
            contacto = [contacto, ...contactosExtra].filter(Boolean).join(' - ');
        }

        if (taller && taller.toUpperCase().includes("ELECTRONICA DIGITAL JKA") && !contacto) {
            contacto = "60263531 - 60264988";
        }

        if (taller && taller.toUpperCase().includes("FRIO GAS") && !contacto) {
            contacto = "69308611 - 75501753";
        }

        const ubicacion = getVal(row, 'UBICACIÓN POR GPS', 'Ubicación', 'UBICACION', 'UBICACIÓN GPS');

        if (ciudad !== "") {
            currentCity = ciudad;
        }

        return {
            ...row,
            CIUDAD: currentCity,
            TALLER: taller,
            MARCA: marca,
            CONTACTO: contacto,
            UBICACION: ubicacion
        };
    }).filter(t => t.TALLER && t.TALLER.trim() !== "");

    // Mapeo de Adicionales
    let adicionalesMap = new Map();
    if (adicionalesData && adicionalesData.length > 0) {
        adicionalesData.forEach(item => {
            const ref = (item.Referencia || '').toString().trim().toUpperCase();
            if (ref) {
                adicionalesMap.set(ref, item);
            }
        });
    }

    // Cruzar y enriquecer órdenes
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

function parseTransporteData(transporteRaw) {
    if (!transporteRaw || !Array.isArray(transporteRaw)) return [];

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

    return transporteRaw.map(row => {
        const orden = getVal(row, 'Número de orden de trabajo', 'N° orden', 'N° Orden', 'Orden de trabajo', 'Referencia', 'ODT', 'ORDEN', 'NRO ORDEN');
        const cuenta = getVal(row, 'Cuenta: Nombre de la cuenta', 'Cuenta', 'Encargado', 'Cliente', 'Nombre del cliente', 'SOLICITANTE', 'Contacto');
        const producto = getVal(row, 'Producto ST', 'Producto', 'Equipo', 'ACTIVO', 'DESCRIPCION', 'PRODUCTO');
        const territorio = getVal(row, 'Territorio de servicio: Nombre', 'Territorio', 'Regional', 'Origen', 'CIUDAD', 'UBICACION', 'Ciudad');
        const estado = getVal(row, 'Estado', 'ESTADO', 'Estado Orden', 'ESTADO TRASLADO') || 'En Traslado';
        const subEstado = getVal(row, 'Sub_estado', 'Sub Estado', 'Subestado') || '';
        const fechaMod = getVal(row, 'Fecha de la última modificación', 'Fecha modificación', 'Fecha mod', 'Fecha');
        const fechaApertura = getVal(row, 'Fecha de creación', 'Fecha apertura', 'Fecha creación', 'Fecha inicio', 'Fecha Origen');
        const diasAperturaRaw = getVal(row, 'Tiempo desde apertura (Días)', 'Días apertura', 'Días sin movimiento', 'Días');
        const diasApertura = diasAperturaRaw !== "" ? diasAperturaRaw : (fechaApertura ? (diasDesde(fechaApertura) ?? '0') : '0');
        const origen = getVal(row, 'Origen', 'Lugar Origen', 'Tienda Origen', 'Ubicación Origen');
        const destino = getVal(row, 'Destino', 'Lugar Destino', 'ST Destino', 'Tienda Destino');
        const tipoServicio = getVal(row, 'Tipo de Servicio', 'Tipo Servicio') || 'TRANSPORTE';

        return {
            ...row,
            'Número de orden de trabajo': orden || getVal(row, 'Referencia') || 'TR-S/N',
            'Referencia': getVal(row, 'Referencia') || orden || '',
            'Cuenta: Nombre de la cuenta': cuenta || 'ENCARGADO / CLIENTE S/N',
            'Producto ST': producto || 'EQUIPO EN TRASLADO',
            'Territorio de servicio: Nombre': territorio || 'Sin región',
            'Estado': estado,
            'Sub_estado': subEstado,
            'Fecha de la última modificación': fechaMod,
            'Tiempo desde apertura (Días)': diasApertura.toString(),
            'Tipo de Servicio': tipoServicio,
            'Origen': origen,
            'Destino': destino,
            esTransporte: true
        };
    }).filter(o => o['Número de orden de trabajo'] && o['Número de orden de trabajo'].trim() !== '');
}

function checkSessionOnLoad() {
    const sesionActiva = localStorage.getItem('dismatec_session');
    const overlay = document.getElementById('login-overlay');
    const userInp = document.getElementById('login-usuario');
    const passInp = document.getElementById('login-password');
    if (sesionActiva !== 'true') {
        if (overlay) overlay.style.display = 'flex';
        if (userInp) userInp.disabled = false;
        if (passInp) passInp.disabled = false;
    } else {
        if (overlay) overlay.remove();
    }
}
checkSessionOnLoad();

function isAdmin() {
    const rol = normalizarRol(localStorage.getItem('usuario_rol'));
    return rol === 'admin' || rol === 'administrador';
}

async function syncSessionUser() {
    const sesionActiva = localStorage.getItem('dismatec_session');
    const usuarioActual = localStorage.getItem('usuario_actual');
    if (sesionActiva !== 'true' || !usuarioActual) return;
    try {
        const users = await fetchGoogleSheet(USERS_SHEET_CONFIG.id, USERS_SHEET_CONFIG.sheetName, USERS_SHEET_CONFIG.gid);
        const foundUser = users.find(u => u.Usuario === usuarioActual);
        if (foundUser) {
            if (foundUser.Rol) localStorage.setItem('usuario_rol', foundUser.Rol);
            if (foundUser.Regional !== undefined && foundUser.Regional !== null) {
                localStorage.setItem('usuario_regional', foundUser.Regional);
            }
        }
    } catch (err) {
        console.warn('No se pudo sincronizar la sesión con la hoja de usuarios:', err);
    }
}

let appWorkshopData = [];
let appOrdersData = [];
let appTransporteData = [];
let appEncuestaData = [];
let tipoFiltroOrdenes = 'todas';
let estadosCurrentRegion = undefined;
let estadosCurrentOrdenes = null;
let estadosCurrentOpciones = null;
let encuestaCurrentRegion = null;
let encuestaFiltroStatus = 'todas';
// ────────────────────────────────────────────────────────────────────────────

debugLog("🔧 APP.JS CARGADO");

document.addEventListener('DOMContentLoaded', async () => {
    debugLog("✅ DOMContentLoaded DISPARADO");

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = document.getElementById('login-btn');
            if (btn && !btn.disabled) btn.click();
        });
    }

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const user = (document.getElementById('login-usuario')?.value || '').trim();
            const pass = (document.getElementById('login-password')?.value || '').trim();
            const errorEl = document.getElementById('login-error');
            
            if (!user || !pass) {
                errorEl.textContent = "Por favor ingrese usuario y contraseña.";
                errorEl.style.display = 'block';
                return;
            }

            loginBtn.textContent = "Verificando...";
            loginBtn.disabled = true;
            errorEl.style.display = 'none';
            
            try {
                const users = await fetchGoogleSheet(USERS_SHEET_CONFIG.id, USERS_SHEET_CONFIG.sheetName, USERS_SHEET_CONFIG.gid);
                const foundUser = users.find(u => u.Usuario === user && u.Contraseña === pass);
                
                if (foundUser) {
                    localStorage.setItem('dismatec_session', 'true');
                    localStorage.setItem('usuario_actual', foundUser.Usuario);
                    localStorage.setItem('usuario_rol', foundUser.Rol);
                    localStorage.setItem('usuario_regional', foundUser.Regional);
                    
                    const userInp = document.getElementById('login-usuario');
                    const passInp = document.getElementById('login-password');
                    if (userInp) userInp.disabled = true;
                    if (passInp) passInp.disabled = true;

                    const overlay = document.getElementById('login-overlay');
                    if (overlay) overlay.style.display = 'none';
                    location.reload(); 
                } else {
                    errorEl.textContent = "Acceso denegado. Datos incorrectos.";
                    errorEl.style.display = 'block';
                    loginBtn.textContent = "Ingresar";
                    loginBtn.disabled = false;
                }
            } catch (err) {
                console.error("Error logging in:", err);
                errorEl.textContent = "Error de conexión. Intente de nuevo.";
                errorEl.style.display = 'block';
                loginBtn.textContent = "Ingresar";
                loginBtn.disabled = false;
            }
        });
    }

    // Cerrar sesión / cambiar de usuario
    const headerUsuario = document.getElementById('header-usuario');
    if (headerUsuario) headerUsuario.textContent = localStorage.getItem('usuario_actual') || '—';
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            const nombre = localStorage.getItem('usuario_actual') || '';
            if (confirm(`¿Cerrar sesión${nombre ? ' de ' + nombre : ''}? Podrás iniciar sesión con otro usuario.`)) {
                localStorage.removeItem('dismatec_session');
                localStorage.removeItem('usuario_actual');
                localStorage.removeItem('usuario_rol');
                localStorage.removeItem('usuario_regional');
                const userInp = document.getElementById('login-usuario');
                const passInp = document.getElementById('login-password');
                if (userInp) userInp.disabled = false;
                if (passInp) passInp.disabled = false;
                location.reload();
            }
        });
    }

    const viewDashboard = document.getElementById('view-dashboard');
    const viewRedTalleres = document.getElementById('view-red-talleres');
    const viewEstadosMenu = document.getElementById('view-estados-menu');
    const viewEstadosServicio = document.getElementById('view-estados-servicio');
    const viewDetails = document.getElementById('view-details');
    const viewReportes = document.getElementById('view-reportes');
    const viewEncuesta = document.getElementById('view-encuesta');
    const viewEncuestaRegion = document.getElementById('view-encuesta-region');
    const viewEjecutivo = document.getElementById('view-ejecutivo');
    const viewTitle = document.getElementById('view-title');
    const viewContent = document.getElementById('view-content');


    // Elementos de Búsqueda Global
    const globalSearchInput = document.getElementById('global-search-input');
    const globalSearchResults = document.getElementById('global-search-results');
    const dashboardMainGrid = document.getElementById('dashboard-main-grid');
    const dashboardContact = document.getElementById('dashboard-contact');
    const dashboardFaq = document.getElementById('dashboard-faq');

    // Configurar botones de limpieza de búsqueda
    function setupClearSearch(inputId, clearBtnId) {
        const input = document.getElementById(inputId);
        const clearBtn = document.getElementById(clearBtnId);
        
        if (!input || !clearBtn) return;
        
        input.addEventListener('input', () => {
            clearBtn.style.display = input.value.length > 0 ? 'block' : 'none';
        });
        
        clearBtn.addEventListener('click', () => {
            input.value = '';
            clearBtn.style.display = 'none';
            input.dispatchEvent(new Event('input'));
            input.focus();
        });
    }

    setupClearSearch('global-search-input', 'clear-global-search');
    setupClearSearch('estados-search-input', 'clear-estados-search');
    setupClearSearch('workshop-search-input', 'clear-workshop-search');

    // Cargar datos
    // Sincronizar el rol del usuario con la hoja (soporta sesiones antiguas sin rol guardado)
    await syncSessionUser();
    // Mostrar tarjetas solo para administradores (antes de cargar datos)
    const adminEncuestaCard = document.getElementById('admin-encuesta-card');
    if (adminEncuestaCard) adminEncuestaCard.classList.toggle('hidden', !isAdmin());
    document.querySelectorAll('.admin-only').forEach(el => el.classList.toggle('hidden', !isAdmin()));

    debugLog("📥 Cargando datos...");
    await loadAllData();
    debugLog(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);
    renderKPIs();

    // Variables de estado para búsqueda regional
    let currentRegionTalleres = "";
    let filteredTalleres = [];
    let currentRegionOrdenes = "";
    let filteredOrdenes = [];
    let ultimaModFiltro = 'todas';
    let escFiltro = 'todas';
    // Vista a la que regresa el botón "Volver" de #view-details (talleres o protocolo).
    let detailsBackView = null;

    // Buscador Regional de Talleres
    const workshopSearchInput = document.getElementById('workshop-search-input');
    workshopSearchInput?.addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase();
        const regionUpper = currentRegionTalleres.toUpperCase();
        filteredTalleres = appWorkshopData.filter(t =>
            (t.CIUDAD || "").toUpperCase() === regionUpper &&
            ((t.TALLER || "").toLowerCase().includes(query) ||
                (t.MARCA || "").toLowerCase().includes(query) ||
                (t.CIUDAD || "").toLowerCase().includes(query) ||
                (t.CONTACTO || "").toLowerCase().includes(query))
        );
        renderTalleres(currentRegionTalleres, filteredTalleres);
    }, 300));

    // Buscador Regional de Órdenes
    const estadosSearchInput = document.getElementById('estados-search-input');
    estadosSearchInput?.addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase().trim();
        const esUltimaMod = currentRegionOrdenes === 'Última Modificación';
        
        let base;
        if (esUltimaMod) {
            base = (ultimaModFiltro === 'todas' ? appOrdersData : appOrdersData.filter(o => isOrderInRegion(o, ultimaModFiltro)));
        } else {
            const regTarget = currentRegionOrdenes || estadosCurrentRegion || '';
            // Tarija y Sucre incluyen los municipios de Santa Cruz, con o sin texto en el buscador.
            const incluyeMunicipios = regionalIncluyeMunicipios(regTarget);
            base = appOrdersData.filter(o =>
                isOrderInRegion(o, regTarget) || (incluyeMunicipios && isOrderInRegion(o, 'Municipios'))
            );
        }

        filteredOrdenes = base.filter(o =>
            ((o['Número de orden de trabajo'] || "").toLowerCase().includes(query) ||
                (o['Cuenta: Nombre de la cuenta'] || "").toLowerCase().includes(query) ||
                (o['Producto ST'] || "").toLowerCase().includes(query) ||
                (o['Referencia'] || "").toLowerCase().includes(query) ||
                (o['Nro de orden de trabajo (Marca)'] || "").toLowerCase().includes(query) ||
                (o['Nombre del Equipo'] || "").toLowerCase().includes(query) ||
                (o['Tipo de Servicio'] || "").toLowerCase().includes(query) ||
                (o['Tiempo desde apertura (Días)'] || "").toString().toLowerCase().includes(query) ||
                (o['Fecha de compra'] || "").toLowerCase().includes(query) ||
                (o['Fecha de ingreso a la marca'] || "").toLowerCase().includes(query) ||
                (o['¿Qué servicio técnico ?'] || "").toLowerCase().includes(query) ||
                (o['Fecha de la última modificación'] || "").toLowerCase().includes(query) ||
                (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(query) ||
                (o['Estado'] || "").toLowerCase().includes(query) ||
                (o.adicTecnico || "").toLowerCase().includes(query) ||
                (o.adicDetalleFalla || "").toLowerCase().includes(query) ||
                (o.adicObservaciones || "").toLowerCase().includes(query))
        );
        const regionDestino = currentRegionOrdenes || estadosCurrentRegion || 'Órdenes';
        renderOrdenes(regionDestino, filteredOrdenes,
            esUltimaMod ? { ordenarPor: 'modificacion', titulo: 'Órdenes por última modificación' } : (query.length > 0 ? { incluirCompletado: true, queryBusqueda: query } : undefined), 1);
    }, 300));

    // Lógica de Búsqueda Global
    globalSearchInput?.addEventListener('input', debounce((e) => {
        const query = e.target.value.toLowerCase().trim();

        if (query.length === 0) {
            // Restaurar dashboard
            globalSearchResults.classList.add('hidden');
            globalSearchResults.innerHTML = '';
            dashboardMainGrid.classList.remove('hidden');
            dashboardContact.classList.remove('hidden');
            dashboardFaq.classList.remove('hidden');
            return;
        }

        // Ocultar elementos del dashboard
        dashboardMainGrid.classList.add('hidden');
        dashboardContact.classList.add('hidden');
        dashboardFaq.classList.add('hidden');
        globalSearchResults.classList.remove('hidden');

        // Filtrar Talleres
        const matchedTalleres = appWorkshopData.filter(t =>
            (t.TALLER || "").toLowerCase().includes(query) ||
            (t.MARCA || "").toLowerCase().includes(query) ||
            (t.CIUDAD || "").toLowerCase().includes(query) ||
            (t.CONTACTO || "").toLowerCase().includes(query)
        );

        // Filtrar Órdenes (respetando datos permitidos por rol regional y criterio del buscador)
        const baseOrdenesData = dataFiltradaPorRol();
        const matchedOrdenes = baseOrdenesData.filter(o =>
            (o['Número de orden de trabajo'] || "").toLowerCase().includes(query) ||
            (o['Cuenta: Nombre de la cuenta'] || "").toLowerCase().includes(query) ||
            (o['Producto ST'] || "").toLowerCase().includes(query) ||
            (o['Referencia'] || "").toLowerCase().includes(query) ||
            (o['Nro de orden de trabajo (Marca)'] || "").toLowerCase().includes(query) ||
            (o['Nombre del Equipo'] || "").toLowerCase().includes(query) ||
            (o['Tipo de Servicio'] || "").toLowerCase().includes(query) ||
            (o['Tiempo desde apertura (Días)'] || "").toString().toLowerCase().includes(query) ||
            (o['Fecha de compra'] || "").toLowerCase().includes(query) ||
            (o['Fecha de ingreso a la marca'] || "").toLowerCase().includes(query) ||
            (o['¿Qué servicio técnico ?'] || "").toLowerCase().includes(query) ||
            (o['Fecha de la última modificación'] || "").toLowerCase().includes(query) ||
            (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(query) ||
            (o['Estado'] || "").toLowerCase().includes(query) ||
            (o.adicTecnico || "").toLowerCase().includes(query) ||
            (o.adicDetalleFalla || "").toLowerCase().includes(query) ||
            (o.adicObservaciones || "").toLowerCase().includes(query)
        );

        renderGlobalSearchResults(matchedTalleres, matchedOrdenes);
    }, 300));

    // ¿La orden está en un estado final (cancelada, con error, entregada o cerrada)?
    // Una sola definición para toda la app.
    function esEstadoFinal(estado) {
        const e = normalizarTexto(estado);
        return ESTADOS_FINALES.some(ex => e.includes(ex));
    }

    // Definición única de "escalamiento": cambio de equipo dentro de los 30 días entre la
    // fecha de compra y la fecha de inicio, sobre una orden activa y con falla confirmada
    // (regla interna en .agents/rules/escalamientos.md).
    function esEscalamiento(o) {
        if (esEstadoFinal(o.Estado)) return false;
        const diasCompra = diasEntre(o['Fecha de compra'], o['Fecha de inicio']);
        if (diasCompra === null || diasCompra > DIAS_ESCALAMIENTO_MAX) return false;
        if (!ESCALAMIENTO_REQUIERE_FALLA) return true;
        return String(o.adicDetalleFalla || '').trim().length > 0;
    }

    function renderKPIs() {
        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');

        let activas = appOrdersData.filter(o => !esEstadoFinal(o.Estado) && estaEnAlcanceRegional(o, rol, regional));

        const estancadas = activas.filter(o => {
            const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            return (diasMod !== null && diasMod >= DIAS_SIN_CAMBIOS_ALERTA) || diasCreacion >= DIAS_APERTURA_ALERTA;
        });

        // Mismo universo que la vista de Escalamientos (orden activa + alcance del usuario).
        const escalamientos = appOrdersData.filter(o => esEscalamiento(o) && estaEnAlcanceRegional(o, rol, regional));

        const contadorEsc = document.getElementById('contador-escalamientos');
        if (contadorEsc) {
            contadorEsc.textContent = escalamientos.length;
            if (escalamientos.length > 0) {
                contadorEsc.style.background = '#E31837';
                contadorEsc.style.color = '#ffffff';
                contadorEsc.style.boxShadow = '0 2px 8px rgba(227,24,55,0.3)';
            } else {
                contadorEsc.style.background = '#dcfce7';
                contadorEsc.style.color = '#16a34a';
                contadorEsc.style.boxShadow = '0 2px 8px rgba(22,163,74,0.25)';
            }
        }

        // Contador del botón "Última Modificación": órdenes con >=4 días sin modificar (semáforo rojo)
        const sinModificar4 = activas.filter(o => {
            const dm = diasDesde(o['Fecha de la última modificación']);
            return dm !== null && dm >= DIAS_SIN_CAMBIOS_ALERTA;
        }).length;
        const contadorEl = document.getElementById('contador-ultima-mod');
        if (contadorEl) {
            contadorEl.textContent = sinModificar4;
            if (sinModificar4 > 0) {
                contadorEl.style.background = '#E31837';
                contadorEl.style.color = '#ffffff';
                contadorEl.style.boxShadow = '0 2px 8px rgba(227,24,55,0.3)';
            } else {
                contadorEl.style.background = '#dcfce7';
                contadorEl.style.color = '#16a34a';
                contadorEl.style.boxShadow = '0 2px 8px rgba(22,163,74,0.25)';
            }
        }

        const regionesSet = new Set(activas.map(o => (o['Territorio de servicio: Nombre'] || 'Sin región').trim()));

        const set = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        set('kpi-ordenes', activas.length);
        set('kpi-estancadas', estancadas.length);
        set('kpi-talleres', appWorkshopData.length);
        set('kpi-regiones', regionesSet.size);
    }

    function renderGlobalSearchResults(talleres, ordenes) {
        if (!globalSearchResults) return;

        if (talleres.length === 0 && ordenes.length === 0) {
            globalSearchResults.innerHTML = '<p style="text-align:center;padding:2rem;color:#64748b;">No se encontraron resultados para tu búsqueda.</p>';
            return;
        }

        let html = '';

        // Sección de Talleres
        if (talleres.length > 0) {
            html += `<h3 style="font-size:1.1rem; font-weight:800; margin:1.5rem 0 1rem 0; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-buildings"></i> Talleres (${talleres.length})</h3>`;
            html += talleres.map(t => {
                const contactosText = t.CONTACTO || "";
                const numList = contactosText.split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
                const firstNum = numList.length > 0 ? numList[0].replace(/\D/g, '') : null;

                let mapHtml = '';
                if (t.UBICACION) {
                    let mapUrl = t.UBICACION;
                    let coords = '';
                    if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(mapUrl)) {
                        coords = mapUrl.replace(/\s+/g, '');
                        mapUrl = `https://www.google.com/maps?q=${coords}`;
                    } else if (!mapUrl.startsWith('http')) {
                        mapUrl = 'https://' + mapUrl;
                    }

                    const embedQuery = coords || encodeURIComponent(t.TALLER || 'ubicación');
                    const embedUrl = `https://www.google.com/maps?q=${embedQuery}&output=embed&z=16`;

                    mapHtml = `
                        <div class="map-preview-container" style="margin-top:0.75rem; border-radius:14px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.08); position:relative;">
                            <div style="width:100%; height:150px; position:relative; overflow:hidden; background:#f1f5f9;">
                                <iframe
                                    src="${embedUrl}"
                                    width="100%"
                                    height="150"
                                    style="border:0; display:block; pointer-events:none;"
                                    allowfullscreen=""
                                    loading="lazy"
                                    referrerpolicy="no-referrer-when-downgrade">
                                </iframe>
                                <div style="position:absolute; top:0; left:0; width:100%; height:100%; cursor:pointer;" onclick="window.open('${mapUrl}', '_blank')"></div>
                            </div>
                            <a href="${mapUrl}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:10px 15px; background:#ffffff; text-decoration:none; color:#111; font-weight:700; font-size:0.85rem; border-top:1px solid #f1f5f9; transition: background 0.2s ease;">
                                <div style="background:radial-gradient(circle at 30% 30%, #ff4b68, #E31837); width:20px; height:20px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:1px 1px 3px rgba(0,0,0,0.15); flex-shrink:0;">
                                    <div style="width:6px; height:6px; background:white; border-radius:50%;"></div>
                                </div>
                                <span>Abrir en Google Maps</span>
                                <i class="bi bi-box-arrow-up-right" style="font-size:0.8rem; color:#94a3b8;"></i>
                            </a>
                        </div>
                    `;
                }

                return `
                    <div class="dash-card stitch-card" style="margin-bottom:0.8rem; padding:1rem; cursor:default;">
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5px;">
                                <span style="font-weight:700; font-size:1rem; color:#111;">${t.TALLER}</span>
                                <span style="font-size:0.75rem; background:#f1f5f9; padding:2px 8px; border-radius:10px; color:#64748b;">${t.CIUDAD}</span>
                            </div>
                            <div style="font-size:0.85rem; color:#64748b; margin-bottom:5px;">${t.MARCA}</div>
                            ${numList.length > 0 ? `<div style="font-size:0.8rem; color:#475569; margin-bottom:10px;"><i class="bi bi-telephone" style="margin-right:4px;"></i>${numList.join(' · ')}</div>` : ''}
                            <div style="display:flex; gap:8px;">
                                ${firstNum ? `
                                    <a href="tel:${firstNum}" style="text-decoration:none; background:#E31837; color:white; padding:5px 12px; border-radius:8px; font-size:0.8rem; font-weight:600; display:flex; align-items:center; gap:5px;">
                                        <i class="bi bi-telephone-fill"></i> Llamar
                                    </a>
                                    <a href="https://wa.me/591${firstNum}" target="_blank" style="text-decoration:none; background:#25D366; color:white; padding:5px 12px; border-radius:8px; font-size:0.8rem; font-weight:600; display:flex; align-items:center; gap:5px;">
                                        <i class="bi bi-whatsapp"></i> WhatsApp
                                    </a>
                                ` : ''}
                            </div>
                            ${mapHtml}
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Sección de Órdenes
        if (ordenes.length > 0) {
            // Filtrar órdenes cerradas/entregadas para la búsqueda global también?
            // El usuario pidió "el criterio de los buscadores dentro de los botones".
            // Esos buscadores filtran sobre una lista ya filtrada por región y estado.
            // Implementaré el filtro de estados aquí también para consistencia.
            // Mismo criterio de estados que el resto de la app.
            let ordenesActivas = ordenes.filter(o => !esEstadoFinal(o.Estado));

            // El alcance por rol ya se aplicó al construir la búsqueda (dataFiltradaPorRol).
            if (ordenesActivas.length > 0) {
                html += `<h3 style="font-size:1.1rem; font-weight:800; margin:1.5rem 0 1rem 0; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-file-earmark-text"></i> Órdenes Activas (${ordenesActivas.length})</h3>`;
                html += ordenesActivas.map(o => {
                    return `
                        <div class="dash-card stitch-card" style="margin-bottom:0.8rem; padding:1rem; cursor:pointer;" onclick="window.handleGlobalOrderClick('${o['Número de orden de trabajo']}')">
                            <div style="flex:1;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5px;">
                                    <span style="font-weight:700; font-size:1rem; color:#111; line-height:1.2;">${o['Cuenta: Nombre de la cuenta']}</span>
                                    <span style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
                                        <span style="font-size:0.7rem; background:#e0e7ff; color:#3b82f6; padding:2px 8px; border-radius:10px; font-weight:700;">${o.Estado || 'S/E'}</span>
                                        ${warrantyBadgeHtml(o)}
                                    </span>
                                </div>
                                <div style="font-size:0.85rem; color:#64748b; margin-bottom:5px;">${o['Producto ST']}</div>
                                <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:#94a3b8;">
                                    <span>ODT: ${o['Número de orden de trabajo']}</span>
                                    <span><i class="bi bi-geo-alt-fill"></i> ${o['Territorio de servicio: Nombre']}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        globalSearchResults.innerHTML = html;
    }

    // Función global para manejar el click en una orden desde la búsqueda global
    window.handleGlobalOrderClick = (odt) => {
        const odtStr = (odt || '').toString().trim();
        const orden = appOrdersData.find(o => (o['Número de orden de trabajo'] || '').toString().trim() === odtStr);
        if (!orden) return;
        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        if (!estaEnAlcanceRegional(orden, rol, regional)) {
            alert('Esta orden pertenece a otra regional.');
            return;
        }
        const region = orden['Territorio de servicio: Nombre'] || "Resultado";
        currentRegionOrdenes = region;

        // Ocultar filtros secundarios que puedan interferir con la orden seleccionada
        const modFiltro = document.getElementById('modificacion-filtro');
        if (modFiltro) modFiltro.classList.add('hidden');
        const tipoFiltro = document.getElementById('tipo-orden-filtro');
        if (tipoFiltro) tipoFiltro.classList.add('hidden');
        if (estadosSearchInput) estadosSearchInput.value = "";
        const clearEstados = document.getElementById('clear-estados-search');
        if (clearEstados) clearEstados.style.display = 'none';

        renderOrdenes(region, [orden], {
            ignorarFiltroEstado: true,
            incluirCompletado: true,
            expandirPrimero: true,
            titulo: `Orden ${odtStr} — ${region}`,
            desdeBusquedaGlobal: true
        }, 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Event listeners para botones principales
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            debugLog(`\n👆 CLICK: ${action}`);
            handleNavigation(action);
        });
    });

    // Botones de volver
    document.getElementById('btn-back-red-talleres')?.addEventListener('click', () => {
        debugLog("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back-estados-menu')?.addEventListener('click', () => {
        debugLog("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
        showView(detailsBackView || viewRedTalleres);
    });

    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => {
        if (currentRegionOrdenes === 'Última Modificación') {
            debugLog("← Volver al dashboard (vista última modificación)");
            currentRegionOrdenes = "";
            ultimaModFiltro = 'todas';
            const filtroEl = document.getElementById('modificacion-filtro');
            if (filtroEl) filtroEl.classList.add('hidden');
            showView(viewDashboard);
        } else if (currentRegionOrdenes === 'Escalamientos') {
            debugLog("← Volver al dashboard (vista escalamientos)");
            currentRegionOrdenes = "";
            escFiltro = 'todas';
            const filtroEl = document.getElementById('modificacion-filtro');
            if (filtroEl) filtroEl.classList.add('hidden');
            showView(viewDashboard);
        } else if (globalSearchInput && globalSearchInput.value.trim() !== "") {
            debugLog("← Volver al dashboard (resultado de búsqueda)");
            showView(viewDashboard);
        } else {
            debugLog("← Volver a menú estados");
            showView(viewEstadosMenu);
        }
    });

    document.getElementById('btn-back-reportes')?.addEventListener('click', () => {
        debugLog("← Volver al menú de estados");
        showView(viewEstadosMenu);
    });

    document.getElementById('btn-back-encuesta')?.addEventListener('click', () => {
        debugLog("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back-encuesta-region')?.addEventListener('click', () => {
        debugLog("← Volver al menú de encuestas");
        encuestaCurrentRegion = null;
        showView(viewEncuesta);
    });

    document.getElementById('btn-back-ejecutivo')?.addEventListener('click', () => {
        debugLog("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', exportReportesCSV);
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportReportesPDF);

    // Reintentar la carga de datos sin recargar la página
    document.getElementById('sync-retry-btn')?.addEventListener('click', async () => {
        setSyncStatus('cargando', 'Reintentando…');
        const ok = await loadAllData();
        refrescarVistaActual();
        if (ok) setSyncStatus('oculto');
    });

    document.getElementById('dismac-logo-btn')?.addEventListener('click', () => {
        debugLog("← Volver al dashboard (Logo)");
        showView(viewDashboard);
    });

    function handleNavigation(action) {
        debugLog(`🧭 Action: ${action}`);

        switch (action) {
            case 'go-home':
                showView(viewDashboard);
                break;
            case 'open-red-talleres':
                showView(viewRedTalleres);
                break;
            case 'open-estados-servicio':
                showView(viewEstadosMenu);
                break;
            case 'view-reportes':
                showReportes();
                break;
            case 'view-encuesta':
                if (isAdmin()) showEncuesta();
                break;
            case 'view-ejecutivo':
                showEjecutivo();
                break;
            case 'view-ultima-modificacion':
                showUltimaModificacion();
                break;
            case 'view-escalamientos':
                showEscalamientos();
                break;
            case 'view-tarija':
                showRegionTalleres('Tarija');
                break;
            case 'view-sucre':
                showRegionTalleres('Sucre');
                break;
            case 'view-santacruz':
                showRegionTalleres('Santa Cruz');
                break;
            case 'view-lapaz':
                showRegionTalleres('La Paz');
                break;
            case 'view-cochabamba':
                showRegionTalleres('Cochabamba');
                break;
            case 'view-protocolo':
                showProtocol();
                break;
            case 'view-estados-tarija':
                showRegionOrdenes('Tarija');
                break;
            case 'view-estados-regionales':
                showRegionOrdenes('Regionales');
                break;
            case 'view-estados-sucre':
                showRegionOrdenes('Sucre');
                break;
            case 'view-estados-santacruz':
                showRegionOrdenes('Santa Cruz');
                break;
            case 'view-estados-municipios':
                showRegionOrdenes('Municipios');
                break;
            case 'view-estados-lapaz':
                showRegionOrdenes('La Paz');
                break;
            case 'view-estados-cochabamba':
                showRegionOrdenes('Cochabamba');
                break;
            case 'view-estados-oruro':
                showRegionOrdenes('Oruro');
                break;
            case 'view-estados-beni':
                showRegionOrdenes('Beni');
                break;
            case 'view-estados-potosi':
                showRegionOrdenes('Potosí');
                break;
            case 'agregar-taller':
                abrirFormularioTaller();
                break;
            case 'editar-taller':
                abrirEditorTaller();
                break;
            case 'conexion-taller':
                abrirConexionTaller(false);
                break;
        }
    }

    // ── Alta de talleres (solo administradores) ─────────────────────────────
    // Escribe en la hoja RED DE TALLERES a través de un Web App de Apps Script.
    // Ver apps-script/AgregarTaller.gs y apps-script/README.md.

    function leerConfigAlta() {
        const base = { endpoint: AGREGAR_TALLER_CONFIG.endpoint || '', token: '' };
        try {
            const raw = localStorage.getItem(AGREGAR_TALLER_CONFIG.storageKey);
            const guardado = raw ? JSON.parse(raw) : {};
            return {
                endpoint: guardado.endpoint || base.endpoint,
                token: guardado.token || ''
            };
        } catch (err) {
            return base;
        }
    }

    function guardarConfigAlta(cfg) {
        try {
            localStorage.setItem(AGREGAR_TALLER_CONFIG.storageKey, JSON.stringify(cfg));
        } catch (err) {
            // Modo privado o storage lleno: se vuelve a pedir la próxima vez.
        }
    }

    function cerrarFormularioTaller() {
        const overlay = document.getElementById('alta-taller-overlay');
        if (overlay) overlay.remove();
        document.body.style.overflow = '';
    }

    // Configuración aparte: la URL y la clave se guardan una sola vez,
    // sin obligar a cargar un taller.
    // despues: 'alta' | 'editar' | false. Si se guarda, reabre ese formulario.
    function abrirConexionTaller(despues) {
        if (!isAdmin()) return;
        if (document.getElementById('conexion-taller-overlay')) return;

        const cfg = leerConfigAlta();
        const estiloInput = 'width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:0.95rem;font-family:inherit;background:#fff;color:#0f172a;margin-bottom:14px;';
        const estiloLabel = 'display:block;font-size:0.78rem;font-weight:700;color:#334155;margin-bottom:6px;';

        const overlay = document.createElement('div');
        overlay.id = 'conexion-taller-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10001;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="conexion-taller-titulo"
                 style="background:#fff;width:100%;max-width:460px;max-height:92vh;overflow:auto;border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.28);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;">
                    <h3 id="conexion-taller-titulo" style="margin:0;font-size:1.15rem;color:#0f172a;">Conexión con Drive</h3>
                    <button type="button" id="conexion-taller-cerrar" aria-label="Cerrar"
                            style="border:0;background:#f1f5f9;width:34px;height:34px;border-radius:50%;font-size:1.25rem;line-height:1;cursor:pointer;color:#334155;">&times;</button>
                </div>
                <p style="margin:0 0 16px;font-size:0.8rem;color:#64748b;">
                    Se guarda <strong>una sola vez en este dispositivo</strong>. La app la usa para agregar talleres a <strong>RED DE TALLERES</strong>.
                </p>
                <form id="conexion-taller-form" novalidate>
                    <label for="conexion-endpoint" style="${estiloLabel}">URL del Web App</label>
                    <input id="conexion-endpoint" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec"
                           value="${escapeAttr(cfg.endpoint)}" style="${estiloInput}">

                    <label for="conexion-token" style="${estiloLabel}">Clave de administración</label>
                    <input id="conexion-token" type="password" autocomplete="off"
                           placeholder="${cfg.token ? 'Guardada en este dispositivo' : 'Clave del script'}" style="${estiloInput}">

                    <div id="conexion-taller-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:0.82rem;margin-bottom:14px;"></div>

                    <button type="submit" id="conexion-taller-guardar"
                            style="width:100%;border:0;border-radius:12px;padding:13px;background:#E31837;color:#fff;font-size:0.95rem;font-weight:700;font-family:inherit;cursor:pointer;">
                        Guardar conexión
                    </button>
                    <button type="button" id="conexion-taller-cancelar"
                            style="width:100%;border:0;background:none;color:#64748b;font-size:0.85rem;font-family:inherit;cursor:pointer;padding:10px;">
                        Cancelar
                    </button>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const form = document.getElementById('conexion-taller-form');
        const errorBox = document.getElementById('conexion-taller-error');

        const mostrarError = (texto) => {
            errorBox.textContent = texto;
            errorBox.style.display = 'block';
        };
        const cerrar = () => {
            const el = document.getElementById('conexion-taller-overlay');
            if (el) el.remove();
            if (!document.getElementById('alta-taller-overlay') &&
                !document.getElementById('editar-taller-overlay')) {
                document.body.style.overflow = '';
            }
        };

        document.getElementById('conexion-taller-cerrar').addEventListener('click', cerrar);
        document.getElementById('conexion-taller-cancelar').addEventListener('click', cerrar);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrar(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });

        document.getElementById('conexion-endpoint').focus();

        form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            errorBox.style.display = 'none';

            const endpoint = document.getElementById('conexion-endpoint').value.trim();
            const tokenNuevo = document.getElementById('conexion-token').value.trim();
            const token = tokenNuevo || cfg.token;

            if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(endpoint)) {
                return mostrarError('La URL tiene que ser la del Web App y terminar en /exec.');
            }
            if (!token) {
                document.getElementById('conexion-token').focus();
                return mostrarError('Escribí la clave de administración.');
            }

            guardarConfigAlta({ endpoint: endpoint, token: token });

            if (despues === 'alta') {
                cerrar();
                abrirFormularioTaller();
                return;
            }
            if (despues === 'editar') {
                cerrar();
                abrirEditorTaller();
                return;
            }

            form.innerHTML = `
                <div style="text-align:center;padding:4px 0 0;">
                    <div style="width:52px;height:52px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:1.6rem;">
                        <i class="bi bi-check-lg"></i>
                    </div>
                    <p style="margin:0 0 16px;font-weight:700;color:#0f172a;">Conexión guardada</p>
                    <button type="button" id="conexion-taller-ok"
                            style="width:100%;border:0;border-radius:12px;padding:12px;background:#E31837;color:#fff;font-size:0.92rem;font-weight:700;font-family:inherit;cursor:pointer;">
                        ${document.getElementById('alta-taller-overlay') ? 'Volver al taller' : 'Cerrar'}
                    </button>
                </div>
            `;
            document.getElementById('conexion-taller-ok').addEventListener('click', cerrar);
        });
    }

    function abrirFormularioTaller() {
        if (!isAdmin()) return;
        if (document.getElementById('alta-taller-overlay')) return;

        const cfg = leerConfigAlta();
        if (!cfg.endpoint || !cfg.token) {
            abrirConexionTaller('alta');
            return;
        }

        const ciudades = [...new Set(
            appWorkshopData.map(t => (t.CIUDAD || '').trim()).filter(Boolean)
        )].sort((a, b) => a.localeCompare(b, 'es'));

        const estiloInput = 'width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:0.95rem;font-family:inherit;background:#fff;color:#0f172a;margin-bottom:14px;';
        const estiloLabel = 'display:block;font-size:0.78rem;font-weight:700;color:#334155;margin-bottom:6px;';

        const overlay = document.createElement('div');
        overlay.id = 'alta-taller-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="alta-taller-titulo"
                 style="background:#fff;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.28);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;">
                    <h3 id="alta-taller-titulo" style="margin:0;font-size:1.15rem;color:#0f172a;">Agregar taller</h3>
                    <button type="button" id="alta-taller-cerrar" aria-label="Cerrar"
                            style="border:0;background:#f1f5f9;width:34px;height:34px;border-radius:50%;font-size:1.25rem;line-height:1;cursor:pointer;color:#334155;">&times;</button>
                </div>
                <p style="margin:0 0 16px;font-size:0.8rem;color:#64748b;">Se guarda en la hoja <strong>RED DE TALLERES</strong> de Drive.</p>

                <form id="alta-taller-form" novalidate>
                    <label for="alta-ciudad" style="${estiloLabel}">Ciudad *</label>
                    <input id="alta-ciudad" list="alta-ciudades" autocomplete="off" placeholder="SANTA CRUZ" style="${estiloInput}">
                    <datalist id="alta-ciudades">${ciudades.map(c => `<option value="${escapeAttr(c)}"></option>`).join('')}</datalist>

                    <label for="alta-taller" style="${estiloLabel}">Taller *</label>
                    <input id="alta-taller" autocomplete="off" placeholder="ST GLEECON" style="${estiloInput}">

                    <label for="alta-marca" style="${estiloLabel}">Marca</label>
                    <input id="alta-marca" autocomplete="off" placeholder="SAMSUNG, LG" style="${estiloInput}">

                    <label for="alta-contacto" style="${estiloLabel}">Contacto</label>
                    <input id="alta-contacto" inputmode="tel" autocomplete="off" placeholder="76383305 - 71540343" style="${estiloInput}">

                    <label for="alta-gps" style="${estiloLabel}">Ubicación GPS</label>
                    <input id="alta-gps" autocomplete="off" placeholder="lat,lng o link de Google Maps" style="${estiloInput}">

                    <div id="alta-taller-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:0.82rem;margin-bottom:14px;"></div>

                    <button type="submit" id="alta-taller-guardar"
                            style="width:100%;border:0;border-radius:12px;padding:13px;background:#E31837;color:#fff;font-size:0.95rem;font-weight:700;font-family:inherit;cursor:pointer;">
                        Guardar taller
                    </button>
                    <p style="margin:14px 0 0;font-size:0.75rem;color:#94a3b8;text-align:center;">
                        Conexión con Drive configurada ·
                        <button type="button" id="alta-cambiar-conexion"
                                style="border:0;background:none;color:#E31837;font:inherit;font-weight:700;cursor:pointer;padding:0;">
                            Cambiar
                        </button>
                    </p>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const form = document.getElementById('alta-taller-form');
        const errorBox = document.getElementById('alta-taller-error');
        const btn = document.getElementById('alta-taller-guardar');

        const mostrarError = (texto) => {
            errorBox.textContent = texto;
            errorBox.style.display = 'block';
        };

        document.getElementById('alta-taller-cerrar').addEventListener('click', cerrarFormularioTaller);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarFormularioTaller(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarFormularioTaller(); });

        document.getElementById('alta-taller').focus();
        document.getElementById('alta-cambiar-conexion').addEventListener('click', () => abrirConexionTaller(false));

        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            errorBox.style.display = 'none';

            const ciudad = document.getElementById('alta-ciudad').value.trim().toUpperCase();
            const taller = document.getElementById('alta-taller').value.trim();
            const marca = document.getElementById('alta-marca').value.trim();
            const contacto = document.getElementById('alta-contacto').value.trim();
            const gps = document.getElementById('alta-gps').value.trim();
            const cfgActual = leerConfigAlta();
            const endpoint = cfgActual.endpoint;
            const token = cfgActual.token;

            if (!ciudad) return mostrarError('Escribí la ciudad.');
            if (!taller) return mostrarError('Escribí el nombre del taller.');
            if (!contacto && !gps) return mostrarError('Cargá al menos un teléfono o la ubicación.');
            if (!endpoint || !token) {
                abrirConexionTaller(false);
                return mostrarError('Configurá la conexión con Drive.');
            }

            btn.disabled = true;
            btn.textContent = 'Guardando…';

            try {
                const resp = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        token: token,
                        ciudad: ciudad,
                        taller: taller,
                        marca: marca,
                        contacto: contacto,
                        gps: gps,
                        usuario: localStorage.getItem('usuario_actual') || ''
                    })
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);

                let data;
                try {
                    data = await resp.json();
                } catch (err) {
                    throw new Error('El Web App no devolvió JSON. Revisá que esté publicado como "Cualquier persona".');
                }

                if (!data.ok) {
                    const mensajes = {
                        clave_invalida: 'La clave no coincide con la del script.',
                        duplicado: `Ya existe "${data.taller || taller}" en ${data.ciudad || ciudad} (fila ${data.fila}).`,
                        falta_ciudad: 'Falta la ciudad.',
                        falta_taller: 'Falta el nombre del taller.',
                        sin_contacto: 'Cargá al menos un teléfono o la ubicación.',
                        hoja_no_encontrada: 'No se encontró la hoja RED DE TALLERES.',
                        ocupado: 'La hoja está ocupada. Probá de nuevo en unos segundos.',
                        json_invalido: 'El servidor no entendió los datos.',
                        error_interno: 'Error interno del script: ' + (data.detalle || 'sin detalle')
                    };
                    if (data.error === 'clave_invalida') {
                        return mostrarError('La clave no coincide. Usá "Cambiar" abajo para corregir la conexión.');
                    }
                    return mostrarError(mensajes[data.error] || ('No se pudo guardar (' + data.error + ').'));
                }

                const recarga = loadAllData();
                mostrarExito(form, data, recarga);
            } catch (err) {
                console.error('Alta de taller:', err);
                mostrarError(
                    err && err.message && err.message.indexOf('JSON') !== -1
                        ? err.message
                        : 'No se pudo conectar con el Web App. Verificá la URL y que el acceso sea "Cualquier persona".'
                );
            } finally {
                btn.disabled = false;
                btn.textContent = 'Guardar taller';
            }
        });
    }

    function mostrarExito(form, data, recarga) {
        form.innerHTML = `
            <div style="text-align:center;padding:6px 0 2px;">
                <div style="width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:1.7rem;">
                    <i class="bi bi-check-lg"></i>
                </div>
                <p style="margin:0 0 4px;font-weight:700;color:#0f172a;font-size:1rem;">Taller agregado</p>
                <p style="margin:0 0 18px;font-size:0.82rem;color:#64748b;">Fila ${data.fila} · ${escapeHTML(data.ciudad || '')}</p>
                <button type="button" id="alta-ver-ciudad"
                        style="width:100%;border:0;border-radius:12px;padding:12px;background:#E31837;color:#fff;font-size:0.92rem;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:8px;">
                    Ver talleres de ${escapeHTML(data.ciudad || '')}
                </button>
                <button type="button" id="alta-cerrar-ok"
                        style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;color:#334155;font-size:0.92rem;font-weight:700;font-family:inherit;cursor:pointer;">
                    Cerrar
                </button>
            </div>
        `;
        document.getElementById('alta-cerrar-ok').addEventListener('click', cerrarFormularioTaller);
        document.getElementById('alta-ver-ciudad').addEventListener('click', async () => {
            const boton = document.getElementById('alta-ver-ciudad');
            boton.disabled = true;
            boton.textContent = 'Cargando…';
            await recarga;
            cerrarFormularioTaller();
            showRegionTalleres(data.ciudad);
        });
    }

    // ── Edición de talleres existentes (solo administradores) ───────────────
    // Agrega marcas a la celda D y permite corregir contacto/GPS.
    // Usa la acción "actualizar" del Web App (apps-script/AgregarTaller.gs).

    function cerrarEditorTaller() {
        const overlay = document.getElementById('editar-taller-overlay');
        if (overlay) overlay.remove();
        if (!document.getElementById('alta-taller-overlay') &&
            !document.getElementById('conexion-taller-overlay')) {
            document.body.style.overflow = '';
        }
    }

    function abrirEditorTaller() {
        if (!isAdmin()) return;
        if (document.getElementById('editar-taller-overlay')) return;

        const cfg = leerConfigAlta();
        if (!cfg.endpoint || !cfg.token) {
            abrirConexionTaller('editar');
            return;
        }

        const ciudadesMap = new Map();
        appWorkshopData.forEach(t => {
            const c = (t.CIUDAD || '').trim();
            if (c && !ciudadesMap.has(c.toUpperCase())) ciudadesMap.set(c.toUpperCase(), c);
        });
        const ciudades = [...ciudadesMap.values()].sort((a, b) => a.localeCompare(b, 'es'));

        const estiloInput = 'width:100%;box-sizing:border-box;padding:11px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:0.95rem;font-family:inherit;background:#fff;color:#0f172a;margin-bottom:14px;';
        const estiloLabel = 'display:block;font-size:0.78rem;font-weight:700;color:#334155;margin-bottom:6px;';

        const overlay = document.createElement('div');
        overlay.id = 'editar-taller-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;';
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="editar-taller-titulo"
                 style="background:#fff;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:18px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.28);">
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;">
                    <h3 id="editar-taller-titulo" style="margin:0;font-size:1.15rem;color:#0f172a;">Editar taller</h3>
                    <button type="button" id="editar-taller-cerrar" aria-label="Cerrar"
                            style="border:0;background:#f1f5f9;width:34px;height:34px;border-radius:50%;font-size:1.25rem;line-height:1;cursor:pointer;color:#334155;">&times;</button>
                </div>
                <p style="margin:0 0 16px;font-size:0.8rem;color:#64748b;">
                    Agregá una marca o corregí los datos. Se guarda en <strong>RED DE TALLERES</strong>.
                </p>

                <form id="editar-taller-form" novalidate>
                    <label for="editar-ciudad" style="${estiloLabel}">Ciudad *</label>
                    <select id="editar-ciudad" style="${estiloInput}">
                        <option value="">Elegí una ciudad</option>
                        ${ciudades.map(c => `<option value="${escapeAttr(c)}">${escapeHTML(c)}</option>`).join('')}
                    </select>

                    <label for="editar-taller" style="${estiloLabel}">Taller *</label>
                    <select id="editar-taller" style="${estiloInput}" disabled>
                        <option value="">Elegí primero la ciudad</option>
                    </select>

                    <div id="editar-taller-actual" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:14px;font-size:0.82rem;color:#475569;line-height:1.5;">
                        <div><strong>Marca actual:</strong> <span id="editar-marca-actual"></span></div>
                    </div>

                    <label for="editar-marca" style="${estiloLabel}">Agregar marca</label>
                    <input id="editar-marca" autocomplete="off" placeholder="Ej: LG" style="${estiloInput}">
                    <p style="margin:-8px 0 14px;font-size:0.75rem;color:#64748b;">
                        Se suma al final de la lista. No borra las marcas que ya tiene.
                    </p>

                    <label for="editar-contacto" style="${estiloLabel}">Contacto</label>
                    <input id="editar-contacto" inputmode="tel" autocomplete="off" style="${estiloInput}">

                    <label for="editar-gps" style="${estiloLabel}">Ubicación GPS</label>
                    <input id="editar-gps" autocomplete="off" style="${estiloInput}">

                    <div id="editar-taller-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:10px;padding:10px 12px;font-size:0.82rem;margin-bottom:14px;"></div>

                    <button type="submit" id="editar-taller-guardar"
                            style="width:100%;border:0;border-radius:12px;padding:13px;background:#E31837;color:#fff;font-size:0.95rem;font-weight:700;font-family:inherit;cursor:pointer;">
                        Guardar cambios
                    </button>
                    <p style="margin:14px 0 0;font-size:0.75rem;color:#94a3b8;text-align:center;">
                        Conexión con Drive configurada ·
                        <button type="button" id="editar-cambiar-conexion"
                                style="border:0;background:none;color:#E31837;font:inherit;font-weight:700;cursor:pointer;padding:0;">
                            Cambiar
                        </button>
                    </p>
                </form>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.style.overflow = 'hidden';

        const form = document.getElementById('editar-taller-form');
        const selectCiudad = document.getElementById('editar-ciudad');
        const selectTaller = document.getElementById('editar-taller');
        const bloqueActual = document.getElementById('editar-taller-actual');
        const marcaActualEl = document.getElementById('editar-marca-actual');
        const marcaInput = document.getElementById('editar-marca');
        const contactoInput = document.getElementById('editar-contacto');
        const gpsInput = document.getElementById('editar-gps');
        const errorBox = document.getElementById('editar-taller-error');
        const btn = document.getElementById('editar-taller-guardar');

        const mostrarError = (texto) => {
            errorBox.textContent = texto;
            errorBox.style.display = 'block';
        };

        const tallerActual = () => {
            const ciudadKey = (selectCiudad.value || '').trim().toUpperCase();
            const nombre = (selectTaller.value || '').trim();
            return appWorkshopData.find(t =>
                (t.CIUDAD || '').trim().toUpperCase() === ciudadKey &&
                (t.TALLER || '').trim() === nombre
            );
        };

        const cargarTalleres = () => {
            const ciudadKey = (selectCiudad.value || '').trim().toUpperCase();
            const talleres = appWorkshopData
                .filter(t => (t.CIUDAD || '').trim().toUpperCase() === ciudadKey)
                .map(t => (t.TALLER || '').trim())
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b, 'es'));

            selectTaller.innerHTML = '<option value="">Elegí un taller</option>' +
                talleres.map(n => `<option value="${escapeAttr(n)}">${escapeHTML(n)}</option>`).join('');
            selectTaller.disabled = !ciudadKey;
            bloqueActual.style.display = 'none';
            marcaActualEl.textContent = '';
            marcaInput.value = '';
            contactoInput.value = '';
            gpsInput.value = '';
            errorBox.style.display = 'none';
        };

        const cargarDatos = () => {
            const t = tallerActual();
            if (!t) {
                bloqueActual.style.display = 'none';
                marcaActualEl.textContent = '';
                marcaInput.value = '';
                contactoInput.value = '';
                gpsInput.value = '';
                return;
            }
            bloqueActual.style.display = 'block';
            marcaActualEl.textContent = t.MARCA || 'Sin marca';
            contactoInput.value = t.CONTACTO || '';
            gpsInput.value = t.UBICACION || '';
            errorBox.style.display = 'none';
        };

        document.getElementById('editar-taller-cerrar').addEventListener('click', cerrarEditorTaller);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) cerrarEditorTaller(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarEditorTaller(); });
        selectCiudad.addEventListener('change', cargarTalleres);
        selectTaller.addEventListener('change', cargarDatos);
        document.getElementById('editar-cambiar-conexion').addEventListener('click', () => abrirConexionTaller(false));

        selectCiudad.focus();

        form.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            errorBox.style.display = 'none';

            const t = tallerActual();
            if (!t) return mostrarError('Elegí la ciudad y el taller.');

            const marca = marcaInput.value.trim();
            const contacto = contactoInput.value.trim();
            const gps = gpsInput.value.trim();

            if (!marca && contacto === (t.CONTACTO || '') && gps === (t.UBICACION || '')) {
                return mostrarError('No hay cambios para guardar.');
            }

            // Se relee la conexión: puede haberse cambiado desde este mismo modal.
            const cfgActual = leerConfigAlta();
            if (!cfgActual.endpoint || !cfgActual.token) {
                abrirConexionTaller('editar');
                return mostrarError('Configurá la conexión con Drive.');
            }

            btn.disabled = true;
            btn.textContent = 'Guardando…';

            try {
                const resp = await fetch(cfgActual.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                    body: JSON.stringify({
                        accion: 'actualizar',
                        token: cfgActual.token,
                        ciudad: (t.CIUDAD || selectCiudad.value || '').trim().toUpperCase(),
                        taller: (t.TALLER || selectTaller.value || '').trim(),
                        marca: marca,
                        contacto: contacto,
                        gps: gps,
                        usuario: localStorage.getItem('usuario_actual') || ''
                    })
                });
                if (!resp.ok) throw new Error('HTTP ' + resp.status);

                let data;
                try {
                    data = await resp.json();
                } catch (err) {
                    throw new Error('El Web App no devolvió JSON. Revisá que esté publicado como "Cualquier persona".');
                }

                if (!data.ok) {
                    const mensajes = {
                        clave_invalida: 'La clave no coincide con la del script.',
                        no_encontrado: 'No se encontró el taller en la hoja. Recargá la app y probá de nuevo.',
                        duplicado: 'El Web App todavía es la versión anterior. Actualizá el script y publicá una nueva versión.',
                        falta_ciudad: 'Falta la ciudad.',
                        falta_taller: 'Falta el nombre del taller.',
                        ocupado: 'La hoja está ocupada. Probá de nuevo en unos segundos.',
                        json_invalido: 'El servidor no entendió los datos.',
                        error_interno: 'Error interno del script: ' + (data.detalle || 'sin detalle')
                    };
                    if (data.error === 'clave_invalida') {
                        abrirConexionTaller('editar');
                    }
                    return mostrarError(mensajes[data.error] || ('No se pudo guardar (' + data.error + ').'));
                }

                if (data.sinCambios) {
                    return mostrarError(data.marcaDuplicada
                        ? 'Esa marca ya estaba cargada en este taller.'
                        : 'No había cambios para guardar.');
                }

                const recarga = loadAllData();
                mostrarExitoEdicion(form, data, recarga);
            } catch (err) {
                console.error('Editar taller:', err);
                mostrarError(
                    err && err.message && err.message.indexOf('JSON') !== -1
                        ? err.message
                        : 'No se pudo conectar con el Web App. Verificá la URL y que el acceso sea "Cualquier persona".'
                );
            } finally {
                btn.disabled = false;
                btn.textContent = 'Guardar cambios';
            }
        });
    }

    function mostrarExitoEdicion(form, data, recarga) {
        form.innerHTML = `
            <div style="text-align:center;padding:6px 0 2px;">
                <div style="width:56px;height:56px;border-radius:50%;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;font-size:1.7rem;">
                    <i class="bi bi-check-lg"></i>
                </div>
                <p style="margin:0 0 4px;font-weight:700;color:#0f172a;font-size:1rem;">Taller actualizado</p>
                <p style="margin:0 0 12px;font-size:0.82rem;color:#64748b;">${escapeHTML(data.taller || '')} · ${escapeHTML(data.ciudad || '')}</p>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;margin-bottom:18px;font-size:0.82rem;color:#334155;line-height:1.5;text-align:left;">
                    <strong>Marca:</strong> ${escapeHTML(data.marca || 'Sin marca')}
                </div>
                ${data.marcaDuplicada ? '<p style="margin:-8px 0 14px;font-size:0.78rem;color:#b45309;">Esa marca ya estaba cargada; se guardaron los demás cambios.</p>' : ''}
                <button type="button" id="editar-ver-ciudad"
                        style="width:100%;border:0;border-radius:12px;padding:12px;background:#E31837;color:#fff;font-size:0.92rem;font-weight:700;font-family:inherit;cursor:pointer;margin-bottom:8px;">
                    Ver talleres de ${escapeHTML(data.ciudad || '')}
                </button>
                <button type="button" id="editar-cerrar-ok"
                        style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:12px;background:#fff;color:#334155;font-size:0.92rem;font-weight:700;font-family:inherit;cursor:pointer;">
                    Cerrar
                </button>
            </div>
        `;
        document.getElementById('editar-cerrar-ok').addEventListener('click', cerrarEditorTaller);
        document.getElementById('editar-ver-ciudad').addEventListener('click', async () => {
            const boton = document.getElementById('editar-ver-ciudad');
            boton.disabled = true;
            boton.textContent = 'Cargando…';
            await recarga;
            cerrarEditorTaller();
            showRegionTalleres(data.ciudad);
        });
    }

    function showRegionTalleres(region) {
        debugLog(`\n🏢 Mostrando talleres de: ${region}`);
        currentRegionTalleres = region;
        const regionUpper = region.toUpperCase();
        filteredTalleres = appWorkshopData.filter(t =>
            (t.CIUDAD || "").toUpperCase() === regionUpper
        );
        if (workshopSearchInput) workshopSearchInput.value = "";
        renderTalleres(region, filteredTalleres);
    }

    function renderTalleres(region, talleres) {
        detailsBackView = viewRedTalleres;
        if (viewTitle) viewTitle.textContent = `Talleres en ${region}`;
        if (viewContent) viewContent.innerHTML = '';

        if (talleres.length === 0) {
            if (viewContent) {
                viewContent.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron talleres.</p>';
            }
            showView(viewDetails);
            return;
        }

        const html = talleres.map(t => {
            // Procesar contactos (pueden venir separados por guión o coma)
            const contactosText = t.CONTACTO || "";
            const numList = contactosText.split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);

            const contactsHtml = numList.map(num => {
                const cleanNum = num.replace(/\D/g, '');
                return `
                    <div class="contact-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.75rem;">
                        <a href="tel:${cleanNum}" class="btn-action" style="background:#f4f5f7;color:#111;padding:15px 10px;border-radius:12px;text-align:center;text-decoration:none;font-size:0.9rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-weight:700;">
                            <div style="background:#dbeafe;color:#111;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="bi bi-telephone-fill" style="font-size:1rem; transform:scaleX(-1);"></i></div> Ll. ${cleanNum}
                        </a>
                        <a href="https://wa.me/591${cleanNum}" target="_blank" class="btn-action" style="background:#e3f5d5;color:#064e3b;padding:15px 10px;border-radius:12px;text-align:center;text-decoration:none;font-size:0.9rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;font-weight:700;">
                            <div style="background:#bbf7d0;color:#16a34a;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="bi bi-whatsapp" style="font-size:1rem;"></i></div> WA ${cleanNum}
                        </a>
                    </div>
                `;
            }).join('');

            let mapHtml = '';
            if (t.UBICACION) {
                let mapUrl = t.UBICACION;
                let coords = '';
                if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(mapUrl)) {
                    coords = mapUrl.replace(/\s+/g, '');
                    mapUrl = `https://www.google.com/maps?q=${coords}`;
                } else if (!mapUrl.startsWith('http')) {
                    mapUrl = 'https://' + mapUrl;
                }

                const embedQuery = coords || encodeURIComponent(t.TALLER || 'ubicación');
                const embedUrl = `https://www.google.com/maps?q=${embedQuery}&output=embed&z=16`;

                mapHtml = `
                    <div class="map-preview-container" style="margin-top:0.75rem; border-radius:14px; overflow:hidden; border:1px solid #e2e8f0; box-shadow:0 4px 12px rgba(0,0,0,0.08); position:relative;">
                        <div style="width:100%; height:180px; position:relative; overflow:hidden; background:#f1f5f9;">
                            <iframe
                                src="${embedUrl}"
                                width="100%"
                                height="180"
                                style="border:0; display:block; pointer-events:none;"
                                allowfullscreen=""
                                loading="lazy"
                                referrerpolicy="no-referrer-when-downgrade">
                            </iframe>
                            <div style="position:absolute; top:0; left:0; width:100%; height:100%; cursor:pointer;" onclick="window.open('${mapUrl}', '_blank')"></div>
                        </div>
                        <a href="${mapUrl}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; padding:12px 15px; background:#ffffff; text-decoration:none; color:#111; font-weight:700; font-size:0.9rem; border-top:1px solid #f1f5f9; transition: background 0.2s ease;">
                            <div style="background:radial-gradient(circle at 30% 30%, #ff4b68, #E31837); width:24px; height:24px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:1px 1px 3px rgba(0,0,0,0.15); flex-shrink:0;">
                                <div style="width:7px; height:7px; background:white; border-radius:50%;"></div>
                            </div>
                            <span>Abrir en Google Maps</span>
                            <i class="bi bi-box-arrow-up-right" style="font-size:0.8rem; color:#94a3b8;"></i>
                        </a>
                    </div>
                `;
            }

            return `
                <div class="workshop-card" style="margin-bottom:1rem; border-radius:15px; border:1px solid #f8eaeb; padding:1.25rem;">
                    <div class="workshop-header" style="margin-bottom:15px;">
                        <h3 class="workshop-title" style="margin:0; font-size:1.2rem; font-weight:800; color:#111;">${t.TALLER || 'Sin nombre'}</h3>
                    </div>
                    <div class="workshop-body">
                        <div class="info-row" style="margin-bottom:20px; align-items:flex-start;">
                            <i class="bi bi-tag-fill" style="color: #E31837; font-size:1rem; margin-top:2px;"></i>
                            <span style="font-weight: 500; font-size:0.9rem; color:#555; line-height:1.4;">${t.MARCA || 'Sin marca'}</span>
                        </div>
                        <div class="workshop-actions-container">
                            ${contactsHtml || '<p style="font-size:0.85rem;color:#999;text-align:center;">Sin teléfono disponible</p>'}
                        </div>
                        ${mapHtml}
                    </div>
                </div>
            `;
        }).join('');

        if (viewContent) viewContent.innerHTML = html;
        showView(viewDetails);
    }

    function isOrderInRegion(o, region) {
        if (!o || !region) return false;
        const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (region === 'Municipios') {
            return MUNICIPIOS_SCZ.some(m => terr.includes(m));
        }

        if (region === 'Regionales') {
            const noSupervisadas = ['santa cruz', 'el alto', 'cochabamba', 'la paz', 'achocalla'];
            return !noSupervisadas.some(x => terr.includes(x)) && !MUNICIPIOS_SCZ.some(m => terr.includes(m));
        }

        if (region === 'Santa Cruz') {
            const isMunicipio = MUNICIPIOS_SCZ.some(m => terr.includes(m));
            return terr.includes('santa cruz') && !isMunicipio;
        }

        const regionNormalized = region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        if (regionNormalized === 'tarija') {
            return terr.includes('tarija') || terr.includes('villamontes') || terr.includes('yacuiba');
        }

        return terr.includes(regionNormalized);
    }

    // ¿La regional del usuario supervisa además los municipios de Santa Cruz?
    function regionalIncluyeMunicipios(regional) {
        return REGIONALES_CON_MUNICIPIOS.includes(normalizarRol(regional));
    }

    // Alcance de datos del usuario: sin rol regional no hay restricción; con rol regional se limita
    // a su territorio y, en el caso de Tarija y Sucre, también a los municipios de Santa Cruz.
    // El rol se compara normalizado, así "Regional" o "REGIONAL" también restringen.
    function estaEnAlcanceRegional(o, rol, regional) {
        if (normalizarRol(rol) !== 'regional' || !regional) return true;
        if (isOrderInRegion(o, regional)) return true;
        return regionalIncluyeMunicipios(regional) && isOrderInRegion(o, 'Municipios');
    }

    function renderTipoOrdenFiltro(region, ordenesBase) {
        const cont = document.getElementById('tipo-orden-filtro');
        if (!cont) return;

        const hayTransporte = ordenesBase.some(o => o.esTransporte);
        if (!hayTransporte) {
            cont.classList.add('hidden');
            cont.innerHTML = '';
            return;
        }

        cont.classList.remove('hidden');

        const totalCount = ordenesBase.length;
        const stCount = ordenesBase.filter(o => !o.esTransporte).length;
        const trCount = ordenesBase.filter(o => o.esTransporte).length;

        const baseStyle = 'padding:6px 14px; border-radius:16px; border:1px solid #e2e8f0; background:#ffffff; color:#334155; font-family:"Outfit",sans-serif; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; transition:all 0.2s;';
        const activeStyle = 'padding:6px 14px; border-radius:16px; border:1px solid #dc2626; background:#dc2626; color:#ffffff; font-family:"Outfit",sans-serif; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(220,38,38,0.25);';

        const opciones = [
            { key: 'todas', label: `Todas (${totalCount})`, icon: 'bi-grid-fill' },
            { key: 'servicio', label: `Servicio Técnico (${stCount})`, icon: 'bi-tools' },
            { key: 'transporte', label: `Transporte (${trCount})`, icon: 'bi-truck' }
        ];

        cont.innerHTML = opciones.map(op => {
            const active = op.key === tipoFiltroOrdenes;
            return `<button type="button" data-tipo="${op.key}" style="${active ? activeStyle : baseStyle}"><i class="bi ${op.icon}"></i> ${escapeHTML(op.label)}</button>`;
        }).join('');

        cont.querySelectorAll('[data-tipo]').forEach(btn => {
            btn.addEventListener('click', () => {
                tipoFiltroOrdenes = btn.getAttribute('data-tipo');
                if (estadosCurrentRegion) {
                    showRegionOrdenes(estadosCurrentRegion);
                }
            });
        });
    }

    function showRegionOrdenes(region) {
        debugLog(`\n📋 Mostrando órdenes de: ${region}`);
        currentRegionOrdenes = region;

        const modFiltro = document.getElementById('modificacion-filtro');
        if (modFiltro) modFiltro.classList.add('hidden');

        const baseRegional = appOrdersData.filter(o => isOrderInRegion(o, region));
        renderTipoOrdenFiltro(region, baseRegional);

        if (tipoFiltroOrdenes === 'servicio') {
            filteredOrdenes = baseRegional.filter(o => !o.esTransporte);
        } else if (tipoFiltroOrdenes === 'transporte') {
            filteredOrdenes = baseRegional.filter(o => o.esTransporte);
        } else {
            filteredOrdenes = baseRegional;
        }

        if (estadosSearchInput) estadosSearchInput.value = "";
        const clearEstados = document.getElementById('clear-estados-search');
        if (clearEstados) clearEstados.style.display = 'none';
        renderOrdenes(region, filteredOrdenes, undefined, 1);
    }

    function renderUltimaModFiltro() {
        const cont = document.getElementById('modificacion-filtro');
        if (!cont) return;

        const territorios = [...new Set(appOrdersData.map(o => (o['Territorio de servicio: Nombre'] || '').trim()).filter(t => t !== ''))];
        const opciones = ['todas', 'Regionales', ...territorios];

        const baseStyle = 'padding:6px 12px;border-radius:16px;border:1px solid #e2e8f0;background:#ffffff;color:#334155;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;';
        const activeStyle = 'padding:6px 12px;border-radius:16px;border:1px solid #dc2626;background:#dc2626;color:#ffffff;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;';

        cont.innerHTML = opciones.map(op => {
            const label = op === 'todas' ? 'Todas' : op;
            const active = op === ultimaModFiltro;
            return `<button type="button" data-region="${escapeHTML(op)}" style="${active ? activeStyle : baseStyle}">${escapeHTML(label)}</button>`;
        }).join('');

        cont.querySelectorAll('[data-region]').forEach(btn => {
            btn.addEventListener('click', () => {
                ultimaModFiltro = btn.getAttribute('data-region');
                showUltimaModificacion();
            });
        });
    }

    function showUltimaModificacion() {
        debugLog("\n📋 Mostrando órdenes por última modificación (antiguas primero)");
        currentRegionOrdenes = 'Última Modificación';

        const filtroEl = document.getElementById('modificacion-filtro');
        if (filtroEl) filtroEl.classList.remove('hidden');
        const tipoEl = document.getElementById('tipo-orden-filtro');
        if (tipoEl) tipoEl.classList.add('hidden');
        renderUltimaModFiltro();

        if (ultimaModFiltro === 'todas') {
            filteredOrdenes = appOrdersData;
        } else {
            filteredOrdenes = appOrdersData.filter(o => isOrderInRegion(o, ultimaModFiltro));
        }

        if (estadosSearchInput) estadosSearchInput.value = "";
        renderOrdenes('Última Modificación', filteredOrdenes, {
            ordenarPor: 'modificacion',
            titulo: ultimaModFiltro === 'todas'
                ? 'Órdenes por última modificación'
                : `Última modificación — ${ultimaModFiltro}`
        }, 1);
    }

    function renderEscFiltro(ordenes) {
        const cont = document.getElementById('modificacion-filtro');
        if (!cont) return;
        const territorios = [...new Set(ordenes.map(o => (o['Territorio de servicio: Nombre'] || '').trim()).filter(t => t !== ''))];
        const opciones = ['todas', 'Regionales', ...territorios];
        const baseStyle = 'padding:6px 12px;border-radius:16px;border:1px solid #e2e8f0;background:#ffffff;color:#334155;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;';
        const activeStyle = 'padding:6px 12px;border-radius:16px;border:1px solid #dc2626;background:#dc2626;color:#ffffff;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;';
        cont.innerHTML = opciones.map(op => {
            const label = op === 'todas' ? 'Todas' : op;
            const active = op === escFiltro;
            return `<button type="button" data-esc="${escapeHTML(op)}" style="${active ? activeStyle : baseStyle}">${escapeHTML(label)}</button>`;
        }).join('');
        cont.querySelectorAll('[data-esc]').forEach(btn => {
            btn.addEventListener('click', () => {
                escFiltro = btn.getAttribute('data-esc');
                showEscalamientos();
            });
        });
    }

    function showEscalamientos() {
        debugLog("\n📋 Mostrando órdenes para Escalamiento (Cambio de equipo)");
        currentRegionOrdenes = 'Escalamientos';

        const filtroEl = document.getElementById('modificacion-filtro');
        if (filtroEl) filtroEl.classList.remove('hidden');
        const tipoEl = document.getElementById('tipo-orden-filtro');
        if (tipoEl) tipoEl.classList.add('hidden');

        // Misma definición de escalamiento que el contador del dashboard.
        const ordenesBase = appOrdersData.filter(esEscalamiento);

        renderEscFiltro(ordenesBase);

        let ordenesFiltradas;
        if (escFiltro === 'todas') {
            ordenesFiltradas = ordenesBase;
        } else {
            ordenesFiltradas = ordenesBase.filter(o => isOrderInRegion(o, escFiltro));
        }

        if (estadosSearchInput) estadosSearchInput.value = "";

        renderOrdenes('Escalamientos', ordenesFiltradas, {
            titulo: escFiltro === 'todas'
                ? 'Escalamientos (Cambio de equipo ≤ 30 días)'
                : `Escalamientos — ${escFiltro}`,
            incluirCompletado: true
        }, 1);
    }

    function renderOrdenes(region, ordenes, opciones, pagina) {
        estadosCurrentRegion = region;
        estadosCurrentOrdenes = ordenes;
        estadosCurrentOpciones = opciones;

        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = (opciones && opciones.titulo) ? opciones.titulo : `Órdenes - ${region}`;

        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;

        // FILTRO DE ESTADOS: se excluyen los estados finales (y "completado" salvo que se pida)
        let ordenesFiltradas = ordenes.filter(o => {
            if (opciones && opciones.ignorarFiltroEstado) return true;
            if (esEstadoFinal(o.Estado)) return false;
            if (opciones && opciones.incluirCompletado) return true;
            return !normalizarTexto(o.Estado).includes('completado');
        });

        // ALCANCE DEL USUARIO (su regional y, para Tarija/Sucre, también los municipios de SCZ)
        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        ordenesFiltradas = ordenesFiltradas.filter(o => estaEnAlcanceRegional(o, rol, regional));

        // ORDENAMIENTO
        if (opciones && opciones.ordenarPor === 'modificacion') {
            // Por fecha de última modificación: de la más antigua a la más reciente (sin fecha al final)
            ordenesFiltradas.sort((a, b) => {
                const fa = parseFecha(a['Fecha de la última modificación']);
                const fb = parseFecha(b['Fecha de la última modificación']);
                if (!fa && !fb) return 0;
                if (!fa) return 1;
                if (!fb) return -1;
                return fa - fb;
            });
        } else {
            // más antiguas primero (urgencia)
            ordenesFiltradas.sort((a, b) => {
                const da = parseInt(a['Tiempo desde apertura (Días)'] || '0', 10);
                const db = parseInt(b['Tiempo desde apertura (Días)'] || '0', 10);
                return db - da;
            });
        }

        if (ordenesFiltradas.length === 0) {
            contentEl.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron órdenes activas.</p>';
            const pagEl = document.getElementById('estados-pagination');
            if (pagEl) pagEl.innerHTML = '';
            showView(viewEstadosServicio);
            return;
        }

        // PAGINACIÓN: 10 órdenes por página
        const ORDENES_POR_PAGINA = 10;
        const totalPaginas = Math.max(1, Math.ceil(ordenesFiltradas.length / ORDENES_POR_PAGINA));
        // La pagina llega por parametro: el render ya no muta estado global.
        const page = Math.min(Math.max(1, parseInt(pagina, 10) || 1), totalPaginas);
        const inicio = (page - 1) * ORDENES_POR_PAGINA;
        const paginaOrdenes = ordenesFiltradas.slice(inicio, inicio + ORDENES_POR_PAGINA);

        const html = paginaOrdenes.map((o, idx) => {
            const workshopNameRaw = (o['¿Qué servicio técnico ?'] || "").trim();
            const workshopName = workshopNameRaw.toUpperCase();
            
            // La ciudad del taller se deduce del territorio de la propia orden: en las vistas
            // "Última Modificación" y "Escalamientos" el parámetro `region` no es una ciudad.
            const territorioOrden = (o['Territorio de servicio: Nombre'] || "").toUpperCase();
            const territorioNorm = territorioOrden.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const esMunicipioOrden = MUNICIPIOS_SCZ.some(m => territorioNorm.includes(m));
            const ciudadRegion = (region || "").toUpperCase();
            const cityForWorkshop = (esMunicipioOrden || ciudadRegion === 'MUNICIPIOS')
                ? 'SANTA CRUZ'
                : (territorioOrden || ciudadRegion);

            let workshop = null;
            if (workshopName) {
                const localWorkshops = appWorkshopData.filter(w => {
                    const wCity = (w.CIUDAD || "").toUpperCase();
                    return wCity.includes(cityForWorkshop) || cityForWorkshop.includes(wCity);
                });

                const matchFn = (w) => {
                    if (!w.TALLER) return false;
                    const t = w.TALLER.toUpperCase();
                    const tClean = t.replace(/^ST\s+/, '');
                    return t === workshopName || tClean === workshopName || 
                           t.includes(workshopName) || workshopName.includes(tClean);
                };

                workshop = localWorkshops.find(matchFn);

                if (!workshop && workshopName.length > 2) {
                    workshop = localWorkshops.find(w => {
                        const marcas = (w.MARCA || "").toUpperCase().split(',').map(s=>s.trim());
                        return marcas.some(m => m.includes(workshopName) || workshopName.includes(m));
                    });
                }

                if (!workshop) {
                    workshop = appWorkshopData.find(matchFn);
                }
            }

            let workshopHtml = "";

            // Preparar mensaje de WhatsApp solicitado (siempre disponible)
            const nombreCliente = o['Cuenta: Nombre de la cuenta'] || 'N/A';
            const ordenDismac = o['Referencia'] || o['Número de orden de trabajo'] || 'N/A';
            const activo = o['Producto ST'] || 'N/A';
            const nroOrdenMarca = o['Nro de orden de trabajo (Marca)'] || 'S/O';
            const diasST = o['Tiempo desde apertura (Días)'] || '0';

            // Badge de días sin modificación (semáforo) — solo en la vista de última modificación
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            let modBadge = '';
            if (opciones && opciones.ordenarPor === 'modificacion') {
                let bg = '#f1f5f9', col = '#64748b';
                if (diasMod !== null && diasMod !== undefined) {
                    if (diasMod >= DIAS_SIN_CAMBIOS_ALERTA) { bg = '#fee2e2'; col = '#dc2626'; }
                    else if (diasMod >= 2) { bg = '#fef9c3'; col = '#b45309'; }
                    else { bg = '#dcfce7'; col = '#16a34a'; }
                }
                modBadge = `<span style="display:flex; align-items:center; gap:4px; background:${bg}; color:${col}; padding:2px 8px; border-radius:12px; font-weight:800; white-space:nowrap;"><i class="bi bi-hourglass-split"></i> ${diasMod ?? '—'}d</span>`;
            }

            if (workshop) {
                // Formatear mensaje para taller específico
                const textMsg = `Hola, servicio técnico ${workshop.TALLER}, por favor ayúdenos con información sobre el estado de las siguientes órdenes de trabajo:\nOrden DISMAC: ${ordenDismac}\nNombre del cliente: ${nombreCliente}\nActivo: ${activo}\nNumero de orden: ${nroOrdenMarca}\nDías en el ST de marca: ${diasST}`;
                const encodedMsg = encodeURIComponent(textMsg);

                const numList = (workshop.CONTACTO || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
                const buttonsHtml = numList.map(num => {
                    const cleanNum = num.replace(/\D/g, '');
                    return `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:5px;">
                            <a href="tel:${cleanNum}" style="background:#f1f5f9; color:#1e293b; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-telephone-fill" style="color:#1e40af;"></i> Ll. ${cleanNum}</a>
                            <a href="https://wa.me/?text=${encodedMsg}" target="_blank" style="background:#dcfce7; color:#166534; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-whatsapp" style="color:#15803d;"></i> Mensaje WA</a>
                        </div>
                    `;
                }).join('');

                workshopHtml = `
                    <div style="margin-top:15px; padding:10px; background:#f0f7ff; border-radius:10px; border:1px solid #dbeafe;">
                        <p style="font-weight:700; font-size:0.85rem; margin-bottom:5px; color:#1e40af; display:flex; align-items:center; gap:5px;"><i class="bi bi-tools"></i> Taller: ${workshop.TALLER}</p>
                        ${buttonsHtml}
                    </div>
                `;
            } else {
                // Formatear mensaje genérico cuando no hay taller
                const textMsg = `Hola, por favor ayúdenos con información sobre el estado de las siguientes órdenes de trabajo:\nOrden DISMAC: ${ordenDismac}\nNombre del cliente: ${nombreCliente}\nActivo: ${activo}\nNumero de orden: ${nroOrdenMarca}\nDías en el ST de marca: ${diasST}`;
                const encodedMsg = encodeURIComponent(textMsg);

                workshopHtml = `
                    <div style="margin-top:15px; padding:10px; background:#f8fafc; border-radius:10px; border:1px dashed #cbd5e1; text-align:center;">
                        <p style="font-weight:600; font-size:0.85rem; margin-bottom:8px; color:#64748b;">No hay taller asignado</p>
                        <a href="https://wa.me/?text=${encodedMsg}" target="_blank" style="display:inline-block; background:#dcfce7; color:#166534; text-decoration:none; padding:8px 15px; border-radius:8px; font-size:0.8rem; font-weight:700;"><i class="bi bi-whatsapp" style="color:#15803d; margin-right:5px;"></i> Enviar consulta general por WA</a>
                    </div>
                `;
            }

            // Preparar contacto del cliente
            let clientContactHtml = "";
            const contactPhone = o.adicTelefono || "";
            if (contactPhone) {
                const numList = (contactPhone || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
                const buttonsHtml = numList.map(num => {
                    const cleanNum = num.replace(/\D/g, '');
                    const clientMsg = `Hola ${nombreCliente}, le saludamos de Dismac para brindarle información sobre su orden de trabajo ${ordenDismac} (${activo}).`;
                    const encodedClientMsg = encodeURIComponent(clientMsg);
                    return `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:5px;">
                            <a href="tel:${cleanNum}" style="background:#f1f5f9; color:#1e293b; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-telephone-fill" style="color:#16a34a;"></i> Llamar Cliente</a>
                            <a href="https://wa.me/591${cleanNum}?text=${encodedClientMsg}" target="_blank" style="background:#dcfce7; color:#166534; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-whatsapp" style="color:#15803d;"></i> Mensaje WA</a>
                        </div>
                    `;
                }).join('');

                clientContactHtml = `
                    <div style="margin-top:15px; padding:10px; background:#f4fbf7; border-radius:10px; border:1px solid #c8e6c9;">
                        <p style="font-weight:700; font-size:0.85rem; margin-bottom:5px; color:#2e7d32; display:flex; align-items:center; gap:5px;"><i class="bi bi-person-fill"></i> Contacto Cliente</p>
                        ${buttonsHtml}
                    </div>
                `;
            }
            // Preparar información del reporte adicional
            let adicionalesInfoHtml = "";
            if (o.adicionalesEnriched) {
                adicionalesInfoHtml = `
                    ${o.adicCuenta ? `<p style="margin:0;"><strong>Cuenta:</strong> ${o.adicCuenta}</p>` : ''}
                    ${o.adicTelefono ? `<p style="margin:0;"><strong>Teléfono:</strong> ${o.adicTelefono}</p>` : ''}
                    ${o.adicTecnico ? `<p style="margin:0;"><strong>Técnico:</strong> ${o.adicTecnico}</p>` : ''}
                    ${o.adicFechaCita ? `<p style="margin:0;"><strong>Fecha Cita:</strong> ${o.adicFechaCita}</p>` : ''}
                    ${o.adicEstadoCita ? `<p style="margin:0;"><strong>Estado Cita:</strong> ${o.adicEstadoCita} ${o.adicSubEstadoCita ? `(${o.adicSubEstadoCita})` : ''}</p>` : ''}
                    ${o.adicDetalleFalla ? `<p style="margin:0; white-space: pre-line;"><strong>Detalle Falla:</strong> ${o.adicDetalleFalla}</p>` : ''}
                    ${o.adicDetalleSolucion ? `<p style="margin:0; white-space: pre-line;"><strong>Detalle Solución:</strong> ${o.adicDetalleSolucion}</p>` : ''}
                    ${o.adicObservaciones ? `<p style="margin:0; white-space: pre-line;"><strong>Observaciones Técnico:</strong> ${o.adicObservaciones}</p>` : ''}
                    ${o.adicComentarios ? `<p style="margin:0; white-space: pre-line;"><strong>Comentarios:</strong> ${o.adicComentarios}</p>` : ''}
                `;
            }

            const transporteInfoHtml = o.esTransporte ? `
                ${o.Origen ? `<p style="margin:0;"><strong>Origen:</strong> ${escapeHTML(o.Origen)}</p>` : ''}
                ${o.Destino ? `<p style="margin:0;"><strong>Destino:</strong> ${escapeHTML(o.Destino)}</p>` : ''}
            ` : '';

            const estaExpandido = Boolean(opciones && opciones.expandirPrimero && idx === 0);

            return `
                <div class="accordion-item ${estaExpandido ? 'active' : ''}" style="margin-bottom:12px; border-radius:15px; border:1px solid #e2e8f0; border-left:4px solid ${o.esTransporte ? '#f59e0b' : '#3b82f6'}; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="flex:1; padding-right:10px;">
                                <p style="margin:0 0 8px 0; font-weight:800; color:#111; font-size:1.05rem; line-height:1.2; display:flex; align-items:center; gap:6px;">
                                    ${o['Cuenta: Nombre de la cuenta'] || 'CLIENTE S/N'}
                                </p>
                                <div style="display:flex; align-items:center; gap:12px; font-size:0.8rem; color:#64748b;">
                                    <span style="display:flex; align-items:center; gap:4px;"><i class="bi bi-geo-alt-fill" style="color:#ef4444;"></i> ${o['Territorio de servicio: Nombre'] || 'Sin región'}</span>
                                    <span style="display:flex; align-items:center; gap:4px;"><i class="bi bi-clock-fill" style="color:#f59e0b;"></i> ${o['Tiempo desde apertura (Días)'] || '0'}d</span>
                                    ${modBadge}
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between; height:100%; min-height:60px;">
                                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px;">
                                    ${o.esTransporte ? '<span style="background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:3px 9px; border-radius:12px; font-size:0.72rem; font-weight:800; white-space:nowrap;"><i class="bi bi-truck"></i> TRANSPORTE</span>' : ''}
                                    <span style="background:${o.esTransporte ? '#fff7ed' : '#e0e7ff'}; color:${o.esTransporte ? '#c2410c' : '#3b82f6'}; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700; white-space:nowrap;">${o.Estado || 'S/E'}</span>
                                    ${warrantyBadgeHtml(o)}
                                </div>
                                <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem;"></i>
                            </div>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#333; display:grid; grid-template-columns:1fr; gap:8px;">
                            <p style="margin:0;"><strong>Número de orden de trabajo:</strong> ${o['Número de orden de trabajo'] || '—'}</p>
                            <p style="margin:0;"><strong>Tipo de Servicio:</strong> ${o['Tipo de Servicio'] || '—'}</p>
                            <p style="margin:0;"><strong>Tiempo desde apertura (Días):</strong> ${o['Tiempo desde apertura (Días)'] || '—'}</p>
                            <p style="margin:0;"><strong>Nro de orden de trabajo (Marca):</strong> ${o['Nro de orden de trabajo (Marca)'] || '—'}</p>
                            <p style="margin:0;"><strong>Producto ST:</strong> ${o['Producto ST'] || '—'}</p>
                            <p style="margin:0;"><strong>Fecha de compra:</strong> ${o['Fecha de compra'] || '—'}</p>
                            ${warrantyDetailHtml(o)}
                            <p style="margin:0;"><strong>Fecha de ingreso a la marca:</strong> ${o['Fecha de ingreso a la marca'] || '—'}</p>
                            <p style="margin:0;"><strong>Referencia:</strong> ${o['Referencia'] || '—'}</p>
                            <p style="margin:0;"><strong>Estado:</strong> ${o.Estado || '—'}</p>
                            ${transporteInfoHtml}
                            ${workshopHtml}
                            ${adicionalesInfoHtml}
                            
                            ${clientContactHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        contentEl.innerHTML = html;
        renderEstadosPagination(ordenesFiltradas.length, page);
        showView(viewEstadosServicio);
    }

    function renderEstadosPagination(totalOrdenes, pagina) {
        const pagEl = document.getElementById('estados-pagination');
        if (!pagEl) return;

        const ORDENES_POR_PAGINA = 10;
        const totalPaginas = Math.max(1, Math.ceil(totalOrdenes / ORDENES_POR_PAGINA));
        const page = Math.min(Math.max(1, parseInt(pagina, 10) || 1), totalPaginas);

        if (totalPaginas <= 1) {
            pagEl.innerHTML = `<div style="text-align:center;color:#64748b;font-size:0.85rem;padding:10px;">${totalOrdenes} órdenes</div>`;
            return;
        }

        const inicio = (page - 1) * ORDENES_POR_PAGINA + 1;
        const fin = Math.min(page * ORDENES_POR_PAGINA, totalOrdenes);

        let html = `<div style="text-align:center;color:#64748b;font-size:0.85rem;padding:8px;">${inicio}–${fin} de ${totalOrdenes} órdenes</div>`;
        html += `<div style="display:flex;justify-content:center;align-items:center;gap:6px;flex-wrap:wrap;">`;

        html += `<button class="estados-page-btn" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} style="border:1px solid #e2e8f0;background:#fff;color:#3b82f6;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;"><i class="bi bi-chevron-left"></i></button>`;

        const visibles = [];
        if (totalPaginas <= 7) {
            for (let p = 1; p <= totalPaginas; p++) visibles.push(p);
        } else {
            visibles.push(1);
            if (page > 4) visibles.push('...');
            const desde = Math.max(2, page - 1);
            const hasta = Math.min(totalPaginas - 1, page + 1);
            for (let p = desde; p <= hasta; p++) visibles.push(p);
            if (page < totalPaginas - 3) visibles.push('...');
            visibles.push(totalPaginas);
        }

        visibles.forEach(v => {
            if (v === '...') {
                html += `<span style="color:#94a3b8;padding:0 2px;">…</span>`;
            } else {
                const active = (v === page);
                html += `<button class="estados-page-btn" data-page="${v}" ${active ? 'disabled' : ''} style="border:1px solid ${active ? '#3b82f6' : '#e2e8f0'};background:${active ? '#3b82f6' : '#fff'};color:${active ? '#fff' : '#3b82f6'};font-weight:700;min-width:34px;padding:6px 10px;border-radius:8px;cursor:pointer;">${v}</button>`;
            }
        });

        html += `<button class="estados-page-btn" data-page="${page + 1}" ${page === totalPaginas ? 'disabled' : ''} style="border:1px solid #e2e8f0;background:#fff;color:#3b82f6;font-weight:700;padding:6px 10px;border-radius:8px;cursor:pointer;"><i class="bi bi-chevron-right"></i></button>`;

        html += `</div>`;

        html += `<div style="display:flex;justify-content:center;gap:6px;margin-top:8px;flex-wrap:wrap;">`;
        html += `<button class="estados-page-btn" data-page="1" ${page === 1 ? 'disabled' : ''} style="border:1px solid #e2e8f0;background:#fff;color:#3b82f6;font-size:0.75rem;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">Primera</button>`;
        html += `<button class="estados-page-btn" data-page="${totalPaginas}" ${page === totalPaginas ? 'disabled' : ''} style="border:1px solid #e2e8f0;background:#fff;color:#3b82f6;font-size:0.75rem;font-weight:600;padding:6px 12px;border-radius:8px;cursor:pointer;">Última</button>`;
        html += `</div>`;

        pagEl.innerHTML = html;

        pagEl.querySelectorAll('.estados-page-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                const p = parseInt(this.dataset.page, 10);
                if (!this.disabled && p >= 1 && p <= totalPaginas) {
                    const region = estadosCurrentRegion;
                    const ordenes = estadosCurrentOrdenes;
                    const opciones = estadosCurrentOpciones;
                    if (region !== undefined && ordenes) renderOrdenes(region, ordenes, opciones, p);
                }
            });
        });
    }

    function showProtocol() {
        detailsBackView = viewDashboard;
        if (viewTitle) viewTitle.textContent = 'Protocolo de recepción';
        const contentHtml = `
            <div style="padding: 10px;">
                <h3 style="text-align:center; font-size:1.4rem; font-weight:700; color:#111; margin-bottom:20px;">Pasos a seguir</h3>
                
                <!-- Paso 1 -->
                <div class="accordion-item" style="margin-bottom:12px; border-radius:12px; border:1px solid #e2e8f0; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div style="background:#fce7f3; color:#111; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">1</div>
                                <span style="font-weight:700; font-size:1.1rem; color:#111;">Recepción y Validación Inicial</span>
                            </div>
                            <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem;"></i>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.95rem; color:#111; line-height:1.6;">
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Acción:</strong> Bienvenida y reporte de falla.</p>
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Protocolo:</strong> Ingresar a Sistema BLEND para verificar vigencia de garantía.</p>
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Inspección:</strong> Revisión minuciosa para descartar daños físicos (golpes, humedad, sellos rotos).</p>
                            <p style="margin:0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Descarte:</strong> Probar el equipo con el cliente; si es error de uso, brindar asesoría inmediata.</p>
                        </div>
                    </div>
                </div>

                <!-- Paso 2 -->
                <div class="accordion-item" style="margin-bottom:12px; border-radius:12px; border:1px solid #e2e8f0; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div style="background:#fce7f3; color:#111; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">2</div>
                                <span style="font-weight:700; font-size:1.1rem; color:#111;">Documentación y Registro</span>
                            </div>
                            <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem;"></i>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.95rem; color:#111; line-height:1.6;">
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Sistemas:</strong> Crear Caso en BLEND y generar número de Tidy de transporte.</p>
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Inventario:</strong> Registrar TODO (cables, control remoto, caja, protectores).</p>
                            <p style="margin:0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Evidencia:</strong> Fotos claras del S/N (serie), accesorios y estado estético general.</p>
                        </div>
                    </div>
                </div>

                <!-- Paso 3 -->
                <div class="accordion-item" style="margin-bottom:12px; border-radius:12px; border:1px solid #e2e8f0; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div style="background:#fce7f3; color:#111; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">3</div>
                                <span style="font-weight:700; font-size:1.1rem; color:#111;">Comunicación Interna</span>
                            </div>
                            <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem;"></i>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.95rem; color:#111; line-height:1.6;">
                            <p style="margin:0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Notificación:</strong> Enviar al GRUPO DE RECEPCIÓN vía WhatsApp: Número de Tidy, Datos del cliente (Nombre, CI, Tel), Datos del producto (Modelo) y las fotos de respaldo.</p>
                        </div>
                    </div>
                </div>

                <!-- Paso 4 -->
                <div class="accordion-item" style="margin-bottom:12px; border-radius:12px; border:1px solid #e2e8f0; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div style="background:#fce7f3; color:#111; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">4</div>
                                <span style="font-weight:700; font-size:1.1rem; color:#111;">Logística y Seguimiento</span>
                            </div>
                            <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem;"></i>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.95rem; color:#111; line-height:1.6;">
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Taller:</strong> Al llegar el equipo al taller autorizado, solicitar la Nota de Ingreso.</p>
                            <p style="margin:0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Control:</strong> Enviar la nota al GRUPO DE RECEPCIÓN con su Tidy para seguimiento del Encargado Regional.</p>
                        </div>
                    </div>
                </div>

                <!-- Paso 5 -->
                <div class="accordion-item" style="margin-bottom:12px; border-radius:12px; border:1px solid #e2e8f0; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:15px;">
                                <div style="background:#fce7f3; color:#111; width:35px; height:35px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">5</div>
                                <span style="font-weight:700; font-size:1.1rem; color:#111;">Cierre y Entrega</span>
                            </div>
                            <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem;"></i>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.95rem; color:#111; line-height:1.6;">
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Confirmación:</strong> Al recibir aviso de 'Listo', indagar qué reparación específica se realizó.</p>
                            <p style="margin:0 0 10px 0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Informe:</strong> Avisar al Encargado Regional sobre disponibilidad e informe técnico.</p>
                            <p style="margin:0;"><strong style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-weight:600;">Gestión:</strong> El Encargado coordinará con Call Center para que ellos informen al cliente que puede pasar por su equipo.</p>
                        </div>
                    </div>
                </div>

            </div>
        `;

        if (viewContent) {
            viewContent.innerHTML = contentHtml;
        }
        showView(viewDetails);
    }



    // ── REPORTES Y GRÁFICAS ────────────────────────────────────────────────
    let reporteCharts = {};
    let reporteSelectsInit = false;
    const CHART_PALETTE = ['#E31837', '#3b82f6', '#f59e0b', '#16a34a', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1', '#14b8a6'];

    const MARCAS_CONOCIDAS = [
        'BLACK & DECKER', 'BLACK AND DECKER', 'FOREST & GARDEN', 'LA PAVONI',
        'AIR MONSTER', 'GENERAL LUX', 'RED DISMAC', 'MASTER-G', 'BABYLISSPRO',
        'GOOD YEAR', 'HI-TECH', 'HI TECH', 'ARNO', 'AIWA', 'BABYLISS', 'BEURER',
        'BOSCH', 'BRIARA', 'BRITANIA', 'BROTHER', 'CONSUL', 'DAKO', 'DUCATI',
        'ELECTROLUX', 'ENXUTA', 'EPSON', 'FLUX', 'GA.MA', 'GAMA', 'GLEECON',
        'HISENSE', 'HITECH', 'HONOR', 'HP', 'HUAVI', 'IKA', 'INDURAMA', 'INFINIX',
        'JVC', 'KARCHER', 'KENWOOD', 'KERNIG', 'KYOCERA', 'LEMYR', 'LG', 'LOGITECH',
        'LORENZETTI', 'MAGEFESA', 'MISTRAL', 'MOULINEX', 'MUELLER', 'OSTER',
        'PANASONIC', 'PHILIPS', 'PIONEER', 'PREMIER', 'REALME', 'RHEEM', 'SAMSUNG',
        'SINGER', 'SONY', 'SPLENDID', 'TAURUS', 'TCL', 'TECNO', 'TOSHIBA',
        'TRAMONTINA', 'UFESA', 'WAHL', 'WESTINGHOUSE', 'WHIRLPOOL', 'WILSON',
        'XIAOMI', 'ZTE', 'ACER', 'ASUS', 'LENOVO', 'DEWALT', 'STANLEY', 'METABO',
        'HONDA', 'SCHULZ', 'SHINDAIWA', 'OREGON', 'JBL', 'MASTERTRON', 'BASSEL',
        'KONKA', 'HAIER', 'MIDEA', 'IFFALCON', 'CROWN', 'FUJITEL', 'MAXTRON',
        'HOLSTEIN', 'EVERSOUND', 'MALLORY', 'DAEWOO', 'CHIQ', 'WESTPOINT',
        'MELING', 'NAIH', 'WINSTAR', 'AVI STAR', 'MOIU', 'REDBEAT', 'HAVIT',
        'BOYA', 'GLADIATOR', 'ECOGAS', 'IZZI', 'KRUPS', 'EXCELSA', 'BLANIK',
        'GELOPAR', 'METALFRIO', 'VENTUS', 'SKEI', 'APPLE', 'GENERAL ELECTRIC',
        'BEATS', 'FISCHER', 'HYUNDAI', 'INDEPLAS', 'PEABODY', 'CATA', 'ECOSMART',
        'DECORATO', 'DOSSAR', 'SERVICENTRO ELECTRONICO', 'BLOOM', 'MITTE', 'FERRER'
    ];

    function normalizarTexto(str) {
        return (str || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    }

    function marcaDeProducto(producto) {
        const p = normalizarTexto(producto);
        let mejor = '';
        for (const marca of MARCAS_CONOCIDAS) {
            const nm = normalizarTexto(marca);
            const multi = nm.includes(' ');
            const ok = multi
                ? p.includes(nm)
                : new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(p);
            if (ok && nm.length > mejor.length) mejor = marca;
        }
        return mejor;
    }

    function marcaDeOrden(o) {
        const st = (o['¿Qué servicio técnico ?'] || '').trim();
        if (st) return st;
        return marcaDeProducto(o['Producto ST']);
    }

    function fechaArchivo() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function dataFiltradaPorRol() {
        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        return appOrdersData.filter(o => estaEnAlcanceRegional(o, rol, regional));
    }

    function getReportesData() {
        let data = dataFiltradaPorRol();

        const fRegion = document.getElementById('reporte-filtro-region')?.value || 'todas';
        const fEstado = document.getElementById('reporte-filtro-estado')?.value || 'todos';
        const fMarca = document.getElementById('reporte-filtro-marca')?.value || 'todas';
        const fTaller = document.getElementById('reporte-filtro-taller')?.value || 'todos';
        const q = normalizarTexto(document.getElementById('reporte-buscador')?.value);
        const fDesde = document.getElementById('reporte-fecha-desde')?.value || '';
        const fHasta = document.getElementById('reporte-fecha-hasta')?.value || '';

        if (fRegion !== 'todas') {
            if (fRegion === 'Regionales') {
                data = data.filter(o => isOrderInRegion(o, 'Regionales'));
            } else {
                const regNorm = fRegion.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (q.length > 0 && (regNorm === 'tarija' || regNorm === 'sucre')) {
                    data = data.filter(o => isOrderInRegion(o, fRegion) || isOrderInRegion(o, 'Municipios'));
                } else {
                    data = data.filter(o => isOrderInRegion(o, fRegion));
                }
            }
        }
        if (fEstado !== 'todos') {
            data = data.filter(o => normalizarTexto(o.Estado) === normalizarTexto(fEstado));
        }
        if (fMarca !== 'todas') {
            data = data.filter(o => normalizarTexto(marcaDeOrden(o)) === normalizarTexto(fMarca));
        }
        if (fTaller !== 'todos') {
            data = data.filter(o => normalizarTexto(o['¿Qué servicio técnico ?']) === normalizarTexto(fTaller));
        }
        if (q) {
            data = data.filter(o => {
                const campos = [
                    o['Número de orden de trabajo'], o['Referencia'],
                    o['Cuenta: Nombre de la cuenta'], o['Producto ST'],
                    o.Estado, o.Sub_estado, o['Territorio de servicio: Nombre'],
                    o['¿Qué servicio técnico ?'], marcaDeOrden(o)
                ];
                return campos.some(c => normalizarTexto(c).includes(q));
            });
        }
        if (fDesde || fHasta) {
            data = data.filter(o => {
                const f = parseFecha(o['Fecha de la última modificación']);
                if (!f) return false;
                if (fDesde) {
                    const d = parseFecha(fDesde);
                    if (d && f < d) return false;
                }
                if (fHasta) {
                    const h = parseFecha(fHasta);
                    if (h) {
                        h.setDate(h.getDate() + 1);
                        if (f >= h) return false;
                    }
                }
                return true;
            });
        }
        return data;
    }

    function initReporteSelects() {
        if (reporteSelectsInit) return;
        reporteSelectsInit = true;
        ['reporte-filtro-region', 'reporte-filtro-estado', 'reporte-filtro-marca', 'reporte-filtro-taller'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', renderReportes);
        });
        const buscador = document.getElementById('reporte-buscador');
        if (buscador) buscador.addEventListener('input', renderReportes);
        ['reporte-fecha-desde', 'reporte-fecha-hasta'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', renderReportes);
                el.addEventListener('input', renderReportes);
            }
        });
        ['sla-dias-sin-cambios', 'sla-dias-creacion'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', renderReportes);
                el.addEventListener('input', renderReportes);
            }
        });
        const slaMostrar = document.getElementById('sla-mostrar-atendidas');
        if (slaMostrar) slaMostrar.addEventListener('change', renderReportes);

        const slaContent = document.getElementById('sla-alertas-content');
        if (slaContent) {
            slaContent.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-accion]');
                if (!btn) return;
                const odt = btn.dataset.odt;
                if (!odt) return;
                if (btn.dataset.accion === 'atendida') slaMarcarAtendida(odt);
                else if (btn.dataset.accion === 'restaurar') slaRestaurar(odt);
            });
        }
    }

    function getSlaAtendidas() {
        try {
            return JSON.parse(localStorage.getItem('sla_atendidas') || '[]');
        } catch (e) {
            return [];
        }
    }

    function slaMarcarAtendida(odt) {
        const list = getSlaAtendidas();
        if (!list.includes(odt)) {
            list.push(odt);
            localStorage.setItem('sla_atendidas', JSON.stringify(list));
        }
        renderReportes();
    }

    function slaRestaurar(odt) {
        const list = getSlaAtendidas().filter(x => x !== odt);
        localStorage.setItem('sla_atendidas', JSON.stringify(list));
        renderReportes();
    }

    function fillReporteSelects() {
        const uniq = (key) => [...new Set(appOrdersData.map(o => (o[key] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        const regiones = uniq('Territorio de servicio: Nombre');
        const estados = uniq('Estado');
        const marcas = [...new Set(appOrdersData.map(o => marcaDeOrden(o)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
        const talleres = uniq('¿Qué servicio técnico ?');

        const sRegion = document.getElementById('reporte-filtro-region');
        const sEstado = document.getElementById('reporte-filtro-estado');
        const sMarca = document.getElementById('reporte-filtro-marca');
        const sTaller = document.getElementById('reporte-filtro-taller');
        if (!sRegion || !sEstado || !sMarca || !sTaller) return;

        const selValue = (sel) => sel ? sel.value : null;

        const prevRegion = selValue(sRegion), prevEstado = selValue(sEstado), prevMarca = selValue(sMarca), prevTaller = selValue(sTaller);

        sRegion.innerHTML = '<option value="Regionales">Regionales</option><option value="todas">Todas las regiones</option>' +
            regiones.map(r => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join('');
        sEstado.innerHTML = '<option value="todos">Todos los estados</option>' +
            estados.map(e => `<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join('');
        sMarca.innerHTML = '<option value="todas">Todas las marcas</option>' +
            marcas.map(m => `<option value="${escapeHTML(m)}">${escapeHTML(m)}</option>`).join('');
        sTaller.innerHTML = '<option value="todos">Todos los talleres</option>' +
            talleres.map(t => `<option value="${escapeHTML(t)}">${escapeHTML(t)}</option>`).join('');

        sRegion.value = (prevRegion === 'Regionales' || regiones.includes(prevRegion)) ? prevRegion : 'todas';
        sEstado.value = estados.includes(prevEstado) ? prevEstado : 'todos';
        sMarca.value = marcas.includes(prevMarca) ? prevMarca : 'todas';
        sTaller.value = talleres.includes(prevTaller) ? prevTaller : 'todos';
    }

    function renderReportesSummary(data) {
        const grid = document.getElementById('reporte-kpi-grid');
        if (!grid) return;

        const activas = data.filter(o => !esEstadoFinal(o.Estado));
        const estancadas = activas.filter(o => {
            const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            return (diasMod !== null && diasMod >= DIAS_SIN_CAMBIOS_ALERTA) || diasCreacion >= DIAS_APERTURA_ALERTA;
        });
        const enGarantia = data.filter(o => getWarrantyInfo(o).status === 'en_garantia').length;
        const regiones = new Set(data.map(o => (o['Territorio de servicio: Nombre'] || 'Sin región').trim())).size;
        const promDias = data.length
            ? Math.round(data.reduce((s, o) => s + (parseInt(o['Tiempo desde apertura (Días)'] || '0', 10) || 0), 0) / data.length)
            : 0;

        const cards = [
            { label: 'Órdenes totales', value: data.length, color: '#3b82f6', icon: 'bi-file-earmark-text' },
            { label: 'Activas', value: activas.length, color: '#16a34a', icon: 'bi-lightning-charge-fill' },
            { label: 'Estancadas', value: estancadas.length, color: '#ef4444', icon: 'bi-exclamation-triangle-fill' },
            { label: 'En garantía', value: enGarantia, color: '#d97706', icon: 'bi-patch-check-fill' },
            { label: 'Prom. días abiertas', value: promDias, color: '#8b5cf6', icon: 'bi-clock-history' },
            { label: 'Regiones', value: regiones, color: '#111', icon: 'bi-geo-alt-fill' }
        ];

        grid.innerHTML = cards.map(c => `
            <div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="background:${c.color}1a; color:${c.color}; width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="bi ${c.icon}"></i></div>
                <div>
                    <div style="font-size:1.4rem; font-weight:800; color:#111; line-height:1;">${c.value}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${c.label}</div>
                </div>
            </div>
        `).join('');
    }

    function countBy(data, key) {
        const map = new Map();
        data.forEach(o => {
            const v = (o[key] || 'Sin dato').trim() || 'Sin dato';
            map.set(v, (map.get(v) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }

    function countByMarcas(data) {
        const map = new Map();
        data.forEach(o => {
            const v = marcaDeOrden(o) || 'Sin dato';
            map.set(v, (map.get(v) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }

    function avgDiasPorEstado(data) {
        const map = new Map();
        data.forEach(o => {
            const v = (o.Estado || 'Sin dato').trim() || 'Sin dato';
            const d = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10) || 0;
            if (!map.has(v)) map.set(v, { sum: 0, n: 0 });
            map.get(v).sum += d;
            map.get(v).n += 1;
        });
        return [...map.entries()]
            .map(([k, v]) => [k, v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0])
            .sort((a, b) => b[1] - a[1]);
    }

    function esOrdenCerrada(o) {
        const e = normalizarTexto(o.Estado);
        return e.includes('entregado') || e.includes('cerrado');
    }

    function ultimosNDias(n) {
        const dias = [];
        const hoy = new Date();
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date(hoy);
            d.setDate(hoy.getDate() - i);
            dias.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        return dias;
    }

    function bucketPorDia(lista, campo) {
        const map = new Map();
        lista.forEach(o => {
            const f = parseFecha(o[campo]);
            if (!f) return;
            const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`;
            map.set(key, (map.get(key) || 0) + 1);
        });
        return map;
    }

    function serieDias(lista, campo, n) {
        const bucket = bucketPorDia(lista, campo);
        const dias = ultimosNDias(n);
        return {
            labels: dias.map(d => `${d.slice(8)}/${d.slice(5, 7)}`),
            values: dias.map(d => bucket.get(d) || 0)
        };
    }

    function conteoPorMes(lista, campo) {
        const map = new Map();
        lista.forEach(o => {
            const f = parseFecha(o[campo]);
            if (!f) return;
            const key = `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`;
            map.set(key, (map.get(key) || 0) + 1);
        });
        return map;
    }

    function slaContactoHtml(o) {
        const nombreCliente = o['Cuenta: Nombre de la cuenta'] || 'N/A';
        const ordenDismac = o['Referencia'] || o['Número de orden de trabajo'] || 'N/A';
        const activo = o['Producto ST'] || 'N/A';
        const nroOrdenMarca = o['Nro de orden de trabajo (Marca)'] || 'S/O';
        const diasST = o['Tiempo desde apertura (Días)'] || '0';

        const workshopName = (o['¿Qué servicio técnico ?'] || '').trim().toUpperCase();
        let workshop = null;
        if (workshopName) {
            const matchFn = (w) => {
                if (!w.TALLER) return false;
                const t = w.TALLER.toUpperCase();
                const tClean = t.replace(/^ST\s+/, '');
                return t === workshopName || tClean === workshopName ||
                       t.includes(workshopName) || workshopName.includes(tClean);
            };
            workshop = appWorkshopData.find(matchFn);
            if (!workshop && workshopName.length > 2) {
                workshop = appWorkshopData.find(w => {
                    const marcas = (w.MARCA || '').toUpperCase().split(',').map(s => s.trim());
                    return marcas.some(m => m.includes(workshopName) || workshopName.includes(m));
                });
            }
        }

        let tallerHtml = '';
        if (workshop) {
            const textMsg = `Hola, servicio técnico ${workshop.TALLER}, por favor ayúdenos con información sobre el estado de las siguientes órdenes de trabajo:\nOrden DISMAC: ${ordenDismac}\nNombre del cliente: ${nombreCliente}\nActivo: ${activo}\nNumero de orden: ${nroOrdenMarca}\nDías en el ST de marca: ${diasST}`;
            const encodedMsg = encodeURIComponent(textMsg);
            const numList = (workshop.CONTACTO || '').split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
            const buttonsHtml = numList.map(num => {
                const cleanNum = num.replace(/\D/g, '');
                return `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:5px;">
                        <a href="tel:${cleanNum}" style="background:#f1f5f9; color:#1e293b; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-telephone-fill" style="color:#1e40af;"></i> Ll. ${cleanNum}</a>
                        <a href="https://wa.me/?text=${encodedMsg}" target="_blank" style="background:#dcfce7; color:#166534; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-whatsapp" style="color:#15803d;"></i> Mensaje WA</a>
                    </div>`;
            }).join('');
            tallerHtml = `
                <div style="margin-top:10px; padding:10px; background:#f0f7ff; border-radius:10px; border:1px solid #dbeafe;">
                    <p style="font-weight:700; font-size:0.85rem; margin:0 0 5px 0; color:#1e40af; display:flex; align-items:center; gap:5px;"><i class="bi bi-tools"></i> Taller: ${escapeHTML(workshop.TALLER)}</p>
                    ${buttonsHtml}
                </div>`;
        }

        let clienteHtml = '';
        const contactPhone = o.adicTelefono || '';
        if (contactPhone) {
            const numList = (contactPhone || '').split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
            const buttonsHtml = numList.map(num => {
                const cleanNum = num.replace(/\D/g, '');
                const clientMsg = `Hola ${nombreCliente}, le saludamos de Dismac para brindarle información sobre su orden de trabajo ${ordenDismac} (${activo}).`;
                const encodedClientMsg = encodeURIComponent(clientMsg);
                return `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:5px;">
                        <a href="tel:${cleanNum}" style="background:#f1f5f9; color:#1e293b; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-telephone-fill" style="color:#16a34a;"></i> Llamar Cliente</a>
                        <a href="https://wa.me/591${cleanNum}?text=${encodedClientMsg}" target="_blank" style="background:#dcfce7; color:#166534; text-decoration:none; padding:8px; border-radius:5px; font-size:0.75rem; text-align:center; font-weight:600;"><i class="bi bi-whatsapp" style="color:#15803d;"></i> Mensaje WA</a>
                    </div>`;
            }).join('');
            clienteHtml = `
                <div style="margin-top:10px; padding:10px; background:#f4fbf7; border-radius:10px; border:1px solid #c8e6c9;">
                    <p style="font-weight:700; font-size:0.85rem; margin:0 0 5px 0; color:#2e7d32; display:flex; align-items:center; gap:5px;"><i class="bi bi-person-fill"></i> Contacto Cliente</p>
                    ${buttonsHtml}
                </div>`;
        }

        if (!tallerHtml && !clienteHtml) {
            return '<p style="margin:0; font-size:0.8rem; color:#64748b;"><i class="bi bi-info-circle"></i> No hay contactos registrados para esta orden.</p>';
        }
        return tallerHtml + clienteHtml;
    }

    function slaDetallesHtml(o) {
        const subEstado = o.Sub_estado ? ` (${escapeHTML(o.Sub_estado)})` : '';
        return `
            <div style="padding:15px 0; border-top:1px solid #f1f5f9; font-size:0.85rem; color:#333; display:grid; grid-template-columns:1fr; gap:8px;">
                <p style="margin:0;"><strong>Número de orden de trabajo:</strong> ${escapeHTML(o['Número de orden de trabajo'] || '—')}</p>
                <p style="margin:0;"><strong>Tipo de Servicio:</strong> ${escapeHTML(o['Tipo de Servicio'] || '—')}</p>
                <p style="margin:0;"><strong>Tiempo desde apertura (Días):</strong> ${escapeHTML(o['Tiempo desde apertura (Días)'] || '—')}</p>
                <p style="margin:0;"><strong>Nro de orden de trabajo (Marca):</strong> ${escapeHTML(o['Nro de orden de trabajo (Marca)'] || '—')}</p>
                <p style="margin:0;"><strong>Producto ST:</strong> ${escapeHTML(o['Producto ST'] || '—')}</p>
                <p style="margin:0;"><strong>Fecha de compra:</strong> ${escapeHTML(o['Fecha de compra'] || '—')}</p>
                ${warrantyDetailHtml(o)}
                <p style="margin:0;"><strong>Fecha de ingreso a la marca:</strong> ${escapeHTML(o['Fecha de ingreso a la marca'] || '—')}</p>
                <p style="margin:0;"><strong>Fecha de la última modificación:</strong> ${escapeHTML(o['Fecha de la última modificación'] || '—')}</p>
                <p style="margin:0;"><strong>Referencia:</strong> ${escapeHTML(o['Referencia'] || '—')}</p>
                <p style="margin:0;"><strong>Estado:</strong> ${escapeHTML(o.Estado || '—')}${subEstado}</p>
                <p style="margin:0;"><strong>Marca / ST:</strong> ${escapeHTML(marcaDeOrden(o) || '—')}</p>
                ${slaContactoHtml(o)}
            </div>`;
    }

    function renderSlaAlertas(data) {
        const content = document.getElementById('sla-alertas-content');
        const countEl = document.getElementById('sla-alertas-count');

        const diasSinCambios = parseInt(document.getElementById('sla-dias-sin-cambios')?.value || String(DIAS_SIN_CAMBIOS_ALERTA), 10) || DIAS_SIN_CAMBIOS_ALERTA;
        const diasCreacion = parseInt(document.getElementById('sla-dias-creacion')?.value || String(DIAS_APERTURA_ALERTA), 10) || DIAS_APERTURA_ALERTA;

        const alertas = data.filter(o => !esEstadoFinal(o.Estado)).map(o => {
            const diasCreacionOrden = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            const razones = [];
            if (diasMod !== null && diasMod >= diasSinCambios) razones.push(`${diasMod}d sin cambios`);
            if (diasCreacionOrden >= diasCreacion) razones.push(`${diasCreacionOrden}d desde creación`);
            if (razones.length === 0) return null;
            return { o, diasMod, diasCreacionOrden, razones };
        }).filter(Boolean);

        alertas.sort((a, b) => {
            const da = Math.max(a.diasCreacionOrden, a.diasMod || 0);
            const db = Math.max(b.diasCreacionOrden, b.diasMod || 0);
            return db - da;
        });

        const atendidas = getSlaAtendidas();
        const pendientes = alertas.filter(a => !atendidas.includes(a.o['Número de orden de trabajo']));
        const atendidasList = alertas.filter(a => atendidas.includes(a.o['Número de orden de trabajo']));
        const mostrarAtendidas = document.getElementById('sla-mostrar-atendidas')?.checked;

        if (countEl) countEl.textContent = pendientes.length;
        if (!content) return;

        const renderCard = (a, esAtendida) => {
            const maxDias = Math.max(a.diasCreacionOrden, a.diasMod || 0);
            const critica = maxDias >= 15;
            const bg = esAtendida ? '#f1f5f9' : (critica ? '#fef2f2' : '#fffbeb');
            const border = esAtendida ? '#cbd5e1' : (critica ? '#fecaca' : '#fde68a');
            const color = esAtendida ? '#64748b' : (critica ? '#b91c1c' : '#b45309');
            const label = esAtendida ? 'ATENDIDA' : (critica ? 'CRÍTICA' : 'ALTA');
            const cliente = escapeHTML(a.o['Cuenta: Nombre de la cuenta'] || 'S/N');
            const producto = escapeHTML(a.o['Producto ST'] || '');
            const region = escapeHTML(a.o['Territorio de servicio: Nombre'] || '');
            const estado = escapeHTML(a.o.Estado || 'S/E');
            const odt = escapeHTML(a.o['Número de orden de trabajo'] || '');
            const odtAttr = escapeHTML(a.o['Número de orden de trabajo'] || '');
            const accionBtn = odtAttr ? (esAtendida
                ? `<button data-accion="restaurar" data-odt="${odtAttr}" style="margin-top:10px; width:100%; background:#e2e8f0; color:#334155; border:none; padding:10px; border-radius:10px; font-family:'Outfit',sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer;"><i class="bi bi-arrow-counterclockwise"></i> Restaurar</button>`
                : `<button data-accion="atendida" data-odt="${odtAttr}" style="margin-top:10px; width:100%; background:#111; color:white; border:none; padding:10px; border-radius:10px; font-family:'Outfit',sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer;"><i class="bi bi-check-lg"></i> Marcar como atendida</button>`) : '';
            return `
                <div class="accordion-item" style="background:${bg}; border:1px solid ${border}; border-left:5px solid ${color}; border-radius:12px; margin-bottom:0.7rem; overflow:hidden;${esAtendida ? ' opacity:0.75;' : ''}">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:0.9rem 1rem; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div style="flex:1;">
                                <p style="margin:0 0 4px 0; font-weight:800; color:#111; font-size:0.95rem;">${cliente}</p>
                                <p style="margin:0 0 4px 0; font-size:0.82rem; color:#475569;">${producto || '—'}</p>
                                <p style="margin:0; font-size:0.75rem; color:#64748b;"><i class="bi bi-geo-alt-fill"></i> ${region} · ${estado} · ODT ${odt}</p>
                                <p style="margin:5px 0 0 0; font-size:0.75rem; color:${color}; font-weight:600;">${a.razones.join(' · ')}</p>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0;">
                                <span style="background:${color}; color:white; padding:3px 10px; border-radius:10px; font-size:0.65rem; font-weight:800;">${label}</span>
                                <i class="bi bi-chevron-down acc-arrow" style="color:#cbd5e1; font-size:1rem;"></i>
                            </div>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0;">
                        ${slaDetallesHtml(a.o)}
                        ${accionBtn}
                    </div>
                </div>
            `;
        };

        let html = pendientes.map(a => renderCard(a, false)).join('');
        if (mostrarAtendidas) {
            if (atendidasList.length === 0) {
                html += '<div style="text-align:center; padding:1rem; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; color:#64748b; font-size:0.85rem; font-weight:600;">No hay alertas atendidas aún.</div>';
            } else {
                html += atendidasList.map(a => renderCard(a, true)).join('');
            }
        }

        if (!html) {
            html = '<div style="text-align:center; padding:1.5rem; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; color:#166534; font-weight:600;"><i class="bi bi-check-circle-fill" style="margin-right:6px;"></i>Sin órdenes que superen los umbrales SLA.</div>';
        }
        content.innerHTML = html;
    }

    function destroyReporteCharts() {
        Object.keys(reporteCharts).forEach(k => {
            if (reporteCharts[k]) { reporteCharts[k].destroy(); delete reporteCharts[k]; }
        });
    }

    function renderReportesCharts(data) {
        if (!window.Chart) {
            console.warn('Chart.js no disponible. Verifica la conexión a internet.');
            return;
        }
        destroyReporteCharts();

        const regiones = countBy(data, 'Territorio de servicio: Nombre');
        const estados = countBy(data, 'Estado');
        const marcas = countByMarcas(data).slice(0, 12);
        const tiempoPorEstado = avgDiasPorEstado(data);
        const tendIngresadas = serieDias(data, 'Fecha de ingreso a la marca', 30);

        const ctxR = document.getElementById('reporte-chart-regiones');
        const ctxE = document.getElementById('reporte-chart-estados');
        const ctxM = document.getElementById('reporte-chart-marcas');
        const ctxT = document.getElementById('reporte-chart-tiempo');
        const ctxTend = document.getElementById('reporte-chart-tendencia');
        if (!ctxR || !ctxE || !ctxM || !ctxT || !ctxTend) return;

        reporteCharts.tendencia = new Chart(ctxTend, {
            type: 'line',
            data: {
                labels: tendIngresadas.labels,
                datasets: [
                    { label: 'Ingresadas', data: tendIngresadas.values, borderColor: '#E31837', backgroundColor: 'rgba(227,24,55,0.10)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });

        reporteCharts.regiones = new Chart(ctxR, {
            type: 'bar',
            data: {
                labels: regiones.map(r => r[0]),
                datasets: [{ label: 'Órdenes', data: regiones.map(r => r[1]), backgroundColor: '#E31837', borderRadius: 6 }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });

        reporteCharts.estados = new Chart(ctxE, {
            type: 'doughnut',
            data: {
                labels: estados.map(e => e[0]),
                datasets: [{ data: estados.map(e => e[1]), backgroundColor: estados.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderWidth: 2, borderColor: '#fff' }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });

        reporteCharts.marcas = new Chart(ctxM, {
            type: 'bar',
            data: {
                labels: marcas.map(m => m[0]),
                datasets: [{ label: 'Órdenes', data: marcas.map(m => m[1]), backgroundColor: marcas.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]), borderRadius: 6 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });

        reporteCharts.tiempo = new Chart(ctxT, {
            type: 'bar',
            data: {
                labels: tiempoPorEstado.map(t => t[0]),
                datasets: [{ label: 'Prom. días', data: tiempoPorEstado.map(t => t[1]), backgroundColor: '#8b5cf6', borderRadius: 6 }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
            }
        });
    }

    function renderReportes() {
        const data = getReportesData();
        renderReportesSummary(data);
        renderSlaAlertas(data);
        renderReportesCharts(data);
    }

    function showReportes() {
        debugLog('📊 Abriendo Reportes y Gráficas');
        initReporteSelects();
        fillReporteSelects();
        renderReportes();
        showView(viewReportes);
    }

    // ── DASHBOARD EJECUTIVO ────────────────────────────────────────────────
    let ejecutivoCharts = {};

    function destroyEjecutivoCharts() {
        Object.keys(ejecutivoCharts).forEach(k => {
            if (ejecutivoCharts[k]) { ejecutivoCharts[k].destroy(); delete ejecutivoCharts[k]; }
        });
    }

    function topTalleresAtraso(lista, n) {
        const map = new Map();
        lista.forEach(o => {
            const t = (o['¿Qué servicio técnico ?'] || '').trim() || 'Sin taller';
            const d = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10) || 0;
            if (!map.has(t)) map.set(t, { count: 0, sum: 0, max: 0 });
            const e = map.get(t);
            e.count++; e.sum += d; e.max = Math.max(e.max, d);
        });
        return [...map.entries()].sort((a, b) => b[1].max - a[1].max).slice(0, n);
    }

    function avgDiasPorRegion(lista) {
        const map = new Map();
        lista.forEach(o => {
            const r = (o['Territorio de servicio: Nombre'] || '').trim() || 'Sin región';
            const d = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10) || 0;
            if (!map.has(r)) map.set(r, { sum: 0, n: 0 });
            map.get(r).sum += d;
            map.get(r).n += 1;
        });
        return [...map.entries()]
            .map(([r, v]) => [r, v.n ? Math.round((v.sum / v.n) * 10) / 10 : 0])
            .sort((a, b) => b[1] - a[1]);
    }

    function showEjecutivo() {
        debugLog('📈 Abriendo Dashboard Ejecutivo');
        showView(viewEjecutivo);
        renderEjecutivo();
    }

    function renderEjecutivo() {
        const content = document.getElementById('ejecutivo-content');
        if (!content) return;

        const data = dataFiltradaPorRol();

        const activas = data.filter(o => !esEstadoFinal(o.Estado));
        const cerradas = data.filter(o => esOrdenCerrada(o));
        const estancadas = activas.filter(o => {
            const dc = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const dm = diasDesde(o['Fecha de la última modificación']);
            return (dm !== null && dm >= DIAS_SIN_CAMBIOS_ALERTA) || dc >= DIAS_APERTURA_ALERTA;
        });
        const enGarantia = data.filter(o => getWarrantyInfo(o).status === 'en_garantia').length;

        // Comparativa de meses (fecha de ingreso a la marca como proxy de creación)
        const porMes = conteoPorMes(data, 'Fecha de ingreso a la marca');
        const ahora = new Date();
        const claveActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
        const anterior = new Date(ahora);
        anterior.setMonth(anterior.getMonth() - 1);
        const claveAnterior = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`;
        const nActual = porMes.get(claveActual) || 0;
        const nAnterior = porMes.get(claveAnterior) || 0;
        const dif = nAnterior ? Math.round(((nActual - nAnterior) / nAnterior) * 100) : null;

        const nombreMes = (clave) => {
            const [y, m] = clave.split('-').map(Number);
            return new Date(y, m - 1, 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
        };

        const kpi = (label, value, color, icon) => `
            <div style="background:white; border:1px solid ${color}33; border-radius:14px; padding:1rem; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="background:${color}1a; color:${color}; width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="bi ${icon}"></i></div>
                <div>
                    <div style="font-size:1.4rem; font-weight:800; color:#111; line-height:1;">${value}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${label}</div>
                </div>
            </div>`;

        const difHtml = dif === null
            ? '<span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">Sin datos del mes anterior</span>'
            : `<span style="font-size:0.85rem; font-weight:800; color:${dif >= 0 ? '#16a34a' : '#ef4444'};">${dif >= 0 ? '▲ +' : '▼ '}${Math.abs(dif)}%</span>`;

        const trendData = serieDias(data, 'Fecha de ingreso a la marca', 30);

        const topTalleres = topTalleresAtraso(activas, 5);
        const maxTallerDias = topTalleres.length ? topTalleres[0][1].max : 1;

        const regionesProm = avgDiasPorRegion(activas);
        const maxRegionDias = regionesProm.length ? regionesProm[0][1] : 1;

        content.innerHTML = `
            <section style="margin-bottom:1.2rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    ${kpi('Órdenes activas', activas.length, '#3b82f6', 'bi-lightning-charge-fill')}
                    ${kpi('Cerradas', cerradas.length, '#16a34a', 'bi-check2-circle')}
                    ${kpi('Estancadas', estancadas.length, '#ef4444', 'bi-exclamation-triangle-fill')}
                    ${kpi('En garantía', enGarantia, '#d97706', 'bi-patch-check-fill')}
                </div>
            </section>

            <section style="margin-bottom:1.2rem;">
                <div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; display:flex; justify-content:space-between; align-items:center; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <div>
                        <div style="font-size:0.75rem; color:#64748b; font-weight:700;">COMPARATIVA MENSUAL</div>
                        <div style="font-size:1.1rem; font-weight:800; color:#111; text-transform:capitalize;">${nombreMes(claveActual)}</div>
                        <div style="font-size:0.85rem; color:#475569;">${nActual} órdenes vs ${nAnterior} (${nombreMes(claveAnterior)})</div>
                    </div>
                    ${difHtml}
                </div>
            </section>

            <section style="margin-bottom:1.2rem;">
                <div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <p style="font-size:0.85rem; font-weight:700; color:#475569; margin:0 0 0.75rem 0;">Órdenes ingresadas (últimos 30 días)</p>
                    <div style="position:relative; height:240px;"><canvas id="ejecutivo-chart-tendencia"></canvas></div>
                </div>
            </section>

            <section style="margin-bottom:1.2rem;">
                <h3 style="font-size:1.05rem; font-weight:800; margin:0 0 0.75rem 0; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-exclamation-octagon-fill" style="color:#E31837;"></i> Top talleres con más atraso</h3>
                ${topTalleres.length ? topTalleres.map(([t, v]) => `
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:0.85rem 1rem; margin-bottom:0.6rem; box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-weight:700; font-size:0.92rem; color:#111;">${escapeHTML(t)}</span>
                            <span style="background:${v.max >= 15 ? '#fee2e2' : '#fffbeb'}; color:${v.max >= 15 ? '#b91c1c' : '#b45309'}; font-weight:800; font-size:0.75rem; padding:3px 10px; border-radius:12px;">${v.max}d máx · ${v.count} ord.</span>
                        </div>
                        <div style="background:#f1f5f9; border-radius:6px; height:8px; overflow:hidden;">
                            <div style="width:${Math.min(100, Math.round((v.max / maxTallerDias) * 100))}%; height:100%; background:${v.max >= 15 ? '#ef4444' : '#f59e0b'}; border-radius:6px;"></div>
                        </div>
                    </div>`).join('') : '<p style="text-align:center;color:#94a3b8;font-size:0.9rem;">Sin órdenes activas.</p>'}
            </section>

            <section style="margin-bottom:1.2rem;">
                <h3 style="font-size:1.05rem; font-weight:800; margin:0 0 0.75rem 0; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-clock-history" style="color:#8b5cf6;"></i> Promedio de días abiertas por región</h3>
                ${regionesProm.length ? regionesProm.map(([r, d]) => `
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:12px; padding:0.85rem 1rem; margin-bottom:0.6rem; box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                            <span style="font-weight:700; font-size:0.92rem; color:#111;">${escapeHTML(r)}</span>
                            <span style="font-size:0.8rem; font-weight:800; color:#8b5cf6;">${d}d</span>
                        </div>
                        <div style="background:#f1f5f9; border-radius:6px; height:8px; overflow:hidden;">
                            <div style="width:${Math.min(100, Math.round((d / maxRegionDias) * 100))}%; height:100%; background:#8b5cf6; border-radius:6px;"></div>
                        </div>
                    </div>`).join('') : '<p style="text-align:center;color:#94a3b8;font-size:0.9rem;">Sin datos.</p>'}
            </section>
        `;

        destroyEjecutivoCharts();
        if (window.Chart) {
            const ctxTend = document.getElementById('ejecutivo-chart-tendencia');
            if (ctxTend) {
                ejecutivoCharts.tendencia = new Chart(ctxTend, {
                    type: 'line',
                    data: {
                        labels: trendData.labels,
                        datasets: [
                            { label: 'Ingresadas', data: trendData.values, borderColor: '#E31837', backgroundColor: 'rgba(227,24,55,0.10)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: { legend: { position: 'bottom' } },
                        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
                    }
                });
            }
        }
    }

    // ── ENCUESTAS NPS (Solo Admin) ─────────────────────────────────────────
    function getEncuestaStats(list) {
        let promo = 0, pasivo = 0, detractor = 0;
        list.forEach(r => {
            const st = r['NPS Status'] || '';
            if (st.includes('Promoter')) promo++;
            else if (st.includes('Passive')) pasivo++;
            else if (st.includes('Detractor')) detractor++;
        });
        const total = list.length;
        const pProm = total ? Math.round((promo / total) * 100) : 0;
        const pDet = total ? Math.round((detractor / total) * 100) : 0;
        return { total, promo, pasivo, detractor, nps: pProm - pDet, pProm, pDet };
    }

    function encuestaClasif(r) {
        const st = r['NPS Status'] || '';
        if (st.includes('Detractor')) return 'detractor';
        if (st.includes('Promoter')) return 'promoter';
        return 'passive';
    }

    function encuestaRegion(r) {
        return ((r['Territorio de servicio: Nombre'] || '').trim() || (r['Ciudad WO'] || '').trim() || 'Sin región');
    }

    function encuestaColor(clasif) {
        return {
            promoter:  { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', label: 'PROMOTOR', icon: 'bi-emoji-smile-fill' },
            passive:   { bg: '#fffbeb', border: '#fde68a', color: '#d97706', label: 'PASIVO', icon: 'bi-emoji-neutral-fill' },
            detractor: { bg: '#fef2f2', border: '#fecaca', color: '#ef4444', label: 'DETRACTOR', icon: 'bi-emoji-frown-fill' }
        }[clasif] || { bg: '#f8fafc', border: '#cbd5e1', color: '#64748b', label: '—', icon: 'bi-question-circle' };
    }

    // ── NIVEL 1: Menú de regionales ────────────────────────────────────────
    function showEncuesta() {
        debugLog('⭐ Abriendo Encuestas NPS (Admin) - Menú Regional');
        const contentEl = document.getElementById('encuesta-content');
        if (!contentEl) return;

        if (appEncuestaData.length === 0) {
            contentEl.innerHTML = '<div style="text-align:center;padding:3rem;color:#64748b;"><i class="bi bi-emoji-smile" style="font-size:2rem; display:block; margin-bottom:10px;"></i>Sin datos de encuestas disponibles.</div>';
            showView(viewEncuesta);
            return;
        }

        // Agrupar por regional
        const byRegion = new Map();
        appEncuestaData.forEach(r => {
            const reg = encuestaRegion(r);
            if (!byRegion.has(reg)) byRegion.set(reg, []);
            byRegion.get(reg).push(r);
        });

        // Estadísticas globales
        const globalStats = getEncuestaStats(appEncuestaData);
        const npsGlobalColor = globalStats.nps >= 50 ? '#16a34a' : (globalStats.nps >= 0 ? '#d97706' : '#ef4444');

        const summaryHtml = `
            <section style="background:linear-gradient(135deg,#fff5f5,#ffffff); border:1px solid #fecaca; border-radius:16px; padding:1.25rem; margin-bottom:1.25rem; box-shadow:0 2px 10px rgba(227,24,55,0.08);">
                <h3 style="font-size:1rem; font-weight:800; color:#111; margin:0 0 1rem 0; display:flex; align-items:center; gap:8px;">
                    <i class="bi bi-emoji-smile-fill" style="color:#E31837;"></i> Resumen Global NPS
                </h3>
                <div style="display:grid; grid-template-columns:repeat(2,1fr); gap:0.7rem;">
                    <div style="background:white; border-radius:12px; padding:0.85rem; text-align:center; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                        <div style="font-size:1.6rem; font-weight:800; color:#3b82f6; line-height:1;">${globalStats.total}</div>
                        <div style="font-size:0.72rem; color:#64748b; margin-top:3px;">Encuestas totales</div>
                    </div>
                    <div style="background:white; border-radius:12px; padding:0.85rem; text-align:center; box-shadow:0 1px 4px rgba(0,0,0,0.06);">
                        <div style="font-size:1.6rem; font-weight:800; color:${npsGlobalColor}; line-height:1;">${globalStats.nps}</div>
                        <div style="font-size:0.72rem; color:#64748b; margin-top:3px;">NPS Global</div>
                    </div>
                    <div style="background:#f0fdf4; border-radius:12px; padding:0.85rem; text-align:center;">
                        <div style="font-size:1.4rem; font-weight:800; color:#16a34a; line-height:1;">${globalStats.promo}</div>
                        <div style="font-size:0.72rem; color:#16a34a; margin-top:3px;"><i class="bi bi-emoji-smile-fill"></i> Promotores (${globalStats.pProm}%)</div>
                    </div>
                    <div style="background:#fef2f2; border-radius:12px; padding:0.85rem; text-align:center;">
                        <div style="font-size:1.4rem; font-weight:800; color:#ef4444; line-height:1;">${globalStats.detractor}</div>
                        <div style="font-size:0.72rem; color:#ef4444; margin-top:3px;"><i class="bi bi-emoji-frown-fill"></i> Detractores (${globalStats.pDet}%)</div>
                    </div>
                </div>
            </section>
        `;

        // Tarjetas por regional
        const regionCards = [...byRegion.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([reg, list]) => {
                const s = getEncuestaStats(list);
                const npsColor = s.nps >= 50 ? '#16a34a' : (s.nps >= 0 ? '#d97706' : '#ef4444');
                const npsBg = s.nps >= 50 ? '#f0fdf4' : (s.nps >= 0 ? '#fffbeb' : '#fef2f2');
                return `
                    <button onclick="window._showEncuestaRegion(${JSON.stringify(reg)})"
                        style="width:100%; background:white; border:1px solid #e2e8f0; border-radius:16px; padding:1rem 1.25rem; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; justify-content:space-between; align-items:center; cursor:pointer; text-align:left; font-family:'Outfit',sans-serif; transition:box-shadow 0.2s, transform 0.15s; margin-bottom:0.7rem;"
                        onmousedown="this.style.transform='scale(0.98)'" onmouseup="this.style.transform=''" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform=''">
                        <div style="flex:1;">
                            <div style="font-weight:800; font-size:1.05rem; color:#111; margin-bottom:6px;">${escapeHTML(reg)}</div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                                <span style="background:#f0fdf4; color:#16a34a; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:8px;">
                                    <i class="bi bi-emoji-smile-fill"></i> ${s.promo} Prom.
                                </span>
                                <span style="background:#fffbeb; color:#d97706; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:8px;">
                                    <i class="bi bi-emoji-neutral-fill"></i> ${s.pasivo} Pas.
                                </span>
                                <span style="background:#fef2f2; color:#ef4444; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:8px;">
                                    <i class="bi bi-emoji-frown-fill"></i> ${s.detractor} Det.
                                </span>
                            </div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px; margin-left:12px; flex-shrink:0;">
                            <span style="background:${npsBg}; color:${npsColor}; font-size:0.75rem; font-weight:800; padding:4px 12px; border-radius:12px; border:1px solid ${npsColor}33;">NPS ${s.nps}</span>
                            <span style="font-size:0.72rem; color:#94a3b8;">${s.total} encuestas</span>
                            <i class="bi bi-chevron-right" style="color:#cbd5e1; font-size:0.9rem;"></i>
                        </div>
                    </button>`;
            }).join('');

        contentEl.innerHTML = summaryHtml + `
            <section>
                <h3 style="font-size:1rem; font-weight:800; color:#111; margin:0 0 0.9rem 0; display:flex; align-items:center; gap:8px;">
                    <i class="bi bi-geo-alt-fill" style="color:#E31837;"></i> Por Regional
                </h3>
                ${regionCards}
            </section>
        `;

        // Exponer función global para los botones onclick
        window._showEncuestaRegion = function(region) { showEncuestaRegion(region); };

        showView(viewEncuesta);
    }

    // ── NIVEL 2: Encuestas de una regional ─────────────────────────────────
    function showEncuestaRegion(region) {
        debugLog(`📋 Encuestas NPS regional: ${region}`);
        encuestaCurrentRegion = region;
        encuestaFiltroStatus = 'todas';

        const titleEl = document.getElementById('encuesta-region-title');
        if (titleEl) titleEl.textContent = region;

        // Limpiar buscador
        const buscador = document.getElementById('encuesta-region-buscador');
        if (buscador) buscador.value = '';
        const clearBtn = document.getElementById('clear-encuesta-search');
        if (clearBtn) clearBtn.style.display = 'none';

        renderEncuestaRegionFiltros();
        renderEncuestaRegionList();

        // Evento del buscador
        if (buscador) {
            buscador.oninput = () => {
                if (clearBtn) clearBtn.style.display = buscador.value ? 'block' : 'none';
                renderEncuestaRegionList();
            };
        }
        if (clearBtn) {
            clearBtn.onclick = () => {
                if (buscador) buscador.value = '';
                clearBtn.style.display = 'none';
                renderEncuestaRegionList();
            };
        }

        showView(viewEncuestaRegion);
    }

    function renderEncuestaRegionFiltros() {
        const cont = document.getElementById('encuesta-region-filtros');
        if (!cont) return;

        const regionData = appEncuestaData.filter(r => encuestaRegion(r) === encuestaCurrentRegion);
        const s = getEncuestaStats(regionData);

        const opciones = [
            { key: 'todas',      label: `Todas (${s.total})`,               icon: 'bi-grid-fill' },
            { key: 'Promoter',   label: `Promotores (${s.promo})`,          icon: 'bi-emoji-smile-fill' },
            { key: 'Passive',    label: `Pasivos (${s.pasivo})`,            icon: 'bi-emoji-neutral-fill' },
            { key: 'Detractor',  label: `Detractores (${s.detractor})`,     icon: 'bi-emoji-frown-fill' }
        ];

        const baseStyle = 'padding:6px 14px;border-radius:16px;border:1px solid #e2e8f0;background:#ffffff;color:#334155;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:all 0.2s;';
        const activeStyle = 'padding:6px 14px;border-radius:16px;border:1px solid #dc2626;background:#dc2626;color:#ffffff;font-family:"Outfit",sans-serif;font-size:0.78rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px;box-shadow:0 2px 6px rgba(220,38,38,0.25);';

        cont.innerHTML = opciones.map(op => {
            const active = op.key === encuestaFiltroStatus;
            return `<button type="button" data-nps="${op.key}" style="${active ? activeStyle : baseStyle}"><i class="bi ${op.icon}"></i> ${escapeHTML(op.label)}</button>`;
        }).join('');

        cont.querySelectorAll('[data-nps]').forEach(btn => {
            btn.addEventListener('click', () => {
                encuestaFiltroStatus = btn.getAttribute('data-nps');
                renderEncuestaRegionFiltros();
                renderEncuestaRegionList();
            });
        });
    }

    function renderEncuestaRegionList() {
        const container = document.getElementById('encuesta-region-content');
        if (!container || !encuestaCurrentRegion) return;

        const q = normalizarTexto(document.getElementById('encuesta-region-buscador')?.value || '');

        let list = appEncuestaData.filter(r => {
            if (encuestaRegion(r) !== encuestaCurrentRegion) return false;
            if (encuestaFiltroStatus !== 'todas' && !((r['NPS Status'] || '').includes(encuestaFiltroStatus))) return false;
            if (q) {
                const campos = [
                    r['Tecnico'], r['Activo: Nombre de activo'], r['Tipo de Servicio'],
                    r['Número de orden de trabajo'], r['Numero'], r['NPS Q1'],
                    r['Tipificación'], r['V2_GE_QF'], r['V2_GE_Q2'],
                    r['SERVICIOS'], r['Marca'], r['Modelo'], r['Referencia']
                ];
                return campos.some(c => normalizarTexto(c).includes(q));
            }
            return true;
        });

        const orden = { detractor: 0, passive: 1, promoter: 2 };
        list.sort((a, b) => {
            const d = (orden[encuestaClasif(a)] || 1) - (orden[encuestaClasif(b)] || 1);
            if (d !== 0) return d;
            return ((a['NPS Q1'] || '') + '').localeCompare((b['NPS Q1'] || '') + '', 'es', { numeric: true });
        });

        if (list.length === 0) {
            container.innerHTML = '<div style="text-align:center;padding:2rem;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;color:#64748b;font-weight:600;">No se encontraron respuestas con los filtros actuales.</div>';
            return;
        }

        const html = list.map(r => {
            const clasif = encuestaClasif(r);
            const c = encuestaColor(clasif);
            const nota = (r['NPS Q1'] || '').trim();
            const tecnico = (r['Tecnico'] || '').trim() || '—';
            const producto = escapeHTML((r['Activo: Nombre de activo'] || '').trim() || 'Sin producto');
            const tipo = escapeHTML((r['Tipo de Servicio'] || '').trim() || '—');
            const odt = escapeHTML((r['Número de orden de trabajo'] || '').trim() || '—');
            const num = escapeHTML((r['Numero'] || '').trim() || '—');
            const tipificacion = escapeHTML((r['Tipificación'] || '').trim() || '—');
            const comentario = escapeHTML([r['V2_GE_QF'], r['V2_GE_Q2']].map(v => (v || '').trim()).filter(Boolean).join(' ')) || 'Sin comentario';
            const st3 = escapeHTML((r['V2_ST_Q3'] || '').trim()) || '—';
            const st4 = escapeHTML((r['V2_ST_Q4'] || '').trim()) || '—';
            const st5 = escapeHTML((r['V2_ST_Q5'] || '').trim()) || '—';
            const score = (r['2DO CALCULO'] || '').trim();
            const servicio = (r['SERVICIOS'] || '').trim();
            const marca = (r['Marca'] || '').trim();
            const modelo = (r['Modelo'] || '').trim();
            const referencia = (r['Referencia'] || '').trim();
            const detRef = referencia ? `<p style="margin:0;"><strong>Referencia:</strong> ${escapeHTML(referencia)}</p>` : '';
            const detServ = servicio ? `<p style="margin:0;"><strong>Servicio:</strong> ${escapeHTML(servicio)} · <strong>Tipo:</strong> ${tipo}</p>` : `<p style="margin:0;"><strong>Tipo de Servicio:</strong> ${tipo}</p>`;
            const detMarca = (marca || modelo) ? `<p style="margin:0;"><strong>Marca / Modelo:</strong> ${escapeHTML(marca || '—')} · ${escapeHTML(modelo || '—')}</p>` : '';

            return `
                <div class="accordion-item" style="margin-bottom:10px; border-radius:15px; border:1px solid ${c.border}; border-left:5px solid ${c.color}; background:${c.bg}; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:14px 15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                            <div style="flex:1;">
                                <p style="margin:0 0 4px 0; font-weight:800; color:#111; font-size:0.98rem; line-height:1.2;">${producto}</p>
                                <p style="margin:0; font-size:0.78rem; color:#475569;"><i class="bi bi-person-badge"></i> ${escapeHTML(tecnico)}</p>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:5px; flex-shrink:0;">
                                <span style="background:${c.color}; color:white; padding:3px 10px; border-radius:12px; font-size:0.65rem; font-weight:800; white-space:nowrap;"><i class="bi ${c.icon}"></i> ${c.label}</span>
                                <span style="font-size:0.85rem; font-weight:800; color:${c.color};">${nota || '—'}/10</span>
                            </div>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:14px 0; border-top:1px solid ${c.border}; font-size:0.85rem; color:#333; display:grid; grid-template-columns:1fr; gap:8px;">
                            <p style="margin:0;"><strong>ODT:</strong> ${odt} · <strong>Número:</strong> ${num}</p>
                            ${detRef}
                            ${detServ}
                            ${detMarca}
                            <p style="margin:0;"><strong>Técnico:</strong> ${escapeHTML(tecnico)}</p>
                            <p style="margin:0;"><strong>Tipificación:</strong> ${tipificacion}</p>
                            <p style="margin:0;"><strong>Nota (NPS Q1):</strong> ${nota || '—'}/10 ${score ? `· <strong>Puntaje:</strong> ${score}` : ''}</p>
                            <p style="margin:0;"><strong>Valoraciones:</strong> Q3: ${st3} · Q4: ${st4} · Q5: ${st5}</p>
                            <p style="margin:0; white-space:pre-line; background:white; border-radius:10px; padding:10px; border:1px solid ${c.border};"><strong>Comentario del cliente:</strong><br>${comentario}</p>
                        </div>
                    </div>
                </div>`;
        }).join('');

        container.innerHTML = `<div style="font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:10px;">${list.length} respuesta(s)</div>` + html;
    }

    // Mantener compatibilidad (refrescarVistaActual lo llama)
    function renderEncuestaView() {
        if (encuestaCurrentRegion) {
            renderEncuestaRegionFiltros();
            renderEncuestaRegionList();
        } else {
            showEncuesta();
        }
    }

    function garantiaTexto(o) {
        const info = getWarrantyInfo(o);
        if (info.status === 'sin_datos') return 'Sin datos';
        if (info.status === 'en_garantia') return `En garantía (${info.daysRemaining} días)`;
        if (info.status === 'por_vencer') return `Por vencer (${info.daysRemaining} días)`;
        return 'Vencida';
    }

    function exportReportesCSV() {
        const data = getReportesData();
        if (data.length === 0) {
            alert('No hay órdenes para exportar con los filtros actuales.');
            return;
        }

        const filas = data.map(o => ({
            'Nro Orden': o['Número de orden de trabajo'] || '',
            'Referencia': o['Referencia'] || '',
            'Cliente': o['Cuenta: Nombre de la cuenta'] || '',
            'Producto': o['Producto ST'] || '',
            'Marca / ST': marcaDeOrden(o) || '',
            'Tipo de Servicio': o['Tipo de Servicio'] || '',
            'Región': o['Territorio de servicio: Nombre'] || '',
            'Estado': o.Estado || '',
            'Sub Estado': o.Sub_estado || '',
            'Días abierta': o['Tiempo desde apertura (Días)'] || '',
            'Fecha de compra': o['Fecha de compra'] || '',
            'Fecha ingreso marca': o['Fecha de ingreso a la marca'] || '',
            'Garantía': garantiaTexto(o)
        }));

        const csv = window.Papa.unparse(filas);
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte_dismac_${fechaArchivo()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function exportReportesPDF() {
        const data = getReportesData();
        if (data.length === 0) {
            alert('No hay órdenes para exportar con los filtros actuales.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('La librería de PDF no está disponible. Verifica tu conexión a internet.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
        const w = doc.internal.pageSize.getWidth();
        const h = doc.internal.pageSize.getHeight();
        const RED = [227, 24, 55];

        // Banda superior corporativa
        doc.setFillColor(...RED);
        doc.rect(0, 0, w, 44, 'F');
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 44, w, 3, 'F');

        // Wordmark DISMAC ("dis" rojo / "mac" negro)
        doc.setFillColor(...RED);
        doc.roundedRect(40, 14, 36, 17, 3, 3, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(255, 255, 255);
        doc.text('dis', 43, 26);
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(76, 14, 38, 17, 3, 3, 'F');
        doc.setTextColor(0, 0, 0);
        doc.text('mac', 79, 26);

        // Título
        doc.setFontSize(16);
        doc.setTextColor(17, 17, 17);
        doc.text('Reporte de Órdenes de Servicio', 140, 25);

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const fecha = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: 'long', year: 'numeric' });
        doc.text(`Generado: ${fecha}`, 140, 35);

        const usuario = localStorage.getItem('usuario_actual') || '—';
        doc.text(`Usuario: ${usuario}`, w - 40, 25, { align: 'right' });

        // Resumen ejecutivo
        const activas = data.filter(o => !esEstadoFinal(o.Estado));
        const estancadas = activas.filter(o => {
            const dc = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const dm = diasDesde(o['Fecha de la última modificación']);
            return (dm !== null && dm >= DIAS_SIN_CAMBIOS_ALERTA) || dc >= DIAS_APERTURA_ALERTA;
        });
        const enGarantia = data.filter(o => getWarrantyInfo(o).status === 'en_garantia').length;

        const resumen = [
            ['Total', data.length],
            ['Activas', activas.length],
            ['Estancadas', estancadas.length],
            ['En garantía', enGarantia]
        ];
        let rx = 40;
        resumen.forEach(([label, val]) => {
            doc.setFillColor(250, 250, 250);
            doc.roundedRect(rx, 56, 116, 36, 6, 6, 'F');
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...RED);
            doc.text(String(val), rx + 12, 74);
            doc.setFontSize(7.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(label.toUpperCase(), rx + 12, 84);
            rx += 124;
        });

        // Filtros aplicados
        let y = 106;
        const filtros = [];
        const fRegion = document.getElementById('reporte-filtro-region')?.value;
        const fEstado = document.getElementById('reporte-filtro-estado')?.value;
        const fMarca = document.getElementById('reporte-filtro-marca')?.value;
        if (fRegion && fRegion !== 'todas') filtros.push(`Región: ${fRegion}`);
        if (fEstado && fEstado !== 'todos') filtros.push(`Estado: ${fEstado}`);
        if (fMarca && fMarca !== 'todas') filtros.push(`Marca: ${fMarca}`);
        const q = normalizarTexto(document.getElementById('reporte-buscador')?.value);
        if (q) filtros.push(`Búsqueda: "${q}"`);
        doc.setFontSize(8);
        doc.setTextColor(60, 60, 60);
        doc.text(filtros.length ? `Filtros: ${filtros.join(' · ')}` : 'Filtros: todos los datos', 40, y);

        const head = [['Nro Orden', 'Referencia', 'Cliente', 'Producto', 'Marca / ST', 'Tipo', 'Región', 'Estado', 'Días', 'Garantía']];
        const body = data.map(o => [
            o['Número de orden de trabajo'] || '',
            o['Referencia'] || '',
            o['Cuenta: Nombre de la cuenta'] || '',
            (o['Producto ST'] || '').slice(0, 60),
            marcaDeOrden(o) || '',
            o['Tipo de Servicio'] || '',
            o['Territorio de servicio: Nombre'] || '',
            o.Estado || '',
            o['Tiempo desde apertura (Días)'] || '',
            garantiaTexto(o).replace(/ \(\d+ días\)/, '')
        ]);

        doc.autoTable({
            head,
            body,
            startY: y + 14,
            margin: { left: 40, right: 40 },
            styles: { fontSize: 8, cellPadding: 4, overflow: 'linebreak' },
            headStyles: { fillColor: RED, textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            columnStyles: { 3: { cellWidth: 140 }, 4: { cellWidth: 90 } }
        });

        // Pie de página con paginación
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setDrawColor(...RED);
            doc.setLineWidth(1.5);
            doc.line(40, h - 42, w - 40, h - 42);
            doc.setFontSize(7);
            doc.setTextColor(...RED);
            doc.text('CONFIDENCIAL — USO INTERNO', 40, h - 28);
            doc.setTextColor(120, 130, 145);
            doc.text(`Página ${i} de ${pageCount} · Soporte Técnico Dismac`, w - 40, h - 28, { align: 'right' });
        }

        doc.save(`reporte_dismac_${fechaArchivo()}.pdf`);
    }

    function showView(view) {
        document.querySelectorAll('.main-content').forEach(v => v.classList.add('hidden'));
        view?.classList.remove('hidden');

        // Resaltar en la barra inferior la vista actual (hoy la barra solo tiene "Inicio")
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const esInicio = (view === viewDashboard && btn.getAttribute('data-action') === 'go-home');
            btn.classList.toggle('active', esInicio);
        });

        // Al volver al menú principal, limpiar la búsqueda global (input + resultados)
        if (view === viewDashboard) {
            if (globalSearchInput) globalSearchInput.value = "";
            const clearGlobal = document.getElementById('clear-global-search');
            if (clearGlobal) clearGlobal.style.display = 'none';
            if (globalSearchResults) {
                globalSearchResults.classList.add('hidden');
                globalSearchResults.innerHTML = '';
            }
            if (dashboardMainGrid) dashboardMainGrid.classList.remove('hidden');
            if (dashboardContact) dashboardContact.classList.remove('hidden');
            if (dashboardFaq) dashboardFaq.classList.remove('hidden');
        }
    }

    // ── Barra de estado de sincronización ──────────────────────────────────
    // estado: 'oculto' | 'cargando' | 'error' | 'aviso'
    function setSyncStatus(estado, mensaje) {
        const barra = document.getElementById('sync-status');
        const texto = document.getElementById('sync-status-text');
        const boton = document.getElementById('sync-retry-btn');
        if (!barra || !texto) return;
        if (estado === 'oculto') {
            barra.classList.add('hidden');
            return;
        }
        const icono = {
            cargando: 'bi-arrow-repeat spin',
            error: 'bi-exclamation-triangle',
            aviso: 'bi-cloud-slash'
        }[estado] || '';
        barra.classList.remove('hidden');
        texto.innerHTML = `<i class="bi ${icono}" style="margin-right:8px;"></i> ${escapeHTML(mensaje)}`;
        if (boton) boton.classList.toggle('hidden', estado !== 'error');
    }

    // Vuelve a pintar lo que el usuario está mirando (tras recargar datos).
    function refrescarVistaActual() {
        const visible = (id) => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        };
        if (visible('view-reportes')) { renderReportes(); return; }
        if (visible('view-encuesta') || visible('view-encuesta-region')) { renderEncuestaView(); return; }
        if (visible('view-ejecutivo')) { renderEjecutivo(); return; }
        if (visible('view-details') && currentRegionTalleres) { showRegionTalleres(currentRegionTalleres); return; }
        if (currentRegionOrdenes === 'Última Modificación') { showUltimaModificacion(); return; }
        if (currentRegionOrdenes === 'Escalamientos') { showEscalamientos(); return; }
        if (currentRegionOrdenes) { showRegionOrdenes(currentRegionOrdenes); return; }
        renderKPIs();
    }

    // Accesos directos de la PWA instalada (manifest.shortcuts).
    // Ej.: ./index.html?accion=open-estados-servicio
    function aplicarAccesoDirecto() {
        let accion = null;
        try {
            accion = new URLSearchParams(window.location.search).get('accion');
        } catch (err) {
            return false;
        }
        if (!accion) return false;
        // Se limpia la URL para que un refresco no vuelva a forzar la vista.
        try {
            history.replaceState(null, '', window.location.pathname);
        } catch (err) {
            debugLog('No se pudo limpiar la URL del acceso directo:', err);
        }
        debugLog('🔗 Acceso directo:', accion);
        handleNavigation(accion);
        return true;
    }

    // Aplica un volcado (CSV por hoja) al estado de la app.
    function aplicarDatos(csv) {
        const filas = (texto) => parseCsvLocal(texto);
        const parsed = parseAllData(filas(csv.talleres), filas(csv.seguimiento), filas(csv.adicionales));
        const parsedTransporte = parseTransporteData(filas(csv.transporte));

        appWorkshopData = parsed.parsedWorkshopData;
        appTransporteData = parsedTransporte;
        appOrdersData = [...parsed.parsedOrdersData, ...parsedTransporte];
        appEncuestaData = filas(csv.encuesta);

        debugLog('Datos procesados:', {
            talleres: appWorkshopData.length,
            ordenesServicio: parsed.parsedOrdersData.length,
            ordenesTransporte: appTransporteData.length,
            totalOrdenes: appOrdersData.length,
            encuestas: appEncuestaData.length,
            ordenesEnriquecidasAdicionales: appOrdersData.filter(o => o.adicionalesEnriched).length
        });
    }

    async function loadAllData() {
        const hojas = [
            { clave: 'talleres', cfg: SHEETS_CONFIG.talleres, obligatoria: true },
            { clave: 'seguimiento', cfg: SHEETS_CONFIG.seguimiento, obligatoria: true },
            { clave: 'adicionales', cfg: SHEETS_CONFIG.adicionales, obligatoria: false },
            { clave: 'encuesta', cfg: SHEETS_CONFIG.encuesta, obligatoria: false },
            { clave: 'transporte', cfg: SHEETS_CONFIG.transporte, obligatoria: false }
        ];

        setSyncStatus('cargando', 'Sincronizando datos…');

        const csv = {};
        let falloObligatoria = null;
        await Promise.all(hojas.map(async (h) => {
            try {
                csv[h.clave] = await fetchSheetCsv(h.cfg.id, h.cfg.sheetName, h.cfg.gid);
            } catch (err) {
                csv[h.clave] = '';
                if (h.obligatoria) {
                    falloObligatoria = falloObligatoria || err;
                } else {
                    console.warn(`No se pudo cargar la hoja "${h.clave}", se continúa sin ella:`, err);
                }
            }
        }));

        if (falloObligatoria) {
            const respaldo = leerRespaldoDatos();
            if (!respaldo) {
                console.error('Error al cargar datos:', falloObligatoria);
                setSyncStatus('error', 'No se pudieron cargar los datos. Revisá la conexión.');
                return false;
            }
            console.warn('Sin conexión con las hojas: se usa el respaldo local.', falloObligatoria);
            aplicarDatos(respaldo.csv);
            setSyncStatus('aviso', `Sin conexión: mostrando datos del ${fechaHoraLegible(respaldo.ts)}`);
            return false;
        }

        guardarRespaldoDatos(csv);
        aplicarDatos(csv);
        setSyncStatus('oculto');
        return true;
    }

    // Funcionalidad Scroll to Top
    const scrollTopBtn = document.createElement('button');
    scrollTopBtn.innerHTML = '<i class="bi bi-arrow-up-short" style="font-size:2rem; line-height:1;"></i>';
    scrollTopBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background-color: #E31837;
        color: white;
        border: none;
        border-radius: 50%;
        width: 50px;
        height: 50px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        transition: all 0.3s ease;
        z-index: 1000;
    `;
    document.body.appendChild(scrollTopBtn);

    window.addEventListener('scroll', () => {
        if (window.scrollY > 300) {
            scrollTopBtn.style.opacity = '1';
            scrollTopBtn.style.visibility = 'visible';
        } else {
            scrollTopBtn.style.opacity = '0';
            scrollTopBtn.style.visibility = 'hidden';
        }
    });

    scrollTopBtn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });

    // Accesos directos de la PWA instalada (manifest.shortcuts): index.html?accion=<data-action>
    aplicarAccesoDirecto();
});
