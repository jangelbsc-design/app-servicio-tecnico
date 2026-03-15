let appWorkshopData = [];
let appOrdersData = [];
let ordersLoaded = false;

console.log("🔧 APP.JS CARGADO - " + new Date().toLocaleTimeString());

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded DISPARADO - " + new Date().toLocaleTimeString());

    try {
        console.log("🔍 Buscando elementos del DOM...");

        const viewDashboard = document.getElementById('view-dashboard');
        console.log("  view-dashboard:", viewDashboard ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const viewRedTalleres = document.getElementById('view-red-talleres');
        console.log("  view-red-talleres:", viewRedTalleres ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const viewEstadosMenu = document.getElementById('view-estados-menu');
        console.log("  view-estados-menu:", viewEstadosMenu ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const viewEstadosServicio = document.getElementById('view-estados-servicio');
        console.log("  view-estados-servicio:", viewEstadosServicio ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const viewDetails = document.getElementById('view-details');
        console.log("  view-details:", viewDetails ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const viewTitle = document.getElementById('view-title');
        console.log("  view-title:", viewTitle ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const viewContent = document.getElementById('view-content');
        console.log("  view-content:", viewContent ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const actionButtons = document.querySelectorAll('.dash-card');
        console.log("  dash-card buttons:", actionButtons.length, "encontrados");

        const searchToggle = document.getElementById('btn-search-toggle');
        console.log("  btn-search-toggle:", searchToggle ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const searchContainer = document.getElementById('search-container');
        console.log("  search-container:", searchContainer ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        const searchInput = document.getElementById('search-input');
        console.log("  search-input:", searchInput ? "✅ ENCONTRADO" : "❌ NO ENCONTRADO");

        let currentView = 'dashboard';
        let selectedRegion = null;

        // Cargar datos
        console.log("\n📥 INICIANDO CARGA DE DATOS...");
        await loadAllData();
        console.log("\n✅ DATOS CARGADOS");

        // Event Listeners
        if (actionButtons.length > 0) {
            actionButtons.forEach((button, idx) => {
                button.addEventListener('click', () => {
                    const action = button.getAttribute('data-action');
                    console.log(`🔘 Click en botón ${idx}: ${action}`);
                    handleNavigation(action);
                });
            });
            console.log("✅ Event listeners de botones agregados");
        } else {
            console.warn("⚠️ No hay botones .dash-card encontrados");
        }

        function handleNavigation(action) {
            console.log("🧭 handleNavigation:", action);
            switch (action) {
                case 'view-santacruz':
                    console.log("Abriendo Santa Cruz con", appWorkshopData.length, "talleres totales");
                    openRegionView('Santa Cruz');
                    break;
                case 'view-tarija':
                    openRegionView('Tarija');
                    break;
                case 'view-sucre':
                    openRegionView('Sucre');
                    break;
            }
        }

        function openRegionView(regionStr) {
            console.log(`\n🔍 BUSCANDO TALLERES DE: ${regionStr}`);
            console.log(`  Total de talleres en memoria: ${appWorkshopData.length}`);

            const regionUpper = regionStr.toUpperCase().trim();
            console.log(`  Buscando región (uppercase): "${regionUpper}"`);

            // Mostrar primeros 3 talleres para debug
            if (appWorkshopData.length > 0) {
                console.log("  Primeros 3 talleres en memoria:");
                appWorkshopData.slice(0, 3).forEach((t, i) => {
                    console.log(`    ${i}: CIUDAD="${t.CIUDAD}", TALLER="${t.TALLER}"`);
                });
            }

            const results = appWorkshopData.filter(item => {
                const itemRegion = (item.CIUDAD || "").toUpperCase().trim();
                return itemRegion === regionUpper;
            });

            console.log(`  ✅ Encontrados: ${results.length} talleres`);
            renderList(`Talleres en ${regionStr}`, results);
        }

        function renderList(title, dataArray) {
            console.log(`📋 RENDERIZANDO: "${title}" con ${dataArray.length} elementos`);

            if (viewTitle) viewTitle.textContent = title;
            if (viewContent) viewContent.innerHTML = '';

            if (dataArray.length === 0) {
                if (viewContent) {
                    viewContent.innerHTML = `
                        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
                            <i class="bi bi-inbox" style="font-size: 2.5rem;"></i>
                            <p style="margin-top: 1rem;">No se encontraron resultados.</p>
                        </div>
                    `;
                }
                showView(viewDetails);
                return;
            }

            const listContainer = document.createElement('div');
            listContainer.style.display = 'flex';
            listContainer.style.flexDirection = 'column';
            listContainer.style.gap = '1rem';

            dataArray.forEach(taller => {
                const el = document.createElement('div');
                el.className = 'workshop-card';

                const tallerName = taller.TALLER || "Sin nombre";
                const marca = taller.MARCA || "Sin marca";
                const telefono = taller.CONTACTO || "Sin teléfono";

                el.innerHTML = `
                    <div class="workshop-header">
                        <h3 class="workshop-title">${tallerName}</h3>
                    </div>
                    <div class="workshop-body">
                        <div class="info-row">
                            <span style="font-weight: 600; color: #475569;">📱 ${marca}</span>
                        </div>
                        <div class="info-row">
                            <span style="font-weight: 600; color: #475569;">📞 ${telefono}</span>
                        </div>
                    </div>
                `;
                listContainer.appendChild(el);
            });

            if (viewContent) viewContent.appendChild(listContainer);
            showView(viewDetails);
        }

        function showView(viewToShow) {
            if (viewDashboard) viewDashboard.classList.add('hidden');
            if (viewRedTalleres) viewRedTalleres.classList.add('hidden');
            if (viewEstadosMenu) viewEstadosMenu.classList.add('hidden');
            if (viewEstadosServicio) viewEstadosServicio.classList.add('hidden');
            if (viewDetails) viewDetails.classList.add('hidden');
            if (viewToShow) viewToShow.classList.remove('hidden');
            console.log("  Vista mostrada");
        }

        async function loadAllData() {
            console.log("  Cargando TALLERES...");
            try {
                const talleresData = await fetchGoogleSheetGVIZ(
                    '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
                    'RED%20DE%20TALLERES'
                );
                appWorkshopData = talleresData;
                console.log(`  ✅ ${appWorkshopData.length} talleres cargados`);
            } catch (err) {
                console.error("  ❌ Error cargando talleres:", err);
            }

            console.log("  Cargando ÓRDENES...");
            try {
                const ordenesData = await fetchGoogleSheetGVIZ(
                    '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
                    'REPORTE%20GLOBAL'
                );
                appOrdersData = ordenesData;
                ordersLoaded = true;
                console.log(`  ✅ ${appOrdersData.length} órdenes cargadas`);
            } catch (err) {
                console.error("  ❌ Error cargando órdenes:", err);
            }
        }

        async function fetchGoogleSheetGVIZ(sheetId, sheetName) {
            const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${sheetName}`;

            console.log(`    📡 Fetching: ${sheetName}`);
            console.log(`    URL: ${url}`);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const text = await response.text();
            console.log(`    Respuesta recibida: ${text.length} caracteres`);

            const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
            const data = JSON.parse(jsonString);

            const cols = data.table.cols;
            const rows = data.table.rows;

            console.log(`    Columnas: ${cols.map(c => c.label).join(', ')}`);
            console.log(`    Filas totales: ${rows.length}`);

            const result = [];
            rows.forEach(row => {
                const obj = {};
                cols.forEach((col, idx) => {
                    obj[col.label] = row.c[idx]?.v || '';
                });
                result.push(obj);
            });

            return result;
        }

    } catch (err) {
        console.error("❌ ERROR CRÍTICO:", err);
        console.error(err.stack);
    }
});

console.log("🔧 Script cargado completamente");