
const https = require('https');

async function fetchGoogleSheet(id, sheet) {
    return new Promise((resolve, reject) => {
        const url = \https://docs.google.com/spreadsheets/d/\/gviz/tq?tqx=out:json&sheet=\\;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const text = data;
                const jsonStr = text.substring(text.indexOf('{'), text.lastIndexOf('}') + 1);
                const json = JSON.parse(jsonStr);
                
                if (!json.table || !json.table.rows) return resolve([]);

                const rows = json.table.rows.map(row => {
                    const obj = {};
                    json.table.cols.forEach((col, i) => {
                        if (!col.label) return;
                        const cell = row.c[i];
                        obj[col.label] = cell ? (cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== undefined && cell.v !== null ? cell.v : '')) : '';
                    });
                    return obj;
                });
                resolve(rows);
            });
        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log('Fetching Usuarios_App...');
        const usuarios = await fetchGoogleSheet('1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0', 'Usuarios_App');
        console.log(usuarios);
    } catch (err) {
        console.error('Error:', err);
    }
})();

