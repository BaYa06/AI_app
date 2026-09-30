/**
 * Обложка-заглушка книги каталога: иконка lucide и цвет по предмету.
 * Эмодзи-обложки (📘 📗 📕 📐 📚) заменены иконками — брендбук, раздел 6.
 * Цвета — из DECK_ACCENT_COLORS (иконки наборов и книг).
 */
import { BookOpenText, Ruler, Library } from 'lucide-react-native';
import { DECK_ACCENT_COLORS } from '@/constants/colors';

type CoverIcon = typeof Library;
type Cover = { icon: CoverIcon; color: string };

// Индексы DECK_ACCENT_COLORS: 0 coral, 1 orange, 2 amber, 3 emerald, 4 sky, 5 violet, 6 pink, 7 teal
const SUBJECT_COVERS: Record<string, Cover> = {
  english: { icon: BookOpenText, color: DECK_ACCENT_COLORS[4] },
  german: { icon: BookOpenText, color: DECK_ACCENT_COLORS[3] },
  russian: { icon: BookOpenText, color: DECK_ACCENT_COLORS[0] },
  kyrgyz: { icon: BookOpenText, color: DECK_ACCENT_COLORS[2] },
  math: { icon: Ruler, color: DECK_ACCENT_COLORS[5] },
};

const DEFAULT_COVER: Cover = { icon: Library, color: DECK_ACCENT_COLORS[7] };

export function getBookCover(subject: string | null | undefined): Cover {
  if (!subject) return DEFAULT_COVER;
  return SUBJECT_COVERS[subject.trim().toLowerCase()] || DEFAULT_COVER;
}

/** «3rd · A2 · English» — только заполненные части. */
export function formatBookMeta(book: { edition: string; level: string | null; subject: string | null }): string {
  return [book.edition, book.level, book.subject].filter(Boolean).join(' · ');
}
