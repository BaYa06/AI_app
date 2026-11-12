/**
 * Нативный лист «Кто не сдал» на iOS (plan/new/teacher_cabinet.md, Teacher 23) —
 * ios/FlashcardsApp/NotSubmittedSheet.swift. Состояние (фильтр, галочки, подписи) — здесь, Swift
 * только рисует его и присылает нажатия (как nativeJoinCodeSheet.ts). Android и веб — RN-окно.
 */
import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules, Platform, processColor } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import type { HomeworkStatusData } from '@/services/homework';
import { NeonService } from '@/services/NeonService';
import {
  NOT_SUBMITTED_TEXTS as T,
  defaultPicked,
  filterRows,
  notSubmittedDue,
  notSubmittedRows,
  notSubmittedSubtitle,
  notSubmittedTitle,
  sendLabel,
  tabs as tabsOf,
  type NotSubmittedTab,
} from './notSubmitted';
import type { NotSubmittedSheetProps } from './NotSubmittedSheet';
import { remindSelected } from './remindHomework';

interface NotSubmittedSheetModule {
  present(options: object): void;
  update(state: object): void;
  dismiss(): void;
}

type SheetEvent =
  | { type: 'tab'; key: NotSubmittedTab }
  | { type: 'toggle'; id: string }
  | { type: 'toggleAll' }
  | { type: 'send' }
  | { type: 'open'; id: string }
  | { type: 'retry' }
  | { type: 'dismiss' };

const native: NotSubmittedSheetModule | undefined =
  Platform.OS === 'ios' ? NativeModules.NotSubmittedSheetModule : undefined;
const emitter = native ? new NativeEventEmitter(NativeModules.NotSubmittedSheetModule) : null;

export const isNativeNotSubmittedSheet = !!native;

const COLOR_KEYS = [
  'surface',
  'surfaceMuted',
  'border',
  'borderLight',
  'textPrimary',
  'textSecondary',
  'textTertiary',
  'primary',
  'primaryFill',
  'onPrimary',
  'warning',
  'warningText',
  'homeworkText',
  'errorText',
  'gameGreen',
] as const;

interface State {
  data: HomeworkStatusData | null;
  failed: boolean;
  tab: NotSubmittedTab;
  picked: Set<string>;
  busy: boolean;
  sent: number | null;
}

/** Состояние → то, что рисует Swift */
export function nativeNotSubmittedState(s: State, courseTitle: string) {
  if (!s.data) {
    return { loading: !s.failed, failed: s.failed, retry: 'Повторить', title: 'Кто не сдал' };
  }
  const rows = notSubmittedRows(s.data);
  const shown = filterRows(rows, s.tab);
  const pickable = shown.filter((r) => !r.reminded);
  const allOn = pickable.length > 0 && pickable.every((r) => s.picked.has(r.id));
  const picked = rows.filter((r) => s.picked.has(r.id)).length;
  return {
    loading: false,
    failed: false,
    title: notSubmittedTitle(rows, s.data.students.length),
    subtitle: notSubmittedSubtitle(s.data, courseTitle),
    due: notSubmittedDue(s.data),
    empty: T.empty,
    tabs: rows.length ? tabsOf(rows).map((t) => ({ ...t, selected: t.key === s.tab })) : [],
    toggleAll: pickable.length ? (allOn ? T.clearAll : T.selectAll) : '',
    rows: shown.map((r) => ({
      ...r,
      progress: r.kind === 'in_progress',
      seen: r.reminded ? `${r.seen} · ${T.remindedToday}` : r.seen,
      on: s.picked.has(r.id),
      toggleLabel: `${s.picked.has(r.id) ? 'Не напоминать' : 'Напомнить'}: ${r.name}`,
    })),
    button: rows.length ? sendLabel(picked, s.sent) : '',
    buttonEnabled: s.sent === null && picked > 0,
    sent: s.sent !== null,
    busy: s.busy,
    hint: s.sent !== null ? T.sentHint : T.hint,
  };
}

/** Показывает нативный лист, пока `visible`. Ничего не делает, если нативного модуля нет. */
export function useNativeNotSubmittedSheet(props: NotSubmittedSheetProps) {
  const colors = useThemeColors();
  const dark = useSettingsStore((s) => s.resolvedTheme === 'dark');
  const [state, setState] = useState<State>({
    data: null,
    failed: false,
    tab: props.initialTab ?? 'all',
    picked: new Set(),
    busy: false,
    sent: null,
  });
  const latest = useRef({ props, state });
  latest.current = { props, state };
  const shown = useRef(false);

  const load = async () => {
    const data = await NeonService.loadHomeworkStatus(latest.current.props.homeworkId);
    setState((s) => ({
      ...s,
      data,
      failed: !data,
      picked: data ? defaultPicked(notSubmittedRows(data)) : s.picked,
    }));
    return data;
  };

  useEffect(() => {
    if (!emitter) return;
    const sub = emitter.addListener('NotSubmittedSheetEvent', async (event: SheetEvent) => {
      if (!shown.current) return;
      const { props: p, state: s } = latest.current;
      switch (event.type) {
        case 'tab':
          setState((x) => ({ ...x, tab: event.key }));
          break;
        case 'toggle':
          setState((x) => {
            const picked = new Set(x.picked);
            if (picked.has(event.id)) picked.delete(event.id);
            else picked.add(event.id);
            return { ...x, picked, sent: null };
          });
          break;
        case 'toggleAll':
          setState((x) => {
            if (!x.data) return x;
            const pickable = filterRows(notSubmittedRows(x.data), x.tab).filter((r) => !r.reminded);
            const allOn = pickable.every((r) => x.picked.has(r.id));
            const picked = new Set(x.picked);
            pickable.forEach((r) => (allOn ? picked.delete(r.id) : picked.add(r.id)));
            return { ...x, picked, sent: null };
          });
          break;
        case 'send': {
          if (!s.data || s.busy) break;
          const ids = notSubmittedRows(s.data)
            .filter((r) => s.picked.has(r.id))
            .map((r) => r.id);
          if (ids.length === 0) break;
          setState((x) => ({ ...x, busy: true }));
          const n = await remindSelected(p.homeworkId, ids);
          if (n === null) {
            setState((x) => ({ ...x, busy: false }));
            break;
          }
          await load();
          setState((x) => ({ ...x, busy: false, sent: n }));
          break;
        }
        case 'retry':
          setState((x) => ({ ...x, failed: false }));
          load();
          break;
        case 'open': {
          shown.current = false;
          const row = s.data?.students.find((x) => x.id === event.id);
          p.onClose();
          if (row) p.onOpenStudent(row.id, row.displayName);
          break;
        }
        case 'dismiss':
          shown.current = false;
          p.onClose();
          break;
      }
    });
    return () => {
      sub.remove();
      if (shown.current) native?.dismiss();
    };
  }, []);

  useEffect(() => {
    if (!native) return;
    if (props.visible && !shown.current) {
      shown.current = true;
      const fresh: State = {
        data: null,
        failed: false,
        tab: props.initialTab ?? 'all',
        picked: new Set(),
        busy: false,
        sent: null,
      };
      setState(fresh);
      native.present({
        close: T.close,
        colors: Object.fromEntries(COLOR_KEYS.map((key) => [key, processColor(colors[key])])),
        dark,
        state: nativeNotSubmittedState(fresh, props.courseTitle),
      });
      load();
    } else if (!props.visible && shown.current) {
      shown.current = false;
      native.dismiss();
    }
  }, [props.visible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!native || !shown.current) return;
    native.update(nativeNotSubmittedState(state, props.courseTitle));
  }, [state, props.courseTitle]);
}
