let appWorkshopData = [];
let appOrdersData = [];

console.log("🔧 APP.JS CARGADO");

document.addEventListener('DOMContentLoaded', async () => {
    console.log("✅ DOMContentLoaded");

    const viewDashboard = document.getElementById('view-dashboard');
    const viewRedTalleres = document.getElementById('view-red-talleres');
    const viewEstadosMenu = document.getElementById('view-estados-menu');
    const viewEstadosServicio = document.getElementById('view-estados-servicio');
    const viewDetails = document.getElementById('view-details');
    const viewTitle = document.getElementById('view-title');
    const viewContent = document.getElementById('view-content');

    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ CARGADO: ${appWorkshopData.length} talleres`);
    if (appWorkshopData.length > 0) {
        console.log("Primer taller:", appWorkshopData[0]);
    }

    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            const action = this.getAttribute('data-action');
            console.log(`CLICK: ${action}`);
            handleNavigation(action);
        });
    });

    document.getElementById('btn-back-red-talleres')?.addEventListener('click', () => showView(viewDashboard));
    document.getElementById('btn-back-estados-menu')?.addEventListener('click', () => showView(viewDashboard));
    document.getElementById('btn-back')?.addEventListener('click', () => showView(viewRedTalleres));
    document.getElementById('btn-back-estados-list')?.addEventListener('click', () => showView(viewEstadosMenu));

    function handleNavigation(action) {
        switch (action) {
            case 'open-red-talleres': showView(viewRedTalleres); break;
            case 'open-estados-servicio': showView(viewEstadosMenu); break;
            case 'view-tarija': showRegionTalleres('Tarija'); break;
            case 'view-sucre': showRegionTalleres('Sucre'); break;
            case 'view-santacruz': showRegionTalleres('Santa Cruz'); break;
            case 'view-protocolo': showProtocol(); break;
            case 'view-estados-tarija': showRegionOrdenes('Tarija'); break;
            case 'view-estados-sucre': showRegionOrdenes('Sucre'); break;
        }
    }

    function showRegionTalleres(region) {
        console.log(`\n🔍 Buscando: "${region}"`);
        console.log(`Total en memoria: ${appWorkshopData.length}`);
        
        if (appWorkshopData.length > 0) {
            console.log("Ciudades disponibles:", [...new Set(appWorkshopData.map(t => t.CIUDAD))]);
        }

        const regionUpper = region.toUpperCase();
        const talleres = appWorkshopData.filter(t => {
            const ciudad = (t.CIUDAD || "").toUpperCase();
            return ciudad === regionUpper;
        });

        console.log(`Encontrados: ${talleres.length}`);
        if (talleres.length > 0) {
            console.log("Primer resultado:", talleres[0]);
        }

        renderTalleres(region, talleres);
    }

    function renderTalleres(region, talleres) {
        if (viewTitle) viewTitle.textContent = `Talleres en ${region}`;
        if (viewContent) viewContent.innerHTML = '';

        if (talleres.length === 0) {
            if (viewContent) viewContent.innerHTML = '<p style="padding:2rem;">No hay talleres en esta región.</p>';
            showView(viewDetails);
            return;
        }

        const html = talleres.map(t => `
            <div style="padding:1rem;margin-bottom:1rem;border:1px solid #eee;border-radius:12px;">
                <h3 style="margin:0 0 0.5rem;">${t.TALLER || 'Sin nombre'}</h3>
                <p style="margin:0.25rem 0;color:#666;"><strong>Marca:</strong> ${t.MARCA || 'Sin marca'}</p>
                <p style="margin:0.25rem 0;color:#666;"><strong>Contacto:</strong> ${t.CONTACTO || 'Sin teléfono'}</p>
            </div>
        `).join('');

        if (viewContent) viewContent.innerHTML = html;
        showView(viewDetails);
    }

    function showRegionOrdenes(region) {
        const ordenes = appOrdersData.filter(o =>
            (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(region.toLowerCase())
        );

        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = `Órdenes - ${region}`;

        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;

        contentEl.innerHTML = ordenes.map(o => `
            <div style="padding:1rem;margin-bottom:0.75rem;border-left:4px solid #3b82f6;background:#f9f9f9;border-radius:8px;">
                <p><strong>ODT:</strong> ${o['Número de orden de trabajo'] || '—'}</p>
                <p><strong>Cliente:</strong> ${o['Cuenta: Nombre de la cuenta'] || '—'}</p>
                <p><strong>Estado:</strong> ${o.Estado || '—'}</p>
            </div>
        `).join('');

        showView(viewEstadosServicio);
    }

    function showProtocol() {
        if (viewTitle) viewTitle.textContent = 'Protocolo';
        if (viewContent) viewContent.innerHTML = '<p style="padding:1rem;">Protocolo de recepción</p>';
        showView(viewDetails);
    }

    function showView(view) {
        document.querySelectorAll('.main-content').forEach(v => v.classList.add('hidden'));
        view?.classList.remove('hidden');
    }

    async function loadAllData() {
        try {
            console.log("Cargando talleres...");
            const talleres = await fetchGoogleSheet('1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I', 'RED%20DE%20TALLERES');
            appWorkshopData = talleres;
            console.log(`✅ ${talleres.length} talleres cargados`);
        } catch (err) {
            console.error("❌ Error talleres:", err);
        }

        try {
            console.log("Cargando órdenes...");
            const ordenes = await fetchGoogleSheet('1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0', 'REPORTE%20GLOBAL');
            appOrdersData = ordenes;
            console.log(`✅ ${ordenes.length} órdenes cargadas`);
        } catch (err) {
            console.error("❌ Error órdenes:", err);
        }
    }

    async function fetchGoogleSheet(id, sheet) {
        const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
        console.log(`  Fetching: ${url}`);
        const res = await fetch(url);
        const text = await res.text();
        const json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
        
        const cols = json.table.cols.map(c => c.label);
        console.log(`  Columnas: ${cols.join(', ')}`);
        
        return json.table.rows.map(row => {
            const obj = {};
            cols.forEach((col, i) => {
                obj[col] = row.c[i]?.v || '';
            });
            return obj;
        });
    }
});
