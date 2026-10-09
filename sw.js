/* Service Worker — Soporte Técnico Dismac
   Funciones: caching PWA (instalable/offline) + notificaciones FCM de fondo.
   Actualizar CACHE_VERSION al publicar cambios en el shell de la app. */
const CACHE_VERSION = 'dismac-app-v63';

// Shell local: debe estar completo para que la app funcione sin conexión.
const PRECACHE_LOCAL = [
    './',
    './index.html',
    './style.css?v=21',
    './app.js?v=61',
    './mapa-talleres.webp',
    './icono-servicio-tecnico.webp',
    './icon-192.png',
    './icon-512.png',
    './icon-512-maskable.png',
    './apple-touch-icon.png',
    './manifest.json'
];

// Recursos de CDN: si alguno falla, el SW igual se instala.
const PRECACHE_CDN = [
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
    'https://cdnjs.cloudflare.com/ajax/libs/PapaParse/5.4.1/papaparse.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
    'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
];

// --- FCM (background messages) ---
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js');
importScripts('https://www.gstatic.com/firebasejs/8.10.1/firebase-messaging.js');

const firebaseConfig = {
    apiKey: "AIzaSyD8uz0yEFRM34ENtE_TxWuqS7KZlyqCFzA",
    authDomain: "talleres-tecnicos-autorizados.firebaseapp.com",
    projectId: "talleres-tecnicos-autorizados",
    storageBucket: "talleres-tecnicos-autorizados.firebasestorage.app",
    messagingSenderId: "77094641799",
    appId: "1:77094641799:web:85d865f2d903198cfd1822"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[sw.js] Received background message ', payload);
    const notificationTitle = payload.notification?.title || 'Notificación de Dismac';
    const notificationOptions = {
        body: payload.notification?.body || 'Tienes un nuevo mensaje.',
        icon: './apple-touch-icon.png'
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// --- Instalación / Activación ---
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_VERSION);
        // 1) Shell local: primero atómico (rápido); si algo falla, se cachea lo que se pueda
        //    para no dejar la PWA sin service worker.
        try {
            await cache.addAll(PRECACHE_LOCAL);
        } catch (err) {
            console.warn('[sw] Precaché local incompleto, se reintenta recurso por recurso:', err);
            await Promise.allSettled(PRECACHE_LOCAL.map((url) => cache.add(url)));
        }
        // 2) CDN: nunca bloquean la instalación.
        const cdn = await Promise.allSettled(PRECACHE_CDN.map((url) => cache.add(url)));
        cdn.forEach((r, i) => {
            if (r.status === 'rejected') console.warn('[sw] No se pudo precachear:', PRECACHE_CDN[i]);
        });
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// --- Notificaciones: al tocar, abrir o enfocar la app ---
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const destino = (event.notification.data && event.notification.data.url) || './index.html';
    event.waitUntil((async () => {
        const clientes = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const cliente of clientes) {
            if ('focus' in cliente) return cliente.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(destino);
    })());
});

// --- Fetch: network-first para navegación, stale-while-revalidate para estáticos ---
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isSameOrigin = url.origin === self.location.origin;

    if (req.mode === 'navigate') {
        event.respondWith(
            fetch(req)
                .then((res) => {
                    if (res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
                    }
                    return res;
                })
                .catch(() =>
                    caches.match(req).then((m) => m || caches.match('./index.html'))
                )
        );
        return;
    }

    const staticAsset = isSameOrigin ||
        req.destination === 'script' || req.destination === 'style' || req.destination === 'font' || req.destination === 'image';

    if (!staticAsset) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            const networkPromise = fetch(req)
                .then((res) => {
                    if (res && res.ok) {
                        const clone = res.clone();
                        caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
                    }
                    return res;
                })
                .catch(() => cached);
            return cached || networkPromise;
        })
    );
});