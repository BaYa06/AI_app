/**
 * Ссылки на набор (plan/new/share_set.md, Share 4): код из адреса.
 * - https://<домен>/s/<code> — Universal Link (после Share 7), Smart App Banner, вставленная ссылка;
 * - flashly://share/<code> — кнопка «Открыть набор» на странице-превью;
 * - веб: ?share=<code> — кнопка «Открыть в Flashly» на странице-превью.
 * Домен не проверяем: Universal Link приходит только с наших доменов, а со своим доменом
 * (plan/new/share_set.md, «Домен») старые и новые ссылки разбираются одинаково.
 */

const CODE = '([0-9A-Za-z]{10})';
const HTTPS_RE = new RegExp(`^https?://[^/]+/s/${CODE}(?:[/?#]|$)`);
const SCHEME_RE = new RegExp(`^flashly://share/${CODE}(?:[/?#]|$)`);
const CODE_RE = new RegExp(`^${CODE}$`);

export function parseShareUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(HTTPS_RE) || url.match(SCHEME_RE);
  return match ? match[1] : null;
}

export function isShareCode(value: string | null | undefined): value is string {
  return !!value && CODE_RE.test(value);
}

const ANYWHERE_RE = new RegExp(`(?:https?://[^\\s/]+/s/|flashly://share/)${CODE}(?![0-9A-Za-z])`);

/**
 * Код из вставленного текста (Share 5): ссылка где угодно в тексте — люди вставляют сообщение
 * целиком («Вот мой набор … https://…/s/CODE») — или сам код.
 */
export function findShareCode(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (CODE_RE.test(trimmed)) return trimmed;
  const match = trimmed.match(ANYWHERE_RE);
  return match ? match[1] : null;
}

// Окно превью живёт в App.tsx над навигатором; экраны просят открыть его через этот сигнал.
let openShareListener: ((code: string) => void) | null = null;

export function requestOpenShare(code: string): void {
  openShareListener?.(code);
}

export function onOpenShareRequest(listener: (code: string) => void): () => void {
  openShareListener = listener;
  return () => {
    if (openShareListener === listener) openShareListener = null;
  };
}
