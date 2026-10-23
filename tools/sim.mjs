#!/usr/bin/env node
// 物理の調整用（開発だけで使う）。描画なしで台を動かし、戻り・重さ・浮き輪の当たりやすさを数える。
//
//   node tools/sim.mjs [--play 120] [--rate 3] [--aim random|hoop|center] [--seed 1] [--write]
//
//   --write  ならし終えたはじめの台を src/game/machine/initialField.json に書く
import RAPIER from '@dimforge/rapier3d-compat';
import { writeFileSync } from 'node:fs';
import { Physics, PHYS_DT } from '../src/game/machine/Physics.js';
import { HOOP, FIELD, TOSS } from '../src/game/machine/layout.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const PLAY = +arg('play', 60), RATE = +arg('rate', 3), AIM = arg('aim', 'random');
let seed = +arg('seed', 1);
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

if (arg('wallEnd')) FIELD.wallEndZ = +arg('wallEnd');
await RAPIER.init();
const ph = new Physics(RAPIER);
let t0 = performance.now();
ph.prefill({ rnd });
console.log(`prefill: ${ph.coins.length} coins, ${(performance.now() - t0).toFixed(0)} ms`);
if (argv.includes('--write')) {
  const url = new URL('../src/game/machine/initialField.json', import.meta.url);
  writeFileSync(url, JSON.stringify(ph.serialize()));
  console.log('wrote', url.pathname);
}
ph.addPrize('classic', 0, 0.9, 1.0);

const st = { won: 0, lost: 0, hoop: 0, tossed: 0, prizeWon: 0, prizeLost: 0, clinks: 0, fmax: 0 };
const forces = [];
ph.on = {
  won: () => st.won++, lost: () => st.lost++, hoop: () => st.hoop++,
  prizeWon: () => st.prizeWon++, prizeLost: () => st.prizeLost++,
};
let next = 0;
const times = [];
for (let t = 0; t < PLAY; t += 1 / 60) {
  if (t >= next) {
    next += 1 / RATE;
    const x = AIM === 'hoop' ? Math.max(-TOSS.maxX, Math.min(TOSS.maxX, HOOP.amp * Math.sin(ph.hoopPhase + (0.47 * Math.PI * 2) / HOOP.period))) : AIM === 'center' ? 0 : (rnd() * 2 - 1) * 3.2;
    ph.toss(x, rnd);
    st.tossed++;
  }
  const a = performance.now();
  ph.step(1 / 60);
  times.push(performance.now() - a);
  for (const c of ph.clinks) { forces.push(c[3]); st.fmax = Math.max(st.fmax, c[3]); }
  st.clinks += ph.clinks.length;
  ph.clinks.length = 0;
}
times.sort((a, b) => a - b);
forces.sort((a, b) => a - b);
const q = (arr, p) => arr.length ? arr[Math.floor(arr.length * p)] : 0;
console.log(`play ${PLAY}s rate ${RATE}/s aim ${AIM}`);
console.log(`  tossed ${st.tossed}  won ${st.won}  lost ${st.lost}  return ${(st.won / st.tossed * 100).toFixed(0)}%  hoop ${st.hoop} (${(st.hoop / st.tossed * 100).toFixed(0)}%)`);
console.log(`  prize won ${st.prizeWon} lost ${st.prizeLost}  coins on field ${ph.coins.length}`);
console.log(`  frame (2 substeps) ms: p50 ${q(times, 0.5).toFixed(2)} p90 ${q(times, 0.9).toFixed(2)} max ${times[times.length - 1].toFixed(2)}`);
console.log(`  clinks ${st.clinks} (${(st.clinks / PLAY).toFixed(0)}/s) force p50 ${q(forces, 0.5).toFixed(1)} p90 ${q(forces, 0.9).toFixed(1)} p99 ${q(forces, 0.99).toFixed(1)} max ${st.fmax.toFixed(0)}`);
const ys = ph.coins.filter((c) => c.air <= 0).map((c) => c.body.translation().y).sort((a, b) => a - b);
console.log(`  wallEndZ ${FIELD.wallEndZ}  high coins (y>1.75, landed): ${ys.filter((y) => y > 1.75).length}`);
console.log(`  coin y: min ${ys[0]?.toFixed(2)} max ${ys[ys.length - 1]?.toFixed(2)}  pusherZ ${ph.pusherZ.toFixed(2)} PHYS_DT ${PHYS_DT.toFixed(4)}`);
