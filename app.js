let appWorkshopData = [];
let appOrdersData = [];

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

    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const action = this.getAttribute('data-action');
            console.log(`👆 CLICK: ${action}`);
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
        }
    }

    function showRegionTalleres(region) {
        const regionUpper = region.toUpperCase();
        const talleres = appWorkshopData.filter(t => 
            (t.CIUDAD || "").toUpperCase() === regionUpper
        );

        renderTalleres(region, talleres);
    }

    function renderTalleres(region, talleres) {
        if (viewTitle) viewTitle.textContent = `Talleres en ${region}`;
        if (viewContent) viewContent.innerHTML = '';

        if (talleres.length === 0) {
            if (viewContent) {
                viewContent.innerHTML = '<p style="text-align:center;padding:2rem;">No hay talleres.</p>';
            }
            showView(viewDetails);
            return;
        }

        const html = talleres.map(t => {
            const contactoStr = String(t.CONTACTO || '').trim();
            let phonesHTML = '';
            
            if (contactoStr) {
                const phones = contactoStr.split(/[\/\-–,]/);
                phonesHTML = phones
                    .filter(p => p.trim().length > 0)
                    .map(phone => {
                        const clean = phone.trim().replace(/\D/g, '');
                        return `<a href="tel:${clean}" style="display:block;background:#007AFF;color:white;padding:10px;border-radius:8px;text-align:center;text-decoration:none;margin-bottom:5px;"><i class="bi bi-telephone-fill"></i> ${phone.trim()}</a>`;
                    }).join('');
            }

            return `
                <div class="workshop-card" style="padding:1rem;margin-bottom:1rem;border:1px solid #eee;border-radius:12px;">
                    <h3 style="margin:0 0 0.5rem;font-size:1.1rem;">${t.TALLER || 'Sin nombre'}</h3>
                    <p style="margin:0.25rem 0;color:#666;"><strong>Marca:</strong> ${t.MARCA || 'Sin marca'}</p>
                    <div style="margin-top:1rem;">
                        ${phonesHTML || '<p style="color:#999;">Sin teléfono</p>'}
                    </div>
                </div>
            `;
        }).join('');

        if (viewContent) viewContent.innerHTML = html;
        showView(viewDetails);
    }

    function showRegionOrdenes(region) {
        const regionLower = region.toLowerCase();
        const ordenes = appOrdersData.filter(o =>
            (o['Territorio de servicio: Nombre'] || "").toLowerCase().includes(regionLower)
        );

        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = `Órdenes - ${region}`;

        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;

        contentEl.innerHTML = ordenes.length === 0 
            ? '<p style="text-align:center;padding:2rem;">No hay órdenes.</p>'
            : ordenes.map(o => `
                <div style="padding:1rem;margin-bottom:0.75rem;border-left:4px solid #3b82f6;background:#f9f9f9;border-radius:8px;">
                    <p style="margin:0.25rem 0;"><strong>ODT:</strong> ${o['Número de orden de trabajo'] || '—'}</p>
                    <p style="margin:0.25rem 0;"><strong>Cliente:</strong> ${o['Cuenta: Nombre de la cuenta'] || '—'}</p>
                    <p style="margin:0.25rem 0;"><strong>Producto:</strong> ${o['Producto ST'] || '—'}</p>
                    <p style="margin:0.25rem 0;"><strong>Estado:</strong> ${o.Estado || '—'}</p>
                </div>
            `).join('');

        showView(viewEstadosServicio);
    }

    function showProtocol() {
        if (viewTitle) viewTitle.textContent = 'Protocolo de recepción';
        if (viewContent) {
            viewContent.innerHTML = `<p style="padding:1rem;">Protocolo de recepción</p>`;
        }
        showView(viewDetails);
    }

    function showView(view) {
        document.querySelectorAll('.main-content').forEach(v => v.classList.add('hidden'));
        view?.classList.remove('hidden');
    }

    async function loadAllData() {
        try {
            const talleres = await fetchGoogleSheet('1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I', 'RED%20DE%20TALLERES');
            appWorkshopData = talleres;
        } catch (err) {
            console.error("Error talleres:", err);
        }

        try {
            const ordenes = await fetchGoogleSheet('1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0', 'REPORTE%20GLOBAL');
            appOrdersData = ordenes;
        } catch (err) {
            console.error("Error órdenes:", err);
        }
    }

    async function fetchGoogleSheet(id, sheet) {
        const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
        const res = await fetch(url);
        const text = await res.text();
        const json = JSON.parse(text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1));
        
        return json.table.rows.map(row => {
            const obj = {};
            json.table.cols.forEach((col, i) => {
                obj[col.label] = row.c[i]?.v || '';
            });
            return obj;
        });
    }
});
