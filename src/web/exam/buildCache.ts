import type { BuildStep, BuildWarning } from '@/services/exam';

/**
 * Шаги сборки приходят один раз — в ответе exam-build. Хранимся в памяти вкладки, чтобы показать
 * экран «Собираем экзамен»; после перезагрузки страницы шагов нет, и мы сразу открываем превью.
 */
export type BuildInfo = { steps: BuildStep[]; warnings: BuildWarning[]; courseId: string };

const cache = new Map<string, BuildInfo>();

export function rememberBuild(sessionId: string, info: BuildInfo): void {
  cache.set(sessionId, info);
}

export function takeBuild(sessionId: string): BuildInfo | null {
  return cache.get(sessionId) ?? null;
}
