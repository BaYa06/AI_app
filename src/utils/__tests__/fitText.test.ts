import { estimateLines, fitText, fitWordWithExample } from '../fitText';
import { config } from '../../constants/config';

const { maxCardFrontLength, maxCardBackLength, maxCardExampleLength } = config.limits;

const WORD_FIT = { sizes: [24, 22, 20, 18], lineHeightRatio: 1.5 };
const EXAMPLE_FIT = { sizes: [18, 16, 15], lineHeightRatio: 1.45 };
const GAP = 34;

// Рамки текста карточки StudyScreen (как DEFAULT_TEXT_BOX): экран 320 pt и 375 pt
const BOX_320 = { width: 238, front: 230, back: 250 };
const BOX_375 = { width: 290, front: 290, back: 310 };

// Худший реалистичный текст: длинные русские слова (самые широкие из ru/de/en)
const RU = 'достопримечательность ответственность благодарность удовлетворение предприятие обязательство возможность';
const DE = 'die Sehenswürdigkeit sich auseinandersetzen mit die Zusammenarbeit beeindruckend unverzüglich die Verantwortung';
const take = (text: string, length: number) => text.repeat(5).slice(0, length).trim();

describe('estimateLines', () => {
  it('одно короткое слово — одна строка', () => {
    expect(estimateLines('Haus', 24, 290, 'bold')).toBe(1);
  });

  it('слово длиннее строки переносится по буквам', () => {
    // 238 / (24 × 0.62) = 15 символов в строке → 26 букв = 2 строки
    expect(estimateLines('Geschwindigkeitsbegrenzung', 24, 238, 'bold')).toBe(2);
  });

  it('учитывает переводы строк', () => {
    expect(estimateLines('eins\nzwei', 16, 290, 'regular')).toBe(2);
  });
});

describe('fitText', () => {
  it('короткое слово — самый крупный размер', () => {
    expect(fitText('scharf', { width: 290, height: 290, weight: 'bold', ...WORD_FIT })).toEqual({ fontSize: 24, lineHeight: 36 });
  });

  it('не помещается и на минимальном — обрезка по высоте рамки', () => {
    const result = fitText(take(RU, 600), { width: 238, height: 100, weight: 'bold', ...WORD_FIT });
    expect(result.fontSize).toBe(18);
    expect(result.numberOfLines).toBe(Math.floor(100 / 27));
  });
});

describe('лимиты карточки помещаются без обрезки', () => {
  it.each([
    ['320 pt', BOX_320],
    ['375 pt', BOX_375],
  ])('лицо: слово максимальной длины, %s', (_name, box) => {
    for (const text of [take(RU, maxCardFrontLength), take(DE, maxCardFrontLength)]) {
      const result = fitText(text, { width: box.width, height: box.front, weight: 'bold', ...WORD_FIT });
      expect(result.numberOfLines).toBeUndefined();
      expect(result.fontSize).toBeGreaterThanOrEqual(18);
    }
  });

  it.each([
    ['320 pt', BOX_320],
    ['375 pt', BOX_375],
  ])('оборот: перевод и пример максимальной длины, %s', (_name, box) => {
    const result = fitWordWithExample(take(RU, maxCardBackLength), take(DE, maxCardExampleLength), {
      width: box.width,
      height: box.back,
      gap: GAP,
      word: WORD_FIT,
      example: EXAMPLE_FIT,
    });
    expect(result.word.numberOfLines).toBeUndefined();
    expect(result.example.numberOfLines).toBeUndefined();
    expect(result.word.fontSize).toBeGreaterThanOrEqual(18);
    expect(result.example.fontSize).toBeGreaterThanOrEqual(15);
  });

  it('обычная карточка на 375 pt — без уменьшения', () => {
    const result = fitWordWithExample('острый, пряный', 'Der Pfeffer ist sehr scharf.', {
      width: BOX_375.width,
      height: BOX_375.back,
      gap: GAP,
      word: WORD_FIT,
      example: EXAMPLE_FIT,
    });
    expect(result.word.fontSize).toBe(24);
    expect(result.example.fontSize).toBe(18);
  });
});
