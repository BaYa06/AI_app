// ============================================================
// Flashly Service Worker — PWA cache + Firebase Cloud Messaging
// ============================================================
// ВАЖНО: bump CACHE_VERSION при каждом значимом изменении SW,
// webpack contenthash в именах чанков позаботится об остальном.
const CACHE_VERSION = 11;
const CACHE_NAME = `flashly-static-v${CACHE_VERSION}`;
const CACHE_FONTS = 'flashly-fonts-v1';
const CACHE_IMAGES = 'flashly-images-v1';

// Лимиты кэша
const MAX_STATIC_ENTRIES = 80;
const MAX_IMAGE_ENTRIES = 50;

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

// ==================== LRU Cache Cleanup ====================

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  // Удаляем самые старые (первые в списке = добавлены раньше)
  const toDelete = keys.length - maxEntries;
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
  console.log(`[SW] Trimmed ${cacheName}: removed ${toDelete} entries`);
}

// ==================== Dynamic Precache ====================
// Загружаем index.html, парсим <script> и <link> теги,
// кэшируем все бандлы при установке.

async function precacheBundles(cache) {
  try {
    const response = await fetch('/', { cache: 'no-cache' });
    if (!response.ok) return;

    const html = await response.text();
    await cache.put(new Request('/'), new Response(html, {
      headers: response.headers,
    }));

    // Извлекаем URL бандлов из HTML
    const bundleUrls = [];
    const scriptRegex = /src="([^"]*\.[a-f0-9]{8,}\.(?:js|chunk\.js))"/g;
    const cssRegex = /href="([^"]*\.[a-f0-9]{8,}\.css)"/g;

    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      bundleUrls.push(match[1]);
    }
    while ((match = cssRegex.exec(html)) !== null) {
      bundleUrls.push(match[1]);
    }

    if (bundleUrls.length > 0) {
      console.log('[SW] Precaching bundles:', bundleUrls);
      await cache.addAll(bundleUrls);
    }
  } catch (err) {
    console.warn('[SW] Bundle precache failed:', err);
  }
}

// ------ Install: precache + мгновенная активация ------
self.addEventListener('install', (event) => {
  console.log('[SW] Installing, cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Статический precache
        await cache.addAll(PRECACHE_URLS).catch((err) =>
          console.warn('[SW] Static precache failed:', err)
        );
        // Динамический precache бандлов
        await precacheBundles(cache);
      })
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
          // Удаляем старые версии основного кэша, но сохраняем fonts/images
          if (name !== CACHE_NAME && name !== CACHE_FONTS && name !== CACHE_IMAGES) {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      )
    )
  );
  self.clients.claim();
});

// ------ Fetch: стратегии по типу ресурса ------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Пропускаем не-GET, API-запросы и OAuth callback
  if (request.method !== 'GET' || request.url.includes('/api/') || request.url.includes('/auth-callback')) {
    return;
  }

  // ===== Google Fonts — Cache First (долгоживущий) =====
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_FONTS).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // ===== Firebase SDK CDN — пропускаем (importScripts, не fetch) =====
  if (url.hostname === 'www.gstatic.com') {
    return;
  }

  // ===== Navigation (HTML) — ВСЕГДА network-first =====
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

  // ===== Hashed assets (bundle.[hash].js, vendor.[hash].js) — cache-first, immutable =====
  const isHashedAsset = /\.[a-f0-9]{8,}\.(js|css)$/.test(url.pathname);

  if (isHashedAsset) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, clone);
              trimCache(CACHE_NAME, MAX_STATIC_ENTRIES);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // ===== Images (включая CDN / cross-origin) — cache-first =====
  const isImage = /\.(png|jpg|jpeg|gif|svg|webp|avif|ico)(\?.*)?$/i.test(url.pathname);

  if (isImage) {
    event.respondWith(
      caches.open(CACHE_IMAGES).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            // Кэшируем любые успешные ответы, включая opaque (cross-origin)
            if (response.status === 0 || response.ok) {
              cache.put(request, response.clone());
              trimCache(CACHE_IMAGES, MAX_IMAGE_ENTRIES);
            }
            return response;
          }).catch(() => cached); // Офлайн fallback
        })
      )
    );
    return;
  }

  // ===== Other static assets — cache-first =====
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Кэшируем basic и cors ответы (не opaque для неизвестных ресурсов)
        if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
            trimCache(CACHE_NAME, MAX_STATIC_ENTRIES);
          });
        }
        return response;
      });
    })
  );
});

// ==================== SKIP_WAITING message ====================
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
