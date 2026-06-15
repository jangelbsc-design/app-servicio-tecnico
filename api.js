// api.js

export const USERS_SHEET_CONFIG = {
    id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
    sheetName: 'Usuarios_App'
};

export const SHEETS_CONFIG = {
    talleres: {
        id: '1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I',
        sheetName: 'RED%20DE%20TALLERES'
    },
    seguimiento: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'REPORTE%20GLOBAL'
    },
    zapia: {
        id: '1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0',
        sheetName: 'ZAPIA_ENRICHMENT'
    }
};

const TELEGRAM_CONFIG = {
    token: '8769379678:AAFjYMA5UXyWQ0QTyUSHhBEXhl2FAxmomLA',
    chatId: '363865053'                  // Juan Angel Bustos
};

export async function fetchGoogleSheet(id, sheet) {
    return new Promise(async (resolve, reject) => {
        try {
            const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const csvText = await res.text();
            
            window.Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data);
                },
                error: (error) => {
                    reject(error);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

export function escapeHTML(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

export function isRegionApp(territorioStr) {
    if (!territorioStr) return false;
    const t = territorioStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const regiones = ['tarija', 'sucre', 'oruro', 'beni', 'potosi', 'la paz', 'cochabamba', 'santa cruz'];
    if (regiones.some(r => t.includes(r))) return true;

    const municipios = ['montero', 'la guardia', 'el torno', 'cotoca', 'satelite', 'camiri', 'san julian', 'guabira', 'warnes', 'pailon', 'samaipata'];
    if (municipios.some(m => t.includes(m))) return true;

    return false;
}

export async function sendTelegram(message) {
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
                console.log('✅ Notificación Telegram enviada correctamente.');
            } else {
                console.error('❌ Telegram respondió con error:', data.description);
            }
        } else {
            console.error('❌ Error HTTP al enviar Telegram:', res.status, res.statusText);
        }
    } catch (e) {
        console.error('❌ Error enviando Telegram (posible bloqueo CORS si abres con file://):', e.message);
    }
}

export function parseFecha(str) {
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

export function diasDesde(fechaStr) {
    const f = parseFecha(fechaStr);
    if (!f) return null;
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return Math.floor((hoy - f) / 86400000);
}

export function chequearOrdenesEstancadas(appOrdersData) {
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
        console.log('✅ Telegram: sin órdenes estancadas.');
        return;
    }

    const fecha = new Date().toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const msg = `🚨 <b>DISMAC — Órdenes estancadas</b> (${fecha})

Se encontraron <b>${alertas.length}</b> orden(es) que requieren atención:

${alertas.join('\n\n')}

🔗 <b>Abrir App:</b> https://jabustos.github.io/app-servicio-tecnico/`;

    sendTelegram(msg);
}
