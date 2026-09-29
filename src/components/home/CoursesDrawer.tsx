/**
 * CoursesDrawer
 * @description Боковое меню курсов на Home-экране. Полностью управляется извне через
 * shared-value `translateX` (пишется как из edge-swipe жеста в HomeScreen, так и из
 * собственного drag-to-close жеста на самой панели) — компонент не хранит позицию сам,
 * только подписывается на неё через useAnimatedStyle/useDerivedValue.
 *
 * Изолирован через React.memo: ре-рендер хедера/стриков/алмазов на HomeScreen не задевает
 * этот компонент, а сам он не ре-рендерится во время перетаскивания вообще (translateX
 * меняется на UI-потоке, без React state).
 */
import React, { memo, useCallback, useEffect } from 'react';
import {
  View,
  Pressable,
  TextInput,
  StyleSheet,
  Modal,
  FlatList,
  Platform,
  type ListRenderItemInfo,
} from 'react-native';
import { GestureDetector, GestureHandlerRootView, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  interpolate,
  Extrapolation,
  withTiming,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import {
  X,
  Folder,
  FolderOpen,
  Plus,
  UserPlus,
  Library,
  BookOpen,
  MoreHorizontal,
  CheckCircle,
  Edit2,
  Trash2,
  LogOut,
} from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { spacing, borderRadius, heights, iconSize, typography, alpha, getDeckAccentColor } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import { pluralize } from '@/utils';
import type { Course } from '@/types';
import { animateDrawerTo, clampTranslateX, resolveDrawerOpen } from './drawerAnimation';

type ThemeColors = ReturnType<typeof useThemeColors>;
type CourseStats = { setCount: number; cardCount: number; masteredPercent: number };

/** «3 набора • 42 карточки • 15% выучено» */
function formatCourseStats(stats: CourseStats): string {
  return [
    `${stats.setCount} ${pluralize(stats.setCount, 'набор', 'набора', 'наборов')}`,
    `${stats.cardCount} ${pluralize(stats.cardCount, 'карточка', 'карточки', 'карточек')}`,
    `${stats.masteredPercent}% выучено`,
  ].join(' • ');
}
type Insets = { top: number; bottom: number; left: number; right: number };

interface CourseRowProps {
  course: Course;
  index: number;
  isActive: boolean;
  isMenuOpen: boolean;
  isEditing: boolean;
  editingTitle: string;
  stats: CourseStats;
  isTeacher: boolean | null;
  colors: ThemeColors;
  editInputRef: React.RefObject<TextInput>;
  onPress: (id: string) => void;
  onToggleMenu: (id: string) => void;
  onChangeEditingTitle: (text: string) => void;
  onSaveEditingTitle: (id: string) => void;
  onCancelEditingTitle: () => void;
  onOpenInvite: (id: string) => void;
  onOpenEditModal: (id: string, title: string) => void;
  onOpenDeleteModal: (id: string) => void;
  onOpenLeaveModal: (id: string) => void;
}

type CurtainAction = {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  tint: string;
  onPress: () => void;
};

/** Кнопка шторки: появляется с небольшой задержкой после предыдущей — сверху вниз «волной» */
const CurtainButton = memo(function CurtainButton({
  action,
  index,
  progress,
}: {
  action: CurtainAction;
  index: number;
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => {
    const start = 0.2 + index * 0.12;
    const t = interpolate(progress.value, [start, Math.min(1, start + 0.45)], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: t,
      transform: [{ translateY: (1 - t) * -10 }, { scale: 0.94 + t * 0.06 }],
    };
  });
  return (
    <Animated.View style={[styles.curtainButtonWrap, style]}>
      <Pressable
        style={({ pressed }) => [styles.curtainButton, { backgroundColor: action.tint }, pressed && styles.pressed]}
        onPress={(e) => {
          e.stopPropagation();
          triggerHaptic('selection');
          action.onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel={action.label}
      >
        {action.icon}
        <Text variant="caption" style={[styles.semibold, { color: action.color }]} numberOfLines={1}>
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
});

/**
 * Действия курса, которые выезжают из-под карточки «шторкой» (вместо плавающего меню):
 * карточка плавно растёт вниз, кнопки проявляются по очереди.
 */
const CourseActionsCurtain = memo(function CourseActionsCurtain({
  open,
  actions,
}: {
  open: boolean;
  actions: CurtainAction[];
}) {
  const progress = useSharedValue(open ? 1 : 0);
  const contentHeight = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: open ? 320 : 220,
      easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
    });
  }, [open, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    height: contentHeight.value * progress.value,
  }));

  return (
    <Animated.View
      style={[styles.curtain, containerStyle]}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      {/* Абсолютный слой — чтобы измерить настоящую высоту кнопок, пока шторка закрыта */}
      <View
        style={styles.curtainInner}
        onLayout={(e) => {
          contentHeight.value = e.nativeEvent.layout.height;
        }}
      >
        {actions.map((action, i) => (
          <CurtainButton key={action.key} action={action} index={i} progress={progress} />
        ))}
      </View>
    </Animated.View>
  );
});

const CourseRow = memo(function CourseRow({
  course,
  index,
  isActive,
  isMenuOpen,
  isEditing,
  editingTitle,
  stats,
  isTeacher,
  colors,
  editInputRef,
  onPress,
  onToggleMenu,
  onChangeEditingTitle,
  onSaveEditingTitle,
  onCancelEditingTitle,
  onOpenInvite,
  onOpenEditModal,
  onOpenDeleteModal,
  onOpenLeaveModal,
}: CourseRowProps) {
  const isStudent = course.isStudentCourse === true;
  const courseAccent = getDeckAccentColor(course.id || index);

  // Три точки поворачиваются, пока шторка открыта
  const dotsRotation = useSharedValue(isMenuOpen ? 1 : 0);
  useEffect(() => {
    dotsRotation.value = withTiming(isMenuOpen ? 1 : 0, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [isMenuOpen, dotsRotation]);
  const dotsStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${dotsRotation.value * 90}deg` }],
  }));

  const dangerTint = alpha(colors.error, 10);
  const neutralTint = colors.surfaceMuted;
  const primaryTint = alpha(colors.primary, 10);
  const actions: CurtainAction[] = isStudent
    ? [{
        key: 'leave', label: 'Выйти из курса', color: colors.errorText, tint: dangerTint,
        icon: <LogOut size={iconSize.s} color={colors.errorText} />,
        onPress: () => onOpenLeaveModal(course.id),
      }]
    : [
        ...(isTeacher
          ? [{
              key: 'invite', label: 'Пригласить', color: colors.primary, tint: primaryTint,
              icon: <UserPlus size={iconSize.s} color={colors.primary} />,
              onPress: () => onOpenInvite(course.id),
            }]
          : []),
        {
          key: 'rename', label: 'Переименовать', color: colors.textPrimary, tint: neutralTint,
          icon: <Edit2 size={iconSize.s} color={colors.textPrimary} />,
          onPress: () => onOpenEditModal(course.id, course.title),
        },
        {
          key: 'delete', label: 'Удалить', color: colors.errorText, tint: dangerTint,
          icon: <Trash2 size={iconSize.s} color={colors.errorText} />,
          onPress: () => onOpenDeleteModal(course.id),
        },
      ];

  return (
    <Pressable
      style={[
        styles.courseItem,
        isActive
          ? { borderLeftColor: courseAccent, backgroundColor: alpha(courseAccent, 10) }
          : { borderLeftColor: colors.border },
        { borderColor: colors.border },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive }}
      onPress={() => {
        if (!isEditing) {
          triggerHaptic('selection');
          onPress(course.id);
        }
      }}
    >
      <View style={styles.courseItemHeader}>
        <View style={styles.courseItemLeft}>
          {isStudent ? (
            <BookOpen size={iconSize.m} color={isActive ? courseAccent : colors.textPrimary} />
          ) : isActive ? (
            <FolderOpen size={iconSize.m} color={courseAccent} />
          ) : (
            <Folder size={iconSize.m} color={colors.textPrimary} />
          )}
          <View style={styles.flex1}>
            {isEditing && !isStudent ? (
              <View style={styles.editRow}>
                <View
                  style={[
                    styles.editCourseInputContainer,
                    { backgroundColor: colors.surface, borderColor: colors.primary },
                  ]}
                >
                  <Folder size={iconSize.s} color={colors.primary} />
                  <TextInput
                    ref={editInputRef}
                    style={[styles.courseInput, { color: colors.textPrimary }]}
                    placeholder="Название курса..."
                    placeholderTextColor={colors.textTertiary}
                    selectionColor={colors.primary}
                    value={editingTitle}
                    onChangeText={onChangeEditingTitle}
                    maxLength={255}
                    onSubmitEditing={() => onSaveEditingTitle(course.id)}
                  />
                </View>
                <View style={styles.editActions}>
                  <Pressable
                    style={[styles.iconCircle, { backgroundColor: colors.surfaceMuted }]}
                    hitSlop={spacing.xxs}
                    accessibilityRole="button"
                    accessibilityLabel="Сохранить название"
                    onPress={() => onSaveEditingTitle(course.id)}
                  >
                    <CheckCircle size={iconSize.s} color={colors.successText} />
                  </Pressable>
                  <Pressable
                    style={[styles.iconCircle, { backgroundColor: colors.surfaceMuted }]}
                    hitSlop={spacing.xxs}
                    accessibilityRole="button"
                    accessibilityLabel="Отменить"
                    onPress={onCancelEditingTitle}
                  >
                    <X size={iconSize.s} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text variant="body" numberOfLines={2} style={[styles.semibold, { color: isActive ? courseAccent : colors.textPrimary }]}>
                {course.title}
              </Text>
            )}
            {isStudent && course.teacherName ? (
              <Text variant="caption" style={{ color: colors.textSecondary }}>{course.teacherName}</Text>
            ) : (
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {formatCourseStats(stats)}
              </Text>
            )}
          </View>
        </View>
        <Pressable
          style={[styles.courseMoreButton, isMenuOpen && { backgroundColor: neutralTint }]}
          onPress={(e) => {
            e.stopPropagation();
            triggerHaptic('selection');
            onToggleMenu(course.id);
          }}
          accessibilityRole="button"
          accessibilityLabel={isMenuOpen ? 'Скрыть действия курса' : 'Действия курса'}
        >
          <Animated.View style={dotsStyle}>
            <MoreHorizontal size={iconSize.s} color={isMenuOpen ? colors.textPrimary : colors.textSecondary} />
          </Animated.View>
        </Pressable>
      </View>

      <CourseActionsCurtain open={isMenuOpen} actions={actions} />

    </Pressable>
  );
});

export interface CoursesDrawerProps {
  mounted: boolean;
  translateX: SharedValue<number>;
  drawerWidth: number;
  onGestureSettled: (open: boolean) => void;

  colors: ThemeColors;
  insets: Insets;

  courses: Course[];
  activeCourseId: string | null;
  isTeacher: boolean | null;
  getCourseStats: (courseId: string | null) => CourseStats;

  courseMenuOpen: string | null;
  onToggleCourseMenu: (id: string) => void;
  onDismissCourseMenu: () => void;

  editingCourseId: string | null;
  editingTitle: string;
  onChangeEditingTitle: (text: string) => void;
  onSaveEditingTitle: (id: string) => void;
  onCancelEditingTitle: () => void;
  editInputRef: React.RefObject<TextInput>;

  isCreatingCourse: boolean;
  newCourseTitle: string;
  onChangeNewCourseTitle: (text: string) => void;
  onStartCreatingCourse: () => void;
  onSubmitNewCourse: () => void;
  newCourseInputRef: React.RefObject<TextInput>;

  onSelectCourse: (id: string | null) => void;
  onJoinByCode: () => void;
  onOpenInvite: (id: string) => void;
  onOpenEditModal: (id: string, title: string) => void;
  onOpenDeleteModal: (id: string) => void;
  onOpenLeaveModal: (id: string) => void;

  onBackdropPress: () => void;
  onRequestClose: () => void;
}

export const CoursesDrawer = memo(function CoursesDrawer(props: CoursesDrawerProps) {
  const {
    mounted,
    translateX,
    drawerWidth,
    onGestureSettled,
    colors,
    insets,
    courses,
    activeCourseId,
    isTeacher,
    getCourseStats,
    courseMenuOpen,
    onToggleCourseMenu,
    onDismissCourseMenu,
    editingCourseId,
    editingTitle,
    onChangeEditingTitle,
    onSaveEditingTitle,
    onCancelEditingTitle,
    editInputRef,
    isCreatingCourse,
    newCourseTitle,
    onChangeNewCourseTitle,
    onStartCreatingCourse,
    onSubmitNewCourse,
    newCourseInputRef,
    onSelectCourse,
    onJoinByCode,
    onOpenInvite,
    onOpenEditModal,
    onOpenDeleteModal,
    onOpenLeaveModal,
    onBackdropPress,
    onRequestClose,
  } = props;

  // Drag-to-close: активен только пока панель реально смонтирована (значит уже видна),
  // поэтому может занимать весь свой View — конфликтов с edge-swipe-открытием (который
  // живёт на HomeScreen и отвечает только за узкую зону у левого края) здесь нет.
  const startX = useSharedValue(0);
  const panelGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onBegin(() => {
      startX.value = translateX.value;
    })
    .onUpdate((e) => {
      translateX.value = clampTranslateX(startX.value + e.translationX, drawerWidth);
    })
    .onEnd((e) => {
      const open = resolveDrawerOpen(translateX.value, e.velocityX, drawerWidth);
      animateDrawerTo(translateX, open, drawerWidth, onGestureSettled);
    });

  const backdropOpacity = useDerivedValue(() =>
    interpolate(translateX.value, [-drawerWidth, 0], [0, 1], Extrapolation.CLAMP)
  );
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const panelAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const keyExtractor = useCallback((item: Course) => item.id, []);

  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<Course>) => (
      <CourseRow
        course={item}
        index={index}
        isActive={activeCourseId === item.id}
        isMenuOpen={courseMenuOpen === item.id}
        isEditing={editingCourseId === item.id}
        editingTitle={editingTitle}
        stats={getCourseStats(item.id)}
        isTeacher={isTeacher}
        colors={colors}
        editInputRef={editInputRef}
        onPress={onSelectCourse}
        onToggleMenu={onToggleCourseMenu}
        onChangeEditingTitle={onChangeEditingTitle}
        onSaveEditingTitle={onSaveEditingTitle}
        onCancelEditingTitle={onCancelEditingTitle}
        onOpenInvite={onOpenInvite}
        onOpenEditModal={onOpenEditModal}
        onOpenDeleteModal={onOpenDeleteModal}
        onOpenLeaveModal={onOpenLeaveModal}
      />
    ),
    [
      activeCourseId,
      courseMenuOpen,
      editingCourseId,
      editingTitle,
      getCourseStats,
      isTeacher,
      colors,
      editInputRef,
      onSelectCourse,
      onToggleCourseMenu,
      onChangeEditingTitle,
      onSaveEditingTitle,
      onCancelEditingTitle,
      onOpenInvite,
      onOpenEditModal,
      onOpenDeleteModal,
      onOpenLeaveModal,
    ]
  );

  const allStats = getCourseStats(null);

  const listHeader = (
    <View style={styles.listHeader}>
      {isCreatingCourse ? (
        <View
          style={[
            styles.newCourseInputContainer,
            { backgroundColor: colors.surface, borderColor: colors.primary },
          ]}
        >
          <Folder size={iconSize.s} color={colors.primary} />
          <TextInput
            ref={newCourseInputRef}
            style={[styles.courseInput, { color: colors.textPrimary }]}
            placeholder="Название курса..."
            placeholderTextColor={colors.textTertiary}
            selectionColor={colors.primary}
            value={newCourseTitle}
            onChangeText={onChangeNewCourseTitle}
            maxLength={255}
            onBlur={onSubmitNewCourse}
            onSubmitEditing={onSubmitNewCourse}
            autoFocus
          />
        </View>
      ) : (
        <View style={styles.listHeaderButtons}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.newCourseButton,
              { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 20) },
              pressed && styles.pressed,
            ]}
            onPress={onStartCreatingCourse}
          >
            <Plus size={iconSize.s} color={colors.primary} />
            <Text style={[typography.button, styles.noLetterSpacing, { color: colors.primary }]}>Новый курс</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.newCourseButton,
              { backgroundColor: alpha(colors.primary, 10), borderColor: alpha(colors.primary, 20) },
              pressed && styles.pressed,
            ]}
            onPress={onJoinByCode}
          >
            <UserPlus size={iconSize.s} color={colors.primary} />
            <Text style={[typography.button, styles.noLetterSpacing, { color: colors.primary }]}>Войти по коду</Text>
          </Pressable>
        </View>
      )}

      {/* "All" item — всегда первым */}
      <Pressable
        style={[
          styles.courseItem,
          activeCourseId === null
            ? { borderLeftColor: colors.primary, backgroundColor: alpha(colors.primary, 10) }
            : { borderLeftColor: colors.border },
          { borderColor: colors.border },
        ]}
        accessibilityRole="button"
        accessibilityState={{ selected: activeCourseId === null }}
        onPress={() => onSelectCourse(null)}
      >
        <View style={styles.courseItemHeader}>
          <View style={styles.courseItemLeft}>
            <Library size={iconSize.m} color={activeCourseId === null ? colors.primary : colors.textPrimary} />
            <View style={styles.flex1}>
              <Text variant="body" style={[styles.semibold, { color: activeCourseId === null ? colors.primary : colors.textPrimary }]}>
                Все наборы
              </Text>
              <Text variant="caption" style={{ color: colors.textSecondary }}>
                {formatCourseStats(allStats)}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );

  const listEmpty = courses.length === 0 ? (
    <View style={styles.drawerEmpty}>
      <Text variant="bodySmall" align="center" style={{ color: colors.textSecondary }}>
        Создай курс, чтобы разложить наборы по темам
      </Text>
    </View>
  ) : null;

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose}>
      {/* Модалка — отдельный нативный root; вложенный GestureHandlerRootView нужен,
          иначе Gesture.Pan() внутри Modal не работает надёжно, особенно на Android. */}
      <GestureHandlerRootView style={styles.flex1}>
        <View style={styles.modalContainer}>
          <Animated.View style={[styles.backdrop, { backgroundColor: colors.overlay }, backdropAnimStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} accessibilityLabel="Закрыть список курсов" />
          </Animated.View>

          <GestureDetector gesture={panelGesture}>
            <Animated.View
              style={[
                styles.drawer,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  width: drawerWidth,
                  paddingTop: insets.top + spacing.m,
                  paddingBottom: insets.bottom + spacing.l,
                },
                panelAnimStyle,
              ]}
            >
              <View style={styles.drawerHeader}>
                <Text variant="h2" accessibilityRole="header" style={{ color: colors.textPrimary }}>Курсы</Text>
              </View>

              <View style={styles.drawerBody}>
                <FlatList
                  style={styles.drawerList}
                  contentContainerStyle={styles.drawerListContent}
                  showsVerticalScrollIndicator={false}
                  onScrollBeginDrag={onDismissCourseMenu}
                  data={courses}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  ListHeaderComponent={listHeader}
                  ListEmptyComponent={listEmpty}
                />
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  flex1: {
    flex: 1,
  },
  semibold: {
    fontWeight: '600',
  },
  noLetterSpacing: {
    letterSpacing: 0,
  },
  pressed: {
    opacity: 0.85,
  },
  modalContainer: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  // Панель без тени: её отделяет затемнение и граница (в тёмной теме тени не используем)
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    borderRightWidth: 1,
    borderTopRightRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
    overflow: 'hidden',
    paddingHorizontal: spacing.m,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.m,
  },
  drawerBody: {
    gap: spacing.m,
    flex: 1,
  },
  listHeader: {
    gap: spacing.xs,
    marginBottom: spacing.m,
  },
  listHeaderButtons: {
    gap: spacing.xs,
  },
  newCourseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: heights.button,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  newCourseInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    minHeight: heights.button,
    paddingHorizontal: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  courseInput: {
    flex: 1,
    fontFamily: typography.body.fontFamily,
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  editCourseInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: heights.input,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drawerList: {
    flex: 1,
  },
  drawerListContent: {
    paddingBottom: spacing.xl,
    gap: spacing.xs,
  },
  courseItem: {
    padding: spacing.m,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    borderLeftWidth: 4,
    marginBottom: spacing.xs,
  },
  courseItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  courseItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1,
  },
  courseMoreButton: {
    width: heights.touch,
    height: heights.touch,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  curtain: {
    overflow: 'hidden',
  },
  curtainInner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: spacing.s,
    paddingTop: spacing.m,
  },
  curtainButtonWrap: {
    flex: 1,
  },
  curtainButton: {
    minHeight: 56,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.s,
  },
  drawerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
});
