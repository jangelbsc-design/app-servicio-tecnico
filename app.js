const USERS_SHEET_CONFIG = {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'Usuarios_App'
};

const SHEETS_CONFIG = {
    talleres: {
        id: '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
        sheetName: 'RED%20DE%20TALLERES'
    },
    seguimiento: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'REPORTE%20GLOBAL'
    },
    // zapia removed
    adicionales: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'REPORTE%20GLOBAL%20ADICIONALES'
    },
    encuesta: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'nps%20por%20regional'
    }
};

// Utilidad debounce para buscadores
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function fetchGoogleSheet(id, sheet) {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const csvText = await res.text();
            
            window.Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
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

function checkSessionOnLoad() {
    const sesionActiva = localStorage.getItem('dismatec_session');
    const overlay = document.getElementById('login-overlay');
    if (sesionActiva !== 'true') {
        if (overlay) overlay.style.display = 'flex';
    } else {
        if (overlay) overlay.style.display = 'none';
    }
}
checkSessionOnLoad();

function isAdmin() {
    const rol = (localStorage.getItem('usuario_rol') || '').toLowerCase().trim();
    return rol === 'admin' || rol === 'administrador';
}

async function syncSessionUser() {
    const sesionActiva = localStorage.getItem('dismatec_session');
    const usuarioActual = localStorage.getItem('usuario_actual');
    if (sesionActiva !== 'true' || !usuarioActual) return;
    try {
        const users = await fetchGoogleSheet(USERS_SHEET_CONFIG.id, USERS_SHEET_CONFIG.sheetName);
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
let appEncuestaData = [];
// ────────────────────────────────────────────────────────────────────────────

console.log("🔧 APP.JS CARGADO");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded DISPARADO");

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {            const user = document.getElementById('login-usuario').value;
            const pass = document.getElementById('login-password').value;
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
                const users = await fetchGoogleSheet(USERS_SHEET_CONFIG.id, USERS_SHEET_CONFIG.sheetName);
                const foundUser = users.find(u => u.Usuario === user && u.Contraseña === pass);
                
                if (foundUser) {
                    localStorage.setItem('dismatec_session', 'true');
                    localStorage.setItem('usuario_actual', foundUser.Usuario);
                    localStorage.setItem('usuario_rol', foundUser.Rol);
                    localStorage.setItem('usuario_regional', foundUser.Regional);
                    
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
    const viewEjecutivo = document.getElementById('view-ejecutivo');
    const viewAlertas = document.getElementById('view-alertas');
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
    // Mostrar tarjeta de encuestas NPS solo para administradores (antes de cargar datos)
    const adminEncuestaCard = document.getElementById('admin-encuesta-card');
    if (adminEncuestaCard) adminEncuestaCard.classList.toggle('hidden', !isAdmin());

    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);
    renderKPIs();

    // Verificar alertas push locales configuradas (sin forzar el envío)
    checkAlertasPush(false);

    // Variables de estado para búsqueda regional
    let currentRegionTalleres = "";
    let filteredTalleres = [];
    let currentRegionOrdenes = "";
    let filteredOrdenes = [];
    let ultimaModFiltro = 'todas';

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
        const query = e.target.value.toLowerCase();
        const esUltimaMod = currentRegionOrdenes === 'Última Modificación';
        const base = esUltimaMod
            ? (ultimaModFiltro === 'todas' ? appOrdersData : appOrdersData.filter(o => isOrderInRegion(o, ultimaModFiltro)))
            : appOrdersData.filter(o => isOrderInRegion(o, currentRegionOrdenes));
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
        renderOrdenes(currentRegionOrdenes, filteredOrdenes,
            esUltimaMod ? { ordenarPor: 'modificacion', titulo: 'Órdenes por última modificación' } : undefined);
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

        // Filtrar Órdenes (mismo criterio que el buscador regional)
        const matchedOrdenes = appOrdersData.filter(o =>
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

    function renderKPIs() {
        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const isExcluido = (o) => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return estados_excluidos.some(ex => e.includes(ex));
        };

        let activas = appOrdersData.filter(o => !isExcluido(o));

        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        if (rol === 'regional' && regional) {
            activas = activas.filter(o => isOrderInRegion(o, regional));
        }

        const estancadas = activas.filter(o => {
            const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            return (diasMod !== null && diasMod >= 4) || diasCreacion >= 8;
        });

        const escalamientos = activas.filter(o => {
            const diasCompra = diasEntre(o['Fecha de compra'], o['Fecha de inicio']);
            const tieneFalla = o.adicDetalleFalla && o.adicDetalleFalla.trim().length > 0;
            return diasCompra !== null && diasCompra <= 30 && tieneFalla;
        });

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
            return dm !== null && dm >= 4;
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
                            <div style="font-size:0.85rem; color:#64748b; margin-bottom:10px;">${t.MARCA}</div>
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
            const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
            let ordenesActivas = ordenes.filter(o => {
                const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                return !estados_excluidos.some(ex => e.includes(ex));
            });

            // FILTRO DE USUARIO (NUEVO)
            const rol = localStorage.getItem('usuario_rol');
            const regional = localStorage.getItem('usuario_regional');
            if (rol === 'regional' && regional) {
                ordenesActivas = ordenesActivas.filter(o => isOrderInRegion(o, regional));
            }

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
        const orden = appOrdersData.find(o => o['Número de orden de trabajo'] === odt);
        if (orden) {
            const region = orden['Territorio de servicio: Nombre'] || "Resultado";
            renderOrdenes(region, [orden]);
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    };

    // Setup FCM Push Notifications
    if (window.firebase && firebase.messaging && firebase.messaging.isSupported()) {
        try {
            const messaging = firebase.messaging();
            Notification.requestPermission().then((permission) => {
                if (permission === 'granted') {
                    console.log('Permiso de notificación concedido.');
                    messaging.getToken().then((currentToken) => {
                        if (currentToken) {
                            console.log('FCM Token:', currentToken);
                        }
                    }).catch((err) => console.log('Error obteniendo token FCM:', err));
                }
            });

            messaging.onMessage((payload) => {
                console.log('Mensaje recibido en foreground:', payload);
                const title = payload.notification?.title || 'Notificación';
                const options = {
                    body: payload.notification?.body,
                    icon: 'icono-servicio-tecnico.png'
                };
                new Notification(title, options);
            });
        } catch (e) {
            console.error('Error configurando FCM:', e);
        }
    }

    // Event listeners para botones principales
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            console.log(`\n👆 CLICK: ${action}`);
            handleNavigation(action);
        });
    });

    // Botones de volver
    document.getElementById('btn-back-red-talleres')?.addEventListener('click', () => {
        console.log("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back-estados-menu')?.addEventListener('click', () => {
        console.log("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
        const title = viewTitle ? viewTitle.textContent : '';
        if (title === 'Protocolo de recepción') {
            console.log("← Volver al dashboard");
            showView(viewDashboard);
        } else {
            console.log("← Volver a regiones");
            showView(viewRedTalleres);
        }
    });

    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => {
        if (currentRegionOrdenes === 'Última Modificación') {
            console.log("← Volver al dashboard (vista última modificación)");
            currentRegionOrdenes = "";
            ultimaModFiltro = 'todas';
            const filtroEl = document.getElementById('modificacion-filtro');
            if (filtroEl) filtroEl.classList.add('hidden');
            showView(viewDashboard);
        } else if (currentRegionOrdenes === 'Escalamientos') {
            console.log("← Volver al dashboard (vista escalamientos)");
            currentRegionOrdenes = "";
            showView(viewDashboard);
        } else if (globalSearchInput && globalSearchInput.value.trim() !== "") {
            console.log("← Volver al dashboard (resultado de búsqueda)");
            showView(viewDashboard);
        } else {
            console.log("← Volver a menú estados");
            showView(viewEstadosMenu);
        }
    });

    document.getElementById('btn-back-reportes')?.addEventListener('click', () => {
        console.log("← Volver al menú de estados");
        showView(viewEstadosMenu);
    });

    document.getElementById('btn-back-encuesta')?.addEventListener('click', () => {
        console.log("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back-ejecutivo')?.addEventListener('click', () => {
        console.log("← Volver al dashboard");
        showView(viewDashboard);
    });

    document.getElementById('btn-back-alertas')?.addEventListener('click', () => {
        console.log("← Volver al menú de estados");
        showView(viewEstadosMenu);
    });

    document.getElementById('btn-export-csv')?.addEventListener('click', exportReportesCSV);
    document.getElementById('btn-export-pdf')?.addEventListener('click', exportReportesPDF);

    document.getElementById('dismac-logo-btn')?.addEventListener('click', () => {
        console.log("← Volver al dashboard (Logo)");
        showView(viewDashboard);
    });

    function handleNavigation(action) {
        console.log(`🧭 Action: ${action}`);

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
            case 'view-alertas':
                showAlertas();
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
        }
    }

    function showRegionTalleres(region) {
        console.log(`\n🏢 Mostrando talleres de: ${region}`);
        currentRegionTalleres = region;
        const regionUpper = region.toUpperCase();
        filteredTalleres = appWorkshopData.filter(t =>
            (t.CIUDAD || "").toUpperCase() === regionUpper
        );
        if (workshopSearchInput) workshopSearchInput.value = "";
        renderTalleres(region, filteredTalleres);
    }

    function renderTalleres(region, talleres) {
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
        const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];

        if (region === 'Municipios') {
            return municipios.some(m => terr.includes(m));
        }

        if (region === 'Regionales') {
            const excluidas = ['santa cruz', 'el alto', 'cochabamba', 'la paz'];
            if (excluidas.some(x => terr.includes(x))) return false;
            if (municipios.some(m => terr.includes(m))) return false;
            return true;
        }

        if (region === 'Santa Cruz') {
            const isMunicipio = municipios.some(m => terr.includes(m));
            return terr.includes('santa cruz') && !isMunicipio;
        }

        const regionNormalized = region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return terr.includes(regionNormalized);
    }

    function showRegionOrdenes(region) {
        console.log(`\n📋 Mostrando órdenes de: ${region}`);
        currentRegionOrdenes = region;
        filteredOrdenes = appOrdersData.filter(o => isOrderInRegion(o, region));

        if (estadosSearchInput) estadosSearchInput.value = "";
        renderOrdenes(region, filteredOrdenes);
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
        console.log("\n📋 Mostrando órdenes por última modificación (antiguas primero)");
        currentRegionOrdenes = 'Última Modificación';

        const filtroEl = document.getElementById('modificacion-filtro');
        if (filtroEl) filtroEl.classList.remove('hidden');
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
        });
    }

    function showEscalamientos() {
        console.log("\n📋 Mostrando órdenes para Escalamiento (Cambio de equipo)");
        currentRegionOrdenes = 'Escalamientos';

        const filtroEl = document.getElementById('modificacion-filtro');
        if (filtroEl) filtroEl.classList.add('hidden');

        // DEBUG: diagnosticar por qué no muestra datos
        const conFechaCompra = appOrdersData.filter(o => o['Fecha de compra'] && o['Fecha de compra'].trim());
        const conDetalleFalla = appOrdersData.filter(o => o.adicDetalleFalla && o.adicDetalleFalla.trim().length > 0);
        const conAmbos = appOrdersData.filter(o => {
            const fc = o['Fecha de compra'] && o['Fecha de compra'].trim();
            const df = o.adicDetalleFalla && o.adicDetalleFalla.trim().length > 0;
            return fc && df;
        });
        console.log(`[DEBUG ESC] Total órdenes: ${appOrdersData.length}`);
        console.log(`[DEBUG ESC] Con Fecha de compra: ${conFechaCompra.length}`);
        console.log(`[DEBUG ESC] Con Detalle de falla: ${conDetalleFalla.length}`);
        console.log(`[DEBUG ESC] Con ambos: ${conAmbos.length}`);
        if (conAmbos.length > 0) {
            console.log(`[DEBUG ESC] Ejemplo:`, conAmbos[0]['Fecha de compra'], conAmbos[0].adicDetalleFalla?.substring(0, 50));
        }
        // Muestra los primeros 3 que tengan fecha de compra
        const ejemplos = conFechaCompra.slice(0, 3);
        ejemplos.forEach(o => {
            console.log(`[DEBUG ESC] Ejemplo FC: "${o['Fecha de compra']}" → diasDesde=${diasDesde(o['Fecha de compra'])}, adicDetalleFalla=${o.adicDetalleFalla ? o.adicDetalleFalla.substring(0, 30) : '(vacío)'}`);
        });

        // Filtrar
        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        let ordenesFiltradas = appOrdersData.filter(o => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            if (estados_excluidos.some(ex => e.includes(ex))) return false;

            const diasCompra = diasDesde(o['Fecha de compra']);
            const tieneFalla = o.adicDetalleFalla && o.adicDetalleFalla.trim().length > 0;
            return diasCompra !== null && diasCompra <= 30 && tieneFalla;
        });
        console.log(`[DEBUG ESC] Después del filtro: ${ordenesFiltradas.length} órdenes`);
        // Mostrar nombres de columnas que contienen "fecha" o "compra"
        if (appOrdersData.length > 0) {
            const cols = Object.keys(appOrdersData[0]);
            const fechaCols = cols.filter(c => /fecha|compra|purchase/i.test(c));
            console.log(`[DEBUG ESC] Columnas con "fecha/compra":`, fechaCols);
        }

        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        if (rol === 'regional' && regional) {
            ordenesFiltradas = ordenesFiltradas.filter(o => isOrderInRegion(o, regional));
        }

        if (estadosSearchInput) estadosSearchInput.value = "";
        
        renderOrdenes('Escalamientos', ordenesFiltradas, {
            titulo: 'Escalamientos (Cambio de equipo ≤ 30 días)'
        });
    }

    function renderOrdenes(region, ordenes, opciones) {
        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = (opciones && opciones.titulo) ? opciones.titulo : `Órdenes - ${region}`;

        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;

        // FILTRO DE ESTADOS: Excluir error, entregado, cerrado
        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        let ordenesFiltradas = ordenes.filter(o => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return !estados_excluidos.some(ex => e.includes(ex));
        });

        // FILTRO DE USUARIO (NUEVO)
        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        if (rol === 'regional' && regional) {
            ordenesFiltradas = ordenesFiltradas.filter(o => isOrderInRegion(o, regional));
        }

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
            showView(viewEstadosServicio);
            return;
        }

        const html = ordenesFiltradas.map((o, idx) => {
            const workshopNameRaw = (o['¿Qué servicio técnico ?'] || "").trim();
            const workshopName = workshopNameRaw.toUpperCase();
            
            let cityForWorkshop = region.toUpperCase();
            if (cityForWorkshop === 'MUNICIPIOS') cityForWorkshop = 'SANTA CRUZ';

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
                    if (diasMod >= 4) { bg = '#fee2e2'; col = '#dc2626'; }
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
            let zapiaInfoHtml = "";
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

            return `
                <div class="accordion-item" style="margin-bottom:12px; border-radius:15px; border:1px solid #e2e8f0; border-left:4px solid #3b82f6; background:white; overflow:hidden;">
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
                                    <span style="background:#e0e7ff; color:#3b82f6; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700; white-space:nowrap;">${o.Estado || 'S/E'}</span>
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
                            ${workshopHtml}
                            ${adicionalesInfoHtml}
                            
                            ${clientContactHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        contentEl.innerHTML = html;
        showView(viewEstadosServicio);
    }

    function showProtocol() {
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
        let data = appOrdersData;
        const rol = localStorage.getItem('usuario_rol');
        const regional = localStorage.getItem('usuario_regional');
        if (rol === 'regional' && regional) {
            data = data.filter(o => isOrderInRegion(o, regional));
        }
        return data;
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
                data = data.filter(o => normalizarTexto(o['Territorio de servicio: Nombre']) === normalizarTexto(fRegion));
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

        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const isExcluido = (o) => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return estados_excluidos.some(ex => e.includes(ex));
        };

        const activas = data.filter(o => !isExcluido(o));
        const estancadas = activas.filter(o => {
            const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            return (diasMod !== null && diasMod >= 4) || diasCreacion >= 8;
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

        const diasSinCambios = parseInt(document.getElementById('sla-dias-sin-cambios')?.value || '4', 10) || 4;
        const diasCreacion = parseInt(document.getElementById('sla-dias-creacion')?.value || '8', 10) || 8;

        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const isExcluido = (o) => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return estados_excluidos.some(ex => e.includes(ex));
        };

        const alertas = data.filter(o => !isExcluido(o)).map(o => {
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
        console.log('📊 Abriendo Reportes y Gráficas');
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
        console.log('📈 Abriendo Dashboard Ejecutivo');
        showView(viewEjecutivo);
        renderEjecutivo();
    }

    function renderEjecutivo() {
        const content = document.getElementById('ejecutivo-content');
        if (!content) return;

        const data = dataFiltradaPorRol();
        const estadosExcluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const isExcluido = (o) => {
            const e = normalizarTexto(o.Estado);
            return estadosExcluidos.some(x => e.includes(x));
        };

        const activas = data.filter(o => !isExcluido(o));
        const cerradas = data.filter(o => esOrdenCerrada(o));
        const estancadas = activas.filter(o => {
            const dc = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const dm = diasDesde(o['Fecha de la última modificación']);
            return (dm !== null && dm >= 4) || dc >= 8;
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

    // ── ALERTAS PUSH ───────────────────────────────────────────────────────
    function getAlertasConfig() {
        const def = { enabled: false, diasSinCambios: 4, diasCreacion: 8, region: 'todas' };
        try {
            return Object.assign({}, def, JSON.parse(localStorage.getItem('alertas_config') || '{}'));
        } catch (e) {
            return def;
        }
    }

    function saveAlertasConfig(cfg) {
        localStorage.setItem('alertas_config', JSON.stringify(cfg));
    }

    function showAlertas() {
        console.log('🔔 Abriendo Alertas Push');
        showView(viewAlertas);
        renderAlertasConfig();
    }

    function renderAlertasConfig() {
        const content = document.getElementById('alertas-content');
        if (!content) return;
        const cfg = getAlertasConfig();
        const regiones = [...new Set(appOrdersData.map(o => (o['Territorio de servicio: Nombre'] || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

        const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
        const permHtml = {
            granted: '<span style="background:#f0fdf4; color:#166534; padding:6px 12px; border-radius:12px; font-size:0.8rem; font-weight:700;"><i class="bi bi-check-circle-fill"></i> Permiso concedido</span>',
            denied: '<span style="background:#fef2f2; color:#b91c1c; padding:6px 12px; border-radius:12px; font-size:0.8rem; font-weight:700;"><i class="bi bi-x-circle-fill"></i> Permiso denegado (revisa los ajustes del navegador)</span>',
            default: '<span style="background:#fffbeb; color:#b45309; padding:6px 12px; border-radius:12px; font-size:0.8rem; font-weight:700;"><i class="bi bi-bell-slash-fill"></i> Permiso no solicitado</span>',
            unsupported: '<span style="background:#f1f5f9; color:#475569; padding:6px 12px; border-radius:12px; font-size:0.8rem; font-weight:700;"><i class="bi bi-question-circle-fill"></i> Notificaciones no soportadas</span>'
        }[perm] || '';

        content.innerHTML = `
            <section style="margin-bottom:1rem;">
                <div style="background:white; border:1px solid #e2e8f0; border-radius:16px; padding:1.2rem; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:1rem;">
                        <div style="background:#FDE8EA; color:#E31837; width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="bi bi-bell-fill"></i></div>
                        <div>
                            <h3 style="font-size:1.05rem; font-weight:800; margin:0; color:#111;">Notificaciones de órdenes estancadas</h3>
                            <span style="font-size:0.78rem; color:#64748b;">Se muestra una alerta local cuando una orden supera los umbrales.</span>
                        </div>
                    </div>

                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.9rem 1rem; margin-bottom:1rem;">
                        <input type="checkbox" id="alertas-enabled" ${cfg.enabled ? 'checked' : ''} style="width:20px; height:20px; accent-color:#E31837; cursor:pointer;">
                        <span style="font-weight:700; font-size:0.95rem; color:#111;">Activar notificaciones de alerta</span>
                    </label>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.7rem; margin-bottom:1rem;">
                        <div>
                            <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:5px;">Sin cambios (días)</label>
                            <input type="number" id="alertas-dias-sin-cambios" value="${cfg.diasSinCambios}" min="1" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid #e2e8f0; font-family:'Outfit',sans-serif; font-size:0.95rem; box-sizing:border-box; outline:none;">
                        </div>
                        <div>
                            <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:5px;">Desde creación (días)</label>
                            <input type="number" id="alertas-dias-creacion" value="${cfg.diasCreacion}" min="1" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid #e2e8f0; font-family:'Outfit',sans-serif; font-size:0.95rem; box-sizing:border-box; outline:none;">
                        </div>
                    </div>

                    <div style="margin-bottom:1rem;">
                        <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:5px;">Región</label>
                        <select id="alertas-region" style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid #e2e8f0; font-family:'Outfit',sans-serif; font-size:0.95rem; background:white; color:#111; box-sizing:border-box; outline:none;">
                            <option value="todas" ${cfg.region === 'todas' ? 'selected' : ''}>Todas las regiones</option>
                            ${regiones.map(r => `<option value="${escapeHTML(r)}" ${cfg.region === r ? 'selected' : ''}>${escapeHTML(r)}</option>`).join('')}
                        </select>
                    </div>

                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:1rem;">${permHtml}</div>

                    <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:0.75rem 1rem; margin-bottom:1rem; font-size:0.8rem; color:#64748b; font-weight:600;"><i class="bi bi-info-circle-fill" style="color:#E31837;"></i> Los cambios en región y días se aplican al presionar <strong>Buscar órdenes</strong>.</div>

                    <div style="display:flex; flex-direction:column; gap:0.7rem;">
                        <button id="alertas-buscar" style="width:100%; background:#E31837; color:white; border:none; padding:14px; border-radius:12px; font-family:'Outfit',sans-serif; font-weight:800; font-size:0.95rem; cursor:pointer;"><i class="bi bi-search"></i> Buscar órdenes</button>
                        <button id="alertas-enviar-ahora" style="width:100%; background:#111; color:white; border:none; padding:12px; border-radius:12px; font-family:'Outfit',sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer;"><i class="bi bi-send-fill"></i> Verificar y enviar alertas ahora</button>
                        <button id="alertas-solicitar-permiso" style="width:100%; background:#f1f5f9; color:#111; border:1px solid #e2e8f0; padding:12px; border-radius:12px; font-family:'Outfit',sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer;"><i class="bi bi-bell"></i> Solicitar permiso</button>
                        <button id="alertas-probar" style="width:100%; background:#f1f5f9; color:#111; border:1px solid #e2e8f0; padding:12px; border-radius:12px; font-family:'Outfit',sans-serif; font-weight:700; font-size:0.85rem; cursor:pointer;"><i class="bi bi-bell-fill"></i> Probar notificación</button>
                        <button id="alertas-detener" style="width:100%; background:#111; color:white; border:none; padding:12px; border-radius:12px; font-family:'Outfit',sans-serif; font-weight:800; font-size:0.85rem; cursor:pointer;"><i class="bi bi-stop-circle-fill" style="color:#E31837;"></i> Detener todas las notificaciones</button>
                    </div>
                </div>
            </section>
            <div id="alertas-resultado" style="display:flex; flex-direction:column; gap:0.7rem;">
                <div style="background:#f8fafc; border:1px dashed #cbd5e1; border-radius:12px; padding:1rem; color:#64748b; font-size:0.85rem; font-weight:600; text-align:center;"><i class="bi bi-search" style="margin-right:6px;"></i> Selecciona los filtros y presiona <strong>Buscar órdenes</strong> para ver los resultados.</div>
            </div>
        `;

        document.getElementById('alertas-enabled')?.addEventListener('change', (e) => {
            cfg.enabled = e.target.checked;
            saveAlertasConfig(cfg);
            if (cfg.enabled && ('Notification' in window) && Notification.permission !== 'granted') {
                Notification.requestPermission().then(() => renderAlertasConfig());
            }
        });
        document.getElementById('alertas-dias-sin-cambios')?.addEventListener('input', (e) => {
            cfg.diasSinCambios = Math.max(1, parseInt(e.target.value, 10) || 1);
            saveAlertasConfig(cfg);
        });
        document.getElementById('alertas-dias-creacion')?.addEventListener('input', (e) => {
            cfg.diasCreacion = Math.max(1, parseInt(e.target.value, 10) || 1);
            saveAlertasConfig(cfg);
        });
        document.getElementById('alertas-region')?.addEventListener('change', (e) => {
            cfg.region = e.target.value;
            saveAlertasConfig(cfg);
        });
        document.getElementById('alertas-solicitar-permiso')?.addEventListener('click', () => {
            if ('Notification' in window) {
                Notification.requestPermission().then(() => renderAlertasConfig());
            }
        });
        document.getElementById('alertas-probar')?.addEventListener('click', () => {
            if (('Notification' in window) && Notification.permission === 'granted') {
                new Notification('✅ Notificaciones de Dismac', {
                    body: 'Esta es una prueba. Las alertas de órdenes estancadas llegarán así.',
                    icon: 'icono-servicio-tecnico.png'
                });
            } else {
                alert('Primero solicita el permiso de notificaciones.');
            }
        });
        document.getElementById('alertas-buscar')?.addEventListener('click', () => {
            renderAlertasPreview();
        });
        document.getElementById('alertas-enviar-ahora')?.addEventListener('click', () => {
            renderAlertasResultado(checkAlertasPush(true));
        });
        document.getElementById('alertas-detener')?.addEventListener('click', () => {
            cfg.enabled = false;
            saveAlertasConfig(cfg);
            localStorage.removeItem('alertas_fired');
            renderAlertasConfig();
            alert('Notificaciones detenidas. Ya no se mostrarán alertas al abrir la app.');
        });
    }

    function listAlertasStancadas() {
        const cfg = getAlertasConfig();
        const data = dataFiltradaPorRol();
        const estadosExcluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const alerts = [];
        data.forEach(o => {
            const e = normalizarTexto(o.Estado);
            if (estadosExcluidos.some(x => e.includes(x))) return;
            if (cfg.region !== 'todas' && !isOrderInRegion(o, cfg.region)) return;
            const diasMod = diasDesde(o['Fecha de la última modificación']);
            const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const razones = [];
            if (diasMod !== null && diasMod >= cfg.diasSinCambios) razones.push(`${diasMod}d sin cambios`);
            if (diasCreacion >= cfg.diasCreacion) razones.push(`${diasCreacion}d desde creación`);
            if (razones.length) alerts.push({ o, razones });
        });
        alerts.sort((a, b) => {
            const da = Math.max(parseInt(a.o['Tiempo desde apertura (Días)'] || '0', 10), diasDesde(a.o['Fecha de la última modificación']) || 0);
            const db = Math.max(parseInt(b.o['Tiempo desde apertura (Días)'] || '0', 10), diasDesde(b.o['Fecha de la última modificación']) || 0);
            return db - da;
        });
        return alerts;
    }

    function renderAlertasPreview() {
        const el = document.getElementById('alertas-resultado');
        if (!el) return;
        const cfg = getAlertasConfig();
        if (!cfg.enabled) {
            el.innerHTML = '<div style="background:#f1f5f9; border:1px dashed #cbd5e1; border-radius:12px; padding:1rem; color:#475569; font-size:0.85rem; font-weight:600;"><i class="bi bi-bell-slash" style="margin-right:6px;"></i> Notificaciones desactivadas. Activa el interruptor para ver qué órdenes generarían alertas con los filtros.</div>';
            return;
        }
        const alerts = listAlertasStancadas();
        if (alerts.length === 0) {
            el.innerHTML = '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:1rem; color:#166534; font-weight:600;"><i class="bi bi-check-circle-fill" style="margin-right:6px;"></i>Sin órdenes que superen los umbrales con los filtros actuales.</div>';
            return;
        }
        el.innerHTML = `
            <div style="background:#fffbeb; border:1px solid #fde68a; border-radius:12px; padding:0.7rem 1rem; color:#b45309; font-weight:800; font-size:0.85rem;"><i class="bi bi-bell-fill" style="margin-right:6px;"></i>${alerts.length} orden${alerts.length === 1 ? '' : 'es'} generarían alerta con estos filtros (región y días)</div>
            ${alerts.map(a => `
                <div style="background:white; border:1px solid #e2e8f0; border-left:5px solid #f59e0b; border-radius:12px; padding:0.85rem 1rem;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                        <div style="flex:1;">
                            <p style="margin:0 0 4px 0; font-weight:800; font-size:0.92rem; color:#111;">${escapeHTML(a.o['Cuenta: Nombre de la cuenta'])}</p>
                            <p style="margin:0; font-size:0.8rem; color:#64748b;">${escapeHTML(a.o['Producto ST'])} · ${escapeHTML(a.o['Territorio de servicio: Nombre'])}</p>
                            <p style="margin:4px 0 0 0; font-size:0.78rem; color:#b45309; font-weight:600;">${a.razones.join(' · ')}</p>
                        </div>
                    </div>
                </div>`).join('')}
        `;
    }

    function renderAlertasResultado(res) {
        const el = document.getElementById('alertas-resultado');
        if (!el) return;
        if (res.error) {
            el.innerHTML = `<div style="background:#fef2f2; border:1px solid #fecaca; border-radius:12px; padding:1rem; color:#b91c1c; font-weight:600; font-size:0.9rem;"><i class="bi bi-exclamation-triangle-fill" style="margin-right:6px;"></i>${res.error}</div>`;
            return;
        }
        if (res.total === 0) {
            el.innerHTML = '<div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:12px; padding:1rem; color:#166534; font-weight:600;"><i class="bi bi-check-circle-fill" style="margin-right:6px;"></i>Sin órdenes que superen los umbrales.</div>';
            return;
        }
        el.innerHTML = res.items.map(a => `
            <div style="background:white; border:1px solid ${a.yaEnviada ? '#cbd5e1' : '#fde68a'}; border-left:5px solid ${a.yaEnviada ? '#94a3b8' : '#f59e0b'}; border-radius:12px; padding:0.85rem 1rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <div style="flex:1;">
                        <p style="margin:0 0 4px 0; font-weight:800; font-size:0.92rem; color:#111;">${escapeHTML(a.o['Cuenta: Nombre de la cuenta'])}</p>
                        <p style="margin:0; font-size:0.8rem; color:#64748b;">${escapeHTML(a.o['Producto ST'])} · ${escapeHTML(a.o['Territorio de servicio: Nombre'])}</p>
                        <p style="margin:4px 0 0 0; font-size:0.78rem; color:#b45309; font-weight:600;">${a.razones.join(' · ')}</p>
                    </div>
                    <span style="background:${a.yaEnviada ? '#e2e8f0' : '#f59e0b'}; color:${a.yaEnviada ? '#475569' : 'white'}; padding:3px 10px; border-radius:12px; font-size:0.65rem; font-weight:800; flex-shrink:0;">${a.yaEnviada ? 'ENVIADA HOY' : 'NOTIFICADA'}</span>
                </div>
            </div>`).join('');
    }

    function checkAlertasPush(force) {
        const cfg = getAlertasConfig();
        if (!cfg.enabled && !force) return { total: 0, items: [] };
        if (!('Notification' in window)) return { error: 'Este navegador no soporta notificaciones.', total: 0, items: [] };
        if (Notification.permission !== 'granted') return { error: 'El permiso de notificaciones no está concedido. Solicitálo con el botón.', total: 0, items: [] };

        const alerts = listAlertasStancadas();

        let fired;
        try { fired = JSON.parse(localStorage.getItem('alertas_fired') || '{}'); } catch (e) { fired = {}; }
        const hoy = new Date().toISOString().slice(0, 10);

        const result = alerts.map(a => {
            const odt = a.o['Número de orden de trabajo'];
            const yaEnviada = fired[odt] === hoy;
            if (!yaEnviada) {
                const n = new Notification(`⚠️ Orden estancada — ${a.o['Cuenta: Nombre de la cuenta']}`, {
                    body: `${a.o['Producto ST']} · ${a.o['Territorio de servicio: Nombre']} · ${a.razones.join(' · ')}`,
                    icon: 'icono-servicio-tecnico.png',
                    tag: odt
                });
                n.onclick = () => window.focus();
                fired[odt] = hoy;
            }
            return { o: a.o, razones: a.razones, yaEnviada };
        });
        localStorage.setItem('alertas_fired', JSON.stringify(fired));
        return { total: alerts.length, items: result };
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

    function encuestaFiltrada() {
        const fRegion = document.getElementById('encuesta-filtro-region')?.value || 'todas';
        const fStatus = document.getElementById('encuesta-filtro-status')?.value || 'todas';
        const q = normalizarTexto(document.getElementById('encuesta-buscador')?.value);
        return appEncuestaData.filter(r => {
            if (fRegion !== 'todas' && encuestaRegion(r) !== fRegion) return false;
            if (fStatus !== 'todas' && !((r['NPS Status'] || '').includes(fStatus))) return false;
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
    }

    function showEncuesta() {
        console.log('⭐ Abriendo Encuestas NPS (Admin)');
        const contentEl = document.getElementById('encuesta-content');
        if (!contentEl) return;

        if (appEncuestaData.length === 0) {
            contentEl.innerHTML = '<div style="text-align:center;padding:3rem;color:#64748b;"><i class="bi bi-emoji-smile" style="font-size:2rem; display:block; margin-bottom:10px;"></i>Sin datos de encuestas disponibles.</div>';
            showView(viewEncuesta);
            return;
        }

        const allRegiones = [...new Set(appEncuestaData.map(encuestaRegion))]
            .sort((a, b) => a.localeCompare(b, 'es'))
            .map(r => `<option value="${escapeHTML(r)}">${escapeHTML(r)}</option>`).join('');

        const filtersHtml = `
            <section style="margin-bottom:1rem;">
                <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:0.75rem; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-funnel-fill" style="color:#E31837;"></i> Filtros</h3>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.7rem;">
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:5px;">Regional</label>
                        <select id="encuesta-filtro-region"
                            style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid #e2e8f0; font-family:'Outfit',sans-serif; font-size:0.95rem; background:white; color:#111; box-sizing:border-box; outline:none;">
                            <option value="todas">Todas</option>
                            ${allRegiones}
                        </select>
                    </div>
                    <div>
                        <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:5px;">Clasificación</label>
                        <select id="encuesta-filtro-status"
                            style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid #e2e8f0; font-family:'Outfit',sans-serif; font-size:0.95rem; background:white; color:#111; box-sizing:border-box; outline:none;">
                            <option value="todas">Todas</option>
                            <option value="Promoter">Promotores</option>
                            <option value="Passive">Pasivos</option>
                            <option value="Detractor">Detractores</option>
                        </select>
                    </div>
                </div>
                <div style="margin-top:0.7rem;">
                    <label style="font-size:0.8rem; font-weight:700; color:#475569; display:block; margin-bottom:5px;">Buscar (técnico, producto, tipo, ODT, comentario)</label>
                    <input type="search" id="encuesta-buscador" placeholder="Ej: Lavadora, 139471, Kernig..."
                        style="width:100%; padding:11px 12px; border-radius:10px; border:1px solid #e2e8f0; font-family:'Outfit',sans-serif; font-size:0.95rem; background:white; color:#111; box-sizing:border-box; outline:none;">
                </div>
            </section>
            <div id="encuesta-lista"></div>
        `;

        contentEl.innerHTML = `
            <div id="encuesta-resumen"></div>
            ${filtersHtml}
        `;

        ['encuesta-filtro-region', 'encuesta-filtro-status'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', renderEncuestaView);
        });
        document.getElementById('encuesta-buscador')?.addEventListener('input', renderEncuestaView);

        renderEncuestaView();
        showView(viewEncuesta);
    }

    function renderEncuestaView() {
        renderEncuestaResumen();
        renderEncuestaList();
    }

    function renderEncuestaResumen() {
        const el = document.getElementById('encuesta-resumen');
        if (!el) return;

        const data = encuestaFiltrada();
        const stats = getEncuestaStats(data);

        const kpiCard = (label, value, color, icon, sub) => `
            <div style="background:white; border:1px solid ${color}33; border-radius:14px; padding:1rem; display:flex; align-items:center; gap:12px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                <div style="background:${color}1a; color:${color}; width:40px; height:40px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="bi ${icon}"></i></div>
                <div>
                    <div style="font-size:1.4rem; font-weight:800; color:#111; line-height:1;">${value}</div>
                    <div style="font-size:0.75rem; color:#64748b;">${label}</div>
                    ${sub ? `<div style="font-size:0.7rem; color:${color}; font-weight:700; margin-top:2px;">${sub}</div>` : ''}
                </div>
            </div>
        `;

        const fRegion = document.getElementById('encuesta-filtro-region')?.value || 'todas';
        const fStatus = document.getElementById('encuesta-filtro-status')?.value || 'todas';
        const activos = [];
        if (fRegion !== 'todas') activos.push(`Regional: ${fRegion}`);
        if (fStatus !== 'todas') activos.push(`Clasificación: ${fStatus}`);

        const kpiHtml = `
            <section style="margin-bottom:1.5rem;">
                <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:0.75rem; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-emoji-smile-fill" style="color:#E31837;"></i> Resumen de Encuestas NPS</h3>
                ${activos.length ? `<p style="font-size:0.78rem; color:#b45309; font-weight:700; margin:0 0 0.75rem 0;"><i class="bi bi-funnel-fill"></i> Filtrado por: ${activos.join(' · ')}</p>` : ''}
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                    ${kpiCard('Encuestas', stats.total, '#3b82f6', 'bi-file-earmark-text')}
                    ${kpiCard('NPS Global', stats.nps, stats.nps >= 0 ? '#16a34a' : '#ef4444', 'bi-graph-up-arrow')}
                    ${kpiCard('Promotores', `${stats.promo}`, '#16a34a', 'bi-emoji-smile-fill', `${stats.pProm}%`)}
                    ${kpiCard('Detractores', `${stats.detractor}`, '#ef4444', 'bi-emoji-frown-fill', `${stats.pDet}%`)}
                </div>
            </section>
        `;

        const byRegion = new Map();
        data.forEach(r => {
            const reg = encuestaRegion(r);
            if (!byRegion.has(reg)) byRegion.set(reg, []);
            byRegion.get(reg).push(r);
        });

        const regionCards = [...byRegion.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([reg, list]) => {
                const s = getEncuestaStats(list);
                const npsColor = s.nps >= 50 ? '#16a34a' : (s.nps >= 0 ? '#d97706' : '#ef4444');
                return `
                    <div style="background:white; border:1px solid #e2e8f0; border-radius:14px; padding:1rem; box-shadow:0 2px 8px rgba(0,0,0,0.04); display:flex; flex-direction:column; gap:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:800; font-size:1rem; color:#111;">${escapeHTML(reg)}</span>
                            <span style="background:${npsColor}; color:white; font-size:0.75rem; font-weight:800; padding:3px 10px; border-radius:12px;">NPS ${s.nps}</span>
                        </div>
                        <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:6px; text-align:center; font-size:0.72rem; color:#64748b;">
                            <div style="background:#f0fdf4; border-radius:10px; padding:8px 4px;"><div style="font-size:1.1rem; font-weight:800; color:#16a34a;">${s.promo}</div>Promotores</div>
                            <div style="background:#fffbeb; border-radius:10px; padding:8px 4px;"><div style="font-size:1.1rem; font-weight:800; color:#d97706;">${s.pasivo}</div>Pasivos</div>
                            <div style="background:#fef2f2; border-radius:10px; padding:8px 4px;"><div style="font-size:1.1rem; font-weight:800; color:#ef4444;">${s.detractor}</div>Detractores</div>
                        </div>
                        <div style="font-size:0.72rem; color:#64748b;"><i class="bi bi-check2-circle" style="color:#16a34a;"></i> ${s.total} encuestas</div>
                    </div>`;
            }).join('');

        const regionSection = `
            <section style="margin-bottom:1.5rem;">
                <h3 style="font-size:1.1rem; font-weight:800; margin-bottom:0.75rem; color:#111; display:flex; align-items:center; gap:8px;"><i class="bi bi-geo-alt-fill" style="color:#E31837;"></i> Por Regional</h3>
                <div style="display:grid; grid-template-columns:1fr; gap:0.8rem;">${regionCards}</div>
            </section>
        `;

        el.innerHTML = kpiHtml + regionSection;
    }

    function renderEncuestaList() {
        const container = document.getElementById('encuesta-lista');
        if (!container) return;

        let list = encuestaFiltrada();

        const orden = { detractor: 0, passive: 1, promoter: 2 };
        list.sort((a, b) => {
            const d = (orden[encuestaClasif(a)] || 1) - (orden[encuestaClasif(b)] || 1);
            if (d !== 0) return d;
            const na = (a['NPS Q1'] || '') + '', nb = (b['NPS Q1'] || '') + '';
            return na.localeCompare(nb, 'es', { numeric: true });
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
            const region = escapeHTML(encuestaRegion(r));
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
                                <p style="margin:0; font-size:0.78rem; color:#475569;"><i class="bi bi-person-badge"></i> ${escapeHTML(tecnico)} · <i class="bi bi-geo-alt-fill"></i> ${region}</p>
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

        const count = list.length;
        container.innerHTML = `<div style="font-size:0.8rem; font-weight:700; color:#64748b; margin-bottom:10px;">${count} respuesta(s)</div>` + html;
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
        const estadosExcluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const isExcluido = (o) => {
            const e = normalizarTexto(o.Estado);
            return estadosExcluidos.some(x => e.includes(x));
        };
        const activas = data.filter(o => !isExcluido(o));
        const estancadas = activas.filter(o => {
            const dc = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
            const dm = diasDesde(o['Fecha de la última modificación']);
            return (dm !== null && dm >= 4) || dc >= 8;
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

    async function loadAllData() {
        try {
            const [workshopData, globalData, adicionalesData, encuestaData] = await Promise.all([
                fetchGoogleSheet(SHEETS_CONFIG.talleres.id, SHEETS_CONFIG.talleres.sheetName),
                fetchGoogleSheet(SHEETS_CONFIG.seguimiento.id, SHEETS_CONFIG.seguimiento.sheetName),
                fetchGoogleSheet(SHEETS_CONFIG.adicionales.id, SHEETS_CONFIG.adicionales.sheetName).catch(err => {
                    console.warn("Error al cargar REPORTE GLOBAL ADICIONALES, continuando sin ella:", err);
                    return [];
                }),
                fetchGoogleSheet(SHEETS_CONFIG.encuesta.id, SHEETS_CONFIG.encuesta.sheetName).catch(err => {
                    console.warn("Error al cargar ENCUESTA, continuando sin ella:", err);
                    return [];
                })
            ]);

            const parsed = parseAllData(workshopData, globalData, adicionalesData);
            appWorkshopData = parsed.parsedWorkshopData;
            appOrdersData = parsed.parsedOrdersData;
            appEncuestaData = encuestaData;

            console.log('Datos procesados:', {
                talleres: appWorkshopData.length,
                ordenes: appOrdersData.length,
                encuestas: appEncuestaData.length,
                ordenesEnriquecidasAdicionales: appOrdersData.filter(o => o.adicionalesEnriched).length
            });
        } catch (error) {
            console.error('Error al cargar datos:', error);
            const statusEl = document.getElementById('sync-status');
            if (statusEl) statusEl.classList.remove('hidden');
        }
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
});