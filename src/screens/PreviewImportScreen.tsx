import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Button } from '@/components/common';
import { useThemeColors, useSetsStore, useCardsStore } from '@/store';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react-native';

type Props = RootStackScreenProps<'PreviewImport'>;

type CardItem = { front: string; back: string };

// ─── Save Modal ───────────────────────────────────────────────────────────────

function SaveModal({
  visible,
  defaultTitle,
  saving,
  colors,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  defaultTitle: string;
  saving: boolean;
  colors: ReturnType<typeof useThemeColors>;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const inputRef = useRef<TextInput>(null);

  // Sync defaultTitle when modal opens
  React.useEffect(() => {
    if (visible) {
      setTitle(defaultTitle);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [visible, defaultTitle]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={[styles.modalCard, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
          <Text variant="h3" style={{ color: colors.textPrimary, fontWeight: '700', marginBottom: spacing.s }}>
            Название набора
          </Text>

          <View style={[styles.modalInput, { borderColor: colors.border, backgroundColor: colors.background }]}>
            <TextInput
              ref={inputRef}
              style={[styles.modalInputText, { color: colors.textPrimary }]}
              placeholder="Например: Биология. Митоз"
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={() => onConfirm(title)}
              returnKeyType="done"
            />
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity
              onPress={onCancel}
              style={[styles.modalBtn, { borderColor: colors.border }]}
              activeOpacity={0.7}
            >
              <Text variant="body" style={{ color: colors.textSecondary }}>Отмена</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onConfirm(title)}
              disabled={saving}
              style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text variant="body" style={{ color: '#fff', fontWeight: '600' }}>Сохранить</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Card Row ─────────────────────────────────────────────────────────────────

function CardRow({
  item,
  index,
  colors,
}: {
  item: CardItem;
  index: number;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={[styles.cardRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.cardIndex, { backgroundColor: colors.primary + '18' }]}>
        <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
          {index + 1}
        </Text>
      </View>
      <View style={styles.cardTexts}>
        <Text variant="body" style={{ color: colors.textPrimary, fontWeight: '600' }}>
          {item.front}
        </Text>
        {item.back ? (
          <Text variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
            {item.back}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function PreviewImportScreen({ navigation, route }: Props) {
  const { cards, suggestedTitle = '' } = route.params;
  const colors = useThemeColors();

  const addSet = useSetsStore(s => s.addSet);
  const updateSetStats = useSetsStore(s => s.updateSetStats);
  const addCards = useCardsStore(s => s.addCards);

  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  // ── save ──────────────────────────────────────────────────────────────────

  const handleSaveConfirm = useCallback(async (title: string) => {
    const trimmed = title.trim() || 'Импорт';
    setSaving(true);
    try {
      const newSet = await addSet({ title: trimmed });

      addCards(
        cards.map(c => ({
          setId: newSet.id,
          frontText: c.front,
          backText: c.back,
        })),
      );

      updateSetStats(newSet.id, {
        cardCount: cards.length,
        newCount: cards.length,
      });

      setModalVisible(false);

      // Переходим на набор — пользователь сразу видит результат
      navigation.replace('SetDetail', { setId: newSet.id });
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось сохранить набор');
    } finally {
      setSaving(false);
    }
  }, [cards, addSet, addCards, updateSetStats, navigation]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable
          hitSlop={10}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerBtn,
            { backgroundColor: pressed ? colors.surfaceVariant : 'transparent' },
          ]}
        >
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="h3" style={{ color: colors.textPrimary, fontWeight: '700' }}>
            Предпросмотр
          </Text>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {cards.length} {declCard(cards.length)}
          </Text>
        </View>
        <View style={[styles.countBadge, { backgroundColor: colors.primary + '18' }]}>
          <BookOpen size={14} color={colors.primary} />
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '700', marginLeft: 4 }}>
            {cards.length}
          </Text>
        </View>
      </View>

      {/* Card list */}
      <FlatList
        data={cards}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }) => (
          <CardRow item={item} index={index} colors={colors} />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: spacing.xs }} />}
      />

      {/* Bottom actions */}
      <View style={[styles.bottom, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Button
          title="Изменить"
          variant="outline"
          onPress={() => navigation.goBack()}
          style={{ flex: 1 }}
        />
        <TouchableOpacity
          onPress={() => setModalVisible(true)}
          style={[styles.saveBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text variant="body" style={{ color: '#fff', fontWeight: '600' }}>
            Сохранить набор
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal */}
      <SaveModal
        visible={modalVisible}
        defaultTitle={suggestedTitle}
        saving={saving}
        colors={colors}
        onConfirm={handleSaveConfirm}
        onCancel={() => !saving && setModalVisible(false)}
      />
    </SafeAreaView>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function declCard(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'карточек';
  if (mod10 === 1) return 'карточка';
  if (mod10 >= 2 && mod10 <= 4) return 'карточки';
  return 'карточек';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.m,
    paddingVertical: spacing.s,
    gap: spacing.s,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.s,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  list: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    paddingBottom: spacing.l,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s,
    borderRadius: borderRadius.m,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.s,
  },
  cardIndex: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardTexts: {
    flex: 1,
  },
  bottom: {
    flexDirection: 'row',
    gap: spacing.s,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    paddingBottom: spacing.l,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flex: 2,
    height: 48,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000055',
    justifyContent: 'center',
    paddingHorizontal: spacing.l,
  },
  modalCard: {
    borderRadius: borderRadius.l,
    padding: spacing.l,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.s,
    marginBottom: spacing.m,
  },
  modalInputText: {
    height: 44,
    fontSize: 15,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.s,
  },
  modalBtn: {
    flex: 1,
    height: 44,
    borderRadius: borderRadius.m,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalBtnPrimary: {
    borderWidth: 0,
  },
});
