/**
 * Пустая главная: урок дня из других курсов, подсказки «создать набор / войти в курс»
 * (Clean 8 — вынесено из HomeScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View } from 'react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common';
import { iconSize, alpha } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { Card as SurfaceCard, EmptyState } from '@/components/ui';
import { Plus, Library, Lightbulb, Folder, Users } from 'lucide-react-native';
import { Analytics } from '@/services/analytics';
import { lessonCardContent } from '@/components/home/lessonText';
import { LessonCard } from '@/components/home/LessonCard';
import { styles } from '../styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  teacherBanner: React.ReactNode;
  isTeacher: boolean | null;
  hasLessonCards: boolean;
  lessonContent: ReturnType<typeof lessonCardContent>;
  handleLessonPress: () => void;
  openFocusSheet: () => void;
  mySetsEmptyButCourses: boolean;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setJoinByCodeVisible: React.Dispatch<React.SetStateAction<boolean>>;
  navigation: any;
};

export function HomeEmptyState({
  colors,
  teacherBanner,
  isTeacher,
  hasLessonCards,
  lessonContent,
  handleLessonPress,
  openFocusSheet,
  mySetsEmptyButCourses,
  setDrawerOpen,
  setJoinByCodeVisible,
  navigation,
}: Props) {
  return (
    <>
      {isTeacher === true && teacherBanner}
      {/* Курс пуст, но в других курсах есть слова — урок дня всё равно на месте (повторение из всех) */}
      {isTeacher === false && hasLessonCards && lessonContent && (
        <LessonCard
          content={lessonContent}
          onPress={handleLessonPress}
          onSecondaryPress={openFocusSheet}
          style={styles.lessonCard}
        />
      )}
      {mySetsEmptyButCourses ? (
        <EmptyState
          icon={Library}
          title="Здесь наборы без курса"
          description="Наборы курсов лежат внутри своих курсов. Выбери курс в списке — или создай набор здесь."
          action={{
            label: 'Открыть курсы',
            icon: Folder,
            onPress: () => {
              Analytics.homeAction('open_courses');
              setDrawerOpen(true);
            },
          }}
          secondaryAction={{
            label: 'Создать набор',
            icon: Plus,
            onPress: () => {
              Analytics.homeAction('create_set');
              navigation?.navigate('SetEditor', {});
            },
          }}
        />
      ) : (
        <>
          <EmptyState
            icon={Library}
            title="Пока нет наборов"
            description={
              isTeacher
                ? 'Создай первый набор, чтобы начать учиться и упорядочить материалы по курсам.'
                : 'Создай свой набор слов или подключись к курсу учителя — его наборы появятся здесь.'
            }
            action={{
              label: 'Создать набор',
              icon: Plus,
              onPress: () => {
                Analytics.homeAction('create_set');
                navigation?.navigate('SetEditor', {});
              },
            }}
            // Новичку — второй путь: не создавать, а подключиться к курсу учителя по коду
            secondaryAction={
              isTeacher !== true
                ? {
                    label: 'Подключиться к курсу',
                    icon: Users,
                    onPress: () => {
                      triggerHaptic('selection');
                      Analytics.homeAction('join_course');
                      setJoinByCodeVisible(true);
                    },
                  }
                : undefined
            }
          />
          <SurfaceCard style={[styles.tipCard, { backgroundColor: alpha(colors.primary, 10) }]}>
            <Lightbulb size={iconSize.s} color={colors.primary} />
            <View style={styles.flex1}>
              <Text variant="label" style={[styles.tipTitle, { color: colors.textPrimary }]}>
                Подсказка
              </Text>
              <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
                {isTeacher
                  ? 'Курс пустой? Через «Режим учителя» выше можно пригласить учеников и подключить учебник — наборы для этого не нужны.'
                  : 'Объединяй несколько наборов в курс — так проще учиться по теме или семестру.'}
              </Text>
            </View>
          </SurfaceCard>
        </>
      )}
    </>
  );
}
