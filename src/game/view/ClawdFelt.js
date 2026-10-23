// フェルトの Clawd。clawd-mascot スキルの SVG（viewBox 150x110：胴 86x66、腕 24x22、脚 4 本 11x22、目 13x13）の寸法から組む。
//   makePrize(variantId)   景品：1 枚のフェルト（胴・腕・脚がつながった形）に目と小物。物理の景品と同じ座標（中心が SVG の (75, 52)、顔が +z）
//   new Mascot()           台の上の大きな Clawd：胴・腕・脚が別のフェルトで、肩・脚の付け根で動く。足もとが y = 0
import * as THREE from 'three';
import { PRIZE, CLAWD_RECTS } from '../machine/layout.js';
import { VARIANT } from '../prizes.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sd, feltGeometry, stitchGeometry, feltMaterial, threadMaterial } from './Felt.js';

const TAU = Math.PI * 2;
const EYE = '#141414';

/** SVG の四角 [x, y, w, h] → 中心と半分の大きさ（s 倍、原点 (ox, oy)、y は上向き） */
const rectOf = ([x, y, w, h], s, ox, oy) => ({ cx: (x + w / 2 - ox) * s, cy: (oy - (y + h / 2)) * s, hx: (w / 2) * s, hy: (h / 2) * s });

// ---------------------------------------------------------------- 景品
let prizeBase = null;
function prizeShape() {
  if (prizeBase) return prizeBase;
  const s = PRIZE.s, R = (r) => rectOf(r, s, PRIZE.cx, PRIZE.cy);
  const b = R(CLAWD_RECTS.body), aL = R(CLAWD_RECTS.armL), aR = R(CLAWD_RECTS.armR);
  const legs = CLAWD_RECTS.legs.map(R);
  const sdf = sd.smooth(0.06,
    sd.box(b.cx, b.cy, b.hx, b.hy, 0.07),
    sd.box(aL.cx, aL.cy, aL.hx, aL.hy, 0.05), sd.box(aR.cx, aR.cy, aR.hx, aR.hy, 0.05),
    ...legs.map((l) => sd.box(l.cx, l.cy + 0.04, l.hx, l.hy + 0.04, 0.045)));
  const bbox = [-1.45, -1.02, 1.45, 1.02];
  const half = PRIZE.thick / 2 - 0.015;
  const felt = feltGeometry(sdf, bbox, { spacing: 0.04, half, edge: 0.075, puff: 0.03, puffD: 0.5 });
  const stitches = stitchGeometry(felt.loops, felt.height, { gap: 0.105, len: 0.08, w: 0.024, inset: 0.035 });
  // 目（黒いフェルトを縫いつけた四角）
  const eyes = [CLAWD_RECTS.eyeL, CLAWD_RECTS.eyeR].map(R);
  const eyeFelt = feltGeometry(sd.box(0, 0, eyes[0].hx, eyes[0].hy, 0.035), [-0.18, -0.18, 0.18, 0.18], { spacing: 0.018, half: 0.018, edge: 0.03, puff: 0.006, puffD: 0.1 });
  const top = felt.height(0.5);
  prizeBase = { sdf, felt, stitches, eyes, eyeFelt, top, half };
  return prizeBase;
}

/** 景品の Clawd（THREE.Group）。物理の景品と同じ向き・中心。 */
export function makePrize(variantId) {
  const v = VARIANT[variantId] || VARIANT.classic;
  const base = prizeShape();
  const g = new THREE.Group();
  g.name = 'prize:' + v.id;
  const bodyMat = feltMaterial(v.color, v.gold ? { metal: 0.55, rough: 0.55, sheen: 1 } : {});
  const body = new THREE.Mesh(base.felt.geometry, bodyMat);
  body.name = 'felt';
  const st = new THREE.Mesh(base.stitches, threadMaterial(v.thread));
  st.name = 'stitches';
  g.add(body, st);
  const eyeMat = feltMaterial(EYE, { sheen: 0.3 });
  for (const e of base.eyes) {
    const m = new THREE.Mesh(base.eyeFelt.geometry, eyeMat);
    m.position.set(e.cx, e.cy, base.felt.height(-base.sdf(e.cx, e.cy)) - 0.004);
    m.name = 'eye';
    g.add(m);
  }
  for (const a of v.acc || []) addAccessory(g, a, base, PRIZE.s);
  // 景品らしく、頭にボールチェーンの輪（帽子があるときは帽子の上へ）
  const chain = new THREE.Mesh(chainGeometry(), CHAIN_MAT);
  chain.name = 'ballChain';
  chain.position.set(0.18, (v.acc || []).includes('strawhat') ? 1.12 : 0.9, 0);
  chain.rotation.z = -0.25;
  g.add(chain);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

// ボールチェーン：小さな玉を、しずくの形の輪に並べる（1 つの形にまとめる）
export const CHAIN_MAT = new THREE.MeshStandardMaterial({ name: 'ballChain', color: 0xd8dde4, metalness: 1, roughness: 0.25 });
let chainGeo = null;
function chainGeometry() {
  if (chainGeo) return chainGeo;
  const parts = [];
  const N = 22;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU;
    // しずく形：下（付け根）がすぼまる
    const x = Math.sin(a) * 0.13 * (0.35 + 0.65 * (1 - Math.cos(a)) / 2), y = 0.17 - Math.cos(a) * 0.17;
    const b = new THREE.SphereGeometry(0.026, 8, 6);
    b.translate(x, y, 0);
    parts.push(b);
  }
  const ring = new THREE.TorusGeometry(0.035, 0.012, 6, 12);
  ring.translate(0, 0.0, 0);
  parts.push(ring);
  chainGeo = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  return chainGeo;
}

// ---------------------------------------------------------------- 小物（景品にも大きな Clawd にも使う。s は SVG 1px の大きさ）
const accCache = new Map();
function accGeo(key, make) { if (!accCache.has(key)) accCache.set(key, make()); return accCache.get(key); }

/** 5 枚の花びらの花（ハイビスカス）。r は花の半径。 */
function flowerSdf(r, petals = 5) {
  const parts = [];
  for (let i = 0; i < petals; i++) { const a = (i / petals) * TAU + Math.PI / 2; parts.push(sd.circle(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.52)); }
  return sd.smooth(r * 0.25, ...parts);
}
function star5(r) {
  return (x, y) => {
    // 星形の距離（おおよそ）：角度で半径を変える
    const a = Math.atan2(y, x) - Math.PI / 2, k = (Math.cos(a * 5) * 0.5 + 0.5);
    return Math.hypot(x, y) - r * (0.48 + 0.52 * Math.pow(k, 2.2));
  };
}

function addAccessory(g, kind, base, s) {
  const k = s / PRIZE.s; // 景品の大きさに対する倍率
  const zTop = base.top;
  const put = (geo, mat, x, y, z, rz = 0, name = kind) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * k, y * k, z);
    m.rotation.z = rz;
    m.scale.setScalar(k);
    m.name = name;
    g.add(m);
    return m;
  };
  if (kind === 'hibiscus') {
    const f = accGeo('hib', () => feltGeometry(flowerSdf(0.24), [-0.3, -0.3, 0.3, 0.3], { spacing: 0.016, half: 0.022, edge: 0.03, puff: 0.012, puffD: 0.12 }));
    const st = accGeo('hibSt', () => stitchGeometry(f.loops, f.height, { gap: 0.07, len: 0.05, w: 0.016, inset: 0.02, back: false }));
    const c = accGeo('hibC', () => feltGeometry(sd.circle(0, 0, 0.075), [-0.09, -0.09, 0.09, 0.09], { spacing: 0.012, half: 0.016, edge: 0.02, puff: 0.006, puffD: 0.05 }));
    const x = 0.66, y = 0.66, z = zTop + 0.02;
    put(f.geometry, feltMaterial('#e8354c'), x, y, z, 0.3, 'hibiscus');
    put(st, threadMaterial('#ffd0d6'), x, y, z + 0.004, 0.3, 'hibiscusStitch');
    put(c.geometry, feltMaterial('#ffd24a'), x, y, z + 0.03, 0, 'hibiscusCenter');
  } else if (kind === 'shades') {
    const rows = ['##################', '.#######..#######.', '..#####....#####..'];
    const px = 0.066, py = 0.105, x0 = -9 * px, y0 = 0.62;
    const boxes = [];
    rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '#') boxes.push(sd.box(x0 + (c + 0.5) * px, y0 - (r + 0.5) * py, px * 0.55, py * 0.55, 0.01)); });
    const f = accGeo('shades', () => feltGeometry(sd.union(...boxes), [-0.66, 0.24, 0.66, 0.68], { spacing: 0.016, half: 0.02, edge: 0.025, puff: 0.005, puffD: 0.08 }));
    put(f.geometry, feltMaterial('#1b1b22', { sheen: 0.7 }), 0, 0, zTop + 0.035, 0, 'shades');
    // レンズの白い光（小さな四角）
    const hl = accGeo('shadesHl', () => new THREE.BoxGeometry(0.07, 0.05, 0.01));
    for (const x of [-0.42, 0.36]) put(hl, threadMaterial('#ffffff'), x, 0.535, zTop + 0.06, 0, 'shadesShine');
  } else if (kind === 'lei') {
    const f = accGeo('leiF', () => feltGeometry(flowerSdf(0.12), [-0.15, -0.15, 0.15, 0.15], { spacing: 0.012, half: 0.018, edge: 0.022, puff: 0.008, puffD: 0.06 }));
    const cols = ['#ff6f91', '#ffd84d', '#ffffff', '#ff9a3c'];
    for (let i = 0; i < 9; i++) {
      const u = i / 8 - 0.5;
      put(f.geometry, feltMaterial(cols[i % 4]), u * 1.6, -0.08 - (1 - u * u * 4) * 0.12, zTop + 0.02 + (i % 2) * 0.006, i * 0.7, 'leiFlower');
    }
  } else if (kind === 'strawhat') {
    const crown = accGeo('hatC', () => feltGeometry(sd.box(0, 0, 0.44, 0.17, 0.08), [-0.48, -0.21, 0.48, 0.21], { spacing: 0.02, half: 0.03, edge: 0.04, puff: 0.01, puffD: 0.15 }));
    const brim = accGeo('hatB', () => feltGeometry(sd.box(0, 0, 0.82, 0.075, 0.07), [-0.86, -0.1, 0.86, 0.1], { spacing: 0.02, half: 0.026, edge: 0.03, puff: 0.004, puffD: 0.08 }));
    const band = accGeo('hatBand', () => feltGeometry(sd.box(0, 0, 0.44, 0.045, 0.02), [-0.46, -0.06, 0.46, 0.06], { spacing: 0.012, half: 0.014, edge: 0.016, puff: 0, puffD: 0.05 }));
    const st = accGeo('hatSt', () => stitchGeometry(crown.loops, crown.height, { gap: 0.08, len: 0.05, w: 0.016, inset: 0.025, back: false }));
    const straw = feltMaterial('#e9c879');
    put(crown.geometry, straw, 0, 1.06, zTop + 0.03, 0, 'hatCrown');
    put(st, threadMaterial('#a87b36'), 0, 1.06, zTop + 0.035, 0, 'hatStitch');
    put(brim.geometry, straw, 0, 0.88, zTop + 0.05, 0, 'hatBrim');
    put(band.geometry, feltMaterial('#d8384a'), 0, 0.97, zTop + 0.06, 0, 'hatBand');
  } else if (kind === 'stars') {
    const f = accGeo('star', () => feltGeometry(star5(0.11), [-0.13, -0.13, 0.13, 0.13], { spacing: 0.01, half: 0.014, edge: 0.016, puff: 0.004, puffD: 0.04 }));
    const m = feltMaterial('#ffd75a', { glow: 0.35 });
    for (const [x, y, r] of [[-0.62, 0.05, 0.2], [0.55, -0.12, -0.3], [0.05, 0.12, 0.5], [-0.25, -0.32, 0.9]]) put(f.geometry, m, x, y, zTop + 0.015, r, 'star');
  }
}

// ---------------------------------------------------------------- 台の上の大きな Clawd（関節つき）
export const MASCOT_S = 1 / 37;

export class Mascot {
  constructor({ color = '#C67D5F', thread = '#fff1dc', acc = ['hibiscus'] } = {}) {
    const s = MASCOT_S, ox = 75, oy = 96; // 足もとが y = 0
    const R = (r) => rectOf(r, s, ox, oy);
    const root = (this.root = new THREE.Group());
    root.name = 'mascot';
    const body = (this.body = new THREE.Group()); // 胴（はねる・かたむく）
    body.name = 'body';
    root.add(body);
    const mat = feltMaterial(color), th = threadMaterial(thread);
    const piece = (rect, r, half, name) => {
      const sdf = sd.box(0, 0, rect.hx, rect.hy, r);
      const f = feltGeometry(sdf, [-rect.hx - 0.02, -rect.hy - 0.02, rect.hx + 0.02, rect.hy + 0.02], { spacing: 0.04, half, edge: half * 1.05, puff: half * 0.4, puffD: 0.5 });
      const g = new THREE.Group();
      g.name = name;
      const m = new THREE.Mesh(f.geometry, mat);
      m.name = name + 'Felt';
      const st = new THREE.Mesh(stitchGeometry(f.loops, f.height, { gap: 0.115, len: 0.09, w: 0.026, inset: 0.04 }), th);
      st.name = name + 'Stitch';
      g.add(m, st);
      g.userData.height = f.height;
      g.userData.sdf = sdf;
      return g;
    };
    // 胴
    const b = R(CLAWD_RECTS.body);
    const torso = piece(b, 0.08, 0.13, 'torso');
    torso.position.set(b.cx, b.cy, 0);
    body.add(torso);
    this.torsoTop = torso.userData.height(1);
    // 目
    const eyeR = R(CLAWD_RECTS.eyeL);
    const eyeGeo = feltGeometry(sd.box(0, 0, eyeR.hx, eyeR.hy, 0.04), [-0.21, -0.21, 0.21, 0.21], { spacing: 0.02, half: 0.022, edge: 0.035, puff: 0.006, puffD: 0.1 }).geometry;
    const eyeMat = feltMaterial(EYE, { sheen: 0.3 });
    this.eyes = [CLAWD_RECTS.eyeL, CLAWD_RECTS.eyeR].map((r, i) => {
      const e = R(r);
      const m = new THREE.Mesh(eyeGeo, eyeMat);
      m.position.set(e.cx, e.cy, this.torsoTop - 0.006);
      m.name = i ? 'eyeR' : 'eyeL';
      body.add(m);
      return m;
    });
    // 腕（肩で回る）。左腕の軸は右の端、右腕の軸は左の端（clawd-mascot の animation.md）
    const mkArm = (rect, side) => {
      const a = R(rect);
      const pivot = new THREE.Group();
      pivot.name = side < 0 ? 'armL' : 'armR';
      pivot.position.set(a.cx - side * a.hx, a.cy, -0.03);
      const p = piece(a, 0.06, 0.1, pivot.name + 'Piece');
      p.position.set(side * a.hx, 0, 0);
      pivot.add(p);
      body.add(pivot);
      return pivot;
    };
    this.armL = mkArm(CLAWD_RECTS.armL, -1);
    this.armR = mkArm(CLAWD_RECTS.armR, 1);
    // 脚（付け根で揺れる）
    this.legs = CLAWD_RECTS.legs.map((r, i) => {
      const l = R([r[0], r[1] - 3, r[2], r[3] + 3]);
      const pivot = new THREE.Group();
      pivot.name = 'leg' + i;
      pivot.position.set(l.cx, l.cy + l.hy, -0.04);
      const p = piece(l, 0.05, 0.085, 'leg' + i + 'Piece');
      p.position.set(0, -l.hy, 0);
      pivot.add(p);
      root.add(pivot);
      return pivot;
    });
    // 小物（ハイビスカス）。景品と同じ作り方で、大きさだけ変える
    const accBase = { top: this.torsoTop };
    const accG = new THREE.Group();
    accG.position.set(0, (oy - PRIZE.cy) * s, 0); // 景品の座標（中心が SVG の (75, 52)）に合わせる
    for (const a of acc) addAccessory(accG, a, accBase, s);
    body.add(accG);
    // ねむっているときの「z z z」
    this.zzz = makeZzz();
    this.zzz.position.set(1.4, 2.6, 0.2);
    root.add(this.zzz);
    root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

    this.t = 0;
    this.toss = 0;      // 投げた直後（1 → 0）
    this.joy = 0;       // ばんざい（秒）
    this.sleep = 0;     // ねむり（0〜1）
    this.vx = 0;        // 左右の速さ（かたむきに使う）
  }

  throwCoin() { this.toss = 1; }
  cheer(sec = 2) { this.joy = Math.max(this.joy, sec); }
  setSleep(on) { this.wantSleep = on; }

  update(dt) {
    this.t += dt;
    const t = this.t;
    this.toss = Math.max(0, this.toss - dt * 4.5);
    this.joy = Math.max(0, this.joy - dt);
    this.sleep += ((this.wantSleep && !this.joy ? 1 : 0) - this.sleep) * Math.min(1, dt * 2.5);
    const joy = this.joy > 0 ? 1 : 0, sl = this.sleep;
    // 腕：ふだんは少し揺れる。投げると右腕を振り上げ、ばんざいは両腕を上げる（3D では左腕は z マイナスで上がる）
    const idle = Math.sin(t * 2.2) * 0.08 * (1 - sl);
    const tossK = Math.sin(this.toss * Math.PI);
    let up = idle + joy * (0.95 + Math.sin(t * 14) * 0.15) - sl * 0.25;
    this.armL.rotation.z = -(up + tossK * 0.3);
    this.armR.rotation.z = up + tossK * 1.0;
    // 胴：はずむ・左右に動くとかたむく・眠ると呼吸
    const hop = joy ? Math.abs(Math.sin(t * 9)) * 0.25 : 0;
    this.body.position.y = hop + tossK * 0.06 + Math.sin(t * 1.6) * 0.02 * (1 - sl);
    this.body.rotation.z = THREE.MathUtils.clamp(-this.vx * 0.05, -0.2, 0.2) + (joy ? Math.sin(t * 7) * 0.08 : 0);
    this.body.rotation.x = -tossK * 0.12;
    this.body.scale.set(1, 1 - sl * (0.03 + Math.sin(t * 2) * 0.015), 1);
    // 脚：歩くように交互に
    const walk = Math.min(1, Math.abs(this.vx) * 0.6) + joy;
    this.legs.forEach((l, i) => { l.rotation.z = Math.sin(t * 12 + (i % 2) * Math.PI) * 0.18 * walk; });
    // 目：眠ると細く、ときどきまばたき
    const blink = ((t + 1.3) % 3.7) < 0.12 ? 0.15 : 1;
    for (const e of this.eyes) e.scale.y = Math.min(blink, 1 - sl * 0.82);
    this.zzz.visible = sl > 0.5;
    if (this.zzz.visible) {
      this.zzz.position.y = 2.6 + ((t * 0.4) % 1) * 0.6;
      this.zzz.material.opacity = (1 - ((t * 0.4) % 1)) * sl;
    }
  }
}

function makeZzz() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.font = '700 72px "Hiragino Maru Gothic ProN", system-ui, sans-serif';
  g.fillStyle = '#8A96C9';
  g.fillText('z', 10, 110); g.font = '700 58px system-ui'; g.fillText('z', 80, 80); g.font = '700 44px system-ui'; g.fillText('z', 140, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.2, 0.6, 1);
  sp.name = 'zzz';
  return sp;
}
