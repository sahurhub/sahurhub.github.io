/*
  SahurHub "Next up" countdown
  Shows what is next at school (or what is on now) and counts down live,
  using this device's own clock. No server needed.
*/
(function () {
  'use strict';

  // ===========================================================================
  // SCHOOL DAY TIMES: edit this list to change the schedule.
  // Use 24-hour "HH:MM" times. Any gap between two periods counts as
  // "Passing time". Names containing "Break", "Lunch" or "Tutor" get their
  // own color; everything else is treated as a lesson.
  // ===========================================================================
  var SCHOOL_DAY = [
    { name: 'Tutor time', start: '08:45', end: '09:00' },
    { name: 'Lesson 1',   start: '09:05', end: '10:05' },
    { name: 'Lesson 2',   start: '10:10', end: '11:10' },
    { name: 'Break',      start: '11:10', end: '11:30' },
    { name: 'Lesson 3',   start: '11:30', end: '12:30' },
    { name: 'Lesson 4',   start: '12:35', end: '13:35' },
    { name: 'Lunch',      start: '13:35', end: '14:15' },
    { name: 'Lesson 5',   start: '14:15', end: '15:15' }
  ];

  // Which days have school: 1 = Monday ... 5 = Friday (0 = Sunday, 6 = Saturday).
  var SCHOOL_DAYS = [1, 2, 3, 4, 5];
  // ===========================================================================

  function toMinutes(text) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  }

  function typeOf(name) {
    if (/break/i.test(name)) return 'break';
    if (/lunch/i.test(name)) return 'lunch';
    if (/tutor/i.test(name)) return 'tutor';
    return 'lesson';
  }

  var PERIODS = SCHOOL_DAY
    .map(function (p) {
      var start = toMinutes(p.start);
      var end = toMinutes(p.end);
      if (start === null || end === null || end <= start) {
        console.warn('SahurHub countdown: skipped a period with bad times:', p);
        return null;
      }
      return { name: String(p.name), start: start, end: end, startText: p.start.trim(), endText: p.end.trim(), type: typeOf(p.name) };
    })
    .filter(Boolean)
    .sort(function (a, b) { return a.start - b.start; });
  PERIODS.forEach(function (p, i) { p.index = i; });

  // ---------------------------------------------------------------------------
  // Working out where we are in the day (pure functions: they only read "now")
  // ---------------------------------------------------------------------------

  // A Date on the same calendar day as `day`, at `minutes` after midnight (local time).
  function at(day, minutes) {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
  }

  function isSchoolDay(day) {
    return PERIODS.length > 0 && SCHOOL_DAYS.indexOf(day.getDay()) !== -1;
  }

  // First period start on the next school day after `now`'s date.
  function nextSchoolDayStart(now) {
    for (var i = 1; i <= 14; i++) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      if (isSchoolDay(d)) return at(d, PERIODS[0].start);
    }
    return null;
  }

  // kind: 'in' (a period is on now), 'passing' (gap between periods),
  //       'before' (school day, before the first period), 'out' (after school or no school today)
  function getStatus(now) {
    now = now || new Date();
    if (isSchoolDay(now)) {
      var i;
      for (i = 0; i < PERIODS.length; i++) {
        var s = at(now, PERIODS[i].start);
        var e = at(now, PERIODS[i].end);
        if (now >= s && now < e) {
          return { kind: 'in', period: PERIODS[i], start: s, end: e, left: e - now, total: e - s, day: now };
        }
      }
      var firstStart = at(now, PERIODS[0].start);
      if (now < firstStart) {
        return { kind: 'before', next: PERIODS[0], nextStart: firstStart, until: firstStart - now, day: now };
      }
      for (i = 1; i < PERIODS.length; i++) {
        var ns = at(now, PERIODS[i].start);
        if (ns > now) {
          var gapStart = at(now, PERIODS[i - 1].end);
          return { kind: 'passing', next: PERIODS[i], nextStart: ns, until: ns - now, gapStart: gapStart, total: ns - gapStart, day: now };
        }
      }
    }
    var back = nextSchoolDayStart(now);
    return { kind: 'out', next: PERIODS[0] || null, nextStart: back, until: back ? back - now : null, day: back };
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // "12:34" under an hour, "1h 05m" under a day, "2d 16h" after that.
  function until(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 3600) return Math.floor(s / 60) + ':' + pad(s % 60);
    var m = Math.floor(s / 60);
    if (s < 86400) return Math.floor(m / 60) + 'h ' + pad(m % 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
  }

  // "23 minutes left", or "45 seconds left" in the last minute.
  function left(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 60) return s + (s === 1 ? ' second' : ' seconds') + ' left';
    var m = Math.ceil(s / 60);
    return m + (m === 1 ? ' minute' : ' minutes') + ' left';
  }

  // Big clock in the panel: "4:09", "1:05:09" or "2d 16:45:09".
  function clock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (d > 0) return d + 'd ' + h + ':' + pad(m) + ':' + pad(sec);
    if (h > 0) return h + ':' + pad(m) + ':' + pad(sec);
    return m + ':' + pad(sec);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function dayName(d, now) {
    var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (sameDay(d, now)) return 'today';
    if (sameDay(d, tomorrow)) return 'tomorrow';
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }

  // Short text for the pill (and Desktop Mode's menu bar).
  function describe(st, now) {
    now = now || new Date();
    if (st.kind === 'in') {
      return { type: st.period.type, label: st.period.name + ',', time: left(st.left), progress: 1 - st.left / st.total };
    }
    if (st.kind === 'passing') {
      return { type: 'passing', label: st.next.name, time: 'in ' + until(st.until), progress: 1 - st.until / st.total };
    }
    if (st.kind === 'before') {
      return { type: st.next.type, label: st.next.name, time: 'in ' + until(st.until), progress: null };
    }
    return { type: 'out', label: 'School’s out,', time: st.until === null ? 'no school days set' : 'back in ' + until(st.until), progress: null };
  }

  // The day's list with gaps, marked past / current / next.
  function scheduleRows(st, now) {
    now = now || new Date();
    var day = st.kind === 'out' ? st.day : now;
    var listingToday = day && sameDay(day, now);
    var nowMin = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var rows = [];
    PERIODS.forEach(function (p, i) {
      if (i > 0 && p.start > PERIODS[i - 1].end) {
        var gap = { gap: true, from: PERIODS[i - 1].end, to: p.start, minutes: p.start - PERIODS[i - 1].end, state: '' };
        if (st.kind === 'passing' && st.next === p) gap.state = 'current';
        else if (listingToday && st.kind !== 'before' && nowMin >= p.start) gap.state = 'past';
        rows.push(gap);
      }
      var row = { gap: false, period: p, state: '' };
      if (st.kind === 'in' && st.period === p) row.state = 'current';
      else if ((st.kind === 'passing' || st.kind === 'before') && st.next === p) row.state = 'next';
      else if (st.kind === 'out' && i === 0) row.state = 'next';
      else if (listingToday && st.kind !== 'out' && nowMin >= p.end) row.state = 'past';
      else if (listingToday && st.kind === 'out') row.state = 'past';
      rows.push(row);
    });
    return { day: day, rows: rows, listingToday: listingToday };
  }

  // ---------------------------------------------------------------------------
  // The pill and its panel
  // ---------------------------------------------------------------------------

  var pill = document.getElementById('nextup');
  var glass = document.getElementById('nextup-glass');
  var panel = document.getElementById('nextup-panel');
  var subscribers = [];
  var panelKey = '';
  var timer = 0;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function minutesText(min) { return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }

  var pillParts = null;
  function renderPill(st, now) {
    if (!pill) return;
    if (!pillParts) {
      pillParts = {
        label: pill.querySelector('.nu-label'),
        time: pill.querySelector('.nu-time'),
        fill: pill.querySelector('.nu-fill')
      };
    }
    var d = describe(st, now);
    if (pill.getAttribute('data-type') !== d.type) pill.setAttribute('data-type', d.type);
    if (pill.getAttribute('data-kind') !== st.kind) pill.setAttribute('data-kind', st.kind);
    if (pillParts.label.textContent !== d.label) pillParts.label.textContent = d.label;
    if (pillParts.time.textContent !== d.time) pillParts.time.textContent = d.time;
    pill.classList.toggle('has-progress', d.progress !== null);
    if (d.progress !== null) pillParts.fill.style.width = (Math.min(1, Math.max(0, d.progress)) * 100).toFixed(2) + '%';
    var spoken = d.label + ' ' + d.time + '. Show schedule';
    if (pill.getAttribute('aria-label') !== spoken) pill.setAttribute('aria-label', spoken);
  }

  function headFor(st, now) {
    if (st.kind === 'in') {
      return { kicker: 'Now', title: st.period.name, sub: 'Ends at ' + st.period.endText, big: clock(st.left), bigNote: 'left', progress: 1 - st.left / st.total, type: st.period.type };
    }
    if (st.kind === 'passing') {
      return { kicker: 'Passing time', title: 'Next: ' + st.next.name, sub: 'Starts at ' + st.next.startText, big: clock(st.until), bigNote: 'to go', progress: 1 - st.until / st.total, type: 'passing' };
    }
    if (st.kind === 'before') {
      return { kicker: 'Before school', title: 'Next: ' + st.next.name, sub: 'Starts at ' + st.next.startText, big: clock(st.until), bigNote: 'to go', progress: null, type: st.next.type };
    }
    if (st.until === null) {
      return { kicker: 'School’s out', title: 'No school days set', sub: '', big: '', bigNote: '', progress: null, type: 'out' };
    }
    return { kicker: 'School’s out', title: 'Back ' + dayName(st.day, now) + ' at ' + st.next.startText, sub: '', big: clock(st.until), bigNote: 'to go', progress: null, type: 'out' };
  }

  function renderPanel(st, now) {
    if (!panel || panel.hidden) return;
    var key = st.kind + '|' + (st.period ? st.period.index : st.next ? st.next.index : '') + '|' + (st.day ? st.day.toDateString() : '') + '|' + now.toDateString();
    var h = headFor(st, now);
    if (key !== panelKey) {
      panelKey = key;
      var sched = scheduleRows(st, now);
      var dayTitle = sched.day
        ? (sched.listingToday ? 'Today, ' : (dayName(sched.day, now) === 'tomorrow' ? 'Tomorrow, ' : '')) +
          sched.day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
        : '';
      panel.setAttribute('data-type', h.type);
      panel.innerHTML =
        '<div class="nu-head">' +
          '<div class="nu-kicker"></div>' +
          '<div class="nu-title"></div>' +
          '<div class="nu-sub"></div>' +
          '<div class="nu-big"><span class="nu-big-num"></span><small class="nu-big-note"></small></div>' +
          '<div class="nu-progress"><span></span></div>' +
        '</div>' +
        (dayTitle ? '<div class="nu-day">' + esc(dayTitle) + '</div>' : '') +
        '<ol class="nu-list">' + sched.rows.map(function (r) {
          if (r.gap) {
            return '<li class="nu-gap' + (r.state ? ' is-' + r.state : '') + '">Passing time, ' + r.minutes + ' min</li>';
          }
          var tag = r.state === 'current' ? '<span class="nu-row-tag">Now</span>' : r.state === 'next' ? '<span class="nu-row-tag nu-row-tag-next">Next</span>' : '';
          return '<li class="nu-row' + (r.state ? ' is-' + r.state : '') + '" data-type="' + r.period.type + '">' +
            '<span class="nu-row-dot"></span>' +
            '<span class="nu-row-name">' + esc(r.period.name) + '</span>' + tag +
            '<span class="nu-row-time">' + esc(r.period.startText) + '–' + esc(r.period.endText) + '</span>' +
          '</li>';
        }).join('') + '</ol>';
      panel.querySelector('.nu-kicker').textContent = h.kicker;
      panel.querySelector('.nu-title').textContent = h.title;
      var sub = panel.querySelector('.nu-sub');
      sub.textContent = h.sub;
      sub.hidden = !h.sub;
      panel.querySelector('.nu-progress').hidden = h.progress === null;
      panel.querySelector('.nu-big').hidden = !h.big;
    }
    panel.querySelector('.nu-big-num').textContent = h.big;
    panel.querySelector('.nu-big-note').textContent = h.bigNote;
    if (h.progress !== null) panel.querySelector('.nu-progress span').style.width = (Math.min(1, Math.max(0, h.progress)) * 100).toFixed(2) + '%';
  }

  function tick() {
    clearTimeout(timer);
    var now = new Date();
    var st = getStatus(now);
    renderPill(st, now);
    renderPanel(st, now);
    subscribers.forEach(function (fn) { try { fn(st, describe(st, now)); } catch (e) { /* ignore */ } });
    // Wake up just after the next whole second
    timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 15);
  }

  function openPanel() {
    if (!panel || !panel.hidden) return;
    panel.hidden = false;
    panelKey = '';
    pill.setAttribute('aria-expanded', 'true');
    tick();
    if (!reduceMotion.matches) {
      panel.animate(
        [{ opacity: 0, transform: 'translateY(-10px) scale(.94)' }, { opacity: 1, transform: 'none' }],
        { duration: 460, easing: 'cubic-bezier(.34, 1.4, .64, 1)' }
      );
      Array.prototype.forEach.call(panel.querySelectorAll('.nu-head > *, .nu-day, .nu-list > li'), function (node, i) {
        node.animate(
          [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
          { duration: 420, delay: 40 + Math.min(i, 16) * 22, easing: 'cubic-bezier(.2, .9, .25, 1)', fill: 'backwards' }
        );
      });
    }
  }

  function closePanel() {
    if (!panel || panel.hidden) return;
    pill.setAttribute('aria-expanded', 'false');
    if (reduceMotion.matches) { panel.hidden = true; return; }
    panel.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(.96)' }],
      { duration: 180, easing: 'ease-in' }
    ).onfinish = function () { panel.hidden = true; };
  }

  if (pill && panel) {
    pill.addEventListener('click', function () {
      if (panel.hidden) openPanel(); else closePanel();
    });
    pill.addEventListener('pointerdown', function () {
      pill.classList.add('is-pressed');
      if (glass) glass.classList.add('is-pressed');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (type) {
      pill.addEventListener(type, function () {
        pill.classList.remove('is-pressed');
        if (glass) glass.classList.remove('is-pressed');
      });
    });
    document.addEventListener('pointerdown', function (e) {
      if (!panel.hidden && !panel.contains(e.target) && !pill.contains(e.target)) closePanel();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { closePanel(); pill.focus({ preventScroll: true }); }
    });
    // The glass behind the pill always matches the pill's size.
    if (glass && window.ResizeObserver) {
      new ResizeObserver(function () {
        glass.style.width = pill.offsetWidth + 'px';
        glass.style.height = pill.offsetHeight + 'px';
      }).observe(pill);
    }
  }

  document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  tick();

  // Used by app.js and Desktop Mode
  window.SahurHubCountdown = {
    getStatus: getStatus,
    describe: describe,
    scheduleRows: scheduleRows,
    minutesText: minutesText,
    closePanel: closePanel,
    subscribe: function (fn) {
      subscribers.push(fn);
      tick();
      return function () { subscribers = subscribers.filter(function (x) { return x !== fn; }); };
    }
  };
})();
