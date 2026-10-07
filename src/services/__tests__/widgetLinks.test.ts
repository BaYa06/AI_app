import { describe, expect, it } from '@jest/globals';
import { isWidgetUrl, parseWidgetUrl } from '../widgetLinks';

describe('widgetLinks', () => {
  it('пропускает в навигацию только ссылки урока и набора', () => {
    expect(isWidgetUrl('flashly://lesson?from=widget&state=waiting')).toBe(true);
    expect(isWidgetUrl('flashly://set/3f2a-11?from=widget')).toBe(true);
    expect(isWidgetUrl('flashly://lesson')).toBe(true);
    expect(isWidgetUrl('flashly://auth-callback?code=abc')).toBe(false);
    expect(isWidgetUrl('flashly://')).toBe(false);
    expect(isWidgetUrl('https://ai-app-seven-zeta.vercel.app/join/' + 'a'.repeat(64))).toBe(false);
    expect(isWidgetUrl('flashly://set/')).toBe(false);
  });

  it('разбирает цель, состояние и размер виджета', () => {
    expect(parseWidgetUrl('flashly://lesson?from=widget&state=waiting&family=accessoryRectangular')).toEqual({
      target: 'lesson',
      state: 'waiting',
      family: 'accessoryRectangular',
    });
    expect(parseWidgetUrl('flashly://set/abc?from=widget&state=review')).toEqual({
      target: 'set',
      state: 'review',
      family: 'unknown',
    });
  });

  it('без from=widget — не ссылка виджета', () => {
    expect(parseWidgetUrl('flashly://lesson')).toBeNull();
    expect(parseWidgetUrl('flashly://auth-callback?code=abc&from=widget')).toBeNull();
  });
});
