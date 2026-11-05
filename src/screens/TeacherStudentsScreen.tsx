/**
 * Teacher Students Screen
 * @description Список учеников курса для учителя
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  FlatList,
  Pressable,
  Platform,
  BackHandler,
  ActivityIndicator,
  Alert,
  Clipboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { spacing, alpha } from '@/constants';
import { toast } from '@/components/ui';
import { NeonService } from '@/services/NeonService';
import { getSession } from '@/services/auth/session';
import type { RootStackParamList } from '@/types/navigation';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { log } from '@/utils/logger';
import { styles } from './teacherStudents/styles';
import {
  type Student,
  type FilterKey,
  getInitials,
  getStudentStatus,
  formatLastActivity,
  StudentRow,
} from './teacherStudents/helpers';
import { InviteCodeModal } from './teacherStudents/InviteCodeModal';
import { StudentsSearch } from './teacherStudents/StudentsSearch';
import { StudentsHeader } from './teacherStudents/StudentsHeader';

type Props = NativeStackScreenProps<RootStackParamList, 'TeacherStudents'>;

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
      const authSession = await getSession();
      const userId = authSession?.user?.id;
      const result = userId
        ? await NeonService.createCourseInvite(route.params.courseId, userId)
        : null;
      setInviteJoinCode(result?.joinCode ?? null);
    } catch (e) {
      log.error('TeacherStudents', 'Failed to create invite', e);
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
      log.error('TeacherStudents', 'Failed to regenerate invite', e);
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
            })
          );
        })
        .catch((e) => {
          log.error('TeacherStudents', 'Failed to load members', e);
          if (mounted) setLoadError(true);
        })
        .finally(() => {
          if (mounted) setLoading(false);
        });
      return () => {
        mounted = false;
      };
    }, [isOwner, route.params.courseId, retryTick])
  );

  useEffect(() => {
    let mounted = true;
    const checkOwnership = async () => {
      try {
        const authSession = await getSession();
        const userId = authSession?.user?.id;
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
    return () => {
      mounted = false;
    };
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
      toast.success(
        `Напоминание отправлено: ученикам с уведомлениями ${result.sent} из ${result.students}`
      );
    }
  }, [reminding, route.params.courseId]);

  const handleRemoveStudent = useCallback(
    async (student: Student) => {
      const confirmed =
        Platform.OS === 'web'
          ? window.confirm(`Удалить ученика?\n${student.name} больше не будет иметь доступ к курсу`)
          : await new Promise<boolean>((resolve) =>
              Alert.alert(
                'Удалить ученика?',
                `${student.name} больше не будет иметь доступ к курсу`,
                [
                  { text: 'Отмена', style: 'cancel', onPress: () => resolve(false) },
                  { text: 'Удалить', style: 'destructive', onPress: () => resolve(true) },
                ]
              )
            );

      if (!confirmed) return;

      try {
        const session = await getSession();
        if (!session?.user) return;

        const success = await NeonService.removeStudentFromCourse(
          route.params.courseId,
          student.id,
          session.user.id
        );

        if (success) {
          setStudents((prev) => prev.filter((s) => s.id !== student.id));
        } else {
          if (Platform.OS === 'web') window.alert('Не удалось удалить ученика');
          else toast.error('Не удалось удалить ученика');
        }
      } catch {
        if (Platform.OS === 'web') window.alert('Не удалось удалить ученика');
        else toast.error('Не удалось удалить ученика');
      }
    },
    [route.params.courseId]
  );

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
    }, [navigateBackToTeacher])
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <StudentsHeader
        colors={colors}
        filtered={filtered}
        navigation={navigation}
        route={route}
        openInviteModal={openInviteModal}
      />

      {/* ── Search + Filters ── */}
      <StudentsSearch
        colors={colors}
        inputBg={inputBg}
        pillActiveBg={pillActiveBg}
        pillInactiveBg={pillInactiveBg}
        query={query}
        setQuery={setQuery}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
      />

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
            accessibilityRole="button"
            style={[styles.retryBtn, { backgroundColor: colors.primaryFill }]}
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
                  У {studentsWaiting} {studentsWaiting === 1 ? 'ученика' : 'учеников'} есть слова к
                  повторению
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={handleRemindAll}
                  disabled={reminding}
                  style={[
                    styles.remindBtn,
                    { backgroundColor: colors.primaryFill, opacity: reminding ? 0.6 : 1 },
                  ]}
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
      <InviteCodeModal
        colors={colors}
        inviteModalOpen={inviteModalOpen}
        setInviteModalOpen={setInviteModalOpen}
        inviteJoinCode={inviteJoinCode}
        inviteLoading={inviteLoading}
        inviteCopied={inviteCopied}
        handleCopyInviteCode={handleCopyInviteCode}
        handleRegenerateInvite={handleRegenerateInvite}
      />
    </View>
  );
}
