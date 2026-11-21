/* Раздел «Помощь учителю» (plan/new/teacher_help.md): поиск с ответами в выдаче, просмотр
   вертикальных роликов на весь экран, «Помогло?», отметки «просмотрено». Без этого скрипта
   страницы тоже работают: ответы раскрываются через <details>, поиск ведёт на хаб. */
(function () {
  'use strict';
  var BASE = '/teachers/help';
  var input = document.getElementById('hq');
  var results = document.getElementById('h-results');
  var page = document.getElementById('h-page');
  var clearBtn = document.querySelector('.h-clear');
  var kbd = document.querySelector('.h-kbd');
  var data = null;
  var loading = null;

  var store = {
    get: function (k) {
      try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; }
    },
    set: function (k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* приватный режим */ }
    },
  };
  var SEEN_KEY = 'flashly-help-seen';
  var seen = store.get(SEEN_KEY) || [];
  function markSeen(slug) {
    if (seen.indexOf(slug) < 0) { seen.push(slug); store.set(SEEN_KEY, seen); }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function toast(text) {
    var old = document.querySelector('.h-toast');
    if (old) old.remove();
    var el = document.createElement('div');
    el.className = 'h-toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading)
      loading = fetch('/site/help/index.json')
        .then(function (r) { return r.json(); })
        .then(function (d) { data = d; return d; })
        .catch(function () { loading = null; return null; });
    return loading;
  }

  // ─── Поиск ────────────────────────────────────────────────────────────────
  var SYN = [
    ['группа', 'класс', 'курс'],
    ['ученик', 'студент', 'ребенок', 'дети', 'школьник'],
    ['тест', 'экзамен', 'контрольная', 'опрос', 'викторина', 'проверочная'],
    ['задание', 'домашка', 'дз', 'домашнее'],
    ['код', 'ссылка', 'qr', 'пригласить', 'приглашение', 'подключить', 'добавить'],
    ['набор', 'слова', 'карточки', 'словарь'],
    ['учебник', 'книга', 'юнит', 'unit', 'глава'],
    ['отчет', 'родители', 'родителям'],
  ];
  function norm(s) {
    return s.toLowerCase().replace(/ё/g, 'е').replace(/[«»"?.,!:;—–()…]/g, ' ');
  }
  function stem(w) { return w.length > 4 ? w.slice(0, -1) : w; }
  function expand(w) {
    var out = [w];
    SYN.forEach(function (g) {
      var hit = g.some(function (x) { return x.indexOf(w) === 0 || w.indexOf(stem(x)) === 0; });
      if (hit) g.forEach(function (x) { if (out.indexOf(stem(x)) < 0) out.push(stem(x)); });
    });
    return out;
  }
  function search(text) {
    var words = norm(text).split(/\s+/).filter(function (w) { return w.length > 1; });
    if (!words.length || !data) return [];
    return data.questions
      .map(function (x) {
        var hq = norm(x.q), ha = norm(x.a + ' ' + x.k + ' ' + x.c);
        var score = 0, all = true;
        words.forEach(function (w) {
          var hit = 0;
          expand(stem(w)).forEach(function (v) {
            if (hq.indexOf(v) >= 0) hit = Math.max(hit, 3);
            else if (ha.indexOf(v) >= 0) hit = Math.max(hit, 1);
          });
          if (!hit) all = false;
          score += hit;
        });
        if (x.u) score += 0.5;
        return { x: x, score: all ? score + 2 : score * 0.5 };
      })
      .filter(function (r) { return r.score >= 1.5; })
      .sort(function (a, b) { return b.score - a.score; })
      .map(function (r) { return r.x; });
  }
  function hl(text, query) {
    var out = esc(text);
    norm(query).split(/\s+/).filter(function (w) { return w.length > 2; }).forEach(function (w) {
      var re = new RegExp('(' + stem(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[а-яёa-z]*)', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function row(x, query, open) {
    var badges =
      (x.d ? '<span class="h-badge h-draftb">черновик</span>' : '') +
      (x.u ? '<span class="h-badge h-urg">на уроке</span>' : '') +
      (x.n ? '<span class="h-badge h-new">новое</span>' : '') +
      (x.v ? '<span class="h-badge h-vid">▶ ' + esc(x.v) + '</span>' : '') +
      '<span class="h-badge">' + esc(x.c) + '</span>';
    var where = '<div class="h-where"><span class="h-wl">Где:</span>' +
      x.w.map(function (w) { return '<span class="h-crumb">' + esc(w) + '</span>'; })
        .join('<span class="h-sep" aria-hidden="true">›</span>') + '</div>';
    return '<details class="h-q"' + (open ? ' open' : '') + '><summary><span class="h-qt"><b>' + hl(x.q, query) +
      '</b><span class="h-meta">' + badges + '</span></span><svg class="h-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg></summary>' +
      '<div class="h-qb"><p class="h-short">' + hl(x.a, query) + '</p>' + where +
      '<a class="h-more" href="' + BASE + '/' + x.s + '">' + (x.v ? 'Шаги и ролик' : 'Подробнее') + ' →</a></div></details>';
  }
  function plural(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'вопрос';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'вопроса';
    return 'вопросов';
  }
  var SUPPORT = '<section class="h-support" style="margin-top:24px"><div><h2>Не нашли ответ?</h2><p>Напишите нам из приложения: Профиль → «Мои обращения» → «Написать нам», или на support@flashlycards.app.</p></div><a class="btn" href="/support">Поддержка</a></section>';
  function render() {
    var text = input.value.trim();
    clearBtn.hidden = !text;
    if (kbd) kbd.hidden = !!text;
    if (!text) { results.hidden = true; page.hidden = false; return; }
    load().then(function () {
      if (input.value.trim() !== text) return;
      var r = search(text);
      page.hidden = true;
      results.hidden = false;
      if (!r.length) {
        results.innerHTML = '<div class="h-empty"><b>Ничего не нашли по «' + esc(text) + '»</b>Попробуйте другие слова или выберите тему.<div class="h-suggest">' +
          ['код курса', 'не видит набор', 'живой тест', 'учебник', 'удалить ученика'].map(function (s) {
            return '<button class="h-chip" type="button">' + s + '</button>';
          }).join('') + '</div></div>' + SUPPORT;
        Array.prototype.forEach.call(results.querySelectorAll('.h-chip'), function (b) {
          b.addEventListener('click', function () { input.value = b.textContent; render(); });
        });
        return;
      }
      results.innerHTML = '<div class="h-rh"><h2>Ответы</h2><p>' + r.length + ' ' + plural(r.length) + ' · Enter — открыть первый</p></div><div class="h-list">' +
        r.slice(0, 10).map(function (x, i) { return row(x, text, i < 2); }).join('') + '</div>' + SUPPORT;
    });
  }
  if (input) {
    input.addEventListener('focus', load, { once: true });
    input.addEventListener('input', render);
    input.form.addEventListener('submit', function (e) {
      e.preventDefault();
      load().then(function () {
        var r = search(input.value);
        if (r[0]) location.href = BASE + '/' + r[0].s;
      });
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; render(); input.blur(); }
    });
    clearBtn.addEventListener('click', function () { input.value = ''; render(); input.focus(); });
    document.addEventListener('keydown', function (e) {
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !viewer) { e.preventDefault(); input.focus(); }
    });
    var q = new URLSearchParams(location.search).get('q');
    if (q) { input.value = q; render(); }
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-go="search"]'), function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); input.focus(); window.scrollTo(0, 0); });
  });

  // ─── Отметки «просмотрено» ────────────────────────────────────────────────
  var slug = document.body.getAttribute('data-slug');
  if (slug) markSeen(slug);
  function paintSeen() {
    Array.prototype.forEach.call(document.querySelectorAll('.h-step[data-slug], .h-reel[data-slug]'), function (el) {
      el.classList.toggle('is-seen', seen.indexOf(el.getAttribute('data-slug')) >= 0);
    });
    var steps = document.querySelectorAll('.h-step[data-slug]');
    var counter = document.getElementById('h-first-count');
    if (counter && steps.length) {
      var done = Array.prototype.filter.call(steps, function (el) { return el.classList.contains('is-seen'); }).length;
      counter.textContent = done + ' из ' + steps.length + ' просмотрено';
    }
  }
  paintSeen();

  // ─── «Помогло?» и ссылка ──────────────────────────────────────────────────
  var helpful = document.getElementById('h-helpful');
  if (helpful) {
    Array.prototype.forEach.call(helpful.querySelectorAll('[data-helpful]'), function (b) {
      b.addEventListener('click', function () {
        var yes = b.getAttribute('data-helpful') === '1';
        helpful.innerHTML = yes
          ? '<span class="h-thanks">Спасибо! Рады, что помогло.</span>'
          : '<span>Жаль. Напишите, что не получилось, — допишем ответ.</span> <a class="btn" href="/support">Написать нам</a>';
      });
    });
    var copy = helpful.querySelector('[data-copy]');
    if (copy)
      copy.addEventListener('click', function () {
        var url = copy.getAttribute('data-copy');
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast('Ссылка скопирована'); }, function () { toast(url); });
        else toast(url);
      });
  }

  // ─── Ролики на весь экран ─────────────────────────────────────────────────
  var viewer = null, vIdx = -1, startAt = 0;
  var ICON_UP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 15 6-6 6 6"/></svg>';
  var ICON_DOWN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  function openViewer(s, start) {
    load().then(function (d) {
      if (!d) return;
      var i = -1;
      d.videos.forEach(function (v, k) {
        if (i < 0 && (v.s === s || (v.ss || []).indexOf(s) >= 0)) i = k;
      });
      if (i < 0) return;
      vIdx = i;
      startAt = start || 0;
      draw();
      document.documentElement.style.overflow = 'hidden';
    });
  }
  function closeViewer() {
    if (viewer) viewer.remove();
    viewer = null;
    vIdx = -1;
    document.documentElement.style.overflow = '';
    paintSeen();
  }
  function step(dir) {
    var n = vIdx + dir;
    if (n < 0 || n >= data.videos.length) return;
    vIdx = n;
    startAt = 0;
    draw();
  }
  function draw() {
    var list = data.videos, v = list[vIdx];
    (v.ss || [v.s]).forEach(markSeen);
    if (viewer) viewer.remove();
    viewer = document.createElement('div');
    viewer.className = 'h-viewer';
    viewer.setAttribute('role', 'dialog');
    viewer.setAttribute('aria-modal', 'true');
    viewer.setAttribute('aria-label', 'Ролик: ' + v.q);
    var src = 'https://www.youtube-nocookie.com/embed/' + v.id + '?autoplay=1&playsinline=1&rel=0&modestbranding=1' + (startAt ? '&start=' + startAt : '');
    viewer.innerHTML =
      '<div class="h-vscreen">' +
      '<div class="h-vprog">' + list.map(function (_, i) { return '<i class="' + (i <= vIdx ? 'on' : '') + '"></i>'; }).join('') + '</div>' +
      '<iframe src="' + src + '" title="' + esc(v.q) + '" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
      '<div class="h-vinfo"><b>' + esc(v.q) + '</b><a href="' + BASE + '/' + v.s + '">Шаги текстом →</a></div>' +
      '<div class="h-vnav"><button class="h-vbtn" data-dir="-1" aria-label="Предыдущий ролик"' + (vIdx === 0 ? ' disabled' : '') + '>' + ICON_UP + '</button>' +
      '<button class="h-vbtn" data-dir="1" aria-label="Следующий ролик"' + (vIdx === list.length - 1 ? ' disabled' : '') + '>' + ICON_DOWN + '</button></div>' +
      '</div>' +
      '<button class="h-vbtn h-vclose" aria-label="Закрыть">' + ICON_X + '</button>' +
      '<div class="h-vhint">Листайте вверх — следующий ролик · ' + (vIdx + 1) + ' из ' + list.length + '</div>';
    document.body.appendChild(viewer);
    viewer.querySelector('.h-vclose').addEventListener('click', closeViewer);
    viewer.querySelector('.h-vclose').focus();
    Array.prototype.forEach.call(viewer.querySelectorAll('[data-dir]'), function (b) {
      b.addEventListener('click', function () { step(Number(b.getAttribute('data-dir'))); });
    });
    viewer.addEventListener('click', function (e) { if (e.target === viewer) closeViewer(); });
    var y0 = null;
    viewer.addEventListener('touchstart', function (e) { y0 = e.touches[0].clientY; }, { passive: true });
    viewer.addEventListener('touchend', function (e) {
      if (y0 === null) return;
      var dy = e.changedTouches[0].clientY - y0;
      if (dy < -60) step(1); else if (dy > 60) step(-1);
      y0 = null;
    });
    viewer.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) > 40) { e.preventDefault(); step(e.deltaY > 0 ? 1 : -1); }
    }, { passive: false });
  }
  document.addEventListener('keydown', function (e) {
    if (!viewer) return;
    if (e.key === 'Escape') closeViewer();
    if (e.key === 'ArrowDown') step(1);
    if (e.key === 'ArrowUp') step(-1);
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-video]');
    if (!el) return;
    e.preventDefault();
    openViewer(el.getAttribute('data-video'), Number(el.getAttribute('data-start') || 0));
  });
})();
