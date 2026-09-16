# 📌 RECUÉRDAME — App Soporte Técnico Dismac

Archivo de memoria del proyecto. Al empezar una sesión, leé este archivo para estar al tanto de todo.

---

## 🎯 Qué es la app

App web estática (mobile-first, estética Dismac rojo/blanco/negro) de **soporte técnico** que muestra el estado de las órdenes de trabajo, gráficas, reportes, encuestas de satisfacción (NPS) y alertas push locales.

- **Ruta local:** `C:\Users\jabustos\Desktop\APP y N8N\App\`
- **Servidor local:** `python -m http.server 8080` → `http://127.0.0.1:8080/index.html`
- **Producción (GitHub Pages):** https://jangelbsc-design.github.io/app-servicio-tecnico/
- **Repo:** `jangelbsc-design/app-servicio-tecnico` (rama `main`)
- **Historial de commits:** https://github.com/jangelbsc-design/app-servicio-tecnico/commits/main

## 🧱 Stack

- HTML + CSS + JS puro (sin frameworks). **PapaParse** para leer Google Sheets CSV, **Chart.js** para gráficas, **jsPDF + autotable** para PDF.
- `app.js` es un solo closure dentro de `DOMContentLoaded` (todo con hoisting, se pueden agregar funciones en cualquier orden).
- **Cache de versiones:** `index.html` carga `app.js?v=NN`. **Siempre subir el número de versión** al hacer cambios y pushear, si no los usuarios ven código viejo.
- GitHub Pages cachea `index.html` hasta 10 min → tras un push hay que esperar ~2 min y hacer **recarga forzada** en el teléfono para ver lo nuevo.

## 📊 Fuentes de datos

- Hoja Google: `REPORTE GLOBAL` (órdenes de trabajo) y `ENCUESTA` (NPS).
- Columnas clave: `Número de orden de trabajo`, `Estado`, `Cuenta: Nombre de la cuenta`, `Producto ST`, `Territorio de servicio: Nombre`, `Fecha de la última modificación`, `Tiempo desde apertura (Días)`, `Ciudad WO`, `NPS Status`.
- Valores reales de `Territorio de servicio: Nombre`: Beni, Cochabamba, Cotoca, El Alto, La Guardia, La Paz, Montero, Oruro, Santa Cruz, Sucre, Tarija, Villamontes.
- `Ciudad WO` (ENCUESTA): Beni, Camiri, Chapare, Chimoré, Cochabamba.
- Helpers útiles: `normalizarTexto()` (quita acentos), `dataFiltradaPorRol()` (filtra por rol regional), `isOrderInRegion(o, region)` (con casos especiales: 'Municipios', 'Regionales', 'Santa Cruz' excluye municipios), `diasDesde(fecha)`, `escapeHTML()`.

## ✅ Lo que se hizo (historial)

### 1. Limpieza previa
- Eliminado **Telegram** (bot y token de acceso — el token NO debe volver al código).
- Borrados ~26 archivos muertos/duplicados (incluida `styles.css` duplicada, quedó `style.css`).

### 2. Feature 1 — Dashboard Ejecutivo (pantalla principal al abrir)
- KPIs: órdenes abiertas, en proceso, urgentes, promedio de días.
- Gráfica de tendencia: **"Órdenes ingresadas (últimos 30 días)"** (solo "Ingresadas"; se quitó la serie "Cerradas" porque ese dato no se maneja).
- Tarjeta de satisfacción (NPS) que se muestra según rol; sincroniza el rol de usuario con la hoja.

### 3. Feature 2 — Tendencias + Reportes con PDF branding
- Gráficas de tendencia por estado/marca/regional con exportación a CSV y PDF.
- `exportReportesPDF()` con **branding Dismac**: banda roja, wordmark, tarjetas de resumen, línea de filtros, tabla con `autoTable` y pie de página paginado "CONFIDENCIAL — USO INTERNO · Página X de Y".

### 4. Feature 3 — Alertas Push configurables
- Alertas locales (Notification API) cuando una orden supera los umbrales de "Sin cambios (días)" (por defecto 4) y "Desde creación (días)" (por defecto 8).
- `checkAlertasPush(false)` se ejecuta al cargar datos (si `enabled` está activo).
- Config en `localStorage`: `alertas_config` = `{enabled, diasSinCambios, diasCreacion, region}`; `alertas_fired` = `{odt:'YYYY-MM-DD'}` (evita repetir el mismo día); `sla_atendidas` (array).
- Estados excluidos de las alertas: `cancelado`, `error`, `entregado`, `cerrado`.

### 5. Fixes de la pantalla de Alertas (versión actual, V37)
- **Botones de ancho completo apilados** (antes iban en 2 columnas y en pantallas chicas se cortaban). Nueva jerarquía de botones:
  1. **Buscar órdenes** (rojo, principal) — dispara la búsqueda.
  2. Verificar y enviar alertas ahora (negro).
  3. Solicitar permiso (gris).
  4. Probar notificación (gris).
  5. **Detener todas las notificaciones** (negro con icono rojo) — apaga `enabled`, limpia `alertas_fired` y confirma.
- **UX de filtros con botón disparador:** los filtros (región, días) NO muestran nada al cambiar; solo al presionar **Buscar órdenes** aparecen los resultados en `#alertas-resultado`. Hay un aviso: *"Los cambios en región y días se aplican al presionar Buscar órdenes."* y un placeholder inicial "Selecciona los filtros y presiona Buscar".
- Funciones: `listAlertasStancadas()` (calcula las alertas según cfg: región, umbrales, estados excluidos; ordena de mayor a menor), `renderAlertasPreview()` (resultado de Buscar), `renderAlertasResultado()` (resultado de Verificar y enviar).

### 6. Fixes de Satisfacción del Cliente (NPS)
- `encuestaFiltrada()` compartida; los filtros (regional, clasificación, búsqueda) actualizan KPIs + tarjetas "Por Regional" + lista.
- Aviso "Filtrado por: …" cuando hay filtros activos. Regiones del select construidas desde todos los datos.

### 7. Google Sheets — pestaña "última modificación" ordenada (14/08/2026)
- La pestaña **"última modificación"** (8 columnas: N° orden, Producto, Taller/ST, Contacto, Territorio, Fecha últ. modificación, Estado, Sub_estado) estaba vacía (solo encabezado). Se llenó con una fórmula en **A2** que trae las órdenes de `REPORTE GLOBAL` **ordenadas de la modificación más antigua a la más reciente**.
- **Problema clave:** `Fecha de la última modificación` (columna **H**) es **texto** `DD-MM-YYYY` (a veces con hora y sin ceros, ej. `5-8-2025`). Ordenar directo falla → la fórmula convierte cada fecha a fecha real con `DATE(VALUE(REGEXEXTRACT(...)))`.
- **IMPORTANTE para reescribirla:** la hoja está en **locale español** → los argumentos de funciones usan **`;`** y el separador de columnas dentro de `{...}` es **`\`** (NO `,`). Si se copia una versión con `,` da "Formula parse error / comprueba la sintaxis". **Pegar SIEMPRE en la barra de fórmulas `fx`** (no en la celda) para que no se corte el inicio `=LET(fechas,...)`.
- Mapeo de columnas: A=N° orden, C=Producto ST, E=Taller/ST, L=Contacto (cliente), D=Territorio, H=Fecha, N=Estado, O=Sub_estado. (Confirmar si "Contacto" debería ser otra columna.)
- Usa `LET` + `FILTER` + `SORT` + `ARRAYFORMULA`; excluye la fila de encabezado con `ROW(...)>1` y pone las órdenes sin fecha al final (`DATE(9999,12,31)`).
- **Columna I "Días sin modificación"** (14/08/2026): fórmula en **I2** que resta la fecha de H al día actual:
  `=ARRAYFORMULA(IF(F2:F="";"";IFERROR(TODAY()-DATE(VALUE(REGEXEXTRACT(TO_TEXT(F2:F);"-(\d+)$"));VALUE(REGEXEXTRACT(TO_TEXT(F2:F);"-(\d+)-"));VALUE(REGEXEXTRACT(TO_TEXT(F2:F);"^(\d+)")));"")))`
- **Formato condicional (semáforo)** en rango `A2:I`: Rojo `=$I2>=4`, Amarillo `=AND($I2>=2;$I2<4)`, Verde `=$I2<=1` (locale español → `;`). Confirmado por el usuario.
- La lógica se validó con las ~622 órdenes reales descargadas del sheet (scripts `test_sort.js`, `test_ultima_mod.js` en `Temp\opencode`).

### 8. App — botón "Última Modificación" en el menú principal (14/08/2026)
- Nueva card en el inicio (`view-dashboard`) con `data-action="view-ultima-modificacion"` → `handleNavigation` → `showUltimaModificacion()` (v39).
- Lista las órdenes **de la modificación más antigua a la más reciente** (`parseFecha('Fecha de la última modificación')` asc; sin fecha al final), respetando el filtro de rol regional y los estados excluidos (cancelado/error/entregado/cerrado).
- Cada tarjeta muestra un **badge semáforo de días sin modificación** (rojo ≥4, amarillo 2-3, verde 0-1, gris sin fecha) además de los botones Ll./WA del taller.
- Implementación: `renderOrdenes(region, ordenes, opciones)` ahora acepta `{ordenarPor:'modificacion', titulo}`; el buscador de órdenes también funciona en esta vista; el botón "Volver" regresa al inicio.
- **Filtro por regional con chips** (v40): dentro de la vista aparece una fila de chips `#modificacion-filtro` generados por `renderUltimaModFiltro()` con las opciones **"Todas"**, **"Regionales"** (agrupa todo excepto Santa Cruz/El Alto/Cochabamba/La Paz y municipios — misma lógica que `isOrderInRegion('Regionales')`) y cada territorio presente en los datos. El chip activo filtra la lista manteniendo el orden por última modificación y actualiza el título. Estado: `ultimaModFiltro` (se resetea a 'todas' al volver al dashboard). El buscador respeta el chip seleccionado.

### 9. App — íconos por criterio en las tarjetas del menú + limpieza del buscador (14/08/2026)
- Íconos de las tarjetas del inicio (se intentó primero el wordmark dis|mac® v41, luego se cambió por íconos que representan el criterio de cada botón, v42):
  - **Dashboard Ejecutivo** → velocímetro `bi-speedometer2` (tablero/gestión).
  - **Última Modificación** → el ícono es un **círculo contador** `#contador-ultima-mod` (rojo `#E31837`, número blanco bold) que muestra el total de órdenes activas con **≥4 días sin modificar** (las "rojas" del semáforo); si es 0 pasa a verde. Se calcula en `renderKPIs()` (respeta el rol regional).
  - **Satisfacción del Cliente** → silueta de perfil sin foto `bi-person-circle`.
- **Fondo gris de los íconos** `#B8B8B8` (igual que el del botón Estados de Servicio; se muestreó el PNG `icono-servicio-tecnico.png`: RGB ~184/184/184).
- **Limpieza del buscador global al volver al menú principal** (v43): en `showView()`, si la vista destino es `viewDashboard`, se vacía `#global-search-input`, se ocultan los resultados y se restaura el dashboard.
- Colores de marca: rojo `#E31837`, blanco, negro `#111`, gris `#B8B8B8`.

## 🧩 Proyecto TidyWork (integración / mapeo de API)

Proyecto paralelo: **entender la API de TidyWork** (`https://tidywork.dismac.com.bo`) para (a) que la extensión/app consulten datos directo (JSON) en vez de scrapear HTML, (b) alimentar la app Dismac con info real y en vivo, sin deslogueos.

- **Documento vivo del mapeo:** `C:\Users\jabustos\Desktop\APP y N8N\App\MAPEO-TIDYWORK.md` (388 líneas, actualizado 29/08/2026). **Siempre actualizarlo** al descubrir endpoints.
- **Extensión (internal, MV3 side_panel):** `C:\Users\jabustos\Desktop\APP y N8N\App\dismac-extension\` (service-worker + content script `content/tidywork.js` + sidepanel). ZIP de distribución `dismac-assist-1.0.0.zip` con `GUIA-INSTALACION.md` (instalar descomprimida en modo desarrollador).
- **Páginas guardadas localmente (Ctrl+S "Página web, completa"):**
  - `C:\Users\jabustos\Desktop\Tidy Work _ Orden de Trabajo.html` + `..._files\` (WorkOrder; contiene Manage.js 122 KB, Layout.js, Entities.js, Enum.js, fcm.js, etc. .descarga)
  - `C:\Users\jabustos\Desktop\Tidy Work _ Citas.html` + `..._files\` (Appointment; contiene Index(1).js)

### 🔑 Cómo funcionan las llamadas de TidyWork
- `Tools.SendPost/SendGet(url, data)` → `Fetch().form()`: headers `X-XSRF-TOKEN` (de `meta[name="x-xsrf-token"]`), `Tidy-Fetch: true`, `Content-Type: application/x-www-form-urlencoded`; acepta `200/201`. Respuestas: `{ Success, Data, Errors, ErrorsAll }`.
- **Causa raíz de los deslogueos:** el server NO manda 401 HTTP; manda `200` con `Errors:[{ErrorCode:401}]`. La app abre popup "Inicia Sesión" (`GET /Account/GetUrlAuthentication`), espera `TIDYSESSIONBAR.ok` (postMessage), y si se cierra → `Tools.Redirect('/')` = deslogueo. Gestionar sesión por request evita entrar a ese flujo.

### 📅 Aprendido el 29/08/2026 (hoy)
1. **Sistema de notificaciones push (FCM):** `POST /Home/RegisterDevice {token}`, `GET /Home/GetFirebaseConfig` (ApiKey, VapidKey...), `GET /Home/GetNotifications`, `POST /Home/ReadNotification {id}`. El push llega con `body = JSON { Id, Body, Icon, Link }`. Service worker `firebase-messaging-sw.js` se registra con placeholders.
2. **Página de Citas `/Appointment`** (JS `Index(1).js`) — endpoints: `POST /Appointment/Filter { filter }` (tabla DataTable), `POST /Appointment/SaveFilter`, `GET /Appointment/GetTerritorys {territoryId}`, `GET /Appointment/GetTechnicalsByTerritories {TerritoriesId}`. Filtro: `{ TerritoryId, WokTypeIds, Technicals, StatusIds, StartDate:'YYYY/MM/DD', EndDate, Coment:'NONE' }`. Estados cita (`EnumAppointmentStatus`): 1=NINGUNO/PENDIENTE, 2=PROGRAMADO, 3=ENVIADO, 4=EN_CAMINO, 5=EN_CURSO, 6=NO_SE_PUEDE_COMPLETAR, 7=COMPLETADO, 8=CANCELADO, 9=ERROR.
3. **"Trampa" de paginación en citas:** la UI muestra máx. 100 registros/página, pero la API `/Appointment/Filter` acepta `StatusIds` → se pueden pedir solo no trabajadas (`[3,4,5]` o `[2,3,4,5]`) y todas las páginas. No hay límite real por API.
4. **WorkOrder (~45 endpoints)** ya mapeados desde el 27/08: listado `POST /WorkOrder/Get`, detalle `POST /WorkOrder/GetAppointments`, guardar `POST /WorkOrder/Create|Update` con `{ eWorkOrder }`, agenda `GetSchedule`, `AddAppointment`, `GetSkill`, citas especiales `GetViewCreateSchedule`, `CreateScheduleSpecial`. Catálogos `GetListSubStatus`, etc.
5. **Módulo /Control (mapa + calendario de derivación)** mapeado (29/08, página `Tidy Work _ Calendario.html`):
   - `GET /Control/GetEvents { TerritoryId, TypesId, StatusId, StartDate, EndDate, TechnicalsId }` → **una llamada** carga calendario + mapa + tabla + marcadores + polígonos + técnicos (rango `StartDate..StartDate+7dias`).
   - 🔥 `POST /Appointment/SendAppointmentTechnical { Id, StatusId, StatusName, TechnicalReference }` = **derivar/enviar al técnico (ENVIADO)** — el flujo clave que el usuario usa.
   - `POST /Control/GetDetailById { id }` (modal detalle), `POST /Control/RescheduleAppointment { AppointmentId, StartDate, EndDate, TechnicalId }` (drag & drop), `POST /Control/GetTechnicals { territoryId }`, `POST /WorkOrder/GetTerritorys { territoryId }`, `POST /Control/SaveFilter`, `POST /Control/AbsenceTecnical` / `CreateListAbsences { eAbsences }` (ausencias).
   - Librerías de esa vista: **Leaflet** (mapa, `Map.js` + `leaflet-fullscreen` + `leaflet-providers`) y **event-calendar** (timeline con drag & drop).

### For derivar (flujo confirmado):
`GetDetailById` → modal → usuario elige estado + `TechnicalReference` → `SendAppointmentTechnical` → toast "Estado actualizado" → recarga.
5. **Módulo /Control (mapa + calendario de derivación)** ma

### ⏳ Pendiente del mapeo TidyWork
- ~~Página de mapa/derivación~~ ✅ **HECHO** (módulo `/Control`, `Tidy Work _ Calendario.html`).
- **`/Appointment/Manage/{id}`** (detalle/edición de cita): su `Appointment/Manage.js` no se guardó aún (igual que la de WorkOrder cuando faltaba). Mismo paso: Ctrl+S en esa vista.
- **`/Control`** es el mismo que la página de derivación (ya mapeado). Falta revisar si hay una vista de Control separada del mapa.
- **Verificar en vivo los endpoints mapeados** con la sesión real (probarlos desde la pestaña de Tidy para confirmar datos/formatos).

### 🚀 Fusión TidyWork ↔ App Dismac (análisis en curso)
Objetivo: la app Dismac muestra/a iguala datos de TidyWork en vivo, sin scraping ni deslogueos. Opciones de menor a mayor ambición (ver detalle + decisiones en `MAPEO-TIDYWORK.md` / discusión):
1. **O1 — Mini-dashboard en vivo** (rápido): extension consume `POST /Appointment/Filter` con `StatusIds=[3,4,5]` y muestra en sidepanel las citas en curso/camino; la app consulta las mismas con la sesión activa.
2. **O2 — Fusión por sesión/auth**: la app guarda cookies de sesión de TidyWork (login 1 vez) y consulta JSON directo (`/WorkOrder/Get`, `/Appointment/Filter`, `/WorkOrder/GetAppointments`) desde un backend/proxy local para evitar CORS y el antiforgery.
3. **O3 — Mini-Tidy mobile funcional**: PWA propia que imite el flujo de citas/órdenes consumiendo la API mapeada.
4. **O4 — Recrear Tidy (viajar completo)**: terreno avanzado (60-70% cubierto), requiere mapear Control, mapa, formulario crear/editar.

**DECISIÓN TOMADA (29/08/2026):** 
- **Alcance = FASE 1 "Espejo en vivo"**: vista/panel que consulta citas en vivo desde la pestaña de Tidy abierta (content-script, mismo origen, cero CORS), sin backend.
- **Modelo de sesión = "sesión del propio navegador"**: cada usuario usa SU propia sesión de TidyWork; sin cuentas nuevas ni expiración central.
- **Mapeo del flujo de derivación COMPLETO** (el que mueve ENVIADO): `GetDetailById` → modal → `SendAppointmentTechnical`. Con esto la Fase 1 puede leer y también derivar citas.
- **Próximo paso antes de implementar:** verificar los endpoints con sesión real + (opcional) capturar `/Appointment/Manage/{id}`.

## 🧩 Cómo se probó

- Scripts de verificación en `C:\Users\jabustos\AppData\Local\Temp\opencode\` (ej. `test_alert.js`): simulan el filtro de alertas con datos reales. Verificado: región sí filtra (228 todas → 95 Santa Cruz → 48 La Paz → etc.).
- Probes con Edge/Chrome headless (`probe.js`): confirman que los botones ya no quedan cortados en viewport de teléfono. **IMPORTANTE:** no commitear las capturas/imágenes de prueba al repo.

## 🔧 Comandos útiles

- Verificar sintaxis: `node --check app.js`
- Ver referencias duplicadas: `node -e "...matchAll..."` (cada función debe existir 1 sola vez).
- Correr servidor local: `python -m http.server 8080`

## 🚀 Flujo para publicar cambios

1. Editar `app.js` y/o `index.html`.
2. `node --check app.js`.
3. Subir la versión en `index.html`: `app.js?v=NN` → `?v=NN+1`.
4. `git add -A`, `git commit -m "..."`, `git push origin main`.
5. Avisar al usuario: esperar ~2 min y hacer recarga forzada en el teléfono.

## 📌 Estado de commits

- `b9c8ae0` — feat: dashboard ejecutivo, tendencia, alertas push, PDF branding; elimina Telegram y código muerto.
- `9ca4103` — fix: alertas con botón de detener y vista previa en vivo, filtros de región/días en alertas y NPS.
- `a5dbe9b` — fix: botón **Buscar** como disparador de resultados en alertas push.
- `fe47b53` — chore: quitar captura de prueba del repo.
- `8d88c4a` — feat: satisfacción del cliente lee la pestaña 'nps por regional' (v38).
- `529cd3e` — fix: padding inferior en desktop para que la barra de navegación no tape el dashboard ejecutivo (style.css v17).
### 10. App — Integración de pestaña TRANSPORTE por regional (11/09/2026, v54)
- Integración de la hoja Google `TRANSPORTE` (`SHEETS_CONFIG.transporte`).
- Las órdenes de transporte se leen y se distribuyen automáticamente en las vistas por regional de **Estados de Servicio**.
- Identificador visual **`🚛 TRANSPORTE`** (badge ámbar, borde `#f59e0b`).
- Sub-filtro rápido con chips dentro de la vista de cada regional: **Todas**, **Servicio Técnico** y **Transporte**.
- Inclusión de órdenes de transporte en el buscador global y buscador regional.

### 11. Fix — Corrección del filtro regional y búsqueda en Tarija/Sucre (12/09/2026, v56)
- **Vista por defecto sin búsqueda**: `isOrderInRegion()` muestra limpiamente solo las órdenes pertenecientes a la regional elegida (**Tarija**, **Villamontes**, **Yacuiba** en Tarija; **Sucre** en Sucre). Evita que órdenes generales de Montero saturen la lista inicial.
- **Búsqueda / Filtro por texto / Rol Regional**: Al buscar por nombre de cliente, N° orden o equipo dentro de la vista de Tarija/Sucre (o con rol regional), la búsqueda abarca **Tarija/Sucre Y Municipios (SCZ)**. Esto permite ubicar equipos de clientes de Tarija/Sucre que fueron derivados a talleres en Santa Cruz o Montero por falta de servicio técnico local.
- Sincronizado en `app.js`, `dismac-extension/sidepanel/panel.js` y `dismac-extension/background/service-worker.js`.

- **Versión actual en producción: `app.js?v=56`.**

### 12. PWA instalable con logo DISMAC (15/09/2026, v57)
- App ahora instalable (PWA): nuevo `manifest.json` (name "Soporte Técnico Dismac", display `standalone`, theme_color `#E31837`) + `sw.js` (service worker unificado: caching de la app shell + notificaciones FCM de fondo, absorbe la lógica de `firebase-messaging-sw.js`).
- Íconos generados desde el logo real de la extensión (`dismac-extension/icons/icon128.png` = cuadrado rojo `#E31837` redondeado con la "D" blanca): `icon-192.png`, `icon-512.png`, `icon-512-maskable.png` (esquinas rojas opacas, apto para máscaras de Android) y `apple-touch-icon.png` (180px, para iOS).
- `index.html`: `manifest.json` + `theme-color` + `apple-touch-icon` + metas iOS, y registro de `navigator.serviceWorker.register('./sw.js')` al cargar.
- **Importante al publicar:** `sw.js` cachea el shell por versión (`CACHE_VERSION = 'dismac-app-vNN'`). Si cambia el shell (app.js/style.css/index.html), subir `app.js?v=NN`, actualizar `CACHE_VERSION` y el `PRECACHE_URLS` (paths con espacios van URL-encoded, ej. `icono%20para%20botones.png`). Estrategia: network-first en navegación, stale-while-revalidate en estáticos (preserva el flujo de "recarga forzada para ver lo nuevo").

## 🔮 Pendiente / a confirmar

- Confirmar con el usuario que en su teléfono se visualiza la versión v55 tras la recarga forzada (~2 min post-push).
- **Pestaña "última modificación":** confirmar si debe mostrar **solo órdenes activas** (hoy trae todas, incluido Completado) y si el mapeo de "Contacto" (→ `Cuenta: Nombre de la cuenta`) es correcto.

