const https = require('https');

async function fetchGoogleSheet(id, sheet) {
    return new Promise((resolve, reject) => {
        const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${sheet}`;
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
        console.log("Fetching talleres...");
        const workshopData = await fetchGoogleSheet('1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I', 'RED%20DE%20TALLERES');
        
        console.log("Fetching ordenes...");
        const globalData = await fetchGoogleSheet('1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0', 'REPORTE%20GLOBAL');

        let appWorkshopData = workshopData.map(row => {
            const getVal = (row, ...keys) => {
                const rowKeys = Object.keys(row);
                for (const key of keys) {
                    const exactKey = rowKeys.find(k => k.trim().toUpperCase() === key.toUpperCase());
                    if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null) {
                        return row[exactKey].toString().trim();
                    }
                }
                return "";
            };

            const ciudad = getVal(row, 'CIUDAD', 'Ciudad', 'ciudad');
            const taller = getVal(row, 'TALLER', 'Taller', 'taller');
            let contacto = getVal(row, 'CONTACTO', 'Contacto', 'contacto', 'CONTACTOS', 'CELULAR', 'TELEFONO');
            
            if (taller !== "") {
                return { CIUDAD: ciudad, TALLER: taller, CONTACTO: contacto };
            }
            return null;
        }).filter(row => row !== null);

        console.log("Found " + appWorkshopData.length + " talleres.");
        console.log("AppWorkshopData (first 5):", appWorkshopData.slice(0, 5));

        console.log("Found " + globalData.length + " ordenes.");
        
        let unmatched = 0;
        let matched = 0;
        let exampleUnmatched = null;
        let exampleCensel = null;

        console.log("Keys of first order:", Object.keys(globalData[0]));
        for(const o of globalData) {
            if(o['Número de orden de trabajo'] == '132782') {
                console.log("Found order 132782:");
                console.log(o);
                const workshopName = (o['¿Qué servicio técnico ?'] || "").trim();
                console.log("WorkshopName: '" + workshopName + "'");
                const workshopExact = appWorkshopData.find(w => w.TALLER && w.TALLER.toUpperCase() === workshopName.toUpperCase());
                console.log("Exact Match:", workshopExact);
                const workshopIncludes = appWorkshopData.find(w => w.TALLER && (w.TALLER.toUpperCase().includes(workshopName.toUpperCase()) || workshopName.toUpperCase().includes(w.TALLER.toUpperCase())));
                console.log("Includes Match:", workshopIncludes);
            }
        }
        
    } catch (err) {
        console.error("Error:", err);
    }
})();
