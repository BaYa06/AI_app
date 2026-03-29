/**
 * Test Join Screen
 * @description Экран ввода кода для подключения ученика к тесту
 */
import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  ArrowRight,
  GraduationCap,
  User,
  QrCode,
} from 'lucide-react-native';
import { Text } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import { supabase } from '@/services/supabaseClient';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/types/navigation';

const API_BASE = __DEV__ ? 'http://localhost:3000/api' : '/api';

type Props = NativeStackScreenProps<RootStackParamList, 'TestJoin'>;

export function TestJoinScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const isDark = useSettingsStore((s) => s.resolvedTheme) === 'dark';
  const insets = useSafeAreaInsets();

  const [digits, setDigits] = useState(['', '', '', '']);
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  const handleDigitChange = (text: string, index: number) => {
    // Allow only digits
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);

    // Auto-focus next input
    if (digit && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: any, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
      const newDigits = [...digits];
      newDigits[index - 1] = '';
      setDigits(newDigits);
    }
  };

  const code = digits.join('');
  const isCodeComplete = code.length === 4;

  const handleJoin = useCallback(async () => {
    if (!isCodeComplete || joining) return;
    setJoining(true);
    setError(null);

    try {
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user?.id;
      if (!userId) throw new Error('Not authenticated');

      const resp = await fetch(`${API_BASE}/test?action=join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId }),
      });
      const result = await resp.json();

      if (!resp.ok) {
        throw new Error(result.error || `Error ${resp.status}`);
      }

      navigation.replace('TestWaiting', {
        sessionId: result.sessionId,
        participantId: result.participantId,
        setTitle: result.setTitle,
        teacherName: result.teacherName,
        testMode: result.testMode,
        questionCount: result.questionCount,
        timePerQuestion: result.timePerQuestion,
      });
    } catch (e: any) {
      setError(e.message || 'Failed to join test');
      setJoining(false);
    }
  }, [code, isCodeComplete, joining, navigation]);

  const inputBg = isDark ? 'rgba(255,255,255,0.06)' : '#FFFFFF';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0';

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: isDark ? colors.background : 'rgba(255,255,255,0.85)',
            paddingTop: insets.top + 8,
          },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
            },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => navigation.goBack()}
        >
          <ArrowLeft size={20} color={colors.textSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <View style={[styles.logoBox, { backgroundColor: colors.primary }]}>
            <GraduationCap size={18} color="#FFF" />
          </View>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Test Lobby
          </Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Illustration */}
        <View style={styles.illustrationWrap}>
          <View
            style={[
              styles.illustration,
              {
                backgroundColor: colors.primary + '15',
              },
            ]}
          >
            <Text style={styles.illustrationEmoji}>🎓</Text>
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: colors.primary,
                  opacity: 0.05,
                  borderRadius: borderRadius.xl,
                },
              ]}
            />
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Join a Test
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          ENTER GAME CODE
        </Text>

        {/* PIN Input */}
        <View style={styles.pinRow}>
          {digits.map((digit, idx) => (
            <TextInput
              key={idx}
              ref={(ref) => { inputRefs.current[idx] = ref; }}
              style={[
                styles.pinInput,
                {
                  backgroundColor: inputBg,
                  borderBottomColor: digit
                    ? colors.primary
                    : isDark
                      ? 'rgba(255,255,255,0.12)'
                      : '#E2E8F0',
                  color: colors.textPrimary,
                },
              ]}
              value={digit}
              onChangeText={(text) => handleDigitChange(text, idx)}
              onKeyPress={(e) => handleKeyPress(e, idx)}
              keyboardType="number-pad"
              maxLength={1}
              placeholder="•"
              placeholderTextColor={colors.textSecondary}
              textAlign="center"
              selectTextOnFocus
            />
          ))}
        </View>

        {/* Name Input */}
        <View style={styles.nameSection}>
          <Text style={[styles.nameLabel, { color: colors.textSecondary }]}>
            YOUR NAME
          </Text>
          <View
            style={[
              styles.nameInputWrap,
              {
                backgroundColor: inputBg,
                borderColor: inputBorder,
              },
            ]}
          >
            <User size={20} color={colors.textSecondary} style={styles.nameIcon} />
            <TextInput
              style={[
                styles.nameInput,
                { color: colors.textPrimary },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="Enter your full name"
              placeholderTextColor={colors.textSecondary}
            />
          </View>
        </View>

        {/* Divider */}
        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]} />
          <Text style={[styles.dividerText, { color: colors.textSecondary }]}>or</Text>
          <View style={[styles.dividerLine, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]} />
        </View>

        {/* Scan QR Button */}
        <Pressable
          style={({ pressed }) => [
            styles.qrBtn,
            {
              borderColor: colors.primary + '60',
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <QrCode size={20} color={colors.primary} />
          <Text style={[styles.qrBtnText, { color: colors.primary }]}>
            Scan QR Code
          </Text>
        </Pressable>

        {/* Error */}
        {error && (
          <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.12)' : '#FEF2F2', borderColor: isDark ? 'rgba(239,68,68,0.2)' : '#FECACA' }]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Join Button */}
        <Pressable
          style={({ pressed }) => [
            styles.joinBtn,
            {
              backgroundColor: (isCodeComplete && !joining) ? colors.primary : colors.primary + '50',
            },
            pressed && isCodeComplete && !joining && { opacity: 0.9, transform: [{ scale: 0.98 }] },
          ]}
          disabled={!isCodeComplete || joining}
          onPress={handleJoin}
        >
          {joining ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.joinBtnText}>Join Now</Text>
              <ArrowRight size={20} color="#FFF" />
            </>
          )}
        </Pressable>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={[styles.footerText, { color: colors.textSecondary }]}>
          Need help?{' '}
          <Text style={[styles.footerLink, { color: colors.primary }]}>
            Contact Teacher
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scroll: {
    flexGrow: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.l,
  },
  illustrationWrap: {
    marginTop: spacing.xl,
    marginBottom: spacing.l,
    width: 180,
    height: 180,
  },
  illustration: {
    flex: 1,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  illustrationEmoji: {
    fontSize: 72,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.l,
  },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: spacing.xl,
  },
  pinInput: {
    width: 56,
    height: 64,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    borderBottomWidth: 4,
    borderTopLeftRadius: borderRadius.s,
    borderTopRightRadius: borderRadius.s,
  },
  nameSection: {
    width: '100%',
    marginBottom: spacing.l,
  },
  nameLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  nameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderRadius: borderRadius.l,
    borderWidth: 1,
    paddingHorizontal: spacing.m,
  },
  nameIcon: {
    marginRight: 12,
  },
  nameInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  } as any,
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    gap: 16,
    marginBottom: spacing.l,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 13,
    fontWeight: '500',
  },
  qrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 56,
    borderRadius: borderRadius.l,
    borderWidth: 2,
    marginBottom: spacing.xl,
  },
  qrBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  errorBox: {
    width: '100%',
    padding: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: 1,
    marginBottom: spacing.m,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
    textAlign: 'center',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    height: 64,
    borderRadius: borderRadius.l,
    ...Platform.select({
      ios: {
        shadowColor: '#6467f2',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    paddingTop: 12,
  },
  footerText: {
    fontSize: 13,
  },
  footerLink: {
    fontWeight: '600',
  },
});
