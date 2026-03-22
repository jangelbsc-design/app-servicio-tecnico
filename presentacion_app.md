# Presentación del Proyecto: Portal de Soporte Dismac (DISMATEC)

Hola Gemini, te presento el estado actual de nuestra aplicación de Servicio Técnico. Aquí tienes un resumen detallado de todo lo que hemos construido y la lógica que implementamos para que puedas apoyarnos con contexto completo.

## 1. Propósito General
La app es una **herramienta móvil-first** diseñada para el equipo de soporte de Dismac. Permite gestionar la red de talleres autorizados a nivel nacional, hacer seguimiento en tiempo real a las órdenes de servicio (ODT) y automatizar alertas de gestión.

## 2. Stack Tecnológico
- **Frontend**: HTML5, Vanilla CSS (Diseño corporativo "Outfit", limpio y moderno) y JavaScript (ES6+).
- **Fuentes de Datos**: Sincronización dinámica con **Google Sheets** (usando el endpoint JSON de Google) para catálogos de talleres y reportes globales de órdenes.
- **Integraciones**: 
  - **Firebase**: Firestore y Messaging (FCM) para futuras notificaciones push.
  - **Telegram Bot API**: Notificaciones automáticas de órdenes estancadas/críticas.
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

### 🚨 Sistema de Alertas (Telegram)
Hemos implementado un bot que monitorea constantemente el Reporte Global:
- **Reglas de Estancamiento**: Alerta si una orden tiene **>4 días sin cambios** de estado o **>8 días desde su apertura**.
- **Filtros de Seguridad**: No alerta sobre órdenes en estados finales (`cerrado`, `entregado`, `cancelado`, `error`).
- **Filtro Geográfico**: Solo envía alertas de las regiones gestionadas activamente en la app.

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
- `app.js`: Cerebro de la app. Maneja la navegación, el fetch de Google Sheets, la lógica de Telegram y el renderizado dinámico.
- `data.js`: Respaldo estático de talleres (fallback).

## 5. Últimos Avances y Mejoras
- **Seguridad en Mensajería**: Implementamos `escapeHTML` para evitar errores en las notificaciones de Telegram con caracteres especiales.
- **Optimización de Búsqueda**: Añadimos buscadores regionales independientes para Talleres y Órdenes.
- **Consistencia Visual**: Ajuste de colores corporativos (Dismac Red: `#E31837`) y tipografía `Outfit`.
- **Lógica de Regiones**: Refinamiento en la detección de territorios para incluir municipios satélites de Santa Cruz de forma automática.

---
**Objetivo Actual**: Mantener la app sincronizada y funcional para los encargados regionales, facilitando el seguimiento de órdenes críticas y la comunicación con los talleres.
