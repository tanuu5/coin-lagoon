// 演出の粒：紙ふぶき（当たり・景品の獲得）、きらきら（浮き輪・コイン）。どれもゲームの時間で動く。
import * as THREE from 'three';

const MAX_CONF = 260, MAX_SPARK = 200;
const COLORS = [0xff5b6e, 0xffd24a, 0x3cc4c6, 0xffffff, 0xff9a3c, 0x8bdc6a, 0xf29db6];

export class Fx {
  constructor(scene) {
    // 紙ふぶき：小さな四角を 1 つの InstancedMesh で
    const geo = new THREE.PlaneGeometry(0.16, 0.1);
    this.confMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
    const conf = (this.conf = new THREE.InstancedMesh(geo, this.confMat, MAX_CONF));
    conf.name = 'confetti';
    conf.frustumCulled = false;
    conf.count = 0;
    conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < MAX_CONF; i++) conf.setColorAt(i, c.setHex(COLORS[i % COLORS.length]));
    scene.add(conf);
    this.confs = [];
    // きらきら：加算の点
    const sg = new THREE.BufferGeometry();
    this.sparkPos = new Float32Array(MAX_SPARK * 3);
    this.sparkCol = new Float32Array(MAX_SPARK * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3).setUsage(THREE.DynamicDrawUsage));
    const sm = new THREE.PointsMaterial({ size: 0.32, map: sparkTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const pts = (this.points = new THREE.Points(sg, sm));
    pts.name = 'sparks';
    pts.frustumCulled = false;
    scene.add(pts);
    this.sparks = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
  }

  /** 紙ふぶき。p のまわりから上へはじける。 */
  confetti(p, n = 60, spread = 2.5, up = 7) {
    for (let i = 0; i < n; i++) {
      if (this.confs.length >= MAX_CONF) this.confs.shift();
      this.confs.push({
        p: new THREE.Vector3(p.x + (Math.random() - 0.5) * spread, p.y + Math.random() * 0.5, p.z + (Math.random() - 0.5) * spread * 0.5),
        v: new THREE.Vector3((Math.random() - 0.5) * 5, up * (0.5 + Math.random() * 0.7), (Math.random() - 0.3) * 3),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9),
        t: 0, life: 2.4 + Math.random() * 1.2, ci: Math.floor(Math.random() * COLORS.length),
      });
    }
  }

  /** きらきら。color は 16 進の色。 */
  sparkle(p, n = 14, color = 0xffe08a, speed = 2.2, life = 0.7) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= MAX_SPARK) this.sparks.shift();
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * Math.PI;
      this.sparks.push({
        p: new THREE.Vector3(p.x, p.y, p.z),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(b), Math.sin(b) + 0.4, Math.sin(a) * Math.cos(b)).multiplyScalar(speed * (0.4 + Math.random() * 0.8)),
        t: 0, life: life * (0.6 + Math.random() * 0.6), c,
      });
    }
  }

  update(dt) {
    const m = this._m, q = this._q, e = this._e, s = this._s;
    let n = 0;
    for (let i = this.confs.length - 1; i >= 0; i--) {
      const f = this.confs[i];
      f.t += dt;
      if (f.t > f.life) { this.confs.splice(i, 1); continue; }
      f.v.y -= 9 * dt;
      f.v.multiplyScalar(1 - Math.min(1, dt * 1.6));
      f.v.y = Math.max(f.v.y, -2.2);
      f.p.addScaledVector(f.v, dt);
      f.p.x += Math.sin(f.t * 5 + f.ci) * dt * 0.6;
      f.r.addScaledVector(f.w, dt);
      e.set(f.r.x, f.r.y, f.r.z);
      q.setFromEuler(e);
      s.setScalar(Math.min(1, (f.life - f.t) / 0.4));
      this.conf.setMatrixAt(n, m.compose(f.p, q, s));
      this.conf.setColorAt(n, new THREE.Color(COLORS[f.ci]));
      n++;
    }
    this.conf.count = n;
    this.conf.instanceMatrix.needsUpdate = true;
    if (this.conf.instanceColor) this.conf.instanceColor.needsUpdate = true;
    let k = 0;
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const sp = this.sparks[i];
      sp.t += dt;
      if (sp.t > sp.life) { this.sparks.splice(i, 1); continue; }
      sp.v.y -= 3 * dt;
      sp.p.addScaledVector(sp.v, dt);
      const a = 1 - sp.t / sp.life;
      this.sparkPos.set([sp.p.x, sp.p.y, sp.p.z], k * 3);
      this.sparkCol.set([sp.c.r * a * 1.6, sp.c.g * a * 1.6, sp.c.b * a * 1.6], k * 3);
      k++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, k);
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
  }
}

function sparkTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4);
  const t = new THREE.CanvasTexture(c);
  return t;
}
