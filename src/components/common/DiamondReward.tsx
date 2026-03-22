import React, { useCallback, useImperativeHandle, forwardRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  withTiming,
  withDelay,
  withSequence,
  Easing,
  runOnJS,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { Text } from './Text';
import { triggerHaptic } from '@/utils/haptic';

const DIAMOND_COUNT = 7;
const SPREAD = 60;
const PHASE1 = 200;
const PAUSE = 60;
const PHASE3 = 520;
const STAGGER = 75;

export interface DiamondRewardRef {
  collect: (from: { x: number; y: number }) => void;
}

interface Props {
  targetPosition: { x: number; y: number } | null;
  onComplete?: () => void;
}

interface DiamondData {
  id: number;
  offsetX: number;
  offsetY: number;
}

function generateDiamonds(): DiamondData[] {
  return Array.from({ length: DIAMOND_COUNT }, (_, i) => ({
    id: i,
    offsetX: (Math.random() - 0.5) * 2 * SPREAD,
    offsetY: (Math.random() - 0.5) * 2 * SPREAD,
  }));
}

const SingleDiamond = ({
  index,
  fromX,
  fromY,
  offsetX,
  offsetY,
  targetX,
  targetY,
  onFinish,
}: {
  index: number;
  fromX: number;
  fromY: number;
  offsetX: number;
  offsetY: number;
  targetX: number;
  targetY: number;
  onFinish: () => void;
}) => {
  const translateX = useSharedValue(fromX);
  const translateY = useSharedValue(fromY);
  const scale = useSharedValue(0);
  const opacity = useSharedValue(1);

  React.useEffect(() => {
    const delay = index * STAGGER;

    // X: spread out → fly to target
    translateX.value = withDelay(
      delay,
      withSequence(
        withTiming(fromX + offsetX, { duration: PHASE1, easing: Easing.out(Easing.back(2)) }),
        withDelay(PAUSE, withTiming(targetX, { duration: PHASE3, easing: Easing.in(Easing.quad) })),
      ),
    );

    // Y: spread out → fly to target
    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(fromY + offsetY, { duration: PHASE1, easing: Easing.out(Easing.back(2)) }),
        withDelay(PAUSE, withTiming(targetY, { duration: PHASE3, easing: Easing.in(Easing.quad) })),
      ),
    );

    // Scale: 0 → 1.2 → 1.2 (hold) → 0.3
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.2, { duration: PHASE1, easing: Easing.out(Easing.back(2)) }),
        withDelay(PAUSE, withTiming(0.3, { duration: PHASE3, easing: Easing.in(Easing.quad) })),
      ),
    );

    // Opacity: stay 1 until last 150ms of phase 3
    opacity.value = withDelay(
      delay + PHASE1 + PAUSE + PHASE3 - 150,
      withTiming(0, { duration: 150 }),
    );

    // Haptic when each diamond arrives at target
    const arrivalTime = delay + PHASE1 + PAUSE + PHASE3;
    const hapticTimeout = setTimeout(() => triggerHaptic('impactLight'), arrivalTime);

    // Fire onFinish after the last diamond completes
    if (index === DIAMOND_COUNT - 1) {
      const totalDuration = arrivalTime + 30;
      const timeout = setTimeout(() => onFinish(), totalDuration);
      return () => { clearTimeout(timeout); clearTimeout(hapticTimeout); };
    }

    return () => clearTimeout(hapticTimeout);
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: translateX.value - 14,
    top: translateY.value - 14,
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }), [translateX, translateY, scale, opacity]);

  return (
    <Animated.View style={animStyle}>
      <Text style={s.emoji}>💎</Text>
    </Animated.View>
  );
};

export const DiamondReward = forwardRef<DiamondRewardRef, Props>(
  ({ targetPosition, onComplete }, ref) => {
    const [active, setActive] = useState(false);
    const [fromPos, setFromPos] = useState({ x: 0, y: 0 });
    const [diamonds, setDiamonds] = useState<DiamondData[]>([]);
    const guardRef = React.useRef(false);

    const handleFinish = useCallback(() => {
      setActive(false);
      guardRef.current = false;
      triggerHaptic('notificationSuccess');
      onComplete?.();
    }, [onComplete]);

    useImperativeHandle(ref, () => ({
      collect: (from: { x: number; y: number }) => {
        if (guardRef.current || !targetPosition) return;
        guardRef.current = true;
        triggerHaptic('impactMedium');
        setFromPos(from);
        setDiamonds(generateDiamonds());
        setActive(true);
      },
    }));

    if (!active || !targetPosition) return null;

    return (
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        {diamonds.map((d) => (
          <SingleDiamond
            key={`${d.id}-${fromPos.x}`}
            index={d.id}
            fromX={fromPos.x}
            fromY={fromPos.y}
            offsetX={d.offsetX}
            offsetY={d.offsetY}
            targetX={targetPosition.x}
            targetY={targetPosition.y}
            onFinish={handleFinish}
          />
        ))}
      </View>
    );
  },
);

const s = StyleSheet.create({
  emoji: {
    fontSize: 28,
  },
});
