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
- **Versión actual en producción: `app.js?v=37`.**

## 🔮 Pendiente / a confirmar

- Confirmar con el usuario que en su teléfono ya se ve el botón completo y el flujo Buscar funciona (estaba viendo una versión vieja en caché).
- `DASHBOARD_CAMBIOS.md` y `presentacion_app.md` están desactualizados si se quieren documentar los últimos fixes.
