/*
  SahurHub app script.
  To add or change games, edit games.js. You should not need to touch this file.

  Liquid glass effect: @ybouane/liquidglass (MIT), https://liquid-glass.ybouane.com/
*/
(function () {
  'use strict';

  var LIQUID_GLASS_URL = 'https://cdn.jsdelivr.net/npm/@ybouane/liquidglass@1.0.3/dist/index.js';
  var KEYS = { theme: 'sahurhub.theme', favorites: 'sahurhub.favorites', recent: 'sahurhub.recent' };
  var MAX_RECENT = 12;
  var SPRING = 'cubic-bezier(.34, 1.56, .64, 1)';
  var EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function $(id) { return document.getElementById(id); }
  function reduceMotion() { return motionQuery.matches; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function normalize(value) {
    // Lowercase and strip accents, so "e" also finds "é".
    return String(value || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  }

  var storage = {
    get: function (key, fallback) {
      try {
        var raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set: function (key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
    getRaw: function (key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    setRaw: function (key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }
  };

  // ---------------------------------------------------------------------------
  // Icons (drawn for SahurHub)
  // ---------------------------------------------------------------------------

  var UI_ICONS = {
    house: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.8 9.4v9.6c0 .6.4 1 1 1H10v-5.5h4V20h3.2c.6 0 1-.4 1-1V9.4"/>',
    heart: '<path d="M12 20s-7.6-4.6-7.6-10.3A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.6 2.5C19.6 15.4 12 20 12 20Z"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.4V12l3.2 2"/>',
    search: '<circle cx="10.6" cy="10.6" r="6.4"/><path d="m15.4 15.4 4.9 4.9"/>',
    close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.1M12 19.3v2.1M4.7 4.7l1.5 1.5M17.8 17.8l1.5 1.5M2.6 12h2.1M19.3 12h2.1M4.7 19.3l1.5-1.5M17.8 6.2l1.5-1.5"/>',
    moon: '<path d="M19.6 14.6A8 8 0 0 1 9.4 4.4a8 8 0 1 0 10.2 10.2Z"/>',
    play: '<path d="M8 5.6v12.8a.8.8 0 0 0 1.2.7l10.3-6.4a.8.8 0 0 0 0-1.4L9.2 4.9A.8.8 0 0 0 8 5.6Z" fill="currentColor" stroke="none"/>',
    chevron: '<path d="m9 5.5 6.5 6.5L9 18.5"/>',
    controller: '<path d="M7.5 7.5h9a4.6 4.6 0 0 1 4.5 5.6l-.7 3.4a2.4 2.4 0 0 1-4.1 1.1L14.4 15.7H9.6l-1.8 1.9a2.4 2.4 0 0 1-4.1-1.1L3 13.1a4.6 4.6 0 0 1 4.5-5.6Z"/><path d="M8 10.4v3.2M6.4 12h3.2"/>'
  };

  function uiIcon(name, filled) {
    return '<svg class="ico' + (filled ? ' filled' : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (UI_ICONS[name] || '') + '</svg>';
  }

  var GLYPHS = {
    rocket: '<path d="M12 1.8c3.7 2.2 5.6 6 5.6 10.1 0 1.4-.2 2.7-.7 3.9l2.4 2.6-1 3.6-3.8-2.1H9.5l-3.8 2.1-1-3.6 2.4-2.6c-.5-1.2-.7-2.5-.7-3.9C6.4 7.8 8.3 4 12 1.8Z"/><circle cx="12" cy="10" r="2.3" fill="#000" fill-opacity=".28"/>',
    car: '<path d="M4.6 15.2 6.3 9.6A2.4 2.4 0 0 1 8.6 8h6.8a2.4 2.4 0 0 1 2.3 1.6l1.7 5.6V19a1 1 0 0 1-1 1h-1.6a1 1 0 0 1-1-1v-1H8.2v1a1 1 0 0 1-1 1H5.6a1 1 0 0 1-1-1Z"/><path d="M7.7 13.6 8.6 10.6h6.8l.9 3Z" fill="#000" fill-opacity=".28"/><circle cx="7.6" cy="16" r="1.2" fill="#000" fill-opacity=".28"/><circle cx="16.4" cy="16" r="1.2" fill="#000" fill-opacity=".28"/>',
    cube: '<path d="M12 2.8 20.2 7.4 12 12 3.8 7.4Z"/><path d="M3.8 7.4 12 12v9.2l-8.2-4.6Z" fill-opacity=".78"/><path d="M20.2 7.4 12 12v9.2l8.2-4.6Z" fill-opacity=".56"/>',
    sword: '<path d="M20.6 2.4 21.6 3.4l-1 4.4-8.9 8.9-2.4-2.4 8.9-8.9Z"/><path d="m5 13.6 5.4 5.4-1.6 1.6-1.4-1.4-2.6 2.6c-.4.4-1 .4-1.4 0l-.2-.2c-.4-.4-.4-1 0-1.4l2.6-2.6L4.4 16Z" fill-opacity=".8"/>',
    castle: '<path d="M4 21V8.5h2.6v2.2h2.1V8.5h2.6v2.2h1.4V8.5h2.6v2.2h2.1V8.5H20V21h-5.6v-3.6a2.4 2.4 0 0 0-4.8 0V21Z"/><path d="M9.6 3h4.8v4.2H9.6Z" fill-opacity=".7"/>',
    star: '<path d="m12 2.6 2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.4l-5.8 3 1.1-6.4-4.7-4.6 6.5-.9Z"/>',
    target: '<circle cx="12" cy="12" r="9.4"/><circle cx="12" cy="12" r="6.2" fill="#000" fill-opacity=".26"/><circle cx="12" cy="12" r="3.2"/>',
    bolt: '<path d="M13.8 1.8 4.6 13.6h6.2L9.8 22.2l9.6-12.4h-6.4Z"/>',
    bubbles: '<circle cx="9" cy="10.4" r="6.4"/><circle cx="17.4" cy="16.4" r="4.2" fill-opacity=".82"/><circle cx="17" cy="5.6" r="2.4" fill-opacity=".62"/><circle cx="7" cy="8.4" r="1.6" fill="#fff" fill-opacity=".55"/>',
    crown: '<path d="M2.8 7.6 7.4 11.8 12 4.4l4.6 7.4 4.6-4.2-2 11.2H4.8Z"/><path d="M4.8 18.8h14.4v2.2H4.8Z" fill-opacity=".72"/>',
    gem: '<path d="M7 3h10l4 6H3Z" fill-opacity=".72"/><path d="M3 9h18l-9 12.2Z"/>',
    controller: '<path d="M7.4 7h9.2a4.8 4.8 0 0 1 4.7 5.8l-.8 3.8a2.6 2.6 0 0 1-4.5 1.2L14.2 15.8H9.8l-1.8 2a2.6 2.6 0 0 1-4.5-1.2l-.8-3.8A4.8 4.8 0 0 1 7.4 7Z"/><path d="M7.8 9.8v3.6M6 11.6h3.6" stroke="#000" stroke-opacity=".3" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="10.6" r="1.25" fill="#000" fill-opacity=".3"/><circle cx="18" cy="13" r="1.25" fill="#000" fill-opacity=".3"/>'
  };

  function glyph(name) {
    return '<svg class="glyph" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' + (GLYPHS[name] || GLYPHS.controller) + '</svg>';
  }

  function fillIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(function (node) {
      if (node.firstChild) return;
      node.innerHTML = uiIcon(node.getAttribute('data-icon'), node.getAttribute('data-icon') === 'heart' && node.closest('.empty'));
    });
  }

  // ---------------------------------------------------------------------------
  // Game data
  // ---------------------------------------------------------------------------

  var COLOR_RE = /^#[0-9a-f]{3,8}$/i;

  function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    var trimmed = url.trim();
    if (/^(javascript|data|vbscript):/i.test(trimmed)) return '';
    return trimmed;
  }

  var GAMES = (Array.isArray(window.SAHURHUB_GAMES) ? window.SAHURHUB_GAMES : [])
    .filter(function (g) { return g && g.id && g.title; })
    .map(function (g) {
      var colors = Array.isArray(g.colors) ? g.colors : [];
      var game = {
        id: String(g.id),
        title: String(g.title),
        category: String(g.category || 'Other'),
        tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
        description: String(g.description || ''),
        icon: GLYPHS[g.icon] ? g.icon : 'controller',
        c1: COLOR_RE.test(colors[0]) ? colors[0] : '#5ac8fa',
        c2: COLOR_RE.test(colors[1]) ? colors[1] : '#5856d6',
        url: safeUrl(g.url),
        newTab: !!g.newTab,
        featured: !!g.featured,
        isNew: !!g.isNew
      };
      game.nTitle = normalize(game.title);
      game.nWords = game.nTitle.split(/[^a-z0-9]+/).filter(Boolean);
      game.nCategory = normalize(game.category);
      game.nTags = game.tags.map(normalize);
      game.nDesc = normalize(game.description);
      return game;
    });

  var BY_ID = {};
  GAMES.forEach(function (g) { BY_ID[g.id] = g; });

  var CATEGORIES = ['All'].concat(
    GAMES.map(function (g) { return g.category; })
      .filter(function (c, i, all) { return all.indexOf(c) === i; })
      .sort()
  );

  function artStyle(g) { return '--c1:' + g.c1 + ';--c2:' + g.c2; }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var state = {
    view: 'home',
    lastTab: 'home',
    category: 'All',
    query: '',
    searchOpen: false,
    sheetGame: null,
    favorites: storage.get(KEYS.favorites, []).filter(function (id) { return BY_ID[id]; }),
    recent: storage.get(KEYS.recent, []).filter(function (r) { return r && BY_ID[r.id]; })
  };

  function isFavorite(id) { return state.favorites.indexOf(id) !== -1; }

  // ---------------------------------------------------------------------------
  // Elements
  // ---------------------------------------------------------------------------

  var app = $('app');
  var content = $('content');
  var wallpaper = $('wallpaper');
  var topedge = $('topedge');
  var compactTitle = $('compact-title');
  var scrim = $('scrim');
  var themeBtn = $('theme-btn');
  var tabbar = $('tabbar');
  var tabIndicator = $('tab-indicator');
  var tabs = Array.prototype.slice.call(tabbar.querySelectorAll('.tab'));
  var searchbar = $('searchbar');
  var searchInput = $('search-input');
  var searchClear = $('search-clear');
  var searchBtn = $('search-btn');
  var sheet = $('sheet');
  var sheetBody = $('sheet-body');
  var sheetClose = $('sheet-close');
  var toast = $('toast');
  var views = {
    home: $('view-home'),
    favorites: $('view-favorites'),
    recent: $('view-recent'),
    search: $('view-search')
  };

  // ---------------------------------------------------------------------------
  // Liquid glass
  // ---------------------------------------------------------------------------

  var lg = null;
  var GLASS_ELEMENTS = [themeBtn, tabbar, searchbar, searchBtn, sheet];

  function isDark() { return document.documentElement.getAttribute('data-theme') === 'dark'; }

  function glassConfig(el) {
    var dark = isDark();
    var base = {
      refraction: 0.8,
      chromAberration: 0.05,
      edgeHighlight: dark ? 0.1 : 0.14,
      specular: 0.4,
      fresnel: 1,
      saturation: 0.2,
      brightness: dark ? -0.3 : 0.18,
      shadowOpacity: dark ? 0.45 : 0.16,
      shadowSpread: 14,
      shadowOffsetY: 4
    };
    var extra;
    if (el === themeBtn) extra = { blurAmount: 0.3, cornerRadius: 22, zRadius: 16, button: true, shadowSpread: 10 };
    else if (el === searchBtn) extra = { blurAmount: 0.34, cornerRadius: 31, zRadius: 22, button: true };
    else if (el === sheet) extra = { blurAmount: 1, refraction: 0.55, cornerRadius: 36, zRadius: 30, brightness: dark ? -0.36 : 0.26, saturation: 0.35, shadowOpacity: dark ? 0.55 : 0.24, shadowSpread: 30, shadowOffsetY: 10 };
    else extra = { blurAmount: 0.6, brightness: dark ? -0.36 : 0.32, saturation: dark ? 0.2 : -0.15, cornerRadius: 31, zRadius: 22 };
    return Object.assign(base, extra);
  }

  function applyGlassConfigs() {
    GLASS_ELEMENTS.forEach(function (el) {
      el.dataset.config = JSON.stringify(glassConfig(el));
    });
  }

  function visibleGlass() {
    var list = [themeBtn, searchBtn, state.searchOpen ? searchbar : tabbar];
    if (state.sheetGame) list.push(sheet);
    return list;
  }

  // Tell the glass that what is behind it moved (the page scrolled).
  function refreshGlass() {
    if (!lg) return;
    visibleGlass().forEach(function (el) { lg.markChanged(el); });
  }

  // The library only re-draws glass that is marked as changed. When a glass
  // element slides or fades (CSS transitions), mark it on every frame until the
  // movement ends so it never shows an old picture.
  function watchGlassMotion(el) {
    var running = 0;
    var frame = 0;
    var startedAt = 0;
    function tick() {
      if (lg) lg.markChanged(el);
      if (running > 0 && performance.now() - startedAt < 2000) frame = requestAnimationFrame(tick);
      else { frame = 0; running = 0; }
    }
    el.addEventListener('transitionrun', function (e) {
      if (e.target !== el) return;
      running++;
      startedAt = performance.now();
      if (!frame) frame = requestAnimationFrame(tick);
    });
    function finished(e) {
      if (e.target !== el) return;
      running = Math.max(0, running - 1);
      if (lg) lg.markChanged(el);
    }
    el.addEventListener('transitionend', finished);
    el.addEventListener('transitioncancel', finished);
  }

  // The library takes a picture of the page content and caches it. When the
  // page content changes (filters, favorites, theme), take a fresh picture.
  var captureTimers = new Map();
  function scheduleCapture(delay, targets) {
    (targets || [content]).forEach(function (target) {
      clearTimeout(captureTimers.get(target));
      captureTimers.set(target, setTimeout(function () { recapture(target); }, delay == null ? 450 : delay));
    });
  }
  function recapture(target) {
    if (!lg) return;
    var capture = lg.capture;
    if (capture && typeof capture.captureElement === 'function') {
      Promise.resolve(capture.captureElement(target, true)).catch(function () {});
    } else {
      lg.markChanged();
    }
  }

  async function initGlass() {
    applyGlassConfigs();
    GLASS_ELEMENTS.forEach(watchGlassMotion);
    try {
      var modulePromise = import(LIQUID_GLASS_URL);
      await Promise.all([document.fonts ? document.fonts.ready : null, wait(reduceMotion() ? 0 : 900)]);
      var mod = await modulePromise;
      lg = await mod.LiquidGlass.init({ root: app, glassElements: GLASS_ELEMENTS });
      document.documentElement.classList.add('lg-ready');
      // Re-take each glass element's own picture now that the temporary frosted
      // look is gone (a tiny DOM change makes the library notice).
      GLASS_ELEMENTS.forEach(function (el) {
        var t = document.createTextNode('');
        el.appendChild(t);
        t.remove();
      });
      scheduleCapture(150, [content, topedge]);
    } catch (err) {
      console.warn('SahurHub: liquid glass could not start, using the simple frosted look instead.', err);
      document.documentElement.classList.add('lg-fallback');
      lg = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Wallpaper (drawn on a canvas so the glass can bend it)
  // ---------------------------------------------------------------------------

  var WALLPAPERS = {
    light: {
      base: ['#e9eeff', '#fff1f6'],
      blobs: [
        [0.08, 0.1, 0.55, [90, 140, 255, 0.75]],
        [0.92, 0.18, 0.5, [200, 120, 255, 0.6]],
        [0.75, 0.82, 0.6, [255, 150, 190, 0.6]],
        [0.12, 0.88, 0.5, [255, 205, 120, 0.6]],
        [0.5, 0.5, 0.42, [110, 235, 215, 0.45]]
      ]
    },
    dark: {
      base: ['#04050d', '#0b0618'],
      blobs: [
        [0.1, 0.08, 0.55, [40, 80, 255, 0.55]],
        [0.92, 0.22, 0.5, [140, 50, 255, 0.5]],
        [0.78, 0.86, 0.6, [255, 45, 120, 0.4]],
        [0.1, 0.9, 0.5, [0, 190, 170, 0.38]],
        [0.5, 0.48, 0.4, [80, 60, 220, 0.3]]
      ]
    }
  };

  function drawWallpaper() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = window.innerWidth;
    var h = window.innerHeight;
    wallpaper.width = Math.max(1, Math.round(w * dpr));
    wallpaper.height = Math.max(1, Math.round(h * dpr));
    var ctx = wallpaper.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var theme = WALLPAPERS[isDark() ? 'dark' : 'light'];
    var base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, theme.base[0]);
    base.addColorStop(1, theme.base[1]);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    var size = Math.max(w, h);
    theme.blobs.forEach(function (b) {
      var x = b[0] * w;
      var y = b[1] * h;
      var r = b[2] * size;
      var c = b[3];
      var g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + c[3] + ')');
      g.addColorStop(1, 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    if (lg) lg.markChanged(wallpaper);
  }

  // ---------------------------------------------------------------------------
  // Theme (light / dark)
  // ---------------------------------------------------------------------------

  function setThemeAttr(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#05060c' : '#eef1fb');
    themeBtn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  function onThemeChanged() {
    drawWallpaper();
    applyGlassConfigs();
    paintScrim(!!state.sheetGame);
    scheduleCapture(420, [content, topedge]);
  }

  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    storage.setRaw(KEYS.theme, next);
    setThemeAttr(next);
    onThemeChanged();
  }

  function followSystemTheme() {
    if (storage.getRaw(KEYS.theme)) return; // the visitor picked one themselves
    setThemeAttr(darkQuery.matches ? 'dark' : 'light');
    onThemeChanged();
  }

  // ---------------------------------------------------------------------------
  // Rendering: cards, grids, rows
  // ---------------------------------------------------------------------------

  function favButtonState(btn, id) {
    var fav = isFavorite(id);
    btn.classList.toggle('is-fav', fav);
    btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
    var game = BY_ID[id];
    btn.setAttribute('aria-label', (fav ? 'Remove ' : 'Add ') + game.title + (fav ? ' from favorites' : ' to favorites'));
    btn.innerHTML = '<span data-icon="heart">' + uiIcon('heart', fav) + '</span>';
  }

  function highlightTitle(title, terms) {
    if (!terms || !terms.length) return escapeHtml(title);
    var lower = normalize(title);
    var marks = new Array(title.length).fill(false);
    terms.forEach(function (t) {
      if (!t) return;
      var from = 0;
      var idx;
      while ((idx = lower.indexOf(t, from)) !== -1) {
        for (var i = idx; i < idx + t.length && i < marks.length; i++) marks[i] = true;
        from = idx + t.length;
      }
    });
    var out = '';
    var open = false;
    for (var i = 0; i < title.length; i++) {
      if (marks[i] && !open) { out += '<mark>'; open = true; }
      if (!marks[i] && open) { out += '</mark>'; open = false; }
      out += escapeHtml(title[i]);
    }
    if (open) out += '</mark>';
    return out;
  }

  function createCard(g) {
    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = g.id;
    card.setAttribute('style', artStyle(g));
    var badges = '';
    if (g.isNew) badges += '<span class="badge badge-new">NEW</span>';
    if (!g.url) badges += '<span class="badge">SOON</span>';
    card.innerHTML =
      '<button class="card-hit" type="button" data-open="' + escapeHtml(g.id) + '" aria-label="' + escapeHtml(g.title + ', ' + g.category + '. Open details') + '"></button>' +
      '<div class="card-art">' + glyph(g.icon) + '</div>' +
      '<div class="card-body">' +
        '<h3 class="card-title"></h3>' +
        '<div class="card-meta"><span>' + escapeHtml(g.category) + '</span>' + badges + '</div>' +
      '</div>' +
      '<button class="fav-btn" type="button" data-fav="' + escapeHtml(g.id) + '"></button>';
    favButtonState(card.querySelector('.fav-btn'), g.id);
    return card;
  }

  var gridCaches = new WeakMap();

  // Show `games` in `grid`. Reuses card elements and animates them:
  // entering = staggered fade-in, otherwise cards glide to their new spots.
  function updateGrid(grid, games, opts) {
    opts = opts || {};
    var cache = gridCaches.get(grid);
    if (!cache) { cache = new Map(); gridCaches.set(grid, cache); }
    var animate = !reduceMotion();
    var first = new Map();
    if (animate && !opts.entering) {
      Array.prototype.forEach.call(grid.children, function (child) {
        first.set(child.dataset.id, child.getBoundingClientRect());
      });
    }
    var cards = games.map(function (g) {
      var card = cache.get(g.id);
      if (!card) { card = createCard(g); cache.set(g.id, card); }
      else favButtonState(card.querySelector('.fav-btn'), g.id);
      card.querySelector('.card-title').innerHTML = highlightTitle(g.title, opts.highlight);
      return card;
    });
    grid.replaceChildren.apply(grid, cards);
    if (!animate) return;
    var enterIndex = 0;
    cards.forEach(function (card) {
      var before = first.get(card.dataset.id);
      if (before) {
        var after = card.getBoundingClientRect();
        var dx = before.left - after.left;
        var dy = before.top - after.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          card.animate(
            [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
            { duration: 560, easing: SPRING }
          );
        }
      } else {
        card.animate(
          [{ opacity: 0, transform: 'translateY(18px) scale(.94)' }, { opacity: 1, transform: 'none' }],
          { duration: 560, delay: Math.min(enterIndex++, 14) * 40, easing: EASE_OUT, fill: 'backwards' }
        );
      }
    });
  }

  function renderChips(container) {
    container.innerHTML = CATEGORIES.map(function (c) {
      return '<button class="chip" type="button" data-category="' + escapeHtml(c) + '" aria-pressed="' + (c === state.category) + '">' + escapeHtml(c) + '</button>';
    }).join('');
  }

  function syncChips() {
    document.querySelectorAll('.chip').forEach(function (chip) {
      chip.setAttribute('aria-pressed', chip.dataset.category === state.category ? 'true' : 'false');
    });
  }

  function inCategory(g) { return state.category === 'All' || g.category === state.category; }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function renderFeatured() {
    var slot = $('featured-slot');
    var g = GAMES.filter(function (x) { return x.featured; })[0];
    if (!g) { slot.innerHTML = ''; return; }
    slot.innerHTML =
      '<article class="featured" style="' + artStyle(g) + '">' +
        '<button class="featured-hit" type="button" data-open="' + escapeHtml(g.id) + '" aria-label="' + escapeHtml(g.title + ', featured game. Open details') + '"></button>' +
        '<div class="featured-art">' + glyph(g.icon) + '</div>' +
        '<div class="featured-text">' +
          '<p class="featured-kicker">FEATURED</p>' +
          '<h2 class="featured-title">' + escapeHtml(g.title) + '</h2>' +
          '<p class="featured-desc">' + escapeHtml(g.description) + '</p>' +
          '<div class="featured-actions">' +
            '<button class="btn btn-light" type="button" data-play="' + escapeHtml(g.id) + '"><span data-icon="play">' + uiIcon('play') + '</span>Play</button>' +
            '<button class="btn btn-ghost" type="button" data-open="' + escapeHtml(g.id) + '">Details</button>' +
          '</div>' +
        '</div>' +
      '</article>';
  }

  function timeAgo(t) {
    var diff = Date.now() - t;
    var min = Math.round(diff / 60000);
    if (min < 1) return 'Just now';
    if (min < 60) return min + ' min ago';
    var hours = Math.round(min / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    var days = Math.round(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return days + ' days ago';
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function renderRecentRow() {
    var block = $('recent-block');
    var row = $('recent-row');
    var items = state.recent.slice(0, 8);
    block.hidden = items.length === 0;
    row.innerHTML = items.map(function (r) {
      var g = BY_ID[r.id];
      return '<button class="mini" type="button" data-open="' + escapeHtml(g.id) + '" style="' + artStyle(g) + '" aria-label="' + escapeHtml(g.title + ', played ' + timeAgo(r.t)) + '">' +
        '<div class="mini-art">' + glyph(g.icon) + '</div>' +
        '<div class="mini-title">' + escapeHtml(g.title) + '</div>' +
        '<div class="mini-meta">' + escapeHtml(timeAgo(r.t)) + '</div>' +
      '</button>';
    }).join('');
  }

  function renderHome(entering) {
    var list = GAMES.filter(inCategory);
    $('home-count').textContent = state.category === 'All' ? plural(list.length, 'game') : plural(list.length, 'game') + ' in ' + state.category;
    $('home-empty').hidden = GAMES.length > 0;
    renderRecentRow();
    updateGrid($('home-grid'), list, { entering: entering });
  }

  function renderFavorites(entering) {
    var list = GAMES.filter(function (g) { return isFavorite(g.id); });
    $('fav-count').textContent = list.length ? plural(list.length, 'game') : '';
    $('fav-empty').hidden = list.length > 0;
    updateGrid($('fav-grid'), list, { entering: entering });
  }

  function renderRecent() {
    var listEl = $('recent-list');
    $('recent-count').textContent = state.recent.length ? plural(state.recent.length, 'game') : '';
    $('recent-empty').hidden = state.recent.length > 0;
    $('clear-recent').hidden = state.recent.length === 0;
    listEl.innerHTML = state.recent.map(function (r) {
      var g = BY_ID[r.id];
      return '<button class="list-row" type="button" data-open="' + escapeHtml(g.id) + '" style="' + artStyle(g) + '">' +
        '<span class="list-icon">' + glyph(g.icon) + '</span>' +
        '<span class="list-text"><span class="list-title" style="display:block">' + escapeHtml(g.title) + '</span>' +
        '<span class="list-sub" style="display:block">' + escapeHtml(g.category + ' · ' + timeAgo(r.t)) + '</span></span>' +
        '<span class="list-chev">' + uiIcon('chevron') + '</span>' +
      '</button>';
    }).join('');
    if (!reduceMotion()) {
      Array.prototype.forEach.call(listEl.children, function (row, i) {
        row.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: Math.min(i, 10) * 35, easing: EASE_OUT, fill: 'backwards' });
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  // Allows one typo (an extra, missing or wrong letter) for words of 4+ letters.
  function withinOneEdit(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }

  function termScore(g, t) {
    if (g.nTitle.indexOf(t) === 0) return 14;
    if (g.nWords.some(function (w) { return w.indexOf(t) === 0; })) return 11;
    if (g.nTitle.indexOf(t) !== -1) return 8;
    if (g.nCategory.indexOf(t) === 0) return 7;
    if (g.nTags.some(function (tag) { return tag.indexOf(t) !== -1; })) return 6;
    if (g.nDesc.indexOf(t) !== -1) return 3;
    if (t.length >= 4 && g.nWords.some(function (w) { return withinOneEdit(w.slice(0, t.length + 1), t) || withinOneEdit(w, t); })) return 2;
    return 0;
  }

  function searchGames(terms) {
    var results = [];
    GAMES.forEach(function (g) {
      var total = 0;
      for (var i = 0; i < terms.length; i++) {
        var s = termScore(g, terms[i]);
        if (!s) return;
        total += s;
      }
      results.push({ g: g, score: total });
    });
    results.sort(function (a, b) { return b.score - a.score || a.g.title.localeCompare(b.g.title); });
    return results.map(function (r) { return r.g; });
  }

  function renderSuggestions(show) {
    var box = $('search-suggest');
    if (!show) { box.innerHTML = ''; return; }
    var counts = {};
    GAMES.forEach(function (g) { g.tags.forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var words = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a] || a.localeCompare(b); }).slice(0, 5);
    box.innerHTML = '<span class="suggest-label">Try</span>' + words.map(function (w) {
      return '<button type="button" data-suggest="' + escapeHtml(w) + '">' + escapeHtml(w) + '</button>';
    }).join('');
  }

  function renderSearch(entering) {
    var q = state.query.trim();
    var terms = normalize(q).split(/\s+/).filter(Boolean);
    var list = terms.length ? searchGames(terms).filter(inCategory) : GAMES.filter(inCategory);
    var summary = $('search-summary');
    if (!terms.length) {
      summary.textContent = state.category === 'All' ? 'Search ' + plural(GAMES.length, 'game') : plural(list.length, 'game') + ' in ' + state.category;
    } else {
      summary.textContent = plural(list.length, 'result') + ' for “' + q + '”' + (state.category === 'All' ? '' : ' in ' + state.category);
    }
    renderSuggestions(!terms.length);
    var empty = !list.length && terms.length > 0;
    $('search-empty').hidden = !empty;
    if (empty) {
      var otherCats = state.category !== 'All' && searchGames(terms).length > 0;
      $('search-empty-title').textContent = 'No results for “' + q + '”';
      $('search-empty-text').textContent = otherCats ? 'There are matches in other categories.' : 'Check the spelling or try a different word.';
      $('search-all-cats').hidden = !otherCats;
    }
    updateGrid($('search-grid'), list, { highlight: terms, entering: entering });
    scheduleCapture(620);
  }

  var searchTimer = 0;
  function onSearchInput() {
    state.query = searchInput.value;
    searchbar.classList.toggle('has-text', searchInput.value.length > 0);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { renderSearch(false); }, 90);
  }

  function openSearch() {
    if (state.searchOpen) { searchInput.focus({ preventScroll: true }); return; }
    if (state.sheetGame) closeSheet(true);
    state.searchOpen = true;
    document.body.classList.add('searching');
    searchbar.inert = false;
    tabbar.inert = true;
    searchBtn.setAttribute('aria-label', 'Close search');
    // Focus right away (inside the tap) so phones open the keyboard.
    searchInput.focus({ preventScroll: true });
    showView('search');
  }

  function closeSearch() {
    if (!state.searchOpen) return;
    state.searchOpen = false;
    state.query = '';
    searchInput.value = '';
    searchbar.classList.remove('has-text');
    document.body.classList.remove('searching');
    searchInput.blur();
    searchbar.inert = true;
    tabbar.inert = false;
    searchBtn.setAttribute('aria-label', 'Search games (press /)');
    showView(state.lastTab);
  }

  // ---------------------------------------------------------------------------
  // Views and tab bar
  // ---------------------------------------------------------------------------

  function renderView(name, entering) {
    if (name === 'home') renderHome(entering);
    else if (name === 'favorites') renderFavorites(entering);
    else if (name === 'recent') renderRecent();
    else if (name === 'search') renderSearch(entering);
  }

  function showView(name) {
    var changed = state.view !== name;
    if (name !== 'search') state.lastTab = name;
    if (changed) {
      views[state.view].classList.remove('is-active');
      views[name].classList.add('is-active');
      state.view = name;
      app.scrollTop = 0;
    }
    renderView(name, changed);
    updateTabs(true);
    compactTitle.textContent = views[name].getAttribute('data-title');
    scheduleCapture(700, [content, topedge]);
  }

  function updateTabs(animate) {
    tabs.forEach(function (tab) {
      if (tab.dataset.view === state.lastTab) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    moveIndicator(animate);
  }

  function moveIndicator(animate) {
    var tab = tabs.filter(function (t) { return t.dataset.view === state.lastTab; })[0];
    if (!tab) return;
    if (!animate) tabIndicator.classList.add('no-anim');
    tabIndicator.style.width = tab.offsetWidth + 'px';
    tabIndicator.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
    if (!animate) {
      tabIndicator.getBoundingClientRect();
      tabIndicator.classList.remove('no-anim');
    }
  }

  function bounce(node) {
    if (!node || reduceMotion()) return;
    node.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(.82)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }],
      { duration: 520, easing: EASE_OUT }
    );
  }

  // ---------------------------------------------------------------------------
  // Favorites and recently played
  // ---------------------------------------------------------------------------

  function toggleFavorite(id, sourceBtn) {
    var was = isFavorite(id);
    state.favorites = was
      ? state.favorites.filter(function (x) { return x !== id; })
      : [id].concat(state.favorites);
    storage.set(KEYS.favorites, state.favorites);
    document.querySelectorAll('.fav-btn[data-fav="' + CSS.escape(id) + '"]').forEach(function (btn) { favButtonState(btn, id); });
    if (state.sheetGame && state.sheetGame.id === id) syncSheetFav();
    if (!was) bounce(sourceBtn);
    if (state.view === 'favorites') renderFavorites(false);
    showToast(was ? 'Removed from Favorites' : 'Added to Favorites');
    scheduleCapture(500);
  }

  function addRecent(id) {
    state.recent = [{ id: id, t: Date.now() }].concat(state.recent.filter(function (r) { return r.id !== id; })).slice(0, MAX_RECENT);
    storage.set(KEYS.recent, state.recent);
    renderRecentRow();
    if (state.view === 'recent') renderRecent();
    scheduleCapture(500);
  }

  function clearRecent() {
    state.recent = [];
    storage.set(KEYS.recent, state.recent);
    renderRecentRow();
    renderRecent();
    showToast('Recently played cleared');
    scheduleCapture(300);
  }

  function playGame(g) {
    addRecent(g.id);
    if (!g.url) {
      showToast(g.title + ' is coming soon');
      return;
    }
    if (g.newTab) window.open(g.url, '_blank', 'noopener');
    else window.location.href = g.url;
  }

  // ---------------------------------------------------------------------------
  // Game details sheet
  // ---------------------------------------------------------------------------

  var lastFocus = null;

  function paintScrim(on) {
    var w = Math.max(1, window.innerWidth);
    var h = Math.max(1, window.innerHeight);
    if (scrim.width !== w || scrim.height !== h) { scrim.width = w; scrim.height = h; }
    var ctx = scrim.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (on) {
      ctx.fillStyle = isDark() ? 'rgba(0,0,0,0.5)' : 'rgba(10,14,40,0.26)';
      ctx.fillRect(0, 0, w, h);
    }
    if (lg) lg.markChanged(scrim);
  }

  function syncSheetFav() {
    var btn = sheetBody.querySelector('.btn-fav');
    if (!btn || !state.sheetGame) return;
    var fav = isFavorite(state.sheetGame.id);
    btn.classList.toggle('is-fav', fav);
    btn.setAttribute('aria-pressed', fav ? 'true' : 'false');
    btn.innerHTML = '<span data-icon="heart">' + uiIcon('heart', fav) + '</span>' + (fav ? 'Favorited' : 'Favorite');
  }

  function openSheet(g) {
    if (!g) return;
    lastFocus = document.activeElement;
    state.sheetGame = g;
    // Set colors as variables only; the glass library keeps its own inline styles here.
    sheet.style.setProperty('--c1', g.c1);
    sheet.style.setProperty('--c2', g.c2);
    sheet.style.removeProperty('translate');
    var tags = [g.category].concat(g.tags);
    sheetBody.innerHTML =
      '<div class="sheet-art">' + glyph(g.icon) + '</div>' +
      '<h2 class="sheet-title" id="sheet-title">' + escapeHtml(g.title) + '</h2>' +
      '<div class="sheet-sub"><span>' + escapeHtml(g.category) + '</span>' +
        (g.isNew ? '<span class="badge badge-new">NEW</span>' : '') +
        (g.url ? '' : '<span class="badge">COMING SOON</span>') + '</div>' +
      '<p class="sheet-desc">' + escapeHtml(g.description) + '</p>' +
      '<div class="sheet-tags">' + tags.map(function (t) { return '<span>' + escapeHtml(t) + '</span>'; }).join('') + '</div>' +
      '<div class="sheet-actions">' +
        '<button class="btn btn-primary" type="button" data-play="' + escapeHtml(g.id) + '"><span data-icon="play">' + uiIcon('play') + '</span>Play</button>' +
        '<button class="btn btn-tinted btn-fav" type="button" data-fav-sheet="' + escapeHtml(g.id) + '"></button>' +
      '</div>';
    syncSheetFav();
    sheetBody.scrollTop = 0;
    sheet.inert = false;
    sheet.classList.add('open');
    scrim.classList.add('open');
    paintScrim(true);
    setTimeout(function () { sheetClose.focus({ preventScroll: true }); }, 80);
  }

  function closeSheet(skipFocus) {
    if (!state.sheetGame) return;
    state.sheetGame = null;
    sheet.classList.remove('open');
    scrim.classList.remove('open');
    sheet.inert = true;
    setTimeout(function () { if (!state.sheetGame) paintScrim(false); }, 380);
    // If it was swiped down, let it slide away from where the finger left it.
    setTimeout(function () { if (!state.sheetGame) sheet.style.removeProperty('translate'); }, 600);
    if (!skipFocus && lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // Swipe the sheet down to close it (phones).
  function setupSheetDrag() {
    var startY = 0;
    var lastY = 0;
    var lastT = 0;
    var velocity = 0;
    var dragging = false;
    sheet.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || window.innerWidth >= 720) return;
      if (!e.target.closest('.sheet-grabber, .sheet-art')) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = performance.now();
      velocity = 0;
      sheet.classList.add('dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var now = performance.now();
      velocity = (e.clientY - lastY) / Math.max(1, now - lastT);
      lastY = e.clientY;
      lastT = now;
      var dy = e.clientY - startY;
      sheet.style.translate = '0 ' + (dy < 0 ? dy * 0.2 : dy) + 'px';
      if (lg) lg.markChanged(sheet);
    });
    function end() {
      if (!dragging) return;
      dragging = false;
      sheet.classList.remove('dragging');
      var dy = lastY - startY;
      if (dy > 120 || velocity > 0.7) {
        closeSheet();
      } else {
        sheet.style.transition = 'translate .45s ' + SPRING;
        sheet.style.translate = '0 0';
        setTimeout(function () { sheet.style.removeProperty('transition'); }, 460);
      }
    }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function trapFocus(e) {
    if (!state.sheetGame || e.key !== 'Tab') return;
    var focusables = Array.prototype.filter.call(
      sheet.querySelectorAll('button, [href], input, [tabindex]:not([tabindex="-1"])'),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
    if (!focusables.length) return;
    var firstEl = focusables[0];
    var lastEl = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  }

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------

  var toastTimer = 0;
  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  function onClick(e) {
    var target = e.target;

    var favBtn = target.closest('[data-fav]');
    if (favBtn) { toggleFavorite(favBtn.getAttribute('data-fav'), favBtn); return; }

    var favSheet = target.closest('[data-fav-sheet]');
    if (favSheet) {
      toggleFavorite(favSheet.getAttribute('data-fav-sheet'), null);
      if (favSheet.classList.contains('is-fav')) bounce(favSheet.querySelector('[data-icon]'));
      return;
    }

    var play = target.closest('[data-play]');
    if (play) { playGame(BY_ID[play.getAttribute('data-play')]); return; }

    var open = target.closest('[data-open]');
    if (open) { openSheet(BY_ID[open.getAttribute('data-open')]); return; }

    var chip = target.closest('[data-category]');
    if (chip) {
      if (chip.dataset.category === state.category) return;
      state.category = chip.dataset.category;
      syncChips();
      if (state.view === 'search') renderSearch(false); else renderHome(false);
      scheduleCapture(650);
      return;
    }

    var suggest = target.closest('[data-suggest]');
    if (suggest) {
      searchInput.value = suggest.getAttribute('data-suggest');
      onSearchInput();
      searchInput.focus({ preventScroll: true });
      return;
    }

    var go = target.closest('[data-goto]');
    if (go) { showView(go.getAttribute('data-goto')); return; }
  }

  var scrollFrame = 0;
  var edgeShown = false;
  function onScroll() {
    refreshGlass();
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(function () {
      scrollFrame = 0;
      var show = app.scrollTop > 64;
      if (show !== edgeShown) {
        edgeShown = show;
        topedge.classList.toggle('show', show);
        scheduleCapture(380, [topedge]);
      }
    });
  }

  var resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      drawWallpaper();
      if (state.sheetGame) paintScrim(true);
      moveIndicator(false);
    }, 120);
  }

  function setupKeyboardOffset() {
    var vv = window.visualViewport;
    if (!vv) return;
    function update() {
      var covered = window.innerHeight - vv.height - vv.offsetTop;
      document.documentElement.style.setProperty('--kb', covered > 80 ? Math.round(covered) + 'px' : '0px');
    }
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
  }

  function setupEvents() {
    content.addEventListener('click', onClick);
    sheet.addEventListener('click', onClick);
    app.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);

    themeBtn.addEventListener('click', function () {
      toggleTheme();
      bounce(themeBtn.querySelector(isDark() ? '.icon-moon' : '.icon-sun'));
    });

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.dataset.view;
        bounce(tab.querySelector('[data-icon]'));
        if (name === state.view) {
          app.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
          return;
        }
        showView(name);
      });
    });

    searchBtn.addEventListener('click', function () {
      if (state.searchOpen) closeSearch(); else openSearch();
    });
    searchInput.addEventListener('input', onSearchInput);
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var firstCard = $('search-grid').querySelector('.card');
        if (firstCard) { searchInput.blur(); openSheet(BY_ID[firstCard.dataset.id]); }
      }
    });
    searchClear.addEventListener('click', function () {
      searchInput.value = '';
      onSearchInput();
      searchInput.focus({ preventScroll: true });
    });
    $('search-all-cats').addEventListener('click', function () {
      state.category = 'All';
      syncChips();
      renderSearch(false);
    });
    $('clear-recent').addEventListener('click', clearRecent);

    sheetClose.addEventListener('click', function () { closeSheet(); });
    scrim.addEventListener('click', function () { closeSheet(); });
    scrim.addEventListener('wheel', function (e) { e.preventDefault(); }, { passive: false });
    scrim.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
    setupSheetDrag();

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (state.sheetGame) { closeSheet(); return; }
        if (state.searchOpen) { closeSearch(); return; }
      }
      trapFocus(e);
      var tag = document.activeElement && document.activeElement.tagName;
      var typing = tag === 'INPUT' || tag === 'TEXTAREA';
      if (!typing && !state.sheetGame && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        openSearch();
      }
    });

    if (darkQuery.addEventListener) darkQuery.addEventListener('change', followSystemTheme);
    setupKeyboardOffset();
  }

  // ---------------------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------------------

  function start() {
    fillIcons(document);
    setThemeAttr(isDark() ? 'dark' : 'light');
    $('today').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    drawWallpaper();
    document.documentElement.classList.add('wallpaper-ready');

    renderFeatured();
    renderChips($('home-chips'));
    renderChips($('search-chips'));
    renderHome(true);
    updateTabs(false);
    if (document.fonts) document.fonts.ready.then(function () { moveIndicator(false); });
    setupEvents();

    requestAnimationFrame(function () {
      requestAnimationFrame(function () { document.body.classList.add('ready'); });
    });

    initGlass();
  }

  start();
})();
