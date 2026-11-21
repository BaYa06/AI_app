/**
 * График активности учеников за 7/30 дней
 * (Clean 8 — вынесено из TeacherCourseStatsScreen.tsx без изменений разметки.)
 */
import React from 'react';
import { View, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { alpha, borderRadius, spacing } from '@/constants';
import { styles } from './styles';

type Props = {
  colors: ReturnType<typeof useThemeColors>;
  CHART_HEIGHT: number;
  chartData: { day: string; pct: number; count: number }[];
  chartError: boolean;
  chartLoading: boolean;
  chartPeriod: '7d' | '30d';
  setChartPeriod: React.Dispatch<React.SetStateAction<'7d' | '30d'>>;
  chartTooltip: { index: number; day: string; count: number } | null;
  handleBarPress: (index: number, day: string, count: number) => void;
  setRetryTick: React.Dispatch<React.SetStateAction<number>>;
  /** Teacher 8: «Пн учились 22, сейчас 1–3 в день» — только при спаде больше чем вдвое */
  insight?: string | null;
};

export function ActivityChart({
  colors,
  CHART_HEIGHT,
  chartData,
  chartError,
  chartLoading,
  chartPeriod,
  setChartPeriod,
  chartTooltip,
  handleBarPress,
  setRetryTick,
  insight,
}: Props) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Активность группы</Text>
        <View style={[styles.togglePill, { backgroundColor: colors.surfaceMuted }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: chartPeriod === '7d' }}
            style={[
              styles.toggleBtn,
              chartPeriod === '7d' && { backgroundColor: colors.background },
            ]}
            onPress={() => setChartPeriod('7d')}
          >
            <Text
              style={[
                styles.toggleText,
                { color: chartPeriod === '7d' ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              7д
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: chartPeriod === '30d' }}
            style={[
              styles.toggleBtn,
              chartPeriod === '30d' && { backgroundColor: colors.background },
            ]}
            onPress={() => setChartPeriod('30d')}
          >
            <Text
              style={[
                styles.toggleText,
                { color: chartPeriod === '30d' ? colors.textPrimary : colors.textSecondary },
              ]}
            >
              30д
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Bar chart */}
      {chartLoading ? (
        <View style={{ height: CHART_HEIGHT + 20, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : chartError ? (
        // Раньше сбой графика выглядел как пустой график без каких-либо данных — теперь
        // видно, что это ошибка, а не "активности не было". См. план, пункт 29.
        <View
          style={{
            height: CHART_HEIGHT + 20,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <AlertTriangle size={20} color={colors.textSecondary} />
          <Text style={[styles.emptyMembers, { color: colors.textSecondary }]}>
            Не удалось загрузить график
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setRetryTick((t) => t + 1)}>
            <Text style={[styles.viewAll, { color: colors.primary }]}>Повторить</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.chartWrap, { height: CHART_HEIGHT + 20 }]}>
          {chartData.map((item, idx) => (
            <View key={idx} style={styles.barCol}>
              <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center' }}>
                {chartTooltip?.index === idx && (
                  <View style={[styles.chartTooltip, { backgroundColor: colors.textPrimary }]}>
                    <Text style={[styles.chartTooltipText, { color: colors.onPrimary }]}>
                      {chartTooltip.day}: {chartTooltip.count}
                    </Text>
                    <View
                      style={[styles.chartTooltipArrow, { borderTopColor: colors.textPrimary }]}
                    />
                  </View>
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.day}: ${item.count}`}
                  onPress={() => handleBarPress(idx, item.day, item.count)}
                  hitSlop={8}
                >
                  <View
                    style={[
                      styles.bar,
                      {
                        height: item.pct * CHART_HEIGHT,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </Pressable>
              </View>
              <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{item.day}</Text>
            </View>
          ))}
        </View>
      )}

      {insight ? (
        <View style={[insightStyles.box, { backgroundColor: alpha(colors.warning, 10) }]}>
          <AlertTriangle size={16} color={colors.warningText} />
          <Text variant="bodySmall" style={[insightStyles.text, { color: colors.warningText }]}>
            {insight}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const insightStyles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.m,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.s,
    marginTop: spacing.xs,
  },
  text: {
    flex: 1,
  },
});
