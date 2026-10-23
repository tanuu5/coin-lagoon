// 確認台：フェルトの Clawd（台の上の大きな Clawd と、景品 10 種）。
//   viewer.html?m=clawd           大きな Clawd（mode：idle / toss / joy / sleep / walk）
//   viewer.html?m=prize           景品（toggles で種類を切り替え）
import { Mascot, makePrize } from '../../src/game/view/ClawdFelt.js';
import { VARIANTS } from '../../src/game/prizes.js';

export default {
  title: 'Clawd（フェルト）',
  create({ THREE }) {
    const m = new Mascot();
    let mode = 'idle', last = -1;
    return {
      root: m.root,
      update(dt, ctx) {
        if (ctx.mode !== mode) { mode = ctx.mode; m.setSleep(mode === 'sleep'); }
        if (mode === 'toss' && Math.floor(ctx.time / 0.6) !== last) { last = Math.floor(ctx.time / 0.6); m.throwCoin(); }
        if (mode === 'joy') m.cheer(0.5);
        m.vx = mode === 'walk' ? Math.sin(ctx.time * 2) * 3 : 0;
        m.update(dt);
      },
    };
  },
  modes: { idle: { mode: 'idle' }, toss: { mode: 'toss' }, joy: { mode: 'joy' }, sleep: { mode: 'sleep' }, walk: { mode: 'walk' } },
  setup({ THREE, renderer }) { renderer.toneMapping = THREE.ACESFilmicToneMapping; },
  background: '#bfe7ee',
};

export const prize = {
  title: '景品の Clawd',
  create({ THREE }) {
    const root = new THREE.Group();
    // 10 種を 5 x 2 に並べる（立てて正面を向ける）
    VARIANTS.forEach((v, i) => {
      const p = makePrize(v.id);
      p.position.set(((i % 5) - 2) * 3.1, (i < 5 ? 1 : 0) * 2.4 + 1.1, 0);
      root.add(p);
    });
    return { root };
  },
  modes: { idle: {} },
  setup({ THREE, renderer }) { renderer.toneMapping = THREE.ACESFilmicToneMapping; },
  background: '#bfe7ee',
};
