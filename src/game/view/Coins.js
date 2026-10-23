// コインの見た目。台の上のコイン（物理の ph.coins）と、台から落ちていく見た目だけのコインを、1 つの InstancedMesh で描く。
// 形は手で組む：くぼんだ面に Clawd の浮き彫り、ふちの盛り上がり、角の丸み、側面のギザ。
// テクスチャは canvas で描く（左半分：面の模様、右半分：側面のギザ）。法線マップも同じ高さの絵から作る。
import * as THREE from 'three';
import { COIN, FIELD } from '../machine/layout.js';

const MAX = 520;
const TAU = Math.PI * 2;

export class Coins {
  constructor(scene) {
    const geo = coinGeometry();
    const { map, normalMap } = coinTextures();
    this.mat = new THREE.MeshStandardMaterial({
      name: 'coin', color: 0xffbf3a, metalness: 1, roughness: 0.26, map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), envMapIntensity: 1.15,
    });
    const mesh = (this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX));
    mesh.name = 'coins';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // 1 枚ずつ少し色を変える（新しい金貨・くすんだ金貨）
    const tint = new THREE.Color();
    for (let i = 0; i < MAX; i++) {
      const k = 0.86 + ((i * 7919) % 97) / 97 * 0.16;
      mesh.setColorAt(i, tint.setRGB(k, k * (0.97 + ((i * 31) % 13) / 13 * 0.05), k * 0.94));
    }
    scene.add(mesh);
    this.falling = []; // 台から落ちたコイン（見た目だけ）：{ p, v, q, w, t }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._axis = new THREE.Vector3();
  }

  /** 台から落ちたコインを、見た目だけで続けて落とす（獲得なら受け皿へ、横なら下へ消える）。 */
  drop(p, v, q, won) {
    if (this.falling.length > 120) this.falling.shift();
    this.falling.push({
      p: new THREE.Vector3(p.x, p.y, p.z), v: new THREE.Vector3(v.x, Math.min(v.y, 0), v.z),
      q: new THREE.Quaternion(q.x, q.y, q.z, q.w), w: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14),
      t: 0, won,
    });
  }

  update(dt, ph, trayY) {
    const mesh = this.mesh, m = this._m, q = this._q, p = this._p, s = this._s;
    let n = 0;
    for (const c of ph.coins) {
      if (n >= MAX) break;
      const t = c.body.translation(), r = c.body.rotation();
      p.set(t.x, t.y, t.z);
      q.set(r.x, r.y, r.z, r.w);
      mesh.setMatrixAt(n++, m.compose(p, q, s));
    }
    // 落ちていくコイン：受け皿（trayY）に当たったら止まって沈む
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.v.y -= 30 * dt;
      f.p.addScaledVector(f.v, dt);
      if (f.won && f.p.y < trayY && f.p.z > FIELD.edgeZ) { f.p.y = trayY; f.v.multiplyScalar(0.3); f.v.y = Math.abs(f.v.y) * 0.2; }
      const wl = f.w.length();
      if (wl > 0) { this._axis.copy(f.w).divideScalar(wl); f.q.premultiply(q.setFromAxisAngle(this._axis, wl * dt)); }
      if (f.t > (f.won ? 0.9 : 0.8)) { this.falling.splice(i, 1); continue; }
      if (n >= MAX) continue;
      const sink = f.won ? Math.max(0, f.t - 0.55) / 0.35 : 0;
      s.setScalar(1 - sink * 0.9);
      mesh.setMatrixAt(n++, m.compose(f.p, f.q, s));
      s.setScalar(1);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }
}

/** コインの形：くぼんだ面（Clawd の浮き彫りは法線マップ）・ふちの盛り上がり・角の丸み・側面。面ごとに法線を分けて、角をくっきりさせる。 */
function coinGeometry(seg = 36) {
  const R = COIN.r, H = COIN.hh, B = 0.028, RIM = 0.405, DEP = 0.014;
  const pos = [], nor = [], uv = [], idx = [];
  // 面の UV（アトラスの左半分）
  // 奥（-z）が絵の上になるように：寝かせたコインを手前から見ても、立てて抱えたコインを見ても、Clawd が上を向く
  const faceUV = (x, z, top) => [0.25 + (x / R) * 0.235 * (top ? 1 : -1), 0.5 - (z / R) * 0.47];
  const vert = (x, y, z, nx, ny, nz, u, v) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, v); return pos.length / 3 - 1; };
  for (const top of [true, false]) {
    const sy = top ? 1 : -1;
    // くぼんだ面（中心から RIM まで）
    const c = vert(0, sy * (H - DEP), 0, 0, sy, 0, ...faceUV(0, 0, top));
    const ring = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * TAU, x = Math.cos(a) * RIM, z = Math.sin(a) * RIM;
      ring.push(vert(x, sy * (H - DEP), z, 0, sy, 0, ...faceUV(x, z, top)));
    }
    for (let i = 0; i < seg; i++) top ? idx.push(c, ring[i + 1], ring[i]) : idx.push(c, ring[i], ring[i + 1]);
    // くぼみの内側の斜面と、ふちの上面、角の丸み、側面の半分
    const prof = []; // [r, y, nr, ny, u?]
    prof.push([RIM, H - DEP, -0.6, 0.8], [RIM + 0.02, H, -0.6, 0.8]);
    prof.push([RIM + 0.02, H, 0, 1], [R - B, H, 0, 1]);
    for (let k = 0; k <= 4; k++) { const t = (k / 4) * (Math.PI / 2); prof.push([R - B + Math.sin(t) * B, H - B + Math.cos(t) * B, Math.sin(t), Math.cos(t)]); }
    prof.push([R, H - B, 1, 0], [R, 0, 1, 0]);
    // 断面の組ごとに帯を作る（同じ点が続く所で法線を分ける）
    for (let j = 0; j < prof.length - 1; j++) {
      const [r0, y0, nr0, ny0] = prof[j], [r1, y1, nr1, ny1] = prof[j + 1];
      if (r0 === r1 && y0 === y1) continue;
      const side = nr0 === 1 && nr1 === 1;
      const rowA = [], rowB = [];
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        const uvA = side ? [0.5 + 0.5 * (i / seg), 0.5 + 0.5 * (y0 / H) * sy * 0.98] : faceUV(ca * r0, sa * r0, top);
        const uvB = side ? [0.5 + 0.5 * (i / seg), 0.5 + 0.5 * (y1 / H) * sy * 0.98] : faceUV(ca * r1, sa * r1, top);
        rowA.push(vert(ca * r0, sy * y0, sa * r0, ca * nr0, sy * ny0, sa * nr0, ...uvA));
        rowB.push(vert(ca * r1, sy * y1, sa * r1, ca * nr1, sy * ny1, sa * nr1, ...uvB));
      }
      for (let i = 0; i < seg; i++) {
        const a0 = rowA[i], a1 = rowA[i + 1], b0 = rowB[i], b1 = rowB[i + 1];
        if (top) idx.push(a0, a1, b1, a0, b1, b0); else idx.push(a0, b1, a1, a0, b0, b1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeTangents?.();
  return g;
}

/** コインの模様（色と法線）。高さの絵を描いて、法線マップに直す。 */
function coinTextures() {
  const W = 512, Hh = 256;
  const hc = document.createElement('canvas');
  hc.width = W; hc.height = Hh;
  const g = hc.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, Hh);
  // 左半分：面。ふちに点の輪、まんなかに Clawd の浮き彫り
  const cx = 128, cy = 128, R = 120;
  g.fillStyle = '#fff';
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU;
    g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.78, cy + Math.sin(a) * R * 0.78, 3.2, 0, TAU); g.fill();
  }
  // Clawd（SVG の 150x110 を 1.1 倍で中央へ）
  const k = 1.15, ox = cx - 75 * k, oy = cy - 56 * k;
  const r = (x, y, w, h) => g.fillRect(ox + x * k, oy + y * k, w * k, h * k);
  g.fillStyle = '#d0d0d0';
  r(32, 8, 86, 66); r(12, 35, 24, 22); r(114, 35, 24, 22);
  for (const x of [32, 53, 86, 107]) r(x, 74, 11, 22);
  g.fillStyle = '#000';
  r(50, 22, 13, 13); r(88, 22, 13, 13);
  // 右半分：側面のギザ（縦の筋）
  for (let x = 0; x < 256; x += 4) { g.fillStyle = x % 8 ? '#000' : '#bbb'; g.fillRect(256 + x, 0, 2, Hh); }
  // ぼかして角を丸める
  const blur = document.createElement('canvas');
  blur.width = W; blur.height = Hh;
  const bg = blur.getContext('2d');
  bg.filter = 'blur(1.6px)';
  bg.drawImage(hc, 0, 0);
  const hd = bg.getImageData(0, 0, W, Hh).data;
  // 法線マップ
  const nc = document.createElement('canvas');
  nc.width = W; nc.height = Hh;
  const ng = nc.getContext('2d');
  const out = ng.createImageData(W, Hh);
  const h = (x, y) => hd[(((y + Hh) % Hh) * W + ((x + W) % W)) * 4] / 255;
  const S = 3.2;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * S, dy = (h(x, y + 1) - h(x, y - 1)) * S;
    const l = Math.hypot(dx, dy, 1);
    const o = (y * W + x) * 4;
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[o + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  // 色：高い所（浮き彫り）を明るく、くぼみを少し暗く
  const cc = document.createElement('canvas');
  cc.width = W; cc.height = Hh;
  const cg = cc.getContext('2d');
  const col = cg.createImageData(W, Hh);
  for (let i = 0; i < W * Hh; i++) {
    const v = hd[i * 4] / 255;
    const b = 0.78 + v * 0.22;
    col.data[i * 4] = 255 * b; col.data[i * 4 + 1] = 255 * b; col.data[i * 4 + 2] = 255 * b; col.data[i * 4 + 3] = 255;
  }
  cg.putImageData(col, 0, 0);
  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) { t.anisotropy = 4; t.generateMipmaps = true; }
  return { map, normalMap };
}
