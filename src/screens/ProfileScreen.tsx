/**
 * Profile Screen
 * @description Экран профиля и настроек
 */
import React, { useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert, Switch } from 'react-native';
import { useSettingsStore, useThemeColors } from '@/store';
import { DatabaseService } from '@/services';
import { Container, Text, Heading2, Heading3 } from '@/components/common';
import { spacing, borderRadius } from '@/constants';

export function ProfileScreen() {
  const colors = useThemeColors();
  const settings = useSettingsStore((s) => s.settings);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const toggleTheme = useSettingsStore((s) => s.toggleTheme);

  // Переключение темной темы
  const handleToggleDarkMode = useCallback(() => {
    toggleTheme();
  }, [toggleTheme]);

  // Изменение лимита новых карточек
  const handleChangeNewCardsLimit = useCallback(() => {
    Alert.prompt(
      'Лимит новых карточек',
      'Сколько новых карточек изучать в день?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сохранить',
          onPress: (value) => {
            const limit = parseInt(value || '20', 10);
            if (limit > 0 && limit <= 100) {
              updateSettings({ dailyNewCardsLimit: limit });
            }
          },
        },
      ],
      'plain-text',
      String(settings.dailyNewCardsLimit)
    );
  }, [settings.dailyNewCardsLimit, updateSettings]);

  // Экспорт данных
  const handleExport = useCallback(async () => {
    try {
      DatabaseService.exportData();
      // TODO: Сохранить в файл или поделиться
      Alert.alert('Экспорт', 'Данные подготовлены для экспорта');
    } catch (error) {
      Alert.alert('Ошибка', 'Не удалось экспортировать данные');
    }
  }, []);

  // Очистка данных
  const handleClearData = useCallback(() => {
    Alert.alert(
      'Удалить все данные?',
      'Все наборы и карточки будут удалены. Это действие нельзя отменить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => {
            DatabaseService.clearAll();
            Alert.alert('Готово', 'Все данные удалены');
          },
        },
      ]
    );
  }, []);

  return (
    <Container>
      <ScrollView showsVerticalScrollIndicator={false}>
        <Heading2 style={styles.title}>Профиль</Heading2>

        {/* Аккаунт (заглушка) */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <View style={styles.userSection}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={styles.avatarText}>👤</Text>
            </View>
            <View style={styles.userInfo}>
              <Text variant="h3">Гость</Text>
              <Text variant="bodySmall" color="secondary">
                Войдите для синхронизации
              </Text>
            </View>
          </View>
        </View>

        {/* Настройки изучения */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3 style={styles.sectionTitle}>Изучение</Heading3>

          <SettingsRow
            title="Новых карточек в день"
            value={String(settings.dailyNewCardsLimit)}
            onPress={handleChangeNewCardsLimit}
            colors={colors}
          />

          <SettingsRow
            title="Повторений в день"
            value={String(settings.dailyReviewLimit)}
            onPress={() => {}}
            colors={colors}
          />
        </View>

        {/* Внешний вид */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3 style={styles.sectionTitle}>Внешний вид</Heading3>

          <View style={styles.settingsRow}>
            <Text variant="body">Темная тема</Text>
            <Switch
              value={themeMode === 'dark'}
              onValueChange={handleToggleDarkMode}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.surface}
            />
          </View>

          <SettingsRow
            title="Язык"
            value={settings.language === 'ru' ? 'Русский' : 'English'}
            onPress={() => {}}
            colors={colors}
          />
        </View>

        {/* Данные */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3 style={styles.sectionTitle}>Данные</Heading3>

          <SettingsRow
            title="Экспорт данных"
            value="JSON"
            onPress={handleExport}
            colors={colors}
          />

          <SettingsRow
            title="Импорт данных"
            value=""
            onPress={() => {}}
            colors={colors}
          />

          <Pressable
            onPress={handleClearData}
            style={({ pressed }) => [
              styles.settingsRow,
              { opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text variant="body" style={{ color: colors.error }}>
              Удалить все данные
            </Text>
          </Pressable>
        </View>

        {/* О приложении */}
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Heading3 style={styles.sectionTitle}>О приложении</Heading3>
          <Text variant="body" color="secondary">
            Flashcards App v1.0.0
          </Text>
          <Text variant="caption" color="tertiary" style={styles.copyright}>
            © 2024 Flashcards App
          </Text>
        </View>
      </ScrollView>
    </Container>
  );
}

// ==================== ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ ====================

interface SettingsRowProps {
  title: string;
  value: string;
  onPress: () => void;
  colors: any;
}

function SettingsRow({ title, value, onPress, colors }: SettingsRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingsRow,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <Text variant="body">{title}</Text>
      <View style={styles.settingsValue}>
        <Text variant="body" color="secondary">
          {value}
        </Text>
        <Text style={{ color: colors.textTertiary }}> ›</Text>
      </View>
    </Pressable>
  );
}

// ==================== СТИЛИ ====================

const styles = StyleSheet.create({
  title: {
    marginBottom: spacing.l,
  },

  card: {
    padding: spacing.m,
    borderRadius: borderRadius.l,
    marginBottom: spacing.m,
  },

  userSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.m,
  },

  avatarText: {
    fontSize: 28,
  },

  userInfo: {
    flex: 1,
  },

  sectionTitle: {
    marginBottom: spacing.m,
  },

  settingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.s,
  },

  settingsValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  copyright: {
    marginTop: spacing.s,
  },
});
