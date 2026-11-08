/**
 * Приглашение учеников в курс: код и ссылка, перевыпуск кода
 * (Clean 8a — состояние и обработчики перенесены из HomeScreen без изменений).
 */
import React, { useCallback, useState } from 'react';
import { confirmDialog, toast } from '@/components/ui';
import { getSession } from '@/services/auth/session';
import { NeonService } from '@/services/NeonService';
import { log } from '@/utils/logger';

type Params = {
  /** Открыть окно после закрытия боковой панели (см. HomeScreen) */
  runAfterDrawerClosed: (fn: () => void) => void;
  setCourseMenuOpen: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useCourseInvite({ runAfterDrawerClosed, setCourseMenuOpen }: Params) {
  const [inviteModalCourseId, setInviteModalCourseId] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [inviteJoinCode, setInviteJoinCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteRegenerating, setInviteRegenerating] = useState(false);

  const openInviteModal = useCallback(
    async (courseId: string) => {
      setCourseMenuOpen(null);
      setInviteCopied(false);
      setInviteToken(null);
      setInviteJoinCode(null);
      setInviteLoading(true);
      // Окно — только после закрытия боковой панели (иначе iOS покажет его под панелью и оно пропадёт)
      runAfterDrawerClosed(() => setInviteModalCourseId(courseId));
      try {
        const authSession = await getSession();
        const userId = authSession?.user?.id;
        if (userId) {
          const result = await NeonService.createCourseInvite(courseId, userId);
          setInviteToken(result?.token ?? null);
          setInviteJoinCode(result?.joinCode ?? null);
        }
      } catch (error) {
        log.error('Home', 'Failed to create invite', error);
      } finally {
        setInviteLoading(false);
      }
    },
    // setCourseMenuOpen — сеттер useState, ссылка постоянная: в зависимостях только для линтера
    [runAfterDrawerClosed, setCourseMenuOpen]
  );

  const closeInviteModal = useCallback(() => {
    setInviteModalCourseId(null);
    setInviteCopied(false);
    setInviteToken(null);
    setInviteJoinCode(null);
  }, []);

  const handleRegenerateInvite = useCallback(async () => {
    if (!inviteModalCourseId) return;
    const confirmed = await confirmDialog({
      title: 'Обновить код приглашения?',
      message:
        'Старые ссылка и код перестанут работать — ученики, у которых они есть, больше не смогут по ним присоединиться.',
      confirmText: 'Обновить',
      destructive: true,
    });
    if (!confirmed) return;
    setInviteRegenerating(true);
    setInviteCopied(false);
    try {
      const result = await NeonService.regenerateCourseInvite(inviteModalCourseId);
      if (result) {
        setInviteToken(result.token);
        setInviteJoinCode(result.joinCode);
      } else {
        toast.error('Не удалось обновить код приглашения');
      }
    } finally {
      setInviteRegenerating(false);
    }
  }, [inviteModalCourseId]);

  return {
    inviteModalCourseId,
    inviteCopied,
    setInviteCopied,
    inviteToken,
    inviteJoinCode,
    inviteLoading,
    inviteRegenerating,
    openInviteModal,
    closeInviteModal,
    handleRegenerateInvite,
  };
}
