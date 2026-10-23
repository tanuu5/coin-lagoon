// ざくざくラグーン：南の島のコインプッシャー。Clawd がサーフボードで左右に動いてコインを投げ、
// 浮き輪をくぐるとスロットが回る。プッシャーに押されて手前から落ちたコインがもらえ、フェルトの Clawd（景品）を落とすと図鑑に入る。
//
// 雛形の形（init / step / render / STATES / setState / snapshot）はそのまま。
//   状態：title（後ろで台が動く）・play・paused。図鑑・あそびかた・設定は状態を持たない画面（screens.open）
//   物理：machine/Physics.js（Rapier）。描画：view/ の下。スロット：Slot.js。景品の種類：prizes.js
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { clamp, damp } from '../core/math.js';
import { events } from '../core/events.js';
import { createStore } from '../core/save.js';
import { t } from '../core/i18n.js';
import { settings } from '../core/settings.js';
import { Physics, FACE_UP, quatEuler } from './machine/Physics.js';
import { FIELD, HOOP, TOSS, BACKWALL } from './machine/layout.js';
import initialField from './machine/initialField.json';
import { Slot, PAYS } from './Slot.js';
import { VARIANTS, VARIANT, pickVariant } from './prizes.js';
import { Coins } from './view/Coins.js';
import { Cabinet, TRAY_Y } from './view/Cabinet.js';
import { Env } from './view/Env.js';
import { HoopView, Rider, PrizeViews } from './view/Props.js';
import { Reels } from './view/Reels.js';
import { Fx } from './view/Fx.js';
import { Scenery } from './view/Scenery.js';
import { feltMaterial } from './view/Felt.js';
import { CHAIN_MAT } from './view/ClawdFelt.js';

export const STATES = {
  title: { title: true, input: 'menu', music: 'title' },
  play: { hud: true, touch: true, input: 'play', music: 'play' },
  paused: { hud: true, input: 'menu', modal: 'pause', duck: true },
};

const START_COINS = 50;
const TOSS_GAP = 0.25;       // 続けて投げるときの間（秒）
const AIM_SPEED = 6.5;       // キー・パッドで狙いを動かす速さ
const SAVE_EVERY = 8;        // 台の上を保存する間（秒）
const RESTOCK = 6;           // 台に景品がなくなってから、次を落とすまで（秒）
const REFILL = { below: 5, upTo: 10, every: 6 };   // おこづかい：これより少ないと、every 秒ごとに 1 枚（upTo まで）
const SLEEP_AFTER = 25;      // 投げないでいると Clawd が眠るまで（秒）
const FEVER_TIME = 25;

export class Game {
  constructor({ renderer, input, audio, screens, touch, hud }) {
    Object.assign(this, { renderer, input, audio, screens, touch, hud });
    this.save = createStore('coin-lagoon.save', {
      coins: START_COINS, field: null, book: {}, stats: { tossed: 0, won: 0, prizes: 0, spins: 0, best: START_COINS },
    }, 1);
    this.time = 0;
    this.state = 'title';
    this.aimX = 0;
    this.clawdX = 0;
    this.tossCD = 0;
    this.saveT = 0;
    this.idleT = 0;
    this.restockT = 0;
    this.refillT = 0;
    this.fever = 0;
    this.payQueue = [];        // 払い出しのコイン（見た目）を少しずつ出す
    this.showerQueue = 0;      // 台に降らせるコインの残り
    this.showerT = 0;
    this.shake = 0;
    this.pointer = { held: false, tap: false, id: null };
    this.slot = new Slot();

    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 1200);
    this.env = new Env(scene, renderer.renderer);
    renderer.onQuality = (p) => {
      const s = this.env.sun;
      s.shadow.mapSize.set(p.shadowSize, p.shadowSize);
      s.shadow.map?.dispose();
      s.shadow.map = null;
    };
    renderer.onQuality(renderer.preset);
    this.scenery = new Scenery(scene);
    this.cabinet = new Cabinet(scene);
    this.coins = new Coins(scene);
    this.hoop = new HoopView(scene);
    this.rider = new Rider(scene, this.coins.mesh.geometry, this.coins.mat);
    this.prizeViews = new PrizeViews(scene);
    this.reels = new Reels(scene);
    this.fx = new Fx(scene);
    this.env.shine(this.coins.mat, 1.25);
    this.env.shine(this.cabinet.mats.brass, 1.1);
    this.env.shine(this.hoop.mat, 0.6);
    this.env.shine(CHAIN_MAT, 1.2);
    // きんいろ Clawd のフェルトは、金属のように映り込ませる（makePrize と同じ設定で同じ材質を取る）
    this.env.shine(feltMaterial(VARIANT.golden.color, { metal: 0.55, rough: 0.55, sheen: 1 }), 1.0);
    renderer.setScene(scene, this.camera);
    renderer.setLook({ exposure: 1.0, bloomStrength: 0.32, bloomThreshold: 0.92, bloomRadius: 0.45, vignette: 0.22, saturation: 1.08, contrast: 1.04 });
    renderer.onResize = () => this.fitCamera();
    this.fitCamera();

    // スロットの出来事
    this.slot.onStart = (r) => { this.audio.sfx('reelStart'); if (r.reach) this.reachSound = true; };
    this.slot.onStop = (i, reach) => { this.audio.sfx('reelStop', { pitch: 1 + i * 0.08 }); if (reach) { this.audio.sfx('reach'); this.hud.toast(t('slot.reach'), 1.4); } };
    this.slot.onResult = (r) => this.onSlotResult(r);

    // マウス・タッチ：画面の左右の位置で狙い、押すと投げる（押しっぱなしで続けて）
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      if (this.state !== 'play') return;
      this.pointer.id = e.pointerId;
      this.pointer.held = this.pointer.tap = true;
      this._aimAt(e.clientX);
      try { dom.setPointerCapture(e.pointerId); } catch { /* 作った PointerEvent では投げる（本物の操作では起きない） */ }
    });
    // 動かす：押している指・マウスはどこへ動いても追う（取り込みに失敗しても）。押していないマウスは画面の上だけ
    addEventListener('pointermove', (e) => {
      if (e.pointerId === this.pointer.id || (e.pointerType === 'mouse' && e.target === dom)) this._aimAt(e.clientX);
    });
    const up = (e) => { if (e.pointerId === this.pointer.id) { this.pointer.held = false; this.pointer.id = null; } };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    // 閉じる・隠すときに保存する
    addEventListener('pagehide', () => this.storeField());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.storeField(); });
  }

  /** 読み込み：物理エンジン（WASM）と、保存してある台。 */
  async init() {
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 2500))]);
    await RAPIER.init();
    const ph = (this.ph = new Physics(RAPIER, { clink: 28 }));
    ph.on = {
      won: (c, p, v, q) => this.onCoinWon(c, p, v, q),
      lost: (c, p, v, q) => this.onCoinLost(c, p, v, q),
      hoop: (c, p) => this.onHoop(c, p),
      prizeWon: (z, p, v, q) => this.onPrizeWon(z, p, v, q),
      prizeLost: (z, p, v, q) => this.onPrizeLost(z, p, v, q),
    };
    if (!ph.restore(this.save.data.field)) this.resetField();
    this.setGuardOption(settings.guard);
    this.hud.setCoins(this.save.data.coins, true);
    this.updateBookCount();
    this.audio.setAmbience({ waves: 1, wind: 0.25 });
    this.setState('title');
  }

  /** はじめの台（コインを敷きつめ、まんなかに景品を 1 つ）。 */
  resetField() {
    this.ph.restore(initialField);
    this.ph.addPrize('classic', 0.2, 0.9, 0.9, FACE_UP);
  }

  // ---------------------------------------------------------------- カメラ
  /** 台の全体（手前の受け皿から、奥の壁の上の Clawd まで）が画面に収まる距離を探す。縦長の画面はより真上から。 */
  fitCamera() {
    const cam = this.camera, aspect = innerWidth / Math.max(1, innerHeight);
    const portrait = aspect < 0.9;
    cam.aspect = aspect;
    cam.fov = portrait ? 44 : 34;
    cam.updateProjectionMatrix();
    const pitch = portrait ? 0.9 : 0.68;
    const target = new THREE.Vector3(0, portrait ? 0.6 : 0.9, portrait ? -1.0 : -1.2);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    // [点, 画面の下の限界, 上の限界]。受け皿は少し切れてもよい
    // 縦長の画面は横幅で決まるので、台の外の柱は少し切れてもよいことにして、台を大きく映す
    const sx = portrait ? 4.45 : 4.95;
    const pts = [
      [[-sx, 0.1, FIELD.edgeZ + 0.3], -0.93, 0.9], [[sx, 0.1, FIELD.edgeZ + 0.3], -0.93, 0.9], [[0, TRAY_Y, FIELD.edgeZ + 1.3], -1.02, 0.9],
      [[-4.3, BACKWALL.top, BACKWALL.z], -1, 0.9], [[4.3, BACKWALL.top, BACKWALL.z], -1, 0.9], [[0, BACKWALL.top + 2.5, BACKWALL.z - 0.3], -1, portrait ? 0.62 : 0.86],
    ].map(([p, lo, hi]) => [new THREE.Vector3(...p), lo, hi]);
    const v = new THREE.Vector3();
    const fits = (d) => {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      return pts.every(([p, lo, hi]) => {
        v.copy(p).applyMatrix4(cam.matrixWorldInverse);
        if (v.z > -0.5) return false; // カメラの後ろ
        v.copy(p).project(cam);
        return Math.abs(v.x) < (portrait ? 0.995 : 0.96) && v.y < hi && v.y > lo;
      });
    };
    let lo = 3, hi = 80;
    for (let i = 0; i < 28; i++) { const d = (lo + hi) / 2; if (fits(d)) hi = d; else lo = d; }
    fits(hi);
    this.camBase = { pos: cam.position.clone(), target, quat: cam.quaternion.clone() };
    // 狙いの換算：浮き輪の高さの、左右の端が画面のどこに来るか
    const a = new THREE.Vector3(-TOSS.maxX, HOOP.y, HOOP.z).project(cam), b = new THREE.Vector3(TOSS.maxX, HOOP.y, HOOP.z).project(cam);
    this.aimScreen = [(a.x * 0.5 + 0.5) * innerWidth, (b.x * 0.5 + 0.5) * innerWidth];
  }

  _aimAt(clientX) {
    if (this.state !== 'play') return;
    const [a, b] = this.aimScreen;
    this.aimX = clamp(-TOSS.maxX + ((clientX - a) / Math.max(1, b - a)) * TOSS.maxX * 2, -TOSS.maxX, TOSS.maxX);
  }

  // ---------------------------------------------------------------- 状態
  setState(s) {
    const S = STATES[s];
    if (!S) throw new Error('状態がありません: ' + s);
    const prev = this.state;
    this.state = s;
    this.screens.showTitle(!!S.title);
    this.hud.show(!!S.hud);
    this.touch.setVisible(!!S.touch);
    this.input.mode = S.input || 'menu';
    if (!S.modal) this.screens.closeAll();
    else if (!this.screens.isOpen(S.modal)) this.screens.open(S.modal);
    const music = s === 'play' && this.fever > 0 ? 'fever' : S.music;
    if (music) this.audio.music(music);
    this.audio.duck(!!S.duck);
    this.slot.hold = s === 'title';
    this[`enter_${s}`]?.(prev);
    if (prev !== s) events.emit('state', { from: prev, to: s });
    if (s !== 'play') this.storeField();
  }

  enter_play() { this.grace = 0.25; this.pointer.held = this.pointer.tap = false; this.idleT = 0; }
  enter_paused() { this.audio.sfx('pause'); }

  start() { this.setState('play'); }
  reset() { /* タイトルへ戻るとき：台はそのまま（保存してある） */ }

  // ---------------------------------------------------------------- 進める
  step(dt) {
    const input = this.input;
    input.update(dt);
    this.time += dt;
    this[`update_${this.state}`]?.(dt);
    this.updateWorld(dt);
    this.audio.listen(this.camera);
    this.audio.tick(dt);
    input.endFrame();
  }

  update_title(dt) {
    if (this.input.menu.back && this.screens.back()) this.audio.sfx('ui_back');
    // タイトルの後ろでは、Clawd がゆっくり左右に動く（投げない）
    this.aimX = Math.sin(this.time * 0.4) * 2.2;
  }

  update_paused() {
    if (!this.screens.isOpen('pause')) { this.setState('play'); return; }
    const input = this.input;
    if (input.menu.back || input.menu.start || input.pressed('pause')) {
      if (this.screens.top !== this.screens.modals.pause) { this.screens.back(); this.audio.sfx('ui_back'); }
      else this.setState('play');
    }
  }

  update_play(dt) {
    const input = this.input;
    if (input.pressed('pause') || input.menu.start) { this.setState('paused'); return; }
    if (Math.abs(input.move.x) > 0.05) this.aimX = clamp(this.aimX + input.move.x * AIM_SPEED * dt, -TOSS.maxX, TOSS.maxX);
    // 確かめる用の自動プレイ（__dev.game.auto = 'hoop' | 'random'）：浮き輪が来る所をねらって投げ続ける
    if (this.auto === 'hoop') this.aimX = clamp(HOOP.amp * Math.sin(this.ph.hoopPhase + (0.47 * Math.PI * 2) / HOOP.period), -TOSS.maxX, TOSS.maxX);
    else if (this.auto === 'random' && this.tossCD <= 0) this.aimX = (Math.random() * 2 - 1) * TOSS.maxX;
    this.grace = Math.max(0, (this.grace || 0) - dt);
    this.tossCD -= dt;
    const want = !this.grace && (!!this.auto || input.down('drop') || input.pressed('drop') || this.pointer.held || this.pointer.tap);
    this.pointer.tap = false;
    if (want && this.tossCD <= 0) this.toss();
    // 投げないでいると Clawd が眠る
    this.idleT += dt;
    this.rider.mascot.setSleep(this.idleT > SLEEP_AFTER);
    this.updateRefill(dt);
    this.saveT += dt;
    if (this.saveT > SAVE_EVERY) this.storeField();
  }

  toss() {
    const d = this.save.data;
    this.idleT = 0;
    if (d.coins <= 0) {
      this.tossCD = 0.6;
      this.hud.toast(t('toast.noCoins'));
      this.audio.sfx('ui_back');
      return;
    }
    d.coins--;
    d.stats.tossed++;
    this.hud.setCoins(d.coins);
    this.ph.toss(this.clawdX);
    this.rider.tossed();
    this.tossCD = this.auto && this.autoGap ? this.autoGap : TOSS_GAP;   // 自動プレイ（確かめる・撮る用）は間隔を変えられる
    this.audio.sfx('toss', { minGap: 0.05 });
  }

  /** おこづかい：コインが少ないとき、少しずつ足す。 */
  updateRefill(dt) {
    const d = this.save.data;
    if (d.coins >= REFILL.below && !(this.refillT > 0 && d.coins < REFILL.upTo)) { this.refillT = 0; this.hud.setRefill(''); return; }
    this.refillT += dt;
    const left = Math.max(0, REFILL.every - this.refillT);
    this.hud.setRefill(t('hud.refill', { s: Math.ceil(left) }));
    if (this.refillT >= REFILL.every) {
      this.refillT = d.coins + 1 < REFILL.upTo ? 0.001 : 0;
      this.addCoins(1, true);
      this.hud.pop('+1', 'refill');
    }
  }

  updateWorld(dt) {
    const ph = this.ph;
    if (this.state !== 'paused') {
      ph.step(dt);
      this.playClinks();
      this.slot.update(dt);
      this.updateFever(dt);
      this.updateRestock(dt);
      this.updatePayout(dt);
    }
    this.clawdX = damp(this.clawdX, this.aimX, 16, dt);
    this.env.update(dt);
    this.scenery.update(dt, this.env.t);
    this.cabinet.update(dt, ph);
    this.coins.update(dt, ph, TRAY_Y);
    this.hoop.update(dt, ph);
    this.rider.update(dt, this.clawdX, this.state === 'play' && this.save.data.coins > 0);
    this.prizeViews.sync(ph, dt);
    this.prizeViews.update(dt, TRAY_Y);
    this.reels.update(dt, this.slot);
    // きんいろ Clawd は、ときどききらっと光る
    this.glintT = (this.glintT || 0) + dt;
    if (this.glintT > 0.35) {
      this.glintT = 0;
      for (const z of ph.prizes) if (z.variant === 'golden') { const p = z.body.translation(); this.fx.sparkle({ x: p.x + (Math.random() - 0.5) * 2, y: p.y + 0.2, z: p.z + (Math.random() - 0.5) * 1.4 }, 2, 0xfff2b0, 0.8, 0.6); }
    }
    this.fx.update(dt);
    this.hud.update(dt);
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const b = this.camBase, cam = this.camera;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const s = this.shake * this.shake * 0.08;
    // タイトルの後ろでは、台のまわりをゆっくり左右に回る
    this.titleK = damp(this.titleK || 0, this.state === 'title' ? 1 : 0, 2.5, dt);
    if (this.titleK > 0.001) {
      const yaw = Math.sin(this.time * 0.12) * 0.22 * this.titleK;
      const dx = b.pos.x - b.target.x, dz = b.pos.z - b.target.z;
      cam.position.set(b.target.x + dx * Math.cos(yaw) + dz * Math.sin(yaw), b.pos.y, b.target.z - dx * Math.sin(yaw) + dz * Math.cos(yaw));
      cam.lookAt(b.target);
      return;
    }
    cam.position.set(b.pos.x + Math.sin(this.time * 41) * s, b.pos.y + Math.sin(this.time * 37 + 1) * s, b.pos.z);
    cam.quaternion.copy(b.quat);
  }

  /** コインどうしがぶつかった音。そのフレームで強いものから数個だけ鳴らす。 */
  playClinks() {
    const cl = this.ph.clinks;
    if (!cl.length) return;
    // 景品に当たったものは、フェルトを揺らす
    for (const c of cl) if (c[4] === 'prize' && c[5] != null) this.prizeViews.poke(c[5], c[3]);
    cl.sort((a, b) => b[3] - a[3]);
    for (let i = 0; i < Math.min(2, cl.length); i++) {
      const [x, y, z, f, kind] = cl[i];
      if (kind === 'prize') { this.audio.sfx('felt', { pos: { x, y, z }, minGap: 0.12 }); continue; }
      this.audio.sfx('clink', { pos: { x, y, z }, vel: clamp((f - 20) / 110, 0.15, 1), pitch: 0.9 + Math.random() * 0.3, minGap: 0.035 });
    }
    cl.length = 0;
  }

  addCoins(n, quiet = false) {
    const d = this.save.data;
    d.coins += n;
    d.stats.best = Math.max(d.stats.best || 0, d.coins);
    this.hud.setCoins(d.coins);
    if (!quiet) this.hud.pop('+' + n);
  }

  // ---------------------------------------------------------------- 台の出来事
  onCoinWon(c, p, v, q) {
    this.save.data.stats.won++;
    this.addCoins(1, true);
    this.coins.drop(p, v, q, true);
    this.audio.sfx('payout', { pos: p, minGap: 0.045 });
  }

  onCoinLost(c, p, v, q) {
    this.save.data.stats.lost = (this.save.data.stats.lost || 0) + 1;
    this.coins.drop(p, v, q, false);
    this.audio.sfx('lost', { pos: p, minGap: 0.09 });
  }

  onHoop(c, p) {
    const ok = this.slot.add();
    this.hoop.flash();
    this.fx.sparkle(p, 18, 0xffe08a, 2.6);
    this.audio.sfx('hoop', { pos: p });
    // ためきれなかった知らせは、20 秒に 1 回まで（続けて入れると何度も出てうるさい）
    if (!ok && this.time - (this.fullToastAt ?? -99) > 20) { this.fullToastAt = this.time; this.hud.toast(t('slot.full'), 1.4); }
  }

  onSlotResult(r) {
    this.save.data.stats.spins++;
    if (!r.win) { this.audio.sfx('miss'); return; }
    const pay = PAYS[r.win];
    const name = t('sym.' + r.win);
    this.reels.celebrate();
    this.rider.mascot.cheer(2.2);
    if (pay.kind === 'coins') {
      this.hud.banner(t('slot.win', { n: pay.coins }), name, { dur: 2, cls: 'win' });
      this.payout(pay.coins);
      this.audio.sfx(pay.coins >= 10 ? 'winBig' : 'win');
    } else if (pay.kind === 'prize') {
      this.hud.banner(t('slot.prize'), name, { dur: 2.4, cls: 'prize' });
      this.dropPrize(pickVariant(this.save.data.book));
      this.payout(pay.coins);
      this.audio.sfx('winBig');
    } else if (pay.kind === 'fever') {
      this.hud.banner(t('slot.fever'), t(this.guardOpt === 'on' ? 'slot.feverSubOn' : 'slot.feverSub'), { dur: 2.8, cls: 'fever' });
      this.startFever();
      this.audio.sfx('jackpot');
    }
    this.fx.confetti(new THREE.Vector3(0, 3.4, -4.6), pay.kind === 'coins' && pay.coins < 10 ? 40 : 90, 4, 6);
    this.shake = pay.kind === 'coins' ? 0.4 : 0.8;
  }

  /** 払い出し：手前の受け皿へコインが流れこむ（見た目）。数はすぐに足す。 */
  payout(n) {
    this.addCoins(n);
    for (let i = 0; i < n; i++) this.payQueue.push(i * 0.055);
  }

  updatePayout(dt) {
    for (let i = this.payQueue.length - 1; i >= 0; i--) {
      this.payQueue[i] -= dt;
      if (this.payQueue[i] > 0) continue;
      this.payQueue.splice(i, 1);
      const x = (Math.random() - 0.5) * 6;
      this.coins.drop({ x, y: -0.2, z: FIELD.edgeZ + 0.15 }, { x: (Math.random() - 0.5) * 1.5, y: -1, z: 1.4 + Math.random() }, quatEuler(Math.random() * 3, Math.random() * 3, 0), true);
      this.audio.sfx('payout', { minGap: 0.04 });
    }
    // 台に降らせるコイン（フィーバー）
    if (this.showerQueue > 0) {
      this.showerT -= dt;
      while (this.showerT <= 0 && this.showerQueue > 0) {
        this.showerT += 0.07;
        this.showerQueue--;
        const x = (Math.random() * 2 - 1) * 3.3, z = BACKWALL.z + 0.7 + Math.random() * 2.2;
        this.ph.addCoin(x, 6.5 + Math.random(), z, quatEuler(Math.random() * 6, Math.random() * 6, Math.random() * 6), { x: 0, y: -2, z: 0 }, { x: Math.random() * 6, y: 0, z: Math.random() * 6 });
      }
    }
  }

  /** 設定の「横のガード」。on なら常に、off ならフィーバー中だけ立てる。 */
  setGuardOption(v) {
    this.guardOpt = v === 'off' ? 'off' : 'on';
    this.applyGuards();
  }

  applyGuards() {
    this.ph.setGuards(this.guardOpt === 'on' || this.fever > 0);
    this.cabinet.feverGlow = this.fever > 0;
  }

  startFever() {
    this.fever = FEVER_TIME;
    this.applyGuards();
    this.ph.speed = 1.3;
    this.slot.bias = 1.6;
    this.env.setDusk(true);
    this.showerQueue += PAYS.sun.coins;
    this.audio.music('fever');
    this.hud.setFever(1);
  }

  updateFever(dt) {
    if (this.fever <= 0) return;
    this.fever -= dt;
    this.hud.setFever(Math.max(0, this.fever / FEVER_TIME));
    if (this.fever <= 0) {
      this.fever = 0;
      this.applyGuards();
      this.ph.speed = 1;
      this.slot.bias = 1;
      this.env.setDusk(false);
      this.hud.setFever(0);
      if (this.state === 'play') this.audio.music('play');
      this.hud.toast(t('slot.feverEnd'), 1.6);
    }
  }

  /** 台に景品がないと、少しして次の Clawd が降ってくる（いつも 1 つは台にあるように）。 */
  updateRestock(dt) {
    if (this.ph.prizes.length > 0 || this.prizeViews.falling.length > 0) { this.restockT = 0; return; }
    this.restockT += dt;
    if (this.restockT > RESTOCK) {
      this.restockT = 0;
      this.dropPrize(pickVariant(this.save.data.book));
      if (this.state === 'play') this.hud.toast(t('toast.restock'), 1.8);
    }
  }

  dropPrize(variant) {
    const x = (Math.random() - 0.5) * 3;
    const q = quatEuler(-Math.PI / 2 + (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.3);
    this.ph.addPrize(variant, x, 7, -4.3, q, { x: 0, y: -1, z: 0 });
    this.fx.sparkle(new THREE.Vector3(x, 6.5, -4.3), 20, 0xffffff, 2);
    this.audio.sfx('prizeDrop');
  }

  onPrizeWon(z, p, v, q) {
    this.prizeViews.drop(z, p, v, q, true);
    const d = this.save.data;
    const first = !d.book[z.variant];
    d.book[z.variant] = (d.book[z.variant] || 0) + 1;
    d.stats.prizes++;
    const name = t('prize.' + z.variant);
    this.hud.banner(t('prize.get'), (first ? t('prize.new') + ' ' : '') + name, { dur: 3, cls: 'prize' });
    this.fx.confetti(new THREE.Vector3(p.x, 0.5, FIELD.edgeZ), 120, 3, 8);
    this.fx.sparkle(new THREE.Vector3(p.x, 0, FIELD.edgeZ + 0.5), 30, 0xffe08a, 3);
    this.rider.mascot.cheer(3);
    this.shake = 0.7;
    this.audio.sfx('prizeGet');
    this.updateBookCount();
    this.storeField();
    events.emit('prize', { variant: z.variant, first });
  }

  onPrizeLost(z, p, v, q) {
    this.prizeViews.drop(z, p, v, q, false);
    this.hud.toast(t('toast.prizeLost'), 2);
    this.audio.sfx('aww');
  }

  updateBookCount() {
    const n = VARIANTS.filter((v) => this.save.data.book[v.id]).length;
    this.hud.setBook(n, VARIANTS.length);
  }

  /** 台の上とコインの数を保存する。 */
  storeField() {
    if (!this.ph) return;
    this.saveT = 0;
    this.save.data.field = this.ph.serialize();
    this.save.save();
  }

  onAction(act, el) {
    if (act === 'resetData') {
      // 2 回押すと消える（1 回目は文言が変わるだけ）
      if (!this.resetArm) {
        this.resetArm = true;
        el.textContent = t('settings.resetConfirm');
        el.classList.add('armed');
        clearTimeout(this._resetTimer);
        this._resetTimer = setTimeout(() => { this.resetArm = false; el.textContent = t('settings.reset'); el.classList.remove('armed'); }, 3500);
        return;
      }
      this.resetArm = false;
      el.textContent = t('settings.reset');
      el.classList.remove('armed');
      this.resetAll();
      this.screens.back();
    }
  }

  onModal(name, open) {
    if (name === 'settings' && !open && this.resetArm) this.resetArm = false;
  }

  /** データを消して、はじめの台・はじめのコインに戻す。 */
  resetAll() {
    const d = this.save.data;
    d.coins = START_COINS;
    d.book = {};
    d.stats = { tossed: 0, won: 0, prizes: 0, spins: 0, best: START_COINS };
    this.slot.stock = 0;
    if (this.fever > 0) { this.fever = 0.001; this.updateFever(0.01); }
    this.applyGuards();
    this.payQueue.length = 0;
    this.showerQueue = 0;
    this.resetField();
    this.hud.setCoins(d.coins, true);
    this.updateBookCount();
    this.storeField();
    this.hud.toast(t('toast.reset'), 2);
  }

  render(dt) { this.renderer.render(dt); }

  snapshot() {
    const ph = this.ph;
    return {
      state: this.state, coins: this.save.data.coins, field: ph?.coins.length ?? 0, prizes: ph?.prizes.length ?? 0,
      aimX: +this.aimX.toFixed(2), pusherZ: ph ? +ph.pusherZ.toFixed(2) : 0, hoopX: ph ? +ph.hoopX.toFixed(2) : 0,
      stock: this.slot.stock, slot: this.slot.state, fever: +this.fever.toFixed(1),
      book: Object.keys(this.save.data.book).length, stats: this.save.data.stats, guard: this.guardOpt, guardsUp: !!ph?.guardsOn,
    };
  }
}
