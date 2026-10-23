// 台の見た目：ラグーンの床、手前のふちと受け皿、横の壁（アクリルと竹）、前後に動くプッシャー、奥の壁、浮き輪の竹の棒、
// Clawd が乗るレール、手前の横のガード（設定で常に、またはフィーバー中だけ、せり上がる）。当たりは Physics.js が持つので、ここは形と色だけ。
import * as THREE from 'three';
import { FIELD, PUSHER, BACKWALL, HOOP } from '../machine/layout.js';
import { lagoonFloor, planks, bamboo, tikiPanel, sand, signBoard } from './textures.js';
import { mergeStatic } from '../../core/merge.js';

export const TRAY_Y = -1.45;

export class Cabinet {
  constructor(scene) {
    const root = (this.root = new THREE.Group());
    root.name = 'cabinet';
    scene.add(root);
    const W = FIELD.halfW;
    const mats = (this.mats = {
      floor: new THREE.MeshStandardMaterial({ name: 'floor', map: lagoonFloor(), roughness: 0.25, metalness: 0.05 }),
      wood: new THREE.MeshStandardMaterial({ name: 'wood', map: planks('dark', '#7a4a26', 4), roughness: 0.7 }),
      woodLight: new THREE.MeshStandardMaterial({ name: 'woodLight', map: planks('light', '#c08a4f', 9), roughness: 0.65 }),
      brass: new THREE.MeshStandardMaterial({ name: 'brass', color: 0xe2b860, metalness: 1, roughness: 0.25 }),
      bamboo: new THREE.MeshStandardMaterial({ name: 'bamboo', map: bamboo(), roughness: 0.55 }),
      acrylic: new THREE.MeshPhysicalMaterial({ name: 'acrylic', color: 0xe8fbff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }),
      dark: new THREE.MeshStandardMaterial({ name: 'dark', color: 0x1b2a2e, roughness: 0.9 }),
      tiki: new THREE.MeshStandardMaterial({ name: 'tiki', map: tikiPanel(), roughness: 0.75 }),
      shelf: new THREE.MeshStandardMaterial({ name: 'shelf', map: sand(), color: 0xfff1d6, roughness: 0.8 }),
      tray: new THREE.MeshStandardMaterial({ name: 'tray', color: 0x2f6f73, roughness: 0.5, metalness: 0.2 }),
      guardRail: new THREE.MeshStandardMaterial({ name: 'guardRail', map: bamboo(), roughness: 0.5, emissive: 0xffa040, emissiveIntensity: 0 }),
    });
    mats.shelf.map = mats.shelf.map.clone();
    mats.shelf.map.repeat.set(2.5, 2.5);
    mats.shelf.map.needsUpdate = true;
    const box = (w, h, d, mat, x, y, z, name) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.name = name;
      m.castShadow = m.receiveShadow = true;
      return m;
    };
    const stat = new THREE.Group();
    stat.name = 'static';

    // 床（ラグーン）：見える所だけ。上の面にテクスチャ
    const floorLen = FIELD.edgeZ - BACKWALL.z + 0.6;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, floorLen), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, FIELD.edgeZ - floorLen / 2);
    floor.receiveShadow = true;
    floor.name = 'floor';
    mats.floor.map.repeat.set(1.6, floorLen / 5);
    stat.add(floor);
    // 床の厚み（手前のふちの下）と真鍮のふち
    stat.add(box(W * 2, 1.25, 0.2, mats.wood, 0, -0.63, FIELD.edgeZ - 0.1, 'edgeFace'));
    const lip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, W * 2, 12), mats.brass);
    lip.rotation.z = Math.PI / 2;
    lip.position.set(0, -0.02, FIELD.edgeZ);
    lip.name = 'lip';
    stat.add(lip);
    // 受け皿
    stat.add(box(W * 2 + 0.6, 0.2, 1.6, mats.tray, 0, TRAY_Y - 0.12, FIELD.edgeZ + 0.85, 'tray'));
    stat.add(box(W * 2 + 0.6, 0.45, 0.12, mats.woodLight, 0, TRAY_Y + 0.1, FIELD.edgeZ + 1.66, 'trayLip'));

    // 受け皿の下の正面の板と看板
    stat.add(box(W * 2 + 1.9, 0.95, 0.3, mats.wood, 0, TRAY_Y - 0.62, FIELD.edgeZ + 1.6, 'frontPanel'));
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 - 0.4, (W * 2 - 0.4) / 8), new THREE.MeshStandardMaterial({ name: 'sign', map: signBoard(), roughness: 0.6 }));
    sign.position.set(0, TRAY_Y - 0.62, FIELD.edgeZ + 1.76);
    sign.name = 'sign';
    stat.add(sign);

    // 手前の横の落とし口（暗い溝）と、そのさらに外の台の柱
    const gutterW = 0.55, gl = FIELD.edgeZ - FIELD.wallEndZ;
    for (const s of [-1, 1]) {
      stat.add(box(gutterW, 0.1, gl, mats.dark, s * (W + gutterW / 2), -1.2, (FIELD.edgeZ + FIELD.wallEndZ) / 2, 'gutter'));
      // 外の柱（台の両わき）
      const px = s * (W + gutterW + 0.3);
      stat.add(box(0.6, 4.4, FIELD.edgeZ - BACKWALL.z + 1.2, mats.wood, px, 0.6 - 1.4, (FIELD.edgeZ + BACKWALL.z) / 2 - 0.3, 'sidePost'));
      stat.add(box(0.7, 0.2, FIELD.edgeZ - BACKWALL.z + 1.3, mats.woodLight, px, 1.62, (FIELD.edgeZ + BACKWALL.z) / 2 - 0.3, 'sideCap'));
      // 奥の横の壁（アクリル）と、その上の竹
      const wl = FIELD.wallEndZ - BACKWALL.z;
      const acr = new THREE.Mesh(new THREE.PlaneGeometry(wl, FIELD.wallTop), mats.acrylic);
      acr.rotation.y = Math.PI / 2;
      acr.position.set(s * (W + 0.02), FIELD.wallTop / 2, (FIELD.wallEndZ + BACKWALL.z) / 2);
      acr.name = 'acrylic';
      acr.renderOrder = 2;
      this.acrylic = acr;
      root.add(acr); // 透明なので、まとめない
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, wl, 10), mats.bamboo);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(s * (W + 0.1), FIELD.wallTop, (FIELD.wallEndZ + BACKWALL.z) / 2);
      rail.name = 'wallRail';
      rail.castShadow = true;
      stat.add(rail);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, FIELD.wallTop + 1.4, 10), mats.bamboo);
      post.position.set(s * (W + 0.1), FIELD.wallTop / 2 - 0.7, FIELD.wallEndZ);
      post.name = 'wallPost';
      post.castShadow = true;
      stat.add(post);
      // 横の壁の下の木枠（床と同じ高さまで）
      stat.add(box(0.25, 1.5, wl, mats.woodLight, s * (W + 0.13), -0.75, (FIELD.wallEndZ + BACKWALL.z) / 2, 'wallBase'));
    }

    // 奥の壁（ティキの彫り物）
    const bwH = BACKWALL.top - BACKWALL.bottom;
    const bw = new THREE.Mesh(new THREE.BoxGeometry(W * 2, bwH, BACKWALL.t), [mats.wood, mats.wood, mats.woodLight, mats.wood, mats.tiki, mats.wood]);
    bw.position.set(0, BACKWALL.bottom + bwH / 2, BACKWALL.z - BACKWALL.t / 2);
    bw.castShadow = bw.receiveShadow = true;
    bw.name = 'backWall';
    stat.add(bw);
    // 奥の壁の上：Clawd のサーフボードが走るレール（竹 2 本）
    for (const dz of [-0.12, 0.12]) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, W * 2 + 0.6, 10), mats.bamboo);
      r.rotation.z = Math.PI / 2;
      r.position.set(0, BACKWALL.top + 0.06, BACKWALL.z - BACKWALL.t / 2 + dz);
      r.name = 'clawdRail';
      r.castShadow = true;
      stat.add(r);
    }
    // 浮き輪をわたす竹の棒
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(HOOP.barR, HOOP.barR, W * 2 + 0.4, 12), mats.bamboo);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, HOOP.y, HOOP.barZ);
    bar.name = 'hoopBar';
    bar.castShadow = true;
    stat.add(bar);

    mergeStatic(stat);
    root.add(stat);

    // プッシャー（動く）：前の面は木の板、上の面（棚）は砂色
    const pg = new THREE.BoxGeometry(W * 2 - 0.04, PUSHER.h, PUSHER.depth);
    const pusher = (this.pusher = new THREE.Mesh(pg, [mats.dark, mats.dark, mats.shelf, mats.dark, mats.woodLight, mats.dark]));
    pusher.name = 'pusher';
    pusher.castShadow = pusher.receiveShadow = true;
    root.add(pusher);
    // プッシャーの前の面の飾り：真鍮の帯
    const band = new THREE.Mesh(new THREE.BoxGeometry(W * 2 - 0.04, 0.07, 0.04), mats.brass);
    band.position.set(0, PUSHER.h / 2 - 0.06, PUSHER.depth / 2 + 0.01);
    band.name = 'pusherBand';
    pusher.add(band);

    // 手前の横のガード：低いアクリルの板と、竹の手すり・柱（横の壁と同じ作り）。立っていないときは床の下へ沈む
    this.guards = [-1, 1].map((s) => {
      const g = new THREE.Group();
      g.name = 'guard';
      const zc = (FIELD.edgeZ + FIELD.wallEndZ) / 2;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(gl, FIELD.guardTop), mats.acrylic);
      panel.rotation.y = Math.PI / 2;
      panel.position.set(s * (W + 0.02), FIELD.guardTop / 2, zc);
      panel.renderOrder = 2;
      panel.name = 'guardPanel';
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, gl + 0.1, 10), mats.guardRail);
      rail.rotation.x = Math.PI / 2;
      rail.position.set(s * (W + 0.1), FIELD.guardTop, zc);
      rail.name = 'guardRail';
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, FIELD.guardTop + 1.5, 10), mats.guardRail);
      post.position.set(s * (W + 0.1), FIELD.guardTop / 2 - 0.75, FIELD.edgeZ - 0.08);
      post.name = 'guardPost';
      for (const m of [rail, post]) m.castShadow = true;
      g.add(panel, rail, post);
      root.add(g);
      return g;
    });
    this.guardT = 0;
    this.feverGlow = false;
    this.t = 0;
  }

  update(dt, ph) {
    this.pusher.position.set(0, PUSHER.h / 2, ph.pusherZ - PUSHER.depth / 2);
    // 横のガード：立っているときはせり上がり、フィーバー中は手すりが光る
    this.t += dt;
    this.guardT += ((ph.guardsOn ? 1 : 0) - this.guardT) * Math.min(1, dt * 8);
    for (const g of this.guards) {
      g.position.y = -(1 - this.guardT) * (FIELD.guardTop + 1.7);
      g.visible = this.guardT > 0.01;
    }
    this.mats.guardRail.emissiveIntensity = this.feverGlow ? 0.45 + Math.sin(this.t * 7) * 0.3 : 0;
  }
}
