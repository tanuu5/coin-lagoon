// スロットの見た目：奥の壁の窓からのぞく 3 本のリール、竹の枠、たまっている回数のランプ。
// リールの絵は canvas で描く（ハイビスカス・パイナップル・貝・ココナッツ・太陽・Clawd）。
import * as THREE from 'three';
import { BACKWALL } from '../machine/layout.js';
import { SYMBOLS, STOCK_MAX } from '../Slot.js';
import { bamboo } from './textures.js';

const TAU = Math.PI * 2;
const N = SYMBOLS.length;
// y：リールの軸の高さ、out：壁の面から前へ出る量、view：絵を止める角度（正面から上へ。上から見るカメラに絵を向ける）
export const REEL = { y: 2.42, r: 0.72, w: 1.06, gap: 1.16, out: 0.38, view: 0.42 };

export class Reels {
  constructor(scene) {
    const g = (this.root = new THREE.Group());
    g.name = 'reels';
    const tex = new THREE.CanvasTexture(drawStrip());
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.mat = new THREE.MeshStandardMaterial({ name: 'reel', map: tex, roughness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.06 });
    const geo = new THREE.CylinderGeometry(REEL.r, REEL.r, REEL.w, 60, 1, true);
    geo.rotateZ(Math.PI / 2);
    const cz = BACKWALL.z + REEL.out - REEL.r;
    this.drums = [-1, 0, 1].map((k, i) => {
      const d = new THREE.Mesh(geo, this.mat);
      d.position.set(k * REEL.gap, REEL.y, cz);
      d.name = 'reel' + i;
      g.add(d);
      return d;
    });
    this.st = this.drums.map((_, i) => ({ phi: angleOf(i * 2), vel: 0, mode: 'idle', from: 0, to: 0, t: 0 }));
    // 窓の枠（竹）と、当たりの線
    const bm = new THREE.MeshStandardMaterial({ name: 'reelFrame', map: bamboo(), roughness: 0.5 });
    const fz = BACKWALL.z + 0.08, hw = REEL.gap * 1.5 + 0.06, hh = Math.sqrt(REEL.r * REEL.r - (REEL.r - REEL.out) ** 2) - 0.02;
    const bar = (len, x, y, rot) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, len, 10), bm);
      m.position.set(x, y, fz);
      m.rotation.z = rot;
      m.castShadow = true;
      m.name = 'reelFrameBar';
      g.add(m);
    };
    bar(hw * 2 + 0.2, 0, REEL.y + hh, Math.PI / 2);
    bar(hw * 2 + 0.2, 0, REEL.y - hh, Math.PI / 2);
    bar(hh * 2 + 0.2, -hw, REEL.y, 0);
    bar(hh * 2 + 0.2, hw, REEL.y, 0);
    for (const k of [-0.5, 0.5]) bar(hh * 2, k * REEL.gap, REEL.y, 0);
    // 窓の奥（暗い）
    const back = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, hh * 2), new THREE.MeshBasicMaterial({ color: 0x1d120a }));
    back.position.set(0, REEL.y, BACKWALL.z + 0.004);
    back.name = 'reelWindow';
    g.add(back);
    // 当たりの線：絵を止める角度の所（壁より少し前）
    const line = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 0.1, 0.022, 0.022), new THREE.MeshBasicMaterial({ color: 0xff4a4a, transparent: true, opacity: 0.6 }));
    line.position.set(0, REEL.y + Math.sin(REEL.view) * (REEL.r + 0.02), cz + Math.cos(REEL.view) * (REEL.r + 0.02));
    line.name = 'payline';
    g.add(line);
    // たまっている回数のランプ（貝の形の電球）
    this.lampMat = [];
    this.lamps = [];
    for (let i = 0; i < STOCK_MAX; i++) {
      const m = new THREE.MeshStandardMaterial({ name: 'lamp', color: 0x7a5a3a, emissive: 0xffc04a, emissiveIntensity: 0, roughness: 0.3 });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), m);
      l.position.set((i - (STOCK_MAX - 1) / 2) * 0.34, REEL.y + hh + 0.2, BACKWALL.z + 0.06);
      l.scale.set(1, 1, 0.6);
      l.name = 'lamp' + i;
      g.add(l);
      this.lampMat.push(m);
      this.lamps.push(l);
    }
    scene.add(g);
    this.flash = 0;
    this.time = 0;
  }

  /** 当たったときに窓を光らせる。 */
  celebrate() { this.flash = 1; }

  update(dt, slot) {
    this.time += dt;
    slot.reels.forEach((rl, i) => {
      const s = this.st[i];
      if (rl.spinning) {
        s.mode = 'spin';
        s.vel = Math.min(15, s.vel + dt * 60);
        s.phi += s.vel * dt;
      } else if (s.mode === 'spin') {
        // 止める：今の角度から、絵の位置まで少し行きすぎて戻る
        const want = angleOf(rl.target);
        let to = want + Math.ceil((s.phi + 1.6 - want) / TAU) * TAU;
        s.mode = 'stop';
        s.from = s.phi;
        s.to = to;
        s.t = 0;
      } else if (s.mode === 'stop') {
        s.t += dt;
        const k = Math.min(1, s.t / 0.38);
        s.phi = s.from + (s.to - s.from) * backOut(k);
        if (k >= 1) { s.mode = 'idle'; s.vel = 0; s.phi = s.to % TAU; }
      }
      this.drums[i].rotation.x = s.phi;
    });
    for (let i = 0; i < STOCK_MAX; i++) {
      const on = i < slot.stock;
      this.lampMat[i].emissiveIntensity = on ? 1.6 + Math.sin(this.time * 6 + i) * 0.4 : 0;
      this.lampMat[i].color.setHex(on ? 0xffe7a8 : 0x7a5a3a);
    }
    this.flash = Math.max(0, this.flash - dt * 0.7);
    this.mat.emissiveIntensity = 0.06 + (this.flash > 0 ? (Math.sin(this.time * 22) * 0.5 + 0.5) * this.flash * 0.8 : 0);
  }
}

// 絵 k を、正面から上へ REEL.view の所に止める角度
const angleOf = (k) => ((k + 0.5) / N) * TAU - REEL.view;
function backOut(k) { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }

/** リールの帯：6 つの絵を横に並べる（円柱に巻くと縦に並ぶ。絵は 90° 回して描く）。 */
function drawStrip() {
  const C = 256;
  const c = document.createElement('canvas');
  c.width = C * N; c.height = C;
  const g = c.getContext('2d');
  for (let k = 0; k < N; k++) {
    g.save();
    g.translate(k * C, 0);
    g.fillStyle = '#fbefd6'; g.fillRect(0, 0, C, C);
    g.fillStyle = '#d9c39b'; g.fillRect(0, 0, 8, C); g.fillRect(C - 8, 0, 8, C);
    g.translate(C / 2, C / 2);
    g.rotate(Math.PI / 2);
    g.scale(0.95, 0.95);
    // 輪郭：同じ絵を太い濃い線で描いてから、上に絵を重ねる
    g.save();
    g.shadowColor = 'rgba(60,30,10,0.9)';
    g.shadowBlur = 0;
    for (const [dx, dy] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-4, -4], [4, 4], [-4, 4], [4, -4]]) {
      g.save(); g.translate(dx, dy); g.globalAlpha = 1; outlineOnly(g, SYMBOLS[k]); g.restore();
    }
    g.restore();
    SYMBOL_DRAW[SYMBOLS[k]](g);
    g.restore();
  }
  return c;
}

/** 輪郭用：絵を濃い色だけで描く（ずらして重ねると縁取りになる）。 */
function outlineOnly(g, name) {
  const o = { fillStyle: '', strokeStyle: '' };
  const proxy = new Proxy(g, {
    set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') { t[k] = '#5a2e14'; return true; } t[k] = v; return true; },
    get(t, k) { const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
  });
  SYMBOL_DRAW[name](proxy);
  void o;
}

// 絵（中心 0,0、だいたい半径 100 に収める）
export const SYMBOL_DRAW = {
  hibiscus(g) {
    g.fillStyle = '#e8354c';
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; g.beginPath(); g.ellipse(Math.cos(a) * 46, Math.sin(a) * 46, 52, 42, a, 0, TAU); g.fill(); }
    g.fillStyle = '#b81d3a'; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill();
    g.strokeStyle = '#ffd24a'; g.lineWidth = 8; g.beginPath(); g.moveTo(0, 0); g.lineTo(34, -54); g.stroke();
    g.fillStyle = '#ffd24a'; for (const [x, y] of [[34, -54], [44, -48], [28, -64]]) { g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); }
  },
  pineapple(g) {
    g.fillStyle = '#3c9a47';
    for (const [a, l] of [[-0.5, 70], [0, 84], [0.5, 70], [-0.25, 78], [0.25, 78]]) { g.save(); g.translate(0, -30); g.rotate(a); g.beginPath(); g.moveTo(-12, 0); g.lineTo(0, -l); g.lineTo(12, 0); g.closePath(); g.fill(); g.restore(); }
    g.fillStyle = '#f6b62c'; g.beginPath(); g.ellipse(0, 30, 52, 66, 0, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.ellipse(0, 30, 52, 66, 0, 0, TAU); g.clip();
    g.strokeStyle = '#c9861a'; g.lineWidth = 5;
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(i * 22 - 80, -40); g.lineTo(i * 22 + 80, 100); g.stroke(); g.beginPath(); g.moveTo(i * 22 + 80, -40); g.lineTo(i * 22 - 80, 100); g.stroke(); }
    g.restore();
  },
  shell(g) {
    g.fillStyle = '#ff9c86';
    g.beginPath(); g.moveTo(0, 70); g.arc(0, 10, 90, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); g.fill();
    g.strokeStyle = '#e07f6c'; g.lineWidth = 6;
    for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(0, 70); g.lineTo(Math.sin(i * 0.36) * 88, 10 - Math.cos(i * 0.36) * 88); g.stroke(); }
    g.fillStyle = '#ffb3a1'; g.beginPath(); g.moveTo(-26, 70); g.lineTo(26, 70); g.lineTo(16, 92); g.lineTo(-16, 92); g.closePath(); g.fill();
  },
  coconut(g) {
    g.fillStyle = '#6b4226'; g.beginPath(); g.arc(0, 4, 80, 0, TAU); g.fill();
    g.fillStyle = '#fff6e6'; g.beginPath(); g.arc(0, 4, 60, 0, TAU); g.fill();
    g.fillStyle = '#e9dcc4'; g.beginPath(); g.arc(-8, -4, 40, 0, TAU); g.fill();
    g.fillStyle = '#4a2c18'; for (const [x, y] of [[-70, -40], [-56, -58], [-80, -18]]) { g.beginPath(); g.arc(x * 0.98, y, 6, 0, TAU); g.fill(); }
  },
  sun(g) {
    g.fillStyle = '#ff8a00';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(Math.cos(a - 0.14) * 58, Math.sin(a - 0.14) * 58); g.lineTo(Math.cos(a) * 98, Math.sin(a) * 98); g.lineTo(Math.cos(a + 0.14) * 58, Math.sin(a + 0.14) * 58); g.fill(); }
    g.fillStyle = '#ffc61a'; g.beginPath(); g.arc(0, 0, 58, 0, TAU); g.fill();
    g.fillStyle = '#c96a12'; g.beginPath(); g.arc(-20, -10, 7, 0, TAU); g.arc(20, -10, 7, 0, TAU); g.fill();
    g.strokeStyle = '#c96a12'; g.lineWidth = 6; g.beginPath(); g.arc(0, 4, 26, 0.2, Math.PI - 0.2); g.stroke();
  },
  clawd(g) {
    const k = 1.25, r = (x, y, w, h) => g.fillRect((x - 75) * k, (y - 52) * k, w * k, h * k);
    g.fillStyle = '#C67D5F';
    r(32, 8, 86, 66); r(12, 35, 24, 22); r(114, 35, 24, 22);
    for (const x of [32, 53, 86, 107]) r(x, 74, 11, 22);
    g.fillStyle = '#141414'; r(50, 22, 13, 13); r(88, 22, 13, 13);
  },
};
