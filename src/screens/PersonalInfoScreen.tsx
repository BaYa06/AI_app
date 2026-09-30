/**
 * Personal Info Screen
 * @description Экран редактирования личных данных пользователя
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Platform,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors } from '@/store';
import { supabase, NeonService } from '@/services';
import { spacing, borderRadius, TOP_LANGUAGES, MAX_TARGET_LANGUAGES, getLanguageLabel, getLanguageFlag, alpha } from '@/constants';
import { Button, ScreenHeader, toast, useScreenBottomInset } from '@/components/ui';
import {
  ChevronDown,
  X,
  Plus,
  CheckCircle,
} from 'lucide-react-native';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'PersonalInfo'>;

export function PersonalInfoScreen({ navigation }: Props) {
  const colors = useThemeColors();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [userName, setUserName] = useState('');
  const [saving, setSaving] = useState(false);
  const [nativeLang, setNativeLang] = useState('ru');
  const [learningLangs, setLearningLangs] = useState<string[]>([]);
  const [showNativeLangPicker, setShowNativeLangPicker] = useState(false);
  const [showLearningLangPicker, setShowLearningLangPicker] = useState(false);

  // Загрузить user_name, display_name и языковые предпочтения из БД
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id;
      if (!userId) return;
      NeonService.getUserName(userId).then((name) => {
        if (name) setUserName(name);
      });
      NeonService.getDisplayName(userId).then((displayName) => {
        if (displayName) {
          const parts = displayName.trim().split(' ');
          setLastName(parts[0] || '');
          setFirstName(parts.slice(1).join(' ') || '');
        }
      });
      NeonService.getLanguagePreferences(userId).then(({ nativeLanguage, targetLanguages }) => {
        if (nativeLanguage) setNativeLang(nativeLanguage);
        setLearningLangs(targetLanguages);
      });
    });
  }, []);

  const inputBg = colors.surface;
  const inputBorder = colors.border;
  const chipBg = alpha(colors.primary, 10);
  const chipBorder = alpha(colors.primary, 20);
  const addChipBg = colors.surfaceMuted;
  const bottomInset = useScreenBottomInset();

  const removeLang = (code: string) => {
    setLearningLangs((prev) => prev.filter((l) => l !== code));
  };

  const toggleLearningLang = (code: string) => {
    setLearningLangs((prev) => {
      if (prev.includes(code)) {
        return prev.filter((l) => l !== code);
      }
      if (prev.length >= MAX_TARGET_LANGUAGES) {
        toast.info('Можно выбрать до 3 языков — сначала убери один из выбранных');
        return prev;
      }
      return [...prev, code];
    });
  };

  return (
    <Container padded={false}>
      <ScreenHeader title="Личные данные" onBack={() => navigation.goBack()} bordered />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Section */}
        <View style={s.avatarSection}>
          <View style={s.avatarWrap}>
            <View style={[s.avatar, { backgroundColor: colors.primaryFill }]}>
              <Text variant="display" style={{ color: colors.onPrimary }}>{(firstName?.[0] || '').toUpperCase()}{(lastName?.[0] || '').toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* Form */}
        <View style={s.form}>
          {/* First & Last Name Row */}
          <View style={s.nameRow}>
            <View style={s.nameField}>
              <Text style={[s.label, { color: colors.textTertiary }]}>Имя</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Имя"
                placeholderTextColor={colors.textTertiary}
                style={[
                  s.input,
                  {
                    color: colors.textPrimary,
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                  },
                  Platform.OS === 'web' && { outlineStyle: 'none' },
                ]}
              />
            </View>
            <View style={s.nameField}>
              <Text style={[s.label, { color: colors.textTertiary }]}>Фамилия</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Фамилия"
                placeholderTextColor={colors.textTertiary}
                style={[
                  s.input,
                  {
                    color: colors.textPrimary,
                    backgroundColor: inputBg,
                    borderColor: inputBorder,
                  },
                  Platform.OS === 'web' && { outlineStyle: 'none' },
                ]}
              />
            </View>
          </View>

          {/* Username */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Имя пользователя</Text>
            <View style={[s.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <Text variant="body" style={{ color: colors.textTertiary, fontWeight: '600' }}>@</Text>
              <TextInput
                value={userName.replace(/^@/, '')}
                onChangeText={(text) => setUserName('@' + text.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
                placeholder="ник"
                placeholderTextColor={colors.textTertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  s.inputInner,
                  { color: colors.textPrimary },
                  Platform.OS === 'web' && { outlineStyle: 'none' },
                ]}
              />
            </View>
          </View>

          {/* Native Language */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Родной язык</Text>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: showNativeLangPicker }}
              onPress={() => setShowNativeLangPicker(!showNativeLangPicker)}
              style={[s.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}
            >
              <Text variant="body" style={{ color: colors.textPrimary, flex: 1 }}>
                {getLanguageFlag(nativeLang)} {getLanguageLabel(nativeLang)}
              </Text>
              <ChevronDown size={20} color={colors.textTertiary} />
            </Pressable>
            {showNativeLangPicker && (
              <View style={[s.picker, { backgroundColor: colors.surface, borderColor: inputBorder }]}>
                {TOP_LANGUAGES.map((lang) => (
                  <Pressable accessibilityRole="button" accessibilityState={{ selected: nativeLang === lang.code }}
                    key={lang.code}
                    style={[
                      s.pickerItem,
                      nativeLang === lang.code && { backgroundColor: alpha(colors.primary, 10) },
                    ]}
                    onPress={() => {
                      setNativeLang(lang.code);
                      // Учить свой же родной язык бессмысленно — убираем его из изучаемых, если он там есть.
                      setLearningLangs((prev) => prev.filter((l) => l !== lang.code));
                      setShowNativeLangPicker(false);
                    }}
                  >
                    <Text
                      variant="bodySmall"
                      style={{
                        color: nativeLang === lang.code ? colors.primary : colors.textPrimary,
                        fontWeight: nativeLang === lang.code ? '700' : '400',
                      }}
                    >
                      {lang.flag} {lang.label}
                    </Text>
                    {nativeLang === lang.code && (
                      <CheckCircle size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </View>

          {/* Learning Languages */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Изучаемые языки</Text>
            <View style={[s.chipsWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              {learningLangs.map((code) => (
                <View key={code} style={[s.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                  <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
                    {getLanguageFlag(code)} {getLanguageLabel(code)}
                  </Text>
                  <Pressable
                    onPress={() => removeLang(code)}
                    hitSlop={spacing.xs}
                    accessibilityRole="button"
                    accessibilityLabel={`Убрать язык: ${getLanguageLabel(code)}`}
                  >
                    <X size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ))}
              {learningLangs.length < MAX_TARGET_LANGUAGES && (
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: showLearningLangPicker }}
                  style={[s.addChip, { backgroundColor: addChipBg }]}
                  onPress={() => setShowLearningLangPicker((v) => !v)}
                >
                  <Plus size={16} color={colors.textSecondary} />
                  <Text variant="bodySmall" style={{ color: colors.textSecondary, fontWeight: '600' }}>
                    Добавить
                  </Text>
                </Pressable>
              )}
            </View>
            {showLearningLangPicker && (
              <View style={[s.picker, { backgroundColor: colors.surface, borderColor: inputBorder }]}>
                {TOP_LANGUAGES.filter((l) => l.code !== nativeLang).map((lang) => {
                  const active = learningLangs.includes(lang.code);
                  return (
                    <Pressable accessibilityRole="button" accessibilityState={{ selected: active }}
                      key={lang.code}
                      style={[s.pickerItem, active && { backgroundColor: alpha(colors.primary, 10) }]}
                      onPress={() => toggleLearningLang(lang.code)}
                    >
                      <Text
                        variant="bodySmall"
                        style={{
                          color: active ? colors.primary : colors.textPrimary,
                          fontWeight: active ? '700' : '400',
                        }}
                      >
                        {lang.flag} {lang.label}
                      </Text>
                      {active && <CheckCircle size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Sticky Bottom Save Button */}
      <View
        style={[
          s.bottomBar,
          {
            backgroundColor: colors.surface,
            borderTopColor: inputBorder,
            paddingBottom: spacing.m + bottomInset,
          },
        ]}
      >
        <Button
          title="Сохранить изменения"
          icon={CheckCircle}
          loading={saving}
          fullWidth
          onPress={async () => {
            const { data } = await supabase.auth.getSession();
            const userId = data.session?.user?.id;
            if (!userId) {
              toast.error('Нужно войти в аккаунт');
              return;
            }
            if (!userName || userName.length < 2) {
              toast.error('Имя пользователя слишком короткое');
              return;
            }
            setSaving(true);
            const displayName = `${lastName.trim()} ${firstName.trim()}`.trim();
            const [nameOk, userNameOk, langOk] = await Promise.all([
              displayName ? NeonService.updateDisplayName(userId, displayName) : Promise.resolve(true),
              NeonService.updateUserName(userId, userName),
              NeonService.updateLanguagePreferences(userId, {
                nativeLanguage: nativeLang,
                targetLanguages: learningLangs,
              }),
            ]);
            setSaving(false);
            if (nameOk && userNameOk && langOk) {
              toast.success('Данные сохранены');
            } else {
              toast.error('Не удалось сохранить. Возможно, имя уже занято.');
            }
          }}
        />
      </View>
    </Container>
  );
}

// ==================== STYLES ====================

const s = StyleSheet.create({
  // Header

  // Avatar
  avatarSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.m,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Form
  form: {
    paddingHorizontal: spacing.l,
    gap: spacing.l,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginLeft: spacing.xxs,
  },
  input: {
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: 14,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    gap: spacing.s,
  },
  inputInner: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    padding: 0,
    margin: 0,
  },

  // Name Row
  nameRow: {
    flexDirection: 'row',
    gap: spacing.m,
  },
  nameField: {
    flex: 1,
    gap: spacing.xs,
  },

  // Picker
  picker: {
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: spacing.xxs,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
  },

  // Chips
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    padding: spacing.s,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.s,
    paddingVertical: 6,
    borderRadius: borderRadius.m,
    borderWidth: 1,
  },
  addChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.s,
    paddingVertical: 6,
    borderRadius: borderRadius.m,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    borderTopWidth: 1,
  },
});
