/**
 * ImportGuideSheet
 * @description Справка «Что понимает ИИ» на экране создания карточек (plan/ai_import.md, вариант A):
 * что сработает сразу, что — с вопросом, что не получится, и форматы файлов.
 */
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertCircle, Check, X } from 'lucide-react-native';
import { Text } from '@/components/common';
import { Sheet } from '@/components/ui';
import type { IconComponent } from '@/components/ui';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, iconSize, spacing } from '@/constants';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface Group {
  title: string;
  icon: IconComponent;
  tone: 'success' | 'warning' | 'error';
  rows: Array<[string, string]>;
}

const GROUPS: Group[] = [
  {
    title: 'Сработает сразу',
    icon: Check,
    tone: 'success',
    rows: [
      ['Словарь или таблица', '«слово — перевод», с артиклями и формами'],
      ['Список без перевода', 'переведём на язык набора'],
      ['Скриншот', 'из приложения, сайта, чата'],
    ],
  },
  {
    title: 'Сработает, но спросим',
    icon: AlertCircle,
    tone: 'warning',
    rows: [
      ['Сплошной текст', 'статья, диалог — предложим выбрать незнакомые слова, пример возьмём из текста'],
      ['Рукописная тетрадь', 'проверь слова перед добавлением'],
      ['Несколько страниц', 'лучше по одному фото на страницу'],
    ],
  },
  {
    title: 'Не получится',
    icon: X,
    tone: 'error',
    rows: [
      ['Плохое фото', 'размыто, под углом, в тени или с бликом'],
      ['Упражнения', 'с картинками и пропусками, картинка без текста'],
    ],
  },
];

const FORMATS: Array<[string, string]> = [
  ['Фото', 'JPG, PNG, HEIC, WebP — до 5 за раз'],
  ['PDF', 'до 3 МБ'],
  ['CSV / TSV', 'слово [Tab] перевод'],
];

export const ImportGuideSheet = memo(function ImportGuideSheet({ visible, onClose }: Props) {
  const colors = useThemeColors();
  const toneColor = { success: colors.successText, warning: colors.warningText, error: colors.errorText };
  const toneBg = { success: colors.success, warning: colors.warning, error: colors.error };

  return (
    <Sheet visible={visible} onClose={onClose} title="Что понимает ИИ">
      <View style={[styles.sample, { backgroundColor: colors.surfaceMuted }]}>
        <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '700' }}>Wortschatz · Kapitel 3</Text>
        <Text variant="bodySmall" style={{ color: colors.textPrimary }}>
          {'der Hund, -e — собака\nlaufen — бегать\ndie Stadt — город'}
        </Text>
        <Text variant="caption" style={{ color: colors.successText, marginTop: spacing.xxs }}>
          Идеально: слово и перевод в одну строку
        </Text>
      </View>

      {GROUPS.map(group => {
        const Icon = group.icon;
        return (
          <View key={group.title} style={[styles.group, { backgroundColor: alpha(toneBg[group.tone], 10) }]}>
            <View style={styles.groupTitle}>
              <Icon size={iconSize.xs} color={toneColor[group.tone]} />
              <Text variant="label" style={{ color: toneColor[group.tone] }}>{group.title}</Text>
            </View>
            {group.rows.map(([bold, rest]) => (
              <Text key={bold} variant="bodySmall" style={{ color: colors.textSecondary }}>
                <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '700' }}>{bold}</Text>
                {` — ${rest}`}
              </Text>
            ))}
          </View>
        );
      })}

      <View style={styles.formats}>
        {FORMATS.map(([label, value]) => (
          <View key={label} style={[styles.formatRow, { borderBottomColor: colors.border }]}>
            <Text variant="bodySmall" color="secondary">{label}</Text>
            <Text variant="bodySmall" style={{ color: colors.textPrimary, fontWeight: '600' }}>{value}</Text>
          </View>
        ))}
      </View>
    </Sheet>
  );
});

const styles = StyleSheet.create({
  sample: {
    borderRadius: borderRadius.m,
    padding: spacing.s,
    gap: spacing.xxs,
    marginBottom: spacing.s,
  },
  group: {
    borderRadius: borderRadius.l,
    padding: spacing.s,
    gap: spacing.xxs,
    marginBottom: spacing.xs,
  },
  groupTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xxs,
  },
  formats: {
    marginTop: spacing.xs,
  },
  formatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.s,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
