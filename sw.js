/* Service Worker — Soporte Técnico Dismac
   Funciones: caching PWA (instalable/offline) + notificaciones FCM de fondo.
   Actualizar CACHE_VERSION al publicar cambios en el shell de la app. */
const CACHE_VERSION = 'dismac-app-v58';
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css?v=17',
    './app.js?v=58',
    './icono-servicio-tecnico.png',
    './mapa-talleres.png',
    './icono%20para%20botones.png',
    './icon-192.png',
    './icon-512.png',
    './icon-512-maskable.png',
    './apple-touch-icon.png',
    './manifest.json',
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
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
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