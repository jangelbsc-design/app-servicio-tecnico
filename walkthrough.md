# Walkthrough - Mejoras de Interfaz y Funcionalidad

He completado una actualización mayor para mejorar la experiencia de usuario y facilitar el contacto con los talleres.

## Nuevas Funcionalidades

### 1. Botones Duales (Llamar / WhatsApp) 📱
- **Múltiples Contactos**: Si un taller tiene varios números (ej: "777-666"), el sistema ahora crea botones independientes para cada uno.
- **Acciones Directas**: Cada número tiene su propio botón de **Llamar** y de **WhatsApp**, eliminando la necesidad de copiar y pegar números.

### 2. Buscador Regional 🔍
- He movido el buscador de la pantalla principal a las pantallas regionales.
- Ahora puedes buscar talleres por nombre o marca directamente en la lista de cada ciudad.
- También se ha añadido un buscador en la sección de **Estados de Servicio** para filtrar por ODT, nombre de cliente o producto.

### 3. Tarjetas de Servicio Interactivas 📋
- **Diseño Expandible**: Las tarjetas de órdenes de servicio técnico ahora se pueden tocar para expandirse (acordeón), mostrando más detalles como la fecha, el síntoma de falla y el producto.
- **Integración con Talleres**: Si una orden indica que se encuentra en un taller específico (ej: SEYCOM), la tarjeta mostrará automáticamente los botones de contacto de ese taller para que no tengas que buscarlos por separado.

## Cómo Actualizar

Subir estos cambios es el último paso para verlos en tu enlace:

1. En la aplicación de terminal (`App`):
   ```bash
   git add .
   git commit -m "Mejoras de buscador, botones duales y tarjetas expandibles"
   git push origin main
   ```
*(O `git push origin master` según el nombre de tu rama)*.

Una vez subido, refresca tu página y disfruta de la nueva interfaz mejorada.
