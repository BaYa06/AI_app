/**
 * Код подключения к курсу (plan/new/teacher_cabinet.md, Teacher 9–10): логика одна для RN-окна
 * (CourseJoinCodeDialog) и Swift-окна (JoinCodeSheet.swift).
 *
 * Код — тем же способом, что в «Пригласить учеников» (createCourseInvite / regenerateCourseInvite).
 * Новое: сколько учеников в курсе и кто подключился последним (joinedAt из list-members).
 * Подтверждение «Обновить код?» — у окна: RN показывает confirmDialog, Swift — системный алерт.
 */
import { useCallback, useEffect, useState } from 'react';
import { Clipboard, Platform, Share } from 'react-native';
import { NeonService } from '@/services/NeonService';
import { getSession } from '@/services/auth/session';
import { log } from '@/utils/logger';

const MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

/** Сколько последних подключившихся показываем */
export const RECENT_JOINERS = 3;

export const JOIN_CODE_TEXTS = {
  title: 'Код подключения к курсу',
  close: 'Закрыть',
  description: 'Ученик вводит этот код в приложении, чтобы присоединиться к курсу.',
  copy: 'Копировать',
  copied: 'Скопировано',
  share: 'Поделиться',
  regenerate: 'Обновить код подключения',
  regenerateTitle: 'Обновить код подключения?',
  regenerateMessage:
    'Старые ссылка и код перестанут работать — ученики, у которых они есть, больше не смогут по ним присоединиться.',
  regenerateConfirm: 'Обновить',
  cancel: 'Отмена',
  failed: 'Не удалось получить код',
  regenerateFailed: 'Не удалось обновить код подключения',
  recentTitle: 'Последние подключились',
  noStudents: 'Пока никто не подключился — отправь код ученикам',
  codeHint: 'Нажми, чтобы скопировать',
} as const;

export interface RecentJoiner {
  name: string;
  /** «2 ноя» */
  date: string;
}

export interface CourseJoinCodeState {
  code: string | null;
  loading: boolean;
  regenerating: boolean;
  copied: boolean;
  /** Ошибка обновления кода — показывается в окне */
  error: string | null;
  /** null — ученики ещё грузятся или не загрузились */
  membersCount: number | null;
  recent: RecentJoiner[];
}

/** «В курсе 22 ученика» */
export function membersCountLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word =
    mod10 === 1 && mod100 !== 11
      ? 'ученик'
      : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)
        ? 'ученика'
        : 'учеников';
  return `В курсе ${count} ${word}`;
}

/** Последние подключившиеся, новые первыми */
export function recentJoiners(
  members: Array<{ displayName: string; joinedAt: number }>,
  limit = RECENT_JOINERS
): RecentJoiner[] {
  return [...members]
    .filter((m) => Number.isFinite(m.joinedAt))
    .sort((a, b) => b.joinedAt - a.joinedAt)
    .slice(0, limit)
    .map((m) => {
      const d = new Date(m.joinedAt);
      return { name: m.displayName, date: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}` };
    });
}

function copyToClipboard(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    Clipboard.setString(text);
  }
}

export function useCourseJoinCode(visible: boolean, courseId: string, courseTitle?: string) {
  const [state, setState] = useState<CourseJoinCodeState>({
    code: null,
    loading: false,
    regenerating: false,
    copied: false,
    error: null,
    membersCount: null,
    recent: [],
  });
  const patch = (p: Partial<CourseJoinCodeState>) => setState((s) => ({ ...s, ...p }));

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setState({
      code: null,
      loading: true,
      regenerating: false,
      copied: false,
      error: null,
      membersCount: null,
      recent: [],
    });
    (async () => {
      try {
        const authSession = await getSession();
        const userId = authSession?.user?.id;
        const result = userId ? await NeonService.createCourseInvite(courseId, userId) : null;
        if (mounted) patch({ code: result?.joinCode ?? null });
      } catch (e) {
        log.error('CourseJoinCode', 'Failed to create invite', e);
      } finally {
        if (mounted) patch({ loading: false });
      }
    })();
    NeonService.loadCourseMembers(courseId)
      .then((members) => {
        if (mounted) patch({ membersCount: members.length, recent: recentJoiners(members) });
      })
      .catch(() => {
        // Ученики не загрузились — блок про учеников просто не показываем
      });
    return () => {
      mounted = false;
    };
  }, [visible, courseId]);

  const copy = useCallback(() => {
    if (!state.code) return;
    copyToClipboard(state.code);
    patch({ copied: true });
  }, [state.code]);

  const share = useCallback(async () => {
    if (!state.code) return;
    const course = courseTitle ? ` «${courseTitle}»` : '';
    try {
      await Share.share({
        message: `Присоединяйся к курсу${course} во Flashly — код подключения: ${state.code}`,
      });
    } catch {
      // Закрыли меню «Поделиться» — ничего не делаем
    }
  }, [state.code, courseTitle]);

  /** Обновить код — подтверждение уже получено окном */
  const regenerate = useCallback(async () => {
    patch({ regenerating: true, copied: false, error: null });
    try {
      const result = await NeonService.regenerateCourseInvite(courseId);
      if (result) patch({ code: result.joinCode });
      else patch({ error: JOIN_CODE_TEXTS.regenerateFailed });
    } catch {
      patch({ error: JOIN_CODE_TEXTS.regenerateFailed });
    } finally {
      patch({ regenerating: false });
    }
  }, [courseId]);

  return { state, copy, share, regenerate };
}
