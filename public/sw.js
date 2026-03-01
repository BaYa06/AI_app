// ============================================================
// Flashly Service Worker — PWA cache + Firebase Cloud Messaging
// ============================================================
// ВАЖНО: bump CACHE_VERSION при каждом значимом изменении SW,
// webpack contenthash в именах чанков позаботится об остальном.
const CACHE_VERSION = 10;
const CACHE_NAME = `flashly-static-v${CACHE_VERSION}`;

// ==================== FCM (Firebase Cloud Messaging) ====================
// Compat-версия Firebase — единственная, которая стабильно работает в SW.
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyAJIhirrPAvSLQRGI2ahDyV7oJKEQWGdA0',
  authDomain: 'flashly-84e0a.firebaseapp.com',
  projectId: 'flashly-84e0a',
  storageBucket: 'flashly-84e0a.firebasestorage.app',
  messagingSenderId: '509047998599',
  appId: '1:509047998599:web:abc45e563dee361b185022',
  measurementId: 'G-T7WRY5SBC6',
});

const messaging = firebase.messaging();

// Background Push — когда страница НЕ в фокусе или закрыта
messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background push:', payload);

  const notification = payload.notification || {};
  const data = payload.data || {};

  const title = notification.title || data.title || 'Flashly';
  const options = {
    body: notification.body || data.body || '',
    icon: notification.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: data.tag || 'flashly-notification',
    data: { url: data.url || data.link || '/', ...data },
  };

  return self.registration.showNotification(title, options);
});

// Notification click — открываем нужную вкладку
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click:', event.notification.tag);
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ==================== PWA CACHE ====================

const PRECACHE_URLS = [
  '/',
  '/icons/icon-192.png',
  '/icons/splash-illustration.svg',
  '/fonts/Ionicons.ttf',
];

// ------ Install: precache + мгновенная активация ------
self.addEventListener('install', (event) => {
  console.log('[SW] Installing, cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
  self.skipWaiting();
});

// ------ Activate: удаляем ВСЕ старые кэши + забираем контроль ------
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating, claiming clients');
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ------ Fetch: network-first для HTML, cache-first для статики ------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Пропускаем не-GET, API/FCM-запросы и OAuth callback
  if (request.method !== 'GET' || request.url.includes('/api/') || request.url.includes('googleapis.com')) {
    return;
  }

  // Never cache or intercept the OAuth callback — let Supabase JS handle the code in URL
  if (request.url.includes('/auth-callback')) {
    return;
  }

  // Navigation (HTML) — ВСЕГДА network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // Hashed assets (bundle.[hash].js, vendor.[hash].js) — cache-first, long-lived
  const url = new URL(request.url);
  const isHashedAsset = /\.[a-f0-9]{8,}\.(js|css)$/.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Other static assets — cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
