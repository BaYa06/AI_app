/**
 * Subscription Screen
 * @description Экран подписки Flashly Premium
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Zap,
  Infinity,
  Sparkles,
  FileDown,
  WifiOff,
  Ban,
} from 'lucide-react-native';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'Subscription'>;

type PlanKey = 'yearly' | 'monthly';

const BENEFITS = [
  { icon: Infinity, title: 'Безлимитные наборы', desc: 'Создавайте сколько угодно колод' },
  { icon: Sparkles, title: 'AI генерация', desc: 'Автоматическое создание карточек из текста' },
  { icon: FileDown, title: 'Экспорт в PDF', desc: 'Печатайте и делитесь карточками' },
  { icon: WifiOff, title: 'Офлайн режим', desc: 'Учитесь без интернета' },
  { icon: Ban, title: 'Без рекламы', desc: 'Никаких отвлекающих баннеров' },
];

const PLANS = [
  {
    key: 'yearly' as PlanKey,
    label: 'Годовой план',
    price: '2 490 ₽',
    period: '/ год',
    note: 'Лучшая цена: ~207 ₽/мес',
    badge: 'Скидка 30%',
  },
  {
    key: 'monthly' as PlanKey,
    label: 'Месячный план',
    price: '299 ₽',
    period: '/ месяц',
    note: null,
    badge: null,
  },
];

export function SubscriptionScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = theme === 'dark';

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('yearly');

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';
  const heroBg1 = isDark ? '#1e1b4b' : '#312e81';
  const heroBg2 = colors.primary;

  return (
    <Container padded={false} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : colors.background, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0' }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="body" style={[s.headerTitle, { color: colors.textPrimary }]}>
          Подписка
        </Text>
        <View style={s.headerIcon} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* Hero Card */}
        <View style={s.heroWrapper}>
          <View style={[s.heroGlow, { backgroundColor: colors.primary + '20' }]} />
          <View style={s.heroCard}>
            {/* Gradient background layers */}
            <View style={[s.heroGradientBase, { backgroundColor: '#1e1b4b' }]} />
            <View style={[s.heroGradientOverlay, { backgroundColor: '#312e81' }]} />
            <View style={[s.heroGradientAccent, { backgroundColor: colors.primary + '40' }]} />

            <View style={s.heroContent}>
              <View style={s.heroTop}>
                <View>
                  <View style={s.proBadge}>
                    <Text style={s.proBadgeText}>FLASHLY PRO</Text>
                  </View>
                  <Text style={s.heroTitle}>Flashly Premium</Text>
                  <Text style={s.heroSubtitle}>Раскройте весь потенциал обучения</Text>
                </View>
                <View style={s.heroBoltWrap}>
                  <Zap size={28} color={colors.primary} fill={colors.primary} />
                </View>
              </View>

              {/* Community avatars */}
              <View style={s.communityRow}>
                {['I', 'A', 'M'].map((letter, idx) => (
                  <View
                    key={idx}
                    style={[
                      s.communityAvatar,
                      { backgroundColor: ['#6366F1', '#8B5CF6', '#A78BFA'][idx], marginLeft: idx > 0 ? -8 : 0, zIndex: 3 - idx },
                    ]}
                  >
                    <Text style={s.communityAvatarText}>{letter}</Text>
                  </View>
                ))}
                <View style={[s.communityCount, { backgroundColor: colors.primary }]}>
                  <Text style={s.communityCountText}>+10k</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        {/* Benefits */}
        <View style={s.benefitsSection}>
          {BENEFITS.map((b, idx) => {
            const Icon = b.icon;
            return (
              <View key={idx} style={s.benefitRow}>
                <View style={[s.benefitIcon, { backgroundColor: colors.primary + '12' }]}>
                  <CheckCircle size={20} color={colors.primary} />
                </View>
                <View style={s.benefitInfo}>
                  <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                    {b.title}
                  </Text>
                  <Text variant="caption" style={{ color: colors.textTertiary }}>
                    {b.desc}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* Plan Options */}
        <View style={s.plansSection}>
          {PLANS.map((plan) => {
            const isActive = selectedPlan === plan.key;
            return (
              <Pressable
                key={plan.key}
                onPress={() => setSelectedPlan(plan.key)}
                style={[
                  s.planCard,
                  {
                    backgroundColor: isActive ? colors.primary + '08' : cardBg,
                    borderColor: isActive ? colors.primary : cardBorder,
                    borderWidth: isActive ? 2 : 1,
                  },
                ]}
              >
                <View style={s.planInfo}>
                  <Text variant="caption" style={{ color: colors.textTertiary, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600' }}>
                    {plan.label}
                  </Text>
                  <View style={s.planPriceRow}>
                    <Text style={[s.planPrice, { color: colors.textPrimary }]}>
                      {plan.price}
                    </Text>
                    <Text variant="bodySmall" style={{ color: colors.textTertiary }}>
                      {plan.period}
                    </Text>
                  </View>
                  {plan.note && (
                    <Text variant="caption" style={{ color: colors.primary, fontWeight: '600', marginTop: 2 }}>
                      {plan.note}
                    </Text>
                  )}
                </View>

                {plan.badge ? (
                  <View style={[s.saveBadge, { backgroundColor: colors.primary }]}>
                    <Text style={s.saveBadgeText}>{plan.badge}</Text>
                  </View>
                ) : (
                  <View
                    style={[
                      s.radioOuter,
                      {
                        borderColor: isActive ? colors.primary : cardBorder,
                        backgroundColor: isActive ? colors.primary : 'transparent',
                      },
                    ]}
                  >
                    {isActive && <View style={s.radioInner} />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {/* CTA */}
        <Pressable style={[s.ctaButton, { backgroundColor: colors.primary }]}>
          <Text variant="body" style={{ color: '#FFFFFF', fontWeight: '700' }}>
            Начать 7-дневный пробный период
          </Text>
          <ArrowRight size={20} color="#FFFFFF" />
        </Pressable>
        <Text variant="caption" style={[s.ctaNote, { color: colors.textTertiary }]}>
          Автопродление, отмена в любое время в Настройках.
        </Text>

        {/* Footer Links */}
        <View style={s.footer}>
          <View style={s.footerLinks}>
            <Pressable>
              <Text variant="bodySmall" style={[s.footerLink, { color: colors.textTertiary }]}>
                Восстановить покупку
              </Text>
            </Pressable>
            <Pressable>
              <Text variant="bodySmall" style={[s.footerLink, { color: colors.textTertiary }]}>
                Сравнить планы
              </Text>
            </Pressable>
          </View>
          <Text variant="caption" style={[s.footerLegal, { color: isDark ? 'rgba(255,255,255,0.2)' : colors.textTertiary }]}>
            Оформляя подписку, вы соглашаетесь с Условиями использования и Политикой конфиденциальности Flashly.
          </Text>
        </View>
      </ScrollView>
    </Container>
  );
}

// ==================== STYLES ====================

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 18,
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.xxl,
  },

  // Hero
  heroWrapper: {
    marginTop: spacing.s,
    marginBottom: spacing.xl,
    position: 'relative',
  },
  heroGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: borderRadius.xl + 4,
    opacity: 0.5,
  },
  heroCard: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
    minHeight: 220,
    position: 'relative',
  },
  heroGradientBase: {
    ...StyleSheet.absoluteFillObject,
  },
  heroGradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  heroGradientAccent: {
    position: 'absolute',
    right: -40,
    bottom: -40,
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  heroContent: {
    position: 'relative',
    padding: spacing.l,
    flex: 1,
    justifyContent: 'space-between',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  proBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: spacing.s,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  proBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  heroSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
    marginTop: spacing.xxs,
  },
  heroBoltWrap: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.m,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Community
  communityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  communityAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  communityAvatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  communityCount: {
    height: 32,
    paddingHorizontal: spacing.xs,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  communityCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Benefits
  benefitsSection: {
    gap: spacing.m,
    marginBottom: spacing.xl,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  benefitIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  benefitInfo: {
    flex: 1,
    gap: 1,
  },

  // Plans
  plansSection: {
    gap: spacing.s,
    marginBottom: spacing.xl,
  },
  planCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
    borderRadius: borderRadius.xl,
  },
  planInfo: {
    flex: 1,
    gap: 1,
  },
  planPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xxs,
  },
  planPrice: {
    fontSize: 24,
    fontWeight: '800',
  },
  saveBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  saveBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    textTransform: 'uppercase',
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
  },

  // CTA
  ctaButton: {
    height: 56,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    shadowColor: '#6467f2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  ctaNote: {
    textAlign: 'center',
    marginTop: spacing.s,
    fontSize: 10,
  },

  // Footer
  footer: {
    marginTop: spacing.xxl,
    alignItems: 'center',
    gap: spacing.m,
    paddingBottom: spacing.l,
  },
  footerLinks: {
    flexDirection: 'row',
    gap: spacing.l,
  },
  footerLink: {
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  footerLegal: {
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    fontSize: 10,
    lineHeight: 14,
  },
});
