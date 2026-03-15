import csv
import json

def trim(s):
    return s.strip() if s else ""

csv_path = 'datos.csv'
json_path = 'data.json'

records = []
current_region = ""

with open(csv_path, 'r', encoding='utf-8') as f:
    reader = csv.reader(f)
    header = next(reader)
    
    for row in reader:
        # Pad row to 5 elements just in case
        while len(row) < 5:
            row.append("")
            
        ciudad = trim(row[0])
        taller = trim(row[1])
        contacto = trim(row[2])
        marcas = trim(row[3])
        gps = trim(row[4])

        if ciudad and not taller and not contacto and not marcas and not gps:
            current_region = ciudad
            continue

        final_region = ciudad
        if not ciudad and (taller or marcas):
            final_region = current_region
        elif ciudad:
            current_region = ciudad

        if taller:
            lat, lng = None, None
            if gps:
                parts = gps.replace('"', '').split(',')
                if len(parts) == 2:
                    try:
                        lat = float(parts[0].strip())
                        lng = float(parts[1].strip())
                    except ValueError:
                        pass
            
            records.append({
                "ciudad": final_region.upper(),
                "nombre": taller,
                "contacto": contacto,
                "marcas": marcas,
                "lat": lat,
                "lng": lng,
                "gps": gps
            })

with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(records, f, indent=4, ensure_ascii=False)

print(f"Successfully parsed {len(records)} workshops to data.json")
