# Озвучка слов через Azure Speech: сервер, кэш, без ключей в приложении

Сейчас озвучка в [speech.ts](../../src/utils/speech.ts) ходит в Google TTS прямо с телефона/сайта:
ключ и сервисный аккаунт `GCLOUD_TTS_*` вшиты в сборку открытым текстом, а биллинг в проекте GCP
выключен — Google отвечает 403, и звучит голос устройства/браузера.

Переходим на **Azure Speech** (нейросетевые голоса `…Neural`) через наш сервер: ключ только на Vercel,
каждое слово озвучивается один раз и дальше берётся из кэша. Голос устройства остаётся запасным.

Заменяет прежний план «Chirp 3 HD» (Google): новый аккаунт GCP с биллингом не нужен.

Шаг = коммит «TTS N». Отмечать ✅ по мере выполнения.

---

## Решения (06.11.2026)

1. **Провайдер — Azure Speech, тариф F0** (бесплатно ~0,5 млн символов в месяц, считаются символы,
   не токены). На F0 платить невозможно: при превышении Azure отвечает 429 до следующего месяца.
   Ресурс `flashly-speech-bk`, группа `flashly-rg`, подписка Azure for Students,
   регион **`swedencentral`** (`westeurope` для подписки закрыт).
2. **Голоса — только обычные `…Neural`.** HD-голоса (`DragonHD…`) и голоса OpenAI на F0 отключены.
   По одному голосу на язык: en `AvaNeural`, de `KatjaNeural`, ru `SvetlanaNeural`, es `ElviraNeural`,
   fr `DeniseNeural`, it `ElsaNeural`, zh `XiaoxiaoNeural`, ja `NanamiNeural`, ko `SunHiNeural`,
   tr `EmelNeural`. Язык стороны карточки — из набора (`cardSpeechLangs`), как сейчас.
3. **Ключ только на сервере:** `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`. Локально — `.env.local`,
   на Vercel — Environment Variables (сначала только Preview/staging). В `babel.config.cjs` и
   `DefinePlugin` webpack их **не добавлять**.
4. **Сервер — `api/ai.js?fn=tts`** (`api/_ai/tts.js`), без новой Vercel-функции (лимит Hobby — 12).
   `POST { text, lang, rate }` → `{ audioContent: mp3 base64 }`. Только для вошедших (401 иначе) —
   чтобы чужие не тратили лимит. Текст до 300 символов, SSML с экранированием `& < > ' "`.
5. **Порядок голосов в приложении:** кэш → наш сервер (Azure) → голос устройства/браузера.
   Google убираем целиком (шаг TTS 4).
6. **Кэш на сервере (TTS 2):** mp3 — в Supabase Storage, запись — в Neon. Ключ кэша = голос + скорость +
   текст. Повторная озвучка того же слова любым пользователем лимит Azure не тратит.
7. **Совместимость (plan/new/release_safety.md):** сервер выкатываем раньше клиента. Старые сборки
   продолжают ходить в Google (403 → голос устройства) — для них ничего не меняется. Новая сборка на
   старом сервере получит 404 на `fn=tts` → голос устройства. Клиент выходит только сборкой Codemagic.
8. **База — только staging** до отдельного разрешения; прод-базу и `main` не трогаем.

---

## Шаги

### ✅ TTS 1 — сервер `fn=tts` и клиент через сервер (проверено локально 06.11.2026)

- `api/_ai/tts.js` — запрос в Azure, mp3 в base64; подключён в `api/ai.js`.
- `speech.ts`: `synthesizeToCache` сначала зовёт сервер (`apiFetch('ai', { fn: 'tts' })`), потом старый
  путь Google; в ключ кэша добавлен префикс `azure`, чтобы на телефоне не играли старые mp3 Google.
- `webpack.config.cjs`: маршрут `/api/ai` в dev-сервере — озвучка и ИИ работают в `npm run web`
  без `vercel dev`.
- `supabaseClient.ts`: адрес возврата после входа `||` вместо `??` — на localhost вход больше не уходит
  на боевой сайт. В Supabase → Redirect URLs добавлен `http://localhost:3000/**`.
- `speakWithGoogle` → `speakWithCloud`, логи «Google Cloud TTS» → «Cloud TTS» (иначе в консоли казалось,
  что звучит Google).
- Проверено: en, ru, de, tr — каждая сторона карточки своим голосом, ответы 200.

### TTS 2 — кэш mp3 на сервере

- Таблица `tts_cache` в Neon: `key` (sha256 от голос|скорость|текст), `voice`, `chars`, `path`,
  `created_at`. Создание — как у других таблиц (`CREATE TABLE IF NOT EXISTS`), только staging.
- Supabase Storage, бакет `tts` (публичное чтение): файл `<key>.mp3`.
- `fn=tts`: есть в кэше → сразу отдаём; нет → Azure → сохраняем файл и запись → отдаём.
- Ответ: `{ url }` (ссылка на mp3) вместо base64 — меньше трафика через Vercel. Клиент поддерживает оба
  ответа (`url` и `audioContent`) — на случай отката сервера.
- Ошибка записи в кэш не ломает озвучку: звук всё равно отдаём.

### TTS 3 — клиент: проигрывание по ссылке и кэш на устройстве

- Натив: mp3 по `url` скачивается в `Caches/tts-cache` (как сейчас для base64) и играет через
  `react-native-sound`; повтор — с диска без сети.
- Веб: `new Audio(url)`, кэш вкладки — ссылки, а не base64.
- `prefetchSpeech` (текущая и следующая карточка) — через тот же путь.
- Если сервер ответил 429 (лимит Azure) — до конца сессии приложения не ходим на сервер за новыми
  словами, сразу голос устройства (не спамим запросами).

### TTS 4 — убрать Google целиком

- Из `speech.ts` — `GOOGLE_TTS_ENDPOINT`, OAuth/JWT сервисного аккаунта, `preferredGoogleVoices`,
  `ENV_GCLOUD_TTS_*`.
- Из `babel.config.cjs` и `DefinePlugin` в `webpack.config.cjs` — все `*GCLOUD_TTS_*`.
- Из `.env`, `.env.local`, переменных Codemagic и Vercel — `GCLOUD_TTS_*`.
- **Вручную (пользователь):** в Google Cloud Console (проект `1073372649019`) удалить API-ключ и ключ
  сервисного аккаунта — они уже лежат в публичной сборке сайта.

### TTS 5 — защита лимита

- Дневной лимит символов на пользователя (таблица `api_rate_limits`, `action = 'tts'`, как у
  `fn=usage`). Попадание в кэш лимит не тратит. Значение — `TTS_DAILY_CHARS` (по умолчанию ~5 000).
- Месячный счётчик символов Azure в логах (`log.info('tts', …)`) — видеть, сколько осталось от 0,5 млн.
- Проверка расхода вручную: `az monitor metrics list … --metric SynthesizedCharacters`.

### TTS 6 — выкладка на staging и сборка

- Vercel → Environment Variables: `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` для **Preview** (ветка `dev`).
- Проверка на Preview-сайте `ai-app-git-dev-…vercel.app`: озвучка, кэш, повтор без запроса к Azure.
- Тестовая сборка `ios-testflight-staging` → проверка на устройстве (TestFlight).
- Прод (переменные Production, `main`) — только по отдельной команде, по чек-листу релиза.

---

## Заметки вне плана

- **Локальный запуск всего API:** `npm run web` обслуживает только часть `/api` (`ai`, `test`, пара
  старых маршрутов) — остальное 404, приложение уходит в офлайн. Полностью — `vercel login`, затем
  `vercel dev --listen 3000`. Перед этим проверить `.env.local`: в нём два `POSTGRES_URL`
  (строки 2 и 39) — должна быть база staging.
- **`LibraryCatalogScreen` падает**, если сервер не ответил (`Cannot read properties of undefined
  (reading 'length')` в `renderCatalog`) — экран должен показывать пустое/ошибку, а не ронять приложение.
  Отдельная задача.
