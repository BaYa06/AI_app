# Push-уведомления Flashly — План реализации

> Проверено и скорректировано на основе текущего кода. Дата: 2026-04-01

## Стек
- React Native Web + Vercel Serverless Functions
- Neon PostgreSQL (`@neondatabase/serverless`)
- Firebase FCM (клиент: `firebase` v12.9.0 уже установлен)
- Firebase Admin SDK (`firebase-admin` — **НЕ установлен**, нужен `npm install firebase-admin`)

---

## Исправления к исходному плану

### 1. `display_name` — уже в таблице `users`, а НЕ в `user_stats`
`NeonService.updateDisplayName()` обновляет `users.display_name`, и это уже работает.
- **В Задаче 2**: НЕ добавлять `display_name` в `user_stats`.
- **В Задаче 3** (`api/notify.js`): получать `display_name` через JOIN с `users`, не из `user_stats`.

### 2. Milestone-уведомления — код должен быть ДО `return`, не после
В `src/store/settingsStore.ts` функция `finishStudySession` (строка ~185):
```
return { streakIncreased: true, newStreakCount: newCount };  // ← RETURN
// после return код не выполняется!
```
Milestone-fetch нужно вставить **перед** этим `return`.

### 3. Rewrite для `/api/cron/` — уже покрыт
В `vercel.json` уже есть:
```json
{ "source": "/api/(.*)", "destination": "/api/$1" }
```
Это покрывает все `/api/*` включая `/api/cron/*`. Отдельный rewrite для cron **не нужен**.

### 4. `firebase-admin` не установлен
Перед Задачей 3 нужно: `npm install firebase-admin`

---

## Порядок выполнения

**Задача 1 → Задача 2 → Задача 6 → `npm install firebase-admin` → Задача 3 → Задача 4 → Задача 5**

---

## Чеклист реализации

- [ ] 1. `api/_db-init.js` — добавить CREATE TABLE `push_tokens`
- [ ] 2. `api/_db-init.js` — добавить ALTER TABLE `user_stats` (5 notif-колонок)
- [ ] 3. `api/push.js` — переписать на Neon (убрать `_push-store.js`), добавить `get-by-user`
- [ ] 4. `api/user-settings.js` — создать (GET/POST настроек уведомлений)
- [ ] 5. `NotificationSettingsScreen.tsx` — загрузка и сохранение через `api/user-settings`
- [ ] 6. `.env.example` — добавить `FIREBASE_SERVICE_ACCOUNT`, `NOTIFY_SECRET`, `EXPO_PUBLIC_NOTIFY_SECRET`, `CRON_SECRET`
- [ ] 7. `npm install firebase-admin`
- [ ] 8. `api/notify.js` — создать центральный отправщик FCM
- [ ] 9. `api/cron/streak-reminder.js` — создать
- [ ] 10. `api/cron/reactivation.js` — создать
- [ ] 11. `vercel.json` — добавить maxDuration для двух cron-файлов
- [ ] 12. `NeonService.ts:1067` — добавить fetch при потере стрика
- [ ] 13. `settingsStore.ts:~183` — добавить milestone fetch перед return
- [ ] 14. Задеплоить на Vercel, добавить env-переменные в Vercel Dashboard
- [ ] 15. cron-job.org — создать 2 задания (streak-reminder в 17:00, reactivation в 10:00 UTC)

---

## ЗАДАЧА 1 — Миграция push_tokens в Neon

**Файлы:** `api/_db-init.js`, `api/push.js`

### 1. В `api/_db-init.js` добавить создание таблицы:
```sql
CREATE TABLE IF NOT EXISTS push_tokens (
  token TEXT PRIMARY KEY,
  user_id UUID,
  platform VARCHAR(20) DEFAULT 'web',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. Переписать `api/push.js` — убрать `_push-store.js`, использовать Neon:
- `action=subscribe`: `INSERT ... ON CONFLICT (token) DO UPDATE SET user_id, updated_at`
- `action=unsubscribe`: `DELETE FROM push_tokens WHERE token = $1`

### 3. Добавить `action=get-by-user`:
```sql
SELECT token FROM push_tokens WHERE user_id = $1
```

**Не удалять** `api/push/_push-store.js` — просто не импортировать его в `api/push.js`.

---

## ЗАДАЧА 2 — Сохранение настроек уведомлений

**Файлы:** `api/_db-init.js`, новый `api/user-settings.js`, `src/screens/NotificationSettingsScreen.tsx`

### 1. В `api/_db-init.js` добавить миграцию `user_stats`:
```sql
ALTER TABLE user_stats
  ADD COLUMN IF NOT EXISTS notif_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_hour INTEGER DEFAULT 19,
  ADD COLUMN IF NOT EXISTS notif_minute INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notif_days TEXT DEFAULT 'mon,tue,wed,thu,fri',
  ADD COLUMN IF NOT EXISTS notif_streak BOOLEAN DEFAULT true;
```
> ⚠️ НЕ добавлять `display_name` — он уже есть в таблице `users`.

### 2. Создать `api/user-settings.js`:
- `GET ?userId=xxx` → возвращает `notif_*` поля из `user_stats`
- `POST { userId, notifEnabled, notifHour, notifMinute, notifDays, notifStreak }` → upsert в `user_stats`

### 3. В `NotificationSettingsScreen.tsx`:
- При загрузке: `fetch('/api/user-settings?userId=' + userId)` → заполнить state
- При сохранении: `POST /api/user-settings` с данными из state
- userId: `supabase.auth.getSession().then(d => d.data.session?.user?.id)`
- Кнопка "Сохранить" уже есть (строка ~294), сейчас только вызывает `navigation.goBack()` — нужно добавить POST перед этим

---

## ЗАДАЧА 6 — Переменные окружения

**Файл:** `.env.example`, `vercel.json`

### Добавить в `.env.example`:
```bash
# Firebase Admin SDK (серверная отправка push)
# Firebase Console → Project Settings → Service Accounts → Generate new private key
# Весь JSON в одну строку
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"flashly-84e0a",...}

# Секрет для защиты /api/notify
NOTIFY_SECRET=your-random-secret-string-here

# Публичная версия для вызова из клиента
EXPO_PUBLIC_NOTIFY_SECRET=your-random-secret-string-here
```

### Обновить `vercel.json` — добавить в `functions`:
```json
"api/cron/streak-reminder.js": { "maxDuration": 60 },
"api/cron/reactivation.js": { "maxDuration": 60 }
```
> ⚠️ Rewrite для `/api/cron/*` НЕ нужен — уже покрыт существующим правилом `/api/(.*)`.

---

## ЗАДАЧА 3 — `api/notify.js`

**Зависит от:** Задачи 1 и 2, `npm install firebase-admin`

### Перед созданием файла:
```bash
npm install firebase-admin
```

### Создать `api/notify.js`:

**POST** `{ userId, type, data? }`  
Заголовок: `Authorization: Bearer ${NOTIFY_SECRET}`

#### Запросы к Neon:
```sql
-- Токен
SELECT token FROM push_tokens WHERE user_id = $1

-- Данные пользователя (display_name из users, notif из user_stats)
SELECT 
  u.display_name,
  us.current_streak,
  us.longest_streak,
  us.notif_enabled,
  us.notif_streak
FROM user_stats us
JOIN users u ON u.id = us.user_id
WHERE us.user_id = $1
```

#### Инициализация Firebase Admin:
```js
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
  initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const messaging = getMessaging();
```
> Используй `getApps().length` проверку — serverless функции могут переиспользоваться между запросами.

#### Шаблоны (`type`):
| type | title | body |
|------|-------|------|
| `streak_reminder` | "Не теряй серию!" | `${name}, у тебя ${streak} дней подряд. Позанимайся сегодня!` |
| `streak_lost` | "Серия прервана" | `Серия в ${data.prevStreak} дней потеряна. Начни сегодня заново!` |
| `streak_milestone` | `${data.days} дней подряд!` | `${name}, это твой личный рекорд! Так держать` |
| `reactivation_3d` | "Давно не виделись" | `${name}, прошло 3 дня. Карточки ждут тебя!` |
| `reactivation_7d` | "Вернись к учёбе" | `Твой рекорд был ${longest} дней. Начни новую серию!` |

#### Отправка:
```js
await messaging.send({
  token: fcmToken,
  notification: { title, body },
  data: { type, url: '/' }
});
```

#### Защита:
```js
if (req.headers.authorization !== `Bearer ${process.env.NOTIFY_SECRET}`) {
  return res.status(401).json({ error: 'Unauthorized' });
}
```

---

## ЗАДАЧА 4 — Cron Jobs (через cron-job.org, бесплатно)

**Зависит от:** Задачи 3

Vercel Cron с кастомным расписанием — только Pro план. Используем **cron-job.org** — бесплатный сервис, который делает HTTP-запрос на наш URL по расписанию.

### Создать `api/cron/streak-reminder.js`:

```sql
SELECT us.user_id, us.current_streak, u.display_name,
       us.last_active_date, us.notif_enabled, us.notif_streak, pt.token
FROM user_stats us
JOIN push_tokens pt ON pt.user_id = us.user_id
JOIN users u ON u.id = us.user_id
WHERE us.notif_enabled = true
  AND us.notif_streak = true
  AND us.current_streak > 0
  AND us.last_active_date < CURRENT_DATE
```

Для каждого: `POST /api/notify` с `type: 'streak_reminder'`

Защита: проверять заголовок `Authorization: Bearer ${process.env.CRON_SECRET}`

### Создать `api/cron/reactivation.js`:

```sql
-- 3 дня неактивности
WHERE last_active_date = CURRENT_DATE - INTERVAL '3 days'
-- тип: reactivation_3d

-- 7 дней неактивности
WHERE last_active_date = CURRENT_DATE - INTERVAL '7 days'
-- тип: reactivation_7d
```

Защита: та же — `Authorization: Bearer ${process.env.CRON_SECRET}`

### vercel.json — НЕ добавлять секцию `crons`

Только добавить в `functions`:
```json
"api/cron/streak-reminder.js": { "maxDuration": 60 },
"api/cron/reactivation.js": { "maxDuration": 60 }
```

### Настройка cron-job.org (разово, после деплоя):

1. Зарегистрироваться на **cron-job.org**
2. Создать задание 1:
   - URL: `https://YOUR_APP.vercel.app/api/cron/streak-reminder`
   - Расписание: каждый день в **14:00 UTC** (20:00 Бишкек, UTC+6)
   - Headers: `Authorization: Bearer YOUR_CRON_SECRET`
3. Создать задание 2:
   - URL: `https://YOUR_APP.vercel.app/api/cron/reactivation`
   - Расписание: каждый день в **04:00 UTC** (10:00 Бишкек, UTC+6)
   - Headers: `Authorization: Bearer YOUR_CRON_SECRET`

### Добавить в `.env.example`:
```bash
# Секрет для защиты cron-эндпоинтов (тот же вводится в cron-job.org)
CRON_SECRET=your-random-secret-string-here
```

---

## ЗАДАЧА 5 — Событийные триггеры

**Зависит от:** Задачи 3

### СОБЫТИЕ 1 — Потеря стрика

**Файл:** [src/services/NeonService.ts](../src/services/NeonService.ts) строка 1066-1068

Найти:
```typescript
// Пропустили день(и) - начинаем заново
currentStreak = 1;
```

Добавить ПОСЛЕ `currentStreak = 1;`:
```typescript
// Fire-and-forget: уведомление о потере стрика
fetch('/api/notify', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + (process.env.EXPO_PUBLIC_NOTIFY_SECRET || '')
  },
  body: JSON.stringify({
    userId,
    type: 'streak_lost',
    data: { prevStreak: existing[0].current_streak }
  })
}).catch(() => {});
```

### СОБЫТИЕ 2 — Milestone стрика

**Файл:** [src/store/settingsStore.ts](../src/store/settingsStore.ts) строка ~183

Найти строку:
```typescript
return { streakIncreased: true, newStreakCount: newCount };
```

Добавить **ПЕРЕД** этой строкой:
```typescript
// Milestone notifications (7, 14, 30, 60, 100 дней)
const milestones = [7, 14, 30, 60, 100];
if (milestones.includes(newCount)) {
  const { data: sessionData } = await supabase.auth.getSession();
  fetch('/api/notify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + (process.env.EXPO_PUBLIC_NOTIFY_SECRET || '')
    },
    body: JSON.stringify({
      userId: sessionData?.session?.user?.id,
      type: 'streak_milestone',
      data: { days: newCount }
    })
  }).catch(() => {});
}
```

### СОБЫТИЕ 3 — Сохранение имени

**Файл:** [src/screens/PersonalInfoScreen.tsx](../src/screens/PersonalInfoScreen.tsx) строка ~376

`updateDisplayName` уже обновляет `users.display_name` через `NeonService` — дополнительная синхронизация с `user_stats` **не нужна**.  
В `api/notify.js` имя берётся из `users` через JOIN (см. Задача 3).

> ✅ Это событие уже работает корректно — ничего менять не нужно.

---

## Итого: новые файлы и изменения

| Файл | Действие |
|------|----------|
| `api/_db-init.js` | Добавить CREATE TABLE push_tokens + ALTER TABLE user_stats |
| `api/push.js` | Переписать на Neon (убрать `_push-store.js`) |
| `api/user-settings.js` | Создать (GET/POST настроек уведомлений) |
| `api/notify.js` | Создать (центральный отправщик FCM) |
| `api/cron/streak-reminder.js` | Создать |
| `api/cron/reactivation.js` | Создать |
| `src/screens/NotificationSettingsScreen.tsx` | Добавить load/save через `api/user-settings` |
| `src/services/NeonService.ts` | Добавить fetch в streak_lost ветке (строка 1067) |
| `src/store/settingsStore.ts` | Добавить milestone fetch перед return (строка ~183) |
| `vercel.json` | Добавить crons + functions для cron файлов |
| `.env.example` | Добавить FIREBASE_SERVICE_ACCOUNT, NOTIFY_SECRET, EXPO_PUBLIC_NOTIFY_SECRET |
| `package.json` | `npm install firebase-admin` |
| cron-job.org | Настроить 2 задания в UI после деплоя |
