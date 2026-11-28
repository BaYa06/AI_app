/**
 * Сборка экзамена (plan/new/live_exam.md, раздел B, LiveExam 5–6). Чистые функции, без ИИ.
 *
 * Вход — карточки выбранных наборов, сложность слов для класса (difficulty.js) и настройки
 * учителя. Выход — состав экзамена, общий для всех учеников: слова, форматы, неверные варианты
 * (фиксируются здесь, у ученика меняется только порядок), блоки пар, баллы, рекомендованное
 * время, а также шаги сборки с настоящими цифрами и предупреждения для учителя.
 */
import { makeRng, shuffleWith } from './rng.js';
import { findGap, guessPos, GAP_MARK } from './prepare.js';
import { normalize, sameAnswer } from './check.js';
import { applyForm, formOfGapKind } from './forms.js';

export const FORMATS = ['choice', 'write', 'scramble', 'match', 'gap'];

/** Секунды на вопрос (на пару — для match). Решение пользователя 17.11.2026. */
export const SECONDS = { choice: 13, write: 28, scramble: 23, gap: 18, match: 8 };
export const TIME_RESERVE = 1.2;

export const LIMITS = {
  writeMaxChars: 25,
  writeMaxWords: 3,
  scrambleMinLetters: 3,
  scrambleMaxLetters: 14,
  scrambleMaxWords: 2,
  scrambleTwoRowsFrom: 8,
  matchMaxChars: 90,
  pairMin: 3,
  pairMax: 5,
  pairDefault: 4,
  maxCount: 100,
};

const LEVELS = ['easy', 'mid', 'hard'];

// ─── Подходит ли слово формату ──────────────────────────────

function words(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function canWrite(card) {
  const f = String(card.front || '').trim();
  return (
    f.length > 0 && f.length <= LIMITS.writeMaxChars && words(f).length <= LIMITS.writeMaxWords
  );
}

export function canScramble(card) {
  const f = String(card.front || '').trim();
  if (!/^[\p{L} ]+$/u.test(f)) return false;
  const letters = f.replace(/\s/g, '').length;
  return (
    letters >= LIMITS.scrambleMinLetters &&
    letters <= LIMITS.scrambleMaxLetters &&
    words(f).length <= LIMITS.scrambleMaxWords
  );
}

export function canMatch(card) {
  return (
    String(card.front || '').trim().length <= LIMITS.matchMaxChars &&
    String(card.back || '').trim().length <= LIMITS.matchMaxChars
  );
}

// ─── Неверные варианты ──────────────────────────────────────

/**
 * 3 неверных варианта для поля field ('front' | 'back') карточки target.
 * Та же часть речи (если известна), похожая длина, другая первая буква предпочтительнее,
 * без совпадений с правильным после нормализации (включая варианты через запятую).
 * form — поставить варианты в ту же форму, что и ответ в предложении («вставь слово»).
 */
export function pickDistractors(target, field, ctx, { count = 3, form = null } = {}) {
  const correct = form ? applyForm(target.front, form) || target[field] : target[field];
  const targetLen = String(correct).length || 1;
  const first = normalize(correct)[0];
  const pos = ctx.posOf(target);
  const seen = new Set([normalize(correct)]);
  const scored = [];
  for (const c of ctx.distractorPool) {
    if (c.id === target.id) continue;
    // Слово, которое ученик пишет или собирает сам, в вариантах не показываем: подсказка написания
    if ((field === 'front' || form) && ctx.avoid.has(normalize(c.front))) continue;
    if (sameAnswer(c.front, target.front)) continue; // то же слово в другом наборе
    let value = String(c[field] || '').trim();
    if (!value) continue;
    if (form) {
      value = applyForm(c.front, form);
      if (!value) continue;
    }
    const key = normalize(value);
    if (seen.has(key) || sameAnswer(value, correct)) continue;
    if (field === 'back' && sameAnswer(c.back, target.back)) continue;
    const cPos = ctx.posOf(c);
    if (pos && cPos && pos !== cPos) continue;
    seen.add(key);
    const lenDiff = Math.abs(value.length - targetLen) / targetLen;
    const sameFirst = key[0] === first ? 0.25 : 0;
    scored.push({ value, score: lenDiff + sameFirst + ctx.rng() * 0.3 });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, count).map((s) => s.value);
}

// ─── Один вопрос ────────────────────────────────────────────

/**
 * Вопрос формата format для карточки card или null, если слово этому формату не подходит
 * (например, не хватает неверных вариантов).
 */
export function makeItem(card, format, ctx, { direction } = {}) {
  const level = ctx.levels.get(card.id) || 'mid';
  const base = {
    cardId: card.id,
    format,
    difficulty: level,
    extra: {},
  };
  const def = ctx.backKind === 'definition';
  const pos = ctx.posOf(card);
  if (pos) base.extra.pos = pos;

  if (format === 'choice') {
    const dir = def ? 'back' : direction || 'forward';
    const field = dir === 'forward' ? 'back' : 'front';
    const options = pickDistractors(card, field, ctx);
    if (options.length < 3) return null;
    return {
      ...base,
      direction: dir,
      prompt: dir === 'forward' ? card.front : card.back,
      answer: dir === 'forward' ? card.back : card.front,
      options: [dir === 'forward' ? card.back : card.front, ...options],
    };
  }
  if (format === 'write') {
    if (!canWrite(card)) return null;
    return { ...base, direction: 'back', prompt: card.back, answer: card.front, options: null };
  }
  if (format === 'scramble') {
    if (!canScramble(card)) return null;
    const letters = card.front.replace(/\s/g, '').length;
    base.extra.rows = letters >= LIMITS.scrambleTwoRowsFrom ? 2 : 1;
    return {
      ...base,
      direction: 'back',
      prompt: card.back,
      answer: card.front.trim(),
      options: null,
    };
  }
  if (format === 'match') {
    if (!canMatch(card)) return null;
    base.extra.layout = def ? 'stacked' : 'columns';
    return { ...base, direction: 'pair', prompt: card.front, answer: card.back, options: null };
  }
  if (format === 'gap' && ctx.aiGap) {
    // Предложение, форму слова и неверные варианты напишет ИИ (api/_ai/exam-gap.js) — здесь заготовка.
    // Длинные фразы в пропуск не ставим: им место в выборе и письме.
    if (!canWrite(card)) return null;
    base.extra.baseForm = card.front.trim();
    base.extra.ai = 'pending';
    return { ...base, direction: 'gap', prompt: '', answer: card.front.trim(), options: null };
  }
  if (format === 'gap') {
    const gap = ctx.gapOf(card);
    if (!gap) return null;
    const form = formOfGapKind(gap.gapKind);
    if (!form) return null;
    const options = pickDistractors(card, 'front', ctx, { form });
    if (options.length < 3) return null;
    base.extra.baseForm = card.front.trim();
    base.extra.gapKind = gap.gapKind;
    return {
      ...base,
      direction: 'gap',
      prompt: gap.gapText,
      answer: gap.gapAnswer,
      options: [gap.gapAnswer, ...options],
    };
  }
  return null;
}

// ─── Доли форматов и блоки пар ──────────────────────────────

/**
 * Число вопросов каждого формата по умолчанию. Для слов с определениями и примерами —
 * «вставь слово» вместо письма (письмо по определению слишком трудное для разминки класса).
 */
export function defaultFormats(n, { backKind = 'translation', gapShare = 0 } = {}) {
  const shares =
    backKind === 'definition' && gapShare >= 0.5
      ? { choice: 0.25, gap: 0.2, scramble: 0.25, match: 0.3, write: 0 }
      : { choice: 0.4, write: 0.25, scramble: 0.15, match: 0.2, gap: 0 };
  const raw = FORMATS.map((f) => [f, (shares[f] || 0) * n]);
  const out = Object.fromEntries(raw.map(([f, v]) => [f, Math.floor(v)]));
  let rest = n - Object.values(out).reduce((a, b) => a + b, 0);
  const byRemainder = [...raw].sort((a, b) => (b[1] % 1) - (a[1] % 1));
  for (const [f] of byRemainder) {
    if (rest <= 0) break;
    if ((shares[f] || 0) === 0) continue;
    out[f]++;
    rest--;
  }
  if (out.match > 0 && out.match < LIMITS.pairMin) {
    out.choice += out.match;
    out.match = 0;
  }
  return out;
}

/** Делит n пар на блоки по 3–5 (как можно ближе к size). [] — пар меньше 3. */
export function pairBlocks(n, size = LIMITS.pairDefault) {
  if (n < LIMITS.pairMin) return [];
  const s = Math.min(LIMITS.pairMax, Math.max(LIMITS.pairMin, size));
  let k = Math.max(1, Math.round(n / s));
  while (n / k > LIMITS.pairMax) k++;
  while (k > 1 && n / k < LIMITS.pairMin) k--;
  const blocks = Array.from({ length: k }, (_, i) => Math.floor(n / k) + (i < n % k ? 1 : 0));
  return blocks;
}

/** Рекомендованное время, секунды и минуты (сумма × 1,2, вверх до целой минуты) */
export function recommendedTime(counts) {
  const sec = FORMATS.reduce((sum, f) => sum + (counts[f] || 0) * SECONDS[f], 0);
  const withReserve = Math.round(sec * TIME_RESERVE);
  return { baseSec: sec, sec: withReserve, minutes: Math.max(1, Math.ceil(withReserve / 60)) };
}

// ─── Сборка ─────────────────────────────────────────────────

/** Один раз на сборку: быстрые справочники по карточкам */
export function makeContext({ cards, distractorPool, backKind, levels, seed, aiGap = false }) {
  const gaps = new Map();
  const posCache = new Map();
  return {
    backKind,
    /** «Вставь слово» пишет ИИ (веб-кабинет): пример в карточке не нужен, вопрос — заготовка */
    aiGap,
    levels: levels || new Map(),
    rng: makeRng(seed ?? 1),
    /** Нормализованные слова письма / «собери» / «вставь» — не брать в варианты */
    avoid: new Set(),
    distractorPool: dedupeCards(distractorPool && distractorPool.length ? distractorPool : cards),
    gapOf(card) {
      if (!gaps.has(card.id)) gaps.set(card.id, findGap(card.front, card.example));
      return gaps.get(card.id);
    },
    posOf(card) {
      if (!posCache.has(card.id)) posCache.set(card.id, guessPos(card.back, backKind));
      return posCache.get(card.id);
    },
  };
}

/** Без дублей по нормализованной лицевой стороне (первая карточка остаётся) */
export function dedupeCards(cards) {
  const seen = new Set();
  const out = [];
  for (const c of cards || []) {
    const key = normalize(c.front);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Слова по кругу из групп сложности — чтобы в каждом формате были разные уровни */
function interleave(byLevel) {
  const out = [];
  const lists = ['easy', 'mid', 'hard', 'unstudied'].map((l) => [...(byLevel[l] || [])]);
  while (lists.some((l) => l.length)) for (const l of lists) if (l.length) out.push(l.shift());
  return out;
}

/** Выбор слов (B3). Возвращает { chosen, warnings, excludedUnstudied } */
function chooseWords(pool, n, config, ctx, rng) {
  const warnings = [];
  const levelOf = (c) => ctx.levels.get(c.id) || 'mid';
  const unstudied = pool.filter((c) => levelOf(c) === 'unstudied');
  const usable = config.includeUnstudied ? pool : pool.filter((c) => levelOf(c) !== 'unstudied');

  if (config.mode === 'manual') {
    const want = new Set(config.cardIds || []);
    const chosen = pool.filter((c) => want.has(c.id));
    return { chosen: chosen.slice(0, n), warnings, excludedUnstudied: 0 };
  }
  if (config.mode === 'random') {
    return {
      chosen: shuffleWith(rng, usable).slice(0, n),
      warnings,
      excludedUnstudied: config.includeUnstudied ? 0 : unstudied.length,
    };
  }

  // По сложности: по ⌈n/3⌉ из группы, нехватку добираем из соседней
  const groups = { easy: [], mid: [], hard: [] };
  for (const c of shuffleWith(rng, usable)) {
    const l = levelOf(c);
    groups[l === 'unstudied' ? 'hard' : l].push(c);
  }
  const target = Math.ceil(n / 3);
  const chosen = [];
  const take = (level, k) => {
    const got = groups[level].splice(0, k);
    chosen.push(...got);
    return got.length;
  };
  // 3 × ⌈n/3⌉ ≥ n, поэтому последней группе достаётся остаток: 20 → 7 / 7 / 6
  const short = [];
  for (const l of LEVELS) {
    const want = Math.min(target, n - chosen.length);
    if (take(l, want) < want) short.push(l);
  }
  for (const l of ['mid', 'easy', 'hard']) if (chosen.length < n) take(l, n - chosen.length);
  if (short.length) {
    const names = { easy: 'лёгких', mid: 'средних', hard: 'сложных' };
    warnings.push({
      code: 'level_short',
      text: `Не хватило ${short.map((l) => names[l]).join(' и ')} слов — добрали из соседней группы`,
    });
  }
  return {
    chosen: chosen.slice(0, n),
    warnings,
    excludedUnstudied: config.includeUnstudied ? 0 : unstudied.length,
  };
}

/** Тексты, которые ученик увидит в вопросе (для проверки на подсказки) */
function shownTexts(item) {
  if (item.format === 'match') return [item.prompt, item.answer];
  return [item.prompt, ...(item.options || [])];
}

/** Слово card встречается в тексте text (целиком, в любой правильной форме)? */
function mentions(text, card) {
  return Boolean(findGap(card.front, String(text || '').replace(new RegExp(GAP_MARK, 'g'), ' ')));
}

/**
 * Собрать экзамен.
 * @param input.cards — карточки выбранных наборов [{ id, setId, front, back, example }]
 * @param input.distractorPool — откуда брать неверные варианты (по умолчанию cards)
 * @param input.backKind — 'translation' | 'definition'
 * @param input.levels — Map cardId → уровень (difficulty.js)
 * @param input.difficultySource — 'class' | 'exams' | 'text'
 * @param input.classSummary — { students, reviews } для шага «Смотрим, как учил класс»
 * @param input.config — { count, mode, cardIds, includeUnstudied, formats, pairSize }
 * @param input.seed
 */
export function buildExam(input) {
  const { backKind = 'translation', config = {}, seed = 1 } = input;
  const ctx = makeContext({ ...input, seed });
  const rng = makeRng(`${seed}:choose`);
  const pool = dedupeCards(input.cards);
  const warnings = [];

  const n = Math.max(1, Math.min(LIMITS.maxCount, Number(config.count) || 20, pool.length));
  if ((Number(config.count) || 20) > pool.length) {
    warnings.push({
      code: 'pool_small',
      text: `В выбранных наборах только ${pool.length} слов — экзамен из ${pool.length}`,
    });
  }

  const picked = chooseWords(pool, n, config, ctx, rng);
  warnings.push(...picked.warnings);
  let chosen = picked.chosen;
  // Не хватило изученных слов — добираем неизученными, а не делаем экзамен короче
  if (chosen.length < n && !config.includeUnstudied && config.mode !== 'manual') {
    const extra = pool.filter((c) => ctx.levels.get(c.id) === 'unstudied' && !chosen.includes(c));
    const add = extra.slice(0, n - chosen.length);
    if (add.length) {
      chosen = [...chosen, ...add];
      warnings.push({
        code: 'unstudied_added',
        text: `Изученных слов не хватило — добавили ${add.length} неизученных`,
      });
    }
  }
  const total = chosen.length;

  // ── Форматы ──
  const gapShare = ctx.aiGap
    ? 1
    : chosen.length > 0
      ? chosen.filter((c) => ctx.gapOf(c)).length / chosen.length
      : 0;
  const wanted = normalizeFormats(config.formats, total, { backKind, gapShare });
  const pairSize = Number(config.pairSize) || LIMITS.pairDefault;

  const byLevel = { easy: [], mid: [], hard: [], unstudied: [] };
  for (const c of shuffleWith(makeRng(`${seed}:formats`), chosen)) {
    byLevel[ctx.levels.get(c.id) || 'mid'].push(c);
  }
  let free = interleave(byLevel);
  const items = [];
  const shortages = [];
  const formatNames = {
    scramble: '«Собери»',
    gap: '«Вставь слово»',
    match: 'пары',
    write: 'письмо',
  };
  const notEligible = { scramble: [], write: [] };

  // Самые «узкие» форматы первыми
  for (const format of ['scramble', 'gap', 'match', 'write']) {
    let need = wanted[format] || 0;
    if (format === 'match') {
      const blocks = pairBlocks(need, pairSize);
      need = blocks.reduce((a, b) => a + b, 0);
    }
    const got = [];
    const rest = [];
    for (const c of free) {
      if (got.length >= need) {
        rest.push(c);
        continue;
      }
      let item = makeItem(c, format, ctx);
      // В парах два одинаковых перевода сделали бы задание нерешаемым
      if (item && format === 'match' && got.some((g) => sameAnswer(g.answer, item.answer))) {
        item = null;
      }
      if (item) got.push(item);
      else {
        rest.push(c);
        if (notEligible[format] && format !== 'gap') notEligible[format].push(c.front);
      }
    }
    // Пар набралось меньше блока — пары не делаем, слова идут в выбор
    if (format === 'match') {
      const blocks = pairBlocks(got.length, pairSize);
      const usable = blocks.reduce((a, b) => a + b, 0);
      for (const it of got.splice(usable)) rest.push(chosen.find((c) => c.id === it.cardId));
      let i = 0;
      for (const size of blocks) {
        for (const it of got.slice(i, i + size)) it.blockSize = size;
        i += size;
      }
    }
    if (format !== 'match') {
      for (const it of got) ctx.avoid.add(normalize(chosen.find((c) => c.id === it.cardId).front));
    }
    if (got.length < (wanted[format] || 0)) {
      shortages.push(
        `Для ${formatNames[format]} подходит ${got.length} из ${wanted[format]} — остальные в выбор`
      );
    }
    items.push(...got);
    free = rest;
  }

  // Остальное — выбор; перевод — оба направления поровну
  const dirRng = makeRng(`${seed}:dir`);
  const dirs = shuffleWith(
    dirRng,
    free.map((_, i) => (i % 2 === 0 ? 'forward' : 'reverse'))
  );
  const leftovers = [];
  free.forEach((c, i) => {
    let item = makeItem(c, 'choice', ctx, { direction: dirs[i] });
    if (!item && backKind !== 'definition') {
      item = makeItem(c, 'choice', ctx, {
        direction: dirs[i] === 'forward' ? 'reverse' : 'forward',
      });
    }
    if (!item) item = makeItem(c, 'write', ctx);
    if (!item) item = makeItem(c, 'scramble', ctx);
    if (item) items.push(item);
    else leftovers.push(c.front);
  });
  if (leftovers.length) {
    warnings.push({
      code: 'dropped',
      text: `Не получилось составить вопрос для ${leftovers.length} слов (мало вариантов): ${leftovers
        .slice(0, 5)
        .join(', ')}`,
    });
  }
  for (const s of shortages) warnings.push({ code: 'format_short', text: s });

  // ── Проверка на подсказки (B8) ──
  const moved = [];
  for (const y of items) {
    if (!['write', 'scramble', 'gap'].includes(y.format)) continue;
    const yCard = chosen.find((c) => c.id === y.cardId);
    const leaks = items.some((x) => x !== y && shownTexts(x).some((t) => mentions(t, yCard)));
    if (!leaks) continue;
    const swap = makeItem(yCard, 'choice', ctx, { direction: 'forward' });
    if (swap) {
      Object.assign(y, swap, { blockSize: undefined });
      moved.push(yCard.front);
    }
  }

  // ── Порядок для учителя: по форматам, пары — блоками; баллы ──
  const order = { choice: 0, write: 1, gap: 2, scramble: 3, match: 4 };
  items.sort((a, b) => order[a.format] - order[b.format]);
  const points = total > 0 ? Math.round((100 / items.length) * 100) / 100 : 0;
  let blockNo = 0;
  let pairLeft = 0;
  items.forEach((it, i) => {
    if (it.format === 'match') {
      if (pairLeft === 0) {
        blockNo++;
        pairLeft = it.blockSize || LIMITS.pairDefault;
      }
      pairLeft--;
    } else {
      blockNo++;
      pairLeft = 0;
    }
    it.blockNo = blockNo;
    it.sortKey = i;
    it.points = points;
    delete it.blockSize;
  });

  const counts = Object.fromEntries(FORMATS.map((f) => [f, 0]));
  for (const it of items) counts[it.format]++;
  const levelsCount = { easy: 0, mid: 0, hard: 0, unstudied: 0 };
  for (const it of items) levelsCount[it.difficulty]++;
  const time = recommendedTime(counts);

  const steps = buildSteps({
    input,
    counts,
    levelsCount,
    excludedUnstudied: picked.excludedUnstudied,
    includeUnstudied: Boolean(config.includeUnstudied),
    notEligible,
    moved,
    backKind,
    mode: config.mode || 'difficulty',
  });

  return {
    items,
    counts,
    levels: levelsCount,
    excludedUnstudied: picked.excludedUnstudied,
    recommended: time,
    pointsPerWord: points,
    screens: new Set(items.map((i) => i.blockNo)).size,
    steps,
    warnings,
  };
}

/** Доли/числа форматов от учителя → числа с суммой total (по умолчанию — defaultFormats) */
export function normalizeFormats(formats, total, opts) {
  if (!formats || typeof formats !== 'object') return defaultFormats(total, opts);
  const out = Object.fromEntries(
    FORMATS.map((f) => [f, Math.max(0, Math.floor(Number(formats[f]) || 0))])
  );
  let sum = FORMATS.reduce((a, f) => a + out[f], 0);
  if (sum === 0) return defaultFormats(total, opts);
  // Больше слов, чем нужно, — срезаем с выбора, потом с остальных; меньше — добавляем в выбор
  for (const f of ['choice', 'write', 'gap', 'scramble', 'match']) {
    while (sum > total && out[f] > 0) {
      out[f]--;
      sum--;
    }
  }
  if (sum < total) out.choice += total - sum;
  return out;
}

function plural(n, one, few, many) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** Шаги экрана «Собираем экзамен» — настоящие цифры этой сборки */
function buildSteps({
  input,
  counts,
  levelsCount,
  excludedUnstudied,
  includeUnstudied,
  notEligible,
  moved,
  backKind,
  mode,
}) {
  const cs = input.classSummary || {};
  const source = input.difficultySource || 'text';
  const classDetail =
    source === 'class'
      ? `${cs.students || 0} ${plural(cs.students || 0, 'ученик', 'ученика', 'учеников')} · ${cs.reviews || 0} ${plural(cs.reviews || 0, 'повторение', 'повторения', 'повторений')} по этим наборам`
      : source === 'exams'
        ? 'Повторений пока мало — сложность по прошлым экзаменам класса'
        : 'Повторений класса пока нет — сложность по длине слова и числу значений';

  let levelDetail = `${levelsCount.easy} лёгких · ${levelsCount.mid} средних · ${levelsCount.hard} сложных`;
  if (levelsCount.unstudied) levelDetail += ` · ${levelsCount.unstudied} неизученных`;
  if (excludedUnstudied && !includeUnstudied) {
    levelDetail += `. ${excludedUnstudied} ${plural(excludedUnstudied, 'слово', 'слова', 'слов')} класс не открывал — не берём`;
  }
  if (mode === 'random') levelDetail = `Случайные слова: ${levelDetail}`;
  if (mode === 'manual') levelDetail = `Слова выбраны вручную: ${levelDetail}`;

  const names = {
    choice: 'выбор',
    write: 'письмо',
    scramble: 'собери',
    match: 'пары',
    gap: 'вставь',
  };
  let formatDetail = FORMATS.filter((f) => counts[f])
    .map((f) => `${counts[f]} ${names[f]}`)
    .join(' · ');
  const longWords = [...new Set(notEligible.scramble)].slice(0, 2);
  if (counts.scramble && longWords.length) {
    formatDetail += `. ${longWords.map((w) => `«${w}»`).join(' и ')} — не в «Собери»`;
  }

  const optionsDetail =
    backKind === 'definition'
      ? 'Та же часть речи и похожая длина, без повторов'
      : 'Похожая длина, без повторов и синонимов через запятую';

  const checkDetail = moved.length
    ? `Перенесли в выбор: ${moved
        .slice(0, 3)
        .map((w) => `«${w}»`)
        .join(', ')} — их подсказывал другой вопрос`
    : 'Нет вопросов, где один подсказывает другой';

  return [
    { key: 'class', title: 'Смотрим, как учил класс', detail: classDetail },
    { key: 'levels', title: 'Делим слова по сложности', detail: levelDetail },
    { key: 'formats', title: 'Распределяем по форматам', detail: formatDetail },
    { key: 'options', title: 'Подбираем неверные варианты', detail: optionsDetail },
    { key: 'check', title: 'Проверяем экзамен', detail: checkDetail },
  ];
}

/**
 * Заменить слово в собранном экзамене (exam-replace-item): другое слово той же сложности,
 * которого ещё нет в экзамене, в том же формате. null — подходящих слов нет.
 */
export function replaceItem(input, items, cardId) {
  const old = items.find((i) => i.cardId === cardId);
  if (!old) return null;
  const ctx = makeContext({ ...input, seed: `${input.seed}:replace:${cardId}` });
  const used = new Set(items.map((i) => i.cardId));
  const usedFronts = new Set(
    dedupeCards(input.cards)
      .filter((c) => used.has(c.id))
      .map((c) => normalize(c.front))
  );
  const candidates = shuffleWith(ctx.rng, dedupeCards(input.cards)).filter(
    (c) => !used.has(c.id) && !usedFronts.has(normalize(c.front))
  );
  const sameLevel = candidates.filter((c) => (ctx.levels.get(c.id) || 'mid') === old.difficulty);
  const others = candidates.filter((c) => (ctx.levels.get(c.id) || 'mid') !== old.difficulty);
  for (const [list, sameLvl] of [
    [sameLevel, true],
    [others, false],
  ]) {
    for (const c of list) {
      const item = makeItem(c, old.format, ctx, { direction: old.direction });
      if (!item) continue;
      return {
        item: { ...item, blockNo: old.blockNo, sortKey: old.sortKey, points: old.points },
        sameLevel: sameLvl,
      };
    }
  }
  return null;
}
