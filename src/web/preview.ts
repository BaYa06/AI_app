/**
 * Только в разработке: режим предпросмотра без аккаунта и сервера.
 * `?preview=teacher|guest|notTeacher|error` подменяет вход, а для `teacher` ещё и данные
 * (src/web/data/previewData.ts). Режим запоминается на вкладку, чтобы переходы по кабинету его не теряли.
 * В боевой сборке (__DEV__ = false) всегда возвращает null.
 */
export type PreviewMode = 'teacher' | 'guest' | 'notTeacher' | 'error';

const KEY = 'teach.preview';
const MODES: PreviewMode[] = ['teacher', 'guest', 'notTeacher', 'error'];

export function previewMode(): PreviewMode | null {
  if (!__DEV__ || typeof window === 'undefined') return null;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('preview');
    if (fromUrl) {
      if (MODES.includes(fromUrl as PreviewMode)) window.sessionStorage.setItem(KEY, fromUrl);
      else window.sessionStorage.removeItem(KEY);
    }
    const saved = window.sessionStorage.getItem(KEY);
    return MODES.includes(saved as PreviewMode) ? (saved as PreviewMode) : null;
  } catch {
    return null;
  }
}
