// UK Simulator - road graph routing (A*), shared by the game, the town builder and the server.
// Graph format (client/data/graph.json.gz):
//   n: [x, z, x, z, ...] node positions (metres, world)
//   e: [a, b, flags, length, ...] edges (node indexes, flags below, length in metres)
//   g: [[x, z, ...], ...] the shape of each edge (from a to b, including both ends)
export const EF = { car: 1, bike: 2, foot: 4, oneway: 8, paved: 16, track: 32, cyclePath: 64, major: 128 };

export function loadGraph(json) {
  const nNodes = json.n.length / 2;
  const adj = Array.from({ length: nNodes }, () => []);
  const ne = json.e.length / 4;
  for (let k = 0; k < ne; k++) {
    const a = json.e[k * 4], b = json.e[k * 4 + 1], f = json.e[k * 4 + 2], len = json.e[k * 4 + 3];
    adj[a].push({ k, to: b, f, len, fwd: true });
    adj[b].push({ k, to: a, f, len, fwd: false });
  }
  return { n: json.n, e: json.e, g: json.g, adj, nNodes };
}

// mode: 'car' | 'bike' | 'foot' | 'offroad'
function allowed(edge, mode) {
  const f = edge.f;
  if (mode === 'car') return (f & EF.car) && (edge.fwd || !(f & EF.oneway));
  if (mode === 'bike') return (f & EF.bike) && (edge.fwd || !(f & EF.oneway) || (f & EF.cyclePath));
  if (mode === 'offroad') return (f & (EF.car | EF.bike)) !== 0;
  return (f & EF.foot) !== 0;
}

function cost(edge, mode) {
  const f = edge.f;
  let c = edge.len;
  if (mode === 'car') c /= (f & EF.major) ? 1.6 : 1.0;
  if (mode === 'bike') c *= (f & EF.cyclePath) ? 0.8 : (f & EF.major) ? 1.25 : 1.0;
  if (mode === 'offroad') c *= (f & EF.track) ? 0.6 : 1.0;
  return c;
}

export function nearestNode(G, x, z, mode = 'car') {
  let best = -1, bd = Infinity;
  for (let i = 0; i < G.nNodes; i++) {
    const dx = G.n[2 * i] - x, dz = G.n[2 * i + 1] - z;
    const d = dx * dx + dz * dz;
    if (d < bd && G.adj[i].some((e) => allowed(e, mode))) { bd = d; best = i; }
  }
  return best;
}

// returns { nodes: [...], edges: [...], length, points: [[x,z],...] } or null
export function route(G, from, to, mode = 'car') {
  if (from < 0 || to < 0) return null;
  const tx = G.n[2 * to], tz = G.n[2 * to + 1];
  const h = (i) => Math.hypot(G.n[2 * i] - tx, G.n[2 * i + 1] - tz) * (mode === 'car' ? 0.62 : 0.8);
  const g = new Float64Array(G.nNodes).fill(Infinity);
  const prev = new Int32Array(G.nNodes).fill(-1), prevE = new Int32Array(G.nNodes).fill(-1);
  const open = new MinHeap();
  g[from] = 0; open.push(from, h(from));
  const closed = new Uint8Array(G.nNodes);
  while (open.size) {
    const cur = open.pop();
    if (cur === to) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    for (const e of G.adj[cur]) {
      if (!allowed(e, mode)) continue;
      const ng = g[cur] + cost(e, mode);
      if (ng < g[e.to]) { g[e.to] = ng; prev[e.to] = cur; prevE[e.to] = e.k; open.push(e.to, ng + h(e.to)); }
    }
  }
  if (prev[to] < 0 && from !== to) return null;
  const nodes = [to], edges = [];
  for (let c = to; c !== from; c = prev[c]) { edges.push(prevE[c]); nodes.push(prev[c]); }
  nodes.reverse(); edges.reverse();
  const points = [];
  let length = 0;
  for (let i = 0; i < edges.length; i++) {
    const k = edges[i];
    const shape = G.g[k];
    const pts = [];
    for (let j = 0; j < shape.length; j += 2) pts.push([shape[j], shape[j + 1]]);
    if (G.e[k * 4] !== nodes[i]) pts.reverse();
    for (const p of (points.length ? pts.slice(1) : pts)) points.push(p);
    length += G.e[k * 4 + 3];
  }
  if (!points.length) points.push([G.n[2 * from], G.n[2 * from + 1]]);
  return { nodes, edges, length, points };
}

// points every `step` metres along a polyline
export function resample(points, step) {
  const out = [points[0]];
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    let L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let t0 = 0;
    while (acc + (L - t0) >= step) {
      t0 += step - acc; acc = 0;
      out.push([a[0] + (b[0] - a[0]) * t0 / L, a[1] + (b[1] - a[1]) * t0 / L]);
    }
    acc += L - t0;
  }
  const last = points[points.length - 1];
  if (Math.hypot(last[0] - out[out.length - 1][0], last[1] - out[out.length - 1][1]) > step * 0.3) out.push(last);
  return out;
}

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    k.push(key); v.push(val);
    let i = k.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (v[p] <= v[i]) break; [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]]; i = p; }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && v[l] < v[m]) m = l;
        if (r < k.length && v[r] < v[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]]; i = m;
      }
    }
    return top;
  }
}
