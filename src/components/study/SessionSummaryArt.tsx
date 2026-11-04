/**
 * SessionSummaryArt
 * @description Картинка итогов сессии (plan/new/session_results.md): галочка с искрами — сессия пройдена,
 * звезда — на сегодня всё. Рисунок из макета «Итоги сессии — вариант А», viewBox 200×180.
 */
import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';
import { useThemeColors } from '@/store';

const ASPECT = 180 / 200;

// Искра-ромб с центром (x, y) и полуразмером r
const sparkle = (x: number, y: number, r: number) => {
  const k = r * 0.3;
  return `M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`;
};

export function SessionSummaryArt({ kind, width }: { kind: 'check' | 'star'; width: number }) {
  const colors = useThemeColors();
  return (
    <Svg
      width={width}
      height={width * ASPECT}
      viewBox="0 0 200 180"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle
        cx={100}
        cy={90}
        r={78}
        fill={kind === 'star' ? colors.warning : colors.primary}
        opacity={0.12}
      />
      <Circle cx={100} cy={90} r={58} fill={colors.primaryFill} />
      <Circle
        cx={100}
        cy={90}
        r={58}
        fill="none"
        stroke={colors.primaryLight}
        strokeWidth={4}
        opacity={0.5}
      />
      {kind === 'check' ? (
        <Path
          d="M74 92 l18 18 l36 -38"
          fill="none"
          stroke={colors.onPrimary}
          strokeWidth={11}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M100 56 l10 21 l23 3 l-17 16 l4 23 l-20 -11 l-20 11 l4 -23 l-17 -16 l23 -3 z"
          fill={colors.warning}
          stroke={colors.warning}
          strokeWidth={4}
          strokeLinejoin="round"
        />
      )}
      <Path d={sparkle(30, 48, 14)} fill={kind === 'star' ? colors.primaryLight : colors.warning} />
      <Path
        d={sparkle(168, 32, 10)}
        fill={kind === 'star' ? colors.warning : colors.primaryLight}
      />
      <Path d={sparkle(172, 141, 13)} fill={colors.success} />
      <Circle cx={22} cy={132} r={5} fill={colors.primaryLight} opacity={0.7} />
      <Circle cx={150} cy={166} r={4} fill={colors.warning} opacity={0.8} />
    </Svg>
  );
}
