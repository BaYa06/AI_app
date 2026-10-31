import { describe, expect, it } from '@jest/globals';
import { isNavigationUrl, isWidgetUrl, parseWidgetUrl } from '../widgetLinks';

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

  it('ссылки из пушей: урок и рейтинг курса', () => {
    expect(isNavigationUrl('flashly://lesson?from=push')).toBe(true);
    expect(isNavigationUrl('flashly://rating/3f2a-11?from=push&week=previous')).toBe(true);
    expect(isNavigationUrl('flashly://rating/')).toBe(false);
    expect(isNavigationUrl('flashly://support/3f2a-11?from=push')).toBe(true);
    expect(isNavigationUrl('flashly://support/')).toBe(false);
    expect(isNavigationUrl('flashly://auth-callback?code=abc')).toBe(false);
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
