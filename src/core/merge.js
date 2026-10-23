// 動かない部品をまとめて、draw call を減らす（アイスもりもりでは屋台・町・人で 600〜760 → 365〜400）。
//   mergeStatic(group, { keep, minCount })
//   group の下のメッシュを「材質・頂点の属性・影の設定」が同じ組ごとに 1 つのメッシュにまとめ、group の直下に置く。
//   頂点は group から見た位置で焼き込むので、group ごと動かす・回すのはかまわない。場面を組み終えたあと（init・場面の切り替え）に 1 回呼ぶ。
//   まとめないもの：keep に入れたオブジェクトと userData.dynamic の付いたもの（どちらも中身ごと）、userData.noMerge の付いたメッシュ（その 1 つだけ）、
//   visible が false のもの（中身ごと）、InstancedMesh・SkinnedMesh、透明な材質、材質が配列のもの、モーフのあるもの。
//   - 材質を共有しないとまとまらない。ループの中で毎回 new Material すると、1 つずつ別の組になって何も減らない（色違いは色の数だけ作って使い回す）
//   - 元のメッシュは場面から外れる。動かす・消す・色を個別に変える・名前で探す・レイで当てる物は keep か userData.dynamic に入れる
//     （関節のある人やロボは、関節のグループごとに中身をまとめ、子の関節を keep にする）
//   - まとめたせいで空になったグループは片づける。あとで物をつける所にするなら userData.keepEmpty = true
//   - 部品の名前・表示の切り替え（__dev.parts() / setVisible、確認台のクリックで部品名）は、まとめた単位になる
// 戻り値は、まとめた元のメッシュの数。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

export function mergeStatic(group, { keep = [], minCount = 2 } = {}) {
  const keepSet = new Set(keep);
  const skip = (o) => o !== group && (keepSet.has(o) || o.userData.dynamic || !o.visible);
  group.updateMatrixWorld(true);
  _inv.copy(group.matrixWorld).invert();
  const buckets = new Map();
  const visit = (o) => {
    if (skip(o)) return; // 動く部分・見えていない部分の中には入らない
    if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh && !o.userData.noMerge) {
      const mat = o.material, g = o.geometry;
      if (!Array.isArray(mat) && !mat.transparent && !o.morphTargetInfluences) {
        const sig = [mat.uuid, Object.keys(g.attributes).sort().join(','), g.index ? 'i' : 'n',
          o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask].join('|');
        if (!buckets.has(sig)) buckets.set(sig, { mat, list: [], from: o });
        buckets.get(sig).list.push(o);
      }
    }
    for (const c of o.children) visit(c);
  };
  visit(group);
  let merged = 0;
  const emptied = new Set();
  for (const b of buckets.values()) {
    if (b.list.length < minCount) continue;
    const geos = [];
    for (const o of b.list) {
      _m.multiplyMatrices(_inv, o.matrixWorld);
      const g = o.geometry.clone();
      g.applyMatrix4(_m);
      if (_m.determinant() < 0) flipWinding(g); // 鏡に映した部品（scale が負）は、焼き込むと三角形が裏返る
      for (const k of Object.keys(g.morphAttributes)) delete g.morphAttributes[k];
      geos.push(g);
    }
    const geo = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, b.mat);
    const f = b.from;
    mesh.castShadow = f.castShadow;
    mesh.receiveShadow = f.receiveShadow;
    mesh.renderOrder = f.renderOrder;
    mesh.layers.mask = f.layers.mask;
    mesh.name = 'merged:' + (b.mat.name || f.name || 'part');
    group.add(mesh);
    for (const o of b.list) { emptied.add(o.parent); o.parent.remove(o); }
    merged += b.list.length;
  }
  // まとめたせいで空になったグループを、上へたどって片づける（前から空だったグループ＝物をつける所は残す）
  for (let p of emptied) {
    while (p && p !== group && p.isGroup && !p.children.length && !p.userData.keepEmpty) {
      const up = p.parent;
      up?.remove(p);
      p = up;
    }
  }
  return merged;
}

// 三角形の頂点の順を入れ替える（表と裏を入れ替える）
function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i + 2 < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
    return;
  }
  for (const attr of Object.values(g.attributes)) {
    for (let v = 0; v + 2 < attr.count; v += 3) {
      for (let c = 0; c < attr.itemSize; c++) {
        const t = attr.getComponent(v + 1, c);
        attr.setComponent(v + 1, c, attr.getComponent(v + 2, c));
        attr.setComponent(v + 2, c, t);
      }
    }
  }
}
