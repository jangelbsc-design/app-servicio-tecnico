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

    // Cargar datos
    console.log("📥 Cargando datos...");
    await loadAllData();
    console.log(`✅ ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

    // Event listeners para botones principales
    document.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', function(e) {
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

        const html = talleres.map(t => {
            // Convertir contacto a string de forma segura
            const contactoStr = String(t.CONTACTO || '').trim();
            
            // Procesar teléfonos
            let phonesHTML = '';
            if (contactoStr) {
                const phones = contactoStr.split(/[\/\-–,\s]+/).filter(p => p.length >= 6);
                phonesHTML = phones.map(phone => {
                    const clean = phone.replace(/\D/g, '');
                    return `
                        <a href="tel:${clean}" class="btn-action" style="background:#007AFF;color:white;padding:10px;border-radius:8px;text-align:center;text-decoration:none;display:block;">
                            <i class="bi bi-telephone-fill"></i> ${phone}
                        </a>
                    `;
                }).join('');
            }

            return `
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
                        ${phonesHTML || '<p style="padding:10px;color:#999;">Sin teléfono</p>'}
                    </div>
                </div>
            `;
        }).join('');

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
            viewContent.innerHTML = `
                <div style="padding:1rem;">
                    <h3>Protocolo de recepción</h3>
                    <p>Contenido del protocolo aquí...</p>
                </div>
            `;
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
            console.log(`  ✅ ${talleres.length} talleres`);
        } catch (err) {
            console.error("  ❌ Error talleres:", err.message);
        }

        try {
            const ordenes = await fetchGoogleSheet('1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0', 'REPORTE%20GLOBAL');
            appOrdersData = ordenes;
            console.log(`  ✅ ${ordenes.length} órdenes`);
        } catch (err) {
            console.error("  ❌ Error órdenes:", err.message);
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
