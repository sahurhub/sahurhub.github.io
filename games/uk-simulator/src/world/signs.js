// UK Simulator - street name plates (real street names) and shop fascia boards (real shop
// names), drawn into one canvas texture per chunk.
import * as THREE from 'three';

const ROW_STREET = 64, ROW_SHOP = 96, W = 512;

function hashColour(s) {
  let h = 0;
  for (let k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) >>> 0;
  const palette = ['#1d3b2a', '#22304f', '#5b1a1a', '#1a1a1a', '#3a2a1a', '#0f4d5c', '#6b1f3a', '#2b2b5a', '#7a5a12', '#e8e2d0'];
  return palette[h % palette.length];
}

export function makeSignMeshes(signs, shops, names) {
  if (!signs.length && !shops.length) return null;
  const rows = signs.length * ROW_STREET + shops.length * ROW_SHOP;
  const H = Math.min(4096, Math.max(64, 1 << Math.ceil(Math.log2(rows))));
  const scale = Math.min(1, H / rows);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const pos = [], nrm = [], uv = [], idx = [];
  const posts = [];
  let y = 0;
  const quad = (cx, cy, cz, ux, uz, w, h, v0, v1, faceSign) => {
    // plate centred at (cx, cy, cz), along (ux, uz), facing (uz, -ux) * faceSign
    const nx = uz * faceSign, nz = -ux * faceSign;
    const b = pos.length / 3;
    const hw = w / 2;
    const corners = [[-hw, -h / 2, 0, v1], [hw, -h / 2, 1, v1], [hw, h / 2, 1, v0], [-hw, h / 2, 0, v0]];
    for (const [s, dy, u, v] of corners) {
      const ss = faceSign > 0 ? s : -s;
      pos.push(cx + ux * ss + nx * 0.012, cy + dy, cz + uz * ss + nz * 0.012); nrm.push(nx, 0, nz); uv.push(u, 1 - v);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  for (const s of signs) {
    const name = names[s[4]];
    if (!name) continue;
    const rowH = ROW_STREET * scale;
    // plate: white, black border, black capitals-and-lower-case text (UK style)
    g.fillStyle = '#f7f7f2'; g.fillRect(0, y, W, rowH);
    g.strokeStyle = '#111'; g.lineWidth = 5 * scale; g.strokeRect(4 * scale, y + 4 * scale, W - 8 * scale, rowH - 8 * scale);
    let fs = 34 * scale;
    g.font = `bold ${fs}px Arial, Helvetica, sans-serif`;
    while (g.measureText(name).width > W - 40 && fs > 12) { fs -= 2; g.font = `bold ${fs}px Arial, Helvetica, sans-serif`; }
    g.fillStyle = '#111'; g.fillText(name, W / 2, y + rowH / 2 + 1);
    const v0 = y / H, v1 = (y + rowH) / H;
    const w = Math.min(2.4, Math.max(1.0, name.length * 0.1 + 0.4)), h = 0.24;
    const ux = Math.cos(s[3]), uz = Math.sin(s[3]);
    const cy = s[1] + 1.05;
    quad(s[0], cy, s[2], ux, uz, w, h, v0, v1, 1);
    quad(s[0], cy, s[2], ux, uz, w, h, v0, v1, -1);
    posts.push([s[0] - ux * (w / 2 - 0.08), s[1], s[2] - uz * (w / 2 - 0.08)], [s[0] + ux * (w / 2 - 0.08), s[1], s[2] + uz * (w / 2 - 0.08)]);
    y += rowH;
  }
  for (const s of shops) {
    const name = names[s[5]];
    if (!name) continue;
    const rowH = ROW_SHOP * scale;
    const bg = hashColour(name);
    g.fillStyle = bg; g.fillRect(0, y, W, rowH);
    let fs = 50 * scale;
    const serif = name.length % 3 === 0;
    const fam = serif ? 'Georgia, "Times New Roman", serif' : 'Arial, Helvetica, sans-serif';
    g.font = `bold ${fs}px ${fam}`;
    while (g.measureText(name).width > W - 30 && fs > 12) { fs -= 2; g.font = `bold ${fs}px ${fam}`; }
    g.fillStyle = bg === '#e8e2d0' ? '#1a1a1a' : (name.length % 2 ? '#f2e6c8' : '#ffffff');
    g.fillText(name, W / 2, y + rowH / 2 + 2);
    const v0 = y / H, v1 = (y + rowH) / H;
    const ux = Math.cos(s[3]), uz = Math.sin(s[3]);
    // the board faces out of the wall: outward normal of the wall = (uz, -ux)
    quad(s[0], s[1], s[2], ux, uz, s[4], Math.min(0.75, s[4] / 5.3), v0, v1, 1);
    y += rowH;
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1 });
  const group = new THREE.Group();
  group.name = 'signs';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  group.add(mesh);
  if (posts.length) {
    const pg = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6).translate(0, 0.6, 0);
    const pm = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.6 }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach((p, k) => { m4.makeTranslation(p[0], p[1], p[2]); pm.setMatrixAt(k, m4); });
    group.add(pm);
  }
  group.userData.dispose = () => { tex.dispose(); mat.dispose(); geo.dispose(); };
  return group;
}
