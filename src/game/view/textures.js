// canvas で描くテクスチャ（画像ファイルは使わない）。どれも 1 回だけ作って使い回す。
import * as THREE from 'three';

const TAU = Math.PI * 2;
const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat = null, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  t.anisotropy = aniso;
  return t;
}
function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
// 決まった並びの乱数（描くたびに同じ模様）
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/** 高さの絵（グレー）から法線マップを作る。 */
export function normalFromHeight(src, strength = 2) {
  const w = src.width, h = src.height;
  const d = src.getContext('2d').getImageData(0, 0, w, h).data;
  const [c, g] = canvas(w, h);
  const out = g.createImageData(w, h);
  const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (y * w + x) * 4;
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255;
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[o + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  return c;
}

/** ラグーンの床：明るい水色に、ゆらめく光の網目（コースティクス）と砂の粒。 */
export function lagoonFloor() {
  return once('lagoon', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#3fc6d0'); grd.addColorStop(1, '#5fd8d2');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    const r = rng(7);
    // 砂の粒
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(255,255,240,${0.04 + r() * 0.08})`; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
    // 光の網目：ずらした円弧を重ねる（端がつながるよう 3x3 に描く）
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * S, rad = 18 + r() * 40, a0 = r() * TAU, len = 0.8 + r() * 1.6;
      g.strokeStyle = `rgba(230,255,250,${0.18 + r() * 0.22})`;
      g.lineWidth = 2 + r() * 3;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { g.beginPath(); g.arc(x + ox, y + oy, rad, a0, a0 + len); g.stroke(); }
    }
    return tex(c, { repeat: [2, 2] });
  });
}

/** 木の板（プッシャーの前の面・台のまわり）。color は地の色。 */
export function planks(key = 'planks', base = '#b9773f', seed = 3) {
  return once('planks:' + key, () => {
    const W = 512, H = 256;
    const [c, g] = canvas(W, H);
    const r = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const y = (i * H) / rows;
      const shade = (r() - 0.5) * 30;
      g.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 220 : 0},${shade > 0 ? 170 : 0},${Math.abs(shade) / 255})`;
      g.fillRect(0, y, W, H / rows);
      // 木目
      for (let k = 0; k < 14; k++) {
        g.strokeStyle = `rgba(70,35,10,${0.08 + r() * 0.12})`;
        g.lineWidth = 1 + r() * 1.5;
        g.beginPath();
        const yy = y + r() * (H / rows);
        g.moveTo(0, yy);
        for (let x = 0; x <= W; x += 32) g.lineTo(x, yy + Math.sin(x * 0.02 + k) * 2.5 + (r() - 0.5) * 2);
        g.stroke();
      }
      g.fillStyle = 'rgba(60,30,10,0.55)'; g.fillRect(0, y, W, 3);
    }
    return tex(c);
  });
}

/** 竹（円柱に巻く）：節の線と縦の筋。 */
export function bamboo() {
  return once('bamboo', () => {
    const W = 64, H = 256;
    const [c, g] = canvas(W, H);
    const grd = g.createLinearGradient(0, 0, W, 0);
    grd.addColorStop(0, '#c9b45a'); grd.addColorStop(0.5, '#e6d27c'); grd.addColorStop(1, '#c2ab50');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    const r = rng(11);
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(120,100,30,${0.06 + r() * 0.08})`; g.fillRect(r() * W, 0, 1, H); }
    for (const y of [0, 128]) { g.fillStyle = 'rgba(110,85,25,0.75)'; g.fillRect(0, y, W, 5); g.fillStyle = 'rgba(255,245,190,0.5)'; g.fillRect(0, y + 5, W, 2); }
    return tex(c, { repeat: [1, 1] });
  });
}

/** 砂浜：やわらかい砂色に粒と小さな貝。 */
export function sand() {
  return once('sand', () => {
    const S = 512;
    const [c, g] = canvas(S, S);
    g.fillStyle = '#f1dcae'; g.fillRect(0, 0, S, S);
    const r = rng(5);
    for (let i = 0; i < 9000; i++) { const v = r(); g.fillStyle = v < 0.5 ? `rgba(200,160,100,${0.15 + r() * 0.2})` : `rgba(255,250,235,${0.2 + r() * 0.3})`; g.fillRect(r() * S, r() * S, 1 + r() * 1.5, 1 + r() * 1.5); }
    // 風紋
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = 'rgba(190,150,90,0.12)'; g.lineWidth = 2;
      g.beginPath(); const y = r() * S; g.moveTo(0, y);
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 6);
      g.stroke();
    }
    return tex(c, { repeat: [10, 10] });
  });
}

/** 浮き輪の赤白のしま（トーラスの u 方向）。 */
export function ringStripes() {
  return once('ring', () => {
    const [c, g] = canvas(256, 32);
    for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#fff7ee' : '#ff5b4d'; g.fillRect(i * 32, 0, 32, 32); }
    return tex(c);
  });
}

/** ティキの彫り物の板（奥の壁の顔）：木の地に、ジグザグと三角の模様の帯。 */
export function tikiPanel() {
  return once('tiki', () => {
    const W = 1024, H = 320;
    const [c, g] = canvas(W, H);
    g.fillStyle = '#8a5530'; g.fillRect(0, 0, W, H);
    const r = rng(21);
    for (let k = 0; k < 60; k++) {
      g.strokeStyle = `rgba(50,25,8,${0.08 + r() * 0.1})`; g.lineWidth = 1 + r() * 2;
      g.beginPath(); const y = r() * H; g.moveTo(0, y);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x * 0.01 + k) * 3);
      g.stroke();
    }
    // 上下の帯：三角の連続
    for (const [y0, flip] of [[18, 1], [H - 18, -1]]) {
      g.fillStyle = '#5b3418';
      for (let x = 0; x < W; x += 40) { g.beginPath(); g.moveTo(x, y0 - 12 * flip); g.lineTo(x + 20, y0 + 12 * flip); g.lineTo(x + 40, y0 - 12 * flip); g.closePath(); g.fill(); }
      g.fillStyle = '#e8b04b';
      for (let x = 0; x < W; x += 40) { g.beginPath(); g.arc(x + 20, y0 - 2 * flip, 3, 0, TAU); g.fill(); }
    }
    return tex(c);
  });
}

/** 台の正面の看板：木の板に「ざくざくラグーン」と COIN LAGOON、両はしにハイビスカス。 */
export function signBoard() {
  return once('sign', () => {
    const W = 1024, H = 128;
    const [c, g] = canvas(W, H);
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#2fb8bd'); grd.addColorStop(1, '#1d8f94');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#f6e3b4'; g.lineWidth = 6; g.setLineDash([14, 10]); g.strokeRect(10, 10, W - 20, H - 20); g.setLineDash([]);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '60px "Mochiy Pop One", "Hiragino Maru Gothic ProN", sans-serif';
    g.lineWidth = 10; g.strokeStyle = '#7a2d16'; g.strokeText('ざくざくラグーン', 400, H / 2 + 2);
    g.fillStyle = '#fff6dc'; g.fillText('ざくざくラグーン', 400, H / 2 + 2);
    g.font = '26px "Mochiy Pop One", sans-serif';
    g.fillStyle = '#ffd24a'; g.fillText('COIN LAGOON', 800, H / 2 + 4);
    for (const x of [64, W - 64]) {
      g.fillStyle = '#e8354c';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU - Math.PI / 2; g.beginPath(); g.arc(x + Math.cos(a) * 20, H / 2 + Math.sin(a) * 20, 18, 0, TAU); g.fill(); }
      g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(x, H / 2, 9, 0, TAU); g.fill();
    }
    return tex(c);
  });
}
