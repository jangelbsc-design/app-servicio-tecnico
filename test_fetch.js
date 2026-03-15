const Papa = require('papaparse');
const https = require('https');

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

(async () => {
    try {
        console.log("Fetching talleres...");
        const talleresCsv = await fetchUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1vTMzFxgUYdkKmOY4fpZcU61qBWwonnx2czhpWrofqREoEmm-f7aXFWSgGQy_5Lrb5LCGCaZHDCDEL7f/pub?gid=0&single=true&output=csv");
        
        Papa.parse(talleresCsv, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const firstRow = results.data[0];
                console.log("Talleres Headers:", Object.keys(firstRow));
                console.log("Talleres Data parsed length:", results.data.length);
                let lastRegion = "";
                const mapped = results.data.map(row => {
                    let currentRegion = (row['CIUDAD'] || row['Region'] || row['DEPARTAMENTO'] || "").toUpperCase().trim();
                    if (currentRegion) lastRegion = currentRegion;
                    return { region: lastRegion, taller: row['TALLER'] };
                });
                console.log("Talleres Mapped (first 5):", mapped.slice(0, 5));
            }
        });

        console.log("Fetching ordenes...");
        const ordenesCsv = await fetchUrl("https://docs.google.com/spreadsheets/d/e/2PACX-1vRNIPSRWiPlpvDGr8Wu0-I9rDTTJuyYfix8z8aSg_7uP7LlDOyDkZblbNM2a3HCYZ8clagytLA3fVTp/pub?gid=0&single=true&output=csv");

        Papa.parse(ordenesCsv, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const firstRow = results.data[0];
                console.log("Ordenes Headers:", Object.keys(firstRow));
                console.log("Ordenes Data parsed length:", results.data.length);
            }
        });

    } catch (err) {
        console.error("Error:", err);
    }
})();
