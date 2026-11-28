import { describe, expect, it } from '@jest/globals';
import { WebApiError, classifyStatus, describeApiError, unwrap } from '../api';

describe('классификация ошибок API', () => {
  it('статусы → виды', () => {
    expect(classifyStatus(0)).toBe('network');
    expect(classifyStatus(401)).toBe('unauthorized');
    expect(classifyStatus(403)).toBe('forbidden');
    expect(classifyStatus(404)).toBe('not_found');
    expect(classifyStatus(426)).toBe('update_required');
    expect(classifyStatus(429)).toBe('rate_limited');
    expect(classifyStatus(503)).toBe('server');
    expect(classifyStatus(400)).toBe('unknown');
  });
  it('unwrap отдаёт данные или бросает WebApiError', () => {
    expect(unwrap({ ok: true, status: 200, data: 5 })).toBe(5);
    expect(() => unwrap({ ok: false, status: 403, data: null })).toThrow(WebApiError);
  });
  it('тексты на «ты», без технических слов', () => {
    expect(describeApiError(new WebApiError('forbidden', 403))).toBe('Это не твой курс.');
    expect(describeApiError(new Error('boom'))).not.toMatch(/boom/);
  });
});
