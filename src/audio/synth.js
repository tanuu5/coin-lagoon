// 音源と効果音。音声ファイルは使わず、Web Audio のオシレーターとノイズで鳴らす。
// どの関数も (ctx, out, t, p) の形：out はミキサーの系統（{ dry, wet }）、t は鳴らす時刻（ctx.currentTime 基準）。
// p は { f（Hz）or m（MIDI）, dur, vel（0〜1）, pan（-1〜1）, rev（リバーブへの送り 0〜1） } など。
// 値はすべて fin() で確かめてから使う（NaN が AudioParam に入ると、その音はもう鳴らない）。

const fin = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const FLOOR = 0.0001; // 指数ランプは 0 に向かえないので、ここまで下げる

const noiseCache = new WeakMap();
function noiseBuffer(ctx) {
  let b = noiseCache.get(ctx);
  if (!b) {
    const n = ctx.sampleRate * 1.5;
    b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let s = 22222;
    for (let i = 0; i < n; i++) d[i] = ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    noiseCache.set(ctx, b);
  }
  return b;
}

/** node → 音量 → 定位 → out.dry（と、rev があれば out.wet）につなぐ。音量の GainNode を返す。 */
function route(ctx, node, out, p) {
  const g = ctx.createGain();
  g.gain.value = 0;
  let last = node.connect(g);
  if (p.pan) {
    const pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, fin(p.pan, 0)));
    last = last.connect(pan);
  }
  last.connect(out.dry);
  const rev = fin(p.rev, 0);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; last.connect(s).connect(out.wet); }
  return g;
}

/** 立ち上がり a、減衰 d で peak から消える（打楽器・効果音の形）。 */
function perc(param, t, peak, a, d) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + a);
  param.exponentialRampToValueAtTime(FLOOR, t + a + d);
}
/** 立ち上がり a、保持、離して r で消える（持続音の形）。 */
function adsr(param, t, peak, a, hold, r) {
  param.setValueAtTime(FLOOR, t);
  param.linearRampToValueAtTime(Math.max(FLOOR, peak), t + a);
  param.setValueAtTime(Math.max(FLOOR, peak), t + a + hold);
  param.exponentialRampToValueAtTime(FLOOR, t + a + hold + r);
}

function osc(ctx, type, f, t, end) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(1, f), t);
  o.start(t);
  o.stop(end + 0.05);
  return o;
}

function noise(ctx, t, end) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx);
  s.loop = true;
  s.start(t, Math.random() * 1.2);
  s.stop(end + 0.05);
  return s;
}

function filter(ctx, type, f, q = 0.8) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = Math.max(10, f);
  b.Q.value = q;
  return b;
}

const hz = (p, def) => fin(p.f, p.m !== undefined ? mtof(fin(p.m, 69)) : def);

// ---------------------------------------------------------------- 楽器（シーケンサーから使う）
export const INSTRUMENTS = {
  /** 矩形波のリード（チップチューン寄り）。 */
  lead(ctx, out, t, p) {
    const f = hz(p, 440), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'square', f, t, t + dur + 0.2);
    const lp = filter(ctx, 'lowpass', Math.min(9000, f * 6), 0.7);
    const g = route(ctx, o.connect(lp), out, { rev: 0.18, ...p });
    adsr(g.gain, t, 0.14 * vel, 0.006, Math.max(0, dur - 0.03), 0.12);
  },
  /** のこぎり波のベース（フィルターで弾く）。 */
  bass(ctx, out, t, p) {
    const f = hz(p, 55), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'sawtooth', f, t, t + dur + 0.15);
    const lp = filter(ctx, 'lowpass', 900, 3);
    lp.frequency.setValueAtTime(220 + 2200 * vel, t);
    lp.frequency.exponentialRampToValueAtTime(260, t + 0.18);
    const g = route(ctx, o.connect(lp), out, p);
    adsr(g.gain, t, 0.3 * vel, 0.004, Math.max(0, dur - 0.04), 0.08);
  },
  /** 少しずらした 3 本ののこぎり波のパッド（和音向け）。 */
  pad(ctx, out, t, p) {
    const f = hz(p, 220), dur = fin(p.dur, 1), vel = fin(p.vel, 0.6);
    const lp = filter(ctx, 'lowpass', 1800, 0.5);
    const mix = ctx.createGain();
    for (const det of [-9, 0, 8]) { const o = osc(ctx, 'sawtooth', f, t, t + dur + 0.8); o.detune.value = det; o.connect(mix); }
    mix.gain.value = 0.33;
    const g = route(ctx, mix.connect(lp), out, { rev: 0.35, ...p });
    adsr(g.gain, t, 0.08 * vel, 0.12, Math.max(0, dur - 0.12), 0.6);
  },
  /** 弾いた音（三角波＋短い倍音）。アルペジオ・メロディに。 */
  pluck(ctx, out, t, p) {
    const f = hz(p, 440), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'triangle', f, t, t + 0.6);
    const o2 = osc(ctx, 'sine', f * 2, t, t + 0.25);
    const m = ctx.createGain();
    o.connect(m); o2.connect(m);
    const g = route(ctx, m, out, { rev: 0.2, ...p });
    perc(g.gain, t, 0.25 * vel, 0.003, 0.45);
  },
  /** 鐘（FM）。完成・ご褒美の合図に。 */
  bell(ctx, out, t, p) {
    const f = hz(p, 880), vel = fin(p.vel, 0.7), dur = fin(p.dur, 1.4);
    const car = osc(ctx, 'sine', f, t, t + dur);
    const mod = osc(ctx, 'sine', f * 3.5, t, t + dur);
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * 0.05), t + dur);
    mod.connect(mg).connect(car.frequency);
    const g = route(ctx, car, out, { rev: 0.35, ...p });
    perc(g.gain, t, 0.18 * vel, 0.002, dur);
  },
  kick(ctx, out, t, p) {
    const vel = fin(p.vel, 0.9);
    const o = osc(ctx, 'sine', 150, t, t + 0.45);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = route(ctx, o, out, p);
    perc(g.gain, t, 0.9 * vel, 0.002, 0.38);
  },
  snare(ctx, out, t, p) {
    const vel = fin(p.vel, 0.8);
    const n = noise(ctx, t, t + 0.25);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 1800, 0.7)), out, { rev: 0.15, ...p });
    perc(g.gain, t, 0.5 * vel, 0.001, 0.18);
    const o = osc(ctx, 'triangle', 190, t, t + 0.15);
    const g2 = route(ctx, o, out, p);
    perc(g2.gain, t, 0.3 * vel, 0.001, 0.09);
  },
  hat(ctx, out, t, p) {
    const vel = fin(p.vel, 0.6), open = !!p.open;
    const n = noise(ctx, t, t + (open ? 0.35 : 0.08));
    const g = route(ctx, n.connect(filter(ctx, 'highpass', 7500, 0.7)), out, p);
    perc(g.gain, t, 0.22 * vel, 0.001, open ? 0.3 : 0.05);
  },
  // ---- 南の島の楽器
  /** スチールパン：基音・オクターブ・少しずれた 3 倍音を、それぞれの長さで減衰させる。 */
  steel(ctx, out, t, p) {
    const f = hz(p, 523), vel = fin(p.vel, 0.7), dur = fin(p.dur, 0.25);
    const len = Math.max(0.5, Math.min(1.4, dur + 0.5));
    for (const [r, a, d] of [[1, 1, len], [2, 0.42, len * 0.6], [3.01, 0.16, len * 0.35], [4.2, 0.06, 0.12]]) {
      const o = osc(ctx, 'sine', f * r, t, t + d + 0.05);
      const g = route(ctx, o, out, { rev: 0.25, ...p });
      perc(g.gain, t, 0.13 * a * vel, 0.004, d);
    }
  },
  /** ウクレレ：のこぎり波を、閉じていくフィルターで弾く。 */
  uke(ctx, out, t, p) {
    const f = hz(p, 392), vel = fin(p.vel, 0.7);
    const o = osc(ctx, 'sawtooth', f, t, t + 0.7);
    const o2 = osc(ctx, 'triangle', f * 2.002, t, t + 0.4);
    const lp = filter(ctx, 'lowpass', 3200, 1.2);
    lp.frequency.setValueAtTime(Math.min(9000, f * 9), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.6), t + 0.25);
    const m = ctx.createGain();
    m.gain.value = 0.7;
    o.connect(lp); o2.connect(m).connect(lp);
    const g = route(ctx, lp, out, { rev: 0.15, ...p });
    perc(g.gain, t, 0.12 * vel, 0.003, 0.55);
  },
  /** マリンバ：まるい音と、短い 4 倍音。 */
  marimba(ctx, out, t, p) {
    const f = hz(p, 523), vel = fin(p.vel, 0.7);
    const o = osc(ctx, 'sine', f, t, t + 0.6);
    const o2 = osc(ctx, 'sine', f * 3.99, t, t + 0.1);
    const g = route(ctx, o, out, { rev: 0.18, ...p });
    perc(g.gain, t, 0.22 * vel, 0.003, 0.42);
    const g2 = route(ctx, o2, out, p);
    perc(g2.gain, t, 0.05 * vel, 0.001, 0.05);
  },
  /** やわらかいベース（三角波）。 */
  bassSoft(ctx, out, t, p) {
    const f = hz(p, 55), dur = fin(p.dur, 0.25), vel = fin(p.vel, 0.8);
    const o = osc(ctx, 'triangle', f, t, t + dur + 0.2);
    const o2 = osc(ctx, 'sine', f, t, t + dur + 0.2);
    const m = ctx.createGain();
    m.gain.value = 0.6;
    o.connect(m); o2.connect(m);
    const g = route(ctx, m.connect(filter(ctx, 'lowpass', 700, 0.7)), out, p);
    adsr(g.gain, t, 0.45 * vel, 0.01, Math.max(0, dur - 0.05), 0.12);
  },
  shaker(ctx, out, t, p) {
    const vel = fin(p.vel, 0.5);
    const n = noise(ctx, t, t + 0.09);
    const g = route(ctx, n.connect(filter(ctx, 'bandpass', 6500, 1.4)), out, p);
    g.gain.setValueAtTime(FLOOR, t);
    g.gain.linearRampToValueAtTime(0.13 * vel, t + 0.018);
    g.gain.exponentialRampToValueAtTime(FLOOR, t + 0.08);
  },
  conga(ctx, out, t, p) {
    const vel = fin(p.vel, 0.7), f = hz(p, 220);
    const o = osc(ctx, 'sine', f * 1.35, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
    const g = route(ctx, o, out, { rev: 0.1, ...p });
    perc(g.gain, t, 0.35 * vel, 0.002, 0.24);
    const n = noise(ctx, t, t + 0.03);
    const g2 = route(ctx, n.connect(filter(ctx, 'bandpass', 1800, 1)), out, p);
    perc(g2.gain, t, 0.08 * vel, 0.001, 0.02);
  },
};

// ---------------------------------------------------------------- 効果音（audio.sfx(name) で鳴らす）
// 作品に合わせて足す・作り替える。名前はゲームの出来事に合わせる（coin, hit, gameover …）。
export const SFX = {
  ui_move(ctx, out, t) { INSTRUMENTS.pluck(ctx, out, t, { f: 1320, vel: 0.35, rev: 0 }); },
  ui_ok(ctx, out, t) { INSTRUMENTS.pluck(ctx, out, t, { f: 988, vel: 0.5 }); INSTRUMENTS.pluck(ctx, out, t + 0.06, { f: 1480, vel: 0.5 }); },
  ui_back(ctx, out, t) { INSTRUMENTS.pluck(ctx, out, t, { f: 880, vel: 0.45 }); INSTRUMENTS.pluck(ctx, out, t + 0.06, { f: 587, vel: 0.45 }); },
  pause(ctx, out, t) { INSTRUMENTS.bell(ctx, out, t, { f: 784, vel: 0.9, dur: 0.6 }); },
  jump(ctx, out, t, p = {}) {
    const o = osc(ctx, 'square', 300, t, t + 0.2);
    o.frequency.exponentialRampToValueAtTime(760 * fin(p.pitch, 1), t + 0.14);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 3200)), out, p);
    perc(g.gain, t, 0.12, 0.004, 0.16);
  },
  land(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.12);
    const g = route(ctx, n.connect(filter(ctx, 'lowpass', 600, 0.9)), out, p);
    perc(g.gain, t, 0.35 * fin(p.vel, 1), 0.002, 0.1);
  },
  coin(ctx, out, t, p = {}) {
    const k = fin(p.pitch, 1);
    for (const [dt, f] of [[0, 1319], [0.07, 1976]]) {
      const o = osc(ctx, 'square', f * k, t + dt, t + dt + 0.3);
      const g = route(ctx, o.connect(filter(ctx, 'lowpass', 6000)), out, { rev: 0.15, ...p });
      perc(g.gain, t + dt, 0.1, 0.002, dt ? 0.26 : 0.08);
    }
  },
  hit(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sawtooth', 220, t, t + 0.25);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.2);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 1400)), out, p);
    perc(g.gain, t, 0.3, 0.002, 0.22);
    SFX.land(ctx, out, t, { vel: 0.8 });
  },
  explode(ctx, out, t, p = {}) {
    const dur = fin(p.dur, 1.1);
    const n = noise(ctx, t, t + dur);
    const lp = filter(ctx, 'lowpass', 3000, 0.6);
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = route(ctx, n.connect(lp), out, { rev: 0.3, ...p });
    perc(g.gain, t, 0.7, 0.004, dur);
    INSTRUMENTS.kick(ctx, out, t, { vel: 1 });
  },
  powerup(ctx, out, t, p = {}) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => INSTRUMENTS.pluck(ctx, out, t + i * 0.055, { f, vel: 0.55, rev: 0.25, ...p }));
  },

  // ---- コインプッシャーの音
  /** コインどうしが当たる「チン」：金属の、倍音の並びがそろわない短い音。 */
  clink(ctx, out, t, p = {}) {
    const k = fin(p.pitch, 1), vel = fin(p.vel, 0.6);
    const base = 2350 * k;
    for (const [r, a, d] of [[1, 1, 0.09], [2.76, 0.55, 0.06], [5.4, 0.3, 0.035], [8.93, 0.16, 0.02]]) {
      const o = osc(ctx, 'sine', base * r, t, t + d + 0.05);
      const g = route(ctx, o, out, { rev: 0.08, ...p });
      perc(g.gain, t, 0.1 * a * vel, 0.0008, d);
    }
  },
  /** 手前から落ちて受け皿に入る「チャリン」。 */
  payout(ctx, out, t, p = {}) {
    const k = 0.95 + Math.random() * 0.12;
    SFX.clink(ctx, out, t, { ...p, pitch: 1.1 * k, vel: 0.9 });
    SFX.clink(ctx, out, t + 0.045 + Math.random() * 0.02, { ...p, pitch: 0.86 * k, vel: 0.55 });
  },
  /** Clawd がコインを投げる：軽い「ポッ」と風を切る音。 */
  toss(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sine', 520, t, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.06);
    const g = route(ctx, o, out, p);
    perc(g.gain, t, 0.08, 0.002, 0.08);
    const n = noise(ctx, t, t + 0.16);
    const bp = filter(ctx, 'bandpass', 2400, 1.2);
    bp.frequency.setValueAtTime(1600, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.14);
    const g2 = route(ctx, n.connect(bp), out, p);
    perc(g2.gain, t, 0.05, 0.01, 0.12);
  },
  /** リールが回りはじめる：駆け上がるマリンバ。 */
  reelStart(ctx, out, t, p = {}) {
    [60, 64, 67, 72].forEach((m, i) => INSTRUMENTS.marimba(ctx, out, t + i * 0.04, { m: m + 12, vel: 0.5, ...p }));
  },
  /** リールが止まる「カタン」。 */
  reelStop(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.06);
    const g = route(ctx, n.connect(filter(ctx, 'lowpass', 1800 * fin(p.pitch, 1), 1.2)), out, p);
    perc(g.gain, t, 0.35, 0.001, 0.05);
    INSTRUMENTS.marimba(ctx, out, t, { m: 67 + Math.round((fin(p.pitch, 1) - 1) * 40), vel: 0.6 });
  },
  /** リーチ：ふたつの鐘がふるえながら上がっていく。 */
  reach(ctx, out, t, p = {}) {
    for (let i = 0; i < 10; i++) INSTRUMENTS.steel(ctx, out, t + i * 0.12, { m: (i % 2 ? 79 : 76) + Math.floor(i / 2), vel: 0.45 + i * 0.03, dur: 0.1, ...p });
  },
  /** はずれ：やさしく下がるふたつの音。 */
  miss(ctx, out, t, p = {}) {
    INSTRUMENTS.marimba(ctx, out, t, { m: 67, vel: 0.45, ...p });
    INSTRUMENTS.marimba(ctx, out, t + 0.12, { m: 62, vel: 0.4, ...p });
  },
  /** 当たり：スチールパンの分散和音。 */
  win(ctx, out, t, p = {}) {
    [72, 76, 79, 84].forEach((m, i) => INSTRUMENTS.steel(ctx, out, t + i * 0.07, { m, vel: 0.7, dur: 0.3, ...p }));
  },
  winBig(ctx, out, t, p = {}) {
    [72, 76, 79, 84, 88, 91].forEach((m, i) => INSTRUMENTS.steel(ctx, out, t + i * 0.065, { m, vel: 0.75, dur: 0.4, ...p }));
    INSTRUMENTS.bell(ctx, out, t + 0.42, { m: 96, vel: 0.6, dur: 1.4 });
    INSTRUMENTS.kick(ctx, out, t, { vel: 0.6 });
  },
  /** サンセットフィーバー：和音の連打と、上がっていく音。 */
  jackpot(ctx, out, t, p = {}) {
    const chords = [[60, 64, 67], [62, 65, 69], [64, 67, 71], [65, 69, 72, 77]];
    chords.forEach((c, i) => c.forEach((m) => INSTRUMENTS.steel(ctx, out, t + i * 0.16, { m: m + 12, vel: 0.6, dur: i === 3 ? 0.9 : 0.15 })));
    const o = osc(ctx, 'sawtooth', 220, t, t + 0.9);
    o.frequency.exponentialRampToValueAtTime(880, t + 0.8);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 2400, 0.8)), out, { rev: 0.3 });
    adsr(g.gain, t, 0.05, 0.1, 0.5, 0.3);
    INSTRUMENTS.kick(ctx, out, t, { vel: 0.8 });
    INSTRUMENTS.kick(ctx, out, t + 0.48, { vel: 0.8 });
    INSTRUMENTS.bell(ctx, out, t + 0.48, { m: 101, vel: 0.6, dur: 1.6 });
  },
  /** 景品が降ってくる：ひゅるる…と下がる笛。 */
  prizeDrop(ctx, out, t, p = {}) {
    const o = osc(ctx, 'sine', 1600, t, t + 0.6);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.55);
    const g = route(ctx, o, out, { rev: 0.25, ...p });
    adsr(g.gain, t, 0.06, 0.03, 0.4, 0.15);
  },
  /** 景品を獲得：ファンファーレ。 */
  prizeGet(ctx, out, t, p = {}) {
    const mel = [[72, 0], [72, 0.12], [72, 0.24], [76, 0.36], [79, 0.6], [84, 0.84]];
    for (const [m, dt] of mel) { INSTRUMENTS.steel(ctx, out, t + dt, { m, vel: 0.8, dur: dt > 0.7 ? 1 : 0.2 }); INSTRUMENTS.uke(ctx, out, t + dt, { m: m - 12, vel: 0.5 }); }
    for (const m of [60, 64, 67, 72]) INSTRUMENTS.pad(ctx, out, t + 0.84, { m, vel: 0.5, dur: 1.2 });
    INSTRUMENTS.kick(ctx, out, t + 0.84, { vel: 0.8 });
    INSTRUMENTS.bell(ctx, out, t + 0.84, { m: 96, vel: 0.5, dur: 1.8 });
  },
  /** 横に落ちた：「あ〜あ」と下がる音。 */
  aww(ctx, out, t, p = {}) {
    const o = osc(ctx, 'square', 392, t, t + 0.9);
    o.frequency.setValueAtTime(392, t);
    o.frequency.linearRampToValueAtTime(370, t + 0.3);
    o.frequency.setValueAtTime(330, t + 0.35);
    o.frequency.linearRampToValueAtTime(294, t + 0.85);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 1100, 1)), out, { rev: 0.2, ...p });
    adsr(g.gain, t, 0.06, 0.02, 0.7, 0.15);
  },
  /** 横に落ちた：下がっていく小さな音と、遠くでこもった「コトン」。 */
  lost(ctx, out, t, p = {}) {
    const o = osc(ctx, 'triangle', 620, t, t + 0.3);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.22);
    const g = route(ctx, o.connect(filter(ctx, 'lowpass', 1400, 0.7)), out, p);
    perc(g.gain, t, 0.07, 0.004, 0.22);
    const n = noise(ctx, t + 0.18, t + 0.3);
    const g2 = route(ctx, n.connect(filter(ctx, 'lowpass', 500, 0.9)), out, p);
    perc(g2.gain, t + 0.18, 0.12, 0.002, 0.08);
  },
  /** フェルトがぶつかる「ぽふ」。 */
  felt(ctx, out, t, p = {}) {
    const n = noise(ctx, t, t + 0.1);
    const g = route(ctx, n.connect(filter(ctx, 'lowpass', 520, 0.8)), out, p);
    perc(g.gain, t, 0.25, 0.005, 0.08);
  },
  /** 浮き輪をくぐった：明るい鐘ふたつ。 */
  hoop(ctx, out, t, p = {}) {
    INSTRUMENTS.bell(ctx, out, t, { f: 1568, vel: 0.9, dur: 0.9, ...p });
    INSTRUMENTS.bell(ctx, out, t + 0.08, { f: 2093, vel: 0.8, dur: 1.1, ...p });
  },
};
