# Mapeo de la APP — Portal de Soporte Dismac (PWA)

**Alcance:** `C:\Users\jabustos\Desktop\APP y N8N\App`
**Excluido a pedido:** `dismac-extension\` (extensión Chrome MV3 "Dismac Assist" — ya documentada en `MAPEO-TIDYWORK.md` y `RECUERDAME.md`).
**Base del mapeo:** rama `main`, commit `0353375` (ahead 1 de `origin/main`), fecha 2026-10-08.

---

## 1. Qué es

Aplicación web **mobile-first** (una sola página, sin framework ni build) usada por el equipo de soporte técnico de **Dismac** para:

- consultar la **red de talleres** autorizados por región (llamar / WhatsApp / mapa),
- seguir **órdenes de servicio (ODT)** por región con filtros, paginación y tarjetas expandibles,
- detectar **órdenes estancadas** (última modificación y alertas SLA),
- ver **reportes, KPIs, 5 gráficas y exportar CSV/PDF**,
- un **dashboard ejecutivo** y las **encuestas NPS** por regional (solo admin).

Es una **PWA instalable** (manifest + service worker) que corre en el navegador y **no tiene backend propio**: todos los datos vienen de **Google Sheets publicado** (endpoint gviz CSV) y Firebase está cargado pero sin uso efectivo (ver §12–15).

---

## 2. Inventario de archivos (sin la extensión)

| Archivo | Tamaño | Líneas | Rol |
|---|---:|---:|---|
| `index.html` | 39.968 B | 558 | Shell único: head, CDNs, 8 vistas (`<main>`), nav inferior, overlay de login, registro del SW. |
| `app.js` | 171.097 B | 3.108 | **Toda** la lógica: fetch a Sheets, parseo, sesión, navegación, render de cada vista, SLA, gráficas, exportaciones. |
| `style.css` | 16.460 B | 787 | Sistema de diseño (variables `:root`), tarjetas, acordeones, buscadores, nav, 2 media queries (768px, 1024px). |
| `sw.js` | 4.254 B | 118 | Service worker: caché PWA (`dismac-app-v60`) + handler FCM de fondo. |
| `manifest.json` | 827 B | 33 | PWA: nombre, `start_url ./index.html`, `display standalone`, `portrait`, 3 iconos. |
| `firebase-config.js` | 402 B | 10 | Config Firebase (módulo ESM) que consume el `<script type="module">` de `index.html`. |
| `firebase-messaging-sw.js` | 1.125 B | 28 | **Legado**: SW de FCM que ya **no se registra** desde ninguna parte. |
| `stitch-config.js` | 299 B | 7 | Token/endpoint "Google Stitch" en texto plano. |
| `stitch-service.js` | 2.838 B | 71 | Servicio que "unifica tokens de diseño"; en realidad **simulado** (ver §15.6). |
| `RECUERDAME.md` | 13.837 B | 209 | Bitácora viva del proyecto (n8n, extensión, pendientes). Actualmente **modificado sin commitear**. |
| `MAPEO-TIDYWORK.md` | 31.346 B | — | Mapeo de la API de TidyWork (pertenece a la extensión → fuera de alcance). |
| `presentacion_app.md` | 4.146 B | 57 | Resumen funcional/stack (desactualizado en detalles: menciona WhatsApp y alertas que hoy son otras). |
| `DASHBOARD_CAMBIOS.md` | 5.162 B | 191 | Histórico del rediseño del dashboard ("Versión 3.0, marzo 2026"). |
| `walkthrough.md` | 1.776 B | 32 | Histórico de mejoras de UI (botones duales, buscadores). |
| `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, `apple-touch-icon.png` | — | — | Iconos PWA. |
| `icono-servicio-tecnico.png` (3,5 MB), `mapa-talleres.png` (6,8 MB), `icono para botones.png` | — | — | Imágenes usadas en las tarjetas del dashboard y en el caché del SW. |
| `.agents\rules\escalamientos.md` | 455 B | 8 | Regla de negocio de escalamientos (no la ejecuta el código, ver §15.3). |
| `.opencode\` | — | — | Config de subagentes de opencode (dev, **untracked**). |
| `exec-72.json` (28,6 KB) | — | — | Volcado temporal de n8n, **untracked** y ajeno a la app. |
| `UsersjabustosAppDataLocalTempopencodeexec388-raw.txt` (13,8 KB) | — | — | Residuo con nombre de ruta corrupto, **untracked**. |

**Archivos rastreados por git (21):** los listados arriba salvo `.agents/`, `.opencode/`, `exec-72.json` y el `.txt` residual.

---

## 3. Dependencias externas (todas por CDN, sin integrity)

Cargadas en `index.html:15-35`:

| Librería | Versión | Uso real |
|---|---|---|
| Google Fonts **Outfit** | — | Tipografía base (`--font-main`). |
| **Bootstrap Icons** | 1.11.1 | Toda la iconografía (`bi-*`). |
| **firebase-app / firestore / messaging** | 8.10.1 | Se inicializan (`index.html:21-27`); Firestore y Messaging **no se usan** en `app.js`. |
| **PapaParse** | 5.4.1 | Parseo CSV de Sheets y `Papa.unparse` para el CSV de exportación. |
| **Chart.js** | 4.4.1 | 5 gráficas de Reportes + 1 del Ejecutivo. |
| **jsPDF** | 2.5.1 | Exportación PDF. |
| **jsPDF-AutoTable** | 3.8.2 | Tabla del PDF. |

Cache-busting por querystring: `style.css?v=19` (`index.html:17`) y `app.js?v=58` (`index.html:546`).

**Ningún** `<script>` ni `<link>` externo lleva `integrity`/`crossorigin` (SRI ausente en los 8 recursos de CDN).

---

## 4. Secuencia de arranque

1. `index.html:21-31` inicializa Firebase (ESM) y `StitchService.init()` (aplica tokens a `:root`).
2. `app.js:342` → `checkSessionOnLoad()` (top-level, al final del `<body>`): si `localStorage.dismatec_session !== 'true'` muestra `#login-overlay` (`display:flex`).
3. `app.js:380` `DOMContentLoaded`:
   - cablea login/logout (`383-443`),
   - cachea referencias a las 8 vistas y elementos de búsqueda (`445-462`),
   - `setupClearSearch()` para los 3 buscadores (`465-485`),
   - `await syncSessionUser()` (`489`) refresca rol/regional desde la hoja `Usuarios_App`,
   - muestra/oculta todo lo `.admin-only` y `#admin-encuesta-card` (`491-493`),
   - `await loadAllData()` (`496`) y `renderKPIs()` (`498`),
   - crea los buscadores con `debounce(300 ms)` (`508-521`, `523-...`),
   - delega **todos** los `[data-action]` a `handleNavigation()` (`831-838`),
   - cablea botones "volver" (`841-899`), exportaciones (`901-902`) y el logo (`904-907`),
   - al final crea el botón flotante "scroll to top" (`3068-3107`).
4. `index.html:547-555` registra `./sw.js` en `window.load`.

---

## 5. Fuentes de datos (Google Sheets)

`fetchGoogleSheet(id, sheet)` (`app.js:43-65`) arma:

```
https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv&sheet={sheet}
```

y parsea con `Papa.parse(csvText, {header:true, skipEmptyLines:true})`. **No hay caché, reintentos ni timeout.**

### 5.1 Configuración (`app.js:1-28`)

| Clave | Documento (id) | Hoja | Obligatoria |
|---|---|---|---|
| `talleres` | `1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I` | `RED DE TALLERES` | Sí (si falla, `loadAllData` cae al catch global) |
| `seguimiento` | `1CG6jiQEjqU4FePm94Y2wPSRs6GaI5UIVuI5H4AkUNX0` | `REPORTE GLOBAL` | Sí |
| `adicionales` | *(mismo doc)* | `REPORTE GLOBAL ADICIONALES` | No → `[]` |
| `encuesta` | *(mismo doc)* | `nps por regional` | No → `[]` |
| `transporte` | *(mismo doc)* | `TRANSPORTE` | No → `[]` |
| `USERS_SHEET_CONFIG` | *(mismo doc)* | `Usuarios_App` | Para login y `syncSessionUser` |

`loadAllData()` (`app.js:3025-3065`) carga las 5 hojas con `Promise.all`; los tres opcionales llevan `.catch(() => [])` con `console.warn`. Si talleres o seguimiento fallan, se muestra la barra `#sync-status` ("Fallo de conexión", `3062-3063`) y **la app queda vacía sin mensaje en pantalla**.

### 5.2 Columnas de `REPORTE GLOBAL` usadas por el código

`Número de orden de trabajo`, `Referencia`, `Nro de orden de trabajo (Marca)`, `Cuenta: Nombre de la cuenta`, `Producto ST`, `Nombre del Equipo`, `Tipo de Servicio`, `Tipificación`*, `¿Qué servicio técnico ?` (taller/ST), `Territorio de servicio: Nombre`, `Estado`, `Sub_estado`, `Fecha de compra`, `Fecha de inicio`, `Fecha de ingreso a la marca`, `Fecha de la última modificación`, `Tiempo desde apertura (Días)`.

### 5.3 Columnas de `REPORTE GLOBAL ADICIONALES` (`app.js:246-278`)

Se indexan por `Referencia` y se cruzan con las órdenes, agregando: `adicTelefono`, `adicCuenta`, `adicTecnico`, `adicDetalleFalla`, `adicDetalleSolucion`, `adicObservaciones`, `adicComentarios`, `adicFechaCita`, `adicEstadoCita`, `adicSubEstadoCita` + bandera `adicionalesEnriched`. Si la hoja falla, la app sigue sin esos campos.

### 5.4 Columnas de `nps por regional` (usadas en §9.9)

`NPS Status` (Promoter/Passive/Detractor), `NPS Q1`, `Tecnico`, `2DO CALCULO`, `SERVICIOS`, `Marca`, `Modelo`, `Referencia`, `Territorio de servicio: Nombre`, `Ciudad WO`, `Activo: Nombre de activo`, `Tipo de Servicio`, `Número de orden de trabajo`, `Numero`, `Tipificación`, `V2_GE_QF`, `V2_GE_Q2`.

### 5.5 Columnas de `TRANSPORTE`

`parseTransporteData` (`app.js:285-331`) acepta múltiples alias por campo y **normaliza a los nombres canónicos del REPORTE GLOBAL**, marcando `esTransporte: true`; el estado por defecto es `En Traslado` y el ODT por defecto `TR-S/N`. Las órdenes de transporte **se concatenan** a `appOrdersData` (`3049`), por lo que **entran en KPIs, reportes gráficas y exportaciones**, y se distinguen con el chip "Todas / Servicio Técnico / Transporte" (`renderTipoOrdenFiltro`, `app.js:1120-1159`).

### 5.6 Hoja de talleres (`RED DE TALLERES`)

Columnas: `CIUDAD`, `TALLER`, `MARCA`, `CONTACTO`, `UBICACIÓN POR GPS`. Detalles de parseo (`app.js:196-243`):
- la ciudad se **arrastra hacia abajo** (celdas combinadas) con `currentCity`;
- si falta contacto, se busca cualquier columna que contenga CONTACTO/TEL/CEL;
- **teléfonos hardcodeados**: `ELECTRONICA DIGITAL JKA → "60263531 - 60264988"` (`221-223`) y `FRIO GAS → "69308611 - 75501753"` (`225-227`);
- se descartan filas sin `TALLER`.

---

## 6. Modelo de datos en memoria (`app.js:367-375`)

| Variable | Contenido |
|---|---|
| `appWorkshopData` | Talleres normalizados (`CIUDAD`, `TALLER`, `MARCA`, `CONTACTO`, `UBICACION`). |
| `appOrdersData` | Órdenes de servicio **+ transporte** (`loadAllData:3049`). |
| `appTransporteData` | Subconjunto de transporte (marcadas `esTransporte`). |
| `appEncuestaData` | Encuestas NPS crudas. |
| `tipoFiltroOrdenes` | `todas` \| `servicio` \| `transporte`. |
| `estadosCurrentPage` / `estadosCurrentRegion` / `estadosCurrentOrdenes` / `estadosCurrentOpciones` | Estado de paginación y de la lista de ODT. |

Dentro de `DOMContentLoaded` hay además: `currentRegionTalleres`, `filteredTalleres`, `currentRegionOrdenes`, `filteredOrdenes`, `ultimaModFiltro`, `escFiltro`, `reporteCharts`, `reporteSelectsInit`, `ejecutivoCharts`.

---

## 7. Sesión, roles y permisos

- **Login** (`app.js:383-425`): descarga `Usuarios_App` y compara en el cliente `u.Usuario === user && u.Contraseña === pass`; si coincide guarda la sesión y hace `location.reload()`.
- **Claves** (`localStorage`): `dismatec_session='true'`, `usuario_actual`, `usuario_rol`, `usuario_regional`.
- **`syncSessionUser()`** (`349-365`): para sesiones antiguas, re-consulta la hoja y refresca `usuario_rol` / `usuario_regional`.
- **`isAdmin()`** (`344-347`): rol `admin` o `administrador` (case-insensitive). Controla `.admin-only`, la tarjeta NPS, Reportes, Última Modificación y Escalamientos.
- **Rol `regional`**: filtra datos por `usuario_regional` en `renderKPIs` (`627-631`), `renderOrdenes` (`1311-1315`) y `dataFiltradaPorRol` (`1785-1797`). Tarija y Sucre además incluyen `Municipios` (`1790-1791`).
- **Logout** (`431-443`): borra las 4 claves y recarga.

> El control de acceso es **solo de interfaz**: las claves y los IDs de las hojas están en el código, y la hoja `Usuarios_App` se lee con el endpoint público.

---

## 8. Navegación y vistas

`showView(view)` (`app.js:3006-3023`) oculta todos los `.main-content` y muestra uno; al volver al dashboard limpia la búsqueda global. `handleNavigation(action)` (`909-986`) es un `switch` sin `default`, alimentado por delegación de `[data-action]`.

| `data-action` | Vista destino (`id`) | Función | Botón en `index.html` |
|---|---|---|---|
| `go-home` | `view-dashboard` | `showView` | nav inferior `523-527` |
| `open-red-talleres` | `view-red-talleres` | `showView` | dashboard `126` |
| `open-estados-servicio` | `view-estados-menu` | `showView` | dashboard `139` |
| `view-ultima-modificacion` | `view-estados-servicio` | `showUltimaModificacion()` | dashboard `154` (admin) |
| `view-escalamientos` | `view-estados-servicio` | `showEscalamientos()` | dashboard `168` (admin) |
| `view-encuesta` | `view-encuesta` | `showEncuesta()` | dashboard `182` (admin) |
| `view-reportes` | `view-reportes` | `showReportes()` | menú ODT `334` (admin) |
| `view-ejecutivo` | `view-ejecutivo` | `showEjecutivo()` | **sin botón** (código muerto en UI) |
| `view-protocolo` | `view-details` | `showProtocol()` | red talleres `312`, FAQ `291` |
| `view-tarija` / `view-sucre` / `view-santacruz` | `view-details` | `showRegionTalleres()` | `308-310` |
| `view-lapaz` / `view-cochabamba` | `view-details` | `showRegionTalleres()` | **sin botón** (muerto) |
| `view-estados-{regionales,tarija,sucre,santacruz,municipios,lapaz,cochabamba,oruro,beni,potosi}` | `view-estados-servicio` | `showRegionOrdenes()` | `322-331` |

Vistas declaradas en `index.html`: `view-dashboard` (104), `view-red-talleres` (300), `view-estados-menu` (316), `view-estados-servicio` (348), `view-details` (373), `view-reportes` (389), `view-encuesta` (502), `view-ejecutivo` (510).

---

## 9. Detalle funcional por vista

### 9.1 Dashboard (`view-dashboard`, `index.html:104-298`)

- **Buscador global** (`#global-search-input`): filtra simultáneamente **talleres y órdenes** sobre 14 campos (`app.js:542-555`) y pinta resultados en `#global-search-results` (`renderGlobalSearchResults`, `690-818`). Al hacer clic en una orden llama a `window.handleGlobalOrderClick(odt)` (`821-828`) y reusa `renderOrdenes`.
- **4 KPIs** (`renderKPIs`, `618-688`): Órdenes activas, Estancadas, Talleres, Regiones con órdenes (+ 2 contadores dentro de las tarjetas: `#contador-ultima-mod` con ≥4 días sin modificar y `#contador-escalamientos`).
- **Zona de Cobertura** (`index.html:248-267`): enlace a `dismac.com.bo/servicios/zona-de-cobertura.html`.
- **Contacto Rápido** (`270-282`): `https://wa.me/59175010500` y `tel:80010200`.
- **FAQ** (`285-297`): enlace al Protocolo de recepción.

**Definiciones:** *activa* = estado que no contiene `cancelado/error/entregado/cerrado`; *estancada* = `≥4` días desde la última modificación **o** `≥8` días desde apertura (`633-637`).

### 9.2 Red de Talleres (`view-details` con `#view-content`)

`showRegionTalleres(region)` (`988-997`) filtra `CIUDAD === región` (comparación exacta en mayúsculas) y `renderTalleres()` (`999-1091`) pinta tarjetas con botones de **Llamar** (`tel:`), **WhatsApp** (`wa.me`, genera mensaje) y **mapa** (Google Maps con `UBICACION`). Buscador regional por taller/marca/ciudad/contacto (`app.js:510-521`, `debounce 300 ms`).

### 9.3 Estados de Servicio (`view-estados-servicio`)

- `showRegionOrdenes(region)` (`1161-1182`): calcula la base con `isOrderInRegion`, muestra el chip Todas/Servicio/Transporte, limpia el buscador y **reinicia la página a 1**.
- `renderOrdenes(region, ordenes, opciones)` (`1289-1611`):
  - excluye estados `cancelado/error/entregado/cerrado` (y `completado` salvo `opciones.incluirCompletado`);
  - filtra por rol regional;
  - ordena por días de apertura desc (o por última modificación asc en la vista de última modificación);
  - **paginación de 10** por página (`ORDENES_POR_PAGINA`, `1346`) con `renderEstadosPagination` (`1545-1611`);
  - en cada tarjeta: badge semáforo de días sin modificar (solo en vista de última modificación, `1402-1408`), búsqueda del taller en `appWorkshopData` por nombre/marca (`1363-1388`) para mostrar sus contactos, bloque de detalle expandible con ~10 campos y **botones de WhatsApp/Llamar con mensaje prearmado** (`1393-1397`, `slaContactoHtml` en `2078-2150`).
- Buscador de ODT por ODT/cliente/producto/… (`app.js:523-...`).
- Cuando no se identifica el taller de la orden, la tarjeta ofrece **"Enviar consulta general por WA"** con `https://wa.me/?text=` (`1423`, `1442`), es decir sin destinatario: el usuario debe elegir el chat.

### 9.4 Última Modificación

`showUltimaModificacion()` (`1208-1232`) + `renderUltimaModFiltro()` (`1184-1207`): lista las órdenes con **más días sin cambios primero**, con chips por territorio (`todas`, `Regionales`, cada territorio) y badge semáforo (≥4 rojo, ≥2 ámbar, resto verde).

### 9.5 Escalamientos

`showEscalamientos()` (`1253-1287`) + `renderEscFiltro()` (`1233-1252`): órdenes donde `diasEntre('Fecha de compra', 'Fecha de inicio') <= 30`, es decir candidatas a **cambio de equipo** (ver la regla documentada en §10.4 y la discrepancia en §15.3).

### 9.6 Protocolo de recepción

`showProtocol()` (`1613-1725`) inyecta en `view-details` una guía de 5 pasos en acordeones (Recepción/validación → Documentación → Comunicación → Logística → Cierre y entrega).

### 9.7 Reportes y Gráficas (`view-reportes`, admin)

`showReportes()` (`2366-2375`) → `initReporteSelects()` + `fillReporteSelects()` + `renderReportes()` (`2359-2364`).

- **Filtros** (`initReporteSelects` `1863-1901`, `getReportesData` `1799-1861`): buscador libre, Región (incluye `Regionales` y, con búsqueda activa, Tarija/Sucre suman Municipios), Estado, Marca, Taller/ST y rango de fechas sobre *última modificación* (incluye el día "hasta").
- **6 KPIs** (`renderReportesSummary` `1957-1997`): totales, activas, estancadas, en garantía, promedio de días abiertas y regiones.
- **Alertas SLA** (`renderSlaAlertas` `2171-2261`): umbrales **editables en pantalla** (default `4` días sin cambios y `8` desde creación, `2175-2176`); excluye estados finales; etiqueta `CRÍTICA` cuando el máximo ≥15 días; las atendidas se guardan en `localStorage.sla_atendidas` y se pueden **restaurar** (`getSlaAtendidas`/`slaMarcarAtendida`/`slaRestaurar`, `1902-1924`).
- **5 gráficas** (`renderReportesCharts` `2269-2357`, destruidas con `destroyReporteCharts` antes de repintar): línea de ingresadas últimos 30 días, barras por región, doughnut por estado, barras horizontales Top 12 marcas, barras horizontales promedio de días por estado. Paleta `CHART_PALETTE` (`1731`).
- **Exportaciones**: `exportReportesCSV` (`2831-2864`) con 13 columnas, `Papa.unparse` y BOM UTF-8; `exportReportesPDF` (`2866-3004`) con jsPDF A4 horizontal, banda roja corporativa, wordmark "dis/mac", resumen (Total/Activas/Estancadas/En garantía), usuario y fecha `es-BO`, tabla auto-table de 10 columnas, pie "CONFIDENCIAL — USO INTERNO" (`2998`) y paginación "Página X de Y" (`3000`).

### 9.8 Dashboard Ejecutivo

`renderEjecutivo()` (`2415-2550`): KPIs (activas, cerradas, estancadas, en garantía), comparativa mes actual vs anterior por `Fecha de ingreso a la marca` con variación %, tendencia de 30 días, **Top 5 talleres con más atraso** (barras) y **promedio de días por región**. Sin botón que lo abra hoy (`view-ejecutivo` solo se alcanza por `data-action` inexistente en el HTML).

### 9.9 Encuestas NPS (admin)

`showEncuesta()` (`2606-2665`) + `renderEncuestaView/Resumen/List` (`2667-...`):
- clasificación por `NPS Status` → `Promoter`/`Passive`/`Detractor` (`2567-2572`);
- **NPS = %promotores − %detractores** (`getEncuestaStats`, `2553-2565`);
- filtros por regional, clasificación y buscador de 13 campos (`encuestaFiltrada`, `2586-2604`);
- región = `Territorio de servicio: Nombre` o `Ciudad WO` (`2574-2576`); tarjetas con color/emoji por clasificación (`encuestaColor`, `2578-2584`).

---

## 10. Reglas de negocio

1. **Estados finales excluidos**: `cancelado`, `error`, `entregado`, `cerrado` (comparación por *contiene*, normalizando acentos). `completado` se excluye además en la lista de ODT.
2. **Estancamiento**: `≥4` días sin modificación **o** `≥8` días desde apertura (constantes repetidas en 4 sitios: `633-637`, `1968-1972`, `2428-2432`, `2921-2925`).
3. **Regiones** (`isOrderInRegion`, `1092-1118`):
   - `Municipios` = 14 municipios de SCZ: montero, la guardia, el torno, cotoca, satelite, camiri, san julian, guabira, warnes, pailon, samaipata, buena vista, la angostura, yapacani;
   - `Regionales` = todo lo que no sea santa cruz / el alto / cochabamba / la paz / achocalla ni municipio;
   - `Santa Cruz` excluye municipios;
   - `Tarija` incluye tarija, villamontes y yacuiba;
   - el resto es una coincidencia de texto.
4. **Escalamiento** (`.agents\rules\escalamientos.md`): cambio de equipo si la *Fecha de compra* no supera los 30 días respecto a la *Fecha de inicio* **y** existe texto en "Detalle de Falla" (ADICIONALES). El código solo evalúa la primera condición.
5. **Garantía** (`diasGarantia`, `130-145`): default **365** días; tabla por marca vacía (`GARANTIA_DIAS_POR_MARCA = {}`); **línea blanca y Sony Bravia = 730** días con keywords y exclusiones (`cabello`, `pelo`, `oster`). Estados: `en_garantia`, `por_vencer` (≤30 días), `vencida`, `sin_datos` (`getWarrantyInfo`, `147-159`).
6. **Fechas** (`parseFecha`, `75-87`): acepta `dd/mm/yyyy`, `dd-mm-yyyy`, `yyyy-mm-dd` y `Date()` como último recurso; sin hora/zona.
7. **Marca / ST** (`marcaDeOrden`, `1774-1778`): usa `¿Qué servicio técnico ?` si tiene texto; si no, deduce la marca del `Producto ST` contra `MARCAS_CONOCIDAS` (≈130 marcas, `1733-1754`).
8. **Paginación**: 10 ODT por página.

---

## 11. Persistencia (`localStorage`)

| Clave | Escrita en | Uso |
|---|---|---|
| `dismatec_session` | `404` | Indica sesión iniciada (bloquea el overlay). |
| `usuario_actual` | `405` | Nombre mostrado en el header y en el PDF. |
| `usuario_rol` | `406` | `admin` / `administrador` / `regional` / otros. |
| `usuario_regional` | `407` | Filtro regional (Tarija, Sucre, …). |
| `sla_atendidas` | `1914`, `1921` | Array JSON de ODT marcadas como atendidas. |

No se usa `sessionStorage`, IndexedDB ni cookies.

---

## 12. PWA y Firebase

**`manifest.json`**: `Soporte Técnico Dismac` / `Dismac ST`, `start_url ./index.html`, `scope ./`, `display standalone`, `orientation portrait`, `background_color #ffffff`, `theme_color #E31837`, iconos 192/512/512-maskable.

**`sw.js`** (registrado en `index.html:547-555`):
- `CACHE_VERSION = 'dismac-app-v60'`; precachea el shell, los 6 iconos/imágenes, `manifest.json` y **7 recursos CDN** (`5-24`).
- `install`: `cache.addAll(PRECACHE_URLS)` + `skipWaiting`; `activate`: borra cachés con otro nombre + `clients.claim`.
- `fetch`: **network-first** para navegación (fallback a caché/`index.html`) y **stale-while-revalidate** para same-origin/script/style/font/image.
- Incluye `importScripts` de Firebase 8.10.1 y `messaging.onBackgroundMessage` (`27-53`), con la config Firebase **duplicada** respecto a `firebase-config.js`.
- No hay `notificationclick` (tocar una notificación no abre la app) ni fallback offline dedicado (solo `./index.html`). El `install` usa `cache.addAll` con 7 URLs de CDN: al ser atómico, si una sola falla el SW **no se activa** y la PWA queda sin caché.

**Firebase**: `index.html:18-27` inicializa `firebase-app`, `firestore` y `messaging` con la config del proyecto `talleres-tecnicos-autorizados`. En `app.js` **no hay** ninguna llamada a Firestore, `getToken`, `requestPermission` ni `onMessage`; `firebase-messaging-sw.js` **no está registrado** en ninguna parte. Es decir: **la mensajería push quedó inerte** tras la limpieza del commit `35852d6`.

---

## 13. Integraciones externas efectivas

| Integración | Dónde | Detalle |
|---|---|---|
| Google Sheets (gviz CSV) | `app.js:43-65` | Fuente única de datos (5 hojas). |
| WhatsApp | `app.js:1393-1497`, `2078-2150`, `index.html:273` | Mensajes prearmados con cliente, ODT, referencia, producto y N° de orden de marca. |
| Telefonía | tarjetas de taller y `index.html:277` | Enlaces `tel:`. |
| Google Maps | `renderTalleres` | Búsqueda por `UBICACION` del taller. |
| Chart.js | `2269-2357`, `2533-2548` | 6 gráficas. |
| jsPDF + AutoTable | `2866-3004` | Reporte PDF corporativo. |
| Firebase | `index.html`, `sw.js` | Solo inicialización; sin uso funcional. |
| "Google Stitch" | `stitch-service.js` | Simulado (ver §15.6). |

---

## 14. Herramientas de desarrollo presentes (fuera del runtime)

- `.opencode\agent\lector-sheets.md`: subagente "Lector de Sheets via n8n" (31 líneas + config).
- `.agents\rules\escalamientos.md`: regla de escalamientos.
- `exec-72.json`, `UsersjabustosAppDataLocalTempopencodeexec388-raw.txt`: volcados temporales de n8n/opencode, sin relación con la app.
- `RECUERDAME.md`: bitácora; mezcla el portal con la extensión y con el bot de Telegram/n8n.

---

## 15. Hallazgos, riesgos y deuda técnica

1. **Credenciales expuestas / acceso solo cosmético.** `Usuarios_App` se descarga con el endpoint público y la contraseña se compara en el navegador (`app.js:400-401`); cualquiera con los IDs (`app.js:1-28`) puede leer la hoja, y `localStorage.dismatec_session='true'` fabrica una sesión sin credenciales. Los "roles" solo ocultan botones.
2. **Mismatch de caché que puede servir CSS viejo.** `sw.js:8` precachea `./style.css?v=18`, pero `index.html:17` pide `style.css?v=19`; al ser URLs distintas, el SW no sirve el CSS nuevo desde caché y quedan dos entradas. `app.js?v=58` sí coincide.
3. **Regla de escalamiento incompleta.** El código (`app.js:639-642`) no exige "Detalle de Falla" (columna O de ADICIONALES), a diferencia de `.agents\rules\escalamientos.md`.
4. **Datos de Sheets inyectados sin `escapeHTML`.** `renderGlobalSearchResults` (`app.js:796-808`) interpola cliente/producto/ODT dentro de un `onclick` (`window.handleGlobalOrderClick('...')`), y `renderOrdenes` (`1499-1527`) interpola varias celdas en crudo. Un valor con `'`, `<` o `&` rompe el layout o permite inyección desde la hoja. (SLA y varios KPI sí escapan.)
5. **Duplicación de lógica.** El bloque de estados excluidos aparece **8 veces** (`619`, `779`, `1262`, `1301`, `1961`, `2178`, `2420`, `2915`) y el umbral 4/8 días 4 veces; `renderUltimaModFiltro` y `renderEscFiltro` son el mismo código con otro callback; el matching taller↔orden está reimplementado en `renderOrdenes` (`1368-1387`) y en `slaContactoHtml` (`2088-2101`) con ámbitos distintos; el HTML de las tarjetas KPI está repetido en Reportes, Ejecutivo y Encuesta con estilos inline.
6. **Integración "Stitch" simulada.** `stitch-service.js:27-54` no llama a ninguna API: resuelve tokens hardcodeados tras un `setTimeout`. Aplica `--primary`, `--primary-dark`, `--bg-card`, `--text-main`, `--border-color`, `--font-main` al `:root`, pero `stitch-config.js:2` deja un **token en texto plano** y `stitch-unified` (clase añadida al body) no tiene estilos asociados. Efecto real: nulo.
7. **Firebase inerte y config triplicada.** La misma config está en `firebase-config.js`, `firebase-messaging-sw.js:4-11` y `sw.js:30-37`; no hay permiso ni token FCM, así que **nunca llegarán notificaciones push**, aunque el SW conserve el handler.
8. **`firebase-messaging-sw.js` es código muerto** (no se registra) y `firebase-firestore.js` se carga sin usarse (peso y superficie extra).
9. **Acciones de navegación sin botón:** `view-ejecutivo`, `view-lapaz`, `view-cochabamba` (red de talleres) existen en `handleNavigation` pero no en el HTML; a la inversa no hay `default` en el switch (`985`), por lo que una acción desconocida falla en silencio.
10. **Sin manejo de errores por hoja en la UI.** Si `RED DE TALLERES` o `REPORTE GLOBAL` fallan, solo aparece una barra discreta de "Fallo de conexión" (`3062-3063`) y los KPIs quedan en 0; no hay reintento ni mensaje con causa.
11. **Sin caché local de datos ni modo offline real** para los datos (el SW no cachea las respuestas de `docs.google.com`): sin internet la app instalada muestra el shell vacío.
12. **Teléfonos hardcodeados** para JKA y FRIO GAS (`221-227`) que se desincronizan de la hoja.
13. **Residuos en la carpeta del proyecto** (`exec-72.json`, `UsersjabustosAppDataLocalTempopencodeexec388-raw.txt`) y `RECUERDAME.md` modificado sin commitear; la extensión tiene 2 archivos modificados pendientes.
14. **Sin tests, sin linter, sin build ni CI**: el "deploy" es subir los archivos a GitHub; toda la validación es manual en el navegador.
15. **Peso inicial alto**: `mapa-talleres.png` (6,8 MB) e `icono-servicio-tecnico.png` (3,5 MB) se precachean enteros sin optimizar.
16. **Dos variables CSS usadas pero nunca definidas**: `--primary-color` (`style.css:341`, `367`) y `--bg-color` (`style.css:375`). Efecto real: el icono del acordeón activo y el borde del acordeón caen a `currentColor`, y el fondo de `.accordion-content` queda transparente.
17. **Dos definiciones distintas de "escalamiento"**: `renderKPIs` (`639-642`) cuenta **todas** las órdenes con ≤30 días entre compra e inicio, sin excluir estados ni aplicar rol; `showEscalamientos` (`1262-1267`) sí excluye estados finales. El contador del dashboard y la lista pueden no coincidir.
18. **Filtros de Reportes sin rol**: `fillReporteSelects` (`1926-1930`) puebla región/estado/marca/taller desde `appOrdersData` completo, así que un usuario regional ve en los desplegables valores de todo el país.
19. **Comparación de rol sensible a mayúsculas**: `rol === 'regional'` sin normalizar en `629`, `789`, `1313` y `1789`, mientras `isAdmin` sí normaliza (`345`). Un rol guardado como `Regional` desactiva el filtrado.
20. **Matching de taller degradado en dos vistas**: en Última Modificación y Escalamientos, `cityForWorkshop = region.toUpperCase()` (`1358`) da `ÚLTIMA MODIFICACIÓN`/`ESCALAMIENTOS`, por lo que el filtro por ciudad (`1364-1365`) casi nunca coincide y el taller se resuelve por marca o por búsqueda global.
21. **Fuga potencial de otra regional**: `handleGlobalOrderClick` (`821-828`) busca la ODT en `appOrdersData` sin aplicar el filtro de rol; y en la búsqueda global el filtro regional se aplica dos veces (`594` y `786-790`).
22. **`#btn-back` decide por el texto del título** (`852-853`: compara con `'Protocolo de recepción'`): cualquier cambio de copy rompe la navegación de vuelta.
23. **Elementos muertos confirmados**: `#estados-loading` (spinner, `index.html:365`) y `#sync-status-text` (`index.html:519`) no se usan nunca desde `app.js`; `let zapiaInfoHtml = ""` (`app.js:1471`) se declara y no se usa; `GARANTIA_DIAS_POR_MARCA = {}` (`108`) hace inalcanzable su rama.
24. **Nav inferior estático**: `.nav-btn.active` está fijo en "Inicio" (`index.html:524`); nunca se actualiza al navegar.
25. **Manejo de alertas SLA por dispositivo**: `sla_atendidas` es global del navegador, no por usuario; en un equipo compartido un usuario ve como atendidas las alertas marcadas por otro, y `slaMarcarAtendida`/`slaRestaurar` re-renderizan también las 5 gráficas de Chart.js sin necesidad (`1916`, `1922`).

---

## 16. Referencias rápidas

- Funciones clave: `fetchGoogleSheet` (43), `parseAllData` (190), `parseTransporteData` (285), `checkSessionOnLoad` (333), `isAdmin` (344), `syncSessionUser` (349), `renderKPIs` (618), `renderGlobalSearchResults` (690), `handleNavigation` (909), `isOrderInRegion` (1092), `renderOrdenes` (1289), `showProtocol` (1613), `marcaDeOrden` (1774), `dataFiltradaPorRol` (1785), `getReportesData` (1799), `renderReportesSummary` (1957), `renderSlaAlertas` (2171), `renderReportesCharts` (2269), `renderEjecutivo` (2415), `getEncuestaStats` (2553), `showEncuesta` (2606), `exportReportesCSV` (2831), `exportReportesPDF` (2866), `showView` (3006), `loadAllData` (3025).
- Variables CSS base (`style.css:1-45`): `--primary #E31837`, `--primary-light #FDE8EA`, `--primary-dark #B3132B`, `--bg-main #f8fafc`, `--text-main #111111`, `--font-main 'Outfit'`.
- Breakpoints: `@media (min-width: 768px)` (`style.css:730`) y `@media (min-width: 1024px)` (`775`).
- Últimos commits relevantes: `0353375` (sync vivo de la extensión), `5e7ead5` (limpieza NPS/WhatsApp en la extensión), `5f5687b` (header no fijo, `style.css v19`), `6069ef8` (PWA instalable v57), `35852d6` (elimina Alertas Push/FCM en primer plano).

---

*Documento generado por mapeo estático del código (lectura directa de los archivos, sin ejecutar la app) y **verificado con dos pasadas independientes** sobre `app.js` y sobre el shell/PWA; los hallazgos dudosos (variables CSS no definidas, spinners muertos, `zapiaInfoHtml`, `wa.me/?text=`, pie "CONFIDENCIAL") se re-verificaron por grep contra los archivos reales antes de publicarse. No se modificó ningún archivo del proyecto original.*
