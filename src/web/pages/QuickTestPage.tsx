/**
 * Быстрый тест по адресу /tests/:id (plan/new/web_cabinet.md, Web 26): лобби → монитор → итоги.
 * Те же компоненты, что у экзамена, но без паузы, «+минут» и журнала; время — на вопрос.
 */
import React, { useState } from 'react';
import { cachedQuick } from '../exam/quickCache';
import { LobbyView } from '../exam/LobbyView';
import { MonitorView } from '../exam/MonitorView';
import { QuickResultsView } from '../exam/QuickResultsView';
import { LiveData, QuickData } from '../data/live';
import { useLoad } from '../useLoad';
import { ErrorPage, LoadingPage } from '../ui/states';

export function QuickTestPage({ sessionId }: { sessionId: string }) {
  const monitor = useLoad(() => LiveData.monitor(sessionId), [sessionId]);
  // Код нужен лобби и монитору: из памяти (только что создали) или из списка идущих тестов
  const info = useLoad(
    async () => cachedQuick(sessionId) ?? (await QuickData.activeOne(sessionId)),
    [sessionId]
  );
  const [status, setStatus] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(false);

  if (monitor.error && !monitor.data)
    return <ErrorPage error={monitor.error} onRetry={monitor.reload} />;
  if (!monitor.data || info.loading) return <LoadingPage />;

  const current = status ?? monitor.data.status;
  const code = info.data?.code ?? '';
  const words = info.data?.questionCount ?? monitor.data.questionCount;

  if (current === 'waiting')
    return (
      <LobbyView
        sessionId={sessionId}
        code={code}
        kind="quick"
        showNames={showNames}
        onShowNames={setShowNames}
        onStatus={setStatus}
      />
    );
  if (current === 'active')
    return (
      <MonitorView
        sessionId={sessionId}
        code={code}
        wordsCount={words}
        kind="quick"
        showNames={showNames}
        onShowNames={setShowNames}
        onStatus={setStatus}
      />
    );
  return <QuickResultsView sessionId={sessionId} />;
}
