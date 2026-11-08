/**
 * Иконки каталога библиотеки (plan/new/library_catalog.md): в базе у предмета и подборки хранится
 * имя иконки lucide (`library_subjects.icon`, `library_collections.icon`) — здесь оно превращается
 * в компонент. Неизвестное имя — книга. Импорт напрямую: `@/constants/catalogIcons` (как categoryIcons).
 */
import {
  BookOpen,
  Briefcase,
  Calculator,
  ClipboardCheck,
  Clock,
  Flag,
  FlaskConical,
  Globe,
  GraduationCap,
  Heart,
  Home,
  Landmark,
  Languages,
  Lightbulb,
  Link,
  MapPin,
  MessageCircle,
  Mountain,
  Plane,
  ScrollText,
  Users,
  Utensils,
} from 'lucide-react-native';
import type { CategoryIconComponent } from './categoryIcons';

const CATALOG_ICONS: Record<string, CategoryIconComponent> = {
  globe: Globe,
  languages: Languages,
  landmark: Landmark,
  'map-pin': MapPin,
  'clipboard-check': ClipboardCheck,
  'flask-conical': FlaskConical,
  plane: Plane,
  briefcase: Briefcase,
  utensils: Utensils,
  home: Home,
  house: Home,
  'message-circle': MessageCircle,
  clock: Clock,
  heart: Heart,
  flag: Flag,
  mountain: Mountain,
  'book-open': BookOpen,
  calculator: Calculator,
  users: Users,
  link: Link,
  'scroll-text': ScrollText,
  'graduation-cap': GraduationCap,
  lightbulb: Lightbulb,
};

export function getCatalogIcon(name: string | null | undefined): CategoryIconComponent {
  return (name && CATALOG_ICONS[name]) || BookOpen;
}
