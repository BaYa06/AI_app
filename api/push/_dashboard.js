/**
 * Данные блока «Push» в админке (plan/push_notifications.md, шаг 5.2) — из представлений 5.1.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут. Вызывает локальная
 * админка (api/admin.js, только localhost) — сам модуль хранится в репозитории.
 *
 * Пороги еженедельного разбора (5.4): отключения > 2 % получателей или «открыл → урок» < 20 %
 * две недели подряд — тип переделываем или выключаем.
 */

export const CHURN_RED_PER_1000 = 20; // 2 %
export const OPENED_TO_LESSON_RED_PCT = 20;
export const OPEN_RED_PCT = 3;
/** Победителя A/B не выбираем раньше, чем у каждого варианта будет столько отправок (4.1) */
export const AB_MIN_SENT = 1000;

const pct = (a, b) => (b > 0 ? Math.round((1000 * a) / b) / 10 : null);

export async function getPushDashboard(sql, { days = 7 } = {}) {
  const period = Math.min(90, Math.max(1, Number(days) || 7));

  const funnel = await sql`
    SELECT type, variant,
           SUM(eligible)::int AS eligible, SUM(sent)::int AS sent, SUM(delivered)::int AS delivered,
           SUM(opened)::int AS opened, SUM(lesson_started)::int AS lesson_started, SUM(lesson_completed)::int AS lesson_completed
    FROM push_funnel_daily
    WHERE local_date > CURRENT_DATE - ${period}::int
    GROUP BY type, variant
    ORDER BY type, variant
  `;

  const statuses = await sql`
    SELECT status, COUNT(*)::int AS n FROM push_log
    WHERE created_at > NOW() - make_interval(days => ${period}::int)
    GROUP BY status ORDER BY n DESC
  `;

  const churn = await sql`
    SELECT event, detail, SUM(users)::int AS users, MAX(recipients)::int AS recipients
    FROM push_churn_weekly
    WHERE week > CURRENT_DATE - ${period}::int - 7
    GROUP BY event, detail ORDER BY users DESC
  `;
  const [{ recipients }] = await sql`
    SELECT COUNT(DISTINCT user_id)::int AS recipients FROM push_log
    WHERE status = 'sent' AND created_at > NOW() - make_interval(days => ${period}::int)
  `;

  const holdout = await sql`
    SELECT cohort_week::text AS cohort_week, push_group, users::int, d1_pct, d7_pct, d30_pct
    FROM push_holdout_retention
    WHERE cohort_week > CURRENT_DATE - 70
    ORDER BY cohort_week DESC, push_group
  `;

  // Пауза (PUSH_PAUSED) — переменная Vercel, локально её не видно: судим по журналу за последний час
  const [{ paused }] = await sql`
    SELECT COUNT(*)::int AS paused FROM push_log WHERE status = 'paused' AND created_at > NOW() - INTERVAL '1 hour'
  `;

  // Сводка по типам (варианты сложены) и красные флаги для разбора
  const byType = new Map();
  for (const r of funnel) {
    const t = byType.get(r.type) || { type: r.type, eligible: 0, sent: 0, delivered: 0, opened: 0, lesson_started: 0, lesson_completed: 0, variants: [] };
    for (const k of ['eligible', 'sent', 'delivered', 'opened', 'lesson_started', 'lesson_completed']) t[k] += r[k];
    t.variants.push({
      variant: r.variant, sent: r.sent, opened: r.opened, lesson_completed: r.lesson_completed,
      openPct: pct(r.opened, r.sent), openedToLessonPct: pct(r.lesson_completed, r.opened),
      enoughForAB: r.sent >= AB_MIN_SENT,
    });
    byType.set(r.type, t);
  }
  const types = [...byType.values()].map((t) => ({
    ...t,
    openPct: pct(t.opened, t.sent),
    openedToLessonPct: pct(t.lesson_completed, t.opened),
    pushToLessonPct: pct(t.lesson_completed, t.sent),
  }));

  const flags = [];
  for (const t of types) {
    if (t.sent >= 50 && t.openPct !== null && t.openPct < OPEN_RED_PCT) flags.push(`${t.type}: открывают ${t.openPct}% (меньше ${OPEN_RED_PCT}%)`);
    if (t.opened >= 20 && t.openedToLessonPct !== null && t.openedToLessonPct < OPENED_TO_LESSON_RED_PCT) {
      flags.push(`${t.type}: после открытия урок завершают ${t.openedToLessonPct}% (меньше ${OPENED_TO_LESSON_RED_PCT}%)`);
    }
  }
  for (const c of churn) {
    const per1000 = recipients > 0 ? Math.round((1000 * c.users) / recipients) : null;
    c.per1000 = per1000;
    if (per1000 !== null && per1000 > CHURN_RED_PER_1000) {
      flags.push(`${c.event}${c.detail ? ` (${c.detail})` : ''}: ${per1000} на 1000 получателей (больше 2%)`);
    }
  }

  const sent = statuses.find((s) => s.status === 'sent')?.n || 0;
  return {
    period,
    totals: { sent, recipients, statuses },
    types,
    churn,
    holdout,
    paused: paused > 0,
    flags,
  };
}
