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
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification?.title || 'Notificación de Dismac';
    const notificationOptions = {
        body: payload.notification?.body || 'Tienes un nuevo mensaje.',
        icon: '/icono-servicio-tecnico.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
