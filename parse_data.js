const fs = require('fs');

const csvPath = 'datos.csv';
const jsonPath = 'data.json';

try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split(/\r?\n/);
    const records = [];

    let currentRegion = '';

    // Index 0 is header: CIUDAD,TALLER,CONTACTO,MARCA,UBICACIÓN POR GPS
    for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line handling quotes
        const row = [];
        let inQuote = false;
        let currentValue = '';

        for (let char of line) {
            if (char === '"') {
                inQuote = !inQuote;
            } else if (char === ',' && !inQuote) {
                row.push(currentValue);
                currentValue = '';
            } else {
                currentValue += char;
            }
        }
        row.push(currentValue);

        // Map columns
        const ciudad = row[0]?.trim() || '';
        const taller = row[1]?.trim() || '';
        const contacto = row[2]?.trim() || '';
        const marcas = row[3]?.trim() || '';
        const gps = row[4]?.trim() || '';

        // Detect region headers (e.g., "Sucre,,,,")
        if (ciudad && !taller && !contacto && !marcas && !gps) {
            currentRegion = ciudad;
            continue;
        }

        // Handle rows that belong to a region but might have empty 'ciudad'
        let finalRegion = ciudad;
        if (!ciudad && (taller || marcas)) {
            finalRegion = currentRegion;
        } else if (ciudad) {
            currentRegion = ciudad; // Update latest region
        }

        // Only add valid workshops
        if (taller) {
            // Clean up GPS coordinates if they exist
            let lat = null, lng = null;
            if (gps) {
                const parts = gps.split(',');
                if (parts.length === 2) {
                    lat = parseFloat(parts[0].trim());
                    lng = parseFloat(parts[1].trim());
                }
            }

            records.push({
                ciudad: finalRegion.toUpperCase(),
                nombre: taller,
                contacto: contacto,
                marcas: marcas,
                lat: lat,
                lng: lng,
                gps_original: gps
            });
        }
    }

    fs.writeFileSync(jsonPath, JSON.stringify(records, null, 2), 'utf8');
    console.log(`Successfully parsed ${records.length} workshops to data.json`);

} catch (e) {
    console.error('Error parsing CSV:', e);
}
