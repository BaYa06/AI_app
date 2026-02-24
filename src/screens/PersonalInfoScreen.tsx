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
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text, Container } from '@/components/common';
import { useThemeColors, useSettingsStore } from '@/store';
import { supabase, NeonService } from '@/services';
import { spacing, borderRadius } from '@/constants';
import {
  ArrowLeft,
  Calendar,
  ChevronDown,
  MapPin,
  Clock,
  X,
  Plus,
  CheckCircle,
  Pencil,
} from 'lucide-react-native';
import type { RootStackScreenProps } from '@/types/navigation';

type Props = RootStackScreenProps<'PersonalInfo'>;

const NATIVE_LANGUAGES = [
  { value: 'ru', label: 'Русский' },
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
];

const TIMEZONES = [
  { value: 'cet', label: '(GMT+01:00) Central European Time' },
  { value: 'est', label: '(GMT-05:00) Eastern Standard Time' },
  { value: 'msk', label: '(GMT+03:00) Moscow Standard Time' },
  { value: 'pdt', label: '(GMT-07:00) Pacific Daylight Time' },
];

export function PersonalInfoScreen({ navigation }: Props) {
  const colors = useThemeColors();
  const theme = useSettingsStore((s) => s.resolvedTheme);
  const isDark = theme === 'dark';

  const [firstName, setFirstName] = useState('Ivan');
  const [lastName, setLastName] = useState('Petrov');
  const [userName, setUserName] = useState('');
  const [savingUserName, setSavingUserName] = useState(false);
  const [birthday, setBirthday] = useState('1995-05-15');
  const [nativeLang, setNativeLang] = useState('ru');
  const [learningLangs, setLearningLangs] = useState(['German', 'English']);
  const [location, setLocation] = useState('Berlin, Germany');
  const [timezone, setTimezone] = useState('cet');
  const [showNativeLangPicker, setShowNativeLangPicker] = useState(false);
  const [showTimezonePicker, setShowTimezonePicker] = useState(false);

  // Загрузить user_name из БД
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const userId = data.session?.user?.id;
      if (!userId) return;
      NeonService.getUserName(userId).then((name) => {
        if (name) setUserName(name);
      });
    });
  }, []);

  const inputBg = isDark ? 'rgba(255,255,255,0.04)' : '#F8FAFC';
  const inputBorder = isDark ? 'rgba(255,255,255,0.1)' : '#E2E8F0';
  const chipBg = isDark ? colors.primary + '20' : colors.primary + '15';
  const chipBorder = colors.primary + '30';
  const addChipBg = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  const removeLang = (lang: string) => {
    setLearningLangs((prev) => prev.filter((l) => l !== lang));
  };

  return (
    <Container padded={false} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={[s.header, { backgroundColor: isDark ? colors.background : '#FFFFFF', borderBottomColor: inputBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={s.headerIcon}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text variant="body" style={[s.headerTitle, { color: colors.textPrimary }]}>
          Личные данные
        </Text>
        <View style={s.headerIcon} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Avatar Section */}
        <View style={s.avatarSection}>
          <View style={s.avatarWrap}>
            <View style={[s.avatar, { backgroundColor: colors.primary }]}>
              <Text style={s.avatarText}>IP</Text>
            </View>
            <Pressable style={[s.avatarEditBtn, { backgroundColor: colors.primary, borderColor: isDark ? colors.background : '#FFFFFF' }]}>
              <Pencil size={14} color="#FFFFFF" />
            </Pressable>
          </View>
          <Pressable>
            <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
              Изменить фото
            </Text>
          </Pressable>
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
                placeholder="username"
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

          {/* Birthday */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Дата рождения</Text>
            <View style={[s.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <TextInput
                value={birthday}
                onChangeText={setBirthday}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textTertiary}
                style={[
                  s.inputInner,
                  { color: colors.textPrimary },
                  Platform.OS === 'web' && { outlineStyle: 'none' },
                ]}
              />
              <Calendar size={20} color={colors.textTertiary} />
            </View>
          </View>

          {/* Native Language */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Родной язык</Text>
            <Pressable
              onPress={() => setShowNativeLangPicker(!showNativeLangPicker)}
              style={[s.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}
            >
              <Text variant="body" style={{ color: colors.textPrimary, flex: 1 }}>
                {NATIVE_LANGUAGES.find((l) => l.value === nativeLang)?.label ?? ''}
              </Text>
              <ChevronDown size={20} color={colors.textTertiary} />
            </Pressable>
            {showNativeLangPicker && (
              <View style={[s.picker, { backgroundColor: isDark ? 'rgb(32, 34, 44)' : '#FFFFFF', borderColor: inputBorder }]}>
                {NATIVE_LANGUAGES.map((lang) => (
                  <Pressable
                    key={lang.value}
                    style={[
                      s.pickerItem,
                      nativeLang === lang.value && { backgroundColor: colors.primary + '10' },
                    ]}
                    onPress={() => {
                      setNativeLang(lang.value);
                      setShowNativeLangPicker(false);
                    }}
                  >
                    <Text
                      variant="bodySmall"
                      style={{
                        color: nativeLang === lang.value ? colors.primary : colors.textPrimary,
                        fontWeight: nativeLang === lang.value ? '700' : '500',
                      }}
                    >
                      {lang.label}
                    </Text>
                    {nativeLang === lang.value && (
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
              {learningLangs.map((lang) => (
                <View key={lang} style={[s.chip, { backgroundColor: chipBg, borderColor: chipBorder }]}>
                  <Text variant="bodySmall" style={{ color: colors.primary, fontWeight: '600' }}>
                    {lang}
                  </Text>
                  <Pressable onPress={() => removeLang(lang)} hitSlop={6}>
                    <X size={16} color={colors.primary} />
                  </Pressable>
                </View>
              ))}
              <Pressable style={[s.addChip, { backgroundColor: addChipBg }]}>
                <Plus size={16} color={colors.textSecondary} />
                <Text variant="bodySmall" style={{ color: colors.textSecondary, fontWeight: '600' }}>
                  Добавить
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Location */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Местоположение</Text>
            <View style={[s.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Город, Страна"
                placeholderTextColor={colors.textTertiary}
                style={[
                  s.inputInner,
                  { color: colors.textPrimary },
                  Platform.OS === 'web' && { outlineStyle: 'none' },
                ]}
              />
              <MapPin size={20} color={colors.textTertiary} />
            </View>
            {/* Map placeholder */}
            <View style={[s.mapPlaceholder, { backgroundColor: inputBg, borderColor: inputBorder }]}>
              <MapPin size={32} color={colors.textTertiary + '40'} />
              <Text variant="caption" style={{ color: colors.textTertiary }}>
                Berlin, Germany
              </Text>
            </View>
          </View>

          {/* Timezone */}
          <View style={s.field}>
            <Text style={[s.label, { color: colors.textTertiary }]}>Часовой пояс</Text>
            <Pressable
              onPress={() => setShowTimezonePicker(!showTimezonePicker)}
              style={[s.inputWrap, { backgroundColor: inputBg, borderColor: inputBorder }]}
            >
              <Text
                variant="bodySmall"
                style={{ color: colors.textPrimary, flex: 1 }}
                numberOfLines={1}
              >
                {TIMEZONES.find((t) => t.value === timezone)?.label ?? ''}
              </Text>
              <Clock size={20} color={colors.textTertiary} />
            </Pressable>
            {showTimezonePicker && (
              <View style={[s.picker, { backgroundColor: isDark ? 'rgb(32, 34, 44)' : '#FFFFFF', borderColor: inputBorder }]}>
                {TIMEZONES.map((tz) => (
                  <Pressable
                    key={tz.value}
                    style={[
                      s.pickerItem,
                      timezone === tz.value && { backgroundColor: colors.primary + '10' },
                    ]}
                    onPress={() => {
                      setTimezone(tz.value);
                      setShowTimezonePicker(false);
                    }}
                  >
                    <Text
                      variant="caption"
                      style={{
                        color: timezone === tz.value ? colors.primary : colors.textPrimary,
                        fontWeight: timezone === tz.value ? '700' : '500',
                        flex: 1,
                      }}
                      numberOfLines={1}
                    >
                      {tz.label}
                    </Text>
                    {timezone === tz.value && (
                      <CheckCircle size={18} color={colors.primary} />
                    )}
                  </Pressable>
                ))}
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
            backgroundColor: isDark ? 'rgb(16, 17, 34)' : '#FFFFFF',
            borderTopColor: inputBorder,
          },
        ]}
      >
        <Pressable
          style={[s.saveButton, { backgroundColor: colors.primary, opacity: savingUserName ? 0.7 : 1 }]}
          disabled={savingUserName}
          onPress={async () => {
            const { data } = await supabase.auth.getSession();
            const userId = data.session?.user?.id;
            if (!userId) {
              Alert.alert('Ошибка', 'Необходимо войти в аккаунт');
              return;
            }
            if (!userName || userName.length < 2) {
              Alert.alert('Ошибка', 'Имя пользователя слишком короткое');
              return;
            }
            setSavingUserName(true);
            const success = await NeonService.updateUserName(userId, userName);
            setSavingUserName(false);
            if (success) {
              Alert.alert('Готово', 'Данные сохранены');
            } else {
              Alert.alert('Ошибка', 'Не удалось сохранить. Возможно, имя уже занято.');
            }
          }}
        >
          {savingUserName ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <CheckCircle size={20} color="#FFFFFF" />
          )}
          <Text variant="body" style={{ color: '#FFFFFF', fontWeight: '700' }}>
            Сохранить изменения
          </Text>
        </Pressable>
      </View>
    </Container>
  );
}

// ==================== STYLES ====================

const s = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.s,
    borderBottomWidth: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontWeight: '700',
    fontSize: 18,
  },

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
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 42,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarEditBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 4,
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
    fontSize: 11,
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
    fontSize: 15,
    fontWeight: '500',
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
    fontSize: 15,
    fontWeight: '500',
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

  // Map placeholder
  mapPlaceholder: {
    height: 96,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    marginTop: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.l,
    paddingTop: spacing.m,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
  },
  saveButton: {
    height: 56,
    borderRadius: borderRadius.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    shadowColor: '#6467f2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
});
