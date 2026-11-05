/**
 * Каналы Supabase Realtime (broadcast) — единственное место, где экраны и хуки получают канал
 * (plan/new/code_cleanup.md, Clean 5j). Экранам запрещено импортировать supabaseClient напрямую
 * (ESLint, Clean 5k), поэтому каналы — через эти функции.
 *
 * Тонкая обёртка без своей логики: те же вызовы `supabase.channel` / `supabase.removeChannel`.
 * supabase-js отдаёт на одно имя канала один объект — подписка и отписка остаются на стороне
 * вызывающего, как раньше.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/services/supabaseClient';

export type { RealtimeChannel };

/** Канал по имени (`test:<sessionId>`, `course:<courseId>`…) — как `supabase.channel(name)`. */
export function createChannel(name: string): RealtimeChannel {
  return supabase.channel(name);
}

/** Отписаться и убрать канал — как `supabase.removeChannel(channel)`. */
export function removeChannel(channel: RealtimeChannel) {
  return supabase.removeChannel(channel);
}
