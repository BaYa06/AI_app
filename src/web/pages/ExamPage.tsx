/**
 * Экзамен по адресу /exams/:id (plan/new/web_cabinet.md, Web 14–17; макеты E3, E4).
 * Черновик → превью «Что увидят ученики» с заменой слов, правкой вопросов и «умными вариантами».
 * Открытый, идущий и завершённый — экран статуса (лобби, монитор и итоги — этапы 4–5).
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pencil, RefreshCw } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { borderRadius, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Controls';
import { toast } from '@/components/ui/Toast';
import { hasAiConsent, setAiConsent } from '@/services/aiConsent';
import type { DraftItem, ExamDraft } from '@/services/exam';
import { FORMAT_LABELS } from '@/screens/exam/examConfig';
import { describeTestError } from '@/utils/testApiErrors';
import { describeApiError, WebApiError } from '../api';
import { ExamData } from '../data/exam';
import { useLoad } from '../useLoad';
import { takeBuild } from '../exam/buildCache';
import { ItemEditDialog } from '../exam/ItemEditDialog';
import {
  SmartConsentDialog,
  SmartSwitch,
  SuggestionCard,
  type SmartState,
} from '../exam/SmartBlock';
import { ConfirmDialog } from '../ui/dialogs';
import { ErrorPage, LoadingPage } from '../ui/states';
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
import {
  describeSkipped,
  describeSmartError,
  editMark,
  pendingDoubtful,
  type SmartSuggestion,
} from '../exam/smartLogic';

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [smart, setSmart] = useState<SmartState>({ status: 'off' });
  const [consent, setConsent] = useState(false);
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<string | null>(null);
  const [confirmApply, setConfirmApply] = useState<SmartSuggestion | null>(null);

  const warnings = takeBuild(sessionId)?.warnings ?? [];
  const items = draft.items;
  const groups = useMemo(() => groupItems(items), [items]);
  const levels = useMemo(() => levelCounts(items), [items]);
  const minutes = Math.round((draft.durationSec || 0) / 60);
  const doubtful = useMemo(() => pendingDoubtful(items), [items]);

  const levelColor = {
    easy: colors.success,
    mid: colors.warning,
    hard: colors.error,
    unstudied: colors.textTertiary,
  } as const;

  const suggestionFor = (itemId: string): SmartSuggestion | null =>
    smart.status === 'done' && !gone.has(itemId)
      ? (smart.result.suggestions.find((s) => s.itemId === itemId) ?? null)
      : null;
  const skippedFor = (itemId: string): string | null =>
    smart.status === 'done'
      ? (smart.result.skipped.find((s) => s.itemId === itemId)?.reason ?? null)
      : null;

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

  // ─── умные варианты ───
  const runSmart = async () => {
    setSmart({ status: 'loading' });
    setGone(new Set());
    try {
      const result = await ExamData.smart(sessionId, ['gap', 'choice']);
      setSmart({ status: 'done', result });
    } catch (e) {
      const err = e instanceof WebApiError ? e : null;
      setSmart({
        status: 'error',
        message: describeSmartError(err?.status ?? 0, err?.serverError),
      });
    }
  };
  const toggleSmart = (on: boolean) => {
    if (!on) {
      setSmart({ status: 'off' });
      setGone(new Set());
    } else if (!hasAiConsent()) setConsent(true);
    else void runSmart();
  };

  const doApply = async (s: SmartSuggestion) => {
    setApplying(s.itemId);
    try {
      const next = await ExamData.editItem(sessionId, s.itemId, {
        distractors: s.after.options,
        ...(s.kind === 'gap' ? { sentence: s.after.prompt } : {}),
        source: 'ai',
        doubtful: s.doubtful,
      });
      setDraft(next);
      setGone((cur) => new Set(cur).add(s.itemId));
      toast.success('Предложение применено');
    } catch {
      toast.error(
        'Не получилось применить. Предложение могло устареть — запусти умные варианты заново.'
      );
    }
    setApplying(null);
    setConfirmApply(null);
  };

  // ─── открыть экзамен ───
  const open = async (force = false) => {
    if (opening) return;
    if (doubtful.length > 0 && !force) {
      setConfirmOpen(true);
      return;
    }
    setConfirmOpen(false);
    setOpening(true);
    setOpenError(null);
    try {
      const res = await ExamData.create(sessionId);
      setDraft({ ...draft, status: 'waiting', code: res.code });
    } catch (e) {
      setOpenError(
        e instanceof WebApiError && e.serverError
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
                    const sug = suggestionFor(it.itemId);
                    const skipped = skippedFor(it.itemId);
                    return (
                      <View
                        key={it.itemId}
                        style={
                          i > 0 ? { borderTopWidth: 1, borderTopColor: colors.border } : undefined
                        }
                      >
                        <View style={styles.row}>
                          <View
                            style={[styles.dot, { backgroundColor: levelColor[it.difficulty] }]}
                          />
                          <View style={{ flex: 1, paddingVertical: spacing.xs, gap: spacing.xxs }}>
                            <View style={styles.titleLine}>
                              <Text variant="body" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {itemTitle(it)}
                              </Text>
                              {mark?.edited ? (
                                <Badge
                                  label={mark.source === 'ai' ? 'ИИ' : 'Изменён'}
                                  tone="primary"
                                />
                              ) : null}
                              {mark?.source === 'ai' && mark.doubtful ? (
                                <Badge label="Проверь" tone="warning" />
                              ) : null}
                            </View>
                            <Text variant="caption" color="secondary" numberOfLines={2}>
                              {itemSub(it)}
                            </Text>
                            {it.options && it.options.length > 1 ? (
                              <Text variant="caption" color="tertiary" numberOfLines={1}>
                                Неверные: {it.options.slice(1).join(' · ')}
                              </Text>
                            ) : null}
                            {skipped ? (
                              <Text variant="caption" color="tertiary">
                                ИИ: {describeSkipped(skipped)}
                              </Text>
                            ) : null}
                          </View>
                          {canEdit(it) ? (
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
                              disabled={Boolean(replacing)}
                            />
                          ) : null}
                        </View>
                        {sug ? (
                          <SuggestionCard
                            s={sug}
                            busy={applying === it.itemId}
                            onApply={() => (sug.doubtful ? setConfirmApply(sug) : doApply(sug))}
                            onDismiss={() => setGone((cur) => new Set(cur).add(it.itemId))}
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
          <SmartSwitch state={smart} onToggle={toggleSmart} />
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
              {doubtful.length > 0 ? (
                <Text variant="caption" style={{ color: colors.warningText }}>
                  Сомнительных вопросов от ИИ: {doubtful.length}. Проверь их перед открытием.
                </Text>
              ) : null}
              {openError ? (
                <Text variant="bodySmall" color="error" accessibilityRole="alert">
                  {openError}
                </Text>
              ) : null}
              <Button
                title="Открыть экзамен"
                fullWidth
                loading={opening}
                disabled={smart.status === 'loading'}
                onPress={() => open()}
              />
              {smart.status === 'loading' ? (
                <Text variant="caption" color="secondary">
                  Дождись умных вариантов или выключи их — иначе предложения потеряются.
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
      <SmartConsentDialog
        visible={consent}
        onClose={() => setConsent(false)}
        onAllow={() => {
          setAiConsent(true);
          setConsent(false);
          void runSmart();
        }}
      />
      <ConfirmDialog
        visible={confirmApply !== null}
        title="Проверь вопрос"
        message="Возможен второй верный ответ. Если применить, ученик может ответить верно и другим вариантом, а ответ засчитается неверным."
        confirmText="Применить"
        busy={applying !== null}
        onConfirm={() => confirmApply && doApply(confirmApply)}
        onClose={() => setConfirmApply(null)}
      >
        {confirmApply?.reasons.map((r) => (
          <Text key={r.code + r.text} variant="bodySmall" style={{ color: colors.warningText }}>
            {r.text}
          </Text>
        ))}
      </ConfirmDialog>
      <ConfirmDialog
        visible={confirmOpen}
        title="Есть сомнительные вопросы"
        message={`В экзамене ${doubtful.length} вопрос(ов) от ИИ, где может подойти второй ответ. Проверь их или открой экзамен как есть.`}
        confirmText="Открыть как есть"
        busy={opening}
        onConfirm={() => open(true)}
        onClose={() => setConfirmOpen(false)}
      >
        {doubtful.map((d) => (
          <Button
            key={d.itemId}
            variant="quiet"
            title={`Проверить: ${itemTitle(d)}`}
            onPress={() => {
              setConfirmOpen(false);
              setEditing(d);
            }}
          />
        ))}
      </ConfirmDialog>
    </View>
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
        draft={draft}
        showNames={showNames}
        onShowNames={setShowNames}
        onStatus={setStatus}
      />
    );
  if (status === 'active')
    return (
      <MonitorView
        sessionId={sessionId}
        draft={draft}
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
