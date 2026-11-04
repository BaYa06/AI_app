/**
 * Логгер в режиме релиза (в jest __DEV__ не задан): plan/new/code_cleanup.md, Clean 3.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockReportError = jest.fn<(error: Error, context?: string) => void>();
const mockCrashLog = jest.fn<(message: string) => void>();
jest.mock('@/services/crashReporting', () => ({
  reportError: (error: Error, context?: string) => mockReportError(error, context),
  crashLog: (message: string) => mockCrashLog(message),
}));

import { log, __resetLoggerForTests } from '@/utils/logger';

describe('logger (release)', () => {
  let consoleError: ReturnType<typeof jest.spyOn>;
  let consoleLog: ReturnType<typeof jest.spyOn>;
  let consoleWarn: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    mockReportError.mockClear();
    mockCrashLog.mockClear();
    __resetLoggerForTests();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('debug и info молчат', () => {
    log.debug('Push', 'token', 'secret-token');
    log.info('Sync', 'back online');
    expect(consoleLog).not.toHaveBeenCalled();
    expect(mockCrashLog).not.toHaveBeenCalled();
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it('warn — строка в журнал Crashlytics, не отчёт и не консоль', () => {
    log.warn('Widget', 'write failed', new Error('disk full'));
    expect(mockCrashLog).toHaveBeenCalledWith('[Widget] write failed: disk full');
    expect(mockReportError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  it('error — консоль и отчёт с исходной ошибкой (её стек)', () => {
    const cause = new Error('boom');
    log.error('Data', 'load failed', cause);
    expect(consoleError).toHaveBeenCalledWith('[Data] load failed', cause);
    expect(mockReportError).toHaveBeenCalledWith(cause, 'Data');
  });

  it('error без Error — новая ошибка с текстом, объекты в отчёт не попадают', () => {
    log.error('Neon', 'Data API sets failed', 500, 'Internal', { userId: 'u-1', token: 't' });
    expect(mockReportError).toHaveBeenCalledTimes(1);
    const [err] = mockReportError.mock.calls[0] as [Error, string];
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('[Neon] Data API sets failed: Internal');
    expect(err.message).not.toContain('u-1');
  });

  it('одна и та же ошибка отправляется раз за запуск', () => {
    for (let i = 0; i < 5; i++) log.error('Neon', 'Data API sets failed', 'Internal');
    log.error('Neon', 'Data API cards failed', 'Internal');
    expect(mockReportError).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalledTimes(6);
  });
});
