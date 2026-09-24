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
import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
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
import { spacing, borderRadius, getDeckAccentColor } from '@/constants';
import { triggerHaptic } from '@/utils/haptic';
import type { Course } from '@/types';
import { animateDrawerTo, clampTranslateX, resolveDrawerOpen } from './drawerAnimation';

type ThemeColors = ReturnType<typeof useThemeColors>;
type CourseStats = { setCount: number; cardCount: number; masteredPercent: number };
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

  return (
    <Pressable
      style={[
        styles.courseItem,
        isActive
          ? { borderLeftColor: courseAccent, backgroundColor: courseAccent + '1A' }
          : { borderLeftColor: colors.border },
        { borderColor: colors.border, position: 'relative' },
      ]}
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
            <BookOpen size={24} color={isActive ? courseAccent : colors.textPrimary} />
          ) : isActive ? (
            <FolderOpen size={24} color={courseAccent} />
          ) : (
            <Folder size={24} color={colors.textPrimary} />
          )}
          <View style={{ flex: 1 }}>
            {isEditing && !isStudent ? (
              <View style={styles.editRow}>
                <View
                  style={[
                    styles.editCourseInputContainer,
                    { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.primary },
                  ]}
                >
                  <Folder size={18} color={colors.primary} />
                  <TextInput
                    ref={editInputRef}
                    style={[styles.editCourseInput, { color: colors.textPrimary }]}
                    placeholder="Course name..."
                    placeholderTextColor={colors.textSecondary}
                    value={editingTitle}
                    onChangeText={onChangeEditingTitle}
                    autoFocus
                    selectTextOnFocus
                    maxLength={255}
                    onSubmitEditing={() => onSaveEditingTitle(course.id)}
                  />
                </View>
                <View style={styles.editActions}>
                  <Pressable style={styles.iconCircle} onPress={() => onSaveEditingTitle(course.id)}>
                    <CheckCircle size={18} color={colors.success} />
                  </Pressable>
                  <Pressable style={styles.iconCircle} onPress={onCancelEditingTitle}>
                    <X size={18} color={colors.textSecondary} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={[styles.courseTitle, { color: isActive ? courseAccent : colors.textPrimary }]}>
                {course.title}
              </Text>
            )}
            {isStudent && course.teacherName ? (
              <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>{course.teacherName}</Text>
            ) : (
              <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                {stats.setCount} sets • {stats.cardCount} cards • {stats.masteredPercent}% mastered
              </Text>
            )}
          </View>
        </View>
        <Pressable
          style={styles.courseMoreButton}
          onPress={(e) => {
            e.stopPropagation();
            onToggleMenu(course.id);
          }}
        >
          <MoreHorizontal size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {isMenuOpen && (
        <View
          style={[
            styles.courseMenu,
            { backgroundColor: colors.surface, borderColor: colors.border, shadowColor: colors.textPrimary },
          ]}
        >
          {isStudent ? (
            <Pressable
              style={({ pressed }) => [styles.courseMenuItem, pressed && { backgroundColor: colors.border }]}
              onPress={(e) => {
                e.stopPropagation();
                onOpenLeaveModal(course.id);
              }}
            >
              <LogOut size={16} color={colors.error} style={{ marginRight: spacing.s }} />
              <Text style={[styles.courseMenuText, { color: colors.error }]}>Выйти из курса</Text>
            </Pressable>
          ) : (
            <>
              {isTeacher && (
                <Pressable
                  style={({ pressed }) => [styles.courseMenuItem, pressed && { backgroundColor: colors.border }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    onOpenInvite(course.id);
                  }}
                >
                  <UserPlus size={16} color={colors.primary} style={{ marginRight: spacing.s }} />
                  <Text style={[styles.courseMenuText, { color: colors.primary }]}>Добавить</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.courseMenuItem, pressed && { backgroundColor: colors.border }]}
                onPress={(e) => {
                  e.stopPropagation();
                  onOpenEditModal(course.id, course.title);
                }}
              >
                <Edit2 size={16} color={colors.textPrimary} style={{ marginRight: spacing.s }} />
                <Text style={[styles.courseMenuText, { color: colors.textPrimary }]}>Rename</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.courseMenuItem, pressed && { backgroundColor: colors.border }]}
                onPress={(e) => {
                  e.stopPropagation();
                  onOpenDeleteModal(course.id);
                }}
              >
                <Trash2 size={16} color={colors.error} style={{ marginRight: spacing.s }} />
                <Text style={[styles.courseMenuText, { color: colors.error }]}>Delete</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </Pressable>
  );
});

export interface CoursesDrawerProps {
  mounted: boolean;
  translateX: SharedValue<number>;
  drawerWidth: number;
  onGestureSettled: (open: boolean) => void;

  colors: ThemeColors;
  isDarkMode: boolean;
  drawerBackground: string;
  drawerBorder: string;
  backdropColor: string;
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
    isDarkMode,
    drawerBackground,
    drawerBorder,
    backdropColor,
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
    <View style={{ gap: spacing.xs, marginBottom: spacing.m }}>
      {isCreatingCourse ? (
        <View
          style={[
            styles.newCourseInputContainer,
            { backgroundColor: colors.surfaceVariant || colors.border, borderColor: colors.primary },
          ]}
        >
          <Folder size={18} color={colors.primary} />
          <TextInput
            ref={newCourseInputRef}
            style={[styles.newCourseInput, { color: colors.textPrimary }]}
            placeholder="Course name..."
            placeholderTextColor={colors.textSecondary}
            value={newCourseTitle}
            onChangeText={onChangeNewCourseTitle}
            maxLength={255}
            onBlur={onSubmitNewCourse}
            onSubmitEditing={onSubmitNewCourse}
            autoFocus
          />
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Pressable
            style={[styles.newCourseButton, { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '33' }]}
            onPress={onStartCreatingCourse}
          >
            <Plus size={18} color={colors.primary} />
            <Text style={[styles.newCourseText, { color: colors.primary }]}>New course</Text>
          </Pressable>
          <Pressable
            style={[styles.newCourseButton, { backgroundColor: colors.primary + '1A', borderColor: colors.primary + '33' }]}
            onPress={onJoinByCode}
          >
            <UserPlus size={18} color={colors.primary} />
            <Text style={[styles.newCourseText, { color: colors.primary }]}>Войти по коду</Text>
          </Pressable>
        </View>
      )}

      {/* "All" item — всегда первым */}
      <Pressable
        style={[
          styles.courseItem,
          activeCourseId === null
            ? { borderLeftColor: colors.primary, backgroundColor: colors.primary + '0D' }
            : { borderLeftColor: colors.border },
          { borderColor: colors.border },
        ]}
        onPress={() => onSelectCourse(null)}
      >
        <View style={styles.courseItemHeader}>
          <View style={styles.courseItemLeft}>
            <Library size={24} color={activeCourseId === null ? colors.primary : colors.textPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.courseTitle, { color: activeCourseId === null ? colors.primary : colors.textPrimary }]}>
                All
              </Text>
              <Text style={[styles.courseMeta, { color: colors.textSecondary }]}>
                {allStats.setCount} sets • {allStats.cardCount} cards • {allStats.masteredPercent}% mastered
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );

  const listEmpty = courses.length === 0 ? (
    <View style={styles.drawerEmpty}>
      <Text style={[styles.drawerEmptyText, { color: colors.textSecondary }]}>
        Create a course to organize your sets
      </Text>
    </View>
  ) : null;

  if (!mounted) return null;

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onRequestClose}>
      {/* Модалка — отдельный нативный root; вложенный GestureHandlerRootView нужен,
          иначе Gesture.Pan() внутри Modal не работает надёжно, особенно на Android. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={styles.modalContainer}>
          <Animated.View style={[styles.backdrop, { backgroundColor: backdropColor }, backdropAnimStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={onBackdropPress} />
          </Animated.View>

          <GestureDetector gesture={panelGesture}>
            <Animated.View
              style={[
                styles.drawer,
                {
                  backgroundColor: drawerBackground,
                  borderColor: drawerBorder,
                  width: drawerWidth,
                  shadowOpacity: isDarkMode ? 0.35 : 0.2,
                  paddingTop: insets.top + spacing.m,
                  paddingBottom: insets.bottom + spacing.l,
                },
                panelAnimStyle,
              ]}
            >
              <View style={styles.drawerHeader}>
                <Text style={[styles.drawerTitle, { color: colors.textPrimary }]}>Courses</Text>
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
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
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 0 },
    shadowRadius: 8,
    // Android: тень через elevation, а не программный shadow* — дешевле на слабых устройствах.
    elevation: 12,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  drawerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  drawerBody: {
    gap: spacing.m,
    flex: 1,
  },
  newCourseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  newCourseText: {
    fontSize: 15,
    fontWeight: '600',
  },
  newCourseInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.m,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  newCourseInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  editCourseInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    borderRadius: borderRadius.l,
    borderWidth: 1,
  },
  editCourseInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingVertical: 0,
    ...Platform.select({ web: { outlineStyle: 'none' } }),
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
  },
  editActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#00000009',
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
  courseTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  courseMeta: {
    fontSize: 11,
    fontWeight: '500',
  },
  courseMoreButton: {
    padding: spacing.xs,
  },
  courseMenu: {
    position: 'absolute',
    top: spacing.s,
    right: spacing.s,
    borderWidth: 1,
    borderRadius: borderRadius.m,
    overflow: 'hidden',
    // @ts-ignore web shadow
    boxShadow: '0px 8px 20px rgba(0,0,0,0.12)',
    elevation: 6,
    zIndex: 10,
  },
  courseMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    minWidth: 140,
    zIndex: 11,
  },
  courseMenuText: {
    fontSize: 14,
    fontWeight: '600',
  },
  drawerEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.s,
  },
  drawerEmptyText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
