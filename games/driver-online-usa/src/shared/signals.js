// Driver Online USA - traffic light timing, the same on the server and on every player's PC.
// Lights are not sent over the network: everyone works out the colour from the server clock.
// Each signal (crossroads) has two groups: 0 = one road, 1 = the crossing road.

export const SIGNAL = { GREEN: 14, YELLOW: 3, ALL_RED: 2 };
export const SIGNAL_CYCLE = 2 * (SIGNAL.GREEN + SIGNAL.YELLOW + SIGNAL.ALL_RED); // 38 s

/** 0 = green, 1 = yellow, 2 = red for one group of a signal at server time tMs. */
export function signalState(signal, group, tMs) {
  const half = SIGNAL.GREEN + SIGNAL.YELLOW + SIGNAL.ALL_RED;
  let t = ((tMs / 1000 + (signal.off || 0)) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (group === 1) t = (t + half) % SIGNAL_CYCLE;
  if (t < SIGNAL.GREEN) return 0;
  if (t < SIGNAL.GREEN + SIGNAL.YELLOW) return 1;
  return 2;
}

/** Seconds until this group turns green (0 if green now). */
export function secondsToGreen(signal, group, tMs) {
  const half = SIGNAL.GREEN + SIGNAL.YELLOW + SIGNAL.ALL_RED;
  let t = ((tMs / 1000 + (signal.off || 0)) % SIGNAL_CYCLE + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  if (group === 1) t = (t + half) % SIGNAL_CYCLE;
  return t < SIGNAL.GREEN ? 0 : SIGNAL_CYCLE - t;
}
