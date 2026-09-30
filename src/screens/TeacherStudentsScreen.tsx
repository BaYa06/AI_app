/**
 * Teacher Students Screen
 * @description Список учеников курса для учителя
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  BackHandler,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Modal,
  Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, AlertTriangle, Plus, Trash2, X, Flame, Search } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, borderRadius, alpha, iconSize } from '@/constants';
import { toast } from '@/components/ui';
import { NeonService } from '@/services/NeonService';
import { supabase } from '@/services/supabaseClient';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherStudents'>;

// ==================== TYPES ====================

type StudentStatus = 'online' | 'away' | 'offline' | 'inactive';

interface Student {
  id: string;
  name: string;
  initials: string;
  status: StudentStatus;
  streak: number;
  lastActivity: string;
  lastActivityColor: string;
  todayCards: number;
  /** Слова курса, которым пришло время повторения */
  waitingReviews: number;
}

type FilterKey = 'all' | 'active' | 'away3d' | 'away7d';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',    label: 'Все' },
  { key: 'active', label: 'Активные' },
  { key: 'away3d', label: 'Не заходили 3д' },
  { key: 'away7d', label: 'Не заходили 7д+' },
];

// ==================== HELPERS ====================

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getStudentStatus(lastActiveDate: string | null): StudentStatus {
  if (!lastActiveDate) return 'inactive';
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 1) return 'online';
  if (diffDays <= 2) return 'away';
  if (diffDays <= 6) return 'offline';
  return 'inactive';
}

function formatLastActivity(lastActiveDate: string | null, colors: ReturnType<typeof useThemeColors>): { text: string; color: string } {
  if (!lastActiveDate) return { text: 'Нет активности', color: colors.textTertiary };
  const now = new Date();
  const last = new Date(lastActiveDate + 'T12:00:00Z');
  const diffDays = Math.round((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return { text: 'Сегодня', color: colors.successText };
  if (diffDays === 1) return { text: 'Вчера', color: colors.warningText };
  if (diffDays <= 6) return { text: `${diffDays} дн. назад`, color: colors.errorText };
  if (diffDays < 30) return { text: `${diffDays} дн. назад`, color: colors.textTertiary };
  const weeks = Math.floor(diffDays / 7);
  if (weeks < 5) return { text: `${weeks} нед. назад`, color: colors.textTertiary };
  const months = Math.floor(diffDays / 30);
  return { text: `${months} мес. назад`, color: colors.textTertiary };
}

function pluralCards(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return 'карточек';
  if (mod10 === 1) return 'карточка';
  if (mod10 >= 2 && mod10 <= 4) return 'карточки';
  return 'карточек';
}

// ==================== STUDENT ROW ====================

function StudentRow({ student, colors, onPress, onRemove }: {
  student: Student;
  colors: any;
  onPress: () => void;
  onRemove: () => void;
}) {
  const isInactive = student.status === 'inactive';
  const dotColor = student.lastActivityColor;

  const avatarBg = isInactive
    ? (colors.surfaceMuted)
    : alpha(colors.primary, 20);
  const avatarTextColor = isInactive
    ? (colors.textSecondary)
    : colors.primary;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          opacity: pressed ? 0.7 : isInactive ? 0.7 : 1,
        },
      ]}
    >
      {/* Avatar */}
      <View style={styles.avatarContainer}>
        <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
          <Text style={[styles.avatarText, { color: avatarTextColor }]}>
            {student.initials}
          </Text>
        </View>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: dotColor, borderColor: colors.background },
          ]}
        />
      </View>

      {/* Info */}
      <View style={styles.rowInfo}>
        <View style={styles.rowNameRow}>
          <Text
            style={[
              styles.rowName,
              { color: isInactive ? colors.textSecondary : colors.textPrimary },
            ]}
            numberOfLines={1}
          >
            {student.name}
          </Text>
          {student.streak > 0 && (
            <View style={[styles.streakBadge, { backgroundColor: alpha(colors.streak, 10) }]}>
              <Flame size={iconSize.xs} color={colors.streak} />
              <Text style={[styles.streakText, { color: colors.warningText }]}>{student.streak}</Text>
            </View>
          )}
        </View>
        <View style={styles.rowMetaRow}>
          <Text style={[styles.rowMeta, { color: student.lastActivityColor }]}>
            {student.lastActivity}
          </Text>
          {student.todayCards > 0 && (
            <View style={[styles.cardsBadge, { backgroundColor: alpha(colors.success, 10) }]}>
              <Text style={[styles.cardsBadgeText, { color: colors.successText }]}>
                {student.todayCards} {pluralCards(student.todayCards)}
              </Text>
            </View>
          )}
          {student.waitingReviews > 0 && (
            <View style={[styles.cardsBadge, { backgroundColor: alpha(colors.warning, 10) }]}>
              <Text style={[styles.cardsBadgeText, { color: colors.warningText }]}>
                {student.waitingReviews} ждут повторения
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Remove button */}
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Удалить ученика"
        onPress={onRemove}
        activeOpacity={0.6}
        hitSlop={8}
        style={[
          styles.removeBtn,
          { backgroundColor: alpha(colors.error, 10) },
        ]}
      >
        <Trash2 size={16} color={colors.error} />
      </TouchableOpacity>
    </Pressable>
  );
}

// ==================== SCREEN ====================

export function TeacherStudentsScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Владение курсом — null пока не проверено. Список учеников грузится только после
  // подтверждения, чтобы не было гонки "сначала данные, потом дверь" (см. план, пункт 21).
  const [isOwner, setIsOwner] = useState<boolean | null>(null);

  // Кнопка "Добавить" в шапке раньше не делала вообще ничего (см. план, пункт 30) — теперь
  // открывает код приглашения, тем же способом (createCourseInvite/regenerateCourseInvite),
  // что уже используется на Home-экране для приглашения учеников в курс.
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteJoinCode, setInviteJoinCode] = useState<string | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const openInviteModal = useCallback(async () => {
    setInviteModalOpen(true);
    setInviteCopied(false);
    setInviteJoinCode(null);
    setInviteLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id;
      const result = userId
        ? await NeonService.createCourseInvite(route.params.courseId, userId)
        : null;
      setInviteJoinCode(result?.joinCode ?? null);
    } catch (e) {
      console.error('Failed to create invite:', e);
    } finally {
      setInviteLoading(false);
    }
  }, [route.params.courseId]);

  const handleRegenerateInvite = useCallback(async () => {
    setInviteCopied(false);
    setInviteLoading(true);
    try {
      const result = await NeonService.regenerateCourseInvite(route.params.courseId);
      setInviteJoinCode(result?.joinCode ?? null);
    } catch (e) {
      console.error('Failed to regenerate invite:', e);
    } finally {
      setInviteLoading(false);
    }
  }, [route.params.courseId]);

  const handleCopyInviteCode = useCallback(() => {
    if (!inviteJoinCode) return;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(inviteJoinCode);
    } else {
      Clipboard.setString(inviteJoinCode);
    }
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }, [inviteJoinCode]);

  // Дёргается кнопкой "Повторить" при ошибке загрузки — простой способ заставить эффект ниже
  // перезапуститься, не вынося саму загрузку в отдельную функцию.
  const [retryTick, setRetryTick] = useState(0);

  // Загрузка реальных участников — только после подтверждения владения курсом.
  // useFocusEffect вместо обычного useEffect — список перезагружается при каждом возврате на
  // экран, а не только один раз при первом открытии. См. план, пункт 33.
  useFocusEffect(
    useCallback(() => {
      if (!isOwner) return;
      let mounted = true;
      setLoading(true);
      setLoadError(false);
      NeonService.loadCourseMembers(route.params.courseId)
        .then((members) => {
          if (!mounted) return;
          setStudents(
            members.map((m) => {
              const status = getStudentStatus(m.lastActiveDate);
              const activity = formatLastActivity(m.lastActiveDate, colors);
              return {
                id: m.id,
                name: m.displayName,
                initials: getInitials(m.displayName),
                status,
                streak: m.streak,
                lastActivity: activity.text,
                lastActivityColor: activity.color,
                todayCards: m.todayCards,
                waitingReviews: m.waitingReviews,
              };
            }),
          );
        })
        .catch((e) => {
          console.error('Failed to load members:', e);
          if (mounted) setLoadError(true);
        })
        .finally(() => { if (mounted) setLoading(false); });
      return () => { mounted = false; };
    }, [isOwner, route.params.courseId, retryTick]),
  );

  useEffect(() => {
    let mounted = true;
    const checkOwnership = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId || !NeonService.isEnabled()) {
          // Проверить нечем (не авторизован / Neon не сконфигурирован) — не блокируем, как и раньше.
          if (mounted) setIsOwner(true);
          return;
        }
        const owner = await NeonService.isCourseOwner(route.params.courseId, userId);
        if (!mounted) return;
        if (!owner) {
          navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main' as any);
          return;
        }
        setIsOwner(true);
      } catch {
        if (mounted) {
          navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main' as any);
        }
      }
    };
    checkOwnership();
    return () => { mounted = false; };
  }, [route.params.courseId]);

  const filtered = useMemo(() => {
    let list = students;

    // Filter by tab
    if (activeFilter === 'active') {
      list = list.filter((s) => s.status === 'online' || s.status === 'away');
    } else if (activeFilter === 'away3d') {
      list = list.filter((s) => s.status === 'offline');
    } else if (activeFilter === 'away7d') {
      list = list.filter((s) => s.status === 'inactive');
    }

    // Filter by search
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((s) => s.name.toLowerCase().includes(q));
    }

    return list;
  }, [query, activeFilter, students]);

  // «Напомнить повторить» (план §3.8): пуш ученикам с просроченными словами, всему классу — раз в сутки
  const [reminding, setReminding] = useState(false);
  const studentsWaiting = students.filter((st) => st.waitingReviews > 0).length;
  const handleRemindAll = useCallback(async () => {
    if (reminding) return;
    setReminding(true);
    const result = await NeonService.remindCourseReview(route.params.courseId);
    setReminding(false);
    if (result === 'rate_limited') {
      toast.info('Уже напомнили: классу можно напоминать не чаще раза в сутки');
    } else if (!result) {
      toast.error('Не получилось. Проверь соединение и попробуй ещё раз');
    } else {
      toast.success(`Напоминание отправлено: ученикам с уведомлениями ${result.sent} из ${result.students}`);
    }
  }, [reminding, route.params.courseId]);

  const handleRemoveStudent = useCallback(async (student: Student) => {
    const confirmed = Platform.OS === 'web'
      ? window.confirm(`Удалить ученика?\n${student.name} больше не будет иметь доступ к курсу`)
      : await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Удалить ученика?',
            `${student.name} больше не будет иметь доступ к курсу`,
            [
              { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Удалить', style: 'destructive', onPress: () => resolve(true) },
            ],
          ),
        );

    if (!confirmed) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const success = await NeonService.removeStudentFromCourse(
        route.params.courseId,
        student.id,
        session.user.id,
      );

      if (success) {
        setStudents(prev => prev.filter(s => s.id !== student.id));
      } else {
        if (Platform.OS === 'web') window.alert('Не удалось удалить ученика');
        else toast.error('Не удалось удалить ученика');
      }
    } catch {
      if (Platform.OS === 'web') window.alert('Не удалось удалить ученика');
      else toast.error('Не удалось удалить ученика');
    }
  }, [route.params.courseId]);

  const inputBg = colors.surfaceMuted;
  const pillActiveBg = colors.primary;
  const pillInactiveBg = colors.surfaceMuted;

  const navigateBackToTeacher = useCallback(() => {
    navigation.reset({
      index: 1,
      routes: [
        { name: 'Main' },
        {
          name: 'TeacherCourseStats',
          params: {
            courseId: route.params.courseId,
            courseTitle: route.params.courseTitle,
          },
        },
      ],
    });
  }, [navigation, route.params.courseId, route.params.courseTitle]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'android') {
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
          navigateBackToTeacher();
          return true;
        });
        return () => subscription.remove();
      }

      if (Platform.OS === 'web') {
        const handler = (e: PopStateEvent) => {
          e.stopImmediatePropagation();
          navigateBackToTeacher();
        };
        window.addEventListener('popstate', handler, true);
        return () => window.removeEventListener('popstate', handler, true);
      }

      return undefined;
    }, [navigateBackToTeacher]),
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View
        style={[
          styles.header,
          {
            paddingTop: 12,
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            ...Platform.select({ web: { backdropFilter: 'blur(12px)' } }) as any,
          },
        ]}
      >
        {/* Left: back + title */}
        <View style={styles.headerLeft}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Назад"
            onPress={() => {
              const target = {
                name: 'TeacherCourseStats' as const,
                params: {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                },
              };

              if (Platform.OS === 'web') {
                navigation.reset({ index: 1, routes: [{ name: 'Main' }, target] });
                return;
              }

              if (navigation.canGoBack()) {
                navigation.goBack();
              } else {
                navigation.reset({ index: 1, routes: [{ name: 'Main' }, target] });
              }
            }}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleRow}>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Ученики</Text>
            <View style={[styles.countBadge, { backgroundColor: colors.surfaceMuted }]}>
              <Text style={[styles.countBadgeText, { color: colors.textSecondary }]}>
                {filtered.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Right: add button */}
        <Pressable
          style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
          onPress={openInviteModal}
        >
          <Plus size={20} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>Добавить</Text>
        </Pressable>
      </View>

      {/* ── Search + Filters ── */}
      <View style={styles.searchSection}>
        {/* Search input */}
        <View style={[styles.searchBar, { backgroundColor: inputBg }]}>
          <Search size={iconSize.xs} color={colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск..."
            placeholderTextColor={colors.textTertiary}
            style={[styles.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* Filter pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.pillsRow}
        >
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <Pressable
                key={f.key}
                onPress={() => setActiveFilter(f.key)}
                style={[
                  styles.pill,
                  { backgroundColor: active ? pillActiveBg : pillInactiveBg },
                ]}
              >
                <Text
                  style={[
                    styles.pillText,
                    { color: active ? colors.onPrimary : colors.textSecondary },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Student List ── */}
      {loading ? (
        <View style={styles.empty}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : loadError ? (
        // Раньше сетевая ошибка выглядела так же, как "пока нет учеников" — отдельное
        // состояние с кнопкой "Повторить". См. план, пункт 29.
        <View style={styles.empty}>
          <AlertTriangle size={32} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textPrimary, marginTop: spacing.s }]}>
            Не удалось загрузить учеников
          </Text>
          <Pressable
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
            onPress={() => setRetryTick((t) => t + 1)}
          >
            <Text style={[styles.retryBtnText, { color: colors.onPrimary }]}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={
            studentsWaiting > 0 ? (
              <View style={[styles.remindBanner, { backgroundColor: alpha(colors.warning, 10) }]}>
                <Text style={[styles.remindText, { color: colors.textPrimary }]}>
                  У {studentsWaiting} {studentsWaiting === 1 ? 'ученика' : 'учеников'} есть слова к повторению
                </Text>
                <Pressable
                  onPress={handleRemindAll}
                  disabled={reminding}
                  style={[styles.remindBtn, { backgroundColor: colors.primary, opacity: reminding ? 0.6 : 1 }]}
                >
                  <Text style={[styles.remindBtnText, { color: colors.onPrimary }]}>Напомнить</Text>
                </Pressable>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <StudentRow
              student={item}
              colors={colors}
              onPress={() =>
                navigation.navigate('StudentDetail', {
                  courseId: route.params.courseId,
                  courseTitle: route.params.courseTitle,
                  studentId: item.id,
                  studentName: item.name,
                  studentInitials: item.initials,
                  streak: item.streak,
                  todayCards: item.todayCards,
                  lastActivity: item.lastActivity,
                })
              }
              onRemove={() => handleRemoveStudent(item)}
            />
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                {students.length === 0 ? 'Пока нет учеников' : 'Ученики не найдены'}
              </Text>
            </View>
          }
        />
      )}

      {/* ── Invite Modal ── */}
      <Modal visible={inviteModalOpen} transparent animationType="fade" onRequestClose={() => setInviteModalOpen(false)}>
        <Pressable style={[styles.modalOverlay, { backgroundColor: colors.overlay }]} onPress={() => setInviteModalOpen(false)}>
          <Pressable
            style={[styles.inviteCard, { backgroundColor: colors.background }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.inviteHeader}>
              <Text style={[styles.inviteTitle, { color: colors.textPrimary }]}>Пригласить ученика</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Закрыть" onPress={() => setInviteModalOpen(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[styles.inviteDescription, { color: colors.textSecondary }]}>
              Отправь код ученику — он введёт его в приложении, чтобы присоединиться к курсу
            </Text>
            {inviteLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.l }} />
            ) : inviteJoinCode ? (
              <>
                <View style={[styles.inviteCodeBox, { backgroundColor: colors.surfaceMuted }]}>
                  <Text style={[styles.inviteCodeText, { color: colors.primary }]}>{inviteJoinCode}</Text>
                </View>
                <Pressable
                  style={[styles.inviteActionBtn, { backgroundColor: colors.primary }]}
                  onPress={handleCopyInviteCode}
                >
                  <Text style={[styles.inviteActionBtnText, { color: colors.onPrimary }]}>
                    {inviteCopied ? '✓ Скопировано' : 'Копировать код'}
                  </Text>
                </Pressable>
                <Pressable onPress={handleRegenerateInvite} style={{ marginTop: spacing.s }}>
                  <Text style={[styles.inviteRegenerateText, { color: colors.textSecondary }]}>
                    Обновить код приглашения
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.inviteDescription, { color: colors.textSecondary, marginVertical: spacing.m }]}>
                Не удалось создать приглашение
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    flex: 1,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // Search + Filters
  searchSection: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
    paddingBottom: spacing.s,
    gap: spacing.m,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.l,
    paddingHorizontal: spacing.m,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    gap: spacing.s,
  },
  searchIcon: {
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    padding: 0,
    margin: 0,
  },
  pillsRow: {
    gap: spacing.s,
    paddingBottom: 4,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  pillText: {
    fontSize: 14,
    fontWeight: '600',
  },

  // List row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: spacing.m,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusDot: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 12,
    height: 12,
    borderRadius: borderRadius.s,
    borderWidth: 2,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
  },
  rowName: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  streakBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.s,
  },
  streakText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '600',
  },
  cardsBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: borderRadius.s,
  },
  cardsBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.s,
  },

  // Empty
  empty: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: spacing.m,
    paddingHorizontal: spacing.l,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  remindBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: borderRadius.m,
  },
  remindText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  remindBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    justifyContent: 'center',
  },
  remindBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },

  // Invite modal
  modalOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.l,
  },
  inviteCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: borderRadius.l,
    padding: spacing.l,
    gap: spacing.s,
  },
  inviteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inviteTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  inviteDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  inviteCodeBox: {
    borderRadius: borderRadius.m,
    paddingVertical: spacing.l,
    alignItems: 'center',
    marginTop: spacing.s,
  },
  inviteCodeText: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 6,
  },
  inviteActionBtn: {
    marginTop: spacing.s,
    paddingVertical: 12,
    borderRadius: borderRadius.m,
    alignItems: 'center',
  },
  inviteActionBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  inviteRegenerateText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
