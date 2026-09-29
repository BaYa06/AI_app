/**
 * Иконки категорий наборов — брендбук, раздел 6.
 * Эмодзи в данных наборов (`set.icon`) не трогаем: в интерфейсе показываем
 * иконку lucide по ключу категории.
 * Импорт напрямую: `@/constants/categoryIcons` (не через index — там нет UI-зависимостей).
 */
import {
  Star,
  Plane,
  UtensilsCrossed,
  BookOpen,
  Briefcase,
  PenLine,
  Sparkles,
  Languages,
  FlaskConical,
  Landmark,
  Calculator,
  Code,
  Stethoscope,
  Globe,
  Palette,
  Music,
  Shapes,
  BookA,
  MessageCircle,
} from 'lucide-react-native';

export type CategoryIconComponent = typeof Star;

/** Категории наборов (SetCategory) и библиотеки (LIBRARY_CATEGORIES). */
export const CATEGORY_ICONS: Record<string, CategoryIconComponent> = {
  // Категории наборов
  general: Star,
  travel: Plane,
  food: UtensilsCrossed,
  study: BookOpen,
  work: Briefcase,
  grammar: PenLine,
  custom: Sparkles,
  languages: Languages,
  science: FlaskConical,
  history: Landmark,
  math: Calculator,
  programming: Code,
  medicine: Stethoscope,
  geography: Globe,
  art: Palette,
  music: Music,
  other: Shapes,
  // Категории библиотеки
  vocab: BookA,
  phrases: MessageCircle,
  business: Briefcase,
};

export const DEFAULT_CATEGORY_ICON: CategoryIconComponent = Star;

/** Иконка по ключу категории; для пустой или неизвестной — `Star` («Общие»). */
export function getCategoryIcon(category?: string | null): CategoryIconComponent {
  return (category && CATEGORY_ICONS[category]) || DEFAULT_CATEGORY_ICON;
}
