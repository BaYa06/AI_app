/**
 * Study Placeholder Screen
 * @description Заглушка для вкладки "Учёба"
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import Svg, { Circle, Path, Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

function StudyIllustration({ color, isDark }: { color: string; isDark: boolean }) {
  const bgTint = isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC';
  return (
    <View style={s.illustrationWrap}>
      <Svg width={200} height={160} viewBox="0 0 200 160">
        <Defs>
          <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.15" />
            <Stop offset="1" stopColor={color} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>
        {/* Background circle */}
        <Circle cx={100} cy={80} r={70} fill="url(#grad)" />
        {/* Book */}
        <Rect x={62} y={55} width={76} height={56} rx={6} fill={isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF'} stroke={color} strokeWidth={2} strokeOpacity={0.3} />
        <Path d="M100 55 L100 111" stroke={color} strokeWidth={1.5} strokeOpacity={0.2} />
        {/* Lines on left page */}
        <Rect x={72} y={68} width={20} height={3} rx={1.5} fill={color} opacity={0.25} />
        <Rect x={72} y={76} width={16} height={3} rx={1.5} fill={color} opacity={0.15} />
        <Rect x={72} y={84} width={22} height={3} rx={1.5} fill={color} opacity={0.2} />
        <Rect x={72} y={92} width={14} height={3} rx={1.5} fill={color} opacity={0.12} />
        {/* Lines on right page */}
        <Rect x={108} y={68} width={22} height={3} rx={1.5} fill={color} opacity={0.25} />
        <Rect x={108} y={76} width={18} height={3} rx={1.5} fill={color} opacity={0.15} />
        <Rect x={108} y={84} width={20} height={3} rx={1.5} fill={color} opacity={0.2} />
        {/* Sparkle top-right */}
        <Path d="M152 30 L155 38 L163 41 L155 44 L152 52 L149 44 L141 41 L149 38 Z" fill={color} opacity={0.3} />
        {/* Sparkle top-left */}
        <Path d="M52 22 L54 27 L59 29 L54 31 L52 36 L50 31 L45 29 L50 27 Z" fill={color} opacity={0.2} />
        {/* Small dots */}
        <Circle cx={40} cy={70} r={3} fill={color} opacity={0.1} />
        <Circle cx={165} cy={95} r={4} fill={color} opacity={0.12} />
        <Circle cx={55} cy={115} r={2.5} fill={color} opacity={0.08} />
      </Svg>
    </View>
  );
}

export function StudyPlaceholderScreen() {
  const colors = useThemeColors();
  const resolvedTheme = useSettingsStore((st) => st.resolvedTheme);
  const isDark = resolvedTheme === 'dark';

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';
  const chipBg = isDark ? colors.primary + '15' : colors.primary + '0D';

  return (
    <View style={[s.container, { backgroundColor: colors.background }]}>
      {/* Main card */}
      <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
        <StudyIllustration color={colors.primary} isDark={isDark} />

        <View style={[s.badge, { backgroundColor: chipBg }]}>
          <Text style={[s.badgeText, { color: colors.primary }]}>Скоро</Text>
        </View>

        <Text style={[s.title, { color: colors.textPrimary }]}>
          Режим обучения
        </Text>

        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          Мы работаем над интерактивным режимом обучения с умным повторением и адаптивными упражнениями.
        </Text>

        {/* Feature chips */}
        <View style={s.features}>
          {[
            { icon: '🧠', label: 'Умное повторение' },
            { icon: '🎯', label: 'Адаптивные тесты' },
            { icon: '⚡', label: 'Быстрые сессии' },
          ].map((f) => (
            <View key={f.label} style={[s.featureChip, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC', borderColor: cardBorder }]}>
              <Text style={s.featureIcon}>{f.icon}</Text>
              <Text style={[s.featureLabel, { color: colors.textSecondary }]}>{f.label}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom hint */}
      <Text style={[s.hint, { color: colors.textTertiary }]}>
        А пока используйте режимы из карточек наборов
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    padding: spacing.xl,
    alignItems: 'center',
  },
  illustrationWrap: {
    marginBottom: spacing.m,
  },
  badge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    marginBottom: spacing.m,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: spacing.l,
    paddingHorizontal: spacing.s,
  },
  features: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  featureChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  featureIcon: {
    fontSize: 14,
  },
  featureLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  hint: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: spacing.l,
    textAlign: 'center',
  },
});
