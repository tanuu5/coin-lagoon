// 台の寸法。物理（Physics.js）と見た目（Cabinet.js など）で同じ値を使う。
// 単位はコインの直径 = 1。x は右、y は上、z は手前（カメラ側）。下の段の床の上面が y = 0。
//
//   奥の壁（BACKWALL）の上を Clawd がサーフボードで左右に動き、コインを前へ投げる。
//   コインは浮き輪（HOOP）をくぐるとスロットが回り、プッシャーの上の段（棚）に落ちる。
//   棚のコインは奥の壁に押しとどめられ、プッシャーが下がるたびに前の段へこぼれる。
//   前の段のコインはプッシャーの前の面に押され、手前のふち（FIELD.edgeZ）から落ちると獲得、横から落ちると失う。

export const COIN = { r: 0.5, hh: 0.07, border: 0.025 };

export const FIELD = {
  halfW: 4.0,       // 床の内側の幅の半分
  edgeZ: 3.0,       // 手前のふち
  backZ: -11,       // 床の奥（プッシャーの下）
  wallEndZ: 0.3,    // 横の壁はここまで。ここから手前のふちまではガード（設定の「横のガード」が「あり」なら常に、「なし」ならフィーバー中だけ立つ）。
                    // ガードがないと、でたらめに投げて 15〜20% が横へ落ちる（tools/sim.mjs で 120 秒・毎秒 3 枚）
  wallTop: 3.4,     // 横の壁の高さ
  wallT: 0.3,       // 横の壁の厚み
  guardTop: 1.1,    // サイドガード（低い壁）の高さ
};

// プッシャー（前後に動く台）。上の面が棚になる。前の面の z = zMid + amp * sin(位相)
export const PUSHER = { h: 0.8, depth: 7.4, zMid: -1.55, amp: 0.95, period: 3.6 };

// 奥の壁。下の端は棚の上面よりわずかに高い（コインの厚みより狭いすき間）
export const BACKWALL = { z: -5.6, t: 0.5, bottom: 0.86, top: 3.4 };

// 浮き輪（チェッカー）。奥の壁の手前にわたした竹の棒（barZ）を左右に動く
export const HOOP = { y: 2.05, z: -3.6, R: 1.05, tube: 0.13, amp: 2.55, period: 6.4, barZ: -4.95, barR: 0.09 };

// Clawd が投げるコイン：出る位置（Clawd のおなかの前）と速さ（浮き輪の高さで z ≒ HOOP.z を通る）
export const TOSS = { y: 4.6, z: -5.25, vy: 1.4, vz: 3.57, maxX: 3.2 };

// 景品（フェルトの Clawd）。SVG（viewBox 0 0 150 110）の座標を s 倍して使う。中心は SVG の (75, 52)
export const PRIZE = { s: 1 / 46, cx: 75, cy: 52, thick: 0.2 };

// Clawd（clawd-mascot の SVG）の四角。armL / armR は肩から先、legs は 4 本（外側の 2 本は胴の側面にそろう）
export const CLAWD_RECTS = {
  body: [32, 8, 86, 66],
  armL: [12, 35, 24, 22],
  armR: [114, 35, 24, 22],
  legs: [[32, 74, 11, 22], [53, 74, 11, 22], [86, 74, 11, 22], [107, 74, 11, 22]],
  eyeL: [50, 22, 13, 13],
  eyeR: [88, 22, 13, 13],
};

/** プッシャーの前の面の z（位相 phase のとき）。 */
export function pusherFront(phase) { return PUSHER.zMid + PUSHER.amp * Math.sin(phase); }
