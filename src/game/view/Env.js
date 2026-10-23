// まわりの景色と光：空（雲と太陽のにじみ）、海（遠くほど深い青、きらめき）、砂浜、太陽の光と影、環境マップ。
// 夕方（フィーバー）へは setTime(0〜1) で色を混ぜて移る。0 = 昼、1 = 夕焼け。
import * as THREE from 'three';
import { sand } from './textures.js';

export const GROUND_Y = -2.6;
const SEA_Y = -2.85;

// 昼と夕焼けの色（線形の値で書く。最後は OutputPass が色調を整える）
const DAY = {
  top: [0.18, 0.47, 0.95], horizon: [0.72, 0.9, 1.0], sun: [1.0, 0.95, 0.85], seaNear: [0.12, 0.72, 0.72], seaFar: [0.02, 0.24, 0.55],
  light: 0xfff4e0, lightI: 2.6, hemiSky: 0xcfeeff, hemiGround: 0xe0c08a, hemiI: 1.25, cloud: [1, 1, 1],
};
const DUSK = {
  top: [0.22, 0.16, 0.5], horizon: [1.0, 0.52, 0.32], sun: [1.0, 0.55, 0.25], seaNear: [0.35, 0.32, 0.45], seaFar: [0.12, 0.08, 0.3],
  light: 0xffb27a, lightI: 2.1, hemiSky: 0xffb8a0, hemiGround: 0x704050, hemiI: 1.0, cloud: [1.0, 0.68, 0.6],
};

const skyVert = /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const NOISE = /* glsl */ `
  float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.03; a*=0.5; } return v; }`;
const skyFrag = /* glsl */ `
  uniform vec3 uTop, uHorizon, uSun, uSunDir, uCloud;
  uniform float uTime;
  varying vec3 vDir;
  ${NOISE}
  void main(){
    vec3 d = normalize(vDir + vec3(0.0, 1e-5, 0.0));
    float h = d.y;
    vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
    col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.25, h));
    float sd = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSun * (pow(sd, 900.0) * 6.0 + pow(sd, 18.0) * 0.28 + pow(sd, 3.0) * 0.08);
    if (h > 0.0) {
      vec2 p = d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(p * 1.4);
      float c = smoothstep(0.52, 0.78, n) * smoothstep(0.0, 0.18, h) * (1.0 - smoothstep(0.55, 0.9, h));
      vec3 cc = uCloud * (0.85 + 0.15 * smoothstep(0.5, 0.9, n));
      col = mix(col, cc, c * 0.85);
    }
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }`;

const seaVert = /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const seaFrag = /* glsl */ `
  uniform vec3 uNear, uFar, uHorizon, uSun, uSunDir;
  uniform float uTime;
  uniform vec2 uShore;  // 浜の中心からの距離の目安（ここから深くなる）
  varying vec3 vW;
  ${NOISE}
  void main(){
    float dist = length(vW.xz - vec2(0.0, -2.0));
    float deep = smoothstep(uShore.x, uShore.y, dist);
    vec3 col = mix(uNear, uFar, deep);
    // 波の模様ときらめき
    vec2 p = vW.xz * 0.35;
    float w1 = fbm(p + vec2(uTime * 0.05, uTime * 0.03));
    float w2 = fbm(p * 2.3 - vec2(uTime * 0.04, -uTime * 0.06));
    col *= 0.9 + 0.2 * w1;
    float glint = smoothstep(0.78, 0.86, w2 * 0.6 + w1 * 0.5) * (0.4 + 0.6 * deep);
    col += uSun * glint * 0.55;
    // 遠くは空の色へ
    vec3 V = normalize(cameraPosition - vW);
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 4.0);
    col = mix(col, uHorizon, fres * 0.75);
    // 浜に寄せる白い泡
    float foam = smoothstep(uShore.x - 1.6, uShore.x - 0.6, dist) * (1.0 - smoothstep(uShore.x - 0.6, uShore.x + 0.8, dist));
    foam *= 0.55 + 0.45 * sin(dist * 3.0 - uTime * 1.6 + w1 * 4.0);
    col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.6);
    gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
  }`;

export class Env {
  constructor(scene, renderer) {
    this.scene = scene;
    this.t = 0;      // 0 = 昼、1 = 夕焼け
    this.want = 0;
    this.time = 0;
    const sunDir = (this.sunDir = new THREE.Vector3(0.55, 0.62, 0.55).normalize());

    // 空
    this.skyU = {
      uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(-0.35, 0.16, -1).normalize() }, uCloud: { value: new THREE.Color() }, uTime: { value: 0 },
    };
    const sky = (this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.skyU, vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false,
    })));
    sky.name = 'sky';
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    scene.add(sky);

    // 海
    this.seaU = {
      uNear: { value: new THREE.Color() }, uFar: { value: new THREE.Color() }, uHorizon: this.skyU.uHorizon, uSun: this.skyU.uSun,
      uSunDir: this.skyU.uSunDir, uTime: { value: 0 }, uShore: { value: new THREE.Vector2(17, 60) },
    };
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 1, 1), new THREE.ShaderMaterial({ uniforms: this.seaU, vertexShader: seaVert, fragmentShader: seaFrag }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = SEA_Y;
    sea.name = 'sea';
    scene.add(sea);

    // 砂浜（だ円の島）。ふちは海の泡に隠れる
    const sandMat = new THREE.MeshStandardMaterial({ name: 'sand', map: sand(), roughness: 0.95, color: 0xfff3dc });
    const beach = new THREE.Mesh(new THREE.CircleGeometry(1, 72), sandMat);
    beach.rotation.x = -Math.PI / 2;
    beach.scale.set(18.5, 15.5, 1);
    beach.position.set(0, GROUND_Y, -2);
    beach.receiveShadow = true;
    beach.name = 'beach';
    scene.add(beach);
    // 浜のふちの濡れた砂（少し暗い輪）
    const wet = new THREE.Mesh(new THREE.RingGeometry(0.93, 1.0, 72), new THREE.MeshStandardMaterial({ name: 'wetSand', color: 0xc9b089, roughness: 0.6 }));
    wet.rotation.x = -Math.PI / 2;
    wet.scale.set(18.5, 15.5, 1);
    wet.position.set(0, GROUND_Y + 0.01, -2);
    wet.receiveShadow = true;
    wet.name = 'wetSand';
    scene.add(wet);

    // 光
    const hemi = (this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1));
    scene.add(hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 2.5));
    sun.position.copy(sunDir).multiplyScalar(30);
    sun.castShadow = true;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 5, far: 70 });
    sun.target.position.set(0, 0, -1.5);
    scene.add(sun, sun.target);

    this._apply();
    this._buildEnvMap(renderer);
  }

  /** 環境マップ（金のコインの映り込み用）：空と砂だけの小さな場面から作る。 */
  _buildEnvMap(renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    // 空は小さな球にする（fromScene のカメラの far に収める）
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), this.sky.material.clone());
    sky.material.uniforms = THREE.UniformsUtils.clone(this.skyU);
    // 映り込みの空は白っぽく暖かい色にする（青い空がそのまま映ると、金が緑がかって見える）
    sky.material.uniforms.uTop.value.setRGB(0.62, 0.66, 0.72);
    sky.material.uniforms.uHorizon.value.setRGB(1.0, 0.95, 0.86);
    sky.material.uniforms.uSun.value.multiplyScalar(0.5);
    es.add(sky);
    const g = new THREE.Mesh(new THREE.CircleGeometry(55, 24), new THREE.MeshBasicMaterial({ color: 0x9a7444 }));
    g.rotation.x = -Math.PI / 2;
    g.position.y = -3;
    es.add(g);
    // 明るい板（金の面に入る白い映り込み）
    for (const [x, y, z, w, h] of [[22, 16, 26, 26, 10], [-28, 10, 14, 14, 8]]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      panel.position.set(x, y, z);
      panel.lookAt(0, 0, 0);
      es.add(panel);
    }
    this.envMap = pm.fromScene(es, 0.02, 0.1, 200).texture;
    // 金属（コイン・真鍮）は材質に直接つけて強く映し、それ以外の物には弱くだけ効かせる（全部に強く効くと白くかすむ）
    this.scene.environment = this.envMap;
    this.scene.environmentIntensity = 0.3;
    pm.dispose();
  }

  /** 金属の材質に、この環境マップを強めにつける。 */
  shine(mat, k = 1.2) {
    mat.envMap = this.envMap;
    mat.envMapIntensity = k;
    mat.needsUpdate = true;
  }

  _apply() {
    const k = this.t;
    const mix = (a, b) => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * k);
    const U = this.skyU;
    U.uTop.value.setRGB(...mix(DAY.top, DUSK.top));
    U.uHorizon.value.setRGB(...mix(DAY.horizon, DUSK.horizon));
    U.uSun.value.setRGB(...mix(DAY.sun, DUSK.sun));
    U.uCloud.value.setRGB(...mix(DAY.cloud, DUSK.cloud));
    // 夕方は太陽が水平線へ下りる
    U.uSunDir.value.set(-0.35 + k * 0.1, 0.16 - k * 0.12, -1).normalize();
    this.seaU.uNear.value.setRGB(...mix(DAY.seaNear, DUSK.seaNear));
    this.seaU.uFar.value.setRGB(...mix(DAY.seaFar, DUSK.seaFar));
    const c1 = new THREE.Color(DAY.light), c2 = new THREE.Color(DUSK.light);
    this.sun.color.copy(c1).lerp(c2, k);
    this.sun.intensity = DAY.lightI + (DUSK.lightI - DAY.lightI) * k;
    this.hemi.color.copy(new THREE.Color(DAY.hemiSky)).lerp(new THREE.Color(DUSK.hemiSky), k);
    this.hemi.groundColor.copy(new THREE.Color(DAY.hemiGround)).lerp(new THREE.Color(DUSK.hemiGround), k);
    this.hemi.intensity = DAY.hemiI + (DUSK.hemiI - DAY.hemiI) * k;
  }

  setDusk(on) { this.want = on ? 1 : 0; }

  update(dt) {
    this.time += dt;
    this.skyU.uTime.value = this.time;
    this.seaU.uTime.value = this.time;
    if (Math.abs(this.want - this.t) > 1e-3) {
      this.t += Math.sign(this.want - this.t) * Math.min(Math.abs(this.want - this.t), dt / 2.5);
      this._apply();
    }
  }
}
