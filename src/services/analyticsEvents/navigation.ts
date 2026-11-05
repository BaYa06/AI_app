/** События: Навигация и главный экран (Clean 9 — из Analytics без изменений). */
import { type HomeState, type HomeAction, log } from './core';

export const navigationEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // НАВИГАЦИЯ И ФИЧИ
  // Зачем: понять какие экраны используются, а какие — нет (можно убрать/упростить).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер открыл экран статистики.
   * Зачем: если stats_screen_viewed мало — юзеры не знают о фиче. Нужен промоушен.
   */
  statsScreenViewed: () => log('stats_screen_viewed'),

  /**
   * Юзер открыл публичную библиотеку наборов.
   */
  libraryScreenViewed: () => log('library_screen_viewed'),

  /**
   * Юзер использовал поиск.
   */
  searchPerformed: (screen: 'home' | 'library', hasResults: boolean) =>
    log('search_performed', { screen, has_results: hasResults }),

  /**
   * Юзер поделился набором.
   */
  setShared: (method: 'link' | 'qr') => log('set_shared', { method }),

  /**
   * Наборы по ссылке (plan/new/share_set.md). Ссылка получена (новая или та же) перед меню «Поделиться».
   */
  shareLinkCreated: (cardCount: number) => log('share_link_created', { card_count: cardCount }),

  /**
   * Ссылку отправили: app — приложение из меню iOS (WhatsApp, Telegram…), 'clipboard' — скопировали на вебе.
   * Зачем: какие мессенджеры главные — под них доводим превью и текст.
   */
  shareLinkSent: (app: string | null) => log('share_link_sent', { app: app ?? 'unknown' }),

  /**
   * Автор закрыл доступ по ссылке.
   */
  shareLinkDisabled: () => log('share_link_disabled'),

  /**
   * Получатель открыл ссылку в приложении. Зачем: сколько ссылок доходит до приложения, а не до браузера.
   */
  shareLinkOpened: (signedIn: boolean) => log('share_link_opened', { signed_in: signedIn }),

  /**
   * Набор по ссылке добавлен. target — куда (свой набор / курс), guest — копия на устройстве.
   */
  shareSetImported: (params: { target: 'own' | 'course'; guest: boolean; cardCount: number }) =>
    log('share_set_imported', {
      target: params.target,
      guest: params.guest,
      card_count: params.cardCount,
    }),

  /**
   * Жалоба на набор по ссылке (App Review 1.2).
   */
  shareSetReported: (reason: string) => log('share_set_reported', { reason }),

  /**
   * Автор набора по ссылке заблокирован.
   */
  shareAuthorBlocked: () => log('share_author_blocked'),

  /**
   * Юзер изменил тему оформления.
   */
  themeChanged: (theme: 'light' | 'dark' | 'system') => log('theme_changed', { theme }),

  /**
   * Юзер изменил язык интерфейса.
   */
  languageChanged: (language: 'ru' | 'en') => log('language_changed', { language }),

  // ═══════════════════════════════════════════════════════════════════════════
  // ГЛАВНЫЙ ЭКРАН
  // Зачем: понять, с чего люди начинают учёбу и что на главной отвлекает.
  // Замер «до» и «после» редизайна главной (plan/done/home_redesign.md, шаги 0.2 и 6.3).
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Главная показана (один раз за каждый заход на экран).
   * reviewCount — слов ждут повторения, newCount — слов ещё ни разу не учили.
   */
  homeViewed: (params: {
    state: HomeState;
    reviewCount: number;
    newCount: number;
    setsCount: number;
  }) =>
    log('home_viewed', {
      state: params.state,
      review_count: params.reviewCount,
      new_count: params.newCount,
      sets_count: params.setsCount,
    }),

  /**
   * Нажатие на главной. Доля 'daily_review' среди всех действий — главная метрика редизайна.
   */
  homeAction: (action: HomeAction) => log('home_action', { action }),
};
