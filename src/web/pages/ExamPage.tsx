/**
 * Экзамен по адресу /exams/:id (plan/new/web_cabinet.md, Web 14–17; макеты E3, E4).
 * Черновик → превью «Что увидят ученики» с заменой слов и правкой вопросов. «Вставь слово» пишет ИИ
 * сам сразу после сборки (решение пользователя 28.11.2026) — переключателя больше нет.
 * Открытый → лобби, идущий → монитор, завершённый → итоги.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pencil, RefreshCw, Sparkles } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import type { DraftItem, ExamDraft } from '@/services/exam';
import { FORMAT_LABELS } from '@/screens/exam/examConfig';
import { describeTestError } from '@/utils/testApiErrors';
import { describeApiError, WebApiError } from '../api';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { takeBuild } from '../exam/buildCache';
import { ItemEditDialog } from '../exam/ItemEditDialog';
import { useGapAi, type GapAiState } from '../exam/useGapAi';
import { ErrorPage, LoadingPage } from '../ui/states';
import { useSingleFlight } from '../ui/useSingleFlight';
import { useUnloadGuard } from '../ui/useUnloadGuard';
import { LobbyView } from '../exam/LobbyView';
import { MonitorView } from '../exam/MonitorView';
import { ResultsView } from '../exam/ResultsView';
import { PageHeader, SectionLabel } from '../ui/kit';
import {
  LEVEL_NAME,
  canEdit,
  groupItems,
  itemSub,
  itemTitle,
  levelCounts,
  screensCount,
} from '../exam/itemView';
import { aiPendingItems, aiState, editMark, gapAiSummary } from '../exam/smartLogic';

export function ExamPage({ sessionId }: { sessionId: string }) {
  const loaded = useLoad(() => ExamData.draft(sessionId), [sessionId]);
  const [local, setLocal] = useState<ExamDraft | null>(null);
  const draft = local ?? loaded.data;

  if (loaded.error && !draft) return <ErrorPage error={loaded.error} onRetry={loaded.reload} />;
  if (!draft) return <LoadingPage />;
  if (draft.status !== 'draft') return <LiveExam sessionId={sessionId} draft={draft} />;
  return <Preview sessionId={sessionId} draft={draft} setDraft={setLocal} />;
}

function Preview({
  sessionId,
  draft,
  setDraft,
}: {
  sessionId: string;
  draft: ExamDraft;
  setDraft: (d: ExamDraft) => void;
}) {
  const colors = useThemeColors();
  const [replacing, setReplacing] = useState<string | null>(null);
  const [editing, setEditing] = useState<DraftItem | null>(null);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const items = draft.items;
  const pending = useMemo(() => aiPendingItems(items).length, [items]);
  // ИИ дописывает «вставь слово» сам: после сборки, после перезагрузки, после замены такого слова
  const gapAi = useGapAi(sessionId, pending, async () => {
    try {
      setDraft(await ExamData.draft(sessionId));
    } catch {
      // не обновилось — останется прежний вид, следующая загрузка страницы покажет новое
    }
  });

  const once = useSingleFlight();
  // ИИ, открытие и замену нельзя прерывать закрытием вкладки
  useUnloadGuard(gapAi.state.status === 'running' || opening || replacing !== null);
  const warnings = takeBuild(sessionId)?.warnings ?? [];
  const groups = useMemo(() => groupItems(items), [items]);
  const levels = useMemo(() => levelCounts(items), [items]);
  const minutes = Math.round((draft.durationSec || 0) / 60);

  const levelColor = {
    easy: colors.success,
    mid: colors.warning,
    hard: colors.error,
    unstudied: colors.textTertiary,
  } as const;

  // ─── замена слова ───
  const replace = async (it: DraftItem) => {
    setReplacing(it.itemId);
    try {
      const next = await ExamData.replace(sessionId, it.itemId);
      setDraft(next);
      const fresh = next.items.find((x) => x.itemId === it.itemId);
      toast.info(
        next.sameLevel === false
          ? `Заменили на «${fresh ? itemTitle(fresh) : ''}» — слов той же сложности не осталось`
          : `Заменили на «${fresh ? itemTitle(fresh) : ''}»`
      );
    } catch (e) {
      toast.error(
        e instanceof WebApiError && e.serverError
          ? describeTestError(e.serverError, 'Не удалось заменить слово.')
          : describeApiError(e)
      );
    }
    setReplacing(null);
  };

  // ─── открыть экзамен ───
  const open = () => once(openOnce);
  const openOnce = async () => {
    if (pending > 0) return;
    setOpening(true);
    setOpenError(null);
    try {
      const res = await ExamData.create(sessionId);
      setDraft({ ...draft, status: 'waiting', code: res.code });
    } catch (e) {
      setOpenError(
        e instanceof WebApiError && e.serverError === 'ai_pending'
          ? 'ИИ ещё пишет предложения для «вставь слово». Подожди или замени их письменным ответом.'
          : e instanceof WebApiError && e.serverError
            ? describeTestError(e.serverError, 'Не удалось открыть экзамен.')
            : describeApiError(e)
      );
      setOpening(false);
    }
  };

  return (
    <View>
      <PageHeader
        title="Что увидят ученики"
        subtitle="Слова у всех одинаковые, порядок вопросов у каждого ученика свой."
        back={{ label: 'Экзамены', path: '/exams' }}
      />
      <View style={styles.layout}>
        <View style={styles.main}>
          <View style={styles.chips}>
            {[
              `${items.length} слов`,
              `${screensCount(items)} экранов`,
              `${minutes} мин`,
              '100 баллов',
            ].map((t) => (
              <View key={t} style={[styles.meta, { backgroundColor: colors.surfaceMuted }]}>
                <Text variant="label">{t}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            {(['easy', 'mid', 'hard', 'unstudied'] as const).map((l) =>
              levels[l] ? (
                <View key={l} style={styles.legendItem}>
                  <View style={[styles.dot, { backgroundColor: levelColor[l] }]} />
                  <Text variant="caption" color="secondary">
                    {levels[l]} {LEVEL_NAME[l]}
                  </Text>
                </View>
              ) : null
            )}
          </View>

          {groups.map((g) => {
            const pts = g.items.reduce((a, i) => a + i.points, 0);
            const blocks = new Set(g.items.map((i) => i.blockNo)).size;
            return (
              <View key={g.format} style={{ gap: spacing.s }}>
                <View style={styles.groupHead}>
                  <SectionLabel>{FORMAT_LABELS[g.format]}</SectionLabel>
                  <Text variant="caption" color="secondary">
                    {g.format === 'match' ? `${blocks} экр. · ` : ''}
                    {g.items.length} слов · {Math.round(pts)} баллов
                  </Text>
                </View>
                <Card padding="none">
                  {g.items.map((it, i) => {
                    const mark = editMark(it);
                    const ai = aiState(it);
                    return (
                      <View
                        key={it.itemId}
                        style={[
                          styles.row,
                          i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : null,
                        ]}
                      >
                        <View
                          style={[styles.dot, { backgroundColor: levelColor[it.difficulty] }]}
                        />
                        <View style={{ flex: 1, paddingVertical: spacing.xs, gap: spacing.xxs }}>
                          <View style={styles.titleLine}>
                            <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                              {itemTitle(it)}
                            </Text>
                            {ai === 'done' && !mark?.edited ? (
                              <Badge label="ИИ" tone="primary" />
                            ) : null}
                            {ai === 'fallback' ? (
                              <Badge label="ИИ не справился — письменный ответ" tone="neutral" />
                            ) : null}
                            {mark?.edited ? <Badge label="Изменён" tone="primary" /> : null}
                          </View>
                          {ai === 'pending' ? (
                            <Text variant="caption" color="secondary">
                              ИИ пишет предложение…
                            </Text>
                          ) : (
                            <Text variant="caption" color="secondary" numberOfLines={2}>
                              {itemSub(it)}
                            </Text>
                          )}
                          {it.options && it.options.length > 1 ? (
                            <Text variant="caption" color="tertiary" numberOfLines={1}>
                              {it.format === 'gap' ? `Ответ: ${it.answer} · ` : ''}Неверные:{' '}
                              {it.options.slice(1).join(' · ')}
                            </Text>
                          ) : null}
                        </View>
                        {canEdit(it) && ai !== 'pending' ? (
                          <Button
                            variant="icon"
                            background="none"
                            icon={Pencil}
                            accessibilityLabel={`Изменить вопрос ${itemTitle(it)}`}
                            onPress={() => setEditing(it)}
                          />
                        ) : null}
                        {it.format !== 'match' ? (
                          <Button
                            variant="icon"
                            background="none"
                            icon={RefreshCw}
                            accessibilityLabel={`Заменить слово ${itemTitle(it)}`}
                            onPress={() => replace(it)}
                            loading={replacing === it.itemId}
                            disabled={Boolean(replacing) || gapAi.state.status === 'running'}
                          />
                        ) : null}
                      </View>
                    );
                  })}
                </Card>
              </View>
            );
          })}
        </View>

        <View style={styles.side}>
          <GapAiCard
            state={gapAi.state}
            pending={pending}
            onRetry={gapAi.retry}
            onWithoutAi={gapAi.withoutAi}
          />
          <Card>
            <View style={{ gap: spacing.s }}>
              <SectionLabel>Открыть экзамен</SectionLabel>
              <Text variant="bodySmall" color="secondary">
                Ученики входят в приложении Flashly: вкладка «Тест», код из 4 цифр. После открытия
                вопросы менять нельзя.
              </Text>
              {warnings.map((w) => (
                <Text key={w.code + w.text} variant="caption" style={{ color: colors.warningText }}>
                  {w.text}
                </Text>
              ))}
              {openError ? (
                <Text variant="bodySmall" color="error" accessibilityRole="alert">
                  {openError}
                </Text>
              ) : null}
              <Button
                title="Открыть экзамен"
                fullWidth
                loading={opening}
                disabled={pending > 0}
                onPress={open}
              />
              {pending > 0 ? (
                <Text variant="caption" color="secondary">
                  Откроется, когда ИИ допишет «вставь слово».
                </Text>
              ) : null}
            </View>
          </Card>
        </View>
      </View>

      <ItemEditDialog
        sessionId={sessionId}
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={(next) => {
          setDraft(next);
          setEditing(null);
          toast.success('Вопрос сохранён');
        }}
      />
    </View>
  );
}

/** Состояние ИИ для «вставь слово»: пишет / готово / ошибка с «Повторить» и «Без ИИ» */
function GapAiCard({
  state,
  pending,
  onRetry,
  onWithoutAi,
}: {
  state: GapAiState;
  pending: number;
  onRetry: () => void;
  onWithoutAi: () => void;
}) {
  const colors = useThemeColors();
  if (state.status === 'idle' && pending === 0) return null;
  return (
    <Card>
      <View style={{ gap: spacing.s }} accessibilityLiveRegion="polite">
        <View style={styles.titleLine}>
          <Sparkles size={20} color={colors.primary} />
          <Text variant="label">«Вставь слово» пишет ИИ</Text>
        </View>
        {state.status === 'running' || (state.status === 'idle' && pending > 0) ? (
          <>
            <Text variant="bodySmall" color="secondary">
              Пишем предложения, ставим слово в нужную форму и подбираем неверные варианты, которые
              по смыслу не подходят. Обычно 15–40 секунд.
            </Text>
            <Skeleton width="100%" height={8} />
          </>
        ) : state.status === 'error' ? (
          <>
            <Text variant="bodySmall" color="error" accessibilityRole="alert">
              {state.message}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <Button size="s" variant="secondary" title="Повторить" onPress={onRetry} />
              <Button
                size="s"
                variant="quiet"
                tone="secondary"
                title="Без ИИ: письменный ответ"
                onPress={onWithoutAi}
              />
            </View>
          </>
        ) : state.status === 'done' ? (
          <>
            <Text variant="bodySmall" color="secondary">
              {gapAiSummary(state.written, state.fallback)}
            </Text>
            {pending > 0 ? (
              <Button size="s" variant="secondary" title="Дописать остальные" onPress={onRetry} />
            ) : null}
          </>
        ) : null}
      </View>
    </Card>
  );
}

/** Открытый экзамен: лобби → монитор → итоги. Статус берём из опроса, а не из локальных догадок */
function LiveExam({ sessionId, draft }: { sessionId: string; draft: ExamDraft }) {
  const [status, setStatus] = useState<string>(draft.status);
  // Имена на проекторе: по умолчанию нет (признак «младше 18» у курса пока не хранится)
  const [showNames, setShowNames] = useState(false);
  if (status === 'waiting')
    return (
      <LobbyView
        sessionId={sessionId}
        code={draft.code ?? ''}
        kind="exam"
        showNames={showNames}
        onShowNames={setShowNames}
        onStatus={setStatus}
      />
    );
  if (status === 'active')
    return (
      <MonitorView
        sessionId={sessionId}
        code={draft.code ?? ''}
        wordsCount={draft.items.length}
        kind="exam"
        showNames={showNames}
        onShowNames={setShowNames}
        onStatus={setStatus}
      />
    );
  return <ResultsView sessionId={sessionId} />;
}

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.l, alignItems: 'flex-start' },
  main: { flex: 1, gap: spacing.l, minWidth: 0 },
  side: { width: 340, gap: spacing.m, position: 'sticky' as unknown as 'relative', top: spacing.l },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  meta: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xxs + 2,
    borderRadius: borderRadius.s,
  },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.m },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingLeft: spacing.m,
    minHeight: 56,
  },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
});
