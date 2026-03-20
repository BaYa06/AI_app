# План: Система приглашений учеников в курс

> **Цель:** Учитель генерирует ссылку → отправляет в WhatsApp → ученик открывает → принимает приглашение → курс появляется у ученика с автосинком всех наборов.

---

## Архитектура одним взглядом

```
Учитель                    Сервер (Neon DB)              Ученик
───────                    ───────────────               ──────
[три точки] → Пригласить
                    → создать invite token
                    ← ссылка: flashly.app/join/TOKEN
отправляет в WhatsApp
                                              открывает ссылку
                                    ← данные курса + учителя
                                              [Принять / Отклонить]
                                    → записать в course_members
                                              курс появляется в боковом меню
                                              наборы загружаются (read-only)
```

---

## Шаг 1 — База данных (1 миграция)

**Файл:** `database/migrations/007_course_invites.sql`

### Новые таблицы

```sql
-- Токены приглашений
CREATE TABLE course_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  token       VARCHAR(64) UNIQUE NOT NULL,   -- случайный токен, например: abc123xyz
  created_by  UUID NOT NULL,                 -- user_id учителя
  expires_at  TIMESTAMP,                     -- NULL = бессрочно
  created_at  TIMESTAMP DEFAULT NOW()
);

-- Участники курса (ученики)
CREATE TABLE course_members (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  joined_at   TIMESTAMP DEFAULT NOW(),
  role        VARCHAR(20) DEFAULT 'student', -- 'student' | 'teacher'
  UNIQUE(course_id, user_id)                 -- один ученик = одна запись
);

CREATE INDEX ON course_invites(token);
CREATE INDEX ON course_members(user_id);
CREATE INDEX ON course_members(course_id);
```

### Зачем две таблицы?
- `course_invites` — хранит ссылку. Одна ссылка на курс, работает для всех учеников.
- `course_members` — хранит кто уже вступил. Без дублей.

---

## Шаг 2 — API эндпоинты (2 функции)

**Файл:** `api/course-invite.js` (рядом с другими `/api/` файлами)

### POST `/api/course-invite/create`
Учитель нажал "Пригласить" → сервер создаёт или возвращает существующий токен.

```
Вход:  { courseId, userId (учителя) }
Выход: { token, inviteUrl: "https://flashlyapp.com/join/TOKEN" }
```

Логика:
1. Проверить что `userId` — владелец курса
2. Проверить есть ли уже токен для этого курса (не создавать дубли)
3. Если нет — сгенерировать `crypto.randomBytes(32).toString('hex')`
4. Сохранить в `course_invites`, вернуть ссылку

### GET `/api/course-invite/info?token=TOKEN`
Ученик открыл ссылку → приложение спрашивает: что за курс?

```
Вход:  ?token=TOKEN
Выход: { courseId, courseTitle, teacherName, teacherDisplayName }
```

Логика:
1. Найти токен в `course_invites`
2. JOIN с `courses` и `users` (учитель)
3. Вернуть данные для модального окна

### POST `/api/course-invite/join`
Ученик нажал "Принять".

```
Вход:  { token, userId (ученика) }
Выход: { success, courseId, courseTitle }
```

Логика:
1. Найти токен → получить courseId
2. INSERT в `course_members` (ON CONFLICT DO NOTHING — защита от двойного нажатия)
3. Вернуть данные курса для добавления в стор

---

## Шаг 3 — NeonService (новые методы)

**Файл:** `src/services/NeonService.ts`

```typescript
// Создать/получить инвайт-ссылку для курса
createCourseInvite(courseId: string, userId: string): Promise<string>

// Получить инфо о курсе по токену (для модалки у ученика)
getCourseInviteInfo(token: string): Promise<{
  courseId: string;
  courseTitle: string;
  teacherName: string;
} | null>

// Принять приглашение
joinCourseByToken(token: string, userId: string): Promise<{
  courseId: string;
  courseTitle: string;
} | null>

// Загрузить курсы где пользователь ученик (при старте приложения)
loadStudentCourses(userId: string): Promise<Course[]>

// Загрузить наборы курса учителя (read-only копии)
loadCourseSetsByMembership(courseId: string): Promise<CardSet[]>
```

---

## Шаг 4 — Deep Link обработка

### Как работает ссылка `flashly.app/join/TOKEN`

#### Вариант A — Приложение уже установлено (iOS / PWA)

В `src/App.tsx` уже есть `Linking.addEventListener`. Добавить обработку нового паттерна:

```typescript
// Существующий код обрабатывает: flashly://auth-callback?code=...
// Добавить обработку: flashly://join/TOKEN  или  https://flashlyapp.com/join/TOKEN

const handleUrl = async (url: string) => {
  // Существующий auth код...

  // НОВОЕ: обработка приглашения
  const joinMatch = url.match(/\/join\/([a-f0-9]{64})/);
  if (joinMatch) {
    const token = joinMatch[1];
    // Сохранить токен в pendingInviteToken (zustand или AsyncStorage)
    // Если пользователь авторизован → сразу показать модалку
    // Если нет → сохранить, показать после авторизации
    setPendingInviteToken(token);
  }
};
```

#### Вариант B — Приложение НЕ установлено

Нужна landing page по адресу `flashlyapp.com/join/TOKEN`:
- Показывает название курса и учителя (через `/api/course-invite/info?token=TOKEN`)
- Кнопки: "Скачать для iOS" / "Открыть как PWA"
- После установки deep link сработает автоматически

**Файл:** `public/join.html` или отдельный роут в Next.js / Vercel

---

## Шаг 5 — Модальное окно у ученика

**Новый файл:** `src/components/CourseInviteModal.tsx`

```
┌─────────────────────────────────┐
│  🎓  Приглашение в курс         │
│                                 │
│  Немецкий язык A1               │
│  ────────────────               │
│  Учитель: Айбек Жунусов         │
│                                 │
│  Вас приглашают присоединиться  │
│  к курсу и изучать материалы    │
│                                 │
│  [ Отклонить ]  [ Принять ✓ ]   │
└─────────────────────────────────┘
```

Логика:
1. Компонент получает `token` через `pendingInviteToken` из стора
2. При маунте вызывает `getCourseInviteInfo(token)` → заполняет UI
3. "Принять" → `joinCourseByToken(token, userId)` → добавить курс в `coursesStore` как read-only
4. "Отклонить" → очистить `pendingInviteToken`
5. Показывается поверх всего (в `App.tsx` или в корне навигации)

---

## Шаг 6 — Курс ученика в боковом меню

### Новое поле в типе `Course`

```typescript
// src/types/index.ts
interface Course {
  id: string;
  title: string;
  emoji?: string;
  // НОВОЕ:
  isStudentCourse?: boolean;  // true = курс учителя, нельзя редактировать
  teacherName?: string;       // "Айбек Жунусов"
  ownerId?: string;           // userId учителя
}
```

### Изменения в HomeScreen (боковое меню)

Для курсов с `isStudentCourse: true`:
- Три точки НЕ показываются (нельзя переименовать / удалить)
- Иконка 🎓 вместо обычного эмодзи
- Под названием маленький текст: "Курс: Айбек Жунусов"
- При попытке редактировать набор → показать toast "Этот набор создан учителем"

---

## Шаг 7 — Автосинхронизация наборов

### Принцип работы

Наборы учителя НЕ копируются к ученику. Ученик читает оригинальные наборы учителя напрямую из БД. Это гарантирует мгновенный синк при изменениях.

### При загрузке приложения (`DatabaseService.loadAll`)

```typescript
// 1. Загрузить свои курсы (как раньше)
const myCourses = await NeonService.loadCourses(userId);

// 2. НОВОЕ: загрузить курсы где я ученик
const studentCourses = await NeonService.loadStudentCourses(userId);

// 3. Для каждого student курса — загрузить наборы учителя
for (const course of studentCourses) {
  const sets = await NeonService.loadCourseSetsByMembership(course.id);
  // Добавить в setsStore как read-only (setId остаётся оригинальным)
}
```

### Маркировка наборов как read-only

```typescript
// src/types/index.ts
interface CardSet {
  // ... существующие поля
  isReadOnly?: boolean;       // true = набор учителя
  ownerCourseId?: string;     // к какому курсу учителя принадлежит
}
```

В `SetEditor` и `CardEditor` — если `isReadOnly: true` → показать сообщение и заблокировать редактирование.

---

## Шаг 8 — UI: кнопка в боковом меню (три точки)

Уже существует модалка инвайта в `HomeScreen.new.tsx` (с моковой ссылкой). Нужно:

1. Подключить реальный метод `NeonService.createCourseInvite(courseId, userId)`
2. Заменить моковый `inviteBaseUrl` на реальный домен
3. Кнопка "Копировать" → `Clipboard.setString(realLink)`
4. Добавить кнопку "Поделиться" → `Share.share({ message: link })` (открывает WhatsApp и др.)

---

## Порядок реализации (что делать первым)

| # | Задача | Файл | Примерно |
|---|--------|------|----------|
| 1 | Миграция БД | `007_course_invites.sql` | 30 мин |
| 2 | API эндпоинты | `api/course-invite.js` | 2 ч |
| 3 | NeonService методы | `NeonService.ts` | 1 ч |
| 4 | Реальная ссылка в HomeScreen | `HomeScreen.new.tsx` | 30 мин |
| 5 | Модалка принятия у ученика | `CourseInviteModal.tsx` | 2 ч |
| 6 | Deep link обработка | `App.tsx` | 1 ч |
| 7 | Загрузка student курсов | `DatabaseService.ts` | 1.5 ч |
| 8 | Read-only наборы в UI | `SetEditor`, `CardEditor` | 1 ч |
| 9 | Landing page `/join/TOKEN` | `public/join.html` | 2 ч |

**Итого: ~11 часов чистой разработки**

---

## Что НЕ входит в этот план (на потом)

- Статистика прохождения учениками
- Удаление ученика из курса учителем
- Push-уведомления о новых наборах
- Лимит 30 учеников на курс
- Отзыв приглашения

---

## Важные решения

**Почему токен, а не просто courseId в ссылке?**
Безопасность — знание courseId не должно давать доступ к курсу. Токен можно отозвать.

**Почему одна ссылка на курс, а не per-student?**
Учитель отправляет в WhatsApp группу — одну ссылку кликают все 30 учеников. Это удобнее чем отправлять каждому отдельно.

**Почему наборы не копируются, а читаются напрямую?**
Копирование создаёт проблему синка — нужно отслеживать изменения и обновлять копии. Чтение оригинала даёт синк бесплатно.
