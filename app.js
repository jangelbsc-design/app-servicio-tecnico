import { USERS_SHEET_CONFIG, SHEETS_CONFIG, fetchGoogleSheet, chequearOrdenesEstancadas } from './api.js';
import { parseAllData } from './dataParser.js';

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

let appWorkshopData = [];
let appOrdersData = [];
// ────────────────────────────────────────────────────────────────────────────

console.log("🔧 APP.JS CARGADO");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded DISPARADO");

    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const user = document.getElementById('login-usuario').value;
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

    const viewDashboard = document.getElementById('view-dashboard');
    const viewRedTalleres = document.getElementById('view-red-talleres');
    const viewEstadosMenu = document.getElementById('view-estados-menu');
    const viewEstadosServicio = document.getElementById('view-estados-servicio');
    const viewDetails = document.getElementById('view-details');
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
    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

    // Verificar órdenes estancadas y notificar por Telegram
    chequearOrdenesEstancadas(appOrdersData);

    // Variables de estado para búsqueda regional
    let currentRegionTalleres = "";
    let filteredTalleres = [];
    let currentRegionOrdenes = "";
    let filteredOrdenes = [];

    // Buscador Regional de Talleres
    const workshopSearchInput = document.getElementById('workshop-search-input');
    workshopSearchInput?.addEventListener('input', (e) => {
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
    });

    // Buscador Regional de Órdenes
    const estadosSearchInput = document.getElementById('estados-search-input');
    estadosSearchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filteredOrdenes = appOrdersData.filter(o =>
            isOrderInRegion(o, currentRegionOrdenes) &&
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
                (o.zapiaCI || "").toLowerCase().includes(query) ||
                (o.zapiaTel || "").toLowerCase().includes(query) ||
                (o.zapiaDiag || "").toLowerCase().includes(query) ||
                (o.zapiaSol || "").toLowerCase().includes(query))
        );
        renderOrdenes(currentRegionOrdenes, filteredOrdenes);
    });

    // Lógica de Búsqueda Global
    globalSearchInput?.addEventListener('input', (e) => {
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
            (o.zapiaCI || "").toLowerCase().includes(query) ||
            (o.zapiaTel || "").toLowerCase().includes(query) ||
            (o.zapiaDiag || "").toLowerCase().includes(query) ||
            (o.zapiaSol || "").toLowerCase().includes(query)
        );

        renderGlobalSearchResults(matchedTalleres, matchedOrdenes);
    });

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
                                    <span style="font-size:0.7rem; background:#e0e7ff; color:#3b82f6; padding:2px 8px; border-radius:10px; font-weight:700;">${o.Estado || 'S/E'}</span>
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
        if (title === 'Protocolo de recepción' || title === '¿Cómo funciona la garantía?') {
            console.log("← Volver al dashboard");
            showView(viewDashboard);
        } else {
            console.log("← Volver a regiones");
            showView(viewRedTalleres);
        }
    });

    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => {
        if (globalSearchInput && globalSearchInput.value.trim() !== "") {
            console.log("← Volver al dashboard (resultado de búsqueda)");
            showView(viewDashboard);
        } else {
            console.log("← Volver a menú estados");
            showView(viewEstadosMenu);
        }
    });

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

    function renderOrdenes(region, ordenes) {
        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = `Órdenes - ${region}`;

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

            // Preparar contacto del cliente si Zapia tiene teléfono
            let clientContactHtml = "";
            if (o.zapiaEnriched && o.zapiaTel) {
                const numList = (o.zapiaTel || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
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
                        <p style="font-weight:700; font-size:0.85rem; margin-bottom:5px; color:#2e7d32; display:flex; align-items:center; gap:5px;"><i class="bi bi-person-fill"></i> Contacto Cliente (Zapia)</p>
                        ${buttonsHtml}
                    </div>
                `;
            }

            // Preparar información de diagnóstico y solución enriquecidos de Zapia
            let zapiaInfoHtml = "";
            if (o.zapiaEnriched) {
                zapiaInfoHtml = `
                    <div style="margin-top:15px; padding:12px; background:#f0fdf4; border-radius:10px; border:1px solid #bbf7d0;">
                        <p style="font-weight:700; font-size:0.85rem; margin:0 0 8px 0; color:#16a34a; display:flex; align-items:center; gap:5px;"><i class="bi bi-robot"></i> Datos Complementarios (Zapia)</p>
                        <div style="display:flex; flex-direction:column; gap:6px; font-size:0.8rem; color:#14532d;">
                            ${o.zapiaMarca ? `<p style="margin:0;"><strong>Marca:</strong> ${o.zapiaMarca}</p>` : ''}
                            ${o.zapiaCI ? `<p style="margin:0;"><strong>Carnet de Identidad:</strong> ${o.zapiaCI}</p>` : ''}
                            ${o.zapiaTel ? `<p style="margin:0;"><strong>Teléfono:</strong> ${o.zapiaTel}</p>` : ''}
                            ${o.zapiaDiag ? `<p style="margin:0; white-space: pre-line;"><strong>Diagnóstico:</strong> ${o.zapiaDiag}</p>` : ''}
                            ${o.zapiaSol ? `<p style="margin:0; white-space: pre-line;"><strong>Solución:</strong> ${o.zapiaSol}</p>` : ''}
                        </div>
                    </div>
                `;
            }

            return `
                <div class="accordion-item" style="margin-bottom:12px; border-radius:15px; border:1px solid #e2e8f0; border-left:4px solid #3b82f6; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="flex:1; padding-right:10px;">
                                <p style="margin:0 0 8px 0; font-weight:800; color:#111; font-size:1.05rem; line-height:1.2; display:flex; align-items:center; gap:6px;">
                                    ${o['Cuenta: Nombre de la cuenta'] || 'CLIENTE S/N'}
                                    ${o.zapiaEnriched ? `<span style="background:#dcfce7; color:#15803d; font-size:0.65rem; padding:2px 6px; border-radius:6px; font-weight:700; display:inline-flex; align-items:center; gap:3px;"><i class="bi bi-robot"></i> Zapia</span>` : ''}
                                </p>
                                <div style="display:flex; align-items:center; gap:12px; font-size:0.8rem; color:#64748b;">
                                    <span style="display:flex; align-items:center; gap:4px;"><i class="bi bi-geo-alt-fill" style="color:#ef4444;"></i> ${o['Territorio de servicio: Nombre'] || 'Sin región'}</span>
                                    <span style="display:flex; align-items:center; gap:4px;"><i class="bi bi-clock-fill" style="color:#f59e0b;"></i> ${o['Tiempo desde apertura (Días)'] || '0'}d</span>
                                </div>
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; justify-content:space-between; height:100%; min-height:60px;">
                                <span style="background:#e0e7ff; color:#3b82f6; padding:4px 10px; border-radius:12px; font-size:0.7rem; font-weight:700; white-space:nowrap;">${o.Estado || 'S/E'}</span>
                                <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#cbd5e1; font-size:1.2rem; margin-top:auto;"></i>
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
                            <p style="margin:0;"><strong>Fecha de ingreso a la marca:</strong> ${o['Fecha de ingreso a la marca'] || '—'}</p>
                            <p style="margin:0;"><strong>Referencia:</strong> ${o['Referencia'] || '—'}</p>
                            <p style="margin:0;"><strong>Estado:</strong> ${o.Estado || '—'}</p>
                            ${workshopHtml}
                            ${zapiaInfoHtml}
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



    function showView(view) {
        document.querySelectorAll('.main-content').forEach(v => v.classList.add('hidden'));
        view?.classList.remove('hidden');
    }

    async function loadAllData() {
        try {
            const [workshopData, globalData, zapiaData] = await Promise.all([
                fetchGoogleSheet(SHEETS_CONFIG.talleres.id, SHEETS_CONFIG.talleres.sheetName),
                fetchGoogleSheet(SHEETS_CONFIG.seguimiento.id, SHEETS_CONFIG.seguimiento.sheetName),
                fetchGoogleSheet(SHEETS_CONFIG.zapia.id, SHEETS_CONFIG.zapia.sheetName).catch(err => {
                    console.warn("Error al cargar ZAPIA_ENRICHMENT, continuando sin ella:", err);
                    return [];
                })
            ]);

            const parsed = parseAllData(workshopData, globalData, zapiaData);
            appWorkshopData = parsed.parsedWorkshopData;
            appOrdersData = parsed.parsedOrdersData;

            console.log('Datos procesados:', { 
                talleres: appWorkshopData.length, 
                ordenes: appOrdersData.length,
                ordenesEnriquecidas: appOrdersData.filter(o => o.zapiaEnriched).length
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