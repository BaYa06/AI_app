/**
 * Learning Settings Screen
 * @description Настройки обучения: новые слова в уроке дня, размер порции, обратный режим
 * и виджет на экране блокировки (только iPhone, plan/widgets.md, 2.3)
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Check, Sparkles } from 'lucide-react-native';
import { useThemeColors, useSettingsStore, useSetsStore } from '@/store';
import { DatabaseService } from '@/services';
import { isWidgetSupported } from '@/services/widgetBridge';
import { Text } from '@/components/common';
import { Card, ListGroup, ListRow, Screen, ScreenHeader, Sheet, Switch } from '@/components/ui';
import { spacing, borderRadius, heights, iconSize } from '@/constants';
import type { UserSettings } from '@/types';
import { NEW_PER_DAY_OPTIONS } from '@/services/LessonService';
import { pluralize } from '@/utils';

const CARD_LIMIT_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: null, label: 'Все' },
];

const WIDGET_DIRECTION_OPTIONS: Array<{ value: UserSettings['widgetDirection']; label: string }> = [
  { value: 'auto', label: 'Авто' },
  { value: 'forward', label: 'Прямой' },
  { value: 'reverse', label: 'Обратный' },
];

const WIDGET_DIRECTION_HINTS: Record<UserSettings['widgetDirection'], string> = {
  auto: 'Обычно слово → перевод. Слова, которые ты уже немного знаешь, иногда наоборот: так запоминается крепче.',
  forward: 'Всегда показывать слово, а вспоминать перевод.',
  reverse: 'Всегда показывать перевод, а вспоминать слово.',
};

export function LearningSettingsScreen({ navigation }: any) {
  const colors = useThemeColors();
  const lessonNewPerDay = useSettingsStore((s) => s.settings.lessonNewPerDay);
  const studyCardLimit = useSettingsStore((s) => s.settings.studyCardLimit);
  const reverseCards = useSettingsStore((s) => s.settings.reverseCards);
  const widgetSetId = useSettingsStore((s) => s.settings.widgetSetId);
  const widgetDirection = useSettingsStore((s) => s.settings.widgetDirection);
  const widgetHideAnswer = useSettingsStore((s) => s.settings.widgetHideAnswer);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const setsMap = useSetsStore((s) => s.sets);
  const setsOrder = useSetsStore((s) => s.setsOrder);
  const sets = useMemo(
    () => setsOrder.map((id) => setsMap[id]).filter((set) => !!set && set.cardCount > 0),
    [setsMap, setsOrder],
  );
  // Выбранный набор удалён — виджет и так берёт слова урока дня (HomeScreen), подпись та же
  const widgetSetTitle = (widgetSetId && setsMap[widgetSetId]?.title) || 'Как в уроке дня';
  const [widgetSetSheetVisible, setWidgetSetSheetVisible] = useState(false);

  const handleSelectLimit = useCallback(
    (value: number | null) => {
      updateSettings({ studyCardLimit: value });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  const handleSelectNewPerDay = useCallback(
    (value: number) => {
      updateSettings({ lessonNewPerDay: value });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  const updateWidget = useCallback(
    (patch: Partial<Pick<UserSettings, 'widgetSetId' | 'widgetDirection' | 'widgetHideAnswer'>>) => {
      updateSettings(patch);
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  const handleToggleReverse = useCallback(
    (value: boolean) => {
      updateSettings({ reverseCards: value });
      DatabaseService.saveSettings();
    },
    [updateSettings],
  );

  return (
    <Screen
      header={<ScreenHeader title="Настройки обучения" onBack={() => navigation.goBack()} bordered />}
      contentStyle={st.content}
    >
      {/* ======== Урок дня ======== */}
      <Text variant="overline" color="secondary" style={st.groupLabel}>Урок дня</Text>
      <Card style={st.card}>
        <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Новых слов в день</Text>
        <Text variant="bodySmall" color="secondary" style={st.cardHint}>
          Сколько новых слов добавлять в урок на главной. Больше — быстрее пройдёшь наборы, но урок дольше.
        </Text>
        <View style={st.chipsRow} accessibilityRole="radiogroup">
          {NEW_PER_DAY_OPTIONS.map((value) => {
            const active = lessonNewPerDay === value;
            return (
              <Pressable
                key={value}
                onPress={() => handleSelectNewPerDay(value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${value} ${pluralize(value, 'новое слово', 'новых слова', 'новых слов')} в день`}
                style={[st.chip, { backgroundColor: active ? colors.primaryFill : colors.surfaceMuted }]}
              >
                <Text variant="button" style={[st.chipText, { color: active ? colors.onPrimary : colors.textPrimary }]}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* ======== Card Limit ======== */}
      <Text variant="overline" color="secondary" style={[st.groupLabel, st.groupLabelSpaced]}>Тренировка</Text>
      <Card style={st.card}>
        <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Слов за одну тренировку</Text>
        <Text variant="bodySmall" color="secondary" style={st.cardHint}>
          Сколько карточек в одной порции. Остальные будут в следующей.
        </Text>
        <View style={st.chipsRow} accessibilityRole="radiogroup">
          {CARD_LIMIT_OPTIONS.map((opt) => {
            const active = studyCardLimit === opt.value;
            return (
              <Pressable
                key={opt.label}
                onPress={() => handleSelectLimit(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                style={[st.chip, { backgroundColor: active ? colors.primaryFill : colors.surfaceMuted }]}
              >
                <Text variant="button" style={[st.chipText, { color: active ? colors.onPrimary : colors.textPrimary }]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

      {/* ======== Reverse ======== */}
      <Card style={st.card}>
        <View style={st.toggleRow}>
          <View style={st.toggleInfo}>
            <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Обратный режим</Text>
            <Text variant="bodySmall" color="secondary">
              Показывать перевод, а вспоминать слово
            </Text>
          </View>
          <Switch value={reverseCards} onValueChange={handleToggleReverse} accessibilityLabel="Обратный режим" />
        </View>
      </Card>

      {/* ======== Виджет на экране блокировки (только iPhone) ======== */}
      {isWidgetSupported ? (
        <>
          <ListGroup title="Виджет на экране блокировки" style={st.groupLabelSpaced}>
            <ListRow
              title="Слова"
              value={widgetSetTitle}
              onPress={() => setWidgetSetSheetVisible(true)}
            />
          </ListGroup>

          <Card style={[st.card, st.widgetCard]}>
            <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Направление</Text>
            <Text variant="bodySmall" color="secondary" style={st.cardHint}>
              {WIDGET_DIRECTION_HINTS[widgetDirection]}
            </Text>
            <View style={st.chipsRow} accessibilityRole="radiogroup">
              {WIDGET_DIRECTION_OPTIONS.map((opt) => {
                const active = widgetDirection === opt.value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => updateWidget({ widgetDirection: opt.value })}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[st.chip, { backgroundColor: active ? colors.primaryFill : colors.surfaceMuted }]}
                  >
                    <Text variant="button" style={[st.chipText, { color: active ? colors.onPrimary : colors.textPrimary }]}>
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card style={st.card}>
            <View style={st.toggleRow}>
              <View style={st.toggleInfo}>
                <Text variant="body" style={[st.cardTitle, { color: colors.textPrimary }]}>Скрывать перевод</Text>
                <Text variant="bodySmall" color="secondary">
                  Пока iPhone заблокирован, вместо перевода будет заглушка
                </Text>
              </View>
              <Switch
                value={widgetHideAnswer}
                onValueChange={(value) => updateWidget({ widgetHideAnswer: value })}
                accessibilityLabel="Скрывать перевод на заблокированном экране"
              />
            </View>
          </Card>

          <Sheet
            visible={widgetSetSheetVisible}
            onClose={() => setWidgetSetSheetVisible(false)}
            title="Слова для виджета"
          >
            <ListRow
              icon={Sparkles}
              iconColor={colors.primary}
              title="Как в уроке дня"
              subtitle="Слова, которые ты учил сегодня и вчера"
              right={widgetSetId ? undefined : <Check size={iconSize.s} color={colors.primary} />}
              chevron={false}
              onPress={() => {
                updateWidget({ widgetSetId: null });
                setWidgetSetSheetVisible(false);
              }}
            />
            {sets.map((set) => (
              <ListRow
                key={set.id}
                title={set.title}
                right={set.id === widgetSetId ? <Check size={iconSize.s} color={colors.primary} /> : undefined}
                chevron={false}
                onPress={() => {
                  updateWidget({ widgetSetId: set.id });
                  setWidgetSetSheetVisible(false);
                }}
              />
            ))}
          </Sheet>
        </>
      ) : null}
    </Screen>
  );
}

// ==================== СТИЛИ ====================

const st = StyleSheet.create({
  content: {
    paddingTop: spacing.l,
  },
  groupLabel: {
    marginBottom: spacing.xs,
    marginLeft: spacing.xxs,
  },
  groupLabelSpaced: {
    marginTop: spacing.l,
  },
  card: {
    marginBottom: spacing.s,
  },
  widgetCard: {
    marginTop: spacing.s,
  },
  cardTitle: {
    fontWeight: '600',
    marginBottom: spacing.xxs,
  },
  cardHint: {
    marginBottom: spacing.m,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  chip: {
    flex: 1,
    height: heights.touch,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontWeight: '700',
    letterSpacing: 0,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.m,
  },
  toggleInfo: {
    flex: 1,
  },
});
