# 🗺️ MAPEO DE LA API DE TIDYWORK — Dismac Assist

Documento vivo del mapeo de la plataforma **TidyWork** (`https://tidywork.dismac.com.bo`) sobre la que trabaja la extensión Dismac Assist. Objetivo: conocer los endpoints reales para que la extensión/app pida datos directo a la API (en vez de scraping por HTML), ser más estable y mitigar los deslogueos.

**Última actualización:** 29/08/2026

---

## 🧱 Stack tecnológico (confirmado por captura de red)

| Característica | Valor | Detalle |
|---|---|---|
| Framework | **ASP.NET Core** | Cookies `.AspNetCore.*` |
| Servidor web | **IIS 10.0** | Header `server: Microsoft-IIS/10.0` |
| Dirección interna | `192.168.1.180:443` | Servidor en la red local de Dismac |
| Autenticación | **Cookie-based** (`.AspNetCore.Cookies`) | No es JWT en header |
| Anti-forgery XSRF | **Cookie `.AspNetCore.Antiforgery.*` + header `x-xsrf-token`** | Todo POST requiere ambos |
| Sesión | Cookie `.AspNetCore.Session` | |
| Marca de llamadas AJAX internas | Header custom **`tidy-fetch: true`** | Útil para filtrar solo llamadas reales en DevTools |
| Formato de datos | **JSON** (`application/json; charset=utf-8`) para GET; **form-urlencoded** para POST de listas | |

---

## 🔑 Mecanismo de autenticación y anti-deslogueo

### Stack de llamadas (cómo la app hace requests)
La app usa una capa propia sobre `fetch` definida en `Layout.js`:

```
Tools.SendPost(url, data)   →  Fetch().form({ url, method:'POST', data })
Tools.SendGet(url, data)    →  Fetch().form({ url, method:'GET', data })
Tools.SendPostFiles(url...) →  para subida de archivos (sin headers)
Tools.Send(url, type, data)
```

`Fetch().form()` construye la petición así:
```js
const token = document.querySelector('meta[name="x-xsrf-token"]').content; // ← token XSRF de la página

headers = {
  'Content-Type': 'application/x-www-form-urlencoded',   // POST
  'Tidy-Fetch': 'true',                                   // marca de llamada interna
  'X-XSRF-TOKEN': token                                   // token anti-CSRF
}
// GET: body null, parámetros van en la URL (?clave=valor,...)
// POST: body = JsonToFormUrlEncodedPost(data)  (form-urlencoded)
```

### Estados HTTP válidos
```js
HTTP_STATUS_VALID = [200, 201]
```
Cualquier otra respuesta HTTP → devuelve `{ Success:false, ErrosAll:'Error Estado {status}' }`.

### ⚠️ EL DESLOGUEO — causa raíz identificada (IMPORTANTE)
El servidor **NO devuelve 401 HTTP real**. Cuando la sesión/token expira devuelve **200 con JSON**:
```json
{ "Errors": [ { "ErrorCode": 401 } ] }
```
Y `Fetch().form()` detecta ese 401 interno:
```js
if ((json.Errors ?? false) && json.Errors.find(x => x.ErrorCode == 401)) {
    ValidateLogin();               // abre POPUP "Inicia Sesión" automáticamente
    return Fetch().form(config);   // reintenta la llamada tras el login
}
```

`ValidateLogin()`:
```js
let url = await fetch('/Account/GetUrlAuthentication').then(x => x.text()); // URL de login
let vm = OpenWindowPopUp(url, 'Inicia Session', 500, 600);                  // abre ventana emergente
TIDYSESSIONBAR.ok = false;
while (!TIDYSESSIONBAR.ok && !vm.closed) { await Tools.Sleep(250); }
if (!TIDYSESSIONBAR.ok) { Tools.Redirect('/'); }                            // ← si el popup se cierra sin login → DESLOGUEA
```

El popup (`SessionStorage.js`) al loguearse manda `postMessage` → `TIDYSESSIONBAR.ok = true`.

**Interpretación:** "nos desloguea a cada rato" = cuando la sesión/antiforgery de TidyWork **expira** (normalmente tras ~20-60 min de inactividad), la **propia app abre una ventana emergente automática** pidiendo "Inicia Sesión" y, si se cierra sin loguear, te redirige a `/` (deslogueo). Esto lo dispara la app, NO la extensión.

### Cómo lo mitiga / lecciones para la extensión
1. **El token XSRF viene en la página** (`meta[name="x-xsrf-token"]`). Una extensión content-script debe leerlo del DOM en cada petición, no guardarlo estático.
2. **El reintento tras 401 es automático** en la app (vuelve a llamar `Fetch().form(config)`).
3. **Para la extensión:** si quieres usar la API de TidyWork, haz las llamadas **desde un content-script inyectado en la página** para que el navegador mande las cookies automáticamente y puedas leer el meta token. No es recomendable llamar fuera de la página (perderías el `x-xsrf-token` actual y las cookies).
4. **La ventana emergente de re-login es el mecanismo nativo.** Para evitar "deslogueos", la sesión hay que mantenerla activa (mover/recargar antes del timeout) o aceptar el popup de re-login.

---

## 📡 ENDPOINTS CONFIRMADOS

### 1. Listado de órdenes de trabajo ✅

| Dato | Valor |
|---|---|
| **URL** | `POST /WorkOrder/Get` |
| **Método** | POST |
| **Content-Type** | `application/x-www-form-urlencoded` |
| **Headers requeridos** | `x-xsrf-token` (+ cookie antiforgery), `tidy-fetch: true`, origin/referer |
| **Respuesta** | `200 OK`, `application/json; charset=utf-8` |
| **Referer** | `https://tidywork.dismac.com.bo/workorder` |
| **Body** (307 bytes) | Parámetros de filtro (territorio, tipo, estado, fechas...) |

### 2. Notificaciones ✅

| Dato | Valor |
|---|---|
| **URL** | `GET /Home/GetNotifications?` |
| **Método** | GET |
| **Referer típico** | `/WorkOrder/Edit/{id}` (48617) |

### 3. Edición de una orden (vista) ✅

| Dato | Valor |
|---|---|
| **URL** | `GET /WorkOrder/Edit/{id}` |
| **Método** | GET |
| **Ejemplo** | `/WorkOrder/Edit/48617` |
| **Tipo** | Página HTML (vista Razor) |

### 4. Carga de sub-estados de una orden ✅

| Dato | Valor |
|---|---|
| **URL** | `POST /WorkOrder/GetListSubStatus` |
| **Método** | POST |
| **Content-Type** | `application/x-www-form-urlencoded` |
| **Body** | ~25 bytes (probablemente `WorkStatusId={id}`) |
| **Referer** | `/WorkOrder/Edit/{id}` |
| **Respuesta** | `200`, JSON |

### 5. Lógica de gestión de WorkOrder (JS) ✅

| Dato | Valor |
|---|---|
| **URL** | `GET /assets/js/customize/WorkOrder/Manage.js?v={guid}` |
| **Método** | GET |
| **Tipo** | `text/javascript` (122 KB) — contiene la lógica de edición/guardado |
| **Útil para** | Extraer TODOS los endpoints (guardar, técnicos, productos, clientes) |

---

## 📡 ENDPOINTS COMPLETOS DEL Manage.js (pantalla de edición de orden)

Fuente: `assets/js/customize/WorkOrder/Manage.js` (122 KB). Todos los `Tools.Send*` encontrados:

| Endpoint | Método | Data enviada | Uso |
|---|---|---|---|
| `/WorkOrder/GetClientData` | POST | `{ docNum, docType }` | Buscar/cliente modal |
| `/WorkOrder/GetPurchaseHistoryClient` | POST | `{ docNum, docType }` | Historial compras cliente |
| `/WorkOrder/AddImage` | GET | — | Agregar imagen |
| `/WorkOrder/ChangeStatus` | POST | `{ id, statusId, documents }` | Cambiar estado |
| `/WorkOrder/GetListSubStatus` | POST | `{ objectType: 6/9/10/14, id, type: 0/1 }` | Sub-estados (según contexto) |
| `/WorkOrder/GetWorkOrderType` | GET | — | Tipos de orden |
| `/WorkOrder/GetTypeTransportChild` | GET | — | Tipos transporte |
| `/WorkOrder/CreateChild` | POST | `{ Id, WorkOrderType, TransportType, FromType, ToType }` | Crear orden hija |
| `/WorkOrder/GetListUserTask` | GET | `{ Id }` | Usuarios de tarea |
| `/WorkOrder/Delete` | POST | `{ Id }` | Eliminar orden |
| `/WorkOrder/GetTerritorys` | GET | `{ territoryId }` | Territorios |
| `/WorkOrder/GetListSkillsByTypeSkill` | GET | `{ skillTypeId }` | Habilidades por tipo |
| `/WorkOrder/GetDelimitationByTerritoryId` | GET | `{ territoryId }` | Delimitación |
| `/WorkOrder/GetInvoiceData` | POST | `{ docEntry }` | Dato factura |
| `/WorkOrder/GetCaseOpen` | POST | `{ numberCase, docNum, docType }` | Abrir caso |
| `/WorkOrder/GetSchedule` | POST | `{ territoryId, municipio, skillId, startDate, endDate, reassignment }` | Agenda |
| `/WorkOrder/GetReopenWo` | POST | — | Reabrir WO |
| `/WorkOrder/ReOpenWo` | POST | `{ Id, Description }` | Reabrir WO |
| `/WorkOrder/GetAppointments` | POST | `{ Id }` | Citas de la orden |
| `/WorkOrder/AddAppointment` | POST | `{ eWorkOrderAppointment }` | Crear cita |
| `/WorkOrder/UpdateCaseSF` | POST | `{ numberCase, caseId, workOrderId, ownerCase }` | Actualizar caso SF |
| `/WorkOrder/FindSpares` | GET | `{ filter }` | Buscar repuestos |
| `/WorkOrder/GetFormChatter` | GET | `{ Id }` | Chatter |
| `/WorkOrder/GetViewCreateSchedule` | POST | `{ cityId, ordersType }` | Vista crear agenda |
| `/WorkOrder/CreateScheduleSpecial` | POST | `{ model }` | Crear agenda especial |
| `/WorkOrder/GetSkill` | POST | `{ skillId }` | Habilidad |
| `/WorkOrder/GetTerritoryByUser` | POST | `{ parentTerritoryId, cityId }` | Territorio por usuario |
| `/WorkOrder/ChangeTerritory` | POST | `{ id, parentTerritory, territoryId }` | Cambiar territorio |
| `/WorkOrder/GetWorkTypeServicePriceConfiguration` | POST | `{ Id, SkillId, TerritoryId, ParentTerritoryId, AppointmentId }` | Config precios |
| `/WorkOrder/GetWorkOrderSkusRepeat` | GET | `{ ControlNumber, ProductItem, ProductCode }` | SKUs repetidos |
| `/WorkOrder/GetListBrandByCodeErp` | GET | `{ CodeErp, ParentTerritoryId }` | Marcas por código ERP |
| `/WorkOrder/GetWorkOrderByCustomer` | GET | `{ CustomerIdentityDocument, CustomerDocumentType, ControlNumber }` | Órdenes por cliente |
| `/WorkOrder/AddWorkOrderParent` | POST | `{ Id, ParentWorkOrderId }` | Vincular orden padre |
| `/WorkOrder/GetTypeTransport` | POST | — | Tipos transporte |
| `/WorkOrder/CompleteWorkShop` | POST | `{ eWorkOrder: model }` | Completar taller |
| `/WorkOrder/GetInvoiceServiceData` | POST | `{ docEntry }` | Dato factura servicio |
| `/WorkOrder/GeneratePDF` | GET | `{ Id }` | Generar PDF |
| `/WorkOrder/Get` | POST | filtros (307) | Listado de órdenes |
| `/WorkOrder/Create` | POST | `{ eWorkOrder: model }` | **CREAR orden** (endpoint de guardado) |
| `/WorkOrder/Update` | POST | `{ eWorkOrder: model }` | **ACTUALIZAR orden** (endpoint de guardado) |

### Otros controladores (Layout / Extend / Index)
| Endpoint | Método | Origen | Uso |
|---|---|---|---|
| `/Account/GetUrlAuthentication` | GET | Layout | Obtener URL de login (re-autenticación) |
| `/Home/GetUser` | GET | ExtendFunctions | Obtener usuario actual |
| `/Home/SearhCriteria` | GET | Index | Búsqueda global (`{ objectType, criteria }`) |
| `/Home/GetNotifications?` | GET | fcm.js | Listar notificaciones |
| `/Home/GetFirebaseConfig` | GET | fcm.js | Config de Firebase (ApiKey, VapidKey, etc.) |
| `/Home/RegisterDevice` | POST | fcm.js | Registrar token FCM del dispositivo `{ token }` |
| `/Home/ReadNotification` | POST | fcm.js | Marcar notificación como leída `{ id }` |
| `/firebase-messaging-sw.js` | GET | — | Service worker (se llena por placeholders) |
| `/Appointment/Manage/{id}` | GET | — | Vista/detalle de cita (página Razor) |

### 🔔 Sistema de notificaciones push (fcm.js — confirmado)
Flujo real:
1. `GET /Home/GetFirebaseConfig` → devuelve `{ ApiKey, AuthDomain, ProjectId, StorageBucket, MessagingSenderId, AppId, MeasurementId, VapidKey }`.
2. `initializeApp(config)` + `getMessaging(app)` de Firebase SDK 11.0.1.
3. Pide permiso `Notification.requestPermission()`; si `granted`, obtiene token → `POST /Home/RegisterDevice { token }`.
4. `onMessage(messaging, ...)` → muestra `new Notification(title, { body, icon })`.
   - El `body` es un **JSON**: `{ Id, Body, Icon, Link }` → al hacer clic redirige a `Link` (`Tools.Redirect(link)`).
5. El service worker `firebase-messaging-sw.js` se registra reemplazando placeholders (`__API_KEY__`, `__AUTH_DOMAIN__`, etc.).
6. `GET /Home/GetNotifications` llena la campana; `POST /Home/ReadNotification { id }` marca leída.
   - Cada notificación: `{ id, title, body, icon, link, time, isRead }`.

### Vistas principales (menú de la app)
```
/WorkOrder   → listado de órdenes de trabajo
/Appointment → vista de citas (módulo de agenda)
/Control     → vista de control
/Home        → inicio
/WorkOrder/Edit/{id} → edición de una orden
/Appointment/Manage/{id} → detalle de una cita
```

---

## 📅 MÓDULO DE CITAS / AGENDA (Appointment)

La gestión de citas tiene **dos ámbitos**:

### A) Citas desde la orden de trabajo (WorkOrder/Edit)
Las citas se asignan a una orden desde su página de edición:

| Endpoint | Método | Data | Uso |
|---|---|---|---|
| `POST /WorkOrder/GetSchedule` | POST | `{ territoryId, municipio, skillId, startDate, endDate, reassignment }` | Buscar horarios disponibles (grilla de agenda) |
| `POST /WorkOrder/AddAppointment` | POST | `{ eWorkOrderAppointment }` | Programar una cita en un horario |
| `POST /WorkOrder/GetAppointments` | POST | `{ Id }` | Listar las citas de una orden (devuelve HTML en `result.Data`) |
| `POST /WorkOrder/GetViewCreateSchedule` | POST | `{ cityId, ordersType }` | Abrir modal de "Horario Especial" |
| `POST /WorkOrder/CreateScheduleSpecial` | POST | `{ model }` | Crear horario especial (model `WorkOrderAppointmentSpecial`) |
| `POST /WorkOrder/GetSkill` | POST | `{ skillId }` | Duracion/`Duration` de la habilidad (para calculo de fin) |
| `GET /WorkOrder/GetWorkTypeServicePriceConfiguration` → (POST) | POST | `{ Id, SkillId, TerritoryId, ParentTerritoryId, AppointmentId }` | Config precios |

**Flujo de programación de cita (confirmado):**
1. Usuario hace clic en `.scheduleID` (una fila de horario de la grilla → `#btnSearchSA` primero cargó la agenda con `GetSchedule`).
2. Confirma → crea `new WorkOrderAppointment(workOrderId, appointmentDate, technicalId, skillId, municipio, regional, idSchedule, AppointmentIdCanceled)`.
3. Envía `POST /WorkOrder/AddAppointment` con `{ eWorkOrderAppointment }`.
4. Servidor devuelve el nuevo `Id` (workOrder) en `result.Data` → redirige a `/WorkOrder/Edit/{id}`.

**Si ya existe una cita programada** y se reserva otra, manda `AppointmentIdCanceled = id` de la cita anterior para cancelarla (confirmación "reservar horario y cancelar cita PROGRAMADA").

### B) La vista `/Appointment/Manage/{id}` (detalle de cita)
- Se abre con `Tools.OpenTarget("/Appointment/Manage/" + id)` (desde `.appointmentSelected`, click en una cita listada).
- Es una **página Razor** (como el `WorkOrder/Edit`), su JS propio NO se guardó aún (`Appointment/Manage.js`). Los endpoints de esa vista siguen **pendientes de capturar**.

### C) La página principal de citas `/Appointment` (listado + filtros) ✅
JS: `Index(1).js` (guardado en `Tidy Work _ Citas_files\Index(1).js.descarga`).

| Endpoint | Método | Data | Uso |
|---|---|---|---|
| `POST /Appointment/Filter` | POST | `{ filter: {...} }` | Tabla de citas (DataTable) |
| `POST /Appointment/SaveFilter` | POST | `{ ParrentTerritoryId, TerritoryId, WokTypeIds, Technicals, StatusIds, StartDate, EndDate }` | Guardar filtros en la sesión |
| `GET /Appointment/GetTerritorys` | GET | `{ territoryId }` | Cargar municipios (según regional) |
| `GET /Appointment/GetTechnicalsByTerritories` | GET | `{ TerritoriesId: "[ids]" }` | Técnicos por municipios |
| `GET /Appointment/Manage/{id}` | GET | — | Redirigir al detalle de cita |

**Estructura del filtro (`/Appointment/Filter`):**
```js
{ filter: {
    TerritoryId: JSON.stringify([ids_municipios]),
    WokTypeIds: JSON.stringify([tipo_orden]),
    Technicals: JSON.stringify([ids_tecnicos]),
    StatusIds: JSON.stringify([estados]),      // EnumAppointmentStatus
    StartDate: 'YYYY/MM/DD',
    EndDate: 'YYYY/MM/DD',
    Coment: 'NONE'
}}
```

**Flujo de la página:**
1. `Initial()` → crea los MultiSelect (`cbTerritorys` regional, `cbMunicipio`, `cbTechnicals`, `cbStatusAppointments`), fecha hoy por defecto.
2. Al cambiar regional → `Appointment/GetTerritorys` → llena `cbMunicipio`.
3. `#btnSearch` → `LoadData()` (llama 🔹 `Appointment/Filter` y dibuja `#AppointmentTable`) + `SaveFilter()` (`Appointment/SaveFilter`) + `LoadTechnicals()` (`Appointment/GetTechnicalsByTerritories`).
4. Click en fila (icono edit) → `Tools.Redirect("/Appointment/Manage/" + id)`.
5. El `NroTrabajo` en la tabla es un link a `/WorkOrder/Edit/{id}` (se abre en pestaña nueva).

**Nota:** la tabla `#AppointmentTable` muestra las columnas típicas (NroTrabajo, Tipo, Estado, SubEstado, Técnico, Cliente, NroDocumento, Ciudad) — coincide con las que scrapea la extensión actual en `extractAppointmentRows()`.

---

## 🗺️ MÓDULO /Control — CALENDARIO + MAPA DE DERIVACIÓN (Control) ✅
JS: `Index(1).js` del calendario (guardado en `Tidy Work _ Calendario_files\Index(1).js.descarga`, 33 KB). Usa **Leaflet (mapas) + event-calendar.js** (timeline de agenda).

Esta es la página que el usuario usa para **"derivar" citas** (cambiar estado → ENVIADO) y para **ver en mapa** las citas según la regional (Tarija → mapa de Tarija, órdenes del día y siguientes 7 días).

| Endpoint | Método | Data | Uso |
|---|---|---|---|
| `GET /Control/GetEvents` | GET | `{ TerritoryId, TypesId, StatusId, StartDate, EndDate, TechnicalsId }` | 🔥 **Carga TODO**: `Events` (calendario), `Appoiments` (tabla a la derecha), `Markers`, `Delimitations`, `NumPolygons`, `Location`, `Technicals`, `FirstDay`, `RangeConfig` |
| `POST /Appointment/SendAppointmentTechnical` | POST | `{ Id, StatusId, StatusName, TechnicalReference }` | 🔥 **CAMBIA ESTADO de la cita** (el que deja ENVIADO); `TechnicalReference` = teléfono/ref del técnico a quien se envía |
| `POST /Control/GetDetailById` | POST | `{ id }` | Detalle de la cita (HTML modal `#divModal`) al hacer click en calendario/mapa/marcador |
| `POST /Control/GetTechnicals` | POST | `{ territoryId }` | Lista de técnicos del territorio |
| `POST /Control/RescheduleAppointment` | POST | `{ AppointmentId, StartDate:'YYYY-MM-DD HH:mm:ss', EndDate, TechnicalId }` | Reasignar cita (drag & drop en el timeline) |
| `POST /Control/BuildFoundAppointment` | POST | `{ appointments }` | Resultados de búsqueda de Nro. control (modal) |
| `POST /Control/SaveFilter` | POST | `{ ParrentTerritoryId, TerritoryId, WorkTypes, Technicals, StatusAppointments, FilterDate, GroupCompany }` | Guardar filtros de la vista |
| `POST /Control/AbsenceTecnical` | POST | `{ TecnicalIds, TerritoryId }` | Abrir modal de registro de ausencias |
| `POST /Control/CreateListAbsences` | POST | `{ eAbsences: { Description, StartDate, EndDate, ParentTerritoryId, LockType, TechnicalsId[] } }` | Crear ausencias |
| `POST /WorkOrder/GetTerritorys` | POST | `{ territoryId }` | Municipios según regional |

**Formato de fechas en la llamada `GetEvents`:**
```js
// date = día seleccionado en el datepicker
StartDate = dayjs(date).format("YYYY-MM-DD 00:00:00")     // ej. 2026-08-29 00:00:00
EndDate   = dayjs(date).add(7, 'day').format("YYYY-MM-DD 23:59:59")  // +7 días
```
→ la vista muestra **+7 días a partir de la fecha elegida** (coincide con "órdenes del día para los días siguientes").

**Flujo de derivación (confirmado, `#btnChangeStatus`):**
1. Click en cita (calendario/mapa/tabla) → `POST /Control/GetDetailById { id }` → modal con detalles (incluye `#Id`, `#cbStatus`, `#TechnicalReference`).
2. Usuario cambia estado y escribe referencia → click `#btnChangeStatus`.
3. → `POST /Appointment/SendAppointmentTechnical { Id, StatusId, StatusName, TechnicalReference }`.
4. Si `Success` → toast "Estado actualizado" + recarga (`SearchData(true)`).

**Nota:** el mapa es **Leaflet** con polígonos (`Tools.ConfigureDelimitation(data.Delimitations, data.NumPolygons)`), marcadores por cita y usa `Map.js` + `leaflet-fullscreen` + `leaflet-providers`. El timeline es **event-calendar** (`Tools.Calendar`) con `Resources` = técnicos (agrupables por empresa `groupByCompany`). El drag & drop reasigna con `RescheduleAppointment`.

### Avance del mapeo TidyWork (resumen de páginas)
| Página guardada | JS clave | Módulo | Estado |
|---|---|---|---|
| `Tidy Work _ Orden de Trabajo.html` | `WorkOrder/Manage.js` (122 KB) | Órdenes (listado/editar/guardar) | ✅ |
| `Tidy Work _ Citas.html` | `Index(1).js` (citas) | Citas (listado/filtros) | ✅ |
| `Tidy Work _ Calendario.html` | `Index(1).js` (control/calendario) | **Control (mapa + derivación)** | ✅ |

### Estructuras de datos (Entities.js)

### Estructuras de datos (Entities.js)
```js
class Appointment {                       // modelo completo de cita
    constructor(Id, WorkOrderId, AppointmentDate, Description, Duration,
                TechnicalId, StatusId, SkillId, TerritoryId,
                ParentTerritoryId, WorkTypeServiceId, DispacherObservation)
}
class WorkOrderAppointment {              // lo que se envía al programar
    constructor(Id, AppointmentDate, TechnicalId, SkillId, TerritoryId,
                ParentTerritoryId, TemporaryScheduleId, AppointmentIdCanceled)
}
class WorkOrderAppointmentSpecial {       // horario especial
    constructor(WorkOrderId, StartDate, EndDate, TerritoryId, ParentTerritoryId,
                SkillId, TechnicalId)
}
class Calendar { constructor(Id, Name, Day, Time, TerritoryId, ParentTerritoryId, StatusId) }
class CalendarGroup { constructor(Id, Name, TerritoryId, ParentTerritoryId, CalendarDetails) }
class CalendarDetail { constructor(Id, Day, StartTime, EndTime, Editable) } // StatusId = 10/11
```

### Estados de cita (Enum.js)
```js
EnumAppointmentStatus = { NINGUNO:1, PROGRAMADO:2, ENVIADO:3, EN_CAMINO:4,
                          EN_CURSO:5, NO_SE_PUEDE_COMPLETAR:6, COMPLETADO:7,
                          CANCELADO:8, ERROR:9 }
```

### Selectores de la grilla de agenda (scraping de esa vista)
- `.scheduleID` → botón de horario (data-id = `idSchedule`)
- `.startDateRow`, `.finishDateRow` → fecha inicio/fin del turno
- `.technicalIdRow`, `.skillIdRow` → técnico/habilidad del turno
- `.appointmentSelected` → fila de cita existente (abre `/Appointment/Manage/{id}`)
- `.id` → id de la cita (dentro de `tr`)

---

## ⏳ ENDPOINTS PENDIENTES DE CONFIRMAR

| # | Qué hace | Endpoint probable | Método | Estado |
|---|---|---|---|---|
| 1 | **Guardar/Grabar una orden** | `POST /WorkOrder/Create` y `POST /WorkOrder/Update` | POST | ✅ CONFIRMADO |
| 2 | **Cargar talleres/servicios técnicos** | `/Technical/...` | GET/POST | ⏳ A confirmar |
| 3 | **Cargar técnicos** | `/Technical/Get` | GET/POST | ⏳ A confirmar |
| 4 | **Detalle/gestion de una cita** (vista `/Appointment/Manage/{id}`) | `/Appointment/...` | GET/POST | ⏳ Pendiente (guardar ese JS) |
| 5 | **Detalle completo de una orden (JSON/API)** | `/WorkOrder/GetById` ? | GET | ⏳ A confirmar |
| 6 | **Cargar marcas / productos** (catálogo) | `/WorkOrder/GetListBrandByCodeErp` (ya visto) | GET | ✅ (parcial) |

---

## 🍪 Cookies relevantes (tipo de cada una)

| Cookie | Tipo | Nota |
|---|---|---|
| `.AspNetCore.Cookies` | Autenticación | La sesión de login principal |
| `.AspNetCore.Session` | Sesión | Estado de sesión del servidor |
| `.AspNetCore.Antiforgery.<name>` | Seguridad | Token anti-CSRF (se reenvía como `x-xsrf-token`) |
| `FilterViewWorkOrder_{id}` | Preferencia UI | Filtros del listado de órdenes (Territory, Township, WorkTypes, WorkStatus, fechas) |
| `FilterViewControl_{id}` | Preferencia UI | Filtros del control/citas (Territorios, técnicos, estados) |
| `_ga`, `_fbp`, `_gcl_au`, `_clck`, `_ttp`, `ttcsid` | Analytics | Google / Facebook / TikTok / Clarity — irrelevantes |

---

## 🧠 Hallazgos y recomendaciones

1. **El scraping HTML actual (`content/tidywork.js`) es frágil**; mapear la API permitirá peticiones directas más estables.
2. **La clave del anti-deslogueo** está en el manejo correcto del `x-xsrf-token` + cookie de sesión. Una extensión que quiera hacer llamadas tipo API debe:
   - Leer la cookie `.AspNetCore.Antiforgery.*` y mandarla como `x-xsrf-token`.
   - Rotar/actualizar el token cuando cambie.
   - No guardar cookies viejas; siempre usar las actuales del navegador.
3. **Compatibilidad de dominio:** para que la extensión llame estos endpoints, debe hacerlo **desde la página de TidyWork** (mismo origen) o con permisos de host + copiando cookies (más frágil). Lo ideal: inyectar un content-script que use `fetch` **dentro** de la página de TidyWork para que el navegador mande cookies automáticamente.
4. **El deslogueo es de la propia app** (JSON `ErrorCode: 401` → popup de re-login → redirect si se cierra). NO es tu extensión. Para evitar que "te desloguee", lo importante es mantener la sesión activa (no dejar 20-60 min de inactividad) o re-loguear el popup.

### Hoja de ruta propuesta (para la extensión / app)
1. ✅ Mapa de endpoints del Manage.js (hecho).
2. ✅ Confirmar el POST real de «Guardar»: `Create` (nueva) / `Update` (editar) con `{ eWorkOrder }` (hecho).
3. ✅ Mapear módulo de citas desde la orden: `GetSchedule`, `AddAppointment`, `GetAppointments`, `GetViewCreateSchedule`, `CreateScheduleSpecial` (hecho).
4. ✅ Mapear la página principal de citas `/Appointment` (listado/filtros): `Filter`, `SaveFilter`, `GetTerritorys`, `GetTechnicalsByTerritories` (hecho 29/08).
5. ✅ Mapear el sistema de notificaciones push FCM (hecho 29/08).
6. ✅ Mapear la **página de mapa/derivación de citas** (`/Control`, módulo Control: `GetEvents`, `SendAppointmentTechnical`, `GetDetailById`, `RescheduleAppointment`, etc.) — hecho 29/08 con `Tidy Work _ Calendario.html`.
7. ⏳ Mapear la vista `/Appointment/Manage/{id}` (guardar ese JS → probablemente `/assets/js/customize/Appointment/Manage.js`). NOTA: el detalle de citas desde /Control ya se obtiene vía `POST /Control/GetDetailById`, pero la página de edición de cita como tal no.
8. ⏳ Mapear controladores de **técnicos/talleres** (parcial: `/Control/GetTechnicals` y `/Appointment/GetTechnicalsByTerritories` ya vistos; falta formulario de alta).
9. ◻ Diseñar el nuevo `content/tidywork.js` que use `Tools.SendPost`/`SendGet` o `fetch` directo con el meta token, en lugar de scraping del DOM.
10. ◻ Si se quiere evitar el popup de re-login: implementar un "keep-alive" de sesión (petición ligera periódica antes del timeout) o detectar el 401 interno y avisar.

### 🎯 Decisión de arquitectura (29/08/2026) — FASE 1 "Espejo en vivo"
- **Alcance:** panel/vista que consulta citas en vivo **desde la pestaña de TidyWork abierta** (content-script inyectado = mismo origen → cookies automáticas, cero CORS, cero backend).
- **Sesión:** "sesión del propio navegador" (cada usuario usa SU sesión). Sin login nuevo, sin cuenta central.
- **Datos objetivos Fase 1:** citas **no trabajadas** `POST /Appointment/Filter` con `Filter=JSON.stringify({StatusIds:'[3,4,5]', StartDate, EndDate, ...})` + estados (ENVIADO/EN_CAMINO/EN_CURSO) + cambio a ENVIADO vía `POST /Appointment/SendAppointmentTechnical { Id, StatusId, StatusName, TechnicalReference }`.
- **Datos de vista en vivo (mapa/control):** `GET /Control/GetEvents` con `{ TerritoryId, TypesId, StatusId, StartDate, EndDate, TechnicalsId }` devuelve eventos+markers+polígonos+técnicos en una sola llamada (ideal para un mini-mapa/calendario propio).

### Cómo completar el mapeo restante (acción requerida)
El **mapa de derivación de citas** ya está mapeado (módulo `/Control`, página `Tidy Work _ Calendario.html`). Queda solo el detalle/edición de cita `Manage/{id}`:
1. En el navegador, andá a una cita dentro de `/Control` → abrí el modal → o entrá directo a `/Appointment/Manage/{id}`.
2. **Ctrl+S** (guardar página completa) → se genera el `.html` + su carpeta `_files`.
3. Dime la ruta y extraemos sus endpoints (guardar/cambiar datos de la cita).

---

## 🌐 TERRITORIOS / REGIONALES Y MUNICIPIOS (IDs confirmados 29/08/2026)

Fuente: `POST /WorkOrder/GetTerritorys { territoryId:<idRegional> }` (y `Appointment/GetTerritorys`). El endpoint devuelve `Data = [{ Id, Name }]` con los municipios de una regional.

| Regional | idRegional | Municipios (Id = Name) |
|---|---|---|
| **Chuquisaca** | **5** | 16 = Sucre |
| **Tarija** | **6** | 17 = Tarija, 53 = Villamontes, 54 = Yacuiba |
| **Santa Cruz** | **2** | 7 = Santa Cruz De La Sierra, 8 = Montero, 9 = La Guardia, 10 = Cotoca, 11 = El Torno, 22 = Satelite, 23 = Warnes, 24 = Camiri, 25 = Buena Vista, 26 = La Angostura, 27 = Pailon, 28 = Samaipata, 29 = San Julian, 30 = Yapacani |
| **Oruro** | **18** | 19 = Oruro(Cercado) |
| **Beni** | **20** | 21 = Cercado (Trinidad) |
| **Potosi** | **55** | 56 = Potosi(Cercado) |
| **La Paz** | ⏳ (13 no es) | falta ID real |
| **Cochabamba** | ⏳ (14 no es) | falta ID real |

**🔥 Hallazgo clave (29/08):** `POST /WorkOrder/GetTerritorys { territoryId: 1 }` devuelve **TODOS los territorios del sistema** (27 items = regionales + municipios) en una sola llamada. Es el "catálogo maestro" de IDs.

**Nota:** La Paz y Cochabamba **no aparecen** en el catálogo actual (IDs 3,4,12,13,14,15,16,30,31,32,40,50,60,70 → devuelven 0 municipios). Probablemente aún no existen como regionales activas en TidyWork, o usan un ámbito distinto al de `GetTerritorys`. Confirmado con la regional 1 que el listado maestro no las contiene.

---

## 📝 Notas de captura (crudas)

### Captura 1 — GetNotifications
```
GET /Home/GetNotifications?
Referer: https://tidywork.dismac.com.bo/WorkOrder/Edit/48617
tidy-fetch: true
```
### Captura 2 — Listado completo de órdenes
```
POST /WorkOrder/Get
Content-Type: application/x-www-form-urlencoded
Body: ~307 bytes (filtros)
Referer: https://tidywork.dismac.com.bo/workorder
200 OK, application/json; charset=utf-8
```
### Captura 3 — Sub-estados
```
POST /WorkOrder/GetListSubStatus
Content-Type: application/x-www-form-urlencoded
Body: ~25 bytes (ej. WorkStatusId=18)
Referer: /WorkOrder/Edit/48617
200 OK, JSON
```
### Captura 4 — JS de gestión de órdenes
```
GET /assets/js/customize/WorkOrder/Manage.js?v=99a664a3-...
122 KB, text/javascript
Contiene la lógica de edición/guardado (los endpoints reales que faltan)
```
### Fuente adicional — `Manage.js` (descargado localmente)
```
Archivo: "Tidy Work _ Orden de Trabajo_files\Manage.js.descarga" (122 KB)
Extraídos de aquí: ~39 endpoints de /WorkOrder/* + el mecanismo de sesión (Layout.js)
Los archivos .descarga se obtuvieron guardando la página completa (Ctrl+S) en el escritorio.
```
### Fuentes adicionales
```
Entities.js.descarga  → modelos/tipos (Appointment, WorkOrderAppointment, Calendar, etc.)
Enum.js.descarga      → Enums (EnumAppointmentStatus, EnumWorkOrderStatus, EnumWorkTypes, EnumTypeTransport)
Layout.js.descarga    → Fetch()/SendPost/SendGet + ValidateLogin (anti-deslogueo) + /Account/GetUrlAuthentication
ExtendFunctions.js.descarga → /Home/GetUser
Index.js.descarga     → /Home/SearhCriteria (búsqueda global)
fcm.js.descarga       → Sistema de notificaciones push (Firebase FCM): GetFirebaseConfig, RegisterDevice, GetNotifications, ReadNotification
Index(1).js.descarga  → JS de la página de citas (/Appointment): Filter, SaveFilter, GetTerritorys, GetTechnicalsByTerritories
DataTable.js.descarga → wrapper del DataTable (lee la config ajax que le pasa Index(1).js)
Index(1).js (Calendario) → JS del módulo /Control (mapa+calendario): GetEvents, SendAppointmentTechnical, GetDetailById, RescheduleAppointment, GetTechnicals, SaveFilter, AbsenceTecnical, CreateListAbsences, GetTerritorys
Map.js/leaflet*.js    → mapa Leaflet (polígonos + marcadores + providers + fullscreen)
event-calendar.js     → timeline de agenda con drag&drop (RescheduleAppointment)
```
