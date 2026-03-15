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

console.log("🔧 APP.JS CARGADO");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded DISPARADO");

    // Cargar datos
    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

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
             (o['Producto ST'] || "").toLowerCase().includes(query))
        );
        renderOrdenes(currentRegionOrdenes, filteredOrdenes);
    });

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
                    <div class="contact-group" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.5rem;">
                        <a href="tel:${cleanNum}" class="btn-action" style="background:#007AFF;color:white;padding:8px;border-radius:8px;text-align:center;text-decoration:none;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:5px;">
                            <i class="bi bi-telephone-fill"></i> Llamar
                        </a>
                        <a href="https://wa.me/591${cleanNum}" target="_blank" class="btn-action" style="background:#25D366;color:white;padding:8px;border-radius:8px;text-align:center;text-decoration:none;font-size:0.85rem;display:flex;align-items:center;justify-content:center;gap:5px;">
                            <i class="bi bi-whatsapp"></i> WhatsApp
                        </a>
                    </div>
                    <p style="font-size:0.75rem;color:#666;text-align:center;margin-top:-3px;margin-bottom:8px;">${num}</p>
                `;
            }).join('');

            return `
                <div class="workshop-card" style="margin-bottom:1rem; border-radius:15px;">
                    <div class="workshop-header" style="margin-bottom:10px;">
                        <h3 class="workshop-title" style="margin:0; font-size:1.1rem; color:#111;">${t.TALLER || 'Sin nombre'}</h3>
                    </div>
                    <div class="workshop-body">
                        <div class="info-row" style="margin-bottom:12px;">
                            <i class="bi bi-tag-fill" style="color: #E31837;"></i>
                            <span style="font-weight: 600; font-size:0.9rem;">${t.MARCA || 'Sin marca'}</span>
                        </div>
                        <div class="workshop-actions-container">
                            ${contactsHtml || '<p style="font-size:0.85rem;color:#999;text-align:center;">Sin teléfono disponible</p>'}
                        </div>
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
        const regionLower = region.toLowerCase();
        filteredOrdenes = appOrdersData.filter(o =>
            (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(regionLower)
        );
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
            if (workshop) {
                const numList = (workshop.CONTACTO || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
                const buttonsHtml = numList.map(num => {
                    const cleanNum = num.replace(/\D/g, '');
                    return `
                        <div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; margin-top:5px;">
                            <a href="tel:${cleanNum}" style="background:#007AFF; color:white; text-decoration:none; padding:5px; border-radius:5px; font-size:0.75rem; text-align:center;"><i class="bi bi-telephone"></i> ${num}</a>
                            <a href="https://wa.me/591${cleanNum}" target="_blank" style="background:#25D366; color:white; text-decoration:none; padding:5px; border-radius:5px; font-size:0.75rem; text-align:center;"><i class="bi bi-whatsapp"></i> WA</a>
                        </div>
                    `;
                }).join('');

                workshopHtml = `
                    <div style="margin-top:10px; padding:10px; background:#f0f7ff; border-radius:10px; border:1px solid #dbeafe;">
                        <p style="font-weight:700; font-size:0.85rem; margin-bottom:5px; color:#1e40af;"><i class="bi bi-tools"></i> Taller: ${workshop.TALLER}</p>
                        ${buttonsHtml}
                    </div>
                `;
            }

            return `
                <div class="accordion-item" style="margin-bottom:10px; border-radius:12px; border:1px solid #e2e8f0; background:white; overflow:hidden;">
                    <button class="accordion-header" style="width:100%; border:none; background:none; padding:15px; text-align:left; cursor:pointer;" onclick="this.parentElement.classList.toggle('active')">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <div style="flex:1;">
                                <p style="margin:0; font-weight:700; color:#111; font-size:0.95rem;">${o['Número de orden de trabajo'] || 'ODT S/N'}</p>
                                <p style="margin:0; font-size:0.8rem; color:#666;">${o['Cuenta: Nombre de la cuenta'] || 'Cliente S/N'}</p>
                            </div>
                            <div style="text-align:right; margin-right:10px;">
                                <span style="background:#e3f2fd; color:#1976d2; padding:3px 8px; border-radius:12px; font-size:0.7rem; font-weight:700;">${o.Estado || 'S/E'}</span>
                            </div>
                            <i class="bi bi-chevron-down acc-arrow" style="transition: transform 0.3s ease; color:#94a3b8;"></i>
                        </div>
                    </button>
                    <div class="accordion-content" style="padding:0 15px; max-height:0; overflow:hidden; transition: max-height 0.3s ease-out;">
                        <div style="padding:0 0 15px 0; border-top:1px solid #f1f5f9; margin-top:5px; font-size:0.85rem; color:#444;">
                            <p style="margin-top:10px;"><strong>Producto:</strong> ${o['Producto ST'] || '—'}</p>
                            <p><strong>Fecha:</strong> ${o['Fecha de creación'] || '—'}</p>
                            <p><strong>Síntoma:</strong> ${o['Síntoma de falla'] || '—'}</p>
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
        if (viewContent) {
            viewContent.innerHTML = `<p style="padding:1rem;">Protocolo de recepción aquí</p>`;
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
                // Normalizar claves y valores (algunos valores pueden venir como números)
                const getVal = (row, ...keys) => {
                    for (const key of keys) {
                        if (row[key] !== undefined && row[key] !== null) return row[key].toString().trim();
                    }
                    return "";
                };

                const ciudad = getVal(row, 'CIUDAD', 'Ciudad', 'ciudad');
                const taller = getVal(row, 'TALLER', 'Taller', 'taller');
                const marca = getVal(row, 'MARCA', 'Marca', 'marca');
                const contacto = getVal(row, 'CONTACTO', 'Contacto', 'contacto');

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
                        CONTACTO: contacto
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
});