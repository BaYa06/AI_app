import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ActionSheetIOS,
  Platform,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DocumentPicker from 'react-native-document-picker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { supabase } from '@/services';
import { spacing, borderRadius } from '@/constants';
import type { RootStackScreenProps } from '@/types/navigation';
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  FileText,
  Table,
  X,
  Sparkles,
  Info,
} from 'lucide-react-native';

type Props = RootStackScreenProps<'ImportFiles'>;

type FileType = 'image' | 'pdf' | 'text';

type AttachedFile = {
  id: string;
  name: string;
  uri: string;
  mimeType: string;
  fileType: FileType;
  sizeBytes: number;
};

const MAX_FILES = 5;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const CSV_WARN_BYTES = 500 * 1024;
const GCP_URL = 'http://34.9.20.41:3001';

const QUICK_PROMPTS = [
  'Все слова → карточки',
  'Только термины',
  'Вопрос-ответ',
  'Даты и события',
  'Перевести слова',
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function getFileType(name: string, mimeType: string): FileType {
  const lower = name.toLowerCase();
  if (lower.endsWith('.pdf') || mimeType === 'application/pdf') return 'pdf';
  if (lower.endsWith('.csv') || lower.endsWith('.tsv')) return 'text';
  return 'image';
}

// ─── File Chip ────────────────────────────────────────────────────────────────

function FileChip({
  file,
  onRemove,
  colors,
}: {
  file: AttachedFile;
  onRemove: (id: string) => void;
  colors: ReturnType<typeof useThemeColors>;
}) {
  const iconBg =
    file.fileType === 'image'
      ? '#16a34a22'
      : file.fileType === 'pdf'
      ? '#ea580c22'
      : '#2563eb22';
  const iconColor =
    file.fileType === 'image' ? '#16a34a' : file.fileType === 'pdf' ? '#ea580c' : '#2563eb';

  const Icon =
    file.fileType === 'image' ? ImageIcon : file.fileType === 'pdf' ? FileText : Table;

  return (
    <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.chipIcon, { backgroundColor: iconBg }]}>
        <Icon size={14} color={iconColor} />
      </View>
      <View style={styles.chipText}>
        <Text variant="caption" style={{ color: colors.textPrimary }} numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {formatBytes(file.sizeBytes)}
        </Text>
      </View>
      <Pressable
        onPress={() => onRemove(file.id)}
        hitSlop={8}
        style={({ pressed }) => [styles.chipRemove, { opacity: pressed ? 0.5 : 1 }]}
      >
        <X size={14} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ImportFilesScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);

  // ── helpers ──────────────────────────────────────────────────────────────

  const canAdd = files.length < MAX_FILES;

  function addFiles(incoming: AttachedFile[]) {
    setFiles(prev => {
      const slots = MAX_FILES - prev.length;
      const toAdd = incoming.slice(0, slots);
      const newTotal = prev.reduce((s, f) => s + f.sizeBytes, 0) +
        toAdd.reduce((s, f) => s + f.sizeBytes, 0);

      if (newTotal > MAX_TOTAL_BYTES) {
        Alert.alert('Превышен лимит', 'Суммарный размер файлов не должен превышать 20 МБ');
        return prev;
      }

      toAdd
        .filter(f => f.fileType === 'text' && f.sizeBytes > CSV_WARN_BYTES)
        .forEach(f =>
          Alert.alert(
            'Большой файл',
            `${f.name} больше 500 КБ. Обработка может быть неполной.`,
          )
        );

      return [...prev, ...toAdd];
    });
  }

  const removeFile = useCallback((id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  }, []);

  // ── pickers ──────────────────────────────────────────────────────────────

  const pickFromCamera = useCallback(async () => {
    try {
      const result = await launchCamera({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.7,
        maxWidth: 1024,
        maxHeight: 1024,
      });
      if (result.didCancel || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) { Alert.alert('Ошибка', 'Не удалось прочитать фото'); return; }

      addFiles([{
        id: Math.random().toString(36).slice(2),
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        uri: asset.uri || '',
        mimeType: asset.type || 'image/jpeg',
        fileType: 'image',
        sizeBytes: asset.fileSize || asset.base64.length * 0.75,
      }]);
    } catch {
      Alert.alert('Ошибка', 'Не удалось открыть камеру');
    }
  }, [files]);

  const pickFromGallery = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        includeBase64: true,
        quality: 0.7,
        maxWidth: 1024,
        maxHeight: 1024,
        selectionLimit: MAX_FILES - files.length,
      });
      if (result.didCancel || !result.assets) return;

      const newFiles: AttachedFile[] = result.assets
        .filter(a => a.base64)
        .map(a => ({
          id: Math.random().toString(36).slice(2),
          name: a.fileName || `photo_${Date.now()}.jpg`,
          uri: a.uri || '',
          mimeType: a.type || 'image/jpeg',
          fileType: 'image' as FileType,
          sizeBytes: a.fileSize || a.base64!.length * 0.75,
        }));

      addFiles(newFiles);
    } catch {
      Alert.alert('Ошибка', 'Не удалось открыть галерею');
    }
  }, [files]);

  const pickDocument = useCallback(async () => {
    try {
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.allFiles],
        allowMultiSelection: true,
        copyTo: 'cachesDirectory',
      });

      const ALLOWED_EXT = ['.pdf', '.csv', '.tsv'];
      const filtered = result.filter(f =>
        ALLOWED_EXT.some(ext => (f.name || '').toLowerCase().endsWith(ext))
      );

      if (filtered.length === 0) {
        Alert.alert('Неподдерживаемый тип', 'Выберите файл PDF, CSV или TSV');
        return;
      }

      const MIME_MAP: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.csv': 'text/csv',
        '.tsv': 'text/tab-separated-values',
      };

      const newFiles: AttachedFile[] = filtered.map(f => {
        const ext = ALLOWED_EXT.find(e => (f.name || '').toLowerCase().endsWith(e)) || '.pdf';
        const mimeType = f.type || MIME_MAP[ext];
        return {
          id: Math.random().toString(36).slice(2),
          name: f.name || `file${ext}`,
          uri: (f as any).fileCopyUri || f.uri,
          mimeType,
          fileType: getFileType(f.name || '', mimeType),
          sizeBytes: f.size || 0,
        };
      });

      addFiles(newFiles);
    } catch (err: any) {
      if (!DocumentPicker.isCancel(err)) {
        Alert.alert('Ошибка', 'Не удалось выбрать файл');
      }
    }
  }, [files]);

  // ── ActionSheet ───────────────────────────────────────────────────────────

  const handleAddFiles = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Отмена', 'Сделать фото', 'Фото из галереи', 'Файл (PDF, CSV, TSV)'],
          cancelButtonIndex: 0,
        },
        idx => {
          if (idx === 1) pickFromCamera();
          if (idx === 2) pickFromGallery();
          if (idx === 3) pickDocument();
        },
      );
    } else {
      Alert.alert('Добавить файл', undefined, [
        { text: 'Сделать фото', onPress: pickFromCamera },
        { text: 'Фото из галереи', onPress: pickFromGallery },
        { text: 'Файл (PDF, CSV, TSV)', onPress: pickDocument },
        { text: 'Отмена', style: 'cancel' },
      ]);
    }
  }, [pickFromCamera, pickFromGallery, pickDocument]);

  // ── build payload & submit ────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    if (files.length === 0 || loading) return;
    setLoading(true);

    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id || '';

      // Читаем содержимое каждого файла
      const payload = await Promise.all(
        files.map(async f => {
          if (f.fileType === 'image') {
            // base64 уже сжат image-picker'ом (quality 0.65, maxWidth 1024)
            // Для камеры/галереи нам нужно перечитать URI как base64
            const RNFS = (await import('react-native-fs')).default;
            const base64 = await RNFS.readFile(f.uri, 'base64');
            return { type: 'binary', name: f.name, mimeType: f.mimeType, base64 };
          }
          if (f.fileType === 'pdf') {
            const RNFS = (await import('react-native-fs')).default;
            const base64 = await RNFS.readFile(f.uri, 'base64');
            return { type: 'binary', name: f.name, mimeType: 'application/pdf', base64 };
          }
          // CSV / TSV — читаем как текст
          const response = await fetch(f.uri);
          const content = await response.text();
          return { type: 'text', name: f.name, mimeType: f.mimeType, content };
        }),
      );

      const res = await fetch(`${GCP_URL}/import-files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: payload, prompt: prompt.trim(), userId }),
      });

      const data2 = await res.json();
      if (!res.ok) throw new Error(data2.error || 'Ошибка сервера');
      if (!data2.cards?.length) {
        Alert.alert('Нет карточек', 'AI не смог извлечь карточки. Попробуйте другую инструкцию.');
        return;
      }

      navigation.navigate('PreviewImport', {
        cards: data2.cards,
        suggestedTitle: data2.suggestedTitle,
        setId,
      });
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать карточки');
    } finally {
      setLoading(false);
    }
  }, [files, prompt, loading, navigation]);

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
        <Text variant="h3" style={{ color: colors.textPrimary, fontWeight: '700', flex: 1 }}>
          Создать из файлов
        </Text>
        <View style={[styles.aiBadge, { backgroundColor: colors.primary + '22' }]}>
          <Text variant="caption" style={{ color: colors.primary, fontWeight: '700' }}>
            AI
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Files section ── */}
        <Text variant="body" style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          Файлы
        </Text>

        {/* Chips */}
        {files.length > 0 && (
          <View style={styles.chipsWrap}>
            {files.map(f => (
              <FileChip key={f.id} file={f} onRemove={removeFile} colors={colors} />
            ))}
          </View>
        )}

        {/* Add button */}
        {canAdd && (
          <TouchableOpacity
            onPress={handleAddFiles}
            style={[styles.addBtn, { borderColor: colors.primary, backgroundColor: colors.primary + '0D' }]}
            activeOpacity={0.7}
          >
            <Upload size={16} color={colors.primary} />
            <Text variant="body" style={{ color: colors.primary, marginLeft: spacing.xs }}>
              + Добавить файл
            </Text>
          </TouchableOpacity>
        )}

        {/* Upload zone (decorative, same action) */}
        {files.length === 0 && (
          <TouchableOpacity
            onPress={handleAddFiles}
            style={[styles.dropZone, { borderColor: colors.border, backgroundColor: colors.surface }]}
            activeOpacity={0.7}
          >
            <Upload size={28} color={colors.textSecondary} />
            <Text variant="body" style={{ color: colors.textPrimary, marginTop: spacing.xs }}>
              Загрузить файлы
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
              JPG, PNG, PDF, CSV, TSV
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Instruction section ── */}
        <Text
          variant="body"
          style={[styles.sectionLabel, { color: colors.textSecondary, marginTop: spacing.l }]}
        >
          Что сделать
        </Text>

        <View
          style={[
            styles.textAreaWrap,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TextInput
            style={[styles.textArea, { color: colors.textPrimary }]}
            placeholder="Например: возьми только термины и определения, игнорируй примеры"
            placeholderTextColor={colors.textSecondary}
            multiline
            value={prompt}
            onChangeText={setPrompt}
          />
        </View>

        {/* Quick prompts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {QUICK_PROMPTS.map(p => (
            <TouchableOpacity
              key={p}
              onPress={() => setPrompt(p)}
              style={[
                styles.quickChip,
                {
                  backgroundColor: prompt === p ? colors.primary + '22' : colors.surface,
                  borderColor: prompt === p ? colors.primary : colors.border,
                },
              ]}
              activeOpacity={0.7}
            >
              <Text
                variant="caption"
                style={{ color: prompt === p ? colors.primary : colors.textSecondary }}
              >
                {p}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </ScrollView>

      {/* ── Bottom panel ── */}
      <View
        style={[
          styles.bottom,
          { backgroundColor: colors.background, borderTopColor: colors.border },
        ]}
      >
        <View style={styles.bottomInfo}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {files.length} {files.length === 1 ? 'файл' : 'файлов'} · {formatBytes(totalBytes)}
          </Text>
          <View style={styles.bottomInfoRight}>
            <Info size={12} color={colors.textSecondary} />
            <Text variant="caption" style={{ color: colors.textSecondary, marginLeft: 4 }}>
              1 запрос к AI
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={files.length === 0 || loading}
          style={[
            styles.submitBtn,
            {
              backgroundColor:
                files.length === 0 || loading ? colors.border : colors.primary,
            },
          ]}
          activeOpacity={0.8}
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text variant="body" style={styles.submitText}>
                AI обрабатывает...
              </Text>
            </>
          ) : (
            <>
              <Sparkles size={18} color="#fff" />
              <Text variant="body" style={styles.submitText}>
                Создать карточки
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
  aiBadge: {
    paddingHorizontal: spacing.s,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.m,
    paddingTop: spacing.m,
  },
  sectionLabel: {
    marginBottom: spacing.s,
    textTransform: 'uppercase',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  chipsWrap: {
    gap: spacing.xs,
    marginBottom: spacing.s,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: borderRadius.m,
    borderWidth: 1,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  chipIcon: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.s,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    flex: 1,
  },
  chipRemove: {
    padding: 2,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.m,
    paddingVertical: spacing.s,
    marginBottom: spacing.s,
  },
  dropZone: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: borderRadius.l,
    paddingVertical: spacing.xl,
    marginBottom: spacing.s,
  },
  textAreaWrap: {
    borderWidth: 1,
    borderRadius: borderRadius.m,
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
  },
  textArea: {
    minHeight: 80,
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  quickRow: {
    paddingVertical: spacing.s,
    gap: spacing.xs,
  },
  quickChip: {
    paddingHorizontal: spacing.s,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing.m,
    paddingTop: spacing.s,
    paddingBottom: spacing.l,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  bottomInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.s,
  },
  bottomInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: borderRadius.m,
    height: 50,
  },
  submitText: {
    color: '#fff',
    fontWeight: '600',
  },
});
