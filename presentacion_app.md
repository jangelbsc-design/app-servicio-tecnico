# Presentación del Proyecto: Portal de Soporte Dismac (DISMATEC)

Hola Gemini, te presento el estado actual de nuestra aplicación de Servicio Técnico. Aquí tienes un resumen detallado de todo lo que hemos construido y la lógica que implementamos para que puedas apoyarnos con contexto completo.

## 1. Propósito General
La app es una **herramienta móvil-first** diseñada para el equipo de soporte de Dismac. Permite gestionar la red de talleres autorizados a nivel nacional, hacer seguimiento en tiempo real a las órdenes de servicio (ODT) y automatizar alertas de gestión.

## 2. Stack Tecnológico
- **Frontend**: HTML5, Vanilla CSS (Diseño corporativo "Outfit", limpio y moderno) y JavaScript (ES6+).
- **Fuentes de Datos**: Sincronización dinámica con **Google Sheets** (usando el endpoint JSON de Google) para catálogos de talleres y reportes globales de órdenes.
- **Integraciones**: 
  - **Firebase**: Firestore y Messaging (FCM) para futuras notificaciones push.
  - **Google Maps**: Geolocalización de talleres.
  - **WhatsApp**: Generación de mensajes estructurados con datos de la ODT para agilizar la comunicación con talleres.

## 3. Características Principales

### 🛠️ Red de Talleres
- Directorio organizado por regiones principales: **Tarija, Sucre, Santa Cruz**.
- **Acciones Rápidas**: Botones directos para llamar, abrir chat de WhatsApp o ver ubicación en Google Maps.
- **Buscador Regional**: Filtro en tiempo real por nombre de taller o marca.

### 📋 Estados de Servicio (Seguimiento de Órdenes)
- Visualización de órdenes activas filtradas por regiones (**Tarija, Sucre, Municipios, Oruro, Beni, Potosí**).
- **Lógica de "Municipios"**: Agrupación específica para Santa Cruz (Montero, Warnes, La Guardia, etc.).
- **Detalles Extendidos**: Acordeones con toda la info de la ODT (Producto, Fecha ingreso, Estado, Días transcurridos).
- **Cierre de Brechas**: Si no hay un taller asignado en sistema, la app permite enviar una consulta general por WhatsApp con los datos del equipo.

### 🚨 Alertas SLA (en Reportes y Gráficas)
La app monitorea el Reporte Global desde la sección de Reportes:
- **Reglas de Estancamiento**: Alerta si una orden tiene **N días sin cambios** de estado o **N días desde su apertura** (umbrales configurables).
- **Filtros de Seguridad**: No alerta sobre órdenes en estados finales (`cerrado`, `entregado`, `cancelado`, `error`).
- **Gestión de Alertas**: Cada alerta puede marcarse como atendida o restaurarse, y el estado queda guardado localmente.

### 📝 Protocolo de Recepción
- Guía interactiva paso a paso para el personal de tiendas:
  1. Validación Inicial (BLEND).
  2. Documentación (Tidy).
  3. Comunicación (WhatsApp Grupo).
  4. Logística (Taller).
  5. Cierre y Entrega.

## 4. Estructura de Archivos
- `index.html`: Estructura y carga de librerías (Firebase, PapaParse).
- `style.css`: Sistema de diseño basado en variables, efectos de desenfoque (blur) y responsive para móviles.
- `app.js`: Cerebro de la app. Maneja la navegación, el fetch de Google Sheets y el renderizado dinámico.
- `firebase-config.js` / `firebase-messaging-sw.js`: Configuración de Firebase y service worker para notificaciones push.
- `stitch-config.js` / `stitch-service.js`: Unificación de tokens de diseño (Google Stitch).

## 5. Últimos Avances y Mejoras
- **Seguridad en Renderizado**: Implementamos `escapeHTML` para evitar errores de layout o inyección de HTML con caracteres especiales.
- **Optimización de Búsqueda**: Añadimos buscadores regionales independientes para Talleres y Órdenes, además de una búsqueda global en el dashboard.
- **Consistencia Visual**: Ajuste de colores corporativos (Dismac Red: `#E31837`) y tipografía `Outfit`.
- **Lógica de Regiones**: Refinamiento en la detección de territorios para incluir municipios satélites de Santa Cruz de forma automática.

---
**Objetivo Actual**: Mantener la app sincronizada y funcional para los encargados regionales, facilitando el seguimiento de órdenes críticas y la comunicación con los talleres.
