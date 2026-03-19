let appWorkshopData = [];
let appOrdersData = [];

const SHEETS_CONFIG = {
    talleres: {
        id: '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
        sheetName: 'RED%20DE%20TALLERES'
    },
    seguimiento: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'REPORTE%20GLOBAL'
    }
};

// ── CONFIGURACIÓN TELEGRAM ─────────────────────────────────────────────────
// 1. Pon aquí el token que te dio @BotFather
// 2. El Chat ID ya está configurado con el tuyo
const TELEGRAM_CONFIG = {
    token: '8769379678:AAFjYMA5UXyWQ0QTyUSHhBEXhl2FAxmomLA',
    chatId: '363865053'                  // Juan Angel Bustos
};

async function sendTelegram(message) {
    if (!TELEGRAM_CONFIG.token || TELEGRAM_CONFIG.token === 'PONER_TOKEN_DEL_BOT_AQUI') {
        console.warn('Telegram: token no configurado.');
        return;
    }
    try {
        // Usamos Image() para evitar bloqueo CORS en file://
        // Telegram acepta GET requests para sendMessage
        const text = encodeURIComponent(message);
        const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.token}/sendMessage?chat_id=${TELEGRAM_CONFIG.chatId}&text=${text}&parse_mode=HTML`;
        const img = new Image();
        img.src = url;
        console.log('✅ Notificación Telegram enviada.');
    } catch (e) {
        console.error('Error enviando Telegram:', e);
    }
}

function parseFecha(str) {
    if (!str) return null;
    // Soporta: "dd/mm/yyyy", "yyyy-mm-dd", "mm/dd/yyyy hh:mm:ss" y variantes
    const s = str.toString().trim();
    let m;
    // dd/mm/yyyy o d/m/yyyy
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    // yyyy-mm-dd
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    // fallback
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

function chequearOrdenesEstancadas() {
    const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
    const isExcluido = (o) => {
        const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return estados_excluidos.some(ex => e.includes(ex));
    };

    const alertas = [];

    for (const o of appOrdersData) {
        if (isExcluido(o)) continue;

        const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
        const diasMod = diasDesde(o['Fecha de la última modificación']);
        const odt = o['Número de orden de trabajo'] || 'S/N';
        const cliente = o['Cuenta: Nombre de la cuenta'] || 'S/N';
        const producto = o['Producto ST'] || '';
        const region = o['Territorio de servicio: Nombre'] || '';
        const estado = o.Estado || 'S/E';
        const razones = [];

        if (diasMod !== null && diasMod >= 4) razones.push(`🕒 ${diasMod}d sin cambios`);
        if (diasCreacion >= 8) razones.push(`📅 ${diasCreacion}d desde creación`);

        if (razones.length > 0) {
            alertas.push(`⚠️ <b>${odt}</b> — ${cliente}
  📦 ${producto}
  📌 ${region} | Estado: ${estado}
  ${razones.join(' | ')}`);
        }
    }

    if (alertas.length === 0) {
        console.log('✅ Telegram: sin órdenes estancadas.');
        return;
    }

    const fecha = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const msg = `🚨 <b>DISMAC — Órdenes estancadas</b> (${fecha})

Se encontraron <b>${alertas.length}</b> orden(es) que requieren atención:

${alertas.join('\n\n')}`;

    sendTelegram(msg);
}
// ────────────────────────────────────────────────────────────────────────────

console.log("🔧 APP.JS CARGADO");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded DISPARADO");

    const viewDashboard = document.getElementById('view-dashboard');
    const viewRedTalleres = document.getElementById('view-red-talleres');
    const viewEstadosMenu = document.getElementById('view-estados-menu');
    const viewEstadosServicio = document.getElementById('view-estados-servicio');
    const viewDetails = document.getElementById('view-details');
    const viewTitle = document.getElementById('view-title');
    const viewContent = document.getElementById('view-content');

    // Cargar datos
    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

    // Verificar órdenes estancadas y notificar por Telegram
    chequearOrdenesEstancadas();

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
                (t.MARCA || "").toLowerCase().includes(query))
        );
        renderTalleres(currentRegionTalleres, filteredTalleres);
    });

    // Buscador Regional de Órdenes
    const estadosSearchInput = document.getElementById('estados-search-input');
    estadosSearchInput?.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const regionLower = currentRegionOrdenes.toLowerCase();
        filteredOrdenes = appOrdersData.filter(o =>
            (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(regionLower) &&
            ((o['Número de orden de trabajo'] || "").toLowerCase().includes(query) ||
                (o['Cuenta: Nombre de la cuenta'] || "").toLowerCase().includes(query) ||
                (o['Producto ST'] || "").toLowerCase().includes(query) ||
                (o['Referencia'] || "").toLowerCase().includes(query) ||
                (o['Nro de orden de trabajo (Marca)'] || "").toLowerCase().includes(query) ||
                (o['Nombre del Equipo'] || "").toLowerCase().includes(query) ||
                (o['Producto ST'] || "").toLowerCase().includes(query))
        );
        renderOrdenes(currentRegionOrdenes, filteredOrdenes);
    });

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
        console.log("← Volver a regiones");
        showView(viewRedTalleres);
    });

    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => {
        console.log("← Volver a menú estados");
        showView(viewEstadosMenu);
    });

    document.getElementById('dismac-logo-btn')?.addEventListener('click', () => {
        console.log("← Volver al dashboard (Logo)");
        showView(viewDashboard);
    });

    function handleNavigation(action) {
        console.log(`🧭 Action: ${action}`);

        switch (action) {
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
            case 'view-protocolo':
                showProtocol();
                break;
            case 'view-estados-tarija':
                showRegionOrdenes('Tarija');
                break;
            case 'view-estados-sucre':
                showRegionOrdenes('Sucre');
                break;
            case 'view-estados-municipios':
                showRegionOrdenes('Municipios');
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
                if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(mapUrl)) {
                    mapUrl = `https://www.google.com/maps?q=${mapUrl.replace(/\s+/g, '')}`;
                } else if (!mapUrl.startsWith('http')) {
                    mapUrl = 'https://' + mapUrl;
                }

                mapHtml = `
                    <a href="${mapUrl}" target="_blank" class="btn-action" style="background:#ffffff;color:#111;padding:15px;border-radius:12px;text-align:center;text-decoration:none;font-size:1rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;font-weight:700;margin-top:0.5rem;width:100%;box-sizing:border-box;border:1px solid #e2e8f0;box-shadow:0 4px 6px rgba(0,0,0,0.05);">
                        <div style="background:radial-gradient(circle at 30% 30%, #ff4b68, #E31837); width:32px; height:32px; border-radius:50% 50% 50% 0; transform:rotate(-45deg); display:flex; align-items:center; justify-content:center; box-shadow:2px 2px 5px rgba(0,0,0,0.2);">
                            <div style="width:10px; height:10px; background:white; border-radius:50%;"></div>
                        </div>
                        Abrir en Google Maps
                    </a>
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

    function showRegionOrdenes(region) {
        console.log(`\n📋 Mostrando órdenes de: ${region}`);
        currentRegionOrdenes = region;

        if (region === 'Municipios') {
            const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
            filteredOrdenes = appOrdersData.filter(o => {
                const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return municipios.some(m => terr.includes(m));
            });
        } else {
            const regionNormalized = region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            filteredOrdenes = appOrdersData.filter(o => {
                const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return terr.includes(regionNormalized);
            });
        }

        if (estadosSearchInput) estadosSearchInput.value = "";
        renderOrdenes(region, filteredOrdenes);
    }

    function renderOrdenes(region, ordenes) {
        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = `Órdenes - ${region}`;

        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;

        if (ordenes.length === 0) {
            contentEl.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron órdenes.</p>';
            showView(viewEstadosServicio);
            return;
        }

        const html = ordenes.map((o, idx) => {
            const workshopName = (o['¿Qué servicio técnico ?'] || "").trim();
            const workshop = appWorkshopData.find(w => w.TALLER && w.TALLER.toUpperCase() === workshopName.toUpperCase());

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

            return `
                <div class="accordion-item" style="margin-bottom:12px; border-radius:15px; border:1px solid #e2e8f0; border-left:4px solid #3b82f6; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div style="flex:1; padding-right:10px;">
                                <p style="margin:0 0 4px 0; font-size:0.75rem; font-weight:700; color:#94a3b8; text-transform:uppercase;">${o['Número de orden de trabajo'] || 'S/N'}</p>
                                <p style="margin:0 0 8px 0; font-weight:800; color:#111; font-size:1.05rem; line-height:1.2;">${o['Cuenta: Nombre de la cuenta'] || 'CLIENTE S/N'}</p>
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
                            <p style="margin:0;"><strong>Tiempo desde apertura (Días):</strong> ${o['Tiempo desde apertura (Días)'] || '—'}</p>
                            <p style="margin:0;"><strong>Nro de orden de trabajo (Marca):</strong> ${o['Nro de orden de trabajo (Marca)'] || '—'}</p>
                            <p style="margin:0;"><strong>Producto ST:</strong> ${o['Producto ST'] || '—'}</p>
                            <p style="margin:0;"><strong>Fecha de compra:</strong> ${o['Fecha de compra'] || '—'}</p>
                            <p style="margin:0;"><strong>Fecha de ingreso a la marca:</strong> ${o['Fecha de ingreso a la marca'] || '—'}</p>
                            <p style="margin:0;"><strong>Referencia:</strong> ${o['Referencia'] || '—'}</p>
                            <p style="margin:0;"><strong>Estado:</strong> ${o.Estado || '—'}</p>
                            ${workshopHtml}
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
            const [workshopData, globalData] = await Promise.all([
                fetchGoogleSheet(SHEETS_CONFIG.talleres.id, SHEETS_CONFIG.talleres.sheetName),
                fetchGoogleSheet(SHEETS_CONFIG.seguimiento.id, SHEETS_CONFIG.seguimiento.sheetName)
            ]);

            let currentCity = "";
            appWorkshopData = workshopData.map(row => {
                // Normalizar claves (ignorar mayúsculas y espacios molestos en las columnas de Google Sheets)
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

                // Búsqueda más robusta para contactos (cualquier columna que contenga contacto, tel o cel)
                let contacto = getVal(row, 'CONTACTO', 'Contacto', 'contacto', 'CONTACTOS', 'CELULAR', 'TELEFONO');
                if (!contacto) {
                    const rowKeys = Object.keys(row);
                    const contactKey = rowKeys.find(k => k.toUpperCase().includes('CONTACTO') || k.toUpperCase().includes('TEL') || k.toUpperCase().includes('CEL'));
                    if (contactKey && row[contactKey]) {
                        contacto = row[contactKey].toString().trim();
                    }
                }

                // Hardcode rescate para Electronica JKA Tarija
                if (taller && taller.toUpperCase().includes("ELECTRONICA DIGITAL JKA") && !contacto) {
                    contacto = "60263531 - 60264988";
                }

                const ubicacion = getVal(row, 'UBICACIÓN POR GPS', 'Ubicación', 'UBICACION', 'UBICACIÓN GPS');

                if (ciudad !== "") {
                    currentCity = ciudad;
                }

                // Solo incluimos si hay un nombre de taller
                if (taller !== "") {
                    return {
                        ...row,
                        CIUDAD: currentCity,
                        TALLER: taller,
                        MARCA: marca,
                        CONTACTO: contacto,
                        UBICACION: ubicacion
                    };
                }
                return null;
            }).filter(row => row !== null);

            appOrdersData = globalData;
            console.log('Datos procesados:', { talleres: appWorkshopData.length, ordenes: appOrdersData.length });
        } catch (error) {
            console.error('Error al cargar datos:', error);
            const statusEl = document.getElementById('sync-status');
            if (statusEl) statusEl.classList.remove('hidden');
        }
    }

    async function fetchGoogleSheet(id, sheet) {
        try {
            const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const text = await res.text();

            // Limpiar la respuesta de Google
            const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const json = JSON.parse(jsonStr);

            if (!json.table || !json.table.rows) return [];

            return json.table.rows.map(row => {
                const obj = {};
                json.table.cols.forEach((col, i) => {
                    if (!col.label) return;
                    const cell = row.c[i];
                    // Usar valor formateado (f) si existe, si no el valor crudo (v)
                    obj[col.label] = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== undefined && cell.v !== null ? cell.v : '')) : '';
                });
                return obj;
            });
        } catch (err) {
            console.error(`Error fetching sheet ${sheet}:`, err);
            throw err;
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