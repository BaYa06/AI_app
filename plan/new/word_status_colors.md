# Цвет статуса слова: кружок у карточки и цветная полоска набора (Status N)

## Context
Сейчас у слова два состояния: «выучено» (зелёная галочка) и «не выучено» (серый кружок). У набора на главной одна фиолетовая полоска и процент. Нужно показать все четыре статуса из `getStatusForStep` ([SRSService.ts:35](src/services/SRSService.ts#L35)) цветом.

Макет согласован: https://claude.ai/artifact/RqvXbND572q3d49VfjedJf

| Статус | Шаг | Кружок у слова | Сегмент полоски |
|---|---|---|---|
| new | 0 | пустой серый кружок, без галочки | серый хвост (фон трека) |
| learning | 1–2 | жёлтая галочка | жёлтый |
| young | 3–4 | зелёная галочка | зелёный |
| mature | 5+ | фиолетовая галочка (`primary`) | фиолетовый |

Решения пользователя:
- процент в карточке набора убрать, остаётся «48 карточек»;
- различие только цветом, форма кружков одинаковая;
- шаг на карточке слова не показывать;
- одна полоска на набор, порядок слева направо: фиолетовый → зелёный → жёлтый → серый;
- под полоской строка с цифрами по цветам (как в макете);
- галочка learning в светлой теме темнее (#D97706) ради контраста, фон и рамка жёлтые.

## Шаги (шаг = коммит «Status N»)

**Status 0 — сохранить план** в `plan/new/word_status_colors.md` (копия этого файла) + запись в памяти.

**Status 1 — токены и функция статуса**
- [colors.ts](src/constants/colors.ts): `statusLearning` (#F59E0B / тёмная #FBBF24), `statusLearningInk` (#D97706 / #FBBF24), `statusYoung` (= success), `statusMature` (= primary) — для светлой и тёмной темы.
- Статус всегда из `learningStep` через `getStatusForStep`, не из поля `card.status`.

**Status 2 — кружок у слова**
- Компонент `StatusBadge` в src/components/cards/: new — `Circle` серый; иначе `Check` цветом статуса, фон `alpha(цвет, 10)`, рамка `alpha(цвет, 40)`.
- [SetDetailScreen.tsx:546-566](src/screens/SetDetailScreen.tsx#L546-L566) — заменить бейдж на `StatusBadge`; бейдж «Выучено» на [StudyScreen.tsx:736](src/screens/StudyScreen.tsx#L736) — посмотреть и привести к тому же виду.
- accessibilityLabel: «Новое / Учится / Знаю / Выучено надолго» вместо «Выучена».

**Status 3 — счётчики набора**
- [cardsStore.ts `selectSetStats`](src/store/cardsStore.ts#L339): реально считать `newCount/learningCount/youngCount/matureCount` по шагу. Сейчас learning/young/mature = 0, а `newCount` означает «к повторению» — проверить все читатели `newCount`/`updateSetStats` (7 вызовов) и перевести «к повторению» на `dueCount`/`reviewCount`.
- `youngCount`, `matureCount` в `CardSet` ([types/index.ts:164](src/types/index.ts#L164)) и `updateSetStats` ([setsStore.ts:66](src/store/setsStore.ts#L66)).
- [BookService.ts:153-156](src/services/BookService.ts#L153) — считать по шагу, `masteredCount` = шаг ≥ 3 (сейчас только mature).
- Набор без локальных карточек: эффект на главной ([HomeScreen.new.tsx:1087](src/screens/HomeScreen.new.tsx#L1087)) не должен затирать серверные значения нулями.

**Status 4 — сегментная полоска на главной**
- `SegmentedProgressBar` в [Controls.tsx](src/components/ui/Controls.tsx): трек как у `ProgressBar` (высота 8, full, `surfaceMuted`), сегменты mature → young → learning, зазор 2 pt, мин. ширина видимого сегмента ~3 pt.
- [HomeScreen.new.tsx:1789-1866](src/screens/HomeScreen.new.tsx#L1789): убрать `· {progress}%`, заменить `ProgressBar` на сегментную, строка цифр под ней. accessibilityLabel: «учится N, знаю N, выучено надолго N, новых N».
- Сортировка «Прогресс» (`masteredRatio`) — по young+mature, как сейчас.

## Уязвимые места
1. `selectSetStats` не считает learning/young/mature, `newCount` там значит «к повторению» — без Status 3 полоска будет неверной.
2. Серверные счётчики (`studying_cards`, `mastered_cards`, [api/data.js:233](api/data.js#L233)) без разбивки young/mature; локальный пересчёт может затереть их нулями.
3. Разные определения «выучено»: BookService = mature, остальное = шаг ≥ 3; там же статус из `c.status`.
4. Поле `card.status` может быть устаревшим; `relearning` нигде не присваивается.
5. «Угасающее» слово остаётся фиолетовым до ответа — шаг падает только при ответе.
6. «Не знаю» сбрасывает в new: забытое слово выглядит как новое.
7. Жёлтый и зелёный различаются только цветом — подписи VoiceOver обязательны; жёлтая иконка на белом — тёмный оттенок.
8. Фиолетовый уже у «Сейчас учишь» и кнопок — в макете смотрится нормально.

## Проверка
- `npx tsc --noEmit` только по src, сравнить число ошибок с прошлым коммитом (≈89 старых).
- Набор со словами на шагах 0/1/3/5: кружки серый/жёлтый/зелёный/фиолетовый в обеих темах; на главной одна полоска, без процента.
- «Уверенно» на новом слове → кружок жёлтый, жёлтый сегмент вырос на главной.
- Набор курса/учебника без загруженных карточек не показывает «0».
- Проверка на устройстве — через TestFlight.
