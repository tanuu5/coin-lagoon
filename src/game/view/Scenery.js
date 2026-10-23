// 台のまわりの景色：ヤシの木、遠くの島と火山、ヨット、たいまつ、パラソル、砂浜の貝やヒトデ。
// 動かない物は組み終えたら mergeStatic でまとめる（ヤシの葉の揺れ・たいまつの火・ヨットは別に動かす）。
import * as THREE from 'three';
import { mergeStatic } from '../../core/merge.js';
import { rng } from './textures.js';
import { GROUND_Y } from './Env.js';
import { FIELD, BACKWALL } from '../machine/layout.js';

const TAU = Math.PI * 2;

export class Scenery {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'scenery';
    scene.add(this.root);
    const r = rng(42);
    const stat = new THREE.Group();
    stat.name = 'sceneryStatic';
    this.swayers = [];   // 揺れる葉
    this.flames = [];

    const leafMat = new THREE.MeshStandardMaterial({ name: 'palmLeaf', map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
    const trunkMat = new THREE.MeshStandardMaterial({ name: 'palmTrunk', map: trunkTexture(), roughness: 0.9 });
    const nutMat = new THREE.MeshStandardMaterial({ name: 'coconut', color: 0x5b3a1f, roughness: 0.6 });
    // ヤシの木 [x, z, 高さ, 傾き（左右）, 傾き（前後）]
    for (const [x, z, h, lx, lz] of [
      [-9.5, -8.5, 9.5, -0.35, -0.1], [-7.2, -12, 8, 0.2, -0.15], [9.2, -6.5, 9, 0.38, -0.05], [11.5, -11.5, 10.5, 0.2, -0.2],
      [-11, 1.5, 8.5, -0.3, 0.2], [10.5, 2.5, 7.5, 0.35, 0.15], [-14, -5, 10, -0.2, 0], [14.5, -2, 9, 0.2, 0.05],
    ]) {
      const p = palm(h, lx, lz, r, trunkMat, leafMat, nutMat);
      p.position.set(x, GROUND_Y, z);
      p.rotation.y = r() * TAU;
      this.root.add(p);
      this.swayers.push(...p.userData.fronds);
    }

    // 遠くの島（低い丘とヤシ）と火山
    const green = new THREE.MeshStandardMaterial({ name: 'islandGreen', color: 0x3f9a52, roughness: 0.9, flatShading: true });
    const sandM = new THREE.MeshStandardMaterial({ name: 'islandSand', color: 0xf0d9a4, roughness: 0.95 });
    const rock = new THREE.MeshStandardMaterial({ name: 'volcano', color: 0x6d6a72, roughness: 0.95, flatShading: true });
    for (const [x, z, s] of [[-70, -120, 22], [55, -150, 30], [-20, -190, 16], [120, -110, 18]]) {
      const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, TAU, 0, Math.PI / 2), green);
      hill.scale.set(s, s * 0.32, s * 0.7);
      hill.position.set(x, GROUND_Y - 0.4, z);
      hill.name = 'island';
      stat.add(hill);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.08, 1.12, 0.6, 24), sandM);
      rim.scale.set(s, 1, s * 0.75);
      rim.position.set(x, GROUND_Y - 0.25, z);
      rim.name = 'islandRim';
      stat.add(rim);
      for (let i = 0; i < 4; i++) {
        const pp = palm(6 + r() * 3, (r() - 0.5) * 0.5, 0, r, trunkMat, leafMat, nutMat, false);
        pp.position.set(x + (r() - 0.5) * s, GROUND_Y + s * 0.25 * r(), z + (r() - 0.5) * s * 0.4);
        pp.scale.setScalar(1.6);
        stat.add(pp);
      }
    }
    const volcano = new THREE.Mesh(new THREE.CylinderGeometry(9, 60, 46, 18, 3), rock);
    volcano.position.set(-150, GROUND_Y + 20, -300);
    volcano.name = 'volcano';
    stat.add(volcano);
    const vg = new THREE.Mesh(new THREE.CylinderGeometry(30, 64, 14, 18, 1), green);
    vg.position.set(-150, GROUND_Y + 3, -300);
    vg.name = 'volcanoGreen';
    stat.add(vg);

    // パラソルとビーチチェア（左手前）、立てたサーフボード（右）
    const umb = parasol();
    umb.position.set(-7.6, GROUND_Y, -2.5);
    stat.add(umb);
    const surf = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 2.6, 6, 16), new THREE.MeshStandardMaterial({ name: 'surfboard', color: 0xff8a5c, roughness: 0.35 }));
    surf.scale.set(1, 1, 0.22);
    surf.position.set(7.6, GROUND_Y + 1.4, -1.2);
    surf.rotation.set(0.05, -0.5, 0.12);
    surf.name = 'surfboard';
    stat.add(surf);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.9, 0.2), new THREE.MeshStandardMaterial({ name: 'surfStripe', color: 0xfff8ec, roughness: 0.4 }));
    stripe.position.copy(surf.position);
    stripe.rotation.copy(surf.rotation);
    stripe.name = 'surfStripe';
    stat.add(stripe);

    // 砂浜の貝とヒトデ
    const shellM = new THREE.MeshStandardMaterial({ name: 'shells', color: 0xffc9b5, roughness: 0.6 });
    const starM = new THREE.MeshStandardMaterial({ name: 'starfish', color: 0xff8a4c, roughness: 0.7 });
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = 6.5 + r() * 7;
      const x = Math.cos(a) * d * 1.1, z = -2 + Math.sin(a) * d * 0.9;
      if (Math.abs(x) < 6.2 && z > -7.5 && z < 5.5) continue;
      const m = i % 3 === 0 ? new THREE.Mesh(starGeo(), starM) : new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 6, 0, TAU, 0, Math.PI / 2), shellM);
      m.position.set(x, GROUND_Y + 0.01, z);
      m.rotation.y = r() * TAU;
      m.scale.y = i % 3 === 0 ? 1 : 0.6;
      m.name = i % 3 === 0 ? 'starfish' : 'shell';
      stat.add(m);
    }

    // 台の足もとの木の台座（砂に埋まらないように）
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.3, 12.6), new THREE.MeshStandardMaterial({ name: 'deck', color: 0xa06a3c, roughness: 0.85 }));
    deck.position.set(0, GROUND_Y + 0.15, (FIELD.edgeZ + BACKWALL.z) / 2 + 0.2);
    deck.name = 'deck';
    stat.add(deck);
    stat.traverse((o) => { if (o.isMesh) { o.castShadow = o.name !== 'island' && o.name !== 'islandRim'; o.receiveShadow = true; } });
    mergeStatic(stat);
    this.root.add(stat);

    // たいまつ（奥の壁の両わき）
    for (const s of [-1, 1]) {
      const tk = torch();
      tk.position.set(s * 5.3, GROUND_Y, BACKWALL.z - 0.6);
      this.root.add(tk);
      this.flames.push(tk.userData.flame);
    }

    // ヨット（遠くをゆっくり進む）
    this.boat = sailboat();
    this.boat.position.set(-40, GROUND_Y - 0.2, -70);
    this.root.add(this.boat);
    this.t = 0;
    this.dusk = 0;
  }

  update(dt, dusk = 0) {
    this.t += dt;
    const t = this.t;
    for (const f of this.swayers) f.rotation.x = f.userData.rx + Math.sin(t * 1.3 + f.userData.ph) * 0.04;
    for (const fl of this.flames) {
      const k = 1 + Math.sin(t * 17 + fl.userData.ph) * 0.08 + Math.sin(t * 29) * 0.05;
      fl.scale.set(0.55 * k, 0.9 * k * (1 + dusk * 0.25), 1);
      fl.material.opacity = 0.75 + dusk * 0.25;
    }
    this.boat.position.x = -60 + ((t * 0.8) % 140);
    this.boat.rotation.z = Math.sin(t * 0.9) * 0.04;
  }
}

// ---------------------------------------------------------------- 部品
function palm(h, lx, lz, r, trunkMat, leafMat, nutMat, sway = true) {
  const g = new THREE.Group();
  g.name = 'palm';
  // 幹：先へ行くほど細く、少し曲がる
  const top = new THREE.Vector3(lx * h, h, lz * h);
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(lx * h * 0.15, h * 0.55, lz * h * 0.15), top);
  const segs = 14, rad = 10;
  const pos = [], uv = [], idx = [];
  const frames = curve.computeFrenetFrames(segs, false);
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, c = curve.getPoint(u), N = frames.normals[i], B = frames.binormals[i];
    const R = 0.34 * (1 - u * 0.45);
    for (let j = 0; j <= rad; j++) {
      const a = (j / rad) * TAU;
      pos.push(c.x + (Math.cos(a) * N.x + Math.sin(a) * B.x) * R, c.y + (Math.cos(a) * N.y + Math.sin(a) * B.y) * R, c.z + (Math.cos(a) * N.z + Math.sin(a) * B.z) * R);
      uv.push(j / rad, u * h * 0.9);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < rad; j++) {
    const a = i * (rad + 1) + j, b = a + rad + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  const trunk = new THREE.Mesh(tg, trunkMat);
  trunk.name = 'trunk';
  g.add(trunk);
  // 葉：アーチ状に垂れる細長い葉を、てっぺんのまわりに
  const crown = new THREE.Group();
  crown.position.copy(top);
  crown.name = 'crown';
  const fronds = [];
  const n = 9;
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / n) * TAU + r() * 0.3;
    const f = new THREE.Mesh(frondGeo(3.4 + r() * 1.1), leafMat);
    f.name = 'frond';
    f.userData.rx = -0.25 - r() * 0.35;
    f.userData.ph = r() * TAU;
    f.rotation.x = f.userData.rx;
    pivot.add(f);
    crown.add(pivot);
    if (sway) fronds.push(f);
  }
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), nutMat);
    c.position.set(Math.cos(i * 2.1) * 0.25, -0.25, Math.sin(i * 2.1) * 0.25);
    c.name = 'coconut';
    crown.add(c);
  }
  g.add(crown);
  g.userData.fronds = fronds;
  if (!sway) g.userData.fronds = [];
  return g;
}

/** 1 枚の葉：中心の筋が放物線で垂れる帯（葉の形はテクスチャの透明で切る）。 */
function frondGeo(len) {
  const segs = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, z = u * len, y = -u * u * len * 0.55 + u * 0.4, w = 0.75 * Math.sin(Math.min(1, u * 1.2) * Math.PI * 0.9 + 0.15);
    pos.push(-w, y - w * 0.15, z, w, y - w * 0.15, z);
    uv.push(0, u, 1, u);
  }
  for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function leafTexture() {
  const W = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  // 小さな葉を左右にななめに並べる
  for (let y = 8; y < H - 4; y += 7) {
    const k = y / H, len = W * 0.48 * Math.sin(Math.min(1, k * 1.15) * Math.PI * 0.95 + 0.05);
    g.strokeStyle = `hsl(${105 + k * 20}, 55%, ${32 + (y % 3) * 4}%)`;
    g.lineWidth = 5;
    g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2, H - y); g.lineTo(W / 2 + s * len, H - y + 18); g.stroke(); }
  }
  g.strokeStyle = '#6f8f3a'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 0); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function trunkTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#8c6a46'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 16) { g.fillStyle = '#6b4c2e'; g.fillRect(0, y, 64, 5); g.fillStyle = '#a8865d'; g.fillRect(0, y + 5, 64, 3); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function parasol() {
  const g = new THREE.Group();
  g.name = 'parasol';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.6, 8), new THREE.MeshStandardMaterial({ name: 'pole', color: 0xf3efe6 }));
  pole.position.y = 1.8;
  pole.rotation.z = 0.12;
  pole.name = 'pole';
  g.add(pole);
  const c = document.createElement('canvas');
  c.width = 256; c.height = 16;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#fff8ec' : '#22aab0'; x.fillRect(i * 32, 0, 32, 16); }
  const tx = new THREE.CanvasTexture(c);
  tx.colorSpace = THREE.SRGBColorSpace;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.8, 16, 1, true), new THREE.MeshStandardMaterial({ name: 'parasolTop', map: tx, side: THREE.DoubleSide, roughness: 0.8 }));
  cone.position.set(-0.43, 3.6, 0);
  cone.rotation.z = 0.12;
  cone.name = 'parasolTop';
  g.add(cone);
  // ビーチタオル
  const towel = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.04, 2.6), new THREE.MeshStandardMaterial({ name: 'towel', color: 0xff8f70, roughness: 1 }));
  towel.position.set(0.9, 0.03, 0.8);
  towel.rotation.y = 0.3;
  towel.name = 'towel';
  g.add(towel);
  return g;
}

function torch() {
  const g = new THREE.Group();
  g.name = 'torch';
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 6.4, 8), new THREE.MeshStandardMaterial({ name: 'torchPole', color: 0xc9a35a, roughness: 0.7 }));
  pole.position.y = 3.2;
  pole.name = 'torchPole';
  pole.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.18, 0.4, 10), new THREE.MeshStandardMaterial({ name: 'torchBowl', color: 0x5a3a20, roughness: 0.8 }));
  bowl.position.y = 6.5;
  bowl.name = 'torchBowl';
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(32, 92, 4, 32, 80, 60);
  grd.addColorStop(0, 'rgba(255,250,210,1)'); grd.addColorStop(0.3, 'rgba(255,190,70,0.95)'); grd.addColorStop(0.65, 'rgba(255,90,30,0.6)'); grd.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = grd;
  x.beginPath(); x.moveTo(32, 2); x.bezierCurveTo(60, 60, 62, 100, 32, 126); x.bezierCurveTo(2, 100, 4, 60, 32, 2); x.fill();
  const tx = new THREE.CanvasTexture(c);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  flame.position.y = 7.05;
  flame.scale.set(0.55, 0.9, 1);
  flame.name = 'flame';
  flame.userData.ph = Math.random() * 10;
  g.add(pole, bowl, flame);
  g.userData.flame = flame;
  return g;
}

function sailboat() {
  const g = new THREE.Group();
  g.name = 'sailboat';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(4, 0.7, 1.3), new THREE.MeshStandardMaterial({ name: 'hull', color: 0xfff8ec, roughness: 0.5 }));
  hull.position.y = 0.3;
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0, 0); sailShape.lineTo(2.2, 0); sailShape.lineTo(0, 4.6); sailShape.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ name: 'sail', color: 0xffffff, side: THREE.DoubleSide, roughness: 0.8 }));
  sail.position.set(-0.6, 0.7, 0);
  const sail2 = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ name: 'sail2', color: 0xff7a59, side: THREE.DoubleSide, roughness: 0.8 }));
  sail2.scale.set(-0.7, 0.75, 1);
  sail2.position.set(-0.7, 0.7, 0.02);
  g.add(hull, sail, sail2);
  return g;
}

function starGeo() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, rr = i % 2 ? 0.12 : 0.32;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return g;
}
