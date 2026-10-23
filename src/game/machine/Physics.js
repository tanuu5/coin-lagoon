// コイン・プッシャー・壁・浮き輪・景品の物理（Rapier）。three には依存しない（Node の調整スクリプト tools/sim.mjs からも使う）。
//
//   const ph = new Physics(RAPIER);
//   ph.on = { won(c, p, v, q), lost(c, p, v, q), hoop(c, p), prizeWon(z, p, v, q), prizeLost(z, p, v, q) }（p, v, q は外したあとの位置・速さ・向き）
//   ph.toss(x)            Clawd がコインを投げる（浮き輪をくぐるとスロット）
//   ph.step(dt)           1/120 秒ずつ進める（足りないぶんは次に持ちこす）
//   ph.coins / ph.prizes  描画はこれを毎フレーム読む（body.translation() / rotation()）
//   ph.serialize() / ph.restore(data)   台の上を保存・復元
import { COIN, FIELD, PUSHER, BACKWALL, HOOP, TOSS, PRIZE, CLAWD_RECTS, pusherFront } from './layout.js';

export const PHYS_DT = 1 / 120;
const MAX_SUBSTEPS = 6;     // 重いフレームのあと、一度に進める上限（それ以上は捨てる）
const TAU = Math.PI * 2;
const FALL_Y = -0.4;        // ここより下に中心が落ちたら、台から落ちたとみなす
const STUCK_Y = 1.75;       // これより高い所で止まったコインは、引っかかっているとみなす

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function quatEuler(x, y, z) {
  // XYZ の順のオイラー角 → 四元数（three の Euler 'XYZ' と同じ）
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return { x: s1 * c2 * c3 + c1 * s2 * s3, y: c1 * s2 * c3 - s1 * c2 * s3, z: c1 * c2 * s3 + s1 * s2 * c3, w: c1 * c2 * c3 - s1 * s2 * s3 };
}
// 景品を表向きに寝かせる向き（顔が上、頭が奥）
export const FACE_UP = quatEuler(-Math.PI / 2, 0, 0);

/** 景品（フェルトの Clawd）の当たりの四角：[中心 x, 中心 y, 半幅, 半高, 半厚]（体の座標。顔は +z） */
export function prizeBoxes() {
  const s = PRIZE.s, T = PRIZE.thick / 2;
  const rect = ([x, y, w, h], t) => [(x + w / 2 - PRIZE.cx) * s, (PRIZE.cy - (y + h / 2)) * s, (w / 2) * s, (h / 2) * s, t];
  return [rect(CLAWD_RECTS.body, T), rect(CLAWD_RECTS.armL, T * 0.75), rect(CLAWD_RECTS.armR, T * 0.75), ...CLAWD_RECTS.legs.map((l) => rect(l, T * 0.7))];
}

export class Physics {
  constructor(R, { gravity = 30, clink = 6 } = {}) {
    this.R = R;
    const w = (this.world = new R.World({ x: 0, y: -gravity, z: 0 }));
    w.timestep = PHYS_DT;
    this.queue = new R.EventQueue(true);
    this.clinkThreshold = clink;
    this.coins = [];
    this.prizes = [];
    this.byCollider = new Map(); // コライダーの handle → コイン／景品
    this.clinks = [];            // このフレームにぶつかった音の候補 [x, y, z, 強さ]（ゲームが読んで空にする）
    this.phase = -Math.PI / 2;   // プッシャーの位相（いちばん奥から始める）
    this.speed = 1;              // プッシャーの速さの倍率（フィーバーで上げる）
    this.hoopPhase = 0;
    this.hoopX = 0;
    this.hoopOn = true;
    this.acc = 0;
    this.time = 0;
    this.nextPrizeId = 1;
    this.on = {};
    this._build();
  }

  // ---------------------------------------------------------------- 台
  _build() {
    const { R, world } = this;
    const fixed = (this.fixed = world.createRigidBody(R.RigidBodyDesc.fixed()));
    const box = (hx, hy, hz, x, y, z, fr = 0.3) =>
      world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(fr).setRestitution(0.05), fixed);
    // 下の段の床
    const len = FIELD.edgeZ - FIELD.backZ;
    box(FIELD.halfW, 0.5, len / 2, 0, -0.5, (FIELD.edgeZ + FIELD.backZ) / 2, 0.26);
    // 横の壁（奥から wallEndZ まで）。床の下まで伸ばして、すき間を作らない
    const wl = FIELD.wallEndZ - FIELD.backZ, wh = (FIELD.wallTop + 1) / 2;
    for (const s of [-1, 1]) box(FIELD.wallT / 2, wh, wl / 2, s * (FIELD.halfW + FIELD.wallT / 2), FIELD.wallTop - wh, (FIELD.wallEndZ + FIELD.backZ) / 2, 0.15);
    // サイドガード（フィーバー中だけ）：横の壁の続きを手前のふちまで
    const gl = FIELD.edgeZ - FIELD.wallEndZ, gh = (FIELD.guardTop + 1) / 2;
    this.guards = [-1, 1].map((s) => {
      const c = box(FIELD.wallT / 2, gh, gl / 2, s * (FIELD.halfW + FIELD.wallT / 2), FIELD.guardTop - gh, (FIELD.edgeZ + FIELD.wallEndZ) / 2, 0.15);
      c.setEnabled(false);
      return c;
    });
    this.guardsOn = false;
    // 奥の壁（棚のコインを押しとどめる）
    const bh = (BACKWALL.top - BACKWALL.bottom) / 2;
    box(FIELD.halfW, bh, BACKWALL.t / 2, 0, BACKWALL.bottom + bh, BACKWALL.z - BACKWALL.t / 2, 0.2);
    // 浮き輪をわたす竹の棒は見た目だけ（当たりがあると、はね返ったコインが棒の上に積もる）

    // プッシャー（位置で動かす kinematic）。上の面が棚
    this.pusher = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PUSHER.h / 2, pusherFront(this.phase) - PUSHER.depth / 2));
    world.createCollider(R.ColliderDesc.cuboid(FIELD.halfW - 0.02, PUSHER.h / 2, PUSHER.depth / 2).setFriction(0.55).setRestitution(0.03), this.pusher);

    // 浮き輪（玉を輪に並べて縁にする。真ん中は空いていて、くぐれる）
    this.hoop = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, HOOP.y, HOOP.z));
    const N = 22;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * TAU;
      world.createCollider(R.ColliderDesc.ball(HOOP.tube).setTranslation(Math.cos(a) * HOOP.R, 0, Math.sin(a) * HOOP.R).setRestitution(0.35).setFriction(0.3), this.hoop);
    }
  }

  setGuards(on) {
    if (this.guardsOn === on) return;
    this.guardsOn = on;
    for (const g of this.guards) g.setEnabled(on);
    // 寝ているコインも、ガードが消えたことに気づくよう起こす
    if (!on) for (const c of this.coins) c.body.wakeUp();
  }

  get pusherZ() { return pusherFront(this.phase); }

  // ---------------------------------------------------------------- コイン
  addCoin(x, y, z, q = null, lin = null, ang = null) {
    const { R, world } = this;
    const bd = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setCcdEnabled(true).setLinearDamping(0.04).setAngularDamping(0.25);
    if (q) bd.setRotation(q);
    if (lin) bd.setLinvel(lin.x, lin.y, lin.z);
    if (ang) bd.setAngvel(ang);
    const body = world.createRigidBody(bd);
    const b = COIN.border;
    const col = world.createCollider(R.ColliderDesc.roundCylinder(COIN.hh - b, COIN.r - b, b).setDensity(1).setFriction(0.3).setRestitution(0.12)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(this.clinkThreshold), body);
    const coin = { kind: 'coin', body, col, air: 0, prevY: y, hoopDone: true };
    this.coins.push(coin);
    this.byCollider.set(col.handle, coin);
    return coin;
  }

  /** Clawd がコインを投げる。x は左右の位置。空中にいるあいだ、浮き輪をくぐったかを見る。 */
  toss(x, rnd = Math.random) {
    x = clamp(x, -TOSS.maxX, TOSS.maxX);
    const q = quatEuler((rnd() - 0.5) * 0.6, rnd() * TAU, (rnd() - 0.5) * 0.4);
    const c = this.addCoin(x, TOSS.y, TOSS.z, q, { x: (rnd() - 0.5) * 0.1, y: TOSS.vy, z: TOSS.vz }, { x: (rnd() - 0.5) * 9, y: (rnd() - 0.5) * 3, z: (rnd() - 0.5) * 4 });
    c.air = 1.5;
    c.hoopDone = false;
    return c;
  }

  _remove(list, i) {
    const o = list[i];
    for (const c of o.cols || [o.col]) this.byCollider.delete(c.handle);
    this.world.removeRigidBody(o.body);
    const last = list.pop();
    if (i < list.length) list[i] = last;
  }

  // ---------------------------------------------------------------- 景品
  /** フェルトの Clawd を置く。variant は見た目の種類（物理は同じ）。q を省くと表向きに寝かせる。 */
  addPrize(variant, x, y, z, q = FACE_UP, lin = null, id = null) {
    const { R, world } = this;
    const bd = R.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation(q).setCcdEnabled(true).setLinearDamping(0.1).setAngularDamping(0.6);
    if (lin) bd.setLinvel(lin.x, lin.y, lin.z);
    const body = world.createRigidBody(bd);
    const cols = prizeBoxes().map(([cx, cy, hx, hy, hz]) =>
      world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(cx, cy, 0).setDensity(0.3).setFriction(0.5).setRestitution(0.02), body));
    const prize = { kind: 'prize', id: id ?? this.nextPrizeId++, variant, body, cols };
    if (id != null) this.nextPrizeId = Math.max(this.nextPrizeId, id + 1);
    this.prizes.push(prize);
    for (const c of cols) this.byCollider.set(c.handle, prize);
    return prize;
  }

  // ---------------------------------------------------------------- 進める
  step(dt) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= PHYS_DT - 1e-9) {
      if (n >= MAX_SUBSTEPS) { this.acc = 0; break; }
      this._substep();
      this.acc -= PHYS_DT;
      n++;
    }
    return n;
  }

  _substep() {
    const dt = PHYS_DT;
    this.time += dt;
    this.phase += (dt * TAU * this.speed) / PUSHER.period;
    if (this.phase > TAU * 64) this.phase -= TAU * 64;
    this.pusher.setNextKinematicTranslation({ x: 0, y: PUSHER.h / 2, z: pusherFront(this.phase) - PUSHER.depth / 2 });
    if (this.hoopOn) {
      this.hoopPhase += (dt * TAU) / HOOP.period;
      if (this.hoopPhase > TAU * 64) this.hoopPhase -= TAU * 64;
    }
    this.hoopX = HOOP.amp * Math.sin(this.hoopPhase);
    this.hoop.setNextKinematicTranslation({ x: this.hoopX, y: HOOP.y, z: HOOP.z });
    this.world.step(this.queue);
    this.queue.drainContactForceEvents((e) => {
      const f = e.maxForceMagnitude();
      if (!(f > 0)) return;
      const a = this.byCollider.get(e.collider1()), b = this.byCollider.get(e.collider2());
      const o = a?.kind === 'prize' ? a : b?.kind === 'prize' ? b : a || b;   // 景品が絡むときは景品として数える
      if (!o || this.clinks.length > 48) return;
      const p = o.body.translation();
      this.clinks.push([p.x, p.y, p.z, f, o.kind, o.kind === 'prize' ? o.id : null]);
    });
    this._check();
  }

  _check() {
    const { coins, prizes } = this;
    for (let i = coins.length - 1; i >= 0; i--) {
      const c = coins[i];
      const p = c.body.translation();
      // 高い所（浮き輪の上・壁の上）で止まっているコインは、台のまんなかへ押し出す（積もって浮き輪をふさがないように）
      if (p.y > STUCK_Y && c.air <= 0) {
        const v = c.body.linvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z < 0.5) {
          c.stuck = (c.stuck || 0) + PHYS_DT;
          if (c.stuck > 0.35) { c.stuck = 0; c.body.setLinvel({ x: -p.x * 0.35, y: 1.2, z: p.z < BACKWALL.z + 0.2 ? 2.6 : 1.6 }, true); }
        } else c.stuck = 0;
      }
      if (c.air > 0) {
        c.air -= PHYS_DT;
        if (!c.hoopDone && c.prevY > HOOP.y && p.y <= HOOP.y) {
          c.hoopDone = true;
          const dx = p.x - this.hoopX, dz = p.z - HOOP.z;
          if (dx * dx + dz * dz < (HOOP.R - HOOP.tube) ** 2) this.on.hoop?.(c, p);
        }
        c.prevY = p.y;
      }
      if (p.y < FALL_Y || Math.abs(p.x) > 7 || p.z > 7 || p.z < FIELD.backZ - 1 || p.y > 14) {
        const v = c.body.linvel(), q = c.body.rotation();
        const front = p.z > FIELD.edgeZ - 0.05 && Math.abs(p.x) < FIELD.halfW + 0.35 && p.y > -3;
        this._remove(coins, i);
        (front ? this.on.won : this.on.lost)?.(c, p, v, q);
      }
    }
    for (let i = prizes.length - 1; i >= 0; i--) {
      const z = prizes[i];
      const p = z.body.translation();
      if (p.y < FALL_Y || Math.abs(p.x) > 7 || p.z > 7 || p.z < FIELD.backZ - 1 || p.y > 14) {
        const v = z.body.linvel(), q = z.body.rotation();
        const front = p.z > FIELD.edgeZ - 0.2 && Math.abs(p.x) < FIELD.halfW + 0.6 && p.y > -3;
        this._remove(prizes, i);
        (front ? this.on.prizeWon : this.on.prizeLost)?.(z, p, v, q);
      }
    }
  }

  // ---------------------------------------------------------------- はじめの台・保存
  /** はじめの台：コインを格子に積んで、プッシャーを動かしながらならす。落ちたコインは数えない。 */
  prefill({ lower = 150, shelf = 50, settle = 10, rnd = Math.random } = {}) {
    const on = this.on;
    this.on = {};
    const put = (n, x0, x1, z0, z1, y0) => {
      const cols = Math.floor((x1 - x0) / 1.04) + 1, rows = Math.floor((z1 - z0) / 1.04) + 1;
      for (let k = 0; k < n; k++) {
        const layer = Math.floor(k / (cols * rows)), j = k % (cols * rows);
        const x = x0 + (j % cols) * 1.04 + (rnd() - 0.5) * 0.3 + (layer % 2) * 0.5;
        const z = z0 + Math.floor(j / cols) * 1.04 + (rnd() - 0.5) * 0.3;
        this.addCoin(clamp(x, x0, x1), y0 + layer * 0.24 + rnd() * 0.05, z, quatEuler((rnd() - 0.5) * 0.2, rnd() * TAU, (rnd() - 0.5) * 0.2));
      }
    };
    put(lower, -FIELD.halfW + 0.55, FIELD.halfW - 0.55, -0.4, FIELD.edgeZ - 0.9, 0.12);
    put(shelf, -FIELD.halfW + 0.55, FIELD.halfW - 0.55, BACKWALL.z + 0.6, -3.0, PUSHER.h + 0.12);
    for (let t = 0; t < settle; t += PHYS_DT) this._substep();
    this.on = on;
    this.clinks.length = 0;
  }

  serialize() {
    const r = (v) => Math.round(v * 1000) / 1000;
    const tr = (b) => { const p = b.translation(), q = b.rotation(); return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map(r); };
    return {
      v: 1,
      phase: r(this.phase % TAU), hoopPhase: r(this.hoopPhase % TAU),
      coins: this.coins.map((c) => tr(c.body)),
      prizes: this.prizes.map((z) => ({ id: z.id, v: z.variant, t: tr(z.body) })),
    };
  }

  clear() {
    while (this.coins.length) this._remove(this.coins, this.coins.length - 1);
    while (this.prizes.length) this._remove(this.prizes, this.prizes.length - 1);
  }

  restore(data) {
    this.clear();
    if (!data || data.v !== 1) return false;
    this.phase = +data.phase || 0;
    this.hoopPhase = +data.hoopPhase || 0;
    this.pusher.setTranslation({ x: 0, y: PUSHER.h / 2, z: pusherFront(this.phase) - PUSHER.depth / 2 }, true);
    const q = (t) => { const l = Math.hypot(t[3], t[4], t[5], t[6]) || 1; return { x: t[3] / l, y: t[4] / l, z: t[5] / l, w: t[6] / l }; };
    for (const t of data.coins || []) if (t.every(Number.isFinite)) this.addCoin(t[0], t[1], t[2], q(t));
    for (const z of data.prizes || []) if (z.t?.every(Number.isFinite)) this.addPrize(z.v, z.t[0], z.t[1], z.t[2], q(z.t), null, z.id);
    return true;
  }
}
