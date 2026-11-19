// UK Simulator - chunk worker. Loads one 256 m square of town and builds everything that can
// be built off the main thread: ground mesh data, road distance field, buildings, pavements,
// markings, bridges, railways, water, walls and hedges, tree and street furniture lists,
// and the collision triangles. Results are sent back as transferable typed arrays.
import { Geo, ColGeo, Col } from './geo-build.js';
import { addBuilding } from './buildings-geo.js';
import { buildSdf, buildRoadStuff, buildRoadFeature, SegGrid, piecePoints } from './roads-geo.js';
import { buildRail, buildWater, buildBarriers } from './misc-geo.js';

const N = 129, S = 2, LAND_N = 128;

async function fetchGz(url, asText) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ' ' + res.status);
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  const r = new Response(stream);
  return asText ? r.text() : r.arrayBuffer();
}

function decodeTerrain(buf) {
  const dv = new DataView(buf);
  const base = dv.getFloat32(4, true);
  const deltas = new Int16Array(buf, 8, N * N);
  const heights = new Float32Array(N * N);
  let cm = 0;
  const cmRow = new Int32Array(N);
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const i = r * N + c;
      if (c === 0) { cm = (r > 0 ? cmRow[0] : 0) + deltas[i]; } else cm += deltas[i];
      if (c === 0) cmRow[0] = cm;
      heights[i] = base + cm / 100;
    }
  }
  const land = new Uint8Array(buf.slice(8 + N * N * 2, 8 + N * N * 2 + LAND_N * LAND_N));
  return { heights, land };
}

// height on the ground mesh: cells split along the (0,0)-(1,1) diagonal (same as the mesh)
function makeHeightAt(h) {
  return (x, z) => {
    let fx = x / S, fz = z / S;
    let c = Math.floor(fx), r = Math.floor(fz);
    if (c < 0) c = 0; if (r < 0) r = 0; if (c > N - 2) c = N - 2; if (r > N - 2) r = N - 2;
    fx = Math.max(0, Math.min(1, fx - c)); fz = Math.max(0, Math.min(1, fz - r));
    const h00 = h[r * N + c], h10 = h[r * N + c + 1], h01 = h[(r + 1) * N + c], h11 = h[(r + 1) * N + c + 1];
    return fx >= fz ? h00 + fx * (h10 - h00) + fz * (h11 - h10) : h00 + fz * (h01 - h00) + fx * (h11 - h01);
  };
}

function terrainMesh(h) {
  // grid + skirts (4 edges, 4 m down) so different detail levels never show gaps
  const count = N * N + 4 * N;
  const p = new Float32Array(count * 3), n = new Float32Array(count * 3);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const i = r * N + c;
    p[i * 3] = c * S; p[i * 3 + 1] = h[i]; p[i * 3 + 2] = r * S;
    const hl = h[r * N + Math.max(0, c - 1)], hr = h[r * N + Math.min(N - 1, c + 1)];
    const hu = h[Math.max(0, r - 1) * N + c], hd = h[Math.min(N - 1, r + 1) * N + c];
    const dx = (hr - hl) / ((Math.min(N - 1, c + 1) - Math.max(0, c - 1)) * S), dz = (hd - hu) / ((Math.min(N - 1, r + 1) - Math.max(0, r - 1)) * S);
    const L = Math.hypot(dx, 1, dz);
    n[i * 3] = -dx / L; n[i * 3 + 1] = 1 / L; n[i * 3 + 2] = -dz / L;
  }
  let k = N * N;
  const edges = [(t) => t, (t) => (N - 1) * N + t, (t) => t * N, (t) => t * N + N - 1];
  for (const e of edges) for (let t = 0; t < N; t++, k++) {
    const i = e(t);
    p[k * 3] = p[i * 3]; p[k * 3 + 1] = p[i * 3 + 1] - 4; p[k * 3 + 2] = p[i * 3 + 2];
    n[k * 3] = n[i * 3]; n[k * 3 + 1] = n[i * 3 + 1]; n[k * 3 + 2] = n[i * 3 + 2];
  }
  return { p, n };
}

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type !== 'load') return;
  try {
    const [tbuf, txt] = await Promise.all([fetchGz(`${m.base}t/${m.i}_${m.j}.bin.gz`), fetchGz(`${m.base}c/${m.i}_${m.j}.json.gz`, true)]);
    const { heights, land } = decodeTerrain(tbuf);
    const ch = JSON.parse(txt);
    const heightAt = makeHeightAt(heights);
    const ter = terrainMesh(heights);
    // roads
    const roads = (ch.r || []).map((r) => ({ ...r, pts: piecePoints(r), noRoad: (r.f & 2048) !== 0 || (r.f & 2) !== 0 }));
    const sdf = buildSdf(roads);
    const grid = new SegGrid(roads.filter((r) => !(r.f & 4)));
    const G = new Geo(true);     // buildings, pavements, decks, walls (one textured material)
    const M = new ColGeo();      // markings, rails (vertex colours)
    const Wt = new Geo(false);   // water
    const C = new Col();         // static collision triangles
    for (const b of ch.b || []) addBuilding(b, G, C);
    buildRoadStuff(roads, grid, heightAt, G, M, C);
    const furn = [];
    for (let k = 0; k < (ch.fu || []).length; k += 4) {
      const kind = ch.fu[k], x = ch.fu[k + 1], z = ch.fu[k + 2], a = ch.fu[k + 3];
      if (kind === 20 || kind === 10 || kind === 21) { buildRoadFeature(kind, x, z, grid, heightAt, G, M, C, furn); if (kind !== 10) continue; }
      if (kind === 22 || kind === 8 && false) continue;
      // things on pavements stand on the raised slab
      const si = (Math.min(255, Math.max(0, Math.floor(z))) * 256 + Math.min(255, Math.max(0, Math.floor(x)))) * 4;
      const onPave = sdf[si + 1] > 128 && sdf[si] <= 128;
      furn.push(kind, x, heightAt(x, z) + (onPave ? 0.12 : 0), z, a);
    }
    buildRail(ch.rl || [], heightAt, M, C, furn);
    buildWater(ch.wa || [], ch.wl || [], Wt);
    buildBarriers(ch.ba || [], heightAt, G, C);
    // trees: x, y, z, height, crown radius, kind, rotation, colour variation
    const tl = ch.t || [];
    const trees = new Float32Array((tl.length / 5) * 8);
    for (let k = 0, o = 0; k < tl.length; k += 5, o += 8) {
      const x = tl[k], z = tl[k + 1];
      trees[o] = x; trees[o + 1] = heightAt(x, z); trees[o + 2] = z; trees[o + 3] = tl[k + 2]; trees[o + 4] = tl[k + 3]; trees[o + 5] = tl[k + 4];
      trees[o + 6] = ((x * 12.9898 + z * 78.233) % 6.283); trees[o + 7] = Math.abs(Math.sin(x * 3.1 + z * 7.7));
    }
    const signs = (ch.sg || []).map((s) => [s[0], heightAt(s[0], s[1]), s[1], s[2], s[3]]);
    const seen = new Set();
    const shops = (ch.sh || []).filter((s) => { const key = Math.round(s[0]) + ',' + Math.round(s[2]) + ',' + s[5]; if (seen.has(key)) return false; seen.add(key); return true; });
    // named roads (for "you are on ... Road" in the HUD)
    const named = roads.filter((r) => r.n >= 0 && !(r.f & 4)).map((r) => ({ n: r.n, c: r.c, w: r.w, p: Float32Array.from(r.pts.flatMap((q) => [q[0], q[2]])) }));
    const g = G.out(), mk = M.out(), w = Wt.out(), col = C.out();
    const furnArr = new Float32Array(furn);
    const transfer = [heights.buffer, land.buffer, ter.p.buffer, ter.n.buffer, sdf.buffer, trees.buffer, furnArr.buffer, col.v.buffer, col.i.buffer, ...G.buffers(g), mk.p.buffer, mk.n.buffer, mk.c.buffer, mk.idx.buffer, ...Wt.buffers(w)];
    self.postMessage({ type: 'chunk', key: m.key, i: m.i, j: m.j, x0: ch.x0, z0: ch.z0, heights, land, ter, sdf, build: g, marks: mk, water: w, col, trees, furn: furnArr, signs, shops, named }, transfer);
  } catch (e) {
    self.postMessage({ type: 'error', key: m.key, error: String(e && e.stack || e) });
  }
};
