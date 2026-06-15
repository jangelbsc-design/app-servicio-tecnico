// dataParser.js

export function parseAllData(workshopData, globalData, zapiaData) {
    let parsedWorkshopData = [];
    let parsedOrdersData = [];

    // Parseo de Talleres
    parsedWorkshopData = workshopData.map(row => {
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
        const marca = getVal(row, 'MARCA', 'Marca', 'marca');

        let contacto = getVal(row, 'CONTACTO', 'Contacto', 'contacto', 'CONTACTOS', 'CELULAR', 'TELEFONO');
        if (!contacto) {
            const rowKeys = Object.keys(row);
            const contactKey = rowKeys.find(k => k.toUpperCase().includes('CONTACTO') || k.toUpperCase().includes('TEL') || k.toUpperCase().includes('CEL'));
            if (contactKey && row[contactKey]) {
                contacto = row[contactKey].toString().trim();
            }
        }

        if (taller && taller.toUpperCase().includes("ELECTRONICA DIGITAL JKA") && !contacto) {
            contacto = "60263531 - 60264988";
        }

        const ubicacion = getVal(row, 'UBICACIÓN POR GPS', 'Ubicación', 'UBICACION', 'UBICACIÓN GPS');

        return {
            ...row,
            CIUDAD: ciudad,
            TALLER: taller,
            MARCA: marca,
            CONTACTO: contacto,
            UBICACION: ubicacion
        };
    });

    // Parseo de Zapia
    let parsedZapiaData = [];
    if (zapiaData && zapiaData.length > 0) {
        let headerRowIndex = -1;
        let zapiaHeaderMap = {};

        for (let i = 0; i < Math.min(zapiaData.length, 5); i++) {
            const row = zapiaData[i];
            const vals = Object.values(row).map(v => (v || '').toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim());
            
            const hasTidy = vals.some(v => v.includes('tidy') || v.includes('referencia'));
            const hasDoc = vals.some(v => v.includes('documento') || v.includes('ci') || v.includes('carnet'));
            const hasDiag = vals.some(v => v.includes('diagnostico') || v.includes('falla'));
            const hasSol = vals.some(v => v.includes('solucion'));
            const hasMarca = vals.some(v => v.includes('marca'));

            if ((hasTidy ? 1 : 0) + (hasDoc ? 1 : 0) + (hasDiag ? 1 : 0) + (hasSol ? 1 : 0) + (hasMarca ? 1 : 0) >= 2) {
                headerRowIndex = i;
                break;
            }
        }

        if (headerRowIndex !== -1) {
            const headerRow = zapiaData[headerRowIndex];
            for (const [key, val] of Object.entries(headerRow)) {
                if (val) {
                    zapiaHeaderMap[key] = val.toString().trim();
                }
            }

            for (let i = headerRowIndex + 1; i < zapiaData.length; i++) {
                const row = zapiaData[i];
                const newRow = {};
                let hasAnyData = false;
                for (const [key, val] of Object.entries(row)) {
                    const headerName = zapiaHeaderMap[key];
                    if (headerName) {
                        newRow[headerName] = val;
                        if (val && val.toString().trim() !== '') hasAnyData = true;
                    }
                }
                if (hasAnyData) {
                    parsedZapiaData.push(newRow);
                }
            }
        } else {
            parsedZapiaData = zapiaData;
        }
    }

    const getZapiaVal = (row, ...keys) => {
        const rowKeys = Object.keys(row);
        for (const key of keys) {
            const normKey = key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const exactKey = rowKeys.find(k => {
                const normK = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                return normK === normKey || normK.includes(normKey);
            });
            if (exactKey && row[exactKey] !== undefined && row[exactKey] !== null) {
                return row[exactKey].toString().trim();
            }
        }
        return "";
    };

    // Cruzar y enriquecer órdenes
    parsedOrdersData = globalData.map(o => {
        const mainTidy = (o['Referencia'] || '').toString().trim().toUpperCase();
        
        let zapiaMatch = null;
        if (mainTidy && parsedZapiaData.length > 0) {
            zapiaMatch = parsedZapiaData.find(z => {
                const zTidy = getZapiaVal(z, 'Número de Tidy', 'Numero de Tidy', 'Tidy', 'Referencia').toUpperCase();
                return zTidy === mainTidy;
            });
        }

        if (zapiaMatch) {
            const zapiaCI = getZapiaVal(zapiaMatch, 'N° Documento', 'No Documento', 'Nro Documento', 'CI', 'Carnet de Identidad', 'CIs', 'Carnet');
            const zapiaTel = getZapiaVal(zapiaMatch, 'Teléfono', 'Telefono', 'Teléfonos', 'Telefonos', 'Celular');
            const zapiaDiag = getZapiaVal(zapiaMatch, 'Diagnóstico', 'Diagnostico', 'Falla');
            const zapiaSol = getZapiaVal(zapiaMatch, 'Solución', 'Solucion');
            const zapiaMarca = getZapiaVal(zapiaMatch, 'Marca');

            const hasAnyEnrichment = zapiaCI || zapiaTel || zapiaDiag || zapiaSol || zapiaMarca;

            if (hasAnyEnrichment) {
                return {
                    ...o,
                    zapiaEnriched: true,
                    zapiaCI: zapiaCI,
                    zapiaTel: zapiaTel,
                    zapiaDiag: zapiaDiag,
                    zapiaSol: zapiaSol,
                    zapiaMarca: zapiaMarca
                };
            }
        }
        return o;
    });

    return { parsedWorkshopData, parsedOrdersData };
}
