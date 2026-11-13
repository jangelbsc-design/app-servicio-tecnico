# Agregar talleres desde la app

Este script es el único camino de **escritura** de la PWA hacia Google Sheets.
La app sigue leyendo las hojas como siempre (CSV público); para agregar un
taller le pega un POST a este Web App y el script escribe la fila.

## 1. Pegar el script

1. Abrir la hoja **RED DE TALLERES**:
   `https://docs.google.com/spreadsheets/d/1wV3Ch5U-HWfsnvDoc56mL-4JCy22e7STdYzvJgFoI2I`
2. Menú **Extensiones → Apps Script**.
3. Borrar el `function myFunction() {}` que viene por defecto.
4. Pegar todo el contenido de `AgregarTaller.gs`.
5. Cambiar la línea:
   ```js
   TOKEN: 'CAMBIA-ESTA-CLAVE',
   ```
   por una clave propia, por ejemplo `dismac-talleres-2026`. Es la que se va a
   pedir una sola vez en la app. No hace falta que sea larga, pero no la
   compartas.
6. Guardar (Ctrl+S).

## 2. Publicar el Web App

1. Botón **Implementar → Nueva implementación**.
2. Engranaje → **Aplicación web**.
3. Completar:
   - **Descripción:** `Agregar taller`
   - **Ejecutar como:** `Yo (tu cuenta)`
   - **Quién tiene acceso:** `Cualquier persona`
4. **Implementar**. Google va a pedir autorización la primera vez:
   *Revisar permisos → Avanzado → Ir a (nombre del proyecto) (no seguro)*.
   Es normal: el script es tuyo y solo toca tu hoja.
5. Copiar la **URL de la aplicación web**. Termina en `/exec`.

> Si más adelante cambiás el código, no alcanza con guardar: hay que ir a
> **Implementar → Administrar implementaciones → lápiz → Versión: Nueva versión**.

## 3. Comprobación rápida

Abrir la URL `/exec` en el navegador. Tiene que responder:

```json
{"ok":true,"servicio":"agregar-taller","version":1}
```

Si en cambio aparece una pantalla de login de Google, el acceso quedó en
"Cualquier persona con cuenta de Google": hay que volver a implementar con
**Cualquier persona**.

## 4. Usarla desde la app

1. Entrar como administrador.
2. **Red de talleres → Conectar Drive** (una sola vez por dispositivo):
   pegar la **URL del Web App** (`.../exec`) y la **clave** (el `TOKEN` del
   paso 1) → **Guardar conexión**.
3. **Red de talleres → Agregar taller**: completar ciudad, taller, marca,
   contacto y ubicación. Se guarda al final de `RED DE TALLERES`, con la ciudad
   escrita explícitamente (importante: la hoja arrastra la ciudad hacia abajo y
   una celda vacía haría que el taller herede la ciudad anterior).
4. La app recarga los datos y ofrece **Ver talleres de [ciudad]**.

### Agregar una marca a un taller existente

1. **Red de talleres → Editar taller**.
2. Elegir la ciudad y el taller. La app muestra la marca actual.
3. Escribir la marca nueva en **Agregar marca**. Se suma al final de la lista,
   separada por coma, sin borrar las anteriores y sin repetirla si ya estaba.
4. También se puede corregir el **contacto** o la **ubicación GPS**.
5. Guardar. La app recarga los datos y permite ver los talleres de esa ciudad.

> Esta acción usa `accion: "actualizar"` en el mismo Web App. Si el script
> desplegado es el anterior (solo crea), la app muestra un aviso pidiendo
> actualizarlo: pegar el nuevo `AgregarTaller.gs`, guardar y publicar
> **Nueva versión** (la URL `/exec` no cambia).

Cada actualización queda registrada en la pestaña **LOG CAMBIOS** (se crea sola):
fecha, usuario, ciudad, taller, fila y el detalle de lo que cambió.

> Si tocás **Agregar taller** sin conexión configurada, la app abre primero
> **Conectar Drive**. Para cambiarla después, usá la tarjeta **Conectar Drive**
> o el enlace **Cambiar** del formulario de alta o de edición.

## Qué valida el script

- Clave correcta.
- Ciudad y nombre del taller obligatorios.
- Al menos un teléfono **o** una ubicación.
- **Duplicados:** mismo nombre normalizado (sin tildes, mayúsculas ni signos)
  en la misma ciudad. Devuelve la fila donde ya existe.
- **Actualizar:** busca la fila por taller + ciudad (arrastrando la ciudad),
  suma la marca sin repetirla y solo escribe las celdas que cambiaron.
- Escribe como texto, así no se pierden ceros ni se interpretan fórmulas.
- `LockService` evita que dos altas simultáneas se pisen.
- Deja registro en la pestaña `LOG AGREGADOS` (altas) y `LOG CAMBIOS`
  (actualizaciones): fecha, usuario, ciudad, taller, fila y detalle.

## Seguridad

El token viaja en el cuerpo del POST y queda guardado en el `localStorage` del
dispositivo del administrador. Alcanza para una herramienta interna, pero no es
autenticación real: quien tenga la URL y la clave puede agregar filas. Si eso
preocupa, el siguiente paso es validar un ID token de Google en el script
(Opción B del análisis). Para revocar el acceso: cambiar `TOKEN` y publicar una
versión nueva.
