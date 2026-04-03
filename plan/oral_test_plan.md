# План реализации: Устный тест (Oral Test)

> **Цель:** Учитель запускает устный тест прямо с телефона — карточки листаются одна за другой, студент вслух произносит перевод, учитель свайпом отмечает «знает» или «не знает». В конце учитель видит итоговый результат с процентами для выставления оценки.

---

## Общий флоу

```
TeacherCourseStatsScreen
  └─► Кнопка "Тест Лобби"
        └─► Modal (уже есть в TeacherCourseStatsScreen)
              ├─► Экзамен  →  ExamLobbyScreen (уже реализован, не трогать)
              └─► Орал тест  →  OralTestLobbyScreen  ← уже есть, но пустой
                                      └─► OralTestSessionScreen  ← создать
                                                └─► OralTestResultsScreen  ← создать
```

---

## Файлы которые нужно изменить / создать

| Файл | Действие |
|------|----------|
| `src/screens/OralTestLobbyScreen.tsx` | Переписать полностью (сейчас пустой placeholder) |
| `src/screens/OralTestSessionScreen.tsx` | Создать |
| `src/screens/OralTestResultsScreen.tsx` | Создать |
| `src/screens/index.ts` | Добавить два новых экспорта |
| `src/navigation/AppNavigator.tsx` | Зарегистрировать два новых экрана |
| `src/types/navigation.ts` | Добавить два новых маршрута |

---

## Шаг 1 — Обновить типы навигации

**Файл:** `src/types/navigation.ts`

Добавить в `RootStackParamList` два новых маршрута (маршрут `OralTestLobby` уже есть — не трогать):

```typescript
OralTestSession: {
  courseId: string;
  courseTitle: string;
  setId: string;
  setTitle: string;
  cardIds: string[];  // перемешанный массив ID карточек
};

OralTestResults: {
  courseId: string;
  courseTitle: string;
  setTitle: string;
  total: number;    // сколько карточек показали до нажатия «Закончить»
  known: number;    // сколько отмечено «знает» (свайп вправо)
  unknown: number;  // сколько отмечено «не знает» (свайп влево)
};
```

---

## Шаг 2 — Зарегистрировать экраны в навигаторе

**Файл:** `src/navigation/AppNavigator.tsx`

Добавить сразу после строки с `OralTestLobbyScreen`:

```tsx
<Stack.Screen name="OralTestSession"  component={OralTestSessionScreen}  options={{ headerShown: false, gestureEnabled: false }} />
<Stack.Screen name="OralTestResults"  component={OralTestResultsScreen}  options={{ headerShown: false }} />
```

Добавить импорты:

```tsx
import { OralTestSessionScreen }  from '@/screens/OralTestSessionScreen';
import { OralTestResultsScreen }  from '@/screens/OralTestResultsScreen';
```

---

## Шаг 3 — Добавить экспорты

**Файл:** `src/screens/index.ts`

```typescript
export { OralTestSessionScreen }  from './OralTestSessionScreen';
export { OralTestResultsScreen }  from './OralTestResultsScreen';
```

---

## Шаг 4 — OralTestLobbyScreen (переписать полностью)

**Файл:** `src/screens/OralTestLobbyScreen.tsx`

### Назначение
Учитель видит список наборов карточек текущего курса, выбирает один и нажимает «Начать тест». Стиль — как у `ExamLobbyScreen`, акцентный цвет оранжевый `#F97316`.

### UI

```
┌──────────────────────────────────────┐
│  ←   Орал тест                       │  ← стандартный header
├──────────────────────────────────────┤
│                                      │
│  [иконка Mic, фон #F97316 + 18]      │
│  Устный опрос                        │  ← 20px bold
│  Студент произносит перевод вслух,   │
│  учитель свайпом отмечает результат  │  ← 14px, textSecondary
│                                      │
│  Выберите набор карточек             │  ← sectionTitle
│  ┌────────────────────────────────┐  │
│  │ ✓  Unit 1 — Animals · 24 сл.  │  │  ← активный: border цвет primary, Check icon
│  │    Unit 2 — Colors  · 18 сл.  │  │
│  │    Unit 3 — Food    · 31 сл.  │  │
│  └────────────────────────────────┘  │
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🎙️  Начать устный тест  →    │  │  ← кнопка, backgroundColor: '#F97316'
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Логика

1. Получить все наборы курса: `useSetsStore(s => s.getAllSets()).filter(s => s.courseId === route.params.courseId)`.
2. Хранить `selectedSetId` в `useState`, по умолчанию — `sets[0]?.id`.
3. При нажатии «Начать устный тест»:
   - Получить карточки: `useCardsStore.getState().getCardsBySet(selectedSetId)`.
   - Если карточек 0 — `Alert.alert('Нет карточек', 'В этом наборе пока нет карточек.')`.
   - Перемешать: `[...cards].sort(() => Math.random() - 0.5)`.
   - `navigation.navigate('OralTestSession', { courseId, courseTitle, setId: selectedSetId, setTitle: selectedSet.title, cardIds: shuffled.map(c => c.id) })`.

---

## Шаг 5 — OralTestSessionScreen (создать) ⭐

**Файл:** `src/screens/OralTestSessionScreen.tsx`

### Назначение
Основной экран устного теста. Карточки показываются одна за другой. На каждой карточке — слово (frontText) крупно сверху и перевод (backText) мельче снизу. Учитель слушает студента и свайпает карточку. Идёт счётчик карточек. Кнопка «Закончить» завершает досрочно.

### UI

```
┌──────────────────────────────────────┐
│  ←   Unit 1 — Animals               │  ← кнопка назад с Alert подтверждением
│                                      │
│  Карточка 5 из 24                    │  ← 14px, textSecondary, по центру
│  ████████░░░░░░░░░░░░░░  21%        │  ← прогресс-бар, цвет primary
│                                      │
│  ← Не знает              Знает →    │  ← подсказки, появляются при свайпе (opacity 0→1)
│                                      │
│  ┌──────────────────────────────┐   │
│  │                              │   │  ← карточка, белый/тёмный фон, тень, borderRadius xl
│  │  [оверлей ЗНАЕТ ✓, зелёный] │   │  ← появляется при свайпе вправо
│  │  [оверлей НЕ ЗНАЕТ ✗, красн]│   │  ← появляется при свайпе влево
│  │                              │   │
│  │         cat                  │   │  ← frontText, 36px bold, по центру
│  │                              │   │
│  │  ─────────────────────────   │   │  ← тонкий разделитель
│  │                              │   │
│  │         кошка                │   │  ← backText, 22px regular, textSecondary
│  │                              │   │
│  └──────────────────────────────┘   │
│                                      │
│  [✗ красный]              [✓ зелёный]│  ← иконки-подсказки по краям
│                                      │
│  ┌────────────────────────────────┐  │
│  │           Закончить            │  │  ← outline кнопка, border textSecondary
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Состояние экрана

```typescript
const [currentIndex, setCurrentIndex] = useState(0);
const [knownIds,   setKnownIds]   = useState<string[]>([]);
const [unknownIds, setUnknownIds] = useState<string[]>([]);
const pan = useRef(new Animated.ValueXY()).current;
```

Карточки: `const cards = route.params.cardIds.map(id => useCardsStore.getState().cards[id]).filter(Boolean)`.

### Свайп — PanResponder

Порог свайпа `SWIPE_THRESHOLD = 120px`.

При отпускании:
- `gesture.dx > 120` → `handleSwipe('right')` → добавить `cards[currentIndex].id` в `knownIds`
- `gesture.dx < -120` → `handleSwipe('left')` → добавить в `unknownIds`
- Иначе → вернуть карточку на место: `Animated.spring(pan, { toValue: {x:0,y:0} }).start()`

### Анимация при свайпе

```
rotation  = pan.x.interpolate([-200, 0, 200], ['-15deg', '0deg', '15deg'])
knownOverlayOpacity   = pan.x.interpolate([0, 100], [0, 1], clamp)   // зелёный оверлей
unknownOverlayOpacity = pan.x.interpolate([-100, 0], [1, 0], clamp)  // красный оверлей
hintKnownOpacity      = pan.x.interpolate([0, 80], [0, 1], clamp)    // подсказка справа
hintUnknownOpacity    = pan.x.interpolate([-80, 0], [1, 0], clamp)   // подсказка слева
```

### Функция handleSwipe

```
1. Анимировать улёт карточки за пределы экрана (Animated.timing, 250ms)
2. Обновить knownIds / unknownIds
3. Сбросить pan на {x:0, y:0} (без анимации, setValue)
4. setCurrentIndex(prev => prev + 1)
5. Если currentIndex + 1 >= cards.length → goToResults()
```

### Кнопка «Закончить» и кнопка «Назад»

Оба показывают:
```
Alert.alert(
  'Завершить тест?',
  'Будет показан результат по пройденным карточкам.',
  [{ text: 'Отмена', style: 'cancel' }, { text: 'Завершить', onPress: goToResults }]
)
```

### Переход на результаты (goToResults)

```typescript
navigation.replace('OralTestResults', {
  courseId: route.params.courseId,
  courseTitle: route.params.courseTitle,
  setTitle: route.params.setTitle,
  total: knownIds.length + unknownIds.length,
  known: knownIds.length,
  unknown: unknownIds.length,
});
```

---

## Шаг 6 — OralTestResultsScreen (создать)

**Файл:** `src/screens/OralTestResultsScreen.tsx`

### Назначение
Финальный экран с итогами для учителя. Показывает сколько карточек прошли, сколько знает/не знает, процент. Никаких API-запросов — все данные из `route.params`.

### UI

```
┌──────────────────────────────────────┐
│              Результаты              │  ← 20px bold, по центру
│         Unit 1 — Animals             │  ← название набора, 14px, textSecondary
│                                      │
│  ┌────────────────────────────────┐  │
│  │  🎉  Устный тест завершён      │  │  ← карточка-summary
│  │                                │  │
│  │      Пройдено карточек         │  │
│  │             18                 │  │  ← 48px bold
│  │          из 24                 │  │  ← 16px, textSecondary
│  └────────────────────────────────┘  │
│                                      │
│  ┌─────────────┐  ┌─────────────┐   │
│  │  ✓ Знает    │  │ ✗ Не знает  │   │  ← два блока рядом
│  │             │  │             │   │
│  │     13      │  │      5      │   │  ← 36px bold
│  │    72%      │  │    28%      │   │  ← 18px, процент
│  │ (зелёный)   │  │ (красный)   │   │
│  └─────────────┘  └─────────────┘   │
│                                      │
│  Итоговый результат                  │
│  ████████████████░░░░░  72%         │  ← прогресс-бар, зелёный (#10B981)
│                                      │
│  ┌────────────────────────────────┐  │
│  │   Провести ещё один тест       │  │  ← outline кнопка
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │           Готово               │  │  ← primary кнопка, цвет #F97316
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### Логика кнопок

- **«Провести ещё один тест»** → `navigation.replace('OralTestLobby', { courseId, courseTitle })`
- **«Готово»** → `navigation.goBack()` до `TeacherCourseStatsScreen`

### Расчёт процентов

```typescript
const { total, known, unknown } = route.params;
const knownPct   = total > 0 ? Math.round((known   / total) * 100) : 0;
const unknownPct = total > 0 ? Math.round((unknown / total) * 100) : 0;
```

Если `total === 0` — вместо чисел показать текст «Ни одна карточка не была пройдена».

---

## Крайние случаи

| Ситуация | Поведение |
|----------|-----------|
| В наборе 0 карточек | `Alert` на `OralTestLobbyScreen`, не переходить в сессию |
| Нажали «Закончить» на первой карточке (total=0) | Перейти на результаты, показать «Нет данных» |
| Все карточки закончились | Автоматический переход на результаты (без Alert) |
| Нажали аппаратный Back в сессии (Android) | `BackHandler` → показать Alert подтверждения |
| В наборе 1 карточка | Работает нормально, после свайпа сразу результаты |

---

## Стилистика

| Элемент | Значение |
|---------|----------|
| Акцентный цвет | `#F97316` (оранжевый) — иконка Mic, кнопка «Начать», кнопка «Готово» |
| Цвет «знает» | `#10B981` (зелёный) |
| Цвет «не знает» | `#EF4444` (красный) |
| Карточка в сессии | Белый / `#1e293b`, `borderRadius: borderRadius.xl * 1.5`, shadow |
| Слово на карточке | `fontSize: 36`, `fontWeight: '700'`, `textAlign: 'center'` |
| Перевод на карточке | `fontSize: 22`, `fontWeight: '400'`, цвет `textSecondary` |
| Тема | Все три экрана поддерживают тёмную тему через `useThemeColors()` и `useSettingsStore(s => s.resolvedTheme)` |
| Safe area | Все экраны используют `useSafeAreaInsets()` |
| Header | Стиль как в `AudioLearningScreen`: кнопка ← слева, заголовок по центру |
