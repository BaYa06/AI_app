/**
 * Oral Test Lobby Screen
 * @description Экран выбора набора для устного теста
 */
import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Mic, Check } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSetsStore, useCardsStore } from '@/store';
import { spacing, borderRadius, alpha } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';
import { toast } from '@/components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'OralTestLobby'>;

export function OralTestLobbyScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();

  const sets = useSetsStore((s) => s.getSetsByCourse(route.params.courseId));
  const [selectedSetId, setSelectedSetId] = useState<string>(sets[0]?.id ?? '');

  const cardBg = colors.surface;
  const cardBorder = colors.border;

  function handleStart() {
    if (!selectedSetId) return;
    const cards = useCardsStore.getState().getCardsBySet(selectedSetId);
    if (cards.length === 0) {
      toast.info('Нет карточек: в этом наборе их пока нет');
      return;
    }
    const shuffled = [...cards].sort(() => Math.random() - 0.5);
    const selectedSet = sets.find((s) => s.id === selectedSetId);
    navigation.navigate('OralTestSession', {
      courseId: route.params.courseId,
      courseTitle: route.params.courseTitle,
      setId: selectedSetId,
      setTitle: selectedSet?.title ?? '',
      cardIds: shuffled.map((c) => c.id),
    });
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            paddingTop: 12,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Назад"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Устный тренажёр
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: alpha(colors.streak, 10) }]}>
            <Mic size={32} color={colors.streak} />
          </View>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Устный тренажёр
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Ученик произносит перевод вслух,{'\n'}учитель свайпом отмечает результат.{'\n'}Это тренировка — результат нигде не сохраняется.
          </Text>
        </View>

        {/* Set list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Выбери набор карточек
          </Text>

          {sets.length === 0 ? (
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Нет доступных наборов
            </Text>
          ) : (
            <View style={[styles.setList, { backgroundColor: cardBg, borderColor: cardBorder }]}>
              {sets.map((set, idx) => {
                const active = set.id === selectedSetId;
                return (
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
                    key={set.id}
                    onPress={() => setSelectedSetId(set.id)}
                    style={({ pressed }) => [
                      styles.setItem,
                      active && { backgroundColor: alpha(colors.streak, 10) },
                      idx < sets.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: cardBorder,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.setItemLeft}>
                      {active ? (
                        <Check size={18} color={colors.streak} strokeWidth={3} />
                      ) : (
                        <View style={styles.emptyCheck} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.setTitle,
                            { color: active ? colors.streak : colors.textPrimary },
                          ]}
                          numberOfLines={1}
                        >
                          {set.title}
                        </Text>
                        <Text style={[styles.setMeta, { color: colors.textSecondary }]}>
                          {set.cardCount} сл.
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Footer CTA */}
      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + 16,
            ...Platform.select({
              web: {
                background: `linear-gradient(to top, ${colors.background} 60%, transparent)`,
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <Pressable accessibilityRole="button"
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: !selectedSetId ? colors.textSecondary : colors.streak },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          disabled={!selectedSetId}
          onPress={handleStart}
        >
          <Mic size={20} color={colors.onPrimary} />
          <Text style={[styles.ctaText, { color: colors.onPrimary }]}>Начать тренировку</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginLeft: spacing.m,
    flex: 1,
  },
  scroll: {
    padding: spacing.m,
    gap: 28,
  },
  hero: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: spacing.m,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.l,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  heroSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    gap: spacing.s,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 20,
  },
  setList: {
    borderRadius: borderRadius.l,
    borderWidth: 1,
    overflow: 'hidden',
  },
  setItem: {
    paddingVertical: 14,
    paddingHorizontal: spacing.m,
  },
  setItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  emptyCheck: {
    width: 18,
    height: 18,
  },
  setTitle: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  setMeta: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.l,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: borderRadius.l,
    gap: 8,
    
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
