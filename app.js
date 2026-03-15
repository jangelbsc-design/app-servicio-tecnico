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
        console.log(`   Total disponibles: ${appWorkshopData.length}`);

        const regionUpper = region.toUpperCase();
        const talleres = appWorkshopData.filter(t =>
            (t.CIUDAD || "").toUpperCase() === regionUpper
        );

        console.log(`   Encontrados: ${talleres.length}`);

        renderTalleres(region, talleres);
    }

    function renderTalleres(region, talleres) {
        if (viewTitle) viewTitle.textContent = `Talleres en ${region}`;
        if (viewContent) viewContent.innerHTML = '';

        if (talleres.length === 0) {
            if (viewContent) {
                viewContent.innerHTML = '<p style="text-align:center;padding:2rem;">No hay talleres en esta región.</p>';
            }
            showView(viewDetails);
            return;
        }

        const html = talleres.map(t => `
            <div class="workshop-card">
                <div class="workshop-header">
                    <h3 class="workshop-title">${t.TALLER || 'Sin nombre'}</h3>
                </div>
                <div class="workshop-body">
                    <div class="info-row">
                        <i class="bi bi-tag-fill" style="color: #2563eb;"></i>
                        <span style="font-weight: 600;">${t.MARCA || 'Sin marca'}</span>
                    </div>
                </div>
                <div class="workshop-actions" style="display:flex;flex-direction:column;gap:0.5rem;margin-top:1rem;">
                    <a href="tel:${(t.CONTACTO || '').replace(/\D/g, '')}" class="btn-action" style="background:#007AFF;color:white;padding:10px;border-radius:8px;text-align:center;text-decoration:none;">
                        <i class="bi bi-telephone-fill"></i> ${t.CONTACTO || 'Sin teléfono'}
                    </a>
                </div>
            </div>
        `).join('');

        if (viewContent) viewContent.innerHTML = html;
        showView(viewDetails);
    }

    function showRegionOrdenes(region) {
        console.log(`\n📋 Mostrando órdenes de: ${region}`);

        const regionLower = region.toLowerCase();
        const ordenes = appOrdersData.filter(o =>
            (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(regionLower)
        );

        console.log(`   Encontradas: ${ordenes.length}`);

        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = `Órdenes - ${region}`;

        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;

        contentEl.innerHTML = ordenes.length === 0
            ? '<p style="text-align:center;padding:2rem;">No hay órdenes.</p>'
            : ordenes.map(o => `
                <div class="workshop-card" style="border-left:4px solid #3b82f6;margin-bottom:0.75rem;">
                    <p><strong>ODT:</strong> ${o['Número de orden de trabajo'] || '—'}</p>
                    <p><strong>Cliente:</strong> ${o['Cuenta: Nombre de la cuenta'] || '—'}</p>
                    <p><strong>Producto:</strong> ${o['Producto ST'] || '—'}</p>
                    <p><strong>Estado:</strong> ${o.Estado || '—'}</p>
                </div>
            `).join('');

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