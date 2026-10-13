/**
 * Выбор файлов для ИИ-импорта в вебе: скрытый <input type="file">.
 * Фото сжимаем через canvas (1600 px, JPEG 0.7). Если браузер не умеет открыть формат
 * (например, HEIC вне Safari) — отправляем как есть, сервер его примет.
 * API совпадает с importPicker.ts.
 */
import { IMPORT_LIMITS, type ImportFile } from '@/services/AiImportService';

export class PickError extends Error {}

const MAX_SIDE = 1600;

function newId(): string {
  return Math.random().toString(36).slice(2);
}

/** Открыть системный выбор файлов; null — пользователь закрыл окно, ничего не выбрав */
function chooseFiles(accept: string, multiple: boolean, capture?: 'environment'): Promise<File[] | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    if (capture) input.setAttribute('capture', capture);
    input.style.display = 'none';
    let settled = false;
    const finish = (files: File[] | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => finish(input.files?.length ? Array.from(input.files) : null));
    input.addEventListener('cancel', () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function base64Of(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

async function compressImage(file: File): Promise<{ base64: string; mimeType: string; previewUri: string }> {
  const original = await readAsDataUrl(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = original;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const jpeg = canvas.toDataURL('image/jpeg', 0.7);
    return { base64: base64Of(jpeg), mimeType: 'image/jpeg', previewUri: jpeg };
  } catch {
    // Браузер не открыл формат — отправляем исходник
    return { base64: base64Of(original), mimeType: file.type || 'image/heic', previewUri: original };
  }
}

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif';

async function toImageFiles(files: File[]): Promise<ImportFile[]> {
  return Promise.all(files.map(async (file, i) => {
    const { base64, mimeType, previewUri } = await compressImage(file);
    return { id: newId(), name: file.name || `photo_${i + 1}.jpg`, kind: 'image' as const, mimeType, base64, previewUri };
  }));
}

export async function pickFromCamera(): Promise<ImportFile[] | null> {
  const files = await chooseFiles(IMAGE_ACCEPT, false, 'environment');
  return files ? toImageFiles(files) : null;
}

export async function pickFromGallery(limit: number): Promise<ImportFile[] | null> {
  const files = await chooseFiles(IMAGE_ACCEPT, limit > 1);
  return files ? toImageFiles(files.slice(0, limit)) : null;
}

const DOC_TYPES: Record<string, { kind: ImportFile['kind']; mimeType: string }> = {
  '.pdf': { kind: 'pdf', mimeType: 'application/pdf' },
  '.csv': { kind: 'table', mimeType: 'text/csv' },
  '.tsv': { kind: 'table', mimeType: 'text/tab-separated-values' },
  '.txt': { kind: 'text', mimeType: 'text/plain' },
};

export async function pickDocuments(limit: number): Promise<ImportFile[] | null> {
  const picked = await chooseFiles('.pdf,.csv,.tsv,.txt', limit > 1);
  if (!picked) return null;
  const files: ImportFile[] = [];
  for (const file of picked.slice(0, limit)) {
    const ext = Object.keys(DOC_TYPES).find(e => file.name.toLowerCase().endsWith(e));
    if (!ext) throw new PickError(`«${file.name}» — такой формат не подходит. Нужен PDF, CSV, TSV или TXT`);
    const { kind, mimeType } = DOC_TYPES[ext];
    if (kind === 'pdf' && file.size > IMPORT_LIMITS.maxPdfBytes) {
      throw new PickError(`«${file.name}» больше 3 МБ. Раздели PDF или сфотографируй нужные страницы`);
    }
    files.push(kind === 'pdf'
      ? { id: newId(), name: file.name, kind, mimeType, base64: base64Of(await readAsDataUrl(file)) }
      : { id: newId(), name: file.name, kind, mimeType, content: await file.text() });
  }
  return files;
}
