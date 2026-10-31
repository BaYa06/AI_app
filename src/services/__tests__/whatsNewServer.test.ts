import { describe, expect, it } from '@jest/globals';
// Проверка новостей из админки живёт на сервере (api/_whatsNew.js), тестируем здесь
// (в api/ нельзя класть тесты: Vercel сделал бы из них функции).
import { rowToItem, validateNews } from '../../../api/_whatsNew.js';

const valid = {
  id: 'cards-swipe',
  minVersion: '1.7.0',
  roles: ['student'],
  platforms: ['ios', 'android'],
  priority: 10,
  tag: 'Карточки',
  title: 'Свайпай карточку',
  text: 'Влево — «Не знаю», вправо — «Уверенно».',
  art: 'swipe',
  action: { label: 'Попробовать', route: 'Study' },
  publishedAt: '2026-11-01',
  expiresAt: '2027-01-31',
  published: true,
};

describe('validateNews', () => {
  it('правильная новость проходит', () => {
    const { item, error } = validateNews(valid);
    expect(error).toBeUndefined();
    expect(item).toMatchObject({ id: 'cards-swipe', actionRoute: 'Study', published: true, minOs: null });
  });

  it('длины по правилам: заголовок ≤ 40, текст ≤ 140', () => {
    expect(validateNews({ ...valid, title: 'а'.repeat(41) }).error).toMatch(/41 символ/);
    expect(validateNews({ ...valid, text: 'а'.repeat(141) }).error).toMatch(/141 символ/);
    expect(validateNews({ ...valid, title: '  ' }).error).toBeTruthy();
  });

  it('id, версия, роли, платформы', () => {
    expect(validateNews({ ...valid, id: 'Cards Swipe' }).error).toBeTruthy();
    expect(validateNews({ ...valid, minVersion: 'новая' }).error).toBeTruthy();
    expect(validateNews({ ...valid, roles: ['admin'] }).error).toBeTruthy();
    expect(validateNews({ ...valid, platforms: [] }).error).toBeTruthy();
  });

  it('«Попробовать» — только на вкладку и с подписью', () => {
    expect(validateNews({ ...valid, action: { label: 'Открыть', route: 'SetEditor' } }).error).toBeTruthy();
    expect(validateNews({ ...valid, action: { label: '', route: 'Library' } }).error).toBeTruthy();
    expect(validateNews({ ...valid, action: null }).item?.actionRoute).toBeNull();
  });

  it('дата окончания не раньше публикации', () => {
    expect(validateNews({ ...valid, expiresAt: '2026-10-01' }).error).toBeTruthy();
  });
});

describe('rowToItem', () => {
  it('строка таблицы → новость приложения', () => {
    expect(
      rowToItem({
        id: 'x', min_version: '1.7.0', roles: ['student'], platforms: ['ios'], min_os: '26', priority: 5,
        tag: 'T', title: 'Заголовок', text: '', art: null, action_label: 'Открыть', action_route: 'Library',
        published_at: new Date('2026-11-01T00:00:00Z'), expires_at: null,
      }),
    ).toEqual({
      id: 'x', minVersion: '1.7.0', roles: ['student'], platforms: ['ios'], minOs: '26', priority: 5,
      tag: 'T', title: 'Заголовок', text: '', art: null, action: { label: 'Открыть', route: 'Library' },
      publishedAt: '2026-11-01', expiresAt: null,
    });
  });
});
