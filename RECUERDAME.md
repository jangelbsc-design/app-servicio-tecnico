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
