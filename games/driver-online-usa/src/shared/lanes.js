// Driver Online USA - traffic lanes (from assets/map/layout.json, written by the Blender map
// script tools/blender/do_map.py). Used by the server's traffic AI and by the game to draw
// traffic cars: a car is just (lane, distance along it), so both sides agree on where it is.
//
// layout.lanes[i] = { p: [x, y, z, x, y, z, ...], n: [next lane indexes], v: speed m/s,
//                     sig: signal index or -1, g: signal group, stop: 1 if a stop sign at the end,
//                     y: 1 if this lane must give way at its end (merges), hw: 1 on the highway }

export function prepareLanes(layout) {
  const lanes = layout.lanes || [];
  for (const L of lanes) {
    const p = L.p;
    const n = p.length / 3;
    const cum = new Float32Array(n);
    let d = 0;
    for (let i = 1; i < n; i++) {
      const dx = p[i * 3] - p[i * 3 - 3], dy = p[i * 3 + 1] - p[i * 3 - 2], dz = p[i * 3 + 2] - p[i * 3 - 1];
      d += Math.sqrt(dx * dx + dy * dy + dz * dz);
      cum[i] = d;
    }
    L.cum = cum;
    L.len = d;
    L.n = L.n || [];
    L.prev = [];
  }
  lanes.forEach((L, i) => { for (const j of L.n) if (lanes[j]) lanes[j].prev.push(i); });
  return lanes;
}

/** Position and heading at distance s along a lane. out = {x, y, z, h} (h = yaw, 0 = facing -z). */
export function lanePoint(L, s, out = {}) {
  const p = L.p, cum = L.cum, n = cum.length;
  if (s <= 0) return segPoint(p, 0, 0, out);
  if (s >= L.len) return segPoint(p, n - 2, 1, out);
  // binary search for the segment
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const segLen = cum[lo + 1] - cum[lo] || 1;
  return segPoint(p, lo, (s - cum[lo]) / segLen, out);
}

function segPoint(p, i, t, out) {
  const ax = p[i * 3], ay = p[i * 3 + 1], az = p[i * 3 + 2];
  const bx = p[i * 3 + 3], by = p[i * 3 + 4], bz = p[i * 3 + 5];
  out.x = ax + (bx - ax) * t;
  out.y = ay + (by - ay) * t;
  out.z = az + (bz - az) * t;
  out.h = Math.atan2(-(bx - ax), -(bz - az));
  return out;
}
