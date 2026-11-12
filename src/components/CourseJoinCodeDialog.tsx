/**
 * CourseJoinCodeDialog — код подключения к курсу для учителя.
 * Код берётся тем же способом, что в «Пригласить учеников» на главной
 * (createCourseInvite / regenerateCourseInvite).
 *
 * plan/new/teacher_cabinet.md, Teacher 9–10: логика — useCourseJoinCode (общая), плюс «В курсе
 * N учеников» и последние подключившиеся. iOS — нативный лист (JoinCodeSheet.swift), Android
 * и веб — этот RN-диалог.
 */
import React from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Button, Dialog, confirmDialog } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import {
  JOIN_CODE_TEXTS as T,
  membersCountLabel,
  useCourseJoinCode,
} from '@/components/teacher/useCourseJoinCode';
import {
  isNativeJoinCodeSheet,
  useNativeJoinCodeSheet,
} from '@/components/teacher/nativeJoinCodeSheet';

interface CourseJoinCodeDialogProps {
  visible: boolean;
  courseId: string;
  courseTitle?: string;
  onClose: () => void;
}

export function CourseJoinCodeDialog(props: CourseJoinCodeDialogProps) {
  const joinCode = useCourseJoinCode(props.visible, props.courseId, props.courseTitle);
  useNativeJoinCodeSheet({ visible: props.visible, onClose: props.onClose, ...joinCode });
  if (isNativeJoinCodeSheet) return null;
  return <CourseJoinCodeDialogRN {...props} {...joinCode} />;
}

function CourseJoinCodeDialogRN({
  visible,
  onClose,
  state,
  copy,
  share,
  regenerate,
}: CourseJoinCodeDialogProps & ReturnType<typeof useCourseJoinCode>) {
  const colors = useThemeColors();
  const { code, loading, regenerating, copied, error, membersCount, recent } = state;

  const handleRegenerate = async () => {
    const confirmed = await confirmDialog({
      title: T.regenerateTitle,
      message: T.regenerateMessage,
      confirmText: T.regenerateConfirm,
      destructive: true,
    });
    if (confirmed) regenerate();
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={T.title}
      headerRight={
        <Button
          variant="icon"
          icon={X}
          background="none"
          iconSize={iconSize.s}
          iconColor={colors.textSecondary}
          accessibilityLabel={T.close}
          onPress={onClose}
        />
      }
    >
      <Text variant="bodySmall" style={[styles.description, { color: colors.textSecondary }]}>
        {T.description}
      </Text>

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />
      ) : code ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Код курса ${code.split('').join(' ')}. ${T.codeHint}`}
            style={[
              styles.codeBox,
              { backgroundColor: colors.surfaceMuted, borderColor: alpha(colors.primary, 40) },
            ]}
            onPress={copy}
          >
            <Text variant="h1" style={[styles.code, { color: colors.primary }]}>
              {code}
            </Text>
          </Pressable>

          <View style={styles.buttons}>
            <Button
              title={copied ? T.copied : T.copy}
              icon={copied ? Check : undefined}
              onPress={copy}
              style={styles.flex1}
            />
            <Button variant="secondary" title={T.share} onPress={share} style={styles.flex1} />
          </View>

          <Button
            variant="quiet"
            tone="secondary"
            title={T.regenerate}
            onPress={handleRegenerate}
            loading={regenerating}
            fullWidth
            style={styles.regenerate}
          />
          {error && (
            <Text variant="bodySmall" align="center" style={{ color: colors.errorText }}>
              {error}
            </Text>
          )}
        </>
      ) : (
        <Text variant="bodySmall" style={{ color: colors.errorText }}>
          {T.failed}
        </Text>
      )}

      {/* Кто в курсе (Teacher 9) */}
      {membersCount !== null && (
        <View style={[styles.members, { borderTopColor: colors.border }]}>
          <Text variant="label" style={{ color: colors.textPrimary }}>
            {membersCountLabel(membersCount)}
          </Text>
          {recent.length === 0 ? (
            <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
              {T.noStudents}
            </Text>
          ) : (
            <>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {T.recentTitle}
              </Text>
              {recent.map((j, i) => (
                <View key={`${j.name}-${i}`} style={styles.joinerRow}>
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={[styles.flex1, { color: colors.textPrimary }]}
                  >
                    {j.name}
                  </Text>
                  <Text variant="caption" style={{ color: colors.textSecondary }}>
                    {j.date}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
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
  members: {
    borderTopWidth: 1,
    marginTop: spacing.m,
    paddingTop: spacing.m,
    gap: spacing.xxs,
  },
  joinerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
});
