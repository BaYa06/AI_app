/**
 * Реестр push-уведомлений (plan/push_notifications.md, шаг 2.1) — источник правды по типам пушей.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 *
 * На тип: category — для журнала и переключателей в настройках (2.4); priority — меньше = важнее,
 * арбитр (2.2) берёт самый важный; transactional — уходит и на паузе, и мимо дневного лимита;
 * minIntervalDays — не чаще раза в N дней; link — куда ведёт тап; variants — тексты (A/B — этап 4).
 *
 * Вариант получает ctx = { name, displayName, streak, longest, secPerAnswer, data } и возвращает { title, body }.
 * Правило реестра (принцип 3 плана): в тексте должно быть число или имя, иначе пуш не собирается.
 */

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m100 >= 11 && m100 <= 19) return many;
  if (m10 === 1) return one;
  if (m10 >= 2 && m10 <= 4) return few;
  return many;
}

/**
 * Примерное время повторения: секунд на слово — из профиля привычек (2.9, медиана ответа человека),
 * без профиля — ~15 секунд.
 */
const DEFAULT_SEC_PER_WORD = 15;
/** Ответ — не весь урок: переходы и чтение тоже занимают время, поэтому не меньше 4 и не больше 30 секунд */
const MIN_SEC_PER_WORD = 4;
const MAX_SEC_PER_WORD = 30;
/** Новое слово дольше повторения: ~22 секунды (как estimateMinutes в LessonService) */
const SEC_PER_NEW_WORD = 22;
function newWordsMinutes(count) {
  return Math.max(1, Math.round(((count || 0) * SEC_PER_NEW_WORD) / 60));
}

function minutesFor(count, secPerAnswer) {
  const sec = Number(secPerAnswer) > 0
    ? Math.min(MAX_SEC_PER_WORD, Math.max(MIN_SEC_PER_WORD, Number(secPerAnswer)))
    : DEFAULT_SEC_PER_WORD;
  return Math.max(1, Math.round(((count || 0) * sec) / 60));
}

const LESSON_LINK = () => 'flashly://lesson?from=push';

/** Рейтинг курса; без courseId — урок дня (старые записи без курса) */
function ratingLink(week) {
  return (data) => (data?.courseId
    ? `flashly://rating/${encodeURIComponent(data.courseId)}?from=push${week ? `&week=${week}` : ''}`
    : LESSON_LINK());
}

export const PUSH_TYPES = {
  teacher_review: {
    category: 'course',
    priority: 1,
    transactional: true,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data, secPerAnswer }) => ({
        title: `${data.teacher || 'Учитель'} просит повторить слова`,
        body: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения · ~${minutesFor(data.count, secPerAnswer)} мин`,
      }),
    ],
  },
  // «Повтори перед занятием» (2.8): по расписанию курса от учителя или по занятиям из «о себе»
  class_prep: {
    category: 'course',
    priority: 2,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data, secPerAnswer }) => ({
        title: data.course ? `Скоро занятие: «${data.course}»` : 'Скоро занятие',
        body: `${data.inHours === 1 ? 'Через час' : 'Через 2 часа'} — повтори ${data.count} ${plural(data.count, 'слово', 'слова', 'слов')}${data.course ? ' курса' : ''} · ~${minutesFor(data.count, secPerAnswer)} мин`,
      }),
    ],
  },
  rating_sunday: {
    category: 'rating',
    priority: 3,
    transactional: false,
    minIntervalDays: 0,
    link: ratingLink(null),
    variants: [
      ({ data }) => ({
        title: 'Последний день недели',
        body: data.gap != null
          ? `Ты на ${data.place}-м месте, до ${data.place - 1}-го — ${data.gap} ${plural(data.gap, 'очко', 'очка', 'очков')}. Рейтинг закроется в полночь`
          : `Ты на ${data.place}-м месте в рейтинге курса. Удержи его до полуночи!`,
      }),
    ],
  },
  weekly_result: {
    category: 'rating',
    priority: 3,
    transactional: false,
    minIntervalDays: 0,
    link: ratingLink('previous'),
    variants: [
      ({ data }) => ({
        title: 'Итоги недели',
        body: `${data.place}-е место в курсе${data.reward > 0 ? `, +${data.reward} ${plural(data.reward, 'алмаз', 'алмаза', 'алмазов')}` : ''}. Новая неделя началась!`,
      }),
    ],
  },
  words_fading: {
    category: 'lesson',
    priority: 5,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data, secPerAnswer }) => ({
        title: 'Слова начинают забываться',
        body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} давно не повторял — спаси их за ${minutesFor(data.count, secPerAnswer)} мин`,
      }),
    ],
  },
  review_due: {
    category: 'lesson',
    priority: 6,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data, secPerAnswer }) => ({
        title: 'Пора повторить',
        body: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения · ~${minutesFor(data.count, secPerAnswer)} мин`,
      }),
    ],
  },
  streak_reminder: {
    category: 'streak',
    priority: 8,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ name, streak }) => ({
        title: 'Не теряй серию!',
        body: `${name}, у тебя ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд. Позанимайся сегодня!`,
      }),
    ],
  },
  reactivation_3d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ name }) => ({ title: 'Давно не виделись', body: `${name}, прошло 3 дня. Карточки ждут тебя!` }),
    ],
  },
  reactivation_7d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ longest }) => ({
        title: 'Вернись к учёбе',
        body: `Твой рекорд был ${longest} ${plural(longest, 'день', 'дня', 'дней')}. Начни новую серию!`,
      }),
    ],
  },
  // Онбординг (3.1): зарегистрировался, но урок не начат — через 3 часа (тихие часы — в 19:00)
  onboarding_first_lesson: {
    category: 'onboarding',
    priority: 5,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: `Первый урок — ~${newWordsMinutes(data.count)} мин`,
        body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} из «${data.set}» уже ${plural(data.count, 'готово', 'готовы', 'готовы')}`,
      }),
    ],
  },
  // Онбординг (3.1): первый урок был вчера, сегодня не учился — в час вчерашнего урока
  onboarding_day2: {
    category: 'onboarding',
    priority: 5,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: 'Повтори вчерашние слова',
        body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} со вчерашнего урока пора повторить — так ${data.count === 1 ? 'оно запомнится' : 'они запомнятся'}`,
      }),
    ],
  },
  // Шлёт data.js при сохранении прогресса. По плану это пуш утра следующего дня (этап 3)
  streak_lost: {
    category: 'streak',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: 'Серия прервана',
        body: `Серия в ${data.prevStreak} ${plural(data.prevStreak, 'день', 'дня', 'дней')} потеряна. Начни сегодня заново!`,
      }),
    ],
  },
  // Шлёт data.js. По плану — награда внутри приложения, а пушем только 7 / 30 / 100 / 365 (этап 3)
  streak_milestone: {
    category: 'streak',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ name, data }) => ({
        title: `${data.days} ${plural(data.days, 'день', 'дня', 'дней')} подряд!`,
        body: `${name}, это твой личный рекорд! Так держать`,
      }),
    ],
  },
};

/** Описание типа или null для неизвестного */
export function pushType(type) {
  return Object.hasOwn(PUSH_TYPES, type) ? PUSH_TYPES[type] : null;
}

/**
 * Собрать пуш: { title, body, link, variant } или null — неизвестный тип или текст без конкретики
 * (нет ни числа, ни имени: например, данные не пришли и вышло «undefined слов»).
 */
export function buildPush(type, ctx) {
  const def = pushType(type);
  if (!def) return null;
  const variant = 0; // A/B-варианты — этап 4
  const message = def.variants[variant]({ ...ctx, data: ctx.data || {} });
  const text = `${message.title} ${message.body}`;
  if (text.includes('undefined') || text.includes('NaN')) return null;
  const specific = /\d/.test(text) || (!!ctx.displayName && text.includes(ctx.displayName));
  if (!specific) return null;
  return { ...message, link: def.link(ctx.data || {}), variant: `v${variant + 1}` };
}
