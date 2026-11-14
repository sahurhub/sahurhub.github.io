/*
  SahurHub stats: time spent on the site and in each opsec, kept on this device
  only (localStorage "sahurhub.stats"). Used by index.html, play.html and the
  about:blank tab that app.js opens for games.

  What is counted:
    site  - while a SahurHub page is on screen (stops after 5 minutes with no
            mouse, keyboard or touch, so a forgotten tab doesn't count)
    games - while an opsec opened in about:blank or SahurHub mode is on screen
    plays - every time Play is pressed (all open modes, including New tab)
  Opsecs opened in a normal new tab can't be timed, so only their plays count.
*/
(function () {
  'use strict';

  var KEY = 'sahurhub.stats';
  var KEEP_DAYS = 400; // daily totals kept for the chart and streaks

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function normalize(s) {
    s = s && typeof s === 'object' ? s : {};
    if (typeof s.first !== 'number') s.first = Date.now();
    if (typeof s.site !== 'number') s.site = 0;
    if (!s.games || typeof s.games !== 'object') s.games = {};
    if (!s.days || typeof s.days !== 'object') s.days = {};
    if (typeof s.best !== 'number') s.best = 0;
    return s;
  }
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* private mode or broken data */ }
    return normalize(s);
  }
  function save(s) {
    var keys = Object.keys(s.days).sort();
    while (keys.length > KEEP_DAYS) delete s.days[keys.shift()];
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
  }

  // Counts time while the page is on screen. Written as one self-contained
  // function so app.js can also run it inside the about:blank game tab.
  function tracker(kind, id) {
    var KEY = 'sahurhub.stats';
    var TICK = 5000;          // check every 5 seconds
    var MAX_GAP = 15000;      // a longer gap means the computer slept: don't count it
    var IDLE = 5 * 60 * 1000; // site only: stop after 5 minutes with no input
    var last = Date.now();
    var lastInput = Date.now();
    var pending = 0;

    function pad(n) { return (n < 10 ? '0' : '') + n; }
    function dayKey(t) {
      var d = new Date(t);
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
    function onScreen() { return document.visibilityState === 'visible'; }
    function active(now) { return kind !== 'site' || now - lastInput < IDLE; }
    function account(now, counts) {
      var gap = now - last;
      last = now;
      if (counts && gap > 0 && gap <= MAX_GAP) pending += gap;
    }
    function flush() {
      if (!pending) return;
      var ms = pending;
      pending = 0;
      var s = null;
      try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignore */ }
      s = s && typeof s === 'object' ? s : {};
      if (typeof s.first !== 'number') s.first = Date.now();
      if (typeof s.site !== 'number') s.site = 0;
      if (!s.games || typeof s.games !== 'object') s.games = {};
      if (!s.days || typeof s.days !== 'object') s.days = {};
      if (kind === 'site') s.site += ms;
      else {
        var g = s.games[id] || (s.games[id] = { ms: 0, plays: 0 });
        g.ms = (g.ms || 0) + ms;
        g.last = Date.now();
      }
      var k = dayKey(Date.now());
      s.days[k] = (s.days[k] || 0) + ms;
      try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ }
    }

    setInterval(function () {
      var now = Date.now();
      account(now, onScreen() && active(now));
      if (pending >= 10000) flush();
    }, TICK);
    document.addEventListener('visibilitychange', function () {
      var now = Date.now();
      if (document.visibilityState === 'hidden') { account(now, active(now)); flush(); }
      else last = now;
    });
    window.addEventListener('pagehide', function () {
      var now = Date.now();
      account(now, onScreen() && active(now));
      flush();
    });
    if (kind === 'site') {
      var seen = function () { lastInput = Date.now(); };
      ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (type) {
        window.addEventListener(type, seen, { passive: true, capture: true });
      });
    }
  }

  function recordPlay(id) {
    var s = load();
    var g = s.games[id] || (s.games[id] = { ms: 0, plays: 0 });
    g.plays = (g.plays || 0) + 1;
    g.last = Date.now();
    var k = dayKey(Date.now());
    if (!s.days[k]) s.days[k] = 0; // pressing Play counts as visiting that day
    save(s);
  }

  // Opening SahurHub marks today as visited (for streaks) straight away.
  function markVisit() {
    var s = load();
    var k = dayKey(Date.now());
    if (s.days[k] == null) { s.days[k] = 0; save(s); }
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  }

  window.SahurHubStats = {
    load: load,
    save: save,
    dayKey: dayKey,
    track: tracker,
    trackerSource: tracker.toString(),
    recordPlay: recordPlay,
    markVisit: markVisit,
    reset: reset
  };
})();
