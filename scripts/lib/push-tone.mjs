/**
 * Проверка тона пушей (plan/brandbook.md, 9.1; plan/push_notifications.md, 4.2).
 * Собирает каждый вариант каждого типа из api/push/_registry.js на разных данных (1, 3, 12, 21;
 * с именем и без) и проверяет правила. Вызывается из scripts/brand-check.mjs.
 */

const RU_WORD = (word) => new RegExp(`(?<![а-яё])${word}(?![а-яё])`, 'iu');

/** Обвинения и мужской род прошедшего времени («ты забросил», «давно не повторял») — пол человека неизвестен */
const GENDERED_OR_BLAMING = ['забросил', 'бросил', 'пропустил', 'повторял', 'выучил', 'заходил', 'обогнал', 'забыл', 'сделал', 'учил', 'готов', 'ленился']
  .map((w) => [w, RU_WORD(w)]);
const FORMAL = RU_WORD('(вы|вас|вам|ваш|ваша|ваше|ваши)');
const EMOJI = /\p{Extended_Pictographic}/gu;
/** На экране блокировки видно заголовок и начало текста — число или имя должно попасть туда */
const VISIBLE_BODY_CHARS = 40;

const SAMPLE_NAME = 'Бакыт';

function sampleData(n) {
  return {
    count: n, place: Math.min(n, 9) + 1, gap: n, reward: n, teacher: 'Айгуль', prevStreak: n + 2, days: n + 2,
    course: 'English A2', set: 'Travel', inHours: n % 2 ? 1 : 2, streak: n + 2, learned: n, sets: n,
    rival: SAMPLE_NAME, setId: 's1', courseId: 'c1',
  };
}

export function checkPushTexts(PUSH_TYPES) {
  const problems = [];
  for (const [type, def] of Object.entries(PUSH_TYPES)) {
    def.variants.forEach((variant, i) => {
      const seen = new Set();
      for (const n of [1, 3, 12, 21]) {
        for (const displayName of [SAMPLE_NAME, null]) {
          const ctx = { userId: 'u', name: displayName || 'Привет', displayName, streak: n + 2, longest: n + 5, secPerAnswer: null, data: sampleData(n) };
          const { title, body } = variant(ctx);
          const text = `${title} ${body}`;
          const add = (rule) => {
            const key = `${rule}`;
            if (seen.has(key)) return;
            seen.add(key);
            problems.push({ type, variant: `v${i + 1}`, rule, text });
          };
          if (/undefined|NaN|null/.test(text)) add('пустые данные в тексте');
          if (/!!/.test(text) || (text.match(/!/g) || []).length > 1) add('больше одного «!»');
          if ((text.match(EMOJI) || []).length > 1) add('больше одного эмодзи');
          if (FORMAL.test(text)) add('обращение на «вы»');
          for (const [word, re] of GENDERED_OR_BLAMING) if (re.test(text)) add(`«${word}» — род или упрёк`);
          const visible = `${title} ${body.slice(0, VISIBLE_BODY_CHARS)}`;
          const specific = /\d/.test(visible) || (displayName && visible.includes(displayName));
          // Тексты без числа и имени не собираются (buildPush) — но если число есть только в хвосте, его не увидят
          if (!specific && (/\d/.test(text) || (displayName && text.includes(displayName)))) add(`число или имя дальше ${VISIBLE_BODY_CHARS} символов текста`);
        }
      }
    });
  }
  return problems;
}
