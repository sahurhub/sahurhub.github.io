// Drift! - helper for tests: wait until the game has a car (after a page load).
export async function ready(timeoutMs = 20000) {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (window.__game && window.__game.car) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}
