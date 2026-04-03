/**
 * Oral Test Session Screen
 * @description Основной экран устного теста — свайп карточек
 */
import React, { useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, X, Check } from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore, useCardsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'OralTestSession'>;

const SWIPE_THRESHOLD = 120;
const ACCENT = '#F97316';
const GREEN = '#10B981';
const RED = '#EF4444';

export function OralTestSessionScreen({ navigation, route }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const cards = route.params.cardIds
    .map((id) => useCardsStore.getState().cards[id])
    .filter(Boolean);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const [unknownIds, setUnknownIds] = useState<string[]>([]);

  // Refs to avoid stale closures inside PanResponder
  const currentIndexRef = useRef(0);
  const knownIdsRef = useRef<string[]>([]);
  const unknownIdsRef = useRef<string[]>([]);
  const cardsRef = useRef(cards);

  const pan = useRef(new Animated.ValueXY()).current;

  const card = cards[currentIndex];
  const total = cards.length;
  const progress = total > 0 ? currentIndex / total : 0;

  function goToResults(known: string[], unknown: string[]) {
    navigation.replace('OralTestResults', {
      courseId: route.params.courseId,
      courseTitle: route.params.courseTitle,
      setTitle: route.params.setTitle,
      total: known.length + unknown.length,
      known: known.length,
      unknown: unknown.length,
    });
  }

  function confirmFinish() {
    goToResults(knownIdsRef.current, unknownIdsRef.current);
  }

  function handleSwipe(direction: 'left' | 'right') {
    const isKnown = direction === 'right';
    const targetX = isKnown ? 500 : -500;
    const currentCard = cardsRef.current[currentIndexRef.current];

    Animated.timing(pan, {
      toValue: { x: targetX, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      const newKnown = isKnown ? [...knownIdsRef.current, currentCard.id] : knownIdsRef.current;
      const newUnknown = !isKnown ? [...unknownIdsRef.current, currentCard.id] : unknownIdsRef.current;

      knownIdsRef.current = newKnown;
      unknownIdsRef.current = newUnknown;
      if (isKnown) setKnownIds(newKnown);
      else setUnknownIds(newUnknown);

      pan.setValue({ x: 0, y: 0 });

      const nextIndex = currentIndexRef.current + 1;
      if (nextIndex >= cardsRef.current.length) {
        goToResults(newKnown, newUnknown);
      } else {
        currentIndexRef.current = nextIndex;
        setCurrentIndex(nextIndex);
      }
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          handleSwipe('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          handleSwipe('left');
        } else {
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  // Анимированные значения
  const rotation = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-15deg', '0deg', '15deg'],
    extrapolate: 'clamp',
  });
  const knownOverlayOpacity = pan.x.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const unknownOverlayOpacity = pan.x.interpolate({
    inputRange: [-100, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const hintKnownOpacity = pan.x.interpolate({
    inputRange: [0, 80],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const hintUnknownOpacity = pan.x.interpolate({
    inputRange: [-80, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const cardBg = isDark ? '#1e293b' : '#FFFFFF';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          onPress={() => confirmFinish()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
          {route.params.setTitle}
        </Text>
      </View>

      {/* Progress */}
      <View style={[styles.progressWrap, { paddingTop: insets.top + 60 }]}>
        <Text style={[styles.counterText, { color: colors.textSecondary }]}>
          Карточка {Math.min(currentIndex + 1, total)} из {total}
        </Text>
        <View style={[styles.progressBar, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: ACCENT, width: `${progress * 100}%` as any },
            ]}
          />
        </View>
      </View>

      {/* Hint labels */}
      <View style={styles.hintsRow}>
        <Animated.Text style={[styles.hintText, { color: RED, opacity: hintUnknownOpacity }]}>
          ← Не знает
        </Animated.Text>
        <Animated.Text style={[styles.hintText, { color: GREEN, opacity: hintKnownOpacity }]}>
          Знает →
        </Animated.Text>
      </View>

      {/* Card area */}
      <View style={styles.cardArea}>
        {card ? (
          <Animated.View
            style={[
              styles.card,
              {
                backgroundColor: cardBg,
                transform: [
                  { translateX: pan.x },
                  { translateY: pan.y },
                  { rotate: rotation },
                ],
              },
              Platform.select({
                web: { boxShadow: '0 8px 32px rgba(0,0,0,0.12)' },
              }) as any,
              {
                shadowColor: '#000',
                shadowOpacity: isDark ? 0.3 : 0.1,
                shadowRadius: 20,
                shadowOffset: { width: 0, height: 8 },
                elevation: 10,
              },
            ]}
            {...panResponder.panHandlers}
          >
            {/* Known overlay */}
            <Animated.View
              style={[
                styles.overlay,
                styles.overlayKnown,
                { opacity: knownOverlayOpacity },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.overlayLabel}>ЗНАЕТ ✓</Text>
            </Animated.View>

            {/* Unknown overlay */}
            <Animated.View
              style={[
                styles.overlay,
                styles.overlayUnknown,
                { opacity: unknownOverlayOpacity },
              ]}
              pointerEvents="none"
            >
              <Text style={styles.overlayLabel}>НЕ ЗНАЕТ ✗</Text>
            </Animated.View>

            {/* Content */}
            <Text style={[styles.frontText, { color: colors.textPrimary }]}>
              {card.frontText}
            </Text>

            <View style={[styles.divider, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#E5E7EB' }]} />

            <Text style={[styles.backText, { color: colors.textSecondary }]}>
              {card.backText}
            </Text>
          </Animated.View>
        ) : null}
      </View>

      {/* Bottom icons hint */}
      <View style={styles.iconsRow}>
        <X size={28} color={RED} strokeWidth={2.5} />
        <Check size={28} color={GREEN} strokeWidth={2.5} />
      </View>

      {/* Finish button */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          onPress={() => confirmFinish()}
          style={({ pressed }) => [
            styles.finishBtn,
            { borderColor: colors.textSecondary },
            pressed && { opacity: 0.6 },
          ]}
        >
          <Text style={[styles.finishText, { color: colors.textSecondary }]}>
            Закончить
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
    borderBottomWidth: 1,
    zIndex: 10,
    ...Platform.select({
      web: { backdropFilter: 'blur(12px)' },
    }) as any,
  },
  backBtn: {
    padding: spacing.xs,
    marginLeft: -spacing.xs,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
    marginLeft: spacing.m,
    flex: 1,
  },
  progressWrap: {
    paddingHorizontal: spacing.l,
    gap: 8,
    paddingBottom: 8,
  },
  counterText: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  hintsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    marginTop: 8,
  },
  hintText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  card: {
    width: '100%',
    borderRadius: borderRadius.xl * 1.5,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    minHeight: 260,
    position: 'relative',
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.xl * 1.5,
  },
  overlayKnown: {
    backgroundColor: GREEN + '22',
    borderWidth: 3,
    borderColor: GREEN,
  },
  overlayUnknown: {
    backgroundColor: RED + '22',
    borderWidth: 3,
    borderColor: RED,
  },
  overlayLabel: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    color: '#FFFFFF',
  },
  frontText: {
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
  },
  divider: {
    height: 1,
    width: '60%',
  },
  backText: {
    fontSize: 22,
    fontWeight: '400',
    textAlign: 'center',
  },
  iconsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl * 2,
    marginBottom: 12,
  },
  footer: {
    paddingHorizontal: spacing.l,
  },
  finishBtn: {
    borderWidth: 1.5,
    borderRadius: borderRadius.l,
    paddingVertical: 14,
    alignItems: 'center',
  },
  finishText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
