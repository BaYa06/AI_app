import React, { useState, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  ActionSheetIOS,
  Platform,
  TouchableOpacity,
} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';
import { Text } from '@/components/common';
import { useThemeColors } from '@/store';
import { supabase } from '@/services';
import { spacing, borderRadius, iconSize, screenPadding, alpha } from '@/constants';
import { pluralize } from '@/utils';
import { Badge, Button, ScreenHeader, TextField, toast, useScreenBottomInset } from '@/components/ui';
import type { RootStackScreenProps } from '@/types/navigation';
import {
  Upload,
  Image as ImageIcon,
  FileText,
  Table,
  X,
  Sparkles,
  Info,
} from 'lucide-react-native';
import { describeError } from '@/utils/userErrors';

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
  // Тип файла: фото — success, PDF — streak (оранжевый), таблица — info
  const iconColor =
    file.fileType === 'image' ? colors.success : file.fileType === 'pdf' ? colors.streak : colors.info;
  const iconBg = alpha(iconColor, 20);

  const Icon =
    file.fileType === 'image' ? ImageIcon : file.fileType === 'pdf' ? FileText : Table;

  return (
    <View style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.chipIcon, { backgroundColor: iconBg }]}>
        <Icon size={iconSize.xs} color={iconColor} />
      </View>
      <View style={styles.chipText}>
        <Text variant="caption" style={{ color: colors.textPrimary }} numberOfLines={1}>
          {file.name}
        </Text>
        <Text variant="caption" style={{ color: colors.textSecondary }}>
          {formatBytes(file.sizeBytes)}
        </Text>
      </View>
      <Button
        variant="icon"
        icon={X}
        background="none"
        iconSize={iconSize.xs}
        iconColor={colors.textSecondary}
        accessibilityLabel={`Убрать файл ${file.name}`}
        onPress={() => onRemove(file.id)}
      />
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function ImportFilesScreen({ navigation, route }: Props) {
  const { setId } = route.params;
  const colors = useThemeColors();
  const bottomInset = useScreenBottomInset();
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
        toast.info('Превышен лимит: суммарный размер файлов не должен превышать 20 МБ');
        return prev;
      }

      toAdd
        .filter(f => f.fileType === 'text' && f.sizeBytes > CSV_WARN_BYTES)
        .forEach(f =>
          toast.info(`Большой файл: ${f.name} больше 500 КБ. Обработка может быть неполной`)
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
      if (!asset.base64) { toast.error('Не удалось прочитать фото'); return; }

      addFiles([{
        id: Math.random().toString(36).slice(2),
        name: asset.fileName || `photo_${Date.now()}.jpg`,
        uri: asset.uri || '',
        mimeType: asset.type || 'image/jpeg',
        fileType: 'image',
        sizeBytes: asset.fileSize || asset.base64.length * 0.75,
      }]);
    } catch {
      toast.error('Не удалось открыть камеру');
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
      toast.error('Не удалось открыть галерею');
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
        toast.info('Неподдерживаемый тип — выбери файл PDF, CSV или TSV');
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
        toast.error('Не удалось выбрать файл');
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
        toast.info('Нет карточек: ИИ не смог их извлечь. Попробуй другую инструкцию');
        return;
      }

      navigation.navigate('PreviewImport', {
        cards: data2.cards,
        suggestedTitle: data2.suggestedTitle,
        setId,
      });
    } catch (e: any) {
      toast.error(describeError(e, 'Не удалось создать карточки'));
    } finally {
      setLoading(false);
    }
  }, [files, prompt, loading, navigation]);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    // Верхний safe area уже учтён в App.tsx; снизу — свой (экран без панели вкладок)
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Создать из файлов"
        onBack={() => navigation.goBack()}
        bordered
        right={<Badge label="ИИ" tone="primary" />}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Files section ── */}
        <Text variant="overline" color="secondary" style={styles.sectionLabel}>
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
          <TouchableOpacity accessibilityRole="button"
            onPress={handleAddFiles}
            style={[styles.addBtn, { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 10) }]}
            activeOpacity={0.7}
          >
            <Upload size={iconSize.xs} color={colors.primary} />
            <Text variant="body" style={{ color: colors.primary, marginLeft: spacing.xs }}>
              + Добавить файл
            </Text>
          </TouchableOpacity>
        )}

        {/* Upload zone (decorative, same action) */}
        {files.length === 0 && (
          <TouchableOpacity accessibilityRole="button"
            onPress={handleAddFiles}
            style={[styles.dropZone, { borderColor: colors.border, backgroundColor: colors.surface }]}
            activeOpacity={0.7}
          >
            <Upload size={iconSize.l} color={colors.textSecondary} />
            <Text variant="body" style={{ color: colors.textPrimary, marginTop: spacing.xs }}>
              Загрузить файлы
            </Text>
            <Text variant="caption" style={{ color: colors.textSecondary, marginTop: spacing.xxs }}>
              JPG, PNG, PDF, CSV, TSV
            </Text>
          </TouchableOpacity>
        )}

        {/* ── Instruction section ── */}
        <Text variant="overline" color="secondary" style={[styles.sectionLabel, { marginTop: spacing.l }]}>
          Что сделать
        </Text>

        <TextField
          placeholder="Например: возьми только термины и определения, игнорируй примеры"
          accessibilityLabel="Что сделать"
          multiline
          value={prompt}
          onChangeText={setPrompt}
          inputStyle={styles.textArea}
        />

        {/* Quick prompts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRow}
        >
          {QUICK_PROMPTS.map(p => (
            <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: prompt === p }}
              key={p}
              onPress={() => setPrompt(p)}
              style={[
                styles.quickChip,
                {
                  backgroundColor: prompt === p ? alpha(colors.primary, 10) : colors.surface,
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
          { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: spacing.l + bottomInset },
        ]}
      >
        <View style={styles.bottomInfo}>
          <Text variant="caption" style={{ color: colors.textSecondary }}>
            {files.length} {pluralize(files.length, 'файл', 'файла', 'файлов')} · {formatBytes(totalBytes)}
          </Text>
          <View style={styles.bottomInfoRight}>
            <Info size={iconSize.xs} color={colors.textSecondary} />
            <Text variant="caption" style={{ color: colors.textSecondary, marginLeft: spacing.xxs }}>
              1 запрос к ИИ
            </Text>
          </View>
        </View>

        {/* Во время обработки — текст «ИИ обрабатывает…», кнопка неактивна */}
        <Button
          title={loading ? 'ИИ обрабатывает...' : 'Создать карточки'}
          icon={Sparkles}
          onPress={handleSubmit}
          disabled={files.length === 0 || loading}
          fullWidth
        />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.m,
  },
  sectionLabel: {
    marginBottom: spacing.s,
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
  textArea: {
    minHeight: 80,
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
    paddingHorizontal: screenPadding,
    paddingTop: spacing.s,
    borderTopWidth: 1,
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
});
