/**
 * Routing Middleware Vercel (plan/new/official_site.md, Site 3).
 *
 * Главная flashlycards.app показывает лендинг (public/site/index.html), а не приложение.
 * Правилом в vercel.json это не сделать: на «/» лежит index.html приложения, а файл в сборке
 * важнее rewrites. Middleware срабатывает раньше файлов, поэтому подменяем ответ здесь.
 *
 * Запускается только на «/» (matcher), остальные адреса не трогает: app.flashlycards.app,
 * старый ai-app-seven-zeta.vercel.app и Preview получают приложение, как раньше.
 */
import { rewrite } from '@vercel/functions';

export const config = {
  matcher: '/',
};

const SITE_HOSTS = new Set(['flashlycards.app']);

export default function middleware(request) {
  const host = String(request.headers.get('host') || new URL(request.url).host)
    .split(':')[0]
    .toLowerCase();

  if (SITE_HOSTS.has(host)) {
    return rewrite(new URL('/site/index.html', request.url));
  }
  // Ничего не возвращаем — запрос идёт дальше обычным путём (index.html приложения)
}
