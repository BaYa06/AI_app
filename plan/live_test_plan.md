# План реализации: Закрытый Live-тест

> **Цель:** Учитель запускает тест по коду → ученики подключаются → каждый проходит тест самостоятельно с уникальной перемешкой вопросов → в конце учитель видит результаты для выставления оценок.

---

## Архитектура одним взглядом

```
Vercel (REST API)                 Supabase
─────────────────                 ──────────────────────────────
/api/test.js?action=create        Supabase Realtime Channels
/api/test.js?action=join          — test:{sessionId} (прогресс + события)
/api/test.js?action=start         — подписка учителя и учеников
/api/test.js?action=answer
/api/test.js?action=monitor
/api/test.js?action=finish
/api/test.js?action=results
        │
        ▼
  Neon PostgreSQL
  (3 новые таблицы)
```

**Реалтайм:** Supabase Realtime Channels — уже подключён (`@supabase/supabase-js`). Отдельный WebSocket-сервер **не нужен**. Все события (присоединение ученика, старт теста, прогресс, ответы) идут через Supabase Realtime каналы.

**Почему без WebSocket-сервера:**
- Supabase уже подключён, SSL настроен
- Не нужно открывать порт 3002, настраивать nginx, SSL-сертификаты
- Ответы отправляются через REST API (`/api/test.js?action=answer`), прогресс обновляется через Realtime
- Проще в поддержке — один канал связи вместо двух

---

## Шаг 1 — База данных

**Файл:** `database/migrations/011_live_test.sql`

> Последняя миграция — `010_add_onboarding_fields.sql`, поэтому следующая `011`.

### Таблица 1: `test_sessions` — одна запись на каждый тест

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `code` | VARCHAR(4) | Код для входа, например `4829` |
| `teacher_id` | UUID → users | Кто создал тест (поле `id` из `users` где `teacher = true`) |
| `set_id` | UUID → card_sets | Какой набор карточек используется |
| `course_id` | UUID → courses | К какому курсу относится (**обязательное** поле) |
| `test_mode` | VARCHAR(20) | `multiple` / `writing` / `mixed` |
| `question_count` | INTEGER | Сколько вопросов в тесте (5, 10, 15, 20, ...) |
| `time_per_question` | INTEGER | Секунды на вопрос (0 = без лимита, 10, 20, 30) |
| `status` | VARCHAR(20) | `waiting` / `active` / `finished` |
| `started_at` | TIMESTAMPTZ | Когда учитель нажал "Start Test" |
| `finished_at` | TIMESTAMPTZ | Когда тест завершился |
| `created_at` | TIMESTAMPTZ | Когда создана сессия |

**Отличия от исходного плана:**
- `code` — 4 цифры (как в `TestLobbyScreen`), не 6
- `course_id` — **NOT NULL** (все тестовые экраны получают `courseId` обязательно через навигацию)
- `time_limit_min` заменён на `time_per_question` (секунды на вопрос, как в `ExamLobbyScreen`: 0/10/20/30)
- Добавлено `test_mode` — тип теста из `ExamLobbyScreen`

### Таблица 2: `test_participants` — один ученик в одной сессии

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `session_id` | UUID → test_sessions | К какому тесту относится |
| `user_id` | UUID → users | Кто этот ученик (должен быть в `course_members` этого курса) |
| `display_name` | VARCHAR | Имя на экране (из `users.display_name`) |
| `question_order` | JSONB | Уникальная перемешка — массив `card_id` |
| `answer_count` | INTEGER DEFAULT 0 | Сколько вопросов уже ответил |
| `correct_count` | INTEGER DEFAULT 0 | Сколько правильных |
| `score` | INTEGER DEFAULT 0 | Итоговый процент (0–100, для лидерборда) |
| `joined_at` | TIMESTAMPTZ | Когда подключился |
| `finished_at` | TIMESTAMPTZ | Когда завершил все вопросы |
| `is_disqualified` | BOOLEAN DEFAULT FALSE | Вышел из приложения во время теста |

**Отличие:** Добавлено `score` — процент правильных для подиума/лидерборда (используется в `TestResultsTeacherScreen`).

### Таблица 3: `test_answers` — каждый ответ каждого ученика

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | Первичный ключ |
| `participant_id` | UUID → test_participants | Чей ответ |
| `card_id` | UUID → cards | На какую карточку ответ |
| `chosen_answer` | TEXT | Что ученик выбрал |
| `correct_answer` | TEXT | Правильный ответ (поле `back` карточки в БД / `backText` в TypeScript) |
| `is_correct` | BOOLEAN | Правильно или нет |
| `time_spent_sec` | INTEGER | Сколько секунд думал |
| `answered_at` | TIMESTAMPTZ | Когда ответил |

### Индексы

```sql
CREATE INDEX idx_test_sessions_code ON test_sessions(code) WHERE status IN ('waiting', 'active');
CREATE INDEX idx_test_sessions_teacher ON test_sessions(teacher_id);
CREATE INDEX idx_test_sessions_course ON test_sessions(course_id);
CREATE INDEX idx_test_participants_session ON test_participants(session_id);
CREATE INDEX idx_test_participants_user ON test_participants(user_id);
CREATE INDEX idx_test_answers_participant ON test_answers(participant_id);
```

> Индекс на `code` — частичный (только активные сессии), т.к. поиск по коду нужен только для входа.

---

## Шаг 2 — REST API (Vercel Functions)

**Файл:** `/api/test.js` (один файл с `?action=`, как `/api/course-invite.js`)

### `POST /api/test?action=create`
Учитель создаёт тест.

```
Вход:  { setId, courseId, testMode, questionCount, timePerQuestion, teacherId }
Выход: { sessionId, code: "4829" }
```

Логика:
1. Проверить что `teacherId` — владелец набора (или курса)
2. Сгенерировать 4-значный числовой код (уникальный среди сессий со статусом `waiting`/`active`)
3. Создать запись в `test_sessions` со статусом `waiting`
4. Вернуть `sessionId` и `code`

---

### `POST /api/test?action=join`
Ученик вводит код и подключается.

```
Вход:  { code: "4829", userId }
Выход: { sessionId, participantId, teacherName, setTitle, testMode, questionCount, timePerQuestion }
```

Логика:
1. Найти активную сессию по коду (статус `waiting` или `active`)
2. Проверить что ученик есть в `course_members` этого курса
3. Проверить что ученик ещё не в этой сессии
4. Взять карточки набора: `SELECT id, front, back FROM cards WHERE set_id = $1`
5. Случайно выбрать `questionCount` карточек, перемешать — уникально для этого ученика
6. Сохранить порядок в `test_participants.question_order`
7. Отправить событие в Supabase Realtime `test:{sessionId}` — `student_joined`
8. Вернуть данные для экрана ожидания

---

### `POST /api/test?action=start`
Учитель нажимает "Start Test".

```
Вход:  { sessionId, teacherId }
Выход: { ok: true, startedAt }
```

Логика:
1. Проверить что `teacherId` — владелец сессии
2. Поменять статус на `active`, записать `started_at`
3. Отправить событие в Supabase Realtime channel `test:{sessionId}` → `test_started`
4. Все ученики получат событие и перейдут к вопросам

---

### `POST /api/test?action=answer`
Ученик отправляет ответ на вопрос.

```
Вход:  { participantId, cardId, chosenAnswer, timeSpentSec }
Выход: { isCorrect, correctAnswer, nextQuestion: { cardId, front, options[] } | null }
```

Логика:
1. Найти карточку, проверить правильность (`cards.back === chosenAnswer`)
2. Сохранить в `test_answers`
3. Обновить счётчики в `test_participants` (`answer_count++`, `correct_count++`)
4. Если остались вопросы — сгенерировать варианты ответа для следующего и вернуть
5. Если вопросы закончились — пометить `finished_at`, посчитать `score`
6. Обновить прогресс через Supabase Realtime `test:{sessionId}` → `progress_update`

---

### `GET /api/test?action=monitor&sessionId=...`
Учитель получает текущий прогресс.

```
Выход: {
  status: "active",
  startedAt: "2026-03-26T10:00:00Z",
  timePerQuestion: 20,
  participants: [
    { name: "Anna", initial: "A", answered: 12, total: 20, done: false },
    { name: "Boris", initial: "B", answered: 20, total: 20, done: true },
    ...
  ]
}
```

> Данные так же приходят в реалтайме через Supabase channel — polling как fallback.

---

### `POST /api/test?action=finish`
Учитель принудительно завершает тест.

```
Вход:  { sessionId, teacherId }
Выход: { ok: true }
```

Помечает всех незавершивших как `finished_at = NOW()`, считает `score`, меняет статус сессии на `finished`. Отправляет `test_finished` в Supabase Realtime.

---

### `GET /api/test?action=results&sessionId=...`
Итоговые результаты для подиума и лидерборда.

```
Выход: {
  setTitle: "English Vocabulary A2",
  date: "2026-03-26",
  totalQuestions: 20,
  avgScore: 76,
  participants: [
    { name: "Alex Wong", initial: "A", score: 95, correct: 19, total: 20, finished: true },
    { name: "Sarah J.", initial: "S", score: 88, correct: 17, total: 20, finished: true },
    ...
  ],
  hardestCards: [
    { word: "Ambivalent", hint: "Having mixed feelings...", missed: 4, total: 5 },
    ...
  ]
}
```

> Формат `participants` совпадает с `LEADERBOARD` из `TestResultsTeacherScreen`, а `hardestCards` — с `HARDEST_CARDS`.

---

### `POST /api/test?action=get-question`
Ученик запрашивает текущий/следующий вопрос с вариантами.

```
Вход:  { participantId, questionIndex }
Выход: { cardId, front, options: ["answer1", "answer2", "answer3", "answer4"], questionIndex, totalQuestions }
```

Логика:
1. Получить `question_order` участника
2. Взять карточку по индексу
3. Сгенерировать 4 варианта (1 правильный `back` + 3 случайных `back` из того же набора)
4. Перемешать варианты

---

## Шаг 3 — Supabase Realtime каналы

Вместо WebSocket-сервера используем **Supabase Realtime Channels** — уже подключено через `@supabase/supabase-js`.

### Канал: `test:{sessionId}`

**События от сервера (через API):**

| Событие | Когда | Данные | Кто слушает |
|---------|-------|--------|-------------|
| `student_joined` | Ученик вошёл | `{ userId, displayName, initials }` | Учитель (TestLobbyScreen) |
| `test_started` | Учитель нажал Start | `{ startedAt }` | Ученики (TestWaitingScreen → TestExamScreen) |
| `progress_update` | Ученик ответил | `{ userId, answered, total, done }` | Учитель (LiveTestScreen) |
| `test_finished` | Тест завершён | `{ finishedAt }` | Ученики (TestExamScreen → TestDoneScreen) |

### Подключение на клиенте

```typescript
import { supabase } from '@/services/supabaseClient';

// Учитель подписывается в TestLobbyScreen
const channel = supabase.channel(`test:${sessionId}`);
channel
  .on('broadcast', { event: 'student_joined' }, ({ payload }) => {
    // Добавить ученика в список
  })
  .on('broadcast', { event: 'progress_update' }, ({ payload }) => {
    // Обновить прогресс ученика
  })
  .subscribe();

// Ученик подписывается в TestWaitingScreen
channel
  .on('broadcast', { event: 'test_started' }, () => {
    navigation.replace('TestExam', { ... });
  })
  .subscribe();
```

### Отправка событий из API

```javascript
// В /api/test.js (серверная сторона)
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

await supabase.channel(`test:${sessionId}`).send({
  type: 'broadcast',
  event: 'student_joined',
  payload: { userId, displayName, initials }
});
```

---

## Шаг 4 — Экраны учителя (React Native)

> 4 экрана учителя **уже существуют** с UI и mock-данными. Нужно подключить к реальным данным.

### `ExamLobbyScreen` (маршрут: `ExamLobby`)
**Файл:** `src/screens/ExamLobbyScreen.tsx` — **уже существует**

**Что уже есть:**
- Выбор набора карточек (пока захардкожен)
- Тип теста: `multiple` / `writing` / `mixed`
- Кол-во вопросов: степпер ±5, мин 5, макс 50
- Время на вопрос: 0 / 10с / 20с / 30с
- Кнопка "Создать тест" → переход на `TestLobby`

**Что нужно добавить:**
- Загрузить реальные наборы карточек курса из Neon
- При нажатии "Создать тест" — вызвать `POST /api/test?action=create`
- Передать `sessionId` и `code` на следующий экран

**Изменение навигации:** передавать `sessionId` и `code` в `TestLobby`
```typescript
// Было:
ExamLobby: { courseId: string; courseTitle: string }
// Стало:
ExamLobby: { courseId: string; courseTitle: string }
TestLobby: { courseId: string; courseTitle: string; sessionId: string; code: string; testMode: string; questionCount: number; timePerQuestion: number }
```

---

### `TestLobbyScreen` (маршрут: `TestLobby`)
**Файл:** `src/screens/TestLobbyScreen.tsx` — **уже существует**

**Что уже есть:**
- Код крупно (4 цифры) с QR-кодом
- Кнопка "Copy" для копирования кода
- Список подключённых учеников (mock)
- Пульсирующий индикатор "Ожидание учеников..."
- Бейдж "N joined"
- Кнопка "Start Test"

**Что нужно добавить:**
- Получить `code` из route params (вместо захардкоженного `'4829'`)
- Подписаться на Supabase Realtime channel `test:{sessionId}` → событие `student_joined`
- Обновлять список учеников в реальном времени
- При нажатии "Start Test" → вызвать `POST /api/test?action=start`
- Кнопка Start активна только когда `students.length >= 1`

---

### `LiveTestScreen` (маршрут: `LiveTest`)
**Файл:** `src/screens/LiveTestScreen.tsx` — **уже существует**

**Что уже есть:**
- Таймер обратного отсчёта (MM:SS)
- Карточка "Test in progress" с LIVE-бейджем
- Общий прогресс класса (%)
- Список учеников с прогресс-барами и статусом Done
- Кнопка "End test early" → переход на `TestResultsTeacher`

**Что нужно добавить:**
- Получить реальных участников из `GET /api/test?action=monitor`
- Подписаться на Supabase Realtime → `progress_update`
- Таймер: считать на основе `startedAt` + `timePerQuestion * questionCount`
- При нажатии "End test early" → вызвать `POST /api/test?action=finish`
- Auto-finish когда все ученики завершили или время вышло

---

### `TestResultsTeacherScreen` (маршрут: `TestResultsTeacher`)
**Файл:** `src/screens/TestResultsTeacherScreen.tsx` — **уже существует**

**Что уже есть:**
- Summary-карточка (название теста, avg score, кол-во студентов)
- Подиум (1-2-3 место с коронкой)
- Лидерборд (таблица с рангом, аватаром, именем, score%)
- Hardest Cards (слова с наибольшим числом ошибок)
- Кнопка "Export All Results"

**Что нужно добавить:**
- Загрузить данные из `GET /api/test?action=results`
- Заменить `LEADERBOARD` и `HARDEST_CARDS` mock-данные реальными
- Реализовать экспорт CSV

---

## Шаг 5 — Экраны ученика (React Native)

> Эти экраны **нужно создать с нуля**. Маршруты нужно добавить в навигацию.

### Новые маршруты для навигации

```typescript
// Добавить в RootStackParamList:
TestJoin: undefined;
TestWaiting: { sessionId: string; setTitle: string; teacherName: string; testMode: string; questionCount: number; timePerQuestion: number };
TestExam: { sessionId: string; participantId: string; testMode: string; questionCount: number; timePerQuestion: number };
TestDone: { correct: number; total: number };
```

### `TestJoinScreen` (маршрут: `TestJoin`)
**Файл:** `src/screens/TestJoinScreen.tsx` — **создать**

Ученик нажимает кнопку на главном экране (или в курсе) → попадает сюда.

**Элементы:**
- Поле ввода кода (4 цифры, крупная цифровая клавиатура)
- После ввода кода → вызов `POST /api/test?action=join`
- Показать карточку: название теста + имя учителя
- Кнопка "Войти"
- Ошибки: "Неверный код" / "Тест уже завершён" / "Вы не состоите в этом курсе"

---

### `TestWaitingScreen` (маршрут: `TestWaiting`)
**Файл:** `src/screens/TestWaitingScreen.tsx` — **создать**

**Элементы:**
- "Ты подключился к тесту"
- Название набора и имя учителя
- Анимация ожидания (пульсирующий индикатор, как в TestLobbyScreen)
- Подписка на Supabase Realtime `test:{sessionId}` → событие `test_started`
- При получении `test_started` → `navigation.replace('TestExam', { ... })`

---

### `TestExamScreen` (маршрут: `TestExam`)
**Файл:** `src/screens/TestExamScreen.tsx` — **создать**

Основной экран теста. **Навигация полностью заблокирована.**

**Элементы:**
- Прогресс: "Вопрос 8 из 20"
- Таймер на вопрос (если `timePerQuestion > 0`) — обратный отсчёт в секундах
- Слово (поле `front` / `frontText`) крупно по центру
- 4 кнопки с вариантами ответов
- После нажатия: подсветка зелёным (верно) или красным (неверно) + правильный ответ
- Через 1.5 сек — отправка `POST /api/test?action=answer` + получение следующего вопроса
- Если время на вопрос вышло — автоматическая отправка пустого ответа

**Блокировка выхода:**
```
Android: BackHandler.addEventListener('hardwareBackPress', () => true)
iOS:     usePreventRemove(true, () => {})
Web:     window.onbeforeunload = () => "Тест ещё не завершён"
Все:     AppState.addEventListener('change', ...) — фиксирует сворачивание
```

**Подписка на Supabase Realtime:**
- `test_finished` → принудительное завершение (учитель нажал End)

**Восстановление сессии:** при открытии приложения проверить `GET /api/test?action=check-active&userId=...` — есть ли активный тест → вернуть на TestExamScreen.

---

### `TestDoneScreen` (маршрут: `TestDone`)
**Файл:** `src/screens/TestDoneScreen.tsx` — **создать**

**Элементы:**
- "Ты завершил тест!"
- Результат: "17 из 20 правильно"
- Кнопка "Закрыть" → `navigation.navigate('Main')`

> Намеренно не показываем детальный разбор ошибок — это решение учителя.

---

## Шаг 6 — Логика вариантов ответа (в API)

Для каждого вопроса API генерирует 4 варианта:

1. **Правильный ответ** — поле `back` из таблицы `cards` (`backText` в TypeScript)
2. **3 неправильных** — случайные `back` из других карточек того же набора

```sql
-- Получить 3 случайных неправильных варианта
SELECT back FROM cards
WHERE set_id = $1 AND id != $2
ORDER BY RANDOM()
LIMIT 3;
```

Варианты перемешиваются перед отправкой. У каждого ученика свой набор "ложных" вариантов.

---

## Шаг 7 — Обновление навигации

**Файл:** `src/types/navigation.ts`

```typescript
// Добавить в RootStackParamList:
TestJoin: undefined;
TestWaiting: {
  sessionId: string;
  setTitle: string;
  teacherName: string;
  testMode: string;
  questionCount: number;
  timePerQuestion: number;
};
TestExam: {
  sessionId: string;
  participantId: string;
  testMode: string;
  questionCount: number;
  timePerQuestion: number;
};
TestDone: { correct: number; total: number };

// Обновить существующие:
TestLobby: {
  courseId: string;
  courseTitle: string;
  sessionId: string;
  code: string;
  testMode: string;
  questionCount: number;
  timePerQuestion: number;
};
LiveTest: {
  courseId: string;
  courseTitle: string;
  sessionId: string;
};
TestResultsTeacher: {
  courseId: string;
  courseTitle: string;
  sessionId: string;
};
```

**Файл:** `src/navigation/AppNavigator.tsx`
- Зарегистрировать 4 новых экрана: `TestJoin`, `TestWaiting`, `TestExam`, `TestDone`

**Файл:** `src/screens/index.ts`
- Экспортировать 4 новых экрана

---

## Шаг 8 — Точка входа ученика

Добавить кнопку "Войти в тест" на `HomeScreen`:
- Кнопка видна всем пользователям (не только учителям)
- При нажатии → `navigation.navigate('TestJoin')`
- Расположить рядом с существующими action-кнопками

---

## Порядок разработки

| # | Задача | Файлы |
|---|--------|-------|
| 1 | Миграция БД (3 таблицы + индексы) | `database/migrations/011_live_test.sql` |
| 2 | REST API (один файл, все actions) | `/api/test.js` |
| 3 | Подключить `ExamLobbyScreen` к API | `src/screens/ExamLobbyScreen.tsx` |
| 4 | Подключить `TestLobbyScreen` к Realtime | `src/screens/TestLobbyScreen.tsx` |
| 5 | Подключить `LiveTestScreen` к Realtime | `src/screens/LiveTestScreen.tsx` |
| 6 | Подключить `TestResultsTeacherScreen` к API | `src/screens/TestResultsTeacherScreen.tsx` |
| 7 | Создать `TestJoinScreen` (ввод кода) | `src/screens/TestJoinScreen.tsx` |
| 8 | Создать `TestWaitingScreen` (ожидание) | `src/screens/TestWaitingScreen.tsx` |
| 9 | Создать `TestExamScreen` (тест) | `src/screens/TestExamScreen.tsx` |
| 10 | Создать `TestDoneScreen` (результат) | `src/screens/TestDoneScreen.tsx` |
| 11 | Обновить навигацию и типы | `navigation.ts`, `AppNavigator.tsx`, `index.ts` |
| 12 | Кнопка "Войти в тест" на HomeScreen | `src/screens/HomeScreen.new.tsx` |
| 13 | Тестирование | — |

---

## Соответствие с существующим кодом

| Что в проекте | Как используется в плане |
|---------------|-------------------------|
| `users.teacher` (boolean) | Проверка `teacher = true` для учительских действий |
| `users.display_name` | Имя ученика в `test_participants.display_name` |
| `course_members` (таблица) | Проверка при join — ученик должен быть участником курса |
| `cards.front` / `cards.back` (SQL) | Вопрос / правильный ответ |
| `Card.frontText` / `Card.backText` (TS) | Те же поля в TypeScript-коде |
| `@supabase/supabase-js` | Realtime каналы (вместо WebSocket-сервера) |
| `@neondatabase/serverless` | Запросы к БД из API |
| Плоская структура API (`/api/xxx.js`) | `/api/test.js` с `?action=` параметром |
| `ExamLobby` route → `ExamLobbyScreen` | Настройка теста (тип, кол-во, время) |
| `TestLobby` route → `TestLobbyScreen` | Зал ожидания с 4-значным кодом и QR |
| `LiveTest` route → `LiveTestScreen` | Мониторинг прогресса в реальном времени |
| `TestResultsTeacher` route → `TestResultsTeacherScreen` | Подиум + лидерборд + hardest cards |

---

## Что НЕ входит в первую версию (можно добавить позже)

- Тип вопроса "написать слово" (UI готов в `ExamLobbyScreen`, но бэкенд только multiple choice)
- Смешанный тип вопросов (UI готов, бэкенд позже)
- История прошлых тестов в профиле ученика
- Экспорт PDF/CSV с результатами (кнопка есть, логика позже)
- Реальный QR-код (сейчас иконка-заглушка)
- Восстановление сессии при перезапуске приложения
- Ограничение: одна активная сессия на учителя одновременно

---

*Последнее обновление: март 2026*
