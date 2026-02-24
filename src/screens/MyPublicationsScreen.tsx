/**
 * My Publications Screen
 * @description List of user's published sets with stats and management
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useSettingsStore, useLibraryStore } from '@/store';
import { spacing, borderRadius, getCategoryLabel, formatCount, formatRelativeTime } from '@/constants';
import { ArrowLeft, RefreshCw, EyeOff, BookOpen } from 'lucide-react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { supabase } from '@/services/supabaseClient';
import type { RootStackScreenProps } from '@/types/navigation';
import type { LibrarySet } from '@/types/library';

type Props = RootStackScreenProps<'MyPublications'>;

export function MyPublicationsScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = theme === 'dark';

  const { myPublications, fetchMyPublications, unpublishSet, updatePublication } = useLibraryStore();

  const [userId, setUserId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      setUserId(uid);
      if (uid) {
        fetchMyPublications(uid).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });
  }, []);

  const handleUpdate = useCallback(async (librarySetId: string) => {
    if (!userId) return;
    setUpdatingId(librarySetId);
    try {
      await updatePublication(userId, librarySetId);
      await fetchMyPublications(userId);
      Alert.alert('Готово', 'Публикация обновлена');
    } catch (err) {
      Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось обновить');
    } finally {
      setUpdatingId(null);
    }
  }, [userId, updatePublication, fetchMyPublications]);

  const handleUnpublish = useCallback((librarySetId: string) => {
    Alert.alert(
      'Снять с публикации',
      'Набор будет удалён из библиотеки. Продолжить?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Снять',
          style: 'destructive',
          onPress: async () => {
            if (!userId) return;
            try {
              await unpublishSet(userId, librarySetId);
              Alert.alert('Готово', 'Публикация снята');
            } catch (err) {
              Alert.alert('Ошибка', err instanceof Error ? err.message : 'Не удалось снять');
            }
          },
        },
      ]
    );
  }, [userId, unpublishSet]);

  const renderItem = useCallback(({ item }: { item: LibrarySet }) => {
    const avgRating = item.rating_count > 0
      ? Math.round((item.rating_sum / item.rating_count) * 10) / 10
      : null;
    const isArchived = item.status === 'archived';
    const isUpdating = updatingId === item.id;

    return (
      <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.cardHeader}>
          <View style={[s.emojiBox, { backgroundColor: colors.primary + '15' }]}>
            <Text style={s.emoji}>{item.cover_emoji || '📚'}</Text>
          </View>
          <View style={s.cardInfo}>
            <Text style={[s.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={s.statusRow}>
              <View style={[s.statusBadge, { backgroundColor: isArchived ? '#EF4444' + '15' : '#10B981' + '15' }]}>
                <Text style={[s.statusText, { color: isArchived ? '#EF4444' : '#10B981' }]}>
                  {isArchived ? 'Архивный' : 'Опубликован'}
                </Text>
              </View>
              <Text style={[s.dateText, { color: colors.textTertiary }]}>
                {formatRelativeTime(item.published_at)}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Ionicons name="download-outline" size={16} color={colors.textTertiary} />
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{formatCount(item.imports_count)}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>импортов</Text>
          </View>
          <View style={s.statItem}>
            <Ionicons name="heart-outline" size={16} color={colors.textTertiary} />
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{formatCount(item.likes_count)}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>лайков</Text>
          </View>
          {avgRating !== null && (
            <View style={s.statItem}>
              <Ionicons name="star" size={16} color="#FACC15" />
              <Text style={[s.statValue, { color: colors.textPrimary }]}>{avgRating}</Text>
              <Text style={[s.statLabel, { color: colors.textTertiary }]}>рейтинг</Text>
            </View>
          )}
          <View style={s.statItem}>
            <Ionicons name="layers-outline" size={16} color={colors.textTertiary} />
            <Text style={[s.statValue, { color: colors.textPrimary }]}>{item.cards_count}</Text>
            <Text style={[s.statLabel, { color: colors.textTertiary }]}>карт</Text>
          </View>
        </View>

        {/* Actions */}
        {!isArchived && (
          <View style={s.actionsRow}>
            <Pressable
              style={[s.actionBtn, { backgroundColor: colors.primary + '10', borderColor: colors.primary + '33' }]}
              onPress={() => handleUpdate(item.id)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <RefreshCw size={16} color={colors.primary} />
                  <Text style={[s.actionBtnText, { color: colors.primary }]}>Обновить</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[s.actionBtn, { backgroundColor: '#EF4444' + '08', borderColor: '#EF4444' + '33' }]}
              onPress={() => handleUnpublish(item.id)}
            >
              <EyeOff size={16} color="#EF4444" />
              <Text style={[s.actionBtnText, { color: '#EF4444' }]}>Снять</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  }, [colors, updatingId, handleUpdate, handleUnpublish]);

  return (
    <Container padded={false} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: colors.border }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="h3" style={{ color: colors.textPrimary }}>Мои публикации</Text>
        <View style={s.headerIcon} />
      </View>

      {loading ? (
        <View style={s.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : myPublications.length === 0 ? (
        <View style={s.centerContainer}>
          <BookOpen size={48} color={colors.textTertiary} />
          <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>Вы ещё ничего не публиковали</Text>
          <Text style={[s.emptySubtitle, { color: colors.textTertiary }]}>
            Поделитесь своими наборами карточек с другими пользователями
          </Text>
          <Pressable
            style={[s.goLibraryBtn, { backgroundColor: colors.primary }]}
            onPress={() => {
              navigation.goBack();
              // Navigate to Library tab
              navigation.navigate('Main' as any, { screen: 'Library' });
            }}
          >
            <Text style={s.goLibraryBtnText}>Перейти в библиотеку</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={myPublications}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Container>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.s, paddingVertical: spacing.s, borderBottomWidth: 1 },
  headerIcon: { width: 40, height: 40, borderRadius: borderRadius.full, alignItems: 'center', justifyContent: 'center' },
  centerContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.m, paddingHorizontal: spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
  goLibraryBtn: { paddingHorizontal: spacing.l, paddingVertical: spacing.s, borderRadius: borderRadius.l, marginTop: spacing.s },
  goLibraryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  list: { padding: spacing.m, gap: spacing.m, paddingBottom: spacing.xxl },
  card: { borderRadius: borderRadius.xl, borderWidth: 1, padding: spacing.m, gap: spacing.m },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  emojiBox: { width: 48, height: 48, borderRadius: borderRadius.l, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 24 },
  cardInfo: { flex: 1, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.s },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.s },
  statusText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: spacing.m },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 14, fontWeight: '700' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  actionsRow: { flexDirection: 'row', gap: spacing.s },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.s, borderRadius: borderRadius.l, borderWidth: 1 },
  actionBtnText: { fontSize: 13, fontWeight: '700' },
});
