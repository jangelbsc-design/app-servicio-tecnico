let appWorkshopData = [];
let appOrdersData = [];
let ordersLoaded = false;

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
    const btnBack = document.getElementById('btn-back');
    const btnBackRedTalleres = document.getElementById('btn-back-red-talleres');
    const btnBackEstadosMenu = document.getElementById('btn-back-estados-menu');
    const btnBackEstadosList = document.getElementById('btn-back-estados-list');
    const actionButtons = document.querySelectorAll('.dash-card');

    let currentView = 'dashboard';
    let selectedRegion = null;
    let selectedEstadosRegion = null;

    // Cargar datos
    console.log("📥 Cargando datos desde Google Sheets...");
    await loadAllData();
    console.log(`✅ Datos cargados: ${appWorkshopData.length} talleres, ${appOrdersData.length} órdenes`);

    // Event Listeners - Botones principales
    actionButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const action = button.getAttribute('data-action');
            console.log(`🔘 Click: ${action}`);
            handleNavigation(action);
        });
    });

    if (btnBackRedTalleres) {
        btnBackRedTalleres.addEventListener('click', () => {
            console.log("← Volviendo al dashboard");
            showView(viewDashboard);
            currentView = 'dashboard';
        });
    }

    if (btnBackEstadosMenu) {
        btnBackEstadosMenu.addEventListener('click', () => {
            console.log("← Volviendo al dashboard");
            showView(viewDashboard);
            currentView = 'dashboard';
        });
    }

    if (btnBack) {
        btnBack.addEventListener('click', () => {
            console.log("← Volviendo a red de talleres");
            showView(viewRedTalleres);
            currentView = 'red-talleres';
            selectedRegion = null;
        });
    }

    if (btnBackEstadosList) {
        btnBackEstadosList.addEventListener('click', () => {
            console.log("← Volviendo a menú de estados");
            showView(viewEstadosMenu);
            currentView = 'estados-menu';
            selectedEstadosRegion = null;
        });
    }

    function handleNavigation(action) {
        console.log(`🧭 handleNavigation: ${action}`);
        switch (action) {
            case 'open-red-talleres':
                console.log("📍 Abriendo RED DE TALLERES");
                showView(viewRedTalleres);
                currentView = 'red-talleres';
                break;
            case 'open-estados-servicio':
                console.log("📊 Abriendo ESTADOS DE SERVICIO");
                showView(viewEstadosMenu);
                currentView = 'estados-menu';
                break;
            case 'view-tarija':
                openRegionView('Tarija');
                break;
            case 'view-sucre':
                openRegionView('Sucre');
                break;
            case 'view-santacruz':
                openRegionView('Santa Cruz');
                break;
            case 'view-protocolo':
                openProtocolView();
                break;
            case 'view-estados-tarija':
                openEstadosServicio('Tarija');
                break;
            case 'view-estados-sucre':
                openEstadosServicio('Sucre');
                break;
        }
    }

    function openRegionView(regionStr) {
        console.log(`🔍 Buscando talleres de ${regionStr}, total: ${appWorkshopData.length}`);
        
        selectedRegion = regionStr;
        const regionUpper = regionStr.toUpperCase().trim();
        
        const results = appWorkshopData.filter(item => {
            const itemRegion = (item.CIUDAD || "").toUpperCase().trim();
            return itemRegion === regionUpper;
        });

        console.log(`✅ Encontrados ${results.length} talleres`);
        renderList(`Talleres en ${regionStr}`, results);
        currentView = 'region';
        showView(viewDetails);
    }

    function renderList(title, dataArray) {
        console.log(`📋 Renderizando ${dataArray.length} talleres`);
        
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
            return;
        }

        const listContainer = document.createElement('div');
        listContainer.style.display = 'flex';
        listContainer.style.flexDirection = 'column';
        listContainer.style.gap = '1rem';
        listContainer.style.paddingBottom = '2rem';

        dataArray.forEach(taller => {
            const el = document.createElement('div');
            el.className = 'workshop-card';

            const tallerName = taller.TALLER || "Sin nombre";
            const marca = taller.MARCA || "Sin marca";
            const contacto = taller.CONTACTO || "";
            const gps = taller['UBICACIÓN POR GPS'] || "";

            // Procesar teléfonos
            const rawNumbers = (contacto || "").split(/[\/\-–]/);
            const phonesData = rawNumbers.map(n => {
                const textValue = n.trim();
                const cleanDigit = textValue.replace(/\D/g, '');
                const isMobile = cleanDigit.startsWith('7') || cleanDigit.startsWith('6');
                return { text: textValue, digits: cleanDigit, isMobile };
            }).filter(obj => obj.digits.length >= 6);

            let contactHTML = '';
            phonesData.forEach(phone => {
                contactHTML += `
                    <div class="contact-group">
                        <a href="tel:${phone.digits}" class="btn-action action-call">
                            <div class="action-icon"><i class="bi bi-telephone-fill"></i></div>
                            <span>Ll. ${phone.text}</span>
                        </a>
                        ${phone.isMobile ? `
                        <a href="https://wa.me/591${phone.digits}" target="_blank" class="btn-action action-wa">
                            <div class="action-icon"><i class="bi bi-whatsapp"></i></div>
                            <span>WA ${phone.text}</span>
                        </a>
                        ` : ''}
                    </div>
                `;
            });

            if (gps && gps.includes(',')) {
                contactHTML += `
                    <div class="workshop-actions" style="margin-top: 0.5rem;">
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(gps)}" target="_blank" class="btn-action action-map">
                            <div class="action-icon"><i class="bi bi-geo-alt-fill"></i></div>
                            <span>Abrir Ubicación GPS</span>
                        </a>
                    </div>
                `;
            }

            el.innerHTML = `
                <div class="workshop-header">
                    <h3 class="workshop-title">${tallerName}</h3>
                </div>
                <div class="workshop-body">
                    <div class="info-row">
                        <i class="bi bi-tag-fill text-primary" style="color: #2563eb;"></i>
                        <span style="font-weight: 600; color: #475569;">${marca}</span>
                    </div>
                </div>
                <div class="workshop-actions" style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 1rem;">
                    ${contactHTML}
                </div>
            `;
            listContainer.appendChild(el);
        });

        if (viewContent) viewContent.appendChild(listContainer);
    }

    function openProtocolView() {
        selectedRegion = null;
        if (viewTitle) viewTitle.textContent = 'Protocolo de recepción';
        if (viewContent) {
            viewContent.innerHTML = `
                <div style="padding-bottom: 2rem;">
                    <div style="text-align: center; margin-bottom: 1.5rem;">
                        <h3 style="color: var(--text-main); margin-top: 0.5rem; font-weight: 600;">Pasos a seguir</h3>
                    </div>
                    <div class="accordion-container" style="display: flex; flex-direction: column; gap: 10px;">
                        <div class="accordion-item" style="border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                            <button class="accordion-header" style="width: 100%; padding: 15px; background: #fff; border: none; text-align: left; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-family: 'Outfit', sans-serif;">
                                <span style="font-weight: 600; font-size: 1rem;"><span style="color: #E31837; margin-right: 8px;">1.</span> Recepción Inicial</span>
                                <i class="bi bi-chevron-down" style="transition: transform 0.3s;"></i>
                            </button>
                            <div class="accordion-content" style="padding: 0 15px; max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s; background: #fbfbfb;">
                                <div style="padding: 15px 0;">
                                    <p><strong>Acción:</strong> Bienvenida, reporte de falla y validación de garantía.</p>
                                    <p><strong>Sistema:</strong> Consultar Sistema BLEND para verificar vigencia.</p>
                                    <p><strong>Inspección:</strong> Revisión física para descartar golpes, humedad o sellos rotos.</p>
                                </div>
                            </div>
                        </div>
                        <div class="accordion-item" style="border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                            <button class="accordion-header" style="width: 100%; padding: 15px; background: #fff; border: none; text-align: left; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-family: 'Outfit', sans-serif;">
                                <span style="font-weight: 600; font-size: 1rem;"><span style="color: #E31837; margin-right: 8px;">2.</span> Documentación</span>
                                <i class="bi bi-chevron-down" style="transition: transform 0.3s;"></i>
                            </button>
                            <div class="accordion-content" style="padding: 0 15px; max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s; background: #fbfbfb;">
                                <div style="padding: 15px 0;">
                                    <p><strong>Caso BLEND:</strong> Abrir caso con toda la información técnica.</p>
                                    <p><strong>Tidy:</strong> Generar número de Tidy para el transporte.</p>
                                    <p><strong>Evidencia:</strong> Registrar S/N, accesorios y fotografías estéticas.</p>
                                </div>
                            </div>
                        </div>
                        <div class="accordion-item" style="border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                            <button class="accordion-header" style="width: 100%; padding: 15px; background: #fff; border: none; text-align: left; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-family: 'Outfit', sans-serif;">
                                <span style="font-weight: 600; font-size: 1rem;"><span style="color: #E31837; margin-right: 8px;">3.</span> Comunicación Interna</span>
                                <i class="bi bi-chevron-down" style="transition: transform 0.3s;"></i>
                            </button>
                            <div class="accordion-content" style="padding: 0 15px; max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s; background: #fbfbfb;">
                                <div style="padding: 15px 0;">
                                    <p><strong>WhatsApp:</strong> Enviar al grupo de RECEPCIÓN el Tidy y las fotos de respaldo.</p>
                                </div>
                            </div>
                        </div>
                        <div class="accordion-item" style="border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
                            <button class="accordion-header" style="width: 100%; padding: 15px; background: #fff; border: none; text-align: left; display: flex; justify-content: space-between; align-items: center; cursor: pointer; font-family: 'Outfit', sans-serif;">
                                <span style="font-weight: 600; font-size: 1rem;"><span style="color: #E31837; margin-right: 8px;">4.</span> Logística</span>
                                <i class="bi bi-chevron-down" style="transition: transform 0.3s;"></i>
                            </button>
                            <div class="accordion-content" style="padding: 0 15px; max-height: 0; overflow: hidden; transition: max-height 0.3s ease-out, padding 0.3s; background: #fbfbfb;">
                                <div style="padding: 15px 0;">
                                    <p><strong>Taller:</strong> Envío del equipo al Servicio Técnico Autorizado (STA).</p>
                                    <p><strong>Nota:</strong> Solicitar Nota de Ingreso con fecha de ingreso real.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            attachAccordionListeners();
        }
        showView(viewDetails);
    }

    function attachAccordionListeners() {
        if (!viewContent) return;
        const accordionItems = viewContent.querySelectorAll('.accordion-item');
        accordionItems.forEach(item => {
            const header = item.querySelector('.accordion-header');
            const content = item.querySelector('.accordion-content');
            const arrow = item.querySelector('.bi-chevron-down');

            header.addEventListener('click', () => {
                const isOpen = item.classList.contains('active');
                accordionItems.forEach(i => {
                    i.classList.remove('active');
                    i.querySelector('.accordion-content').style.maxHeight = '0';
                    i.querySelector('.bi-chevron-down').style.transform = 'rotate(0deg)';
                });

                if (!isOpen) {
                    item.classList.add('active');
                    content.style.maxHeight = '300px';
                    arrow.style.transform = 'rotate(180deg)';
                }
            });
        });
    }

    function showView(viewToShow) {
        if (viewDashboard) viewDashboard.classList.add('hidden');
        if (viewRedTalleres) viewRedTalleres.classList.add('hidden');
        if (viewEstadosMenu) viewEstadosMenu.classList.add('hidden');
        if (viewEstadosServicio) viewEstadosServicio.classList.add('hidden');
        if (viewDetails) viewDetails.classList.add('hidden');
        if (viewToShow) viewToShow.classList.remove('hidden');
    }

    async function openEstadosServicio(region) {
        console.log(`📊 Abriendo órdenes de ${region}`);
        selectedEstadosRegion = region;
        const titleEl = document.getElementById('view-estados-title');
        if (titleEl) titleEl.textContent = `Órdenes - ${region}`;
        showView(viewEstadosServicio);

        const regionLower = region.toLowerCase().trim();
        const filteredOrders = appOrdersData.filter(order => {
            const territorio = (order['Territorio de servicio: Nombre'] || "").toLowerCase().trim();
            return territorio.includes(regionLower) || territorio.includes('montero');
        });

        console.log(`✅ Encontradas ${filteredOrders.length} órdenes`);
        renderOrdersList(filteredOrders);
    }

    function renderOrdersList(orders) {
        console.log(`📋 Renderizando ${orders.length} órdenes`);
        const contentEl = document.getElementById('estados-content');
        if (!contentEl) return;
        contentEl.innerHTML = '';

        if (orders.length === 0) {
            contentEl.innerHTML = `
                <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
                    <i class="bi bi-inbox" style="font-size: 2.5rem;"></i>
                    <p style="margin-top: 1rem;">No hay órdenes para esta región.</p>
                </div>
            `;
            return;
        }

        orders.forEach((order) => {
            let statusColor = '#888';
            const estado = (order.Estado || "").toLowerCase();
            if (estado.includes('espera')) statusColor = '#f59e0b';
            else if (estado.includes('proceso') || estado.includes('curso')) statusColor = '#3b82f6';
            else if (estado.includes('terminado') || estado.includes('cerrado') || estado.includes('completado') || estado.includes('entregado')) statusColor = '#10b981';

            const card = document.createElement('div');
            card.className = 'workshop-card';
            card.style.cssText = `border-left: 4px solid ${statusColor}; margin-bottom: 0.75rem; cursor: pointer;`;

            const orderId = order['Número de orden de trabajo'] || "—";
            const cuenta = order['Cuenta: Nombre de la cuenta'] || "—";
            const territorio = order['Territorio de servicio: Nombre'] || "—";
            const producto = order['Producto ST'] || "—";
            const tiempoApertura = order['Tiempo desde apertura (Días)'] || "0";
            const estadoText = order.Estado || "—";
            const referencia = order.Referencia || "—";
            const nroOrdenMarca = order['Nro de orden de trabajo (Marca)'] || "S/O";
            const subEstado = order.Sub_estado || "";

            card.innerHTML = `
                <div class="order-summary" onclick="this.parentElement.querySelector('.order-detail').classList.toggle('hidden');" style="cursor: pointer;">
                    <div style="flex: 1; min-width: 0;">
                        <span style="font-size: 0.72rem; color: #aaa; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">ODT: ${orderId}</span>
                        <h3 style="font-size: 1rem; margin: 0.15rem 0 0.3rem; color: #111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${cuenta}</h3>
                        <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
                            <span style="font-size: 0.78rem; color: #666;"><i class="bi bi-geo-alt-fill" style="color: #E31837;"></i> ${territorio}</span>
                            <span style="font-size: 0.78rem; color: #666;"><i class="bi bi-clock-fill" style="color: #f59e0b;"></i> ${tiempoApertura}d</span>
                        </div>
                    </div>
                    <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem; flex-shrink: 0; margin-left: 0.5rem;">
                        <span style="background-color: ${statusColor}22; color: ${statusColor}; padding: 3px 9px; border-radius: 12px; font-size: 0.72rem; font-weight: 700; white-space: nowrap;">${estadoText}</span>
                        <i class="bi bi-chevron-down" style="color: #bbb; font-size: 0.85rem;"></i>
                    </div>
                </div>

                <div class="order-detail hidden" style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #eee;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 1rem; font-size: 0.85rem; color: #444;">
                        <div>
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">CUENTA</span>
                            <span style="font-weight: 600; color: #111;">${cuenta}</span>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">N° TRABAJO (REF.)</span>
                            <span style="font-weight: 600; color: #111;">${referencia}</span>
                        </div>
                        <div style="grid-column: span 2;">
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">N° ORDEN MARCA</span>
                            <span style="font-weight: 600; color: #111;">${nroOrdenMarca}</span>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">TERRITORIO</span>
                            <span>${territorio}</span>
                        </div>
                        <div>
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">APERTURA</span>
                            <span>${tiempoApertura} días</span>
                        </div>
                        <div style="grid-column: span 2;">
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">PRODUCTO</span>
                            <span>${producto}</span>
                        </div>
                        <div style="grid-column: span 2;">
                            <span style="font-size: 0.72rem; color: #aaa; font-weight: 700; display: block;">ESTADO / SUB-ESTADO</span>
                            <span style="color: ${statusColor}; font-weight: 600;">${estadoText}</span>${subEstado ? ` <span style="color: #888; font-size: 0.8rem;">· ${subEstado}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
            contentEl.appendChild(card);
        });
    }

    async function loadAllData() {
        try {
            console.log("  Cargando TALLERES...");
            const talleresData = await fetchGoogleSheetGVIZ(
                '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
                'RED%20DE%20TALLERES'
            );
            appWorkshopData = talleresData;
            console.log(`  ✅ ${appWorkshopData.length} talleres cargados`);
        } catch (err) {
            console.error("  ❌ Error cargando talleres:", err);
        }

        try {
            console.log("  Cargando ÓRDENES...");
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
        
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const text = await response.text();
        const jsonString = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
        const data = JSON.parse(jsonString);

        const cols = data.table.cols;
        const rows = data.table.rows;

        console.log(`    Columnas: ${cols.map(c => c.label).join(', ')}`);

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
});
