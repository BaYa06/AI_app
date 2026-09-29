/**
 * ScreenHeader — шапка экрана (брендбук, 7.4).
 *
 * Высота 56, фон background, без тени. Слева «назад» 44×44 (ArrowLeft 24).
 * nested (по умолчанию) — заголовок по центру 16/600; root — слева, h2 (корневые вкладки).
 * Разделитель снизу — только на экранах со скроллом (`bordered`).
 */
import React, { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useThemeColors } from '@/store';
import { Text } from '@/components/common/Text';
import { heights, screenPadding, spacing, typography } from '@/constants';
import { Button } from './Button';
import type { IconComponent } from './types';

export interface ScreenHeaderProps {
  title?: string;
  /** Есть — показываем кнопку «назад». */
  onBack?: () => void;
  /** Иконка кнопки «назад»: ArrowLeft (по умолчанию) или, например, X для модальных экранов. */
  backIcon?: IconComponent;
  backLabel?: string;
  /** Правое действие — то, что уже есть на экране (кнопка-иконка, текстовая кнопка). */
  right?: React.ReactNode;
  /** Вместо заголовка — свой блок (например, прогресс тренировки). */
  center?: React.ReactNode;
  variant?: 'nested' | 'root';
  bordered?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const ScreenHeader = memo(function ScreenHeader({
  title,
  onBack,
  backIcon = ArrowLeft,
  backLabel = 'Назад',
  right,
  center,
  variant = 'nested',
  bordered = false,
  style,
}: ScreenHeaderProps) {
  const colors = useThemeColors();
  const isRoot = variant === 'root';

  const back = onBack ? (
    <Button variant="icon" icon={backIcon} accessibilityLabel={backLabel} onPress={onBack} />
  ) : null;

  return (
    <View
      style={[
        styles.header,
        { backgroundColor: colors.background },
        bordered && { borderBottomWidth: 1, borderBottomColor: colors.border },
        style,
      ]}
    >
      {isRoot ? (
        <>
          {back}
          <View style={styles.rootTitle}>
            {center ?? (
              <Text variant="h2" numberOfLines={1} accessibilityRole="header" style={{ color: colors.textPrimary }}>
                {title}
              </Text>
            )}
          </View>
          {right ? <View style={styles.rightRoot}>{right}</View> : null}
        </>
      ) : (
        <>
          {/* Боковые слоты одинаковой ширины — заголовок строго по центру */}
          <View style={styles.side}>{back}</View>
          <View style={styles.center}>
            {center ?? (
              <Text
                numberOfLines={1}
                accessibilityRole="header"
                style={[typography.button, styles.nestedTitle, { color: colors.textPrimary }]}
              >
                {title}
              </Text>
            )}
          </View>
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    height: heights.header,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: screenPadding,
    gap: spacing.xs,
  },
  side: {
    minWidth: heights.touch,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sideRight: {
    justifyContent: 'flex-end',
  },
  center: {
    flex: 1,
    alignItems: 'center',
  },
  nestedTitle: {
    letterSpacing: 0,
    textAlign: 'center',
  },
  rootTitle: {
    flex: 1,
  },
  rightRoot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
});
