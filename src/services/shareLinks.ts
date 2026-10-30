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
