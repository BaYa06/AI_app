/**
 * Security Screen
 * @description Экран настроек безопасности аккаунта
 */
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import {
  ArrowLeft,
  ShieldCheck,
  Smartphone,
  Laptop,
  Tablet,
  LogOut,
  ChevronRight,
  History,
} from 'lucide-react-native';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'Security'>;

const SESSIONS = [
  {
    id: '1',
    icon: 'phone' as const,
    name: 'iPhone 13',
    location: 'San Francisco, CA',
    time: 'Активен сейчас',
    isCurrent: true,
  },
  {
    id: '2',
    icon: 'laptop' as const,
    name: 'Chrome on MacOS',
    location: 'New York, NY',
    time: '2 часа назад',
    isCurrent: false,
  },
  {
    id: '3',
    icon: 'tablet' as const,
    name: 'Safari on iPad',
    location: 'London, UK',
    time: 'Вчера',
    isCurrent: false,
  },
];

function SessionIcon({ type, color }: { type: 'phone' | 'laptop' | 'tablet'; color: string }) {
  switch (type) {
    case 'phone': return <Smartphone size={20} color={color} />;
    case 'laptop': return <Laptop size={20} color={color} />;
    case 'tablet': return <Tablet size={20} color={color} />;
  }
}

export function SecurityScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = theme === 'dark';

  const [twoFactor, setTwoFactor] = useState(true);

  const cardBg = isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : colors.primary + '15';
  const dividerColor = isDark ? 'rgba(255,255,255,0.05)' : colors.primary + '08';
  const sessionIconBg = isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9';

  return (
    <Container padded={false} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : colors.background, borderBottomColor: colors.primary + '15' }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="body" style={[s.headerTitle, { color: colors.textPrimary }]}>
          Безопасность
        </Text>
        <View style={s.headerIcon} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* Login Credentials */}
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
            Учётные данные
          </Text>
          <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {/* Email */}
            <View style={s.credRow}>
              <View style={s.credInfo}>
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Email
                </Text>
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  fl****@flashly.io
                </Text>
              </View>
              <Pressable style={[s.changeBtn, { backgroundColor: colors.primary + '15' }]}>
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                  Изменить
                </Text>
              </Pressable>
            </View>

            <View style={[s.divider, { backgroundColor: dividerColor }]} />

            {/* Password */}
            <View style={s.credRow}>
              <View style={s.credInfo}>
                <Text variant="caption" style={{ color: colors.textTertiary }}>
                  Пароль
                </Text>
                <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600', letterSpacing: 3 }}>
                  ••••••••••••
                </Text>
              </View>
              <Pressable style={[s.changeBtn, { backgroundColor: colors.primary + '15' }]}>
                <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                  Изменить
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Two-Factor Authentication */}
        <View style={s.section}>
          <View style={[s.card, s.twoFactorCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={[s.twoFactorIcon, { backgroundColor: colors.primary + '15' }]}>
              <ShieldCheck size={22} color={colors.primary} />
            </View>
            <View style={s.twoFactorInfo}>
              <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '700' }}>
                Двухфакторная аутентификация
              </Text>
              <Text variant="caption" style={{ color: colors.textTertiary }}>
                Дополнительная защита аккаунта
              </Text>
            </View>
            <Switch
              value={twoFactor}
              onValueChange={setTwoFactor}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>

        {/* Active Sessions */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>
              Активные сессии
            </Text>
            <Pressable>
              <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
                Завершить все
              </Text>
            </Pressable>
          </View>

          <View style={[s.card, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            {SESSIONS.map((session, idx) => (
              <View key={session.id}>
                {idx > 0 && <View style={[s.divider, { backgroundColor: dividerColor }]} />}
                <View style={s.sessionRow}>
                  <View style={[s.sessionIconWrap, { backgroundColor: sessionIconBg }]}>
                    <SessionIcon type={session.icon} color={colors.textSecondary} />
                  </View>
                  <View style={s.sessionInfo}>
                    <View style={s.sessionNameRow}>
                      <Text
                        variant="bodySmall"
                        style={{ color: colors.textPrimary, fontWeight: '700' }}
                        numberOfLines={1}
                      >
                        {session.name}
                      </Text>
                      {session.isCurrent && (
                        <View style={[s.currentBadge, { backgroundColor: colors.primary + '15' }]}>
                          <Text style={[s.currentBadgeText, { color: colors.primary }]}>
                            Текущая
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text variant="caption" style={{ color: colors.textTertiary }}>
                      {session.location} • {session.time}
                    </Text>
                  </View>
                  {session.isCurrent ? (
                    <View style={[s.activeDot, { backgroundColor: colors.primary }]} />
                  ) : (
                    <Pressable hitSlop={8} style={s.sessionLogout}>
                      <LogOut size={18} color={colors.textTertiary} />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Login History */}
        <View style={s.section}>
          <Pressable style={[s.card, s.historyRow, { backgroundColor: cardBg, borderColor: cardBorder }]}>
            <View style={s.historyLeft}>
              <History size={20} color={colors.textTertiary} />
              <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
                История входов
              </Text>
            </View>
            <ChevronRight size={20} color={colors.textTertiary} />
          </Pressable>
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
    paddingTop: spacing.l,
    paddingBottom: spacing.xxl,
  },

  // Section
  section: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxs,
    marginBottom: spacing.m,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    paddingHorizontal: spacing.xxs,
    marginBottom: spacing.m,
  },

  // Card
  card: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    marginHorizontal: spacing.m,
  },

  // Credentials
  credRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
  },
  credInfo: {
    gap: 2,
    flex: 1,
  },
  changeBtn: {
    paddingHorizontal: spacing.m,
    paddingVertical: 6,
    borderRadius: borderRadius.m,
  },

  // Two Factor
  twoFactorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.m,
    gap: spacing.m,
  },
  twoFactorIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  twoFactorInfo: {
    flex: 1,
    gap: 2,
  },

  // Sessions
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
    padding: spacing.m,
  },
  sessionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sessionInfo: {
    flex: 1,
    gap: 2,
  },
  sessionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  currentBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionLogout: {
    padding: spacing.xs,
  },

  // History
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.m,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
});
