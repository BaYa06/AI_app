/**
 * Окно проектора (plan/new/web_cabinet.md, Web 19; макет E5b): код крупно, как войти, сколько зашло,
 * затем таймер. Данные приходят от окна учителя через BroadcastChannel; сервера и токена тут нет.
 * Имена — только если учитель их включил (по умолчанию нет). Проблем учеников здесь нет никогда.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useThemeColors } from '@/store';
import { borderRadius, typography } from '@/constants';
import { Text } from '@/components/common/Text';
import { WARN_SEC, formatClock } from '../exam/liveLogic';
import {
  EMPTY_STATE,
  channelName,
  parseMessage,
  supportsProjector,
  type ProjectorState,
} from '../exam/projector';
import { useNow } from '../ui/useNow';

const HERO = typography.hero as { fontSize: number; lineHeight: number };

/** Если от окна учителя ничего не пришло за столько мс, считаем его закрытым */
const SILENCE_MS = 12_000;

export function ProjectorPage({ sessionId }: { sessionId: string }) {
  const colors = useThemeColors();
  const { width, height } = useWindowDimensions();
  const [state, setState] = useState<ProjectorState>(EMPTY_STATE);
  const lastAt = useRef(0);
  const receivedAt = useRef(Date.now());
  const now = useNow(1000);
  const supported = supportsProjector();

  useEffect(() => {
    document.title = 'Flashly · проектор';
    if (!supported) return;
    const channel = new BroadcastChannel(channelName(sessionId));
    channel.onmessage = (ev) => {
      const msg = parseMessage(ev.data);
      if (!msg) return;
      if (msg.type === 'state') {
        lastAt.current = Date.now();
        receivedAt.current = Date.now();
        setState(msg.state);
      } else if (msg.type === 'closed') {
        setState(EMPTY_STATE);
      }
    };
    channel.postMessage({ type: 'hello' });
    // Окно учителя могло открыться позже — спрашиваем ещё раз
    const retry = setInterval(() => {
      if (!lastAt.current) channel.postMessage({ type: 'hello' });
    }, 2000);
    return () => {
      clearInterval(retry);
      channel.close();
    };
  }, [sessionId, supported]);

  // F — полный экран
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (
        (ev.key === 'f' || ev.key === 'F' || ev.key === 'а' || ev.key === 'А') &&
        !ev.metaKey &&
        !ev.ctrlKey
      ) {
        if (document.fullscreenElement) void document.exitFullscreen();
        else void document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const silent = lastAt.current > 0 && now - lastAt.current > SILENCE_MS;
  const phase = silent ? 'offline' : state.phase;
  // Размеры подгоняем под окно: макет рассчитан на 1280×720
  const k = Math.max(0.6, Math.min(height / 720, width / 1280));
  const big = (n: number) => Math.round(n * k);

  const left =
    state.timeLeftSec === null
      ? null
      : phase === 'paused'
        ? state.timeLeftSec
        : Math.max(0, state.timeLeftSec - Math.floor((now - receivedAt.current) / 1000));
  const warn = left !== null && left <= WARN_SEC;

  return (
    <View
      style={[styles.page, { backgroundColor: colors.background, padding: big(48) }]}
      accessibilityLabel="Окно проектора"
    >
      {!supported ? (
        <Text variant="h1" align="center">
          Этот браузер не поддерживает окно проектора
        </Text>
      ) : phase === 'offline' ? (
        <View style={styles.center}>
          <Text variant="h1" align="center" style={{ fontSize: big(40) }}>
            Ждём окно учителя…
          </Text>
          <Text variant="bodyLarge" align="center" style={{ fontSize: big(20) }}>
            Откройте проектор кнопкой в кабинете учителя
          </Text>
        </View>
      ) : phase === 'lobby' ? (
        <View style={[styles.center, { gap: big(24) }]}>
          <Text variant="h2" align="center" style={{ fontSize: big(32) }}>
            Открой Flashly → «Тест» → введи код
          </Text>
          <Text
            variant="hero"
            selectable
            accessibilityLabel={`Код ${state.code.split('').join(' ')}`}
            style={{
              fontSize: big(HERO.fontSize * 2.2),
              lineHeight: big(HERO.lineHeight * 2.2),
              letterSpacing: big(12),
            }}
          >
            {state.code}
          </Text>
          <Text
            variant="h2"
            align="center"
            accessibilityLiveRegion="polite"
            style={{ fontSize: big(32) }}
          >
            Зашли: {state.joined}
          </Text>
          {state.names && state.names.length > 0 ? (
            <View style={[styles.names, { gap: big(12), maxWidth: big(1100) }]}>
              {state.names.slice(0, 60).map((n, i) => (
                <View
                  key={`${n}-${i}`}
                  style={[
                    styles.person,
                    {
                      backgroundColor: colors.surfaceMuted,
                      paddingHorizontal: big(16),
                      paddingVertical: big(6),
                    },
                  ]}
                >
                  <Text variant="body" style={{ fontSize: big(20) }}>
                    {n}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : phase === 'finished' ? (
        <View style={styles.center}>
          <Text variant="h1" align="center" style={{ fontSize: big(56), lineHeight: big(64) }}>
            Экзамен завершён
          </Text>
          <Text variant="bodyLarge" align="center" style={{ fontSize: big(24) }}>
            Спасибо! Результаты покажет учитель.
          </Text>
        </View>
      ) : (
        <View style={[styles.center, { gap: big(16) }]}>
          <Text variant="h2" align="center" style={{ fontSize: big(32) }}>
            {phase === 'paused' ? 'Пауза' : 'Экзамен идёт'}
          </Text>
          <Text
            variant="hero"
            accessibilityLabel={
              left === null ? 'Время не ограничено' : `Осталось ${formatClock(left)}`
            }
            style={{
              fontSize: big(HERO.fontSize * 2.4),
              lineHeight: big(HERO.lineHeight * 2.4),
              color: warn ? colors.errorText : colors.textPrimary,
            }}
          >
            {left === null ? '—' : formatClock(left)}
          </Text>
          <Text variant="bodyLarge" align="center" style={{ fontSize: big(24) }}>
            {phase === 'paused'
              ? 'Положите телефоны, ждём продолжения'
              : `Отвечает: ${state.joined}`}
          </Text>
        </View>
      )}
      <Text
        variant="caption"
        color="tertiary"
        align="center"
        style={{ fontSize: Math.max(12, big(14)) }}
      >
        F — полный экран
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  names: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  person: { borderRadius: borderRadius.full },
});
