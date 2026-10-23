// 浮き輪をくぐると回るスロット。くじ（結果）を先に引き、リールをその絵で止める。
//   slot.add()           回す権利を 1 つ足す（たまるのは STOCK_MAX まで）
//   slot.update(dt)      回す・止める。止まりきったら onResult(result) を呼ぶ
//   slot.reels[i]        見た目（view/Reels.js）が読む：{ spinning, target, stopAt, stopped }
//
// 絵：0 ハイビスカス、1 パイナップル、2 貝、3 ココナッツ、4 太陽、5 Clawd
export const SYMBOLS = ['hibiscus', 'pineapple', 'shell', 'coconut', 'sun', 'clawd'];
export const STOCK_MAX = 5;

// そろったときの中身（kind：coins はその場で払い出し、prize は景品を落とす、fever はサンセットフィーバー）
export const PAYS = {
  hibiscus: { p: 0.07, kind: 'coins', coins: 2 },
  coconut: { p: 0.04, kind: 'coins', coins: 4 },
  shell: { p: 0.025, kind: 'coins', coins: 6 },
  pineapple: { p: 0.015, kind: 'coins', coins: 10 },
  clawd: { p: 0.025, kind: 'prize', coins: 2 },
  sun: { p: 0.008, kind: 'fever', coins: 20 },
};
// 1 回あたりの期待値はコイン約 0.85 枚（フィーバーを含む）＋景品 0.025 個。浮き輪に入るほど回るが、たまるのは 5 回まで
const REACH = 0.3; // はずれのうち、2 つそろって最後で外れる（リーチ）割合

export class Slot {
  constructor(rnd = Math.random) {
    this.rnd = rnd;
    this.stock = 0;
    this.state = 'idle';
    this.t = 0;
    this.reels = [0, 1, 2].map((i) => ({ spinning: false, target: i * 2, stopAt: 0, stopped: true }));
    this.result = null;
    this.onResult = null;
    this.onStop = null;   // (i, reach) 1 本止まるたび
    this.onStart = null;
    this.bias = 1;        // 当たりやすさの倍率（フィーバー中は少し上げる）
    this.hold = false;    // true の間は回し始めない（タイトルなど）
  }

  add() {
    if (this.stock >= STOCK_MAX) return false;
    this.stock++;
    return true;
  }

  /** くじを引いて、3 本の止める絵を決める。 */
  draw() {
    const r = this.rnd();
    let acc = 0;
    for (const [id, pay] of Object.entries(PAYS)) {
      acc += pay.p * this.bias;
      if (r < acc) { const s = SYMBOLS.indexOf(id); return { win: id, pay, symbols: [s, s, s], reach: true }; }
    }
    // はずれ：リーチ（2 つそろう）か、ばらばら
    const pick = () => Math.floor(this.rnd() * SYMBOLS.length);
    if (this.rnd() < REACH) {
      const a = pick();
      let c = pick();
      while (c === a) c = pick();
      return { win: null, symbols: [a, a, c], reach: true };
    }
    let a = pick(), b = pick(), c = pick();
    while (b === a) b = pick();
    if (c === a && c === b) c = (c + 1) % SYMBOLS.length;
    return { win: null, symbols: [a, b, c], reach: false };
  }

  update(dt) {
    this.t += dt;
    if (this.state === 'idle') {
      if (this.stock > 0 && !this.hold) {
        this.stock--;
        this.result = this.draw();
        this.state = 'spin';
        this.t = 0;
        const reachWait = this.result.reach ? 1.5 : 0;
        this.reels.forEach((rl, i) => {
          rl.spinning = true;
          rl.stopped = false;
          rl.target = this.result.symbols[i];
          rl.stopAt = 0.9 + i * 0.42 + (i === 2 ? reachWait : 0);
        });
        this.onStart?.(this.result);
      }
      return;
    }
    if (this.state === 'spin') {
      this.reels.forEach((rl, i) => {
        if (!rl.stopped && this.t >= rl.stopAt + 0.38) { rl.stopped = true; this.onStop?.(i, this.result.reach && i === 1); }
        if (rl.spinning && this.t >= rl.stopAt) rl.spinning = false;
      });
      if (this.reels.every((rl) => rl.stopped)) {
        this.state = 'show';
        this.t = 0;
        this.onResult?.(this.result);
      }
      return;
    }
    if (this.state === 'show' && this.t > 0.7) this.state = 'idle';
  }
}
