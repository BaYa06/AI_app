/** События: Удержание: серия, уведомления, виджет, «Что нового» (Clean 9 — из Analytics без изменений). */
import { log } from './core';

export const engagementEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // STREAK (СЕРИИ)
  // Зачем: streak — главный retention-механизм. Видим где юзеры теряют серию
  // и насколько эффективны напоминания.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер достиг milestone по streak.
   * Зачем: можно строить cohort — юзеры с 7-дневным streak остаются на 30 день в X% случаев.
   */
  streakMilestone: (days: number) => log('streak_milestone', { days }),

  /**
   * Юзер потерял streak (пропустил день).
   * Зачем: если потери происходят в определённые дни недели — слабые напоминания.
   */
  streakLost: (previousStreak: number) => log('streak_lost', { previous_streak: previousStreak }),

  /**
   * Юзер восстановил streak (вернулся после пропуска).
   */
  streakRestored: (newStreak: number) => log('streak_restored', { new_streak: newStreak }),

  // ═══════════════════════════════════════════════════════════════════════════
  // УВЕДОМЛЕНИЯ
  // Зачем: push-уведомления — главный retention-инструмент.
  // Трекаем permission rate и эффективность.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер дал разрешение на push-уведомления.
   */
  pushPermissionGranted: () => log('push_permission_granted'),

  /**
   * Юзер отказал в push-уведомлениях.
   */
  pushPermissionDenied: () => log('push_permission_denied'),

  /** Было разрешено, а при открытии приложения уже запрещено в настройках iOS (1.4) — отток канала */
  pushPermissionRevoked: () => log('push_permission_revoked'),

  /**
   * Лист «Напомнить завтра?» на итогах урока (plan/new/push_notifications.md, 1.2) — воронка разрешения:
   * shown → accepted / later → push_permission_granted / denied.
   */
  pushPrepromptShown: (params: { attempt: number; trigger: string }) =>
    log('push_preprompt_shown', { attempt: params.attempt, trigger: params.trigger }),

  pushPrepromptAccepted: (hour: number | 'custom') =>
    log('push_preprompt_accepted', { hour: String(hour) }),

  pushPrepromptLater: () => log('push_preprompt_later'),

  /** Выключен переключатель «что присылать» (2.4) — сигнал оттока: какой тип пушей раздражает */
  pushCategoryDisabled: (category: string) => log('push_category_disabled', { category }),

  /** Строка «Включи напоминания, чтобы не потерять серию» на главной (1.3): shown / tap / dismiss */
  pushStreakNudge: (action: 'shown' | 'tap' | 'dismiss') => log('push_streak_nudge', { action }),

  /**
   * Юзер открыл приложение тапом по push-уведомлению (plan/new/push_notifications.md, 0.5).
   * type — тип из реестра на сервере (review_due, teacher_review…), push_id — строка push_log.
   */
  pushNotificationOpened: (params: { type: string; pushId?: string }) =>
    log('push_notification_opened', {
      notification_type: params.type,
      ...(params.pushId ? { push_id: params.pushId } : null),
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ВИДЖЕТ НА ЭКРАНЕ БЛОКИРОВКИ
  // Зачем: понять, учит ли виджет и приводит ли в урок (plan/new/widgets.md, «Аналитика»).
  // family — accessoryRectangular / accessoryInline / accessoryCircular.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * При открытии приложения нашли виджет, которого раньше не было.
   */
  widgetInstalled: (family: string) => log('widget_installed', { family }),

  /**
   * Виджет пропал. days_kept — сколько дней он простоял; много удалений в первые 7 дней — виджет раздражает.
   */
  widgetRemoved: (params: { family: string; daysKept: number }) =>
    log('widget_removed', { family: params.family, days_kept: params.daysKept }),

  /**
   * Приложение открыто по ссылке из виджета. state — состояние виджета в момент нажатия, target — lesson / set.
   */
  widgetOpenedApp: (params: { state: string; family: string; target: string }) =>
    log('widget_opened_app', { state: params.state, family: params.family, target: params.target }),

  /**
   * Нажатия «Показать» на виджете (iOS 17+), забранные при открытии приложения.
   */
  widgetReveals: (count: number) => log('widget_reveals', { count }),

  /**
   * Подсказка «Учи слова прямо с экрана блокировки» показана / нажата.
   */
  widgetPromptShown: (place: string) => log('widget_prompt_shown', { place }),
  widgetPromptClicked: (place: string) => log('widget_prompt_clicked', { place }),

  /**
   * Ответ в уроке на слово, подходившее в пул виджета. in_widget — слово было в виджете (иначе контрольная
   * половина). Точность двух групп — главная метрика виджета.
   */
  widgetWordReviewed: (params: { inWidget: boolean; correct: boolean }) =>
    log('widget_word_reviewed', { in_widget: params.inWidget, correct: params.correct }),

  // ═══════════════════════════════════════════════════════════════════════════
  // «ЧТО НОВОГО»
  // Зачем: дочитывают ли новости и какие интересны (plan/new/whats_new.md, News 6).
  // place — home (само после обновления) / history (Профиль → Что нового). id — новость или more («И ещё»).
  // Цель: больше половины открывших доходят до последней страницы (reached_last в whats_new_closed).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Окно открылось. count — страниц, news — новостей в нём (на «И ещё» их несколько).
   */
  whatsNewShown: (params: { place: string; count: number; news: number; version: string }) =>
    log('whats_new_shown', {
      place: params.place,
      count: params.count,
      news: params.news,
      version: params.version,
    }),

  /**
   * Открыта страница (и первая — при показе). Много закрытий после index 0 — первая новость неинтересна.
   */
  whatsNewPage: (params: { place: string; id: string; index: number }) =>
    log('whats_new_page', { place: params.place, id: params.id, index: params.index }),

  /**
   * «Попробовать» — новость вызвала интерес.
   */
  whatsNewTry: (params: { place: string; id: string; index: number }) =>
    log('whats_new_try', { place: params.place, id: params.id, index: params.index }),

  /**
   * Окно закрыто (крестик, «Понятно», жест или «Попробовать»). index — на какой странице.
   */
  whatsNewClosed: (params: { place: string; index: number; count: number; tried: boolean }) =>
    log('whats_new_closed', {
      place: params.place,
      index: params.index,
      count: params.count,
      reached_last: params.index >= params.count - 1,
      tried: params.tried,
    }),
};
