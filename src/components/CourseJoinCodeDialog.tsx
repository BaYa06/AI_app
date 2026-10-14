/**
 * CourseJoinCodeDialog — код подключения к курсу для учителя.
 * Код берётся тем же способом, что в «Пригласить учеников» на главной
 * (createCourseInvite / regenerateCourseInvite).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator, Platform, Clipboard, Share } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Dialog, confirmDialog, toast } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';

interface CourseJoinCodeDialogProps {
  visible: boolean;
  courseId: string;
  courseTitle?: string;
  onClose: () => void;
}

function copyToClipboard(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    Clipboard.setString(text);
  }
}

export function CourseJoinCodeDialog({ visible, courseId, courseTitle, onClose }: CourseJoinCodeDialogProps) {
  const colors = useThemeColors();
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    setCopied(false);
    setJoinCode(null);
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        const result = userId ? await NeonService.createCourseInvite(courseId, userId) : null;
        if (mounted) setJoinCode(result?.joinCode ?? null);
      } catch (e) {
        console.error('Failed to create invite:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [visible, courseId]);

  const handleCopy = useCallback(() => {
    if (!joinCode) return;
    copyToClipboard(joinCode);
    setCopied(true);
  }, [joinCode]);

  const handleShare = useCallback(async () => {
    if (!joinCode) return;
    const course = courseTitle ? ` «${courseTitle}»` : '';
    try {
      await Share.share({ message: `Присоединяйся к курсу${course} во Flashly — код подключения: ${joinCode}` });
    } catch {}
  }, [joinCode, courseTitle]);

  const handleRegenerate = useCallback(async () => {
    const confirmed = await confirmDialog({
      title: 'Обновить код подключения?',
      message: 'Старые ссылка и код перестанут работать — ученики, у которых они есть, больше не смогут по ним присоединиться.',
      confirmText: 'Обновить',
      destructive: true,
    });
    if (!confirmed) return;
    setRegenerating(true);
    setCopied(false);
    try {
      const result = await NeonService.regenerateCourseInvite(courseId);
      if (result) setJoinCode(result.joinCode);
      else toast.error('Не удалось обновить код подключения');
    } finally {
      setRegenerating(false);
    }
  }, [courseId]);

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title="Код подключения к курсу"
      headerRight={
        <Button
          variant="icon"
          icon={X}
          background="none"
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel="Закрыть"
          onPress={onClose}
        />
      }
    >
      <Text variant="bodySmall" style={[styles.description, { color: colors.textSecondary }]}>
        Ученик вводит этот код в приложении, чтобы присоединиться к курсу.
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
      ) : joinCode ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Код курса ${joinCode.split('').join(' ')}. Нажми, чтобы скопировать`}
            style={[styles.codeBox, { backgroundColor: colors.surfaceMuted, borderColor: alpha(colors.primary, 40) }]}
            onPress={handleCopy}
          >
            <Text variant="h1" style={[styles.code, { color: colors.primary }]}>
              {joinCode}
            </Text>
          </Pressable>

          <View style={styles.buttons}>
            <Button
              title={copied ? 'Скопировано' : 'Копировать'}
              icon={copied ? Check : undefined}
              onPress={handleCopy}
              style={styles.flex1}
            />
            <Button variant="secondary" title="Поделиться" onPress={handleShare} style={styles.flex1} />
          </View>

          <Button
            variant="quiet"
            tone="secondary"
            title="Обновить код подключения"
            onPress={handleRegenerate}
            loading={regenerating}
            fullWidth
            style={styles.regenerate}
          />
        </>
      ) : (
        <Text variant="bodySmall" style={{ color: colors.errorText }}>
          Не удалось получить код
        </Text>
      )}
    </Dialog>
  );
}

const styles = StyleSheet.create({
  description: {
    marginBottom: spacing.m,
  },
  spinner: {
    marginVertical: spacing.m,
  },
  codeBox: {
    alignItems: 'center',
    borderRadius: borderRadius.m,
    borderWidth: 1,
    padding: spacing.m,
    marginBottom: spacing.m,
  },
  code: {
    letterSpacing: 8,
  },
  buttons: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  flex1: {
    flex: 1,
  },
  regenerate: {
    marginTop: spacing.s,
  },
});
