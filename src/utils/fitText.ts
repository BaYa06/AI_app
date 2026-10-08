/**
 * Подбор размера шрифта, чтобы текст карточки не выходил за рамку фиксированного размера.
 *
 * adjustsFontSizeToFit здесь не подходит: он уменьшает шрифт, но не высоту строки (lineHeight
 * задан явно), и многострочный текст всё равно вылезает. Поэтому оцениваем число строк сами
 * и берём самый крупный размер из списка, при котором текст помещается. Не поместился и на
 * самом мелком — обрезаем многоточием (numberOfLines), но за рамку не выходим.
 *
 * Оценка: жадный перенос по словам, ширина символа = кегль × CHAR_WIDTH. Коэффициенты
 * подобраны по раскладке SF Pro (CoreText) на ru/de/en текстах: на ~10 000 проверках оценка
 * ни разу не дала меньше строк, чем на самом деле (иногда на строку больше — берём шрифт
 * чуть мельче, это безопасно).
 */

export type FitWeight = 'bold' | 'regular';

const CHAR_WIDTH: Record<FitWeight, number> = { bold: 0.62, regular: 0.57 };

export interface FitResult {
  fontSize: number;
  lineHeight: number;
  /** Задан, только если текст не поместился даже на самом мелком размере */
  numberOfLines?: number;
}

/** Оценка числа строк при переносе по словам (слово длиннее строки переносится по буквам) */
export function estimateLines(text: string, fontSize: number, width: number, weight: FitWeight): number {
  const perLine = Math.max(1, Math.floor(width / (fontSize * CHAR_WIDTH[weight])));
  let lines = 0;
  for (const paragraph of text.split('\n')) {
    lines += 1;
    let current = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let length = word.length;
      if (current > 0 && current + 1 + length <= perLine) {
        current += 1 + length;
        continue;
      }
      if (current > 0) {
        lines += 1;
        current = 0;
      }
      while (length > perLine) {
        lines += 1;
        length -= perLine;
      }
      current = length;
    }
  }
  return Math.max(1, lines);
}

interface FitOptions {
  width: number;
  height: number;
  /** Размеры от крупного к мелкому; последний — минимально читаемый */
  sizes: number[];
  lineHeightRatio: number;
  weight: FitWeight;
}

function sizeAt(fontSize: number, lineHeightRatio: number) {
  return { fontSize, lineHeight: Math.round(fontSize * lineHeightRatio) };
}

function textHeight(text: string, fontSize: number, lineHeight: number, width: number, weight: FitWeight) {
  return estimateLines(text, fontSize, width, weight) * lineHeight;
}

/** Самый крупный размер из sizes, при котором text помещается в width × height */
export function fitText(text: string, { width, height, sizes, lineHeightRatio, weight }: FitOptions): FitResult {
  for (const size of sizes) {
    const s = sizeAt(size, lineHeightRatio);
    if (textHeight(text, s.fontSize, s.lineHeight, width, weight) <= height) return s;
  }
  const min = sizeAt(sizes[sizes.length - 1], lineHeightRatio);
  return { ...min, numberOfLines: Math.max(1, Math.floor(height / min.lineHeight)) };
}

interface FitPairOptions {
  width: number;
  height: number;
  /** Расстояние между словом и примером (отступы + разделитель) */
  gap: number;
  word: { sizes: number[]; lineHeightRatio: number };
  example: { sizes: number[]; lineHeightRatio: number };
}

/**
 * Оборот карточки: слово (жирное) и пример (обычный) делят одну рамку.
 * Слово уменьшаем в последнюю очередь — оно главное: перебираем размеры слова от крупного,
 * для каждого — размеры примера от крупного.
 */
export function fitWordWithExample(
  word: string,
  example: string,
  { width, height, gap, word: wordOpts, example: exampleOpts }: FitPairOptions,
): { word: FitResult; example: FitResult } {
  if (!example) {
    return { word: fitText(word, { width, height, weight: 'bold', ...wordOpts }), example: sizeAt(exampleOpts.sizes[0], exampleOpts.lineHeightRatio) };
  }
  for (const wordSize of wordOpts.sizes) {
    const w = sizeAt(wordSize, wordOpts.lineHeightRatio);
    const wordHeight = textHeight(word, w.fontSize, w.lineHeight, width, 'bold');
    for (const exampleSize of exampleOpts.sizes) {
      const e = sizeAt(exampleSize, exampleOpts.lineHeightRatio);
      if (wordHeight + gap + textHeight(example, e.fontSize, e.lineHeight, width, 'regular') <= height) {
        return { word: w, example: e };
      }
    }
  }
  // Не помещается и на минимальных размерах: слову — сколько нужно (но не больше половины), пример обрезаем
  const w = fitText(word, { width, height: height / 2, weight: 'bold', ...wordOpts });
  const wordHeight = Math.min(textHeight(word, w.fontSize, w.lineHeight, width, 'bold'), w.numberOfLines ? w.numberOfLines * w.lineHeight : Infinity);
  const e = sizeAt(exampleOpts.sizes[exampleOpts.sizes.length - 1], exampleOpts.lineHeightRatio);
  return {
    word: w,
    example: { ...e, numberOfLines: Math.max(1, Math.floor((height - gap - wordHeight) / e.lineHeight)) },
  };
}
