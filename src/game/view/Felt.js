// フェルトの小物を作る道具。2 枚のフェルトをふちで縫い合わせ、少しだけ綿を入れた「ペラい」形にする。
//
//   feltGeometry(sdf, bbox, opts)   2D の符号つき距離（内側が負）から、表と裏がふちで閉じた形を作る。
//                                   ふちは丸く、まんなかはわずかにふくらむ。戻り値 { geometry, loops, height(d) }
//   stitchGeometry(loops, height, opts)   ふちに沿ったブランケットステッチ（表・裏の短い線と、ふちを巻く糸）
//   feltMaterial(color)              起毛した布の材質（sheen）。同じ色は使い回す
//   sd.box / sd.circle / sd.union / sd.smooth   距離の部品
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './textures.js';

// ---------------------------------------------------------------- 2D の距離の部品
export const sd = {
  /** 角の丸い四角（中心 cx, cy、半幅 hx, hy、角の丸み r） */
  box: (cx, cy, hx, hy, r = 0) => (x, y) => {
    const qx = Math.abs(x - cx) - (hx - r), qy = Math.abs(y - cy) - (hy - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
  },
  circle: (cx, cy, r) => (x, y) => Math.hypot(x - cx, y - cy) - r,
  union: (...fs) => (x, y) => { let d = Infinity; for (const f of fs) d = Math.min(d, f(x, y)); return d; },
  /** なめらかにつなぐ（へこんだ角に丸みがつく） */
  smooth: (k, ...fs) => (x, y) => {
    let d = fs[0](x, y);
    for (let i = 1; i < fs.length; i++) {
      const b = fs[i](x, y), h = Math.max(k - Math.abs(d - b), 0) / k;
      d = Math.min(d, b) - h * h * k * 0.25;
    }
    return d;
  },
  subtract: (a, b) => (x, y) => Math.max(a(x, y), -b(x, y)),
};

/**
 * 距離の関数から、ふちで閉じたフェルトの形を作る。
 *   sdf(x, y)  内側が負。bbox = [x0, y0, x1, y1]（少し余裕を持たせる）
 *   opts：spacing（格子の間隔）、half（ふちから離れた所の厚みの半分）、edge（ふちの丸みの幅）、puff・puffD（まんなかのふくらみと、その広がり）
 */
export function feltGeometry(sdf, bbox, { spacing = 0.045, half = 0.07, edge = 0.07, puff = 0.025, puffD = 0.45 } = {}) {
  const [bx0, by0, bx1, by1] = bbox;
  const x0 = bx0 - spacing, y0 = by0 - spacing;
  const nx = Math.ceil((bx1 - bx0) / spacing) + 3, ny = Math.ceil((by1 - by0) / spacing) + 3;
  const F = new Float32Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) F[j * nx + i] = sdf(x0 + i * spacing, y0 + j * spacing);
  const height = (d) => {
    const u = Math.min(Math.max(d / edge, 0), 1);
    const e = Math.sqrt(Math.max(0, 1 - (1 - u) * (1 - u)));
    const v = Math.min(Math.max(d / puffD, 0), 1);
    return half * e + puff * v * v * (3 - 2 * v);
  };
  const pos = [], dist = [];
  const corner = new Int32Array(nx * ny).fill(-1);
  const cross = new Map();
  const vCorner = (i, j) => {
    const k = j * nx + i;
    if (corner[k] < 0) { corner[k] = pos.length / 3; pos.push(x0 + i * spacing, y0 + j * spacing, 0); dist.push(-F[k]); }
    return corner[k];
  };
  const vCross = (i0, j0, i1, j1) => {
    const ka = j0 * nx + i0, kb = j1 * nx + i1;
    const key = ka < kb ? ka * 4194304 + kb : kb * 4194304 + ka;
    let v = cross.get(key);
    if (v === undefined) {
      const fa = F[ka], fb = F[kb], t = fa / (fa - fb);
      v = pos.length / 3;
      pos.push(x0 + (i0 + (i1 - i0) * t) * spacing, y0 + (j0 + (j1 - j0) * t) * spacing, 0);
      dist.push(0);
      cross.set(key, v);
    }
    return v;
  };
  const front = [];
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const c = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]];
    const inside = c.map(([a, b]) => F[b * nx + a] < 0);
    if (!inside.some(Boolean)) continue;
    const poly = [];
    for (let k = 0; k < 4; k++) {
      const [a, b] = c[k], [a2, b2] = c[(k + 1) % 4];
      if (inside[k]) poly.push(vCorner(a, b));
      if (inside[k] !== inside[(k + 1) % 4]) poly.push(vCross(a, b, a2, b2));
    }
    for (let k = 1; k < poly.length - 1; k++) front.push(poly[0], poly[k], poly[k + 1]);
  }
  // 表の高さ
  const nFront = pos.length / 3;
  for (let v = 0; v < nFront; v++) pos[v * 3 + 2] = height(dist[v]);
  // 裏：ふちの点（高さ 0）は表と共有し、それ以外は複製して z を反転
  const backOf = new Int32Array(nFront);
  for (let v = 0; v < nFront; v++) {
    if (dist[v] <= 1e-6) { backOf[v] = v; continue; }
    backOf[v] = pos.length / 3;
    pos.push(pos[v * 3], pos[v * 3 + 1], -pos[v * 3 + 2]);
  }
  const index = front.slice();
  for (let k = 0; k < front.length; k += 3) index.push(backOf[front[k]], backOf[front[k + 2]], backOf[front[k + 1]]);
  const uv = [];
  for (let v = 0; v < pos.length / 3; v++) uv.push((pos[v * 3] - bx0) / (bx1 - bx0), (pos[v * 3 + 1] - by0) / (by1 - by0));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  // ふちの輪（表の三角形のうち、相手のいない辺をつなぐ。左回り）
  const next = new Map(), count = new Map();
  const ek = (a, b) => (a < b ? a * 1e7 + b : b * 1e7 + a);
  for (let k = 0; k < front.length; k += 3) for (let e = 0; e < 3; e++) { const a = front[k + e], b = front[k + (e + 1) % 3]; count.set(ek(a, b), (count.get(ek(a, b)) || 0) + 1); }
  for (let k = 0; k < front.length; k += 3) for (let e = 0; e < 3; e++) { const a = front[k + e], b = front[k + (e + 1) % 3]; if (count.get(ek(a, b)) === 1) next.set(a, b); }
  const loops = [], seen = new Set();
  for (const s of next.keys()) {
    if (seen.has(s)) continue;
    const loop = [];
    let v = s;
    while (v !== undefined && !seen.has(v)) { seen.add(v); loop.push([pos[v * 3], pos[v * 3 + 1]]); v = next.get(v); }
    if (loop.length > 8) loops.push(loop);
  }
  return { geometry: g, loops, height };
}

/** ふちのブランケットステッチ：表と裏に、ふちから内へ向かう短い線。ふちには糸が巻く。 */
export function stitchGeometry(loops, height, { gap = 0.1, len = 0.085, w = 0.022, inset = 0.03, back = true, wrap = true } = {}) {
  const parts = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
  for (const loop of loops) {
    const n = loop.length;
    const cum = [0];
    for (let i = 1; i <= n; i++) { const [ax, ay] = loop[i - 1], [bx, by] = loop[i % n]; cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay)); }
    const total = cum[n], count = Math.max(6, Math.round(total / gap));
    let seg = 0;
    for (let k = 0; k < count; k++) {
      const at = (k / count) * total;
      while (cum[seg + 1] < at) seg++;
      const [ax, ay] = loop[seg], [bx, by] = loop[(seg + 1) % n];
      const sl = Math.max(1e-6, cum[seg + 1] - cum[seg]), f = (at - cum[seg]) / sl;
      const x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
      // 進む向きと内向き（左回りなので、左が内側）。前後の点で向きをならす
      const [px, py] = loop[(seg - 2 + n) % n], [qx, qy] = loop[(seg + 3) % n];
      let tx = qx - px, ty = qy - py;
      const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const ix = -ty, iy = tx;
      const d0 = inset, d1 = inset + len, dm = (d0 + d1) / 2;
      const z0 = height(d0), z1 = height(d1), zm = height(dm) + 0.006;
      for (const side of back ? [1, -1] : [1]) {
        // 線の向き：内向き＋面の傾き
        X.set(ix * (d1 - d0), iy * (d1 - d0), side * (z1 - z0));
        const L = X.length(); X.normalize();
        Y.set(tx, ty, 0);
        Z.crossVectors(X, Y).normalize();
        if (Z.z * side < 0) Z.negate();
        Y.crossVectors(Z, X).normalize();
        m.makeBasis(X, Y, Z);
        q.setFromRotationMatrix(m);
        p.set(x + ix * dm, y + iy * dm, side * zm);
        s.set(L + 0.01, w, 0.016);
        parts.push(box.clone().applyMatrix4(new THREE.Matrix4().compose(p, q, s)));
      }
      if (wrap && back) {
        // ふちを巻く糸（ふちの外側に縦に）
        p.set(x - ix * 0.006, y - iy * 0.006, 0);
        q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(ty, tx));
        s.set(w, 0.016, Math.max(0.02, height(inset) * 2 * 0.95));
        parts.push(box.clone().applyMatrix4(new THREE.Matrix4().compose(p, q, s)));
      }
    }
  }
  const g = mergeGeometries(parts.map((b) => { b.deleteAttribute('uv'); return b; }));
  for (const b of parts) b.dispose();
  return g;
}

// ---------------------------------------------------------------- 材質
let feltTex = null;
/** フェルトの毛並み：細かい繊維を描いたグレーの絵と、そこから作る法線。どの色のフェルトでも共有する。 */
function feltTextures() {
  if (feltTex) return feltTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, S, S);
  const r = rng(99);
  // 繊維：短い線をいろいろな向きに（端がつながるよう 3x3 に描く）
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S, a = r() * Math.PI * 2, l = 2 + r() * 7, v = r();
    g.strokeStyle = v < 0.5 ? `rgba(255,255,255,${0.12 + r() * 0.25})` : `rgba(90,90,90,${0.1 + r() * 0.2})`;
    g.lineWidth = 0.6 + r() * 0.8;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.moveTo(x + ox, y + oy); g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l); g.stroke();
    }
  }
  const blur = document.createElement('canvas');
  blur.width = blur.height = S;
  const bg = blur.getContext('2d');
  bg.filter = 'blur(0.6px)';
  bg.drawImage(c, 0, 0);
  // 法線
  const d = bg.getImageData(0, 0, S, S).data;
  const nc = document.createElement('canvas');
  nc.width = nc.height = S;
  const ng = nc.getContext('2d');
  const out = ng.createImageData(S, S);
  const H = (x, y) => d[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const l = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255; out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; out.data[o + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const map = new THREE.CanvasTexture(blur);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3); t.anisotropy = 8; }
  feltTex = { map, normalMap };
  return feltTex;
}

const mats = new Map();
/** フェルトの材質。sheen（布の起毛の光り方）で、ななめから見たときにふわっと明るくなる。 */
export function feltMaterial(color, { sheen = 1, rough = 1, glow = 0, metal = 0 } = {}) {
  const key = [color, sheen, rough, glow, metal].join(':');
  if (mats.has(key)) return mats.get(key);
  const { map, normalMap } = feltTextures();
  const c = new THREE.Color(color);
  const m = new THREE.MeshPhysicalMaterial({
    name: 'felt', color: c, map, normalMap, normalScale: new THREE.Vector2(0.45, 0.45), roughness: rough, metalness: metal,
    sheen: sheen * 0.8, sheenRoughness: 0.8, sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.22),
    emissive: glow ? c.clone() : 0x000000, emissiveIntensity: glow,
  });
  mats.set(key, m);
  return m;
}

const threadMats = new Map();
export function threadMaterial(color) {
  if (!threadMats.has(color)) threadMats.set(color, new THREE.MeshStandardMaterial({ name: 'thread', color, roughness: 0.7 }));
  return threadMats.get(color);
}
