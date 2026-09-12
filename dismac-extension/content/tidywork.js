(function() {
  'use strict';

  const DISMAC_PANEL_ID = 'dismac-assist-panel';
  let currentODT = null;

  function getField(labelText) {
    const text = labelText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // Strategy 1: Look through all label/form-label elements
    const allLabels = document.querySelectorAll('label, .form-label, .col-form-label, .control-label, dt, th');
    for (const label of allLabels) {
      const lt = label.textContent.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (lt === text || lt.includes(text) || text.includes(lt)) {
        const val = extractValueNearLabel(label);
        if (val) return val;
      }
    }

    // Strategy 2: Look through all elements for exact text match
    const allEls = document.querySelectorAll('span, div, td, p, strong, b');
    for (const el of allEls) {
      const et = el.textContent.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      if (et === text || et === text + ':' || et === text + ' :') {
        const val = extractValueNearLabel(el);
        if (val) return val;
      }
    }

    // Strategy 3: Search all input/select by nearby label text
    const allInputs = document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
    for (const input of allInputs) {
      const container = input.closest('.mb-3, .form-group, .row, .col, [class*="col"], tr, .card-body, fieldset, .accordion-item');
      if (container) {
        const labelTextInContainer = container.textContent.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (labelTextInContainer.includes(text)) {
          const val = input.value?.trim() || '';
          if (val) return val;
        }
      }
    }

    return '';
  }

  function extractValueNearLabel(label) {
    const parent = label.closest('.mb-3, .form-group, .row, .col, [class*="col"], tr, .card-body, fieldset, .accordion-item, td');
    if (!parent) return '';

    // Try plain text elements first (form-control-plaintext, fw-bold)
    const plainCandidates = parent.querySelectorAll('.form-control-plaintext, .fw-bold');
    for (const el of plainCandidates) {
      if (el === label) continue;
      const t = el.textContent?.trim() || '';
      if (t.length > 0 && t.length < 200 && t !== label.textContent.trim()) {
        return t;
      }
    }

    // Try select/input/textarea (skip checkbox, radio, hidden)
    const input = parent.querySelector('input:not([type="hidden"]):not([type="password"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), select, textarea');
    if (input) {
      if (input.tagName === 'SELECT') {
        const opt = input.options[input.selectedIndex];
        if (opt && opt.text && opt.text.trim()) return opt.text.trim();
      }
      const val = input.value?.trim() || '';
      if (val) return val;
    }

    // Fallback: any span/p/td with short text
    const fallbackCandidates = parent.querySelectorAll('span, p, td, div');
    for (const el of fallbackCandidates) {
      if (el === label) continue;
      const t = el.textContent?.trim() || '';
      if (t.length > 0 && t.length < 200 && t !== label.textContent.trim()) {
        if (el.children.length === 0) {
          return t;
        }
      }
    }

    return '';
  }

  function extractODTFromPage() {
    const val = getField('N° Interno');
    if (val) return val;

    const urlMatch = window.location.pathname.match(/\/(\d+)/);
    if (urlMatch) return urlMatch[1];

    return '';
  }

  function extractFullOrderData() {
    return {
      // Información básica
      nroInterno: getField('N° Interno'),
      nroOrdenTidywork: getField('N° de orden de trabajo'),
      estado: getField('Estado'),
      subEstado: getField('Sub Estado') || getField('Subestado'),
      prioridad: getField('Prioridad'),
      tipoServicio: getField('Tipo de Servicio'),
      canalEntrada: getField('Canal de Entrada'),
      
      // Cliente
      cliente: getField('Nombre Completo') || getField('Nombre de la cuenta'),
      contacto1: getField('Contacto 1'),
      contactoCel1: getField('Contacto Celular 1'),
      contactoCel2: getField('Contacto Celular 2'),
      email: getField('Email') || getField('Correo'),
      
      // Ubicación
      regional: getField('Regional'),
      municipio: getField('Municipio'),
      direccion: getField('Dirección') || getField('Dirección del cliente'),
      
      // Producto
      producto: getField('Descripción') || getField('Descripción del producto'),
      marca: getField('Marca'),
      modelo: getField('Modelo'),
      serie: getField('Serie 1') || getField('Serie'),
      fechaCompra: getField('Fecha de compra'),
      
      // Servicio técnico
      tecnico: getField('Tecnico') || getField('Técnico'),
      servicioTecnico: getField('¿Qué servicio técnico ?') || getField('Servicio técnico asignado'),
      falla: getField('Descripción de la Falla') || getField('Falla reportada'),
      diagnostico: getField('Diagnóstico') || getField('Diagnostico'),
      solucion: getField('Solución') || getField('Solucion'),
      observaciones: getField('Observaciones'),
      
      // Fechas
      fechaIngreso: getField('Fecha de ingreso a la marca') || getField('Fecha de ingreso'),
      fechaInicio: getField('Fecha de inicio'),
      fechaModificacion: getField('Fecha de la última modificación'),
      fechaCita: getField('Fecha Cita') || getField('Fecha de la cita'),
      
      // Cita
      estadoCita: getField('Estado Cita') || getField('Estado de la cita'),
      
      // TidyWork specific
      numeroOTMarca: getField('Nro de orden de trabajo (Marca)'),
    };
  }

  async function findMatchingOrder(odt) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FIND_ORDER', odt: odt }, (response) => {
        resolve(response?.found || []);
      });
    });
  }

  async function findMatchingWorkshop(name) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'FIND_WORKSHOP', name: name }, (response) => {
        resolve(response?.found || []);
      });
    });
  }

  function removePanel() {
    const existing = document.getElementById(DISMAC_PANEL_ID);
    if (existing) existing.remove();
  }

  function injectPanel(html) {
    removePanel();

    const panel = document.createElement('div');
    panel.id = DISMAC_PANEL_ID;
    panel.innerHTML = html;

    // Try to find the best insertion point
    const targets = [
      '.card-body',
      '.card-header',
      '.card',
      'form > .row:first-child',
      'form > div:first-child',
      'form',
      '.accordion',
      '.row.mt-3',
      '#app',
      'main',
      'body'
    ];

    for (const selector of targets) {
      const target = document.querySelector(selector);
      if (target) {
        target.insertBefore(panel, target.firstChild);
        return;
      }
    }

    document.body.insertBefore(panel, document.body.firstChild);
  }

  function renderDismacBadge(matchingOrders, workshopData, odt, pageData) {
    const warrantyInfo = (matchingOrders.length > 0 || pageData.fechaCompra) 
      ? getWarrantyInfoExt(matchingOrders.length > 0 ? matchingOrders[0] : null, pageData) 
      : null;

    // Build order info section
    let orderInfoHtml = '';
    if (matchingOrders.length > 0) {
      const o = matchingOrders[0];
      const estado = o.Estado || pageData.estado || 'S/E';
      const region = o['Territorio de servicio: Nombre'] || pageData.regional || '';
      const dias = o['Tiempo desde apertura (Días)'] || '0';
      const cliente = o['Cuenta: Nombre de la cuenta'] || pageData.cliente || '';
      const producto = o['Producto ST'] || pageData.producto || '';
      const servicioTecnico = o['¿Qué servicio técnico ?'] || pageData.servicioTecnico || '';

      orderInfoHtml = `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px; margin-bottom:8px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <span style="font-weight:700; font-size:0.78rem;">Encontrada en Dismac</span>
            <span style="background:#e0e7ff; color:#3b82f6; padding:2px 6px; border-radius:6px; font-size:0.65rem; font-weight:700;">${escapeHTML(estado)}</span>
          </div>
          ${cliente ? `<div style="font-size:0.72rem; color:#475569;"><strong>Cliente:</strong> ${escapeHTML(cliente)}</div>` : ''}
          ${producto ? `<div style="font-size:0.72rem; color:#475569;"><strong>Producto:</strong> ${escapeHTML(producto)}</div>` : ''}
          ${servicioTecnico ? `<div style="font-size:0.72rem; color:#475569;"><strong>Taller:</strong> ${escapeHTML(servicioTecnico)}</div>` : ''}
          ${region ? `<div style="font-size:0.72rem; color:#475569;"><strong>Región:</strong> ${escapeHTML(region)}</div>` : ''}
          <div style="font-size:0.72rem; color:#64748b;">Días abierta: <strong>${dias}d</strong></div>
        </div>`;
    } else {
      // No match in Google Sheets — still show page data if available
      let pageInfoItems = [];
      if (pageData.cliente) pageInfoItems.push(`<strong>Cliente:</strong> ${escapeHTML(pageData.cliente)}`);
      if (pageData.producto) pageInfoItems.push(`<strong>Producto:</strong> ${escapeHTML(pageData.producto)}`);
      if (pageData.tecnico) pageInfoItems.push(`<strong>Técnico:</strong> ${escapeHTML(pageData.tecnico)}`);
      if (pageData.servicioTecnico) pageInfoItems.push(`<strong>Taller:</strong> ${escapeHTML(pageData.servicioTecnico)}`);
      if (pageData.falla) pageInfoItems.push(`<strong>Falla:</strong> ${escapeHTML(pageData.falla)}`);
      
      orderInfoHtml = `
        <div style="background:#f0f7ff; border:1px solid #dbeafe; border-radius:8px; padding:8px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:0.75rem; color:#1e40af; margin-bottom:4px;">Datos de TidyWork</div>
          ${pageInfoItems.length > 0 ? pageInfoItems.map(i => `<div style="font-size:0.72rem; color:#475569;">${i}</div>`).join('') : '<div style="font-size:0.72rem; color:#94a3b8;">No se encontraron datos</div>'}
        </div>`;
    }

    // Warranty badge
    let warrantyHtml = '';
    if (warrantyInfo) {
      const colors = { en_garantia: '#166534', por_vencer: '#b45309', vencida: '#b91c1c', sin_datos: '#94a3b8' };
      const labels = { en_garantia: '✓ En garantía', por_vencer: `⚠ Vence en ${warrantyInfo.daysRemaining}d`, vencida: '✗ Garantía vencida', sin_datos: '— Sin datos' };
      const bgColors = { en_garantia: '#dcfce7', por_vencer: '#fef3c7', vencida: '#fee2e2', sin_datos: '#f1f5f9' };
      warrantyHtml = `
        <div style="display:inline-flex; align-items:center; gap:4px; background:${bgColors[warrantyInfo.status]}; color:${colors[warrantyInfo.status]}; padding:4px 10px; border-radius:8px; font-size:0.72rem; font-weight:700;">
          ${labels[warrantyInfo.status]}
        </div>`;
    }

    // Workshop contact buttons
    let workshopHtml = '';
    if (workshopData.length > 0) {
      const w = workshopData[0];
      const nums = (w.CONTACTO || '').split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
      workshopHtml = `
        <div style="background:#f0f7ff; border:1px solid #dbeafe; border-radius:8px; padding:8px; margin-top:8px;">
          <div style="font-weight:700; font-size:0.75rem; color:#1e40af; margin-bottom:6px;">
            Taller: ${escapeHTML(w.TALLER)}
          </div>
          <div style="display:flex; flex-direction:column; gap:4px;">
            ${nums.slice(0, 2).map(num => {
              const c = num.replace(/\D/g, '');
              const cliente = pageData.cliente || 'Cliente';
              const prod = pageData.producto || 'Producto';
              const msg = encodeURIComponent(`Hola ${w.TALLER}, sobre ODT ${odt}: Cliente ${cliente}, Producto ${prod}.`);
              return `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:4px;">
                  <a href="tel:${c}" style="background:#dbeafe; color:#1e40af; text-decoration:none; padding:5px; border-radius:6px; font-size:0.7rem; text-align:center; font-weight:700;">Ll. ${c}</a>
                  <a href="https://wa.me/?text=${msg}" target="_blank" style="background:#dcfce7; color:#15803d; text-decoration:none; padding:5px; border-radius:6px; font-size:0.7rem; text-align:center; font-weight:700;">WhatsApp</a>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    // Extra fields from TidyWork
    let extraFieldsHtml = '';
    const extraFields = [];
    if (pageData.diagnostico) extraFields.push({ label: 'Diagnóstico', value: pageData.diagnostico });
    if (pageData.solucion) extraFields.push({ label: 'Solución', value: pageData.solucion });
    if (pageData.observaciones) extraFields.push({ label: 'Observaciones', value: pageData.observaciones });
    if (pageData.estadoCita) extraFields.push({ label: 'Estado Cita', value: pageData.estadoCita });
    if (pageData.fechaCita) extraFields.push({ label: 'Fecha Cita', value: pageData.fechaCita });
    
    if (extraFields.length > 0) {
      extraFieldsHtml = `
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px; margin-top:8px;">
          <div style="font-weight:700; font-size:0.72rem; color:#374151; margin-bottom:4px;">Información del servicio</div>
          ${extraFields.map(f => `<div style="font-size:0.7rem; color:#475569; margin-bottom:2px;"><strong>${f.label}:</strong> ${escapeHTML(f.value)}</div>`).join('')}
        </div>`;
    }

    const panelHtml = `
      <div style="background:white; border:2px solid #E31837; border-radius:12px; padding:12px; margin:12px 0; font-family:'Outfit',sans-serif; box-shadow:0 4px 12px rgba(227,24,55,0.1);">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid #fee2e2;">
          <div style="display:flex; font-size:0.9rem; font-weight:900; border-radius:4px; overflow:hidden;">
            <div style="background:#E31837; color:white; padding:1px 3px 1px 5px;">dis</div>
            <div style="background:white; color:black; padding:1px 5px 1px 3px; border:1px solid #eee;">mac</div>
          </div>
          <span style="font-weight:800; font-size:0.8rem; color:#111;">Dismac Assist</span>
          <span style="margin-left:auto; font-size:0.65rem; color:#94a3b8;">ODT ${escapeHTML(odt)}</span>
        </div>

        ${warrantyHtml ? `<div style="margin-bottom:8px;">${warrantyHtml}</div>` : ''}
        ${orderInfoHtml}
        ${extraFieldsHtml}
        ${workshopHtml}
      </div>`;

    injectPanel(panelHtml);
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    if (typeof str === 'boolean') return str ? 'Sí' : 'No';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function getWarrantyInfoExt(o, pageData) {
    const GARANTIA_DIAS_DEFAULT = 365;
    const GARANTIA_DIAS_POR_TIPO = [
      { dias: 730, keywords: ['sony'], require: ['tv', 'televisor', 'bravia'], exclude: [] },
      { dias: 730, keywords: ['lavadora', 'secadora', 'refrigerador', 'freezer', 'cocina', 'horno', 'microondas', 'campana', 'split', 'termotanque', 'calefon'], exclude: ['cabello', 'pelo', 'oster'] }
    ];

    function parseFecha(s) {
      if (!s) return null;
      s = s.toString().trim();
      let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return new Date(+m[3], +m[2]-1, +m[1]);
      m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(+m[1], +m[2]-1, +m[3]);
      const d = new Date(s);
      return isNaN(d) ? null : d;
    }

    function diasGarantia(prod) {
      if (!prod) return GARANTIA_DIAS_DEFAULT;
      const p = prod.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      for (const r of GARANTIA_DIAS_POR_TIPO) {
        if (r.exclude.some(x => new RegExp(`\\b${x}\\b`, 'i').test(p))) continue;
        if (r.keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p))) {
          if (r.require && !r.require.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p))) continue;
          return r.dias;
        }
      }
      return GARANTIA_DIAS_DEFAULT;
    }

    // Try Google Sheets data first, then page data
    const fechaCompra = (o && o['Fecha de compra']) || pageData?.fechaCompra || '';
    const producto = (o && o['Producto ST']) || pageData?.producto || '';

    const f = parseFecha(fechaCompra);
    if (!f) return { status: 'sin_datos', daysRemaining: null };
    
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const vence = new Date(f);
    vence.setDate(vence.getDate() + diasGarantia(producto));
    const daysRemaining = Math.floor((vence - hoy) / 86400000);
    if (daysRemaining < 0) return { status: 'vencida', daysRemaining };
    if (daysRemaining <= 30) return { status: 'por_vencer', daysRemaining };
    return { status: 'en_garantia', daysRemaining };
  }

  async function processOrder() {
    const odt = extractODTFromPage();
    if (!odt || odt === currentODT) return;
    currentODT = odt;

    console.log('[Dismac Assist] ODT detectada:', odt);
    
    const pageData = extractFullOrderData();
    console.log('[Dismac Assist] Datos extraídos de TidyWork:', pageData);
    
    const matchingOrders = await findMatchingOrder(odt);
    console.log('[Dismac Assist] Resultado busqueda:', matchingOrders.length, 'ordenes encontradas');

    let workshopData = [];
    const workshopName = (matchingOrders.length > 0 
      ? matchingOrders[0]['¿Qué servicio técnico ?'] 
      : pageData.servicioTecnico) || '';
    
    if (workshopName.trim()) {
      workshopData = await findMatchingWorkshop(workshopName.trim());
      console.log('[Dismac Assist] Taller encontrado:', workshopData.length > 0 ? workshopData[0].TALLER : 'ninguno');
    }

    renderDismacBadge(matchingOrders, workshopData, odt, pageData);

    chrome.runtime.sendMessage({
      type: 'TIDYWORK_ORDER_EXTRACTED',
      odt: odt,
      data: pageData
    });

    // Save appointment if has date or status
    if (pageData.fechaCita || pageData.estadoCita) {
      chrome.runtime.sendMessage({
        type: 'SAVE_APPOINTMENT',
        appointment: {
          odt: odt,
          cliente: pageData.cliente || '',
          producto: pageData.producto || '',
          marca: pageData.marca || '',
          direccion: pageData.direccion || '',
          servicioTecnico: pageData.servicioTecnico || '',
          tecnico: pageData.tecnico || '',
          fechaCita: pageData.fechaCita || '',
          estadoCita: pageData.estadoCita || '',
          subEstadoCita: pageData.subEstadoCita || '',
          estado: pageData.estado || '',
          contacto: pageData.contacto1 || '',
          contactoCel: pageData.contactoCel1 || ''
        }
      });
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        setTimeout(processOrder, 500);
        setTimeout(processAppointmentPage, 1000);
        break;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(processOrder, 2000);
  setTimeout(processAppointmentPage, 2500);

  window.addEventListener('popstate', () => { 
    currentODT = null; 
    setTimeout(processOrder, 500); 
    setTimeout(processAppointmentPage, 500);
  });

  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      currentODT = null;
      setTimeout(processOrder, 500);
      setTimeout(processAppointmentPage, 500);
    }
  }, 1000);

  let appointmentTimer = null;
  function processAppointmentPage() {
    if (!window.location.href.includes('appointment')) return;

    if (appointmentTimer) clearTimeout(appointmentTimer);
    appointmentTimer = setTimeout(() => {
      const tables = document.querySelectorAll('table.dataTable');
      if (tables.length === 0) return;

      tables.forEach(table => {
        try {
          const dt = $(table).DataTable();
          dt.page.len(100).draw();
        } catch (e) {
          console.warn('[Dismac Assist] No se pudo cambiar page length:', e);
        }
      });

      setTimeout(extractAppointmentRows, 2000);
    }, 500);
  }

  function extractAppointmentRows() {
    const tables = document.querySelectorAll('table.dataTable');
    let savedCount = 0;

    tables.forEach(table => {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length === 0) return;

      // Headers: (ID), NroTrabajo, Tipo, Estado, SubEstado, Tecnico, Cliente, NroDocumento, Ciudad, Opts
      rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 9) return;

        const odt = cells[1]?.textContent.trim() || '';
        if (!odt || odt.length < 3) return;

        const appointment = {
          odt: odt,
          cliente: cells[6]?.textContent.trim() || '',
          producto: cells[2]?.textContent.trim() || '',
          marca: '',
          direccion: cells[8]?.textContent.trim() || '',
          servicioTecnico: cells[5]?.textContent.trim() || '',
          tecnico: cells[5]?.textContent.trim() || '',
          fechaCita: '',
          estadoCita: cells[3]?.textContent.trim() || '',
          subEstadoCita: cells[4]?.textContent.trim() || '',
          estado: cells[3]?.textContent.trim() || '',
          contacto: cells[7]?.textContent.trim() || '',
          contactoCel: ''
        };

        chrome.runtime.sendMessage({ type: 'SAVE_APPOINTMENT', appointment: appointment });
        savedCount++;
      });
    });

    if (savedCount > 0) {
      console.log('[Dismac Assist] Citas guardadas desde appointment:', savedCount);
      chrome.runtime.sendMessage({ type: 'SYNC_COMPLETE' }).catch(() => {});
    }
  }
})();
