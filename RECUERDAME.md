# RECUERDAME - Bot Telegram · Chat IA Dismac (n8n local)

## LOGIN n8n (self-hosted, funciona VERIFICADO)
- URL: http://127.0.0.1:5678
- usuario: jangelbsc@gmail.com   /  contrasena: Dismac-2026-n8n!
- (otros usuarios intentados dieron 401; usar ESTE)

## BOT (workflow yt7BhZe9wFWGvdO7 "Bot Telegram · Chat IA Dismac")
- ACTIVE: true (reactivado)
- Polling Telegram cada 1 min (cron) -> getUpdates con offset en static data (dedup)
- Chat: msg IA -> Groq (openai/gpt-oss-20b) -> tool Google Sheets -> responder
- Groq: FUNCIONA (gratis, clave en env N8N_BOT_TOKEN? no: groqApi cred FwH2N96Hj3KVnN0p)
- Google Sheets tool: credencial ksD1bB5kxObtRk2w "Google Sheets account 2" (conectada 2026-09-17 13:16, BUENA)
- ERROR VIEJO RESUELTO: nodo sheets apuntaba a 3Mwa06P4ZUZZExUw (abril, EAUTH token revocado). YA NO.

## TELEGRAM
- bot @dismac_soporte_bot | token en env (no guardar en repo) | chat de Juan 363865053

## SESION 2026-09-17 (TARDE) - RESULTADO FINAL

### PROBLEMA RESUELTO: EAUTH en nodo sheets (4 horas de bloqueo) 
- CAUSA RAIZ: el nodo Google Sheets del workflow activo usaba la credencial VIEJA
  ("Google Sheets account", token de abril REVOCADO / EAUTH). 
- FIX APLICADO y VERIFICADO: re-apuntar el nodo sheets a la credencial NUEVA
  ("Google Sheets account 2", conectada HOY 13:16, id ksD1bB5kxObtRk2w) en el
  workflow ACTIVO, vía: deactivate -> PATCH (usando versionId NUEVO que devuelve
  el PATCH) -> activate con ESE versionId. VERIFICADO: active true + 400+
  ejecuciones recientes SIN EAUTH + snapshots con credencial NUEVA.
- REGLA CLAVE: el EAUTH ya NO existe en ejecuciones nuevas. Si aparece en un
  dump, es que esa ejecucion era VIEJA (pre-fix). No perseguir fantasmas.

### PROMPT DEL AGENTE ACTUALIZADO Y ACTIVO
- Se añadió al systemMessage del OpenAI Agent:
  - Consultá SIEMPRE la hoja REPORTE GLOBAL (gid=0).
  - La columna de ciudad se llama EXACTO: "Territorio de servicio: Nombre"
    (con dos puntos y la palabra Nombre al final) - NO "Territorio de servicio"
    a secas, porque así el modelo no la encuentra.
  - Filtrar por esa columna con el valor exacto de la ciudad pedida.
  - Responder con datos reales o decir honestamente "no encontré". No inventar.
- PATCH 200 | ACTIVATE 200 | active:true | versionId 584df5af... | prompt
  contiene "Territorio de servicio: Nombre": SI (verificado).
- OJO aprendido: la tool sheets (googleSheetsTool) corre DENTRO del agente, por
  eso NO aparece como nodo separado en runData -> los probes por API solo ven
  el dump del agente. La tool devuelve el volcado completo de la hoja y Groq
  filtra por prompt; si el modelo no matchea la columna exacta, dice "no
  encontré" aunque la fila exista. POR ESO LA COLUMNA EXACTA ES CRITICA.

### PENDIENTE (ULTIMO PASO REAL)
- Prueba E2E post-fix: que Juan mande UN mensaje nuevo ("¿hay órdenes en
  Tarija?" / "¿en Montero?") y verificar en la ejecución nueva que: cred
  NUEVA + sin EAUTH + responder con datos reales de la columna Territorio de
  servicio: Nombre. El mensaje anterior (Tarija) se procesó ANTES del fix de
  columna, por eso "no encontré" es esperable; no es evidencia de fallo.

### SUBAGENTE CREADO EN OPENCODE (trabajo en paralelo)
- Archivo: .opencode/agent/lector-sheets.md - subagente "Lector de Sheets via
  n8n", especializada en leer/verificar REPORTE GLOBAL y pestañas de
  regionales del bot Telegram Dismac, con todas las lecciones de la tarde
  (login API, cred NUEVA buena, patrón anti-EAUTH, volcado a archivo con node,
  columna exacta Territorio de servicio: Nombre).
- ACTIVAR: reiniciar opencode (la config se carga al arranque) y luego
  invocarla con @lector-sheets (corre EN PARALELO con la agente principal).

### REGLAS CRITICAS PARA SCRIPTS (aprendidas con dolor)
- Nunca backticks ni ${...} en el codigo del script; usar here-string de
  POWERSHELL de comillas simples @'...'@ + Set-Content + node archivo 2>&1.
- ASCII puro (sin acentos/eñes en el JS), concatenar strings con +.
- IDs largos de credencial/documento se CORROMPEN si se imprimen en la
  respuesta (el render los reemplaza). Siempre escribir output a archivo con
  Set-Content -Encoding UTF8 y leerlo DESPUES con la herramienta de lectura.
- Guardar outputs en C:\Users\jabustos\AppData\Local\Temp\opencode\ con
  nombres ASCII cortos.

## CAMBIOS PENDIDOS / PROXIMOS
- PRUEBA E2E REAL NUEVA (post-fix de columna): mandar mensaje con ciudad
  (Tarija / Montero) y confirmar respuesta con datos + snapshot NUEVA sin EAUTH.
- OPCIONAL: habilitar que el bot lea TAMBIÉN otras pestañas del doc (una tool
  por pestaña, explícita) — pedir a Juan qué pestañas y con qué nombres.
- Hosting: decidir (n8n local ahora; no se paga nada)
- no almacenar en archivos: token Telegram / password n8n / claves privadas
  (usar variables de entorno o pegarlas solo en la UI)

## SCRIPTS (temp, verificar contenido antes de correr)
- reapuntar-sheets-bot.js -> PATCH + activate (ya aplicado, reemplazos 0 = ya estaba bueno)
- lector-sheets.md -> subagente opencode (ya creado, falta reiniciar opencode)

---

# DISMAC ASSIST - EXTENSIÓN CHROME (MV3) + TIDYWORK

## CONTEXTO
- Repo: https://github.com/jangelbsc-design/app-servicio-tecnico.git (rama main, local:
  C:\Users\jabustos\Desktop\APP y N8N\App\dismac-extension).
- Extensión MV3: sidepanel (panel.html/js/css), content scripts en https://tidywork.dismac.com.bo/*
  (content/tidywork.js + content/tidywork-live.js + content/tidywork.css), background/service-worker.js
  (sync + SHEETS_CONFIG), icons/.
- Config local (NO subir): .agents/ (reglas), .opencode/ (subagentes, node_modules ignorado),
  exec-72.json, archivos en Temp\opencode.

## SESION 2026-09-23
### LIMPIEZA YA PUSHEADO (commit 5e7ead5, origin/main)
- Se QUITARON de la extensión: Satisfacción/NPS (tarjeta + vista view-encuesta + renderEncuesta),
  Escalamientos (tarjeta + badge-esc), Contacto Rápido, y botones WhatsApp ("wa.me") / Llamar
  ("tel:") en tarjetas de taller, detalle de orden, búsqueda global y detalle de cita. Se
  conserva seguimiento: Estados de Servicio, Última Modificación, Citas, Red de Talleres, KPIs.
- Archivos en el commit: content/tidywork.js, sidepanel/panel.html, sidepanel/panel.js, RECUERDAME.md.
- PENDIENTE menor: limpiar CSS muerto en sidepanel/panel.css (.sp-btn-call, .sp-btn-wa,
  .sp-contact-*, .sp-cita-action-*) - preguntar a Juan si los borra.

### FLUJO 2 "TIDYWORK -> EXTENSION" (EN PROGRESO, NO terminado)
Objetivo: la extensión refleja EN VIVO cambios de TidyWork (citas/control) usando la API real.
Elegido por Juan (de 3 opciones): espejo en vivo de citas + espejo del Control/mapa +
reacción instantánea a cambios. NO se eligió refrescar el ODT en pantalla.

- content/tidywork-live.js (NUEVO): cliente API ("tidyFetch") + espejos + watchers.
  - Cliente: same-origin (cookies de sesion del usuario), headers Tidy-Fetch:true y
    X-XSRF-TOKEN (meta[name="x-xsrf-token"] o cookie .AspNetCore.Antiforgery.*). Detección 401.
  - Espejo citas: POST /Appointment/Filter (body form filter=JSON{TerritoryId, WokTypeIds,
    Technicals, StatusIds, StartDate, EndDate, Coment:'NONE'}). Territorios: POST
    /WorkOrder/GetTerritorys {territoryId:1} devuelve TODOS (27 ids).
  - Espejo control/mapa: GET /Control/GetEvents (Appoiments/Events/Markers).
  - Reaccion instantanea: content/fetch-watcher.js (NUEVO) inyectado via chrome-extension://
    (web_accessible_resources en manifest.json; CSP de TidyWork BLOQUEA scripts inline),
    reenvia por window.postMessage src:'dismac-tidy-live'; el content script refresca espejos.
    Endpoints trigger: SendAppointmentTechnical, ChangeStatus, WorkOrder/Update|Create,
    ReOpenWo, AddAppointment, RescheduleAppointment, CreateScheduleSpecial, CompleteWorkShop.
  - Tambien refresh por URL (1500ms), visibilidad, y cada 60s. Fallback a DOM (lo de
    extractAppointmentRows de tidywork.js) si la API falla.
- sidepanel/panel.js: escucha CITAS_LIVE_UPDATED -> recarga storage + render al instante +
  footer "live-status-text" (Live TidyWork: N citas · fuente · hora).
- manifest.json: content_scripts += tidywork-live.js; web_accessible_resources += fetch-watcher.js.

### HALLAZGOS DE API (por tests en el navegador de Juan)
- Respuesta de /Appointment/Filter: { Data:object, Object:object, Success:boolean,
  Error:object, Errors:array[1], ErrosAll:string }. Data/Object encierran el payload DataTable.
- PRIMER intento fallo con Errors[0] = "SqlDateTime overflow. Must be between 1/1/1753...".
  Causa probable: el servidor parsea fechas como dd/MM/yyyy (o campo obligatorio omitido
  rellenado con DateTime.MinValue). FIX: auto-curativo con 2 intentos de formato de fecha
  (yyyy/MM/dd y dd/MM/yyyy); lee Errors y avanza. PENDIENTE CONFIRMAR cual formato da filas.
- Estado de verificación: Territorios 27 OK, filter ok=true error=0. Aun sin citas por API
  (citas:0 -> source=none), el DOM fallback SÍ guarda (total 128 en storage.local['citas']).
- Warning inofensivo en consola: tidywork.js "No se pudo cambiar page length: $ is not defined"
  (jQuery no disponible al cierre) - solo ruido.
- COMO PROBAR: recargar extension en chrome://extensions + F5 en la pestana de TidyWork
  (sin F5 el content script NUEVO no se reinyecta en pestanas ya abiertas). Consola: filtrar
  por "[Dismac Assist][Live]". Buscar "Estructura [Filter]" (claves) y "Forma respuesta
  [Appointment/Filter.data]" (forma de una fila) para afinar el mapeo de columnas.

### PROXIMOS PASOS
1. Confirmar formato de fecha que responde sin overflow (que aparezca "dd/MM/yyyy citas: N").
2. Con una fila real a la vista (logShape), ajustar normalizeFilterRow a los campos/indices exactos.
3. Probar /Control (GetEvents) y la reaccion instantanea (cambiar estado a ENVIADO en TidyWork).
4. Cuando el espejo api funcione, limpiar el intento fallido de formato de fecha.
5. Opcional escenario 1 "extension -> TidyWork" (escribir cambios a TidyWork): NO definido aun.

## SESION 2026-09-24 - BOTON "EXTRAER DATOS DE LA ORDEN" (EXITO, funcional)
Objetivo (pedido por Juan): boton en el sidepanel de la orden de TidyWork que extraiga
10 campos (9 originales + N° control), los muestre en una tarjeta y los copie al
portapapeles. IMPLEMENTADO y FUNCIONANDO.

### MAPEO FINAL DE CAMPOS (validado contra HTML real de la orden 51065)
- Tidy (N° interno): URL /WorkOrder/Edit/<id> -> 51065
- nombre: #CustomerFullName -> EVER RICHARD CONDORI TUMIRI
- producto: #ProductName -> Freezer Kernig de 194 Litros - 1 puerta
- Código de producto: #ProductCode -> KDR-252C/1
- tipo de compra: #PurchaseType (seccion "Datos Venta", label "Condición") -> MINICUOTAS
- fecha de compra: #InvoiceDate (label "Fecha Factura", misma seccion) -> 22/12/2025 23:51:00
- N° control (agregado 2026-09-24 por pedido): #ControlNumber (label "N° Control",
  "Datos Venta"; fallback #InvoiceService) -> 3255081
- descripción de la falla: #TechnicalServiceOrder_Description -> texto libre del tecnico
- motivo de cambio: #cbChangeRepairType (label "Porque se realizo el cambio?";
  alternativo taller: #cbWsChangeRepairType) -> select (vacio = "—")
- lugar del equipo: #cbWorkPlaceType (label "Lugar de Trabajo") -> select Domicilio/Taller

### COMO SE RESOLVIO (lecciones para reusar)
- El form de WorkOrder/Edit usa `<label for="id">` + input/select; para el boton NO sirve
  adivinar labels: se leyeron los `id` reales del HTML guardado y se usaron selectores
  exactos (document.getElementById), con fallback a getField() por label.
- "tipo de compra"≈PurchaseType y "fecha de compra"≈InvoiceDate NO estan en REPORTE
  GLOBAL/ADICIONALES para toda orden: viven en la seccion "Datos Venta" del form
  (control #mcInvoice). La hoja ADICIONALES solo tiene "Tipo de compra" (CONTADO/
  CREDITO) y "Fecha de compra" como columnas; la extension YA baja ADICIONALES pero NO
  extrae aun adicTipoCompra/adicFechaCompra (pendiente opcional para el flujo sheets).
- "Porque se realizo el cambio?" existe x2 en la pagina: #cbChangeRepairType (seccion
  servicio) y #cbWsChangeRepairType (seccion taller) - mismo label, cambiar ambos.
- El HTML guardado (C:\Users\jabustos\Downloads\Tidy Work _ Orden de Trabajo.html,
  linea ~7806) contiene el output del propio panel inyectado: ignorar esos falsos
  positivos al buscar labels.
- Selects con option -1 "Seleccionar" => seleccion vacia (helper selectText devuelve "").

### CODIGO
- content/tidywork.js (~L289): inputVal(id), selectText(id) y extractOrderCopyFields()
  reescrito con los selectores exactos; buildExtractResult + handleExtractClick ya existian
  y muestran tarjeta + copian. node --check OK.

### PENDIENTE / OPCIONAL
- Probar el boton en otros tipos de orden (Instalacion/Cambio) por si el id cambia.
- (antes en el dia, sin verificar aun) tidywork-live.js: se relajo el filtro de errores
  (solo aborta si Success===false u overflow; los demas Errors se loguean), parseErrors
  mejorado (Description/Message/ErrorMessage) y diagnostico profundo "Estructura [Filter]"
  + "Forma respuesta" cuando no llegan filas. Falta confirmar en navegador.

## API TIDYWORK (resumen, detalle en MAPEO-TIDYWORK.md)
- Auth: cookies de sesion del usuario en el navegador (same-origin, sin CORS). NO guardar credenciales.
- Ruta de citas /Appointment: Filter, SaveFilter, GetTerritorys, GetTechnicalsByTerritories, Manage/{id}.
- Ruta /Control (mapa/derivacion): GetEvents, SendAppointmentTechnical {Id,StatusId,StatusName,
  TechnicalReference}, GetDetailById {id}, GetTechnicals {territoryId}, RescheduleAppointment.
- EnumAppointmentStatus: 1 NINGUNO, 2 PROGRAMADO, 3 ENVIADO, 4 EN_CAMINO, 5 EN_CURSO,
  6 NO_SE_PUEDE_COMPLETAR, 7 COMPLETADO, 8 CANCELADO, 9 ERROR.
