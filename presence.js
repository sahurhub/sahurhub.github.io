/*
  SahurHub player count (the "Player Count" pill next to Stats).

  Every open SahurHub page - the hub, play.html and the about:blank tab that app.js
  opens for opsecs - tells the SahurHub Chat server "this device is here" every
  30 seconds. It only sends a random code that this browser keeps
  (localStorage "sahurhub.presence"): no names, no accounts, and the server keeps
  no IPs and saves nothing to disk. The server counts the devices it heard from in
  the last 2.5 minutes and answers with that number. Several SahurHub tabs on one
  device count as one player.

  Coins (2026-11-22): if this browser is signed in to SahurHub Chat, the ping also
  carries its chat sign-in and says whether the page is really being used (on
  screen, and for the hub page, touched in the last 5 minutes). The chat server
  then gives the daily streak reward and 1 coin a minute, up to 60 a day.
*/
(function () {
  'use strict';

  var LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  // On a local preview it talks to the chat's test copy (through an SSH tunnel), like chat.js.
  var BASE = LOCAL ? 'http://localhost:10002' : 'https://chat-79-72-86-205.nip.io';

  // Written as one self-contained function so app.js can also run it inside the
  // about:blank opsec tab (which has no address of its own to work the server out from).
  // kind: 'site' (the hub: needs a click, key or scroll in the last 5 minutes to earn
  // coins) or 'game' (an opsec: being on screen is enough).
  function pinger(base, onCount, kind) {
    var KEY = 'sahurhub.presence';
    var EVERY = 30000;
    var IDLE = 5 * 60 * 1000;
    var lastInput = Date.now();
    var id = null;
    if (kind === 'site') {
      ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(function (type) {
        window.addEventListener(type, function () { lastInput = Date.now(); }, { passive: true, capture: true });
      });
    }
    function chatSignIn() {
      try {
        var token = localStorage.getItem('sahurhub.chat.session');
        var device = localStorage.getItem('sahurhub.chat.device');
        return token && /^[a-f0-9]{64}$/.test(device || '') ? { token: token, device: device } : null;
      } catch (e) { return null; }
    }
    try { id = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!/^[a-f0-9]{32}$/.test(id || '')) {
      var b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = Array.prototype.map.call(b, function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join('');
      try { localStorage.setItem(KEY, id); } catch (e) { /* private mode: a new code each visit */ }
    }
    var url = base + '/api/presence';
    var timer = 0;
    function ping() {
      clearTimeout(timer);
      timer = setTimeout(ping, EVERY);
      var body = { id: id };
      var auth = chatSignIn();
      if (auth) {
        body.token = auth.token;
        body.device = auth.device;
        body.active = document.visibilityState === 'visible' && (kind !== 'site' || Date.now() - lastInput < IDLE);
      }
      // Sent as plain text so the browser doesn't need an extra permission check first.
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body), cache: 'no-store', credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { if (onCount) onCount(d && typeof d.count === 'number' ? d.count : null); })
        .catch(function () { if (onCount) onCount(null); });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') ping();
    });
    // Closing the page takes this device off the count straight away (another
    // SahurHub tab on the same device adds it back on its next ping).
    window.addEventListener('pagehide', function () {
      clearTimeout(timer);
      try { navigator.sendBeacon(url, new Blob([JSON.stringify({ id: id, leave: true })], { type: 'text/plain' })); } catch (e) { /* ignore */ }
    });
    window.addEventListener('pageshow', function (e) { if (e.persisted) ping(); });
    ping();
  }

  window.SahurHubPlayers = {
    base: BASE,
    // start(onCount, kind): onCount(number) after every answer, onCount(null) when the server
    // can't be reached. kind: 'site' (default, the hub) or 'game' (play.html).
    start: function (onCount, kind) { pinger(BASE, onCount, kind || 'site'); },
    pingerSource: pinger.toString()
  };
})();
