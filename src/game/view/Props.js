// 台の上で動く物：浮き輪（チェッカー）、Clawd とサーフボード（投げる前のコインを抱えている）、景品の Clawd たち。
import * as THREE from 'three';
import { HOOP, BACKWALL, TOSS, FIELD } from '../machine/layout.js';
import { ringStripes } from './textures.js';
import { sd, feltGeometry, stitchGeometry, feltMaterial, threadMaterial } from './Felt.js';
import { Mascot, makePrize } from './ClawdFelt.js';

/** 浮き輪：竹の棒を走る台車から腕が出て、輪を水平に持っている。くぐると光る。 */
export class HoopView {
  constructor(scene) {
    const g = (this.root = new THREE.Group());
    g.name = 'hoop';
    this.mat = new THREE.MeshStandardMaterial({ name: 'swimRing', map: ringStripes(), roughness: 0.28, metalness: 0, emissive: 0xffe08a, emissiveIntensity: 0 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(HOOP.R, HOOP.tube, 18, 64), this.mat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, HOOP.y, HOOP.z);
    ring.castShadow = true;
    ring.name = 'ring';
    this.ring = ring;
    const wood = new THREE.MeshStandardMaterial({ name: 'cart', color: 0x9a5b2e, roughness: 0.6 });
    const cart = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.34), wood);
    cart.position.set(0, HOOP.y, HOOP.barZ);
    cart.castShadow = true;
    cart.name = 'cart';
    const armLen = HOOP.z - HOOP.R - HOOP.barZ + 0.05;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.09, armLen), wood);
    arm.position.set(0, HOOP.y, HOOP.barZ + armLen / 2);
    arm.name = 'arm';
    g.add(ring, cart, arm);
    scene.add(g);
    this.hit = 0;
    this.t = 0;
  }
  flash() { this.hit = 1; }
  update(dt, ph) {
    this.t += dt;
    this.root.position.x = ph.hoopX;
    this.hit = Math.max(0, this.hit - dt * 2.2);
    this.mat.emissiveIntensity = this.hit * 1.4;
    const s = 1 + this.hit * 0.12;
    this.ring.scale.set(s, s, 1);
    this.ring.rotation.z = Math.sin(this.t * 1.7) * 0.03;
  }
}

/** Clawd が乗るサーフボード（フェルト）と、抱えているコイン。 */
export class Rider {
  constructor(scene, coinGeo, coinMat) {
    const g = (this.root = new THREE.Group());
    g.name = 'rider';
    this.baseY = BACKWALL.top + 0.12;
    this.z = BACKWALL.z - BACKWALL.t / 2;
    g.position.set(0, this.baseY, this.z);
    // サーフボード：白いフェルトに水色の線
    const board = feltGeometry(sd.box(0, 0, 1.75, 0.46, 0.44), [-1.8, -0.5, 1.8, 0.5], { spacing: 0.04, half: 0.06, edge: 0.06, puff: 0.012, puffD: 0.3 });
    const st = stitchGeometry(board.loops, board.height, { gap: 0.12, len: 0.07, w: 0.022, inset: 0.035 });
    const stripe = feltGeometry(sd.box(0, 0, 1.45, 0.07, 0.07), [-1.5, -0.1, 1.5, 0.1], { spacing: 0.02, half: 0.014, edge: 0.016, puff: 0, puffD: 0.05 });
    const bd = new THREE.Group();
    bd.name = 'board';
    bd.rotation.x = -Math.PI / 2;
    bd.position.y = 0.06;
    bd.add(new THREE.Mesh(board.geometry, feltMaterial('#fff8ec')));
    bd.add(new THREE.Mesh(st, threadMaterial('#3cbfc4')));
    const sm = new THREE.Mesh(stripe.geometry, feltMaterial('#38bfc4'));
    sm.position.z = board.height(0.4) + 0.004;
    bd.add(sm);
    g.add(bd);
    this.board = bd;
    // Clawd（少し後ろに反らせて、上から見るカメラに顔を向ける）
    this.mascot = new Mascot();
    this.mascot.root.position.set(0, 0.12, 0);
    this.mascot.root.rotation.x = -0.2;
    g.add(this.mascot.root);
    // 抱えているコイン（投げると消え、少しして次が出る）
    this.coin = new THREE.Mesh(coinGeo, coinMat);
    this.coin.name = 'heldCoin';
    this.coin.rotation.x = Math.PI / 2 - 0.25;
    this.coin.position.set(0, TOSS.y - this.baseY, TOSS.z - this.z);
    this.coin.castShadow = true;
    g.add(this.coin);
    this.coinK = 1;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    this.prevX = 0;
    this.t = 0;
  }

  /** 投げた：抱えたコインが消え、Clawd が腕を振る。 */
  tossed() { this.coinK = 0; this.mascot.throwCoin(); }

  update(dt, x, hasCoin) {
    this.t += dt;
    const vx = (x - this.prevX) / Math.max(dt, 1e-4);
    this.prevX = x;
    this.root.position.x = x;
    this.mascot.vx = THREE.MathUtils.damp(this.mascot.vx, vx, 10, dt);
    // サーフボードが少し揺れる
    this.board.rotation.z = Math.sin(this.t * 2.1) * 0.02 - THREE.MathUtils.clamp(this.mascot.vx * 0.01, -0.06, 0.06);
    this.mascot.update(dt);
    this.coinK = Math.min(1, this.coinK + dt * 6);
    const k = hasCoin ? this.coinK : 0;
    this.coin.visible = k > 0.02;
    this.coin.scale.setScalar(k);
    this.coin.rotation.y = Math.sin(this.t * 3) * 0.2;
  }
}

/** 景品の Clawd たち：物理の景品と同じ所に描く。落ちたら見た目だけで落とし続ける。 */
export class PrizeViews {
  constructor(scene) {
    this.scene = scene;
    this.views = new Map(); // id → Group
    this.falling = [];
  }

  /** ぶつかった強さ f で、フェルトをふにゃっと揺らす。 */
  poke(id, f) {
    const v = this.views.get(id);
    if (v) v.userData.wob = Math.min(1, Math.max(v.userData.wob || 0, f / 60));
  }

  sync(ph, dt = 1 / 60) {
    const live = new Set();
    for (const z of ph.prizes) {
      live.add(z.id);
      let v = this.views.get(z.id);
      if (!v) { v = makePrize(z.variant); v.userData.wob = 0.6; v.userData.wt = 0; this.views.set(z.id, v); this.scene.add(v); }
      const p = z.body.translation(), q = z.body.rotation();
      v.position.set(p.x, p.y, p.z);
      v.quaternion.set(q.x, q.y, q.z, q.w);
      // やわらかさ：揺れは厚み方向につぶれて、横に少し広がる（ばねのように減っていく）
      const u = v.userData;
      u.wt += dt;
      u.wob = Math.max(0, u.wob - dt * 1.8);
      const k = Math.sin(u.wt * 26) * u.wob;
      v.scale.set(1 + k * 0.05, 1 + k * 0.05, 1 - k * 0.22);
    }
    for (const [id, v] of this.views) if (!live.has(id) && !this.falling.some((f) => f.v === v)) { this.scene.remove(v); this.views.delete(id); }
  }

  /** 台から落ちた景品を、見た目だけで落とす（獲得なら受け皿へ）。 */
  drop(z, p, v, q, won) {
    const view = this.views.get(z.id);
    if (!view) return;
    this.views.delete(z.id);
    view.position.set(p.x, p.y, p.z);
    view.quaternion.set(q.x, q.y, q.z, q.w);
    this.falling.push({ v: view, vel: new THREE.Vector3(v.x, Math.min(0, v.y), v.z), t: 0, won, spin: (Math.random() - 0.5) * 4 });
  }

  update(dt, trayY) {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.t += dt;
      f.vel.y -= 30 * dt;
      f.v.position.addScaledVector(f.vel, dt);
      f.v.rotateX(f.spin * dt);
      if (f.won && f.v.position.y < trayY + 0.15 && f.v.position.z > FIELD.edgeZ) {
        if (f.vel.y < -1) f.land = 1;   // 受け皿に落ちて、ぽふっとつぶれる
        f.v.position.y = trayY + 0.15; f.vel.set(0, 0, 0); f.spin = 0;
      }
      if (f.land > 0) {
        f.land = Math.max(0, f.land - dt * 1.6);
        const k = Math.sin((1 - f.land) * 22) * f.land;
        f.v.scale.set(1 + k * 0.08, 1 + k * 0.08, 1 - k * 0.3);
      }
      if (f.t > (f.won ? 2.2 : 1.2)) {
        const k = Math.max(0, 1 - (f.t - (f.won ? 2.2 : 1.2)) / 0.4);
        f.v.scale.setScalar(k);
        if (k <= 0) { this.scene.remove(f.v); this.falling.splice(i, 1); }
      }
    }
  }
}
