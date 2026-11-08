/** События: ИИ, оплата, корпоративный тариф (Clean 9 — из Analytics без изменений). */
import { type PaywallSource, log } from './core';

export const monetizationEvents = {
  // ═══════════════════════════════════════════════════════════════════════════
  // AI-ГЕНЕРАЦИЯ
  // Зачем: AI — ключевая premium-фича. Трекаем использование и конверсию.
  // Если free юзеры активно используют лимит → paywall уместен.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Юзер запустил AI-генерацию карточек.
   */
  aiGenerationStart: (params: {
    inputType: 'text' | 'topic' | 'pdf';
    requestedCount: number;
    isFreeTier: boolean;
    remainingGenerations: number;
  }) =>
    log('ai_generation_start', {
      input_type: params.inputType,
      requested_count: params.requestedCount,
      is_free_tier: params.isFreeTier,
      remaining_generations: params.remainingGenerations,
    }),

  /**
   * AI-генерация завершена успешно.
   */
  aiGenerationSuccess: (params: { generatedCount: number; durationMs: number }) =>
    log('ai_generation_success', {
      generated_count: params.generatedCount,
      duration_ms: params.durationMs,
    }),

  /**
   * AI-генерация завершилась ошибкой.
   * Зачем: видим reliability AI-фичи. Если error_rate > 5% — проблема.
   */
  aiGenerationError: (errorCode: string) => log('ai_generation_error', { error_code: errorCode }),

  /**
   * Юзер достиг лимита бесплатных AI-генераций.
   * Зачем: это ключевая точка конверсии. Что делает юзер дальше — paywall или уходит?
   */
  aiLimitReached: () => log('ai_limit_reached'),

  // ═══════════════════════════════════════════════════════════════════════════
  // МОНЕТИЗАЦИЯ
  // Зачем: понять путь к покупке. Funnel:
  //   paywall_shown → premium_upgrade_click → purchase
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Paywall показан юзеру.
   * Зачем: если paywall_shown много, но premium_upgrade_click мало → оффер слабый.
   */
  paywallShown: (source: PaywallSource) => log('paywall_shown', { source }),

  /**
   * Юзер нажал кнопку апгрейда на premium.
   */
  premiumUpgradeClick: (source: PaywallSource) => log('premium_upgrade_click', { source }),

  /**
   * Покупка premium завершена.
   * Используем стандартное GA4 e-commerce событие — автоматически попадает в Revenue отчёт.
   */
  premiumPurchase: (params: { plan: 'monthly' | 'yearly'; priceUsd: number; currency?: string }) =>
    log('purchase', {
      currency: params.currency ?? 'USD',
      value: params.priceUsd,
      transaction_id: `${Date.now()}`,
      items: JSON.stringify([{ item_id: params.plan, item_name: `Premium ${params.plan}` }]),
    }),

  /**
   * Юзер отменил подписку.
   * Зачем: видим churn rate и можем строить cohort по причинам.
   */
  premiumCancelled: (plan: 'monthly' | 'yearly', daysActive: number) =>
    log('premium_cancelled', { plan, days_active: daysActive }),

  // ═══════════════════════════════════════════════════════════════════════════
  // КОРПОРАТИВНЫЙ ТАРИФ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Учитель создал курс.
   */
  courseCreated: (studentCount: number) => log('course_created', { student_count: studentCount }),

  /**
   * Ученик принял приглашение в курс.
   */
  courseInviteAccepted: () => log('course_invite_accepted'),

  /**
   * Учитель экспортировал статистику.
   */
  statsExported: (format: 'csv' | 'pdf', period: 'week' | 'month' | 'all') =>
    log('stats_exported', { format, period }),
};
