# Система фаз обучения

## Что такое фаза?

**Фаза** — это одна сессия обучения с определённым набором карточек. Каждое нажатие кнопки "Учить" создаёт новую фазу.

## Как это работает

### 1. Начало фазы (SetDetailScreen)

Когда пользователь нажимает "Учить":
- Создаётся уникальный `phaseId`
- Определяется `totalPhaseCards` (общее количество карточек в фазе)
- Устанавливается `studiedInPhase = 0` (изучено в фазе)

```typescript
// Пример: фаза с 50 карточками, порция по 20
phaseId: "phase_1234567890_abc123"
totalPhaseCards: 50
studiedInPhase: 0
```

### 2. Изучение порциями

Карточки изучаются порциями (например, по 20 штук за раз):

```
Фаза: 50 карточек, порция: 20

Порция 1: карточки 1-20
├─ studiedInPhase: 0 → 20
└─ ResultScreen: "Следующие карточки" (осталось 30)

Порция 2: карточки 21-40
├─ studiedInPhase: 20 → 40
└─ ResultScreen: "Следующие карточки" (осталось 10)

Порция 3: карточки 41-50
├─ studiedInPhase: 40 → 50
└─ ResultScreen: "Закончить" (фаза завершена ✓)
```

### 3. Экран результатов (StudyResultsScreen)

Логика кнопки:

```typescript
// Если все карточки фазы изучены
if (studiedInPhase >= totalPhaseCards) {
  primaryButtonLabel = "Закончить"
  // При нажатии → возврат к SetDetailScreen
}

// Если остались карточки в фазе
else {
  primaryButtonLabel = "Следующие карточки"
  remainingInPhase = totalPhaseCards - studiedInPhase
  // При нажатии → следующая порция с теми же phaseId и totalPhaseCards
}
```

### 4. Новая фаза

При повторном нажатии "Учить":
- Создаётся **новый** `phaseId`
- Счётчик `studiedInPhase` сбрасывается в 0
- Цикл начинается заново

## Параметры навигации

### Все экраны обучения (Study, Match, MultipleChoice)
```typescript
{
  setId: string
  cardLimit?: number
  phaseId?: string          // ID текущей фазы
  totalPhaseCards?: number  // Всего карточек в фазе
  studiedInPhase?: number   // Изучено в фазе (0 при первом запуске)
}
```

### StudyResults
```typescript
{
  // ... обычные параметры ...
  phaseId?: string
  totalPhaseCards?: number
  studiedInPhase?: number   // Обновлённое значение после изучения порции
}
```

## Примеры использования

### Сценарий 1: Изучение всех карточек
```
Набор: 50 карточек
Настройка: "Все карточки", порция 20

Нажимаю "Учить" → Новая фаза
├─ phaseId: "phase_001"
├─ totalPhaseCards: 50
└─ studiedInPhase: 0

Порция 1 (20 карточек) → ResultScreen
├─ Прогресс фазы: 20/50 (40%)
└─ Кнопка: "Следующие карточки"

Порция 2 (20 карточек) → ResultScreen
├─ Прогресс фазы: 40/50 (80%)
└─ Кнопка: "Следующие карточки"

Порция 3 (10 карточек) → ResultScreen
├─ Прогресс фазы: 50/50 (100%)
└─ Кнопка: "Закончить" ✓
```

### Сценарий 2: Только не выученные
```
Набор: 50 карточек (15 не выучено)
Настройка: "Только не выученные", порция 20

Нажимаю "Учить" → Новая фаза
├─ phaseId: "phase_002"
├─ totalPhaseCards: 15 (только не выученные)
└─ studiedInPhase: 0

Порция 1 (15 карточек) → ResultScreen
├─ Прогресс фазы: 15/15 (100%)
└─ Кнопка: "Закончить" ✓
```

## Файлы

### Типы навигации
- `src/types/navigation.ts` - параметры фаз во всех маршрутах

### Экраны обучения
- `src/screens/StudyScreen.tsx` - Flashcards с поддержкой фаз
- `src/screens/MatchScreen.tsx` - Match с поддержкой фаз
- `src/screens/MultipleChoiceScreen.tsx` - Multiple Choice с поддержкой фаз

### Результаты
- `src/screens/StudyResultsScreen.tsx` - отображение прогресса фазы и логика кнопок

### Запуск обучения
- `src/screens/SetDetailScreen.tsx` - создание новых фаз при запуске

## Преимущества

✅ **Прозрачность** - пользователь видит прогресс в рамках одной сессии  
✅ **Гибкость** - можно изучать порциями, не теряя контекст  
✅ **Мотивация** - чёткое понимание "сколько осталось"  
✅ **Независимость** - каждая сессия изолирована друг от друга  

## Отладка

Для проверки работы системы фаз можно добавить в StudyResultsScreen:

```typescript
{__DEV__ && (
  <Text variant="caption" color="secondary">
    PhaseID: {phaseId}
    Total: {totalPhaseCards}
    Studied: {studiedInPhase}
  </Text>
)}
```
