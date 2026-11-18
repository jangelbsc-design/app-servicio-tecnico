# Portal de Soporte Técnico Dismac (PWA)

Aplicación web instalable para el seguimiento de órdenes de servicio técnico y la red de talleres
autorizados de Dismac. Es una PWA sin build: HTML + CSS + JavaScript que se publica tal cual y lee
sus datos de Google Sheets.

**En producción:** https://jangelbsc-design.github.io/app-servicio-tecnico/

## Qué hace

- **Dashboard** con KPIs de órdenes activas, garantías, escalamientos y alertas SLA.
- **Órdenes de servicio** por regional (Tarija, Sucre, Santa Cruz, Municipios, La Paz, Cochabamba,
  Oruro, Beni, Potosí): tarjetas con cliente, producto, estado y sub-estado, tipo de compra, fechas,
  marca/ST, taller asignado y contacto por WhatsApp/teléfono.
- **Red de talleres** por ciudad con marcas, contacto y ubicación en Maps; **alta y edición de
  talleres** desde la app (admin) a través de una Web App de Google Apps Script.
- **Última modificación** y **escalamientos**: órdenes sin movimiento y candidatas a cambio de equipo.
- **Reportes y gráficas** con exportación a CSV y PDF corporativo (Chart.js + jsPDF).
- **Encuestas NPS** por regional.
- **Transporte**: las órdenes de la pestaña `TRANSPORTE` se suman a la lista con su propio chip.

## Stack

| Pieza | Detalle |
|---|---|
| Frontend | HTML, CSS y JavaScript vanilla (sin framework ni bundler) |
| Datos | Google Sheets vía `/export?format=csv&gid=…` + PapaParse |
| Escritura | Google Apps Script (`apps-script/AgregarTaller.gs`) como Web App `/exec` |
| Gráficas / PDF | Chart.js 4.4.1 · jsPDF 2.5.1 + AutoTable 3.8.2 |
| PWA | `sw.js` (network-first para navegación, stale-while-revalidate para estáticos) |
| Publicación | GitHub Pages desde la rama `main` |

## Estructura

```
app.js                  ~4.000 líneas: carga de datos, vistas, reportes y exportaciones
index.html              Shell de la PWA (todas las vistas y modales)
style.css               Estilos (mobile-first)
sw.js                   Service worker: precaché del shell + CDN
manifest.json           Metadatos de instalación
firebase-config.js      Config de Firebase (solo inicialización, sin uso funcional)
icon-*.png, *.webp      Iconos y mapa de talleres
apps-script/            Script de alta/edición de talleres + su README de instalación
dismac-extension/       Extensión de Chrome (herramienta aparte, no forma parte de la PWA)
```

## Hojas de datos

La configuración (documento y `gid` de cada pestaña) está en `SHEETS_CONFIG`, al inicio de `app.js`.

| Pestaña | Uso |
|---|---|
| `RED DE TALLERES` | Talleres por ciudad, marcas y contactos |
| `REPORTE GLOBAL` | Órdenes de servicio activas |
| `REPORTE GLOBAL ADICIONALES` | Detalle de falla/solución, técnico, tipo de compra, citas (cruce por `Referencia`) |
| `nps por regional` | Encuestas de satisfacción |
| `TRANSPORTE` | Órdenes de traslado |
| `Usuarios_App` | Usuarios y roles del login |

## Correr en local

Necesita un servidor HTTP (el service worker no funciona con `file://`):

```powershell
# desde la carpeta del proyecto
npx serve .          # o: python -m http.server 8099
```

Luego abrir `http://localhost:8099/`. La app descarga las hojas reales, así que requiere internet.

## Publicar

1. Subir los cambios a `main`; GitHub Pages sirve la raíz del repo.
2. **Si cambió `app.js`, `style.css` o cualquier archivo del shell:** subir `CACHE_VERSION` en
   `sw.js` y el `?v=` correspondiente en `sw.js` **y** en `index.html`.
   Si no, los usuarios siguen viendo la versión cacheada.
3. Verificar en el navegador con la caché limpia y en la URL publicada.

## Roles

- **admin**: todas las vistas, reportes, encuesta NPS y alta/edición de talleres.
- **regional**: solo las órdenes y talleres de su territorio.
- El login se valida en el navegador contra la hoja `Usuarios_App`; los roles ocultan vistas, por lo
  que **no es un control de seguridad fuerte**.

## Convenciones

- Todo texto que venga de las hojas se escapa con `escapeHTML()` antes de inyectarse en el DOM.
- No cambiar los `id`/`gid` de las hojas ni los nombres canónicos de columna sin revisar el parseo.
- Al agregar un campo nuevo: parsearlo en `parseAllData`/`parseTransporteData`, mostrarlo en la
  tarjeta y sumarlo al buscador correspondiente.
- Probar siempre con datos reales: la app no tiene tests automatizados.

## Documentación interna (no versionada)

`MAPEO-APP.md` (mapeo técnico de la PWA), `MAPEO-TIDYWORK.md` y `RECUERDAME.md` (bitácora de
integraciones) están en `.gitignore` porque contienen detalles internos y credenciales.

## Cambios recientes

- `3f8a068` — Tarjetas de orden con sub-estado, tipo de compra, fecha de inicio, fecha de última
  modificación y marca/ST; limpieza de código muerto (`Nombre del Equipo`, `Origen`/`Destino` de
  transporte); escape del texto libre de ADICIONALES; caché PWA a `v69`.
- `d3589c6` — Editar talleres y agregar marcas desde la app.
- `3b58c94` — Separar «Conectar Drive» del alta de talleres.
