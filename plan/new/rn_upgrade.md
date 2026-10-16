# Обновление React Native: 0.73 → актуальная версия + новая архитектура

Сейчас: React Native 0.73.2, React 18.2, старая архитектура (мост), Hermes уже включён.
Цель — не столько скорость, сколько **не отстать от требований Apple/Google** (минимальные Xcode,
iOS SDK, Android targetSdk) и снова получать обновления библиотек. Плюсом — новая архитектура
(Fabric + TurboModules).

Шаг = коммит «Upgrade N». Каждый шаг проверяется сборкой «iOS TestFlight Staging» из `dev`
(см. plan/new/release_safety.md), а не долгими локальными сборками. В `main` — только после проверки.

## Что ожидаем получить
- Приложение собирается на свежем Xcode и проходит требования App Store / Google Play без заплаток.
- Библиотеки (Firebase, Reanimated, Screens, Navigation) снова можно обновлять.
- Fabric: синхронная отрисовка и замеры, меньше «прыжков» поповеров и подёргиваний при скролле
  и открытии экранов.
- React 18/19 в полную силу: `useTransition` и группировка обновлений, тяжёлые обновления
  не блокируют нажатия.
- TurboModules: ленивая загрузка нативных модулей и типизированные Swift-модули (пригодится для
  интерактивного виджета и Live Activities, см. plan/new/widgets.md).

## Что НЕ изменится
- Скорость запуска сильно не вырастет: Hermes уже включён.
- Анимации на Reanimated и раньше работали в нативном потоке.
- Медленные места в нашем коде (лишние перерисовки, большие списки на `FlatList`/`ScrollView`)
  обновление не исправит. Это отдельная задача (см. Upgrade 9).

## Upgrade 0 — аудит библиотек ⬜
Для каждой зависимости из package.json выяснить: поддерживает ли новую архитектуру, с какой
версии RN, есть ли живая замена. Результат — таблица в этом файле.
Под подозрением (давно не обновлялись или нет поддержки New Architecture):
- `@react-native-voice/voice` — распознавание речи
- `react-native-sound` (+ наш патч) — звуки ответов
- `react-native-tts` — озвучка
- `react-native-fast-image` → кандидат на замену `expo-image` (или `@d11/react-native-fast-image`)
- `@react-native-community/blur`
- `react-native-document-picker` → переехал в `@react-native-documents/picker`
- `react-native-inappbrowser-reborn`
- `@sayem314/react-native-keep-awake`
- `react-native-vector-icons` (разбит на пакеты `@react-native-vector-icons/*`)
- `react-native-mmkv` 2.x → 3.x требует новую архитектуру
Патчи в patches/: `@react-navigation/native-stack`, `react-native-screens`, `react-native-sound` —
понять, что они чинят и нужно ли это в новых версиях.
Проверить веб-сборку: `react-native-web` 0.21 и webpack должны остаться совместимы.

## Upgrade 1 — замена мёртвых библиотек на старой версии RN ⬜
До смены версии RN заменить то, что по аудиту не переживёт обновление, — по одной библиотеке
на коммит, чтобы каждую замену проверить отдельно (звуки, озвучка, голос, картинки, выбор файлов).

## Upgrade 2 — RN 0.73 → 0.74 ⬜
Шаги по https://react-native-community.github.io/upgrade-helper/ (iOS: Podfile, AppDelegate.mm;
Android: gradle). Архитектура пока старая (`newArchEnabled=false`, `RCT_NEW_ARCH_ENABLED=0`).

## Upgrade 3 — RN 0.75 ⬜
То же, через upgrade-helper. Обновить Codemagic (версия Xcode) в codemagic.yaml.

## Upgrade 4 — RN 0.76: включение новой архитектуры ⬜
В 0.76 новая архитектура включена по умолчанию. Сначала проверить её в staging-сборке целиком:
навигация, тесты, серия (Reanimated), виджет (FlashlyWidgetBridge), push, вход через Apple,
звук/озвучка/голос. Если что-то сломалось и быстро не чинится — временно выключить флагом и
чинить отдельным коммитом.
Наш мост FlashlyWidgetBridge (Swift + .m) работает через слой совместимости. Переписать на
TurboModule — по желанию, отдельным шагом.

## Upgrade 5 — React Navigation 6 → 7 ⬜
Изменения API навигации (`navigate` к вложенным экранам, типы). Проверить все переходы и deep links.

## Upgrade 6 — Reanimated 3 → 4 ⬜
Reanimated 4 работает только на новой архитектуре и требует `react-native-worklets`.
Проверить праздник серии, анимации карточек, жесты.

## Upgrade 7 — RN до актуальной стабильной + React 19 ⬜
Дальше по одной минорной версии через upgrade-helper. С переходом на React 19 проверить
устаревшие API (`forwardRef`, `defaultProps` у функциональных компонентов) и типы в src.
Firebase (`@react-native-firebase/*`) обновить до версии, совместимой с итоговым RN.

## Upgrade 8 — уборка ⬜
- Удалить ненужные патчи и полифилы (src/polyfills), если новые версии их уже не требуют.
- Сравнить ошибки tsc в src с базой до обновления (их не должно стать больше).
- Обновить README: версии, как собирать.

## Upgrade 9 (необязательно) — производительность нашего кода ⬜
Не про обновление, но даёт больше всего плавности:
- Длинные списки (`FlatList`/`ScrollView`, около 45 файлов в src) → `@shopify/flash-list`
  там, где списки реально длинные (наборы карточек, библиотека, статистика).
- Найти лишние перерисовки (React DevTools Profiler), селекторы zustand вместо подписки на весь стор.

## Риски
- Каждый скачок версии может сломать нативную сборку — поэтому по одной минорной версии за раз
  и проверка в TestFlight Staging.
- Релиз в App Store из `main` — только после полной проверки staging-сборки и с поэтапным
  выпуском (Phased Release), см. plan/new/release_safety.md.
- Старые версии приложения у пользователей это не затрагивает: меняется только клиент, API тот же.
