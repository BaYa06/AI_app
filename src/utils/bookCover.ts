/**
 * Обложка-заглушка книги каталога: эмодзи и цвет по предмету.
 */

const SUBJECT_COVERS: Record<string, { emoji: string; color: string }> = {
  english: { emoji: '📘', color: '#3B82F6' },
  german: { emoji: '📗', color: '#10B981' },
  russian: { emoji: '📕', color: '#EF4444' },
  kyrgyz: { emoji: '📙', color: '#F59E0B' },
  math: { emoji: '📐', color: '#8B5CF6' },
};

const DEFAULT_COVER = { emoji: '📚', color: '#6366F1' };

export function getBookCover(subject: string | null | undefined): { emoji: string; color: string } {
  if (!subject) return DEFAULT_COVER;
  return SUBJECT_COVERS[subject.trim().toLowerCase()] || DEFAULT_COVER;
}

/** «3rd · A2 · English» — только заполненные части. */
export function formatBookMeta(book: { edition: string; level: string | null; subject: string | null }): string {
  return [book.edition, book.level, book.subject].filter(Boolean).join(' · ');
}
