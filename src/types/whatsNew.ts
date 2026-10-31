/**
 * Новость для окна «Что нового» (plan/new/whats_new.md)
 */

export type WhatsNewRole = 'student' | 'teacher';
export type WhatsNewPlatform = 'ios' | 'android' | 'web';

/** Иллюстрации, которые умеет рисовать сборка. Незнакомая — страница без картинки */
export const WHATS_NEW_ARTS = ['swipe', 'share', 'books', 'glass', 'xp', 'more'] as const;
export type WhatsNewArt = (typeof WHATS_NEW_ARTS)[number];

export interface WhatsNewItem {
  /** Никогда не меняется — иначе новость покажется снова */
  id: string;
  /** С какой версии приложения есть то, о чём новость */
  minVersion: string;
  roles: WhatsNewRole[];
  platforms: WhatsNewPlatform[];
  /** Минимальная версия ОС (например, '26' — стекло iOS 26) */
  minOs?: string | null;
  /** Больше — раньше */
  priority: number;
  tag: string;
  /** ≤ 40 символов */
  title: string;
  /** ≤ 140 символов */
  text: string;
  /** С сервера может прийти иллюстрация, которой нет в этой сборке */
  art?: string | null;
  action?: { label: string; route: string } | null;
  /** YYYY-MM-DD: раньше этой даты не показываем */
  publishedAt: string;
  /** YYYY-MM-DD: после этой даты не показываем */
  expiresAt?: string | null;
}

/** Страница окна: одна новость или «И ещё» со списком остальных */
export type WhatsNewPage =
  | { kind: 'item'; item: WhatsNewItem; art: WhatsNewArt | null }
  | { kind: 'summary'; items: WhatsNewItem[] };
