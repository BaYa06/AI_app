/**
 * Черновик ИИ-импорта (plan/done/ai_import.md, AI 5): распознанные карточки живут здесь, пока их не
 * добавили в набор. Закрыл экран, ушёл назад с проверки, приложение выгрузилось — при следующем
 * открытии «Создать карточки» предложим продолжить, запрос к ИИ второй раз не тратится.
 * Один черновик на набор; через неделю считается устаревшим.
 */
import { StorageService } from './StorageService';
import type { ImportContentKind, ImportedCard } from './AiImportService';

export interface ImportDraft {
  cards: ImportedCard[];
  suggestedTitle: string;
  kind: ImportContentKind;
  lang: string | null;
  savedAt: number;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function key(setId: string): string {
  return `ai_import_draft:${setId || 'new'}`;
}

export function saveImportDraft(setId: string, draft: Omit<ImportDraft, 'savedAt'>): void {
  StorageService.setObject<ImportDraft>(key(setId), { ...draft, savedAt: Date.now() });
}

export function getImportDraft(setId: string): ImportDraft | null {
  const draft = StorageService.getObject<ImportDraft>(key(setId));
  if (!draft || !Array.isArray(draft.cards) || draft.cards.length === 0) return null;
  if (Date.now() - draft.savedAt > MAX_AGE_MS) {
    clearImportDraft(setId);
    return null;
  }
  return draft;
}

export function clearImportDraft(setId: string): void {
  StorageService.delete(key(setId));
}
