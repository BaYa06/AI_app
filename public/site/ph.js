/*
 * PostHog на сайте flashlycards.app (лендинг, SEO-страницы, помощь): просмотры страниц, клики,
 * источники переходов. Ключ публичный (phc_…), тот же проект, что у приложения
 * (src/config/posthog.ts). Записи сессий на сайте не ведём, поля ввода скрыты.
 * На localhost не отправляем; превью Vercel помечаем app_env=staging.
 */
(function () {
  var host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return;
  var prod = host === 'flashlycards.app' || /\.flashlycards\.app$/.test(host) || host === 'ai-app-seven-zeta.vercel.app';

  // Официальный загрузчик PostHog: очередь вызовов до загрузки array.js
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog&&window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister identify alias reset get_distinct_id opt_in_capturing opt_out_capturing has_opted_out_capturing".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  window.posthog.init('phc_AXY9W7RgtYSWPJkcRNjyd8ehGtMbQ8Fn5SKWuM4LUGss', {
    api_host: 'https://us.i.posthog.com',
    defaults: '2025-05-24',
    person_profiles: 'identified_only',
    disable_session_recording: true,
  });
  window.posthog.register({ app_env: prod ? 'production' : 'staging', surface: 'site' });
})();
