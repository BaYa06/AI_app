/**
 * Реестр push-уведомлений (plan/push_notifications.md, шаг 2.1) — источник правды по типам пушей.
 * Файл начинается с «_», поэтому Vercel не публикует его как отдельный роут.
 *
 * На тип: category — для журнала и переключателей в настройках (2.4); priority — меньше = важнее,
 * арбитр (2.2) берёт самый важный; transactional — уходит и на паузе, и мимо дневного лимита;
 * minIntervalDays — не чаще раза в N дней; link — куда ведёт тап; variants — тексты (A/B — этап 4).
 *
 * Вариант получает ctx = { userId, name, displayName, streak, longest, secPerAnswer, data } и возвращает { title, body }.
 * Вариантов несколько (4.1) — выбирается variantIndex(userId, type); правила тона — plan/brandbook.md, 9.1.
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
  // Вечером, если серия ≥ 3 и урок не сделан (3.3) — второй пуш дня, не чаще 2 раз в неделю
  streak_risk: {
    category: 'streak',
    priority: 2,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: `Серия ${data.streak} ${plural(data.streak, 'день', 'дня', 'дней')} сгорит в полночь`,
        body: 'Хватит 2 минут, чтобы её сохранить',
      }),
    ],
  },
  // Учитель добавил набор в курс (3.5) — транзакционный, всем ученикам курса
  course_new_set: {
    category: 'course',
    priority: 1,
    transactional: true,
    minIntervalDays: 0,
    link: (data) => (data?.setId ? `flashly://set/${encodeURIComponent(data.setId)}?from=push` : LESSON_LINK()),
    variants: [
      ({ data }) => ({
        title: `Новый набор в курсе «${data.course}»`,
        body: `${data.set}: ${data.count} ${plural(data.count, 'слово', 'слова', 'слов')}`,
      }),
    ],
  },
  // Тебя обогнали в рейтинге курса (3.5): вт–сб, в обычное время, не чаще раза в неделю. Только имя
  rating_overtaken: {
    category: 'rating',
    priority: 4,
    transactional: false,
    minIntervalDays: 7,
    link: ratingLink(null),
    variants: [
      ({ data }) => ({
        title: 'Тебя обогнали в рейтинге',
        body: data.rival
          ? `${data.rival} теперь впереди на ${data.gap} ${plural(data.gap, 'очко', 'очка', 'очков')}. До конца недели ещё есть время`
          : `Тебя обогнали на ${data.gap} ${plural(data.gap, 'очко', 'очка', 'очков')}. До конца недели ещё есть время`,
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
        body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} давно без повторения — спаси их за ${minutesFor(data.count, secPerAnswer)} мин`,
      }),
      ({ data, secPerAnswer }) => ({
        title: `${data.count} ${plural(data.count, 'слово начинает', 'слова начинают', 'слов начинают')} забываться`,
        body: `Повтори их за ~${minutesFor(data.count, secPerAnswer)} мин, пока они ещё в памяти`,
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
      ({ data, secPerAnswer }) => ({
        title: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} на повторение`,
        body: `Займёт ~${minutesFor(data.count, secPerAnswer)} мин — лучше сейчас, пока помнишь`,
      }),
      ({ data, secPerAnswer }) => ({
        title: `~${minutesFor(data.count, secPerAnswer)} мин на повторение`,
        body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} как раз пора повторить`,
      }),
    ],
  },
  // Повторять нечего, но в текущем наборе есть новые слова (3.2)
  lesson_new_words: {
    category: 'lesson',
    priority: 7,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: 'Новые слова на сегодня',
        body: `${data.count} ${plural(data.count, 'новое слово', 'новых слова', 'новых слов')} из «${data.set}» · ~${newWordsMinutes(data.count)} мин`,
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
        body: `${name}, у тебя ${streak} ${plural(streak, 'день', 'дня', 'дней')} подряд. Позанимайся сегодня`,
      }),
      ({ streak }) => ({
        title: `Серия: ${streak} ${plural(streak, 'день', 'дня', 'дней')}`,
        body: `Сделай сегодняшний урок — и будет ${streak + 1}`,
      }),
    ],
  },
  // Лестница возврата (3.4): 2 / 4 / 7 / 14 / 30 дней без занятий, дальше — тишина.
  // reactivation_3d — старая ступень, остаётся для отложенных и журнала, арбитр её больше не выбирает.
  reactivation_2d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data, secPerAnswer }) => ({
        title: 'Слова ждут',
        body: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} повторения · ~${minutesFor(data.count, secPerAnswer)} мин`,
      }),
      ({ data, secPerAnswer }) => ({
        title: `${data.count} ${plural(data.count, 'слово ждёт', 'слова ждут', 'слов ждут')} тебя`,
        body: `~${minutesFor(data.count, secPerAnswer)} мин — и повторение сделано`,
      }),
    ],
  },
  reactivation_4d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: 'Слова скоро забудутся',
        body: `Без повторения ${data.count} ${plural(data.count, 'слово скоро забудется', 'слова скоро забудутся', 'слов скоро забудутся')}`,
      }),
      ({ data }) => ({
        title: 'Пора освежить слова',
        body: `${data.count} ${plural(data.count, 'слово', 'слова', 'слов')} без повторения — хватит пары минут`,
      }),
    ],
  },
  reactivation_14d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      () => ({ title: 'Лёгкий вход', body: 'Начни с 5 слов — займёт минуту' }),
      () => ({ title: 'Вернись с 5 слов', body: 'Одна минута — и ты снова в ритме' }),
    ],
  },
  reactivation_30d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ data }) => ({
        title: data.sets === 1 ? 'Твой набор на месте' : 'Твои наборы на месте',
        body: `${data.sets} ${plural(data.sets, 'набор ждёт', 'набора ждут', 'наборов ждут')}. Вернёшься — продолжим с того же места`,
      }),
      ({ data }) => ({
        title: `${data.sets} ${plural(data.sets, 'набор', 'набора', 'наборов')} на месте`,
        body: 'Продолжим с того же места в любой момент',
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
  // Ступень 7 дней (3.4): прогресс. Без выученных слов — прежний текст про рекорд серии
  reactivation_7d: {
    category: 'reactivation',
    priority: 9,
    transactional: false,
    minIntervalDays: 0,
    link: LESSON_LINK,
    variants: [
      ({ longest, data }) => (data.learned > 0
        ? {
            title: 'Не дай словам пропасть',
            body: `Выучено ${data.learned} ${plural(data.learned, 'слово', 'слова', 'слов')}. Не дай ${data.learned === 1 ? 'ему' : 'им'} пропасть`,
          }
        : {
            title: 'Вернись к учёбе',
            body: `Твой рекорд был ${longest} ${plural(longest, 'день', 'дня', 'дней')}. Начни новую серию!`,
          }),
      ({ longest, data }) => (data.learned > 0
        ? {
            title: `${data.learned} ${plural(data.learned, 'слово уже твоё', 'слова уже твои', 'слов уже твои')}`,
            body: 'Неделя без повторения — самое время освежить',
          }
        : {
            title: `Рекорд серии — ${longest} ${plural(longest, 'день', 'дня', 'дней')}`,
            body: 'Начни новую серию сегодня',
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
        body: `${name}, это твой личный рекорд. Так держать`,
      }),
    ],
  },
};

/** Описание типа или null для неизвестного */
export function pushType(type) {
  return Object.hasOwn(PUSH_TYPES, type) ? PUSH_TYPES[type] : null;
}

/**
 * Вариант текста (4.1): детерминированно по пользователю и типу (FNV-1a), чтобы человек не прыгал
 * между вариантами. Сравниваем варианты не по открытиям, а по «открыл → урок завершён».
 */
export function variantIndex(userId, type, count) {
  if (count <= 1 || !userId) return 0;
  let h = 0x811c9dc5;
  for (const ch of `${userId}:${type}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % count;
}

/**
 * Собрать пуш: { title, body, link, variant } или null — неизвестный тип или текст без конкретики
 * (нет ни числа, ни имени: например, данные не пришли и вышло «undefined слов»).
 */
export function buildPush(type, ctx) {
  const def = pushType(type);
  if (!def) return null;
  const variant = variantIndex(ctx.userId, type, def.variants.length);
  const message = def.variants[variant]({ ...ctx, data: ctx.data || {} });
  const text = `${message.title} ${message.body}`;
  if (text.includes('undefined') || text.includes('NaN')) return null;
  const specific = /\d/.test(text) || (!!ctx.displayName && text.includes(ctx.displayName));
  if (!specific) return null;
  return { ...message, link: def.link(ctx.data || {}), variant: `v${variant + 1}` };
}
