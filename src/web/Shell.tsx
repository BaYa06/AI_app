/**
 * Оболочка веб-кабинета (plan/new/web_cabinet.md, Web 2): фиксированное левое меню (белое, волосяная
 * линия справа, значок приложения, активный пункт — подложка primary 10 %, аккаунт внизу) и
 * гибкая колонка содержимого. Минимальная ширина 1024: ниже — экран «Открой на ноутбуке».
 */
import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LayoutDashboard, LogOut, Laptop } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, breakpoints, spacing } from '@/constants';
import { Text } from '@/components/common/Text';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import type { IconComponent } from '@/components/ui/types';
import { navigate, usePath } from './router';
import { useCourses } from './data/CoursesContext';
import { signOut } from './auth/AuthPages';

type NavItem = { path: string; label: string; icon: IconComponent };

// Пункты добавляются по мере готовности экранов (курсы — Web 6, экзамены — Web 12)
const NAV: NavItem[] = [{ path: '/', label: 'Обзор', icon: LayoutDashboard }];

function isActive(current: string, item: NavItem): boolean {
  const path = current.split('?')[0];
  return item.path === '/' ? path === '/' : path === item.path || path.startsWith(item.path + '/');
}

export function Shell({ email, children }: { email: string | null; children: React.ReactNode }) {
  const colors = useThemeColors();
  const path = usePath();
  const { width } = useWindowDimensions();
  const { courses, activeTests } = useCourses();

  if (width < breakpoints.desktop) {
    return (
      <View style={[styles.narrow, { backgroundColor: colors.background }]}>
        <EmptyState
          icon={Laptop}
          title="Открой кабинет на ноутбуке"
          description="Кабинету нужен экран шире 1024 пикселей. На телефоне всё то же есть в приложении Flashly."
        />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View
        role="navigation"
        style={[
          styles.sidebar,
          { backgroundColor: colors.surface, borderRightColor: colors.border },
        ]}
      >
        <View style={styles.brand}>
          <Image
            source={{ uri: '/icons/icon-96.png' }}
            style={styles.brandIcon}
            accessibilityLabel=""
          />
          <View>
            <Text variant="h3">Flashly</Text>
            <Text variant="overline" color="secondary">
              ДЛЯ УЧИТЕЛЕЙ
            </Text>
          </View>
        </View>

        <ScrollView style={styles.nav} contentContainerStyle={{ gap: spacing.xxs }}>
          {NAV.map((item) => {
            const active = isActive(path, item);
            return (
              <Pressable
                key={item.path}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                onPress={() => navigate(item.path)}
                style={(state) => [
                  styles.navItem,
                  active && { backgroundColor: alpha(colors.primary, 10) },
                  !active &&
                    (state as { hovered?: boolean }).hovered && {
                      backgroundColor: colors.surfaceMuted,
                    },
                ]}
              >
                <Icon icon={item.icon} color={active ? 'primary' : 'textSecondary'} />
                <Text
                  variant="label"
                  style={{ color: active ? colors.primary : colors.textPrimary }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}

          {courses && courses.length > 0 ? (
            <View style={styles.courseLabel}>
              <Text variant="overline" color="secondary">
                КУРСЫ
              </Text>
            </View>
          ) : null}
          {(courses ?? []).map((course) => {
            const active =
              path === `/courses/${course.id}` ||
              path.startsWith(`/courses/${course.id}/`) ||
              path.startsWith(`/courses/${course.id}?`);
            const live = activeTests.some((t) => t.courseId === course.id);
            return (
              <Pressable
                key={course.id}
                accessibilityRole="link"
                accessibilityState={{ selected: active }}
                accessibilityLabel={live ? `${course.title}, идёт тест` : course.title}
                onPress={() => navigate(`/courses/${course.id}`)}
                style={(state) => [
                  styles.navItem,
                  active && { backgroundColor: alpha(colors.primary, 10) },
                  !active &&
                    (state as { hovered?: boolean }).hovered && {
                      backgroundColor: colors.surfaceMuted,
                    },
                ]}
              >
                <Text
                  variant="label"
                  numberOfLines={1}
                  style={{ flex: 1, color: active ? colors.primary : colors.textPrimary }}
                >
                  {course.title}
                </Text>
                {live ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={[styles.account, { borderTopColor: colors.border }]}>
          {email ? (
            <Text variant="bodySmall" color="secondary" numberOfLines={1}>
              {email}
            </Text>
          ) : null}
          <Button
            variant="quiet"
            tone="secondary"
            size="s"
            title="Выйти"
            icon={LogOut}
            onPress={signOut}
          />
        </View>
      </View>

      <ScrollView style={styles.main} contentContainerStyle={styles.mainContent}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  narrow: { flex: 1, justifyContent: 'center' },
  sidebar: {
    width: 248,
    borderRightWidth: 1,
    paddingTop: spacing.l,
    paddingHorizontal: spacing.m,
    paddingBottom: spacing.m,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.xs,
  },
  brandIcon: { width: 40, height: 40, borderRadius: borderRadius.m },
  nav: { marginTop: spacing.l, gap: spacing.xxs, flex: 1 },
  navItem: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s,
    paddingHorizontal: spacing.s,
    borderRadius: borderRadius.m,
  },
  courseLabel: { paddingHorizontal: spacing.s, paddingTop: spacing.m, paddingBottom: spacing.xxs },
  dot: { width: 8, height: 8, borderRadius: borderRadius.full },
  account: { borderTopWidth: 1, paddingTop: spacing.s, gap: spacing.xxs, alignItems: 'flex-start' },
  main: { flex: 1 },
  mainContent: { alignItems: 'center', padding: spacing.xl },
  content: { width: '100%', maxWidth: 1200 },
});
