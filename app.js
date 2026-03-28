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

const TELEGRAM_CONFIG = {
    token: '8769379678:AAFjYMA5UXyWQ0QTyUSHhBEXhl2FAxmomLA',
    chatId: '363865053'
};

function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function isRegionApp(territorioStr) {
    if (!territorioStr) return false;
    const t = territorioStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    
    const regiones = ['tarija', 'sucre', 'oruro', 'beni', 'potosi'];
    if (regiones.some(r => t.includes(r))) return true;

    const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
    if (municipios.some(m => t.includes(m))) return true;

    return false;
}

async function sendTelegram(message) {
    if (!TELEGRAM_CONFIG.token || TELEGRAM_CONFIG.token === 'PONER_TOKEN_DEL_BOT_AQUI') {
        console.warn('Telegram: token no configurado.');
        return;
    }
    try {
        const text = encodeURIComponent(message);
        const url = `https://api.telegram.org/bot${TELEGRAM_CONFIG.token}/sendMessage?chat_id=${TELEGRAM_CONFIG.chatId}&text=${text}&parse_mode=HTML`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            if (data.ok) {
                console.log('✅ Notificación Telegram enviada.');
            }
        }
    } catch (e) {
        console.error('Error Telegram:', e.message);
    }
}

function parseFecha(str) {
    if (!str) return null;
    const s = str.toString().trim();
    let m;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
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

function chequearOrdenesEstancadas() {
    const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
    const isExcluido = (o) => {
        const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return estados_excluidos.some(ex => e.includes(ex));
    };

    const alertas = [];

    for (const o of appOrdersData) {
        if (isExcluido(o)) continue;

        const territorio = o['Territorio de servicio: Nombre'] || "";
        if (!isRegionApp(territorio)) continue;

        const diasCreacion = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
        const diasMod = diasDesde(o['Fecha de la última modificación']);
        
        const cliente = escapeHTML(o['Cuenta: Nombre de la cuenta'] || 'S/N');
        const producto = escapeHTML(o['Producto ST'] || '');
        const region = escapeHTML(territorio);
        const estado = escapeHTML(o.Estado || 'S/E');
        const tipoServicio = escapeHTML(o['Tipo de Servicio'] || 'S/N');
        const razones = [];

        if (diasMod !== null && diasMod >= 4) razones.push(`🕒 ${diasMod}d sin cambios`);
        if (diasCreacion >= 8) razones.push(`📅 ${diasCreacion}d desde creación`);

        if (razones.length > 0) {
            alertas.push(`⚠️ <b>${cliente}</b>
  📦 ${producto}
  🛠️ Tipo: ${tipoServicio}
  📌 ${region} | Estado: ${estado}
  ${razones.join(' | ')}`);
        }
    }

    if (alertas.length === 0) {
        console.log('✅ Sin órdenes estancadas.');
        return;
    }

    const fecha = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const msg = `🚨 <b>DISMAC — Órdenes estancadas</b> (${fecha})

Se encontraron <b>${alertas.length}</b> orden(es) que requieren atención:

${alertas.join('\n\n')}

🔗 <b>Abrir App:</b> https://jangelbsc-design.github.io/app-servicio-tecnico/`;

    sendTelegram(msg);
}

async function fetchGoogleSheet(id, sheet) {
    try {
        const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const text = await res.text();

        const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const json = JSON.parse(jsonStr);

        if (!json.table || !json.table.rows) return [];

        return json.table.rows.map(row => {
            const obj = {};
            json.table.cols.forEach((col, i) => {
                if (!col.label) return;
                const cell = row.c[i];
                obj[col.label] = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== undefined && cell.v !== null ? cell.v : '')) : '';
            });
            return obj;
        });
    } catch (err) {
        console.error(`Error fetching sheet ${sheet}:`, err);
        throw err;
    }
}

async function loadAllData() {
    try {
        const [workshopData, globalData] = await Promise.all([
            fetchGoogleSheet(SHEETS_CONFIG.talleres.id, SHEETS_CONFIG.talleres.sheetName),
            fetchGoogleSheet(SHEETS_CONFIG.seguimiento.id, SHEETS_CONFIG.seguimiento.sheetName)
        ]);

        let currentCity = "";
        appWorkshopData = workshopData.map(row => {
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
        console.log('✅ Datos cargados:', { talleres: appWorkshopData.length, ordenes: appOrdersData.length });
    } catch (error) {
        console.error('❌ Error al cargar datos:', error);
        const statusEl = document.getElementById('sync-status');
        if (statusEl) statusEl.classList.remove('hidden');
    }
}

console.log("🔧 APP.JS INICIANDO");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOM CARGADO");

    const viewDashboard = document.getElementById('view-dashboard');
    const viewRedTalleres = document.getElementById('view-red-talleres');
    const viewEstadosMenu = document.getElementById('view-estados-menu');
    const viewEstadosServicio = document.getElementById('view-estados-servicio');
    const viewDetails = document.getElementById('view-details');

    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

    chequearOrdenesEstancadas();

    // Llenar protocolo en FAQ
    fillProtocoloInFAQ();

    // Manejar acordeones de FAQ
    setupFAQAccordions();

    // Buscador global del dashboard
    setupDashboardSearch();

    let currentRegionTalleres = "";
    let filteredTalleres = [];
    let currentRegionOrdenes = "";
    let filteredOrdenes = [];

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
                (o['Tipo de Servicio'] || "").toLowerCase().includes(query))
        );
        renderOrdenes(currentRegionOrdenes, filteredOrdenes);
    });

    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            handleNavigation(action);
        });
    });

    document.getElementById('btn-back-red-talleres')?.addEventListener('click', () => {
        showView(viewDashboard);
    });

    document.getElementById('btn-back-estados-menu')?.addEventListener('click', () => {
        showView(viewDashboard);
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
        showView(viewRedTalleres);
    });

    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => {
        showView(viewEstadosMenu);
    });

    document.getElementById('dismac-logo-btn')?.addEventListener('click', () => {
        showView(viewDashboard);
    });

    function handleNavigation(action) {
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
        currentRegionTalleres = region;
        const regionUpper = region.toUpperCase();
        filteredTalleres = appWorkshopData.filter(t =>
            (t.CIUDAD || "").toUpperCase() === regionUpper
        );
        if (workshopSearchInput) workshopSearchInput.value = "";
        renderTalleres(region, filteredTalleres);
    }

    function renderTalleres(region, talleres) {
        const titleEl = document.getElementById('view-title');
        if (titleEl) titleEl.textContent = `Talleres en ${region}`;

        const contentEl = document.getElementById('view-content');
        if (!contentEl) return;

        contentEl.innerHTML = '';

        if (talleres.length === 0) {
            contentEl.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron talleres.</p>';
            showView(viewDetails);
            return;
        }

        const html = talleres.map(t => {
            const contactosText = t.CONTACTO || "";
            const numList = contactosText.split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);

            const contactsHtml = numList.map(num => {
                const cleanNum = num.replace(/\D/g, '');
                return `
                    <div class="contact-group">
                        <a href="tel:${cleanNum}" class="btn-action action-call">
                            <div class="action-icon"><i class="bi bi-telephone-fill"></i></div>
                            <span>Llamar</span>
                        </a>
                        <a href="https://wa.me/591${cleanNum}" target="_blank" class="btn-action action-wa">
                            <div class="action-icon"><i class="bi bi-whatsapp"></i></div>
                            <span>WhatsApp</span>
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
                    <a href="${mapUrl}" target="_blank" class="btn-action action-map" style="margin-top: 0.75rem;">
                        <div class="action-icon"><i class="bi bi-geo-alt-fill"></i></div>
                        <span>Google Maps</span>
                    </a>
                `;
            }

            return `
                <div class="workshop-card">
                    <div class="workshop-header">
                        <h3 class="workshop-title">${t.TALLER || 'Sin nombre'}</h3>
                    </div>
                    <div class="workshop-body">
                        <div class="info-row">
                            <i class="bi bi-tag-fill"></i>
                            <span>${t.MARCA || 'Sin marca'}</span>
                        </div>
                        <div class="workshop-actions">
                            ${contactsHtml || '<p style="font-size:0.85rem;color:#999;text-align:center;">Sin teléfono disponible</p>'}
                            ${mapHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        contentEl.innerHTML = html;
        showView(viewDetails);
    }

    function isOrderInRegion(o, region) {
        if (!o || !region) return false;
        const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (region === 'Municipios') {
            const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
            return municipios.some(m => terr.includes(m));
        }
        const regionNormalized = region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return terr.includes(regionNormalized);
    }

    function showRegionOrdenes(region) {
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

        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const ordenesFiltradas = ordenes.filter(o => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return !estados_excluidos.some(ex => e.includes(ex));
        });

        if (ordenesFiltradas.length === 0) {
            contentEl.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron órdenes activas.</p>';
            showView(viewEstadosServicio);
            return;
        }

        const html = ordenesFiltradas.map((o) => {
            const workshopName = (o['¿Qué servicio técnico ?'] || "").trim();
            const workshop = appWorkshopData.find(w => w.TALLER && w.TALLER.toUpperCase() === workshopName.toUpperCase());

            let workshopHtml = "";

            const nombreCliente = o['Cuenta: Nombre de la cuenta'] || 'N/A';
            const ordenDismac = o['Referencia'] || o['Número de orden de trabajo'] || 'N/A';
            const activo = o['Producto ST'] || 'N/A';
            const nroOrdenMarca = o['Nro de orden de trabajo (Marca)'] || 'S/O';
            const diasST = o['Tiempo desde apertura (Días)'] || '0';

            if (workshop) {
                const textMsg = `Hola, servicio técnico ${workshop.TALLER}, por favor ayúdenos con información sobre el estado de las siguientes órdenes:\nOrden DISMAC: ${ordenDismac}\nCliente: ${nombreCliente}\nActivo: ${activo}`;
                const encodedMsg = encodeURIComponent(textMsg);

                const numList = (workshop.CONTACTO || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
                const buttonsHtml = numList.map(num => {
                    const cleanNum = num.replace(/\D/g, '');
                    return `
                        <div class="contact-group">
                            <a href="tel:${cleanNum}" class="btn-action action-call">
                                <div class="action-icon"><i class="bi bi-telephone-fill"></i></div>
                                <span>Llamar</span>
                            </a>
                            <a href="https://wa.me/?text=${encodedMsg}" target="_blank" class="btn-action action-wa">
                                <div class="action-icon"><i class="bi bi-whatsapp"></i></div>
                                <span>Consulta</span>
                            </a>
                        </div>
                    `;
                }).join('');

                workshopHtml = `
                    <div style="margin-top:1rem;padding:1rem;background:#f8f9fa;border-radius:10px;border:1px solid #e9ecef;">
                        <p style="font-weight:700;font-size:0.9rem;margin-bottom:0.75rem;color:#333;"><i class="bi bi-tools" style="margin-right:5px;"></i>Taller: ${workshop.TALLER}</p>
                        ${buttonsHtml}
                    </div>
                `;
            }

            return `
                <div class="accordion-item">
                    <button class="accordion-header" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
                            <div style="font-weight:700; color:#111; font-size:0.95rem;">${nombreCliente}</div>
                            <div style="display:flex; gap:1rem; font-size:0.8rem; color:#666;">
                                <span><i class="bi bi-pin-fill" style="color:#E31837; margin-right:3px;"></i>Ref: ${ordenDismac}</span>
                                <span><i class="bi bi-clock-fill" style="color:#F59E0B; margin-right:3px;"></i>${diasST}d</span>
                            </div>
                        </div>
                        <i class="bi bi-chevron-right acc-arrow"></i>
                    </button>
                    <div class="accordion-content">
                        <div style="display:grid; grid-template-columns:1fr; gap:0.75rem; font-size:0.85rem;">
                            <div><strong>Referencia:</strong> ${o['Referencia'] || '—'}</div>
                            <div><strong>Orden de trabajo:</strong> ${o['Número de orden de trabajo'] || '—'}</div>
                            <div><strong>Orden (Marca):</strong> ${nroOrdenMarca}</div>
                            <div><strong>Tipo de Servicio:</strong> ${o['Tipo de Servicio'] || '—'}</div>
                            <div><strong>Producto:</strong> ${activo}</div>
                            <div><strong>Territorio:</strong> ${o['Territorio de servicio: Nombre'] || '—'}</div>
                            <div><strong>Estado:</strong> ${o.Estado || '—'}</div>
                            <div><strong>Días abierto:</strong> ${diasST}</div>
                            <div><strong>Equipo:</strong> ${o['Nombre del Equipo'] || '—'}</div>
                            <div><strong>Fecha Compra:</strong> ${o['Fecha de compra'] || '—'}</div>
                            <div><strong>Fecha Ingreso ST:</strong> ${o['Fecha de ingreso a la marca'] || '—'}</div>
                            <div><strong>Última modificación:</strong> ${o['Fecha de la última modificación'] || '—'}</div>
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
        const titleEl = document.getElementById('view-title');
        if (titleEl) titleEl.textContent = 'Protocolo de recepción';
        
        const contentEl = document.getElementById('view-content');
        if (!contentEl) return;

        const pasos = [
            {
                num: 1,
                titulo: 'Recepción y Validación Inicial',
                puntos: [
                    'Bienvenida y reporte de falla',
                    'Verificar vigencia de garantía en BLEND',
                    'Revisión de daños físicos',
                    'Prueba del equipo con cliente'
                ]
            },
            {
                num: 2,
                titulo: 'Documentación y Registro',
                puntos: [
                    'Crear caso en BLEND',
                    'Generar número Tidy',
                    'Registrar accesorios y estado'
                ]
            },
            {
                num: 3,
                titulo: 'Comunicación',
                puntos: [
                    'Enviar al grupo WhatsApp',
                    'Incluir: Tidy, cliente, producto',
                    'Adjuntar fotos'
                ]
            },
            {
                num: 4,
                titulo: 'Logística',
                puntos: [
                    'Solicitar Nota de Ingreso',
                    'Enviar nota con Tidy',
                    'Seguimiento Regional'
                ]
            },
            {
                num: 5,
                titulo: 'Cierre y Entrega',
                puntos: [
                    'Avisar cuando esté listo',
                    'Informar reparación realizada',
                    'Coordinar entrega con cliente'
                ]
            }
        ];

        const html = pasos.map(paso => `
            <div class="accordion-item">
                <button class="accordion-header" onclick="this.parentElement.classList.toggle('active')">
                    <div style="display:flex; gap:1rem; align-items:center; width:100%;">
                        <div class="acc-icon-wrapper">${paso.num}</div>
                        <span class="acc-title">${paso.titulo}</span>
                    </div>
                    <i class="bi bi-chevron-right acc-arrow"></i>
                </button>
                <div class="accordion-content">
                    <ul style="margin:0; padding-left:1.5rem; color:#555;">
                        ${paso.puntos.map(p => `<li style="margin-bottom:0.5rem;">${p}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('');

        contentEl.innerHTML = html;
        showView(viewDetails);
    }

    function showView(view) {
        document.querySelectorAll('.main-content').forEach(v => v.classList.add('hidden'));
        view?.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// ======= NUEVAS FUNCIONES PARA DASHBOARD MEJORADO =======

function fillProtocoloInFAQ() {
    const pasos = [
        {
            num: 1,
            titulo: 'Recepción y Validación Inicial',
            puntos: ['Bienvenida y reporte de falla', 'Verificar vigencia en BLEND', 'Revisión de daños físicos', 'Prueba del equipo']
        },
        {
            num: 2,
            titulo: 'Documentación y Registro',
            puntos: ['Crear caso en BLEND', 'Generar número Tidy', 'Registrar accesorios']
        },
        {
            num: 3,
            titulo: 'Comunicación Interna',
            puntos: ['Enviar al grupo WhatsApp', 'Incluir: Tidy, cliente, producto', 'Adjuntar fotos']
        },
        {
            num: 4,
            titulo: 'Logística y Seguimiento',
            puntos: ['Solicitar Nota de Ingreso', 'Enviar nota con Tidy', 'Seguimiento Regional']
        },
        {
            num: 5,
            titulo: 'Cierre y Entrega',
            puntos: ['Avisar cuando esté listo', 'Informar reparación', 'Coordinar entrega']
        }
    ];

    const html = pasos.map(paso => `
        <div class="accordion-item" style="margin-bottom: 0.75rem;">
            <button class="accordion-header" onclick="this.parentElement.classList.toggle('active')" style="padding: 0.75rem;">
                <div style="display:flex; gap:0.75rem; align-items:center; width:100%; font-size:0.9rem;">
                    <div style="width:28px; height:28px; border-radius:50%; background:#FDE8EA; color:#E31837; display:flex; align-items:center; justify-content:center; font-weight:700; flex-shrink:0;">${paso.num}</div>
                    <span style="font-weight:600; color:#111;">${paso.titulo}</span>
                </div>
                <i class="bi bi-chevron-right acc-arrow" style="color:#cbd5e1;"></i>
            </button>
            <div class="accordion-content">
                <ul style="margin:0; padding-left:1.5rem; color:#555; font-size:0.85rem;">
                    ${paso.puntos.map(p => `<li style="margin-bottom:0.4rem;">${p}</li>`).join('')}
                </ul>
            </div>
        </div>
    `).join('');

    const faqProtocoCol = document.getElementById('faq-protocolo-content');
    if (faqProtocoCol) {
        faqProtocoCol.innerHTML = html;
    }
}

function setupFAQAccordions() {
    // Los acordeones ya están configurados con onclick en el HTML
    // Esta función es un placeholder por si se necesita lógica adicional
    console.log('✅ FAQ Acordeones configurados');
}

function setupDashboardSearch() {
    const searchInput = document.getElementById('dashboard-search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) return;

        // Buscar en talleres
        const talleresCoinc = appWorkshopData.filter(t =>
            (t.TALLER || "").toLowerCase().includes(query) ||
            (t.MARCA || "").toLowerCase().includes(query) ||
            (t.CIUDAD || "").toLowerCase().includes(query)
        );

        // Si hay coincidencias en talleres, ir a talleres
        if (talleresCoinc.length > 0) {
            document.getElementById('view-red-talleres').click?.();
            console.log(`🔍 Encontrados ${talleresCoinc.length} talleres`);
        }
    });
}

console.log("✅ APP.JS LISTO");

    let currentRegionTalleres = "";
    let filteredTalleres = [];
    let currentRegionOrdenes = "";
    let filteredOrdenes = [];

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
                (o['Tipo de Servicio'] || "").toLowerCase().includes(query))
        );
        renderOrdenes(currentRegionOrdenes, filteredOrdenes);
    });

    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            handleNavigation(action);
        });
    });

    document.getElementById('btn-back-red-talleres')?.addEventListener('click', () => {
        showView(viewDashboard);
    });

    document.getElementById('btn-back-estados-menu')?.addEventListener('click', () => {
        showView(viewDashboard);
    });

    document.getElementById('btn-back')?.addEventListener('click', () => {
        showView(viewRedTalleres);
    });

    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => {
        showView(viewEstadosMenu);
    });

    document.getElementById('dismac-logo-btn')?.addEventListener('click', () => {
        showView(viewDashboard);
    });

    function handleNavigation(action) {
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
        currentRegionTalleres = region;
        const regionUpper = region.toUpperCase();
        filteredTalleres = appWorkshopData.filter(t =>
            (t.CIUDAD || "").toUpperCase() === regionUpper
        );
        if (workshopSearchInput) workshopSearchInput.value = "";
        renderTalleres(region, filteredTalleres);
    }

    function renderTalleres(region, talleres) {
        const titleEl = document.getElementById('view-title');
        if (titleEl) titleEl.textContent = `Talleres en ${region}`;

        const contentEl = document.getElementById('view-content');
        if (!contentEl) return;

        contentEl.innerHTML = '';

        if (talleres.length === 0) {
            contentEl.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron talleres.</p>';
            showView(viewDetails);
            return;
        }

        const html = talleres.map(t => {
            const contactosText = t.CONTACTO || "";
            const numList = contactosText.split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);

            const contactsHtml = numList.map(num => {
                const cleanNum = num.replace(/\D/g, '');
                return `
                    <div class="contact-group">
                        <a href="tel:${cleanNum}" class="btn-action action-call">
                            <div class="action-icon"><i class="bi bi-telephone-fill"></i></div>
                            <span>Llamar</span>
                        </a>
                        <a href="https://wa.me/591${cleanNum}" target="_blank" class="btn-action action-wa">
                            <div class="action-icon"><i class="bi bi-whatsapp"></i></div>
                            <span>WhatsApp</span>
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
                    <a href="${mapUrl}" target="_blank" class="btn-action action-map" style="margin-top: 0.75rem;">
                        <div class="action-icon"><i class="bi bi-geo-alt-fill"></i></div>
                        <span>Google Maps</span>
                    </a>
                `;
            }

            return `
                <div class="workshop-card">
                    <div class="workshop-header">
                        <h3 class="workshop-title">${t.TALLER || 'Sin nombre'}</h3>
                    </div>
                    <div class="workshop-body">
                        <div class="info-row">
                            <i class="bi bi-tag-fill"></i>
                            <span>${t.MARCA || 'Sin marca'}</span>
                        </div>
                        <div class="workshop-actions">
                            ${contactsHtml || '<p style="font-size:0.85rem;color:#999;text-align:center;">Sin teléfono disponible</p>'}
                            ${mapHtml}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        contentEl.innerHTML = html;
        showView(viewDetails);
    }

    function isOrderInRegion(o, region) {
        if (!o || !region) return false;
        const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (region === 'Municipios') {
            const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
            return municipios.some(m => terr.includes(m));
        }
        const regionNormalized = region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return terr.includes(regionNormalized);
    }

    function showRegionOrdenes(region) {
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

        const estados_excluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
        const ordenesFiltradas = ordenes.filter(o => {
            const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return !estados_excluidos.some(ex => e.includes(ex));
        });

        if (ordenesFiltradas.length === 0) {
            contentEl.innerHTML = '<p style="text-align:center;padding:2rem;">No se encontraron órdenes activas.</p>';
            showView(viewEstadosServicio);
            return;
        }

        const html = ordenesFiltradas.map((o) => {
            const workshopName = (o['¿Qué servicio técnico ?'] || "").trim();
            const workshop = appWorkshopData.find(w => w.TALLER && w.TALLER.toUpperCase() === workshopName.toUpperCase());

            let workshopHtml = "";

            const nombreCliente = o['Cuenta: Nombre de la cuenta'] || 'N/A';
            const ordenDismac = o['Referencia'] || o['Número de orden de trabajo'] || 'N/A';
            const activo = o['Producto ST'] || 'N/A';
            const nroOrdenMarca = o['Nro de orden de trabajo (Marca)'] || 'S/O';
            const diasST = o['Tiempo desde apertura (Días)'] || '0';

            if (workshop) {
                const textMsg = `Hola, servicio técnico ${workshop.TALLER}, por favor ayúdenos con información sobre el estado de las siguientes órdenes:\nOrden DISMAC: ${ordenDismac}\nCliente: ${nombreCliente}\nActivo: ${activo}`;
                const encodedMsg = encodeURIComponent(textMsg);

                const numList = (workshop.CONTACTO || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
                const buttonsHtml = numList.map(num => {
                    const cleanNum = num.replace(/\D/g, '');
                    return `
                        <div class="contact-group">
                            <a href="tel:${cleanNum}" class="btn-action action-call">
                                <div class="action-icon"><i class="bi bi-telephone-fill"></i></div>
                                <span>Llamar</span>
                            </a>
                            <a href="https://wa.me/?text=${encodedMsg}" target="_blank" class="btn-action action-wa">
                                <div class="action-icon"><i class="bi bi-whatsapp"></i></div>
                                <span>Consulta</span>
                            </a>
                        </div>
                    `;
                }).join('');

                workshopHtml = `
                    <div style="margin-top:1rem;padding:1rem;background:#f8f9fa;border-radius:10px;border:1px solid #e9ecef;">
                        <p style="font-weight:700;font-size:0.9rem;margin-bottom:0.75rem;color:#333;"><i class="bi bi-tools" style="margin-right:5px;"></i>Taller: ${workshop.TALLER}</p>
                        ${buttonsHtml}
                    </div>
                `;
            }

            return `
                <div class="accordion-item">
                    <button class="accordion-header" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; flex-direction:column; gap:0.5rem; width:100%;">
                            <div style="font-weight:700; color:#111; font-size:0.95rem;">${nombreCliente}</div>
                            <div style="display:flex; gap:1rem; font-size:0.8rem; color:#666;">
                                <span><i class="bi bi-pin-fill" style="color:#E31837; margin-right:3px;"></i>Ref: ${ordenDismac}</span>
                                <span><i class="bi bi-clock-fill" style="color:#F59E0B; margin-right:3px;"></i>${diasST}d</span>
                            </div>
                        </div>
                        <i class="bi bi-chevron-down acc-arrow"></i>
                    </button>
                    <div class="accordion-content">
                        <div style="display:grid; grid-template-columns:1fr; gap:0.75rem; font-size:0.85rem;">
                            <div><strong>Referencia:</strong> ${o['Referencia'] || '—'}</div>
                            <div><strong>Orden de trabajo:</strong> ${o['Número de orden de trabajo'] || '—'}</div>
                            <div><strong>Orden (Marca):</strong> ${nroOrdenMarca}</div>
                            <div><strong>Tipo de Servicio:</strong> ${o['Tipo de Servicio'] || '—'}</div>
                            <div><strong>Producto:</strong> ${activo}</div>
                            <div><strong>Territorio:</strong> ${o['Territorio de servicio: Nombre'] || '—'}</div>
                            <div><strong>Estado:</strong> ${o.Estado || '—'}</div>
                            <div><strong>Días abierto:</strong> ${diasST}</div>
                            <div><strong>Equipo:</strong> ${o['Nombre del Equipo'] || '—'}</div>
                            <div><strong>Fecha Compra:</strong> ${o['Fecha de compra'] || '—'}</div>
                            <div><strong>Fecha Ingreso ST:</strong> ${o['Fecha de ingreso a la marca'] || '—'}</div>
                            <div><strong>Última modificación:</strong> ${o['Fecha de la última modificación'] || '—'}</div>
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
        const titleEl = document.getElementById('view-title');
        if (titleEl) titleEl.textContent = 'Protocolo de recepción';
        
        const contentEl = document.getElementById('view-content');
        if (!contentEl) return;

        const pasos = [
            {
                num: 1,
                titulo: 'Recepción y Validación Inicial',
                puntos: [
                    'Bienvenida y reporte de falla',
                    'Verificar vigencia de garantía en BLEND',
                    'Revisión de daños físicos',
                    'Prueba del equipo con cliente'
                ]
            },
            {
                num: 2,
                titulo: 'Documentación y Registro',
                puntos: [
                    'Crear caso en BLEND',
                    'Generar número Tidy',
                    'Registrar accesorios y estado'
                ]
            },
            {
                num: 3,
                titulo: 'Comunicación',
                puntos: [
                    'Enviar al grupo WhatsApp',
                    'Incluir: Tidy, cliente, producto',
                    'Adjuntar fotos'
                ]
            },
            {
                num: 4,
                titulo: 'Logística',
                puntos: [
                    'Solicitar Nota de Ingreso',
                    'Enviar nota con Tidy',
                    'Seguimiento Regional'
                ]
            },
            {
                num: 5,
                titulo: 'Cierre y Entrega',
                puntos: [
                    'Avisar cuando esté listo',
                    'Informar reparación realizada',
                    'Coordinar entrega con cliente'
                ]
            }
        ];

        const html = pasos.map(paso => `
            <div class="accordion-item">
                <button class="accordion-header" onclick="this.parentElement.classList.toggle('active')">
                    <div style="display:flex; gap:1rem; align-items:center; width:100%;">
                        <div class="acc-icon-wrapper">${paso.num}</div>
                        <span class="acc-title">${paso.titulo}</span>
                    </div>
                    <i class="bi bi-chevron-down acc-arrow"></i>
                </button>
                <div class="accordion-content">
                    <ul style="margin:0; padding-left:1.5rem; color:#555;">
                        ${paso.puntos.map(p => `<li style="margin-bottom:0.5rem;">${p}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `).join('');

        contentEl.innerHTML = html;
        showView(viewDetails);
    }

    function showView(view) {
        document.querySelectorAll('.main-content').forEach(v => v.classList.add('hidden'));
        view?.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

console.log("✅ APP.JS LISTO");
