(function() {
  'use strict';

  let appWorkshopData = [];
  let appOrdersData = [];
  let appEncuestaData = [];
  let appCitasData = [];
  let currentView = 'dashboard';
  let currentRegion = '';
  let currentUser = null;
  let currentCitasFilter = 'hoy';
  let currentStatusFilter = 'todas';

  const ORDENES_POR_PAGINA = 10;
  let currentOrdenesPage = 1;
  let currentOrdenesFiltradas = [];
  let lastOrdenesOptions = null;

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    if (typeof str === 'boolean') return str ? 'Sí' : 'No';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function parseFecha(str) {
    if (!str) return null;
    const s = str.toString().trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  function diasDesde(fechaStr) {
    const f = parseFecha(fechaStr);
    if (!f) return null;
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    return Math.floor((hoy - f) / 86400000);
  }

  function diasEntre(f1, f2) {
    const a = parseFecha(f1), b = parseFecha(f2);
    if (!a || !b) return null;
    return Math.floor(Math.abs(b - a) / 86400000);
  }

  const GARANTIA_DIAS_DEFAULT = 365;
  const GARANTIA_DIAS_POR_TIPO = [
    { dias: 730, keywords: ['sony'], require: ['tv', 'televisor', 'bravia'], exclude: [] },
    { dias: 730, keywords: ['lavadora', 'secadora', 'refrigerador', 'refrigeradora', 'freezer', 'cocina', 'horno', 'microondas', 'campana', 'extractora', 'aire acondicionado', 'split', 'termotanque', 'calefon', 'lavavajilla'], exclude: ['cabello', 'pelo', 'oster'] }
  ];

  function diasGarantia(producto) {
    if (!producto) return GARANTIA_DIAS_DEFAULT;
    const p = producto.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const rango of GARANTIA_DIAS_POR_TIPO) {
      if (rango.exclude.some(x => new RegExp(`\\b${x}\\b`, 'i').test(p))) continue;
      if (!rango.keywords.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p))) continue;
      if (rango.require && !rango.require.some(k => new RegExp(`\\b${k}\\b`, 'i').test(p))) continue;
      return rango.dias;
    }
    return GARANTIA_DIAS_DEFAULT;
  }

  function getWarrantyInfo(o) {
    const f = parseFecha(o['Fecha de compra'] || "");
    if (!f) return { status: 'sin_datos', daysRemaining: null };
    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const vence = new Date(f);
    vence.setDate(vence.getDate() + diasGarantia(o['Producto ST']));
    const daysRemaining = Math.floor((vence - hoy) / 86400000);
    if (daysRemaining < 0) return { status: 'vencida', daysRemaining };
    if (daysRemaining <= 30) return { status: 'por_vencer', daysRemaining };
    return { status: 'en_garantia', daysRemaining };
  }

  function warrantyBadgeHtml(o) {
    const info = getWarrantyInfo(o);
    if (info.status === 'sin_datos') return '';
    const styles = {
      en_garantia: { bg: '#dcfce7', color: '#166534', icon: 'bi-patch-check-fill', text: 'Garantía' },
      por_vencer: { bg: '#fef3c7', color: '#b45309', icon: 'bi-exclamation-triangle', text: `${info.daysRemaining}d` },
      vencida: { bg: '#fee2e2', color: '#b91c1c', icon: 'bi-x-circle', text: 'Vencida' }
    }[info.status];
    return `<span class="sp-garantia-badge" style="background:${styles.bg};color:${styles.color};"><i class="bi ${styles.icon}"></i> ${styles.text}</span>`;
  }

  function isOrderInRegion(o, region) {
    if (!o || !region) return false;
    const terr = (o['Territorio de servicio: Nombre'] || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
    if (region === 'Municipios') return municipios.some(m => terr.includes(m));
    if (region === 'Regionales') {
      return !['santa cruz', 'el alto', 'cochabamba', 'la paz', 'achocalla'].some(x => terr.includes(x));
    }
    if (region === 'Santa Cruz') return terr.includes('santa cruz') && !municipios.some(m => terr.includes(m));
    return terr.includes(region.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  }

  function normalizarTexto(str) {
    return (str || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }

  const MARCAS_CONOCIDAS = [
    'BLACK & DECKER','FOREST & GARDEN','LA PAVONI','AIR MONSTER','GENERAL LUX','RED DISMAC','MASTER-G','BABYLISSPRO',
    'GOOD YEAR','HI-TECH','ARNO','AIWA','BABYLISS','BEURER','BOSCH','BRIARA','BRITANIA','BROTHER','CONSUL','DAKO','DUCATI',
    'ELECTROLUX','ENXUTA','EPSON','FLUX','GA.MA','GLEECON','HISENSE','HITECH','HONOR','HP','HUAVI','INDURAMA','INFINIX',
    'JVC','KARCHER','KENWOOD','KERNIG','KYOCERA','LEMYR','LG','LOGITECH','LORENZETTI','MAGEFESA','MISTRAL','MOULINEX',
    'MUELLER','OSTER','PANASONIC','PHILIPS','PIONEER','PREMIER','REALME','RHEEM','SAMSUNG','SINGER','SONY','SPLENDID',
    'TAURUS','TCL','TECNO','TOSHIBA','TRAMONTINA','UFESA','WAHL','WESTINGHOUSE','WHIRLPOOL','WILSON','XIAOMI','ZTE',
    'ACER','ASUS','LENOVO','DEWALT','STANLEY','METABO','HONDA','SCHULZ','JBL','KONKA','HAIER','MIDEA','DAEWOO','CHIQ',
    'WESTPOINT','MELING','APPLE','GENERAL ELECTRIC','HYUNDAI','PEABODY','ECOSMART'
  ];

  function marcaDeProducto(producto) {
    const p = normalizarTexto(producto);
    let mejor = '';
    for (const marca of MARCAS_CONOCIDAS) {
      const nm = normalizarTexto(marca);
      const ok = nm.includes(' ')
        ? p.includes(nm)
        : new RegExp(`\\b${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(p);
      if (ok && nm.length > mejor.length) mejor = marca;
    }
    return mejor;
  }

  function marcaDeOrden(o) {
    return (o['¿Qué servicio técnico ?'] || '').trim() || marcaDeProducto(o['Producto ST']);
  }

  async function loadDataFromStorage() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['talleres', 'ordenes', 'encuestas', 'citas', 'lastSync', 'syncStatus', 'usuario'], (data) => {
        appWorkshopData = data.talleres || [];
        appOrdersData = data.ordenes || [];
        appEncuestaData = data.encuestas || [];
        appCitasData = data.citas || [];
        currentUser = data.usuario || null;
        resolve(data);
      });
    });
  }

  function showView(viewId) {
    document.querySelectorAll('.sp-view').forEach(function(v) {
      v.classList.add('sp-hidden');
      v.classList.add('hidden');
    });
    var target = document.getElementById(viewId);
    if (target) {
      target.classList.remove('sp-hidden');
      target.classList.remove('hidden');
    }
    currentView = viewId;
  }

  function updateSyncIndicator(status, lastSync) {
    const el = document.getElementById('sync-indicator');
    if (!el) return;
    if (status === 'ok') {
      el.innerHTML = '<i class="bi bi-check-circle-fill" style="color:#16a34a;"></i>';
    } else {
      el.innerHTML = '<i class="bi bi-exclamation-circle-fill" style="color:#f59e0b;"></i>';
    }
    const syncText = document.getElementById('last-sync-text');
    if (syncText && lastSync) {
      const d = new Date(lastSync);
      syncText.textContent = `Última sync: ${d.toLocaleTimeString('es-BO', {hour:'2-digit', minute:'2-digit'})}`;
    }
  }

  function renderKPIs() {
    const estadosExcluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
    const activas = appOrdersData.filter(o => {
      const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return !estadosExcluidos.some(ex => e.includes(ex));
    });
    const estancadas = activas.filter(o => {
      const dc = parseInt(o['Tiempo desde apertura (Días)'] || '0', 10);
      const dm = diasDesde(o['Fecha de la última modificación']);
      return (dm !== null && dm >= 4) || dc >= 8;
    });
    const regiones = new Set(activas.map(o => (o['Territorio de servicio: Nombre'] || '').trim()));

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('kpi-ordenes', activas.length);
    set('kpi-estancadas', estancadas.length);
    set('kpi-talleres', appWorkshopData.length);
    set('kpi-regiones', regiones.size);

    const sinModificar4 = activas.filter(o => {
      const dm = diasDesde(o['Fecha de la última modificación']);
      return dm !== null && dm >= 4;
    }).length;
    const badgeMod = document.getElementById('badge-ultima-mod');
    if (badgeMod) {
      badgeMod.textContent = sinModificar4;
      badgeMod.style.background = sinModificar4 > 0 ? '#E31837' : '#16a34a';
    }

    const escCount = appOrdersData.filter(o => {
      const dc = diasEntre(o['Fecha de compra'], o['Fecha de inicio']);
      return dc !== null && dc <= 30;
    }).length;
    const badgeEsc = document.getElementById('badge-esc');
    if (badgeEsc) {
      badgeEsc.textContent = escCount;
      badgeEsc.style.background = escCount > 0 ? '#E31837' : '#16a34a';
    }

    // Citas badge — total count
    const totalCitas = appCitasData.length;
    const badgeCitas = document.getElementById('badge-citas');
    if (badgeCitas) {
      badgeCitas.textContent = totalCitas;
      badgeCitas.style.background = totalCitas > 0 ? '#E31837' : '#16a34a';
    }
  }

  function renderTalleres(region, talleres) {
    const title = document.getElementById('talleres-list-title');
    if (title) title.textContent = `Talleres - ${region}`;

    const container = document.getElementById('talleres-content');
    if (!container) return;

    if (talleres.length === 0) {
      container.innerHTML = '<div class="sp-empty">No se encontraron talleres.</div>';
      showView('view-talleres-list');
      return;
    }

    container.innerHTML = talleres.map(t => {
      const contactos = (t.CONTACTO || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
      const firstNum = contactos[0] ? contactos[0].replace(/\D/g, '') : null;

      let mapHtml = '';
      if (t.UBICACION) {
        let mapUrl = t.UBICACION;
        if (/^-?\d+\.\d+,\s*-?\d+\.\d+$/.test(mapUrl)) {
          mapUrl = `https://www.google.com/maps?q=${mapUrl.replace(/\s+/g, '')}`;
        } else if (!mapUrl.startsWith('http')) {
          mapUrl = 'https://' + mapUrl;
        }
        mapHtml = `<a href="${mapUrl}" target="_blank" style="display:block;text-align:center;margin-top:6px;font-size:0.7rem;color:#E31837;font-weight:700;text-decoration:none;"><i class="bi bi-map"></i> Ver en Maps</a>`;
      }

      return `
        <div class="sp-taller-card">
          <div class="sp-taller-header">
            <span class="sp-taller-name">${escapeHTML(t.TALLER)}</span>
            <span class="sp-taller-ciudad">${escapeHTML(t.CIUDAD)}</span>
          </div>
          <div class="sp-taller-marca">${escapeHTML(t.MARCA)}</div>
          ${contactos.length > 0 ? `
            <div class="sp-taller-actions">
              ${contactos.slice(0, 2).map(num => {
                const c = num.replace(/\D/g, '');
                return `
                  <a href="tel:${c}" class="sp-btn-call"><i class="bi bi-telephone-fill"></i> ${c}</a>
                  <a href="https://wa.me/591${c}" target="_blank" class="sp-btn-wa"><i class="bi bi-whatsapp"></i> WA</a>
                `;
              }).join('')}
            </div>
          ` : '<p style="font-size:0.72rem;color:#94a3b8;text-align:center;">Sin teléfono</p>'}
          ${mapHtml}
        </div>
      `;
    }).join('');

    showView('view-talleres-list');
  }

  function renderOrdenes(region, ordenes, options) {
    const title = document.getElementById('ordenes-title');
    if (title) title.textContent = options?.titulo || `Órdenes - ${region}`;

    const container = document.getElementById('ordenes-content');
    if (!container) return;

    const estadosExcluidos = ['cancelado', 'error', 'entregado', 'cerrado'];
    let filtradas = ordenes.filter(o => {
      const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return !estadosExcluidos.some(ex => e.includes(ex));
    });

    if (options?.ordenarPor === 'modificacion') {
      filtradas.sort((a, b) => {
        const fa = parseFecha(a['Fecha de la última modificación']);
        const fb = parseFecha(b['Fecha de la última modificación']);
        if (!fa && !fb) return 0; if (!fa) return 1; if (!fb) return -1;
        return fa - fb;
      });
    } else {
      filtradas.sort((a, b) => {
        const da = parseInt(a['Tiempo desde apertura (Días)'] || '0', 10);
        const db = parseInt(b['Tiempo desde apertura (Días)'] || '0', 10);
        return db - da;
      });
    }

    if (filtradas.length === 0) {
      container.innerHTML = '<div class="sp-empty">No se encontraron órdenes activas.</div>';
      const pagEl = document.getElementById('ordenes-pagination');
      if (pagEl) pagEl.innerHTML = '';
      showView('view-ordenes');
      return;
    }

    currentOrdenesFiltradas = filtradas;
    lastOrdenesOptions = options || null;

    const totalPaginas = Math.max(1, Math.ceil(filtradas.length / ORDENES_POR_PAGINA));
    if (currentOrdenesPage > totalPaginas) currentOrdenesPage = totalPaginas;
    if (currentOrdenesPage < 1) currentOrdenesPage = 1;

    const inicio = (currentOrdenesPage - 1) * ORDENES_POR_PAGINA;
    const paginaOrdenes = filtradas.slice(inicio, inicio + ORDENES_POR_PAGINA);

    container.innerHTML = paginaOrdenes.map(o => {
      const cliente = escapeHTML(o['Cuenta: Nombre de la cuenta'] || 'CLIENTE S/N');
      const producto = escapeHTML(o['Producto ST'] || '');
      const estado = escapeHTML(o.Estado || 'S/E');
      const odt = escapeHTML(o['Número de orden de trabajo'] || '');
      const region = escapeHTML(o['Territorio de servicio: Nombre'] || '');
      const dias = o['Tiempo desde apertura (Días)'] || '0';

      return `
        <div class="sp-orden-card" data-odt="${odt}">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:6px;">
            <div style="flex:1;min-width:0;">
              <div class="sp-orden-cliente">${cliente}</div>
              <div class="sp-orden-producto">${producto}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px;flex-shrink:0;">
              <span class="sp-estado-badge">${estado}</span>
              ${warrantyBadgeHtml(o)}
            </div>
          </div>
          <div class="sp-orden-meta">
            <span>ODT: ${odt}</span>
            <span><i class="bi bi-geo-alt-fill"></i> ${region}</span>
            <span>${dias}d</span>
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.sp-orden-card').forEach(card => {
      card.addEventListener('click', () => {
        const odt = card.dataset.odt;
        const orden = appOrdersData.find(o => (o['Número de orden de trabajo'] || '').trim() === odt);
        if (orden) renderOrdenDetail(orden);
      });
    });

    renderOrdenesPaginacion(totalPaginas);

    showView('view-ordenes');
  }

  function renderOrdenesPaginacion(totalPaginas) {
    const pagEl = document.getElementById('ordenes-pagination');
    if (!pagEl) return;

    const total = currentOrdenesFiltradas.length;
    if (totalPaginas <= 1) {
      pagEl.innerHTML = `<div class="sp-pagination-info">${total} órdenes</div>`;
      return;
    }

    const inicio = (currentOrdenesPage - 1) * ORDENES_POR_PAGINA + 1;
    const fin = Math.min(currentOrdenesPage * ORDENES_POR_PAGINA, total);

    let html = `<div class="sp-pagination-info">${inicio}–${fin} de ${total}</div><div class="sp-pagination-btns">`;

    const irA = (p) => { currentOrdenesPage = p; rerenderOrdenes(); };

    html += `<button class="sp-page-btn" data-page="${currentOrdenesPage - 1}" ${currentOrdenesPage === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;

    const visibles = [];
    if (totalPaginas <= 7) {
      for (let p = 1; p <= totalPaginas; p++) visibles.push(p);
    } else {
      visibles.push(1);
      if (currentOrdenesPage > 4) visibles.push('...');
      const desde = Math.max(2, currentOrdenesPage - 1);
      const hasta = Math.min(totalPaginas - 1, currentOrdenesPage + 1);
      for (let p = desde; p <= hasta; p++) visibles.push(p);
      if (currentOrdenesPage < totalPaginas - 3) visibles.push('...');
      visibles.push(totalPaginas);
    }

    visibles.forEach(v => {
      if (v === '...') {
        html += `<span class="sp-page-dots">…</span>`;
      } else {
        html += `<button class="sp-page-btn ${v === currentOrdenesPage ? 'active' : ''}" data-page="${v}">${v}</button>`;
      }
    });

    html += `<button class="sp-page-btn" data-page="${currentOrdenesPage + 1}" ${currentOrdenesPage === totalPaginas ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;

    html += `</div><div class="sp-pagination-btns sp-pagination-nav">`;
    html += `<button class="sp-page-btn sp-page-reset" data-page="1" ${currentOrdenesPage === 1 ? 'disabled' : ''}>Primera</button>`;
    html += `<button class="sp-page-btn sp-page-reset" data-page="${totalPaginas}" ${currentOrdenesPage === totalPaginas ? 'disabled' : ''}>Última</button>`;
    html += `</div>`;

    pagEl.innerHTML = html;

    pagEl.querySelectorAll('.sp-page-btn[data-page]').forEach(btn => {
      btn.addEventListener('click', function() {
        const p = parseInt(this.dataset.page, 10);
        if (!this.disabled && p >= 1 && p <= totalPaginas) irA(p);
      });
    });
  }

  function rerenderOrdenes() {
    renderOrdenes(currentRegion, currentOrdenesFiltradas, lastOrdenesOptions);
  }

  function renderOrdenDetail(o) {
    const container = document.getElementById('orden-detail-content');
    if (!container) return;

    const workshopName = (o['¿Qué servicio técnico ?'] || '').trim().toUpperCase();
    let workshop = null;
    if (workshopName) {
      const matchFn = (w) => {
        if (!w.TALLER) return false;
        const t = w.TALLER.toUpperCase();
        const tClean = t.replace(/^ST\s+/, '');
        return t === workshopName || tClean === workshopName || t.includes(workshopName) || workshopName.includes(tClean);
      };
      workshop = appWorkshopData.find(matchFn);
    }

    const nombreCliente = o['Cuenta: Nombre de la cuenta'] || 'N/A';
    const ordenDismac = o['Referencia'] || o['Número de orden de trabajo'] || 'N/A';
    const activo = o['Producto ST'] || 'N/A';
    const nroOrdenMarca = o['Nro de orden de trabajo (Marca)'] || 'S/O';
    const diasST = o['Tiempo desde apertura (Días)'] || '0';

    let workshopHtml = '';
    if (workshop) {
      const textMsg = `Hola, servicio técnico ${workshop.TALLER}, por favor ayúdenos con información sobre el estado de las siguientes órdenes de trabajo:\nOrden DISMAC: ${ordenDismac}\nNombre del cliente: ${nombreCliente}\nActivo: ${activo}\nNumero de orden: ${nroOrdenMarca}\nDías en el ST de marca: ${diasST}`;
      const encodedMsg = encodeURIComponent(textMsg);
      const nums = (workshop.CONTACTO || '').split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
      workshopHtml = `
        <div class="sp-detail-section">
          <h4><i class="bi bi-tools"></i> Taller: ${escapeHTML(workshop.TALLER)}</h4>
          <div class="sp-taller-actions" style="margin-top:6px;">
            ${nums.slice(0, 2).map(num => {
              const c = num.replace(/\D/g, '');
              return `
                <a href="tel:${c}" class="sp-btn-call"><i class="bi bi-telephone-fill"></i> Ll. ${c}</a>
                <a href="https://wa.me/?text=${encodedMsg}" target="_blank" class="sp-btn-wa"><i class="bi bi-whatsapp"></i> Mensaje</a>
              `;
            }).join('')}
          </div>
        </div>`;
    }

    const contactPhone = o.adicTelefono || '';
    let clientHtml = '';
    if (contactPhone) {
      const nums = contactPhone.split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
      const clientMsg = `Hola ${nombreCliente}, le saludamos de Dismac para brindarle información sobre su orden ${ordenDismac}.`;
      clientHtml = `
        <div class="sp-detail-section" style="border-color:#c8e6c9;">
          <h4 style="color:#16a34a;"><i class="bi bi-person-fill"></i> Contacto Cliente</h4>
          <div class="sp-taller-actions" style="margin-top:6px;">
            ${nums.slice(0, 2).map(num => {
              const c = num.replace(/\D/g, '');
              return `
                <a href="tel:${c}" class="sp-btn-call"><i class="bi bi-telephone-fill"></i> Llamar</a>
                <a href="https://wa.me/591${c}?text=${encodeURIComponent(clientMsg)}" target="_blank" class="sp-btn-wa"><i class="bi bi-whatsapp"></i> WA</a>
              `;
            }).join('')}
          </div>
        </div>`;
    }

    const info = getWarrantyInfo(o);
    let garantiaHtml = '<p style="margin:0;font-size:0.75rem;color:#94a3b8;">Sin datos de garantía</p>';
    if (info.status !== 'sin_datos') {
      const colors = { en_garantia: '#166534', por_vencer: '#b45309', vencida: '#b91c1c' };
      const labels = { en_garantia: '✓ En garantía', por_vencer: `⚠ Vence en ${info.daysRemaining}d`, vencida: '✗ Vencida' };
      garantiaHtml = `<p style="margin:0;font-size:0.78rem;color:${colors[info.status]};font-weight:700;">${labels[info.status]}</p>`;
    }

    const detail = `
      <div class="sp-detail-section">
        <h4><i class="bi bi-info-circle"></i> Información</h4>
        <div class="sp-detail-row"><span class="sp-detail-label">ODT</span><span class="sp-detail-value">${escapeHTML(o['Número de orden de trabajo'] || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Referencia</span><span class="sp-detail-value">${escapeHTML(o['Referencia'] || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Cliente</span><span class="sp-detail-value">${escapeHTML(nombreCliente)}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Producto</span><span class="sp-detail-value">${escapeHTML(activo)}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Estado</span><span class="sp-detail-value">${escapeHTML(o.Estado || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Sub Estado</span><span class="sp-detail-value">${escapeHTML(o.Sub_estado || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Región</span><span class="sp-detail-value">${escapeHTML(o['Territorio de servicio: Nombre'] || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Días abierta</span><span class="sp-detail-value">${escapeHTML(o['Tiempo desde apertura (Días)'] || '—')}d</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Tipo Servicio</span><span class="sp-detail-value">${escapeHTML(o['Tipo de Servicio'] || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Marca / ST</span><span class="sp-detail-value">${escapeHTML(marcaDeOrden(o) || '—')}</span></div>
      </div>

      <div class="sp-detail-section">
        <h4><i class="bi bi-calendar"></i> Fechas</h4>
        <div class="sp-detail-row"><span class="sp-detail-label">Compra</span><span class="sp-detail-value">${escapeHTML(o['Fecha de compra'] || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Ingreso marca</span><span class="sp-detail-value">${escapeHTML(o['Fecha de ingreso a la marca'] || '—')}</span></div>
        <div class="sp-detail-row"><span class="sp-detail-label">Última modif.</span><span class="sp-detail-value">${escapeHTML(o['Fecha de la última modificación'] || '—')}</span></div>
        <div style="margin-top:8px;">${garantiaHtml}</div>
      </div>

      ${workshopHtml}
      ${clientHtml}
    `;

    container.innerHTML = detail;
    showView('view-orden-detail');
  }

  function renderGlobalSearch(query) {
    const container = document.getElementById('search-results');
    const mainCards = document.getElementById('main-cards');
    if (!container) return;

    if (!query) {
      container.classList.add('hidden');
      container.classList.add('sp-hidden');
      container.innerHTML = '';
      mainCards?.classList.remove('hidden');
      mainCards?.classList.remove('sp-hidden');
      return;
    }

    mainCards?.classList.add('hidden');
    mainCards?.classList.add('sp-hidden');
    container.classList.remove('hidden');
    container.classList.remove('sp-hidden');

    const matchedTalleres = appWorkshopData.filter(t =>
      (t.TALLER || "").toLowerCase().includes(query) ||
      (t.MARCA || "").toLowerCase().includes(query) ||
      (t.CIUDAD || "").toLowerCase().includes(query)
    );

    const matchedOrdenes = appOrdersData.filter(o =>
      (o['Número de orden de trabajo'] || "").toLowerCase().includes(query) ||
      (o['Cuenta: Nombre de la cuenta'] || "").toLowerCase().includes(query) ||
      (o['Producto ST'] || "").toLowerCase().includes(query) ||
      (o['Referencia'] || "").toLowerCase().includes(query)
    ).filter(o => {
      const e = (o.Estado || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return !['cancelado', 'error', 'entregado', 'cerrado'].some(ex => e.includes(ex));
    });

    if (matchedTalleres.length === 0 && matchedOrdenes.length === 0) {
      container.innerHTML = '<div class="sp-empty"><i class="bi bi-search" style="font-size:1.5rem;display:block;margin-bottom:6px;"></i>Sin resultados</div>';
      return;
    }

    let html = '';

    if (matchedTalleres.length > 0) {
      html += `<h3 style="font-size:0.78rem;font-weight:800;margin:8px 0;color:#111;"><i class="bi bi-buildings"></i> Talleres (${matchedTalleres.length})</h3>`;
      html += matchedTalleres.slice(0, 10).map(t => {
        const nums = (t.CONTACTO || "").split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
        return `
          <div class="sp-taller-card">
            <div class="sp-taller-header">
              <span class="sp-taller-name">${escapeHTML(t.TALLER)}</span>
              <span class="sp-taller-ciudad">${escapeHTML(t.CIUDAD)}</span>
            </div>
            <div class="sp-taller-marca">${escapeHTML(t.MARCA)}</div>
            ${nums.length > 0 ? `
              <div class="sp-taller-actions">
                ${nums.slice(0, 1).map(num => {
                  const c = num.replace(/\D/g, '');
                  return `
                    <a href="tel:${c}" class="sp-btn-call"><i class="bi bi-telephone-fill"></i> Ll. ${c}</a>
                    <a href="https://wa.me/591${c}" target="_blank" class="sp-btn-wa"><i class="bi bi-whatsapp"></i> WA</a>
                  `;
                }).join('')}
              </div>` : ''}
          </div>`;
      }).join('');
    }

    if (matchedOrdenes.length > 0) {
      html += `<h3 style="font-size:0.78rem;font-weight:800;margin:8px 0;color:#111;"><i class="bi bi-file-earmark-text"></i> Órdenes (${matchedOrdenes.length})</h3>`;
      html += matchedOrdenes.slice(0, 10).map(o => `
        <div class="sp-orden-card" data-odt="${escapeHTML(o['Número de orden de trabajo'] || '')}">
          <div class="sp-orden-cliente">${escapeHTML(o['Cuenta: Nombre de la cuenta'] || 'S/N')}</div>
          <div class="sp-orden-producto">${escapeHTML(o['Producto ST'] || '')}</div>
          <div class="sp-orden-meta">
            <span class="sp-estado-badge">${escapeHTML(o.Estado || 'S/E')}</span>
            <span>ODT: ${escapeHTML(o['Número de orden de trabajo'] || '')}</span>
          </div>
        </div>
      `).join('');

      setTimeout(() => {
        container.querySelectorAll('.sp-orden-card').forEach(card => {
          card.addEventListener('click', () => {
            const odt = card.dataset.odt;
            const orden = appOrdersData.find(o => (o['Número de orden de trabajo'] || '').trim() === odt);
            if (orden) renderOrdenDetail(orden);
          });
        });
      }, 0);
    }

    container.innerHTML = html;
  }

  function renderEncuesta() {
    const container = document.getElementById('encuesta-content');
    if (!container) return;

    if (appEncuestaData.length === 0) {
      container.innerHTML = '<div class="sp-empty">Sin datos de encuestas disponibles.</div>';
      return;
    }

    let promo = 0, pasivo = 0, detractor = 0;
    appEncuestaData.forEach(r => {
      const st = r['NPS Status'] || '';
      if (st.includes('Promoter')) promo++;
      else if (st.includes('Passive')) pasivo++;
      else if (st.includes('Detractor')) detractor++;
    });
    const total = appEncuestaData.length;
    const nps = total ? Math.round(((promo / total) - (detractor / total)) * 100) : 0;

    container.innerHTML = `
      <div class="sp-detail-section">
        <h4><i class="bi bi-emoji-smile"></i> Resumen NPS</h4>
        <div class="sp-kpi-grid" style="margin-top:6px;">
          <div class="sp-kpi-card"><div class="sp-kpi-icon" style="background:#3b82f620;color:#3b82f6;"><i class="bi bi-file-earmark"></i></div><div><div class="sp-kpi-val">${total}</div><div class="sp-kpi-label">Encuestas</div></div></div>
          <div class="sp-kpi-card"><div class="sp-kpi-icon" style="background:${nps>=0?'#16a34a20':'#ef444420'};color:${nps>=0?'#16a34a':'#ef4444'};"><i class="bi bi-graph-up"></i></div><div><div class="sp-kpi-val">${nps}</div><div class="sp-kpi-label">NPS</div></div></div>
          <div class="sp-kpi-card"><div class="sp-kpi-icon" style="background:#16a34a20;color:#16a34a;"><i class="bi bi-emoji-smile"></i></div><div><div class="sp-kpi-val">${promo}</div><div class="sp-kpi-label">Promotores</div></div></div>
          <div class="sp-kpi-card"><div class="sp-kpi-icon" style="background:#ef444420;color:#ef4444;"><i class="bi bi-emoji-frown"></i></div><div><div class="sp-kpi-val">${detractor}</div><div class="sp-kpi-label">Detractores</div></div></div>
        </div>
      </div>
    `;
  }

  function renderCitas(query) {
    const container = document.getElementById('citas-content');
    if (!container) return;

    let filtered = appCitasData.slice();

    // Date filter — only apply if not "todas"
    if (currentCitasFilter !== 'todas') {
      const hoy = new Date();
      hoy.setHours(0,0,0,0);
      const manana = new Date(hoy);
      manana.setDate(manana.getDate() + 1);
      const finSemana = new Date(hoy);
      finSemana.setDate(finSemana.getDate() + 7);

      filtered = filtered.filter(c => {
        const f = parseFecha(c.fechaCita);
        if (!f) return false;
        f.setHours(0,0,0,0);
        if (currentCitasFilter === 'hoy') return f.getTime() === hoy.getTime();
        if (currentCitasFilter === 'manana') return f.getTime() === manana.getTime();
        if (currentCitasFilter === 'semana') return f >= hoy && f <= finSemana;
        return true;
      });
    }

    // Status filter
    if (currentStatusFilter !== 'todas') {
      filtered = filtered.filter(c => {
        const est = (c.estadoCita || c.estado || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return est.includes(currentStatusFilter);
      });
    }

    // Text search
    if (query) {
      const q = query.toLowerCase();
      filtered = filtered.filter(c =>
        (c.cliente || '').toLowerCase().includes(q) ||
        (c.direccion || '').toLowerCase().includes(q) ||
        (c.odt || '').toString().includes(q) ||
        (c.servicioTecnico || '').toLowerCase().includes(q) ||
        (c.tecnico || '').toLowerCase().includes(q) ||
        (c.contacto || '').includes(q)
      );
    }

    // Group by taller
    const groups = {};
    filtered.forEach(c => {
      const taller = c.servicioTecnico || 'Sin taller';
      if (!groups[taller]) groups[taller] = [];
      groups[taller].push(c);
    });

    if (filtered.length === 0) {
      container.innerHTML = '<div class="sp-empty">No hay citas con estos filtros<br><span style="font-size:0.7rem;color:#94a3b8;">Total en storage: ' + appCitasData.length + ' citas</span></div>';
      return;
    }

    let html = '<div style="padding:4px 12px;font-size:0.7rem;color:#64748b;margin-bottom:6px;">' + filtered.length + ' cita' + (filtered.length > 1 ? 's' : '') + ' encontrada' + (filtered.length > 1 ? 's' : '') + '</div>';

    for (const [taller, citas] of Object.entries(groups)) {
      const completadas = citas.filter(c => (c.estadoCita || c.estado || '').toLowerCase().includes('complet')).length;
      const canceladas = citas.filter(c => (c.estadoCita || c.estado || '').toLowerCase().includes('cancel')).length;
      html += `
        <div class="sp-cita-taller-group">
          <div class="sp-cita-taller-header">
            <span>${escapeHTML(taller)}</span>
            <span class="sp-cita-taller-count">${citas.length} cita${citas.length > 1 ? 's' : ''} ${completadas > 0 ? '· ' + completadas + '✓' : ''} ${canceladas > 0 ? '· ' + canceladas + '✗' : ''}</span>
          </div>
          ${citas.map(c => {
            const estNorm = (c.estadoCita || c.estado || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            let dotClass = 'programada';
            if (estNorm.includes('complet')) dotClass = 'completada';
            else if (estNorm.includes('cancel')) dotClass = 'cancelada';
            else if (estNorm.includes('reagend') || estNorm.includes('reprogram')) dotClass = 'reagendada';
            else if (estNorm.includes('proceso') || estNorm.includes('en curso')) dotClass = 'en-proceso';

            const odtNum = escapeHTML(c.odt || '');
            const cliente = escapeHTML(c.cliente || 'Sin nombre');
            const producto = escapeHTML(c.producto || '');
            const ciudad = escapeHTML(c.direccion || '');

            const statusKey = (c.estadoCita || c.estado || '').replace(/'/g, '&#39;');
            return `
              <div class="sp-cita-card" data-odt="${odtNum}" data-status="${escapeHTML(statusKey)}">
                <div class="sp-cita-status-dot ${dotClass}" title="${escapeHTML(c.estadoCita || c.estado || '')}"></div>
                <div class="sp-cita-info">
                  <div class="sp-cita-cliente">${cliente}</div>
                  <div class="sp-cita-producto">ODT ${odtNum} · ${producto}</div>
                  <div class="sp-cita-direccion">${c.tecnico ? 'Téc: ' + escapeHTML(c.tecnico) + ' · ' : ''}${ciudad}</div>
                </div>
              </div>`;
          }).join('')}
        </div>`;
    }

    container.innerHTML = html;

    container.querySelectorAll('.sp-cita-card').forEach(card => {
      card.addEventListener('click', function() {
        const odt = this.dataset.odt;
        const status = this.dataset.status;
        const cita = appCitasData.find(c => String(c.odt) === String(odt) && (c.estadoCita || c.estado || '') === status);
        if (cita) renderCitaDetail(cita);
      });
    });
  }

  function renderCitaDetail(cita) {
    const container = document.getElementById('cita-detail-content');
    if (!container) return;

    const estNorm = (cita.estadoCita || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let statusColor = '#94a3b8';
    let statusBg = '#f1f5f9';
    let statusLabel = cita.estadoCita || 'Sin estado';
    if (estNorm.includes('complet')) { statusColor = '#166534'; statusBg = '#dcfce7'; }
    else if (estNorm.includes('cancel')) { statusColor = '#b91c1c'; statusBg = '#fee2e2'; }
    else if (estNorm.includes('reagend') || estNorm.includes('reprogram')) { statusColor = '#b45309'; statusBg = '#fef3c7'; }
    else if (estNorm.includes('proceso') || estNorm.includes('en curso')) { statusColor = '#1e40af'; statusBg = '#dbeafe'; }

    const nums = (cita.contactoCel || '').split(/[-/,]/).map(n => n.trim()).filter(n => n.length >= 7);
    const cliente = encodeURIComponent(cita.cliente || 'Cliente');
    const prod = encodeURIComponent(cita.producto || 'Producto');

    container.innerHTML = `
      <div class="sp-cita-detail-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span style="font-weight:800; font-size:0.85rem;">ODT ${escapeHTML(cita.odt)}</span>
          <span class="sp-cita-detail-status" style="color:${statusColor}; background:${statusBg};">${escapeHTML(statusLabel)}</span>
        </div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Cliente</span><span class="sp-cita-detail-val">${escapeHTML(cita.cliente)}</span></div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Producto</span><span class="sp-cita-detail-val">${escapeHTML(cita.marca ? cita.marca + ' - ' : '')}${escapeHTML(cita.producto)}</span></div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Fecha Cita</span><span class="sp-cita-detail-val">${escapeHTML(cita.fechaCita || '—')}</span></div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Taller</span><span class="sp-cita-detail-val">${escapeHTML(cita.servicioTecnico || '—')}</span></div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Técnico</span><span class="sp-cita-detail-val">${escapeHTML(cita.tecnico || '—')}</span></div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Dirección</span><span class="sp-cita-detail-val">${escapeHTML(cita.direccion || '—')}</span></div>
        <div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Estado TidyWork</span><span class="sp-cita-detail-val">${escapeHTML(cita.estado || '—')}</span></div>
        ${cita.subEstadoCita ? `<div class="sp-cita-detail-row"><span class="sp-cita-detail-label">Sub-estado</span><span class="sp-cita-detail-val">${escapeHTML(cita.subEstadoCita)}</span></div>` : ''}
        <div class="sp-cita-detail-actions">
          ${nums.slice(0,1).map(n => {
            const c = n.replace(/\D/g, '');
            const msg = encodeURIComponent(`Hola, sobre ODT ${cita.odt}: Cliente ${cita.cliente}, Producto ${cita.producto}.`);
            return `
              <a href="tel:${c}" class="sp-cita-action-call">Ll. ${c}</a>
              <a href="https://wa.me/?text=${msg}" target="_blank" class="sp-cita-action-wa">WhatsApp</a>`;
          }).join('')}
        </div>
      </div>`;

    showView('view-cita-detail');
  }

  function handleAction(action, el) {
    switch (action) {
      case 'go-home': showView('view-dashboard'); break;
      case 'red-talleres': showView('view-talleres'); break;
      case 'estados-menu': showView('view-estados-menu'); break;
      case 'encuesta': renderEncuesta(); showView('view-encuesta'); break;
      case 'ultima-mod': {
        const sinModificar4 = appOrdersData.filter(o => {
          const dm = diasDesde(o['Fecha de la última modificación']);
          return dm !== null && dm >= 4;
        });
        currentOrdenesPage = 1;
        renderOrdenes('Última Modificación', sinModificar4, { titulo: 'Órdenes sin cambios (≥4d)', ordenarPor: 'modificacion' });
        break;
      }
      case 'escalamientos': {
        const esc = appOrdersData.filter(o => {
          const dc = diasEntre(o['Fecha de compra'], o['Fecha de inicio']);
          return dc !== null && dc <= 30;
        });
        currentOrdenesPage = 1;
        renderOrdenes('Escalamientos', esc, { titulo: 'Escalamientos (≤30d)' });
        break;
      }
      case 'talleres-region': {
        const region = el.dataset.region;
        currentRegion = region;
        const filtered = appWorkshopData.filter(t => (t.CIUDAD || "").toUpperCase() === region.toUpperCase());
        renderTalleres(region, filtered);
        break;
      }
      case 'ordenes-region': {
        const region = el.dataset.region;
        currentRegion = region;
        currentOrdenesPage = 1;
        const filtered = appOrdersData.filter(o => isOrderInRegion(o, region));
        renderOrdenes(region, filtered);
        break;
      }
      case 'citas':
        currentCitasFilter = 'todas';
        currentStatusFilter = 'todas';
        loadDataFromStorage().then(function() {
          renderCitas();
        });
        showView('view-citas');
        break;
    }
  }

  document.addEventListener('DOMContentLoaded', function() {
    // 1) Attach ALL event listeners FIRST (synchronously — never blocked)
    document.querySelectorAll('[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        handleAction(this.dataset.action, this);
      });
    });

    document.getElementById('refresh-btn')?.addEventListener('click', function() {
      var btn = this;
      btn.classList.add('spinning');
      try {
        chrome.runtime.sendMessage({ type: 'REQUEST_SYNC' }, function() {
          setTimeout(function() {
            loadDataFromStorage().then(function() {
              renderKPIs();
              btn.classList.remove('spinning');
            }).catch(function() { btn.classList.remove('spinning'); });
          }, 1000);
        });
      } catch(e) { btn.classList.remove('spinning'); }
    });

    var searchInput = document.getElementById('global-search');
    var clearBtn = document.getElementById('clear-search');

    if (searchInput) {
      searchInput.addEventListener('input', debounce(function(e) {
        var q = e.target.value.toLowerCase().trim();
        if (clearBtn) clearBtn.style.display = q.length > 0 ? 'block' : 'none';
        renderGlobalSearch(q);
      }, 250));
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        if (searchInput) searchInput.value = '';
        clearBtn.style.display = 'none';
        renderGlobalSearch('');
        if (searchInput) searchInput.focus();
      });
    }

    var tsInput = document.getElementById('talleres-search');
    if (tsInput) {
      tsInput.addEventListener('input', debounce(function(e) {
        var q = e.target.value.toLowerCase();
        var filtered = appWorkshopData.filter(function(t) {
          return (t.CIUDAD || "").toUpperCase() === currentRegion.toUpperCase() &&
            ((t.TALLER || "").toLowerCase().includes(q) || (t.MARCA || "").toLowerCase().includes(q));
        });
        renderTalleres(currentRegion, filtered);
      }, 250));
    }

    var osInput = document.getElementById('ordenes-search');
    if (osInput) {
      osInput.addEventListener('input', debounce(function(e) {
        var q = e.target.value.toLowerCase();
        var base = appOrdersData.filter(function(o) { return isOrderInRegion(o, currentRegion); });
        var filtered = base.filter(function(o) {
          return (o['Número de orden de trabajo'] || "").toLowerCase().includes(q) ||
            (o['Cuenta: Nombre de la cuenta'] || "").toLowerCase().includes(q) ||
            (o['Producto ST'] || "").toLowerCase().includes(q) ||
            (o['Referencia'] || "").toLowerCase().includes(q);
        });
        currentOrdenesPage = 1;
        renderOrdenes(currentRegion, filtered);
      }, 250));
    }

    var backOrdenes = document.getElementById('btn-back-ordenes');
    if (backOrdenes) backOrdenes.addEventListener('click', function() { showView('view-estados-menu'); });

    var backOrden = document.getElementById('btn-back-orden');
    if (backOrden) backOrden.addEventListener('click', function() { showView('view-ordenes'); });

    var backCitas = document.getElementById('btn-back-citas');
    if (backCitas) backCitas.addEventListener('click', function() { showView('view-citas'); });

    // Citas date filters — just toggle active state, don't auto-render
    document.querySelectorAll('.sp-citas-filter[data-cita-filter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.sp-citas-filter').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        currentCitasFilter = this.dataset.citaFilter;
      });
    });

    // Citas status filters — just toggle active state
    document.querySelectorAll('.sp-citas-status[data-status-filter]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.sp-citas-status').forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');
        currentStatusFilter = this.dataset.statusFilter;
      });
    });

    // Buscar button — applies all filters
    var buscarBtn = document.getElementById('citas-buscar-btn');
    if (buscarBtn) {
      buscarBtn.addEventListener('click', function() {
        var searchInput = document.getElementById('citas-search');
        var query = searchInput ? searchInput.value.toLowerCase().trim() : '';
        renderCitas(query);
      });
    }

    // Citas text search — live search as you type
    var citasSearch = document.getElementById('citas-search');
    if (citasSearch) {
      citasSearch.addEventListener('input', debounce(function(e) {
        renderCitas(e.target.value.toLowerCase().trim());
      }, 250));
    }

    document.querySelectorAll('.sp-btn-back[data-action]').forEach(function(btn) {
      btn.addEventListener('click', function() { handleAction(this.dataset.action); });
    });

    chrome.runtime.onMessage.addListener(function(message) {
      if (message.type === 'SYNC_COMPLETE') {
        loadDataFromStorage().then(function() { renderKPIs(); });
        chrome.storage.local.get(['lastSync', 'syncStatus'], function(data) {
          updateSyncIndicator(data.syncStatus, data.lastSync);
        });
      }
    });

    // 2) THEN load data asynchronously
    loadDataFromStorage().then(function() {
      document.getElementById('header-usuario').textContent = (currentUser && currentUser.nombre) ? currentUser.nombre : '—';
      chrome.storage.local.get(['lastSync', 'syncStatus'], function(data) {
        updateSyncIndicator(data.syncStatus, data.lastSync);
      });
      renderKPIs();
    }).catch(function(err) {
      console.error('Error loading data:', err);
    });
  });
})();
