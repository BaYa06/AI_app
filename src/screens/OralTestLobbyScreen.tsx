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
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Mic, Check } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore, useSetsStore, useCardsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'OralTestLobby'>;

export function OralTestLobbyScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const sets = useSetsStore((s) => s.getSetsByCourse(route.params.courseId));
  const [selectedSetId, setSelectedSetId] = useState<string>(sets[0]?.id ?? '');

  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB';

  function handleStart() {
    if (!selectedSetId) return;
    const cards = useCardsStore.getState().getCardsBySet(selectedSetId);
    if (cards.length === 0) {
      Alert.alert('Нет карточек', 'В этом наборе пока нет карточек.');
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
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          Орал тест
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={[styles.iconWrap, { backgroundColor: '#F97316' + '18' }]}>
            <Mic size={32} color="#F97316" />
          </View>
          <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>
            Устный опрос
          </Text>
          <Text style={[styles.heroSubtitle, { color: colors.textSecondary }]}>
            Студент произносит перевод вслух,{'\n'}учитель свайпом отмечает результат
          </Text>
        </View>

        {/* Set list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            Выберите набор карточек
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
                  <Pressable
                    key={set.id}
                    onPress={() => setSelectedSetId(set.id)}
                    style={({ pressed }) => [
                      styles.setItem,
                      active && { backgroundColor: '#F97316' + '10' },
                      idx < sets.length - 1 && {
                        borderBottomWidth: 1,
                        borderBottomColor: cardBorder,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <View style={styles.setItemLeft}>
                      {active ? (
                        <Check size={18} color="#F97316" strokeWidth={3} />
                      ) : (
                        <View style={styles.emptyCheck} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.setTitle,
                            { color: active ? '#F97316' : colors.textPrimary },
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
                background: isDark
                  ? 'linear-gradient(to top, #101122 60%, transparent)'
                  : 'linear-gradient(to top, #f6f6f8 60%, transparent)',
              },
            }) as any,
            backgroundColor: Platform.OS !== 'web' ? colors.background : undefined,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.ctaBtn,
            { backgroundColor: !selectedSetId ? colors.textSecondary : '#F97316' },
            pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
          ]}
          disabled={!selectedSetId}
          onPress={handleStart}
        >
          <Mic size={20} color="#FFFFFF" />
          <Text style={styles.ctaText}>Начать устный тест</Text>
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
    fontSize: 17,
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
    borderRadius: 18,
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
    fontSize: 17,
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
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  setMeta: {
    fontSize: 12,
    fontWeight: '500',
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
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(249,115,22,0.3)' },
    }) as any,
    shadowColor: '#F97316',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
