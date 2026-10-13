/**
 * Выбор файлов для ИИ-импорта (iOS/Android). Веб — importPicker.web.ts.
 * Фото сжимаем при выборе (1600 px, JPEG ~0.7): страница учебника остаётся читаемой,
 * а 5 фото укладываются в лимит запроса (~3 МБ, IMPORT_LIMITS).
 * Результат — готовые к отправке ImportFile; null — пользователь отменил.
 */
import DocumentPicker from 'react-native-document-picker';
import { launchCamera, launchImageLibrary, type Asset, type ImageLibraryOptions } from 'react-native-image-picker';
import { IMPORT_LIMITS, type ImportFile } from '@/services/AiImportService';

export class PickError extends Error {}

const PHOTO_OPTIONS: ImageLibraryOptions = {
  mediaType: 'photo',
  includeBase64: true,
  maxWidth: 1600,
  maxHeight: 1600,
  quality: 0.7,
};

function newId(): string {
  return Math.random().toString(36).slice(2);
}

function assetToFile(asset: Asset, index: number): ImportFile | null {
  if (!asset.base64) return null;
  return {
    id: newId(),
    name: asset.fileName || `photo_${index + 1}.jpg`,
    kind: 'image',
    // iOS отдаёт нестандартный 'image/jpg' — сервер ждёт 'image/jpeg'
    mimeType: !asset.type || asset.type === 'image/jpg' ? 'image/jpeg' : asset.type,
    base64: asset.base64,
    previewUri: asset.uri,
  };
}

export async function pickFromCamera(): Promise<ImportFile[] | null> {
  const result = await launchCamera({ ...PHOTO_OPTIONS, saveToPhotos: false });
  if (result.didCancel) return null;
  if (result.errorCode === 'camera_unavailable') throw new PickError('Камера недоступна на этом устройстве');
  if (result.errorCode === 'permission') throw new PickError('Разреши доступ к камере в настройках');
  if (result.errorCode) throw new PickError('Не удалось открыть камеру');
  const file = result.assets?.[0] && assetToFile(result.assets[0], 0);
  if (!file) throw new PickError('Не удалось прочитать фото');
  return [file];
}

export async function pickFromGallery(limit: number): Promise<ImportFile[] | null> {
  const result = await launchImageLibrary({ ...PHOTO_OPTIONS, selectionLimit: limit });
  if (result.didCancel) return null;
  if (result.errorCode === 'permission') throw new PickError('Разреши доступ к фото в настройках');
  if (result.errorCode) throw new PickError('Не удалось открыть галерею');
  const files = (result.assets || []).map(assetToFile).filter((f): f is ImportFile => f !== null);
  if (files.length === 0) throw new PickError('Не удалось прочитать фото');
  return files;
}

const DOC_TYPES: Record<string, { kind: ImportFile['kind']; mimeType: string }> = {
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.csv': { kind: 'table', mimeType: 'text/csv' },
  '.tsv': { kind: 'table', mimeType: 'text/tab-separated-values' },
  '.txt': { kind: 'text', mimeType: 'text/plain' },
};

export async function pickDocuments(limit: number): Promise<ImportFile[] | null> {
  let picked;
  try {
    picked = await DocumentPicker.pick({
      type: [DocumentPicker.types.allFiles],
      allowMultiSelection: limit > 1,
      copyTo: 'cachesDirectory',
    });
  } catch (err) {
    if (DocumentPicker.isCancel(err)) return null;
    throw new PickError('Не удалось выбрать файл');
  }

  const RNFS = (await import('react-native-fs')).default;
  const files: ImportFile[] = [];
  for (const doc of picked.slice(0, limit)) {
    const name = doc.name || 'file';
    const ext = Object.keys(DOC_TYPES).find(e => name.toLowerCase().endsWith(e));
    if (!ext) throw new PickError(`«${name}» — такой формат не подходит. Нужен PDF, CSV, TSV или TXT`);
    const { kind, mimeType } = DOC_TYPES[ext];
    if (kind === 'pdf' && doc.size && doc.size > IMPORT_LIMITS.maxPdfBytes) {
      throw new PickError(`«${name}» больше 3 МБ. Раздели PDF или сфотографируй нужные страницы`);
    }
    const path = decodeURI(((doc as { fileCopyUri?: string }).fileCopyUri || doc.uri).replace('file://', ''));
    files.push(kind === 'pdf'
      ? { id: newId(), name, kind, mimeType, base64: await RNFS.readFile(path, 'base64') }
      : { id: newId(), name, kind, mimeType, content: await RNFS.readFile(path, 'utf8') });
  }
  return files;
}
