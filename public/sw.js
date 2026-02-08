// ============================================================
// Flashly Service Worker — production-safe, anti-black-screen
// ============================================================
// ВАЖНО: bump CACHE_VERSION при каждом значимом изменении SW,
// webpack contenthash в именах чанков позаботится об остальном.
const CACHE_VERSION = 7;
const CACHE_NAME = `flashly-static-v${CACHE_VERSION}`;

// Ресурсы для precache (только иконки/статика без HTML — HTML всегда network-first)
const PRECACHE_URLS = [
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/splash-illustration.svg',
];

// ------ Install: precache + мгновенная активация ------
self.addEventListener('install', (event) => {
  console.log('[SW] Installing, cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
  // Не ждём, пока старый SW отпустит клиентов — активируемся сразу
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
  // Берём контроль над ВСЕМИ открытыми вкладками немедленно
  self.clients.claim();
});

// ------ Fetch: network-first для HTML, cache-first для статики ------
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Пропускаем не-GET и API-запросы
  if (request.method !== 'GET' || request.url.includes('/api/')) {
    return;
  }

  // === Navigation (HTML) — ВСЕГДА network-first ===
  // Это ключ: после redeploy пользователь сразу получит свежий index.html
  // с правильными ссылками на новые чанки.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Кэшируем свежий HTML для офлайна
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => {
          // Офлайн — отдаём закэшированную версию
          return caches.match(request).then((cached) => cached || caches.match('/index.html'));
        })
    );
    return;
  }

  // === Статические ассеты (JS/CSS/изображения/шрифты) — cache-first ===
  // Webpack добавляет contenthash в имена, поэтому cache-first безопасен.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request).then((response) => {
        // Кэшируем только успешные ответы от нашего origin
        if (response.ok && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
