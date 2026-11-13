/**
 * homeworkStore.reportSession (plan/new/teacher_cabinet.md, Teacher 30): без флага заданий
 * итог сессии в очередь не ставится — старый сервер не знает session-complete.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

let mockFlag = true;
jest.mock('@/config/features', () => ({
  get TEACHER_HOMEWORK_ENABLED() {
    return mockFlag;
  },
}));
const mockEnqueue = jest.fn();
jest.mock('@/services/SyncQueueService', () => ({
  SyncQueueService: {
    enqueue: (...a: unknown[]) => mockEnqueue(...a),
    registerExecutor: () => {},
  },
}));
jest.mock('@/services/NeonService', () => ({ NeonService: {} }));
jest.mock('@/services/localCache', () => ({ readCache: () => undefined, writeCache: () => {} }));
jest.mock('../diamondStore', () => ({ useDiamondStore: { getState: () => ({}) } }));
jest.mock('@/utils/logger', () => ({ log: { warn: () => {} } }));

import { useHomeworkStore } from '../homeworkStore';

describe('homeworkStore.reportSession', () => {
  beforeEach(() => {
    mockFlag = true;
    mockEnqueue.mockClear();
    useHomeworkStore.setState({ items: [], loaded: false });
  });

  it('флаг выключен — в очередь ничего не уходит', () => {
    mockFlag = false;
    useHomeworkStore.getState().reportSession(['c1'], []);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('флаг включён, список не загружен — итог уходит в очередь', () => {
    useHomeworkStore.getState().reportSession(['c1', 'c2'], ['c2']);
    expect(mockEnqueue).toHaveBeenCalledWith(
      'homeworkSession',
      {
        cards: [
          { cardId: 'c1', firstTry: true },
          { cardId: 'c2', firstTry: false },
        ],
      },
      20
    );
  });

  it('список загружен и слов задания в сессии нет — не шлём', () => {
    useHomeworkStore.setState({ items: [], loaded: true });
    useHomeworkStore.getState().reportSession(['c1'], []);
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});
