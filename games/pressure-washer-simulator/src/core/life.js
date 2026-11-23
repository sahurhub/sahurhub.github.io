// Page lifetime: every window/document listener is added through on(), so leaving the page can remove
// them all at once (one AbortController), and onShutdown() callbacks free GPU memory and stop sound.
const ac = new AbortController();
const disposers = [];
let dead = false;

export function on(target, type, fn, opts) {
  if (dead || !target) return;
  target.addEventListener(type, fn, { ...(opts || {}), signal: ac.signal });
}

export function onShutdown(fn) { disposers.push(fn); }
export const isDead = () => dead;

export function shutdown() {
  if (dead) return;
  dead = true;
  ac.abort();
  while (disposers.length) {
    const fn = disposers.pop();
    try { fn(); } catch (e) { /* keep going */ }
  }
}
