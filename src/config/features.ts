/**
 * Флаги функций.
 */

/**
 * Библиотека наборов во вкладке «Библиотека» (рядом с учебниками). Публикуют только админы —
 * сервер отвечает canPublish (api/library.js), блок публикации и «Мои публикации» видны только им.
 * Весь контент от команды, поэтому App Review 1.2 не применяется (plan/done/community_library.md).
 * false — во вкладке только учебники.
 */
export const COMMUNITY_LIBRARY_ENABLED = true;

/**
 * Новая библиотека-каталог: предмет → подборка → набор (plan/new/library_catalog.md, Catalog 6–8).
 * true — во вкладке каталог (LibraryCatalogScreen), экраны «Предмет» и «Подборка» зарегистрированы.
 * false — прежний экран с полками (LibraryScreen), откат одной строкой. Прежний экран удаляется в Catalog 10.
 */
export const LIBRARY_CATALOG_ENABLED = true;

/**
 * Кабинет учителя, этап 1 (plan/new/teacher_cabinet.md): главная и страница курса учителя.
 * false — всё как раньше, откат одной строкой.
 */
export const TEACHER_CABINET_ENABLED = true;

/**
 * Задания (этап 2): блоки у учителя, карточка и экраны задания у ученика, пуши.
 * true — для проверки на staging (Teacher 30). Сервер заданий есть только на staging:
 * в прод-сборку с true не выпускать, пока этап 2 не выкатан на прод.
 */
export const TEACHER_HOMEWORK_ENABLED = true;

/** «Подготовка к уроку» у учителя (этап 3). До этапа 3 — false. */
export const TEACHER_LESSON_PREP_ENABLED = false;

/**
 * Этап 4 кабинета учителя: колокольчик с уведомлениями, новый экран ученика, отчёты.
 * false — экран ученика прежний, колокольчика и отчётов нет.
 */
export const TEACHER_INSIGHTS_ENABLED = false;
