/**
 * Плашка «Новое» на главной после урока дня (plan/new/new_user_activation.md, Start 4.2):
 * одна фича в день с уроком, как награда, а не обучалка. Крестик — больше не показываем.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  BookOpenText,
  Blocks,
  Camera,
  LayoutGrid,
  MessageSquareText,
  Mic,
  Sparkles,
  X,
} from 'lucide-react-native';
import { Text } from '@/components/common/Text';
import { Button, type IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';
import { pluralize } from '@/utils';
import type { HighlightId } from '@/services/dailyHighlight';

interface Meta {
  icon: IconComponent;
  title: string;
  description: string;
  action: string;
}

function meta(id: HighlightId, knownWords: number): Meta {
  switch (id) {
    case 'photo':
      return {
        icon: Camera,
        title: 'Есть учебник? Сфоткай страницу',
        description: 'Через 10 секунд будут готовые карточки',
        action: 'Сфоткать',
      };
    case 'builder':
      return {
        icon: Blocks,
        title: 'Новый режим: «Собери слово»',
        description: 'Составь слово из букв — так оно запоминается крепче',
        action: 'Играть',
      };
    case 'widget':
      return {
        icon: LayoutGrid,
        title: 'Слова на экране блокировки',
        description: 'Добавь виджет — слово дня всегда перед глазами',
        action: 'Добавить',
      };
    case 'context':
      return {
        icon: MessageSquareText,
        title: 'Учи слова в предложениях',
        description: '«Слово в контексте»: вставь слово в предложение',
        action: 'Попробовать',
      };
    case 'voice':
      return {
        icon: Mic,
        title: 'Проверь произношение',
        description: 'Скажи слово вслух — мы проверим',
        action: 'Проверить',
      };
    case 'week':
      return {
        icon: BookOpenText,
        title: `Неделя! Ты знаешь ${knownWords} ${pluralize(knownWords, 'слово', 'слова', 'слов')}`,
        description: 'Готовые наборы по темам и учебникам — в библиотеке',
        action: 'Открыть библиотеку',
      };
  }
}

export const NewFeatureCard = memo(function NewFeatureCard({
  id,
  knownWords,
  onAction,
  onClose,
}: {
  id: HighlightId;
  knownWords: number;
  onAction: () => void;
  onClose: () => void;
}) {
  const colors = useThemeColors();
  const m = meta(id, knownWords);
  const Icon = m.icon;
  return (
    <View
      style={[
        styles.card,
        { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 10) },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.primaryFill }]}>
        <Icon size={iconSize.m} color={colors.onPrimary} />
      </View>
      <View style={styles.text}>
        <View style={styles.newRow}>
          <Sparkles size={iconSize.xs} color={colors.primary} />
          <Text variant="overline" style={{ color: colors.primary }}>
            Новое
          </Text>
        </View>
        <Text variant="body" style={[styles.title, { color: colors.textPrimary }]}>
          {m.title}
        </Text>
        <Text variant="bodySmall" style={{ color: colors.textSecondary }}>
          {m.description}
        </Text>
        <Button
          title={m.action}
          variant="secondary"
          size="s"
          onPress={onAction}
          style={styles.button}
        />
      </View>
      <Button
        variant="icon"
        icon={X}
        background="none"
        iconSize={iconSize.xs}
        iconColor={colors.textSecondary}
        accessibilityLabel="Закрыть"
        onPress={onClose}
        style={styles.close}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderWidth: 2,
    borderRadius: borderRadius.l,
    padding: spacing.m,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: spacing.xxs,
    paddingRight: spacing.l,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
  },
  title: {
    fontWeight: '600',
  },
  button: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
  },
  close: {
    position: 'absolute',
    top: spacing.xxs,
    right: spacing.xxs,
  },
});
