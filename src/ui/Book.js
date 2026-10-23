// Clawd 図鑑：集めたフェルトの Clawd の一覧（状態を持たない画面。タイトルと一時停止から開く）。
// 絵は SVG（clawd-mascot の形）に、種類ごとの色と小物を重ねて描く。まだ持っていないものは影だけ。
import { t, onLangChange } from '../core/i18n.js';
import { VARIANTS } from '../game/prizes.js';

export class Book {
  constructor(screens) {
    this.el = screens.addModal('book', `
<section id="m-book" class="modal hidden"><div class="card book-card" data-scroll>
  <h2 data-i18n="book.title">${t('book.title')}</h2>
  <p class="book-sum"></p>
  <div class="book-grid"></div>
  <button data-act="back" data-i18n="ui.back">${t('ui.back')}</button>
</div></section>`);
    this.grid = this.el.querySelector('.book-grid');
    this.sum = this.el.querySelector('.book-sum');
    this.data = {};
    onLangChange(() => this.refresh(this.data));
  }

  refresh(book = {}) {
    this.data = book;
    const have = VARIANTS.filter((v) => book[v.id]).length;
    this.sum.textContent = t('book.sum', { n: have, total: VARIANTS.length });
    this.grid.innerHTML = VARIANTS.map((v) => {
      const n = book[v.id] || 0;
      const stars = '★'.repeat(v.rarity) + '☆'.repeat(5 - v.rarity);
      return `<div class="book-item ${n ? 'got' : 'unknown'} r${v.rarity}">
        <div class="icon">${clawdIcon(v, !!n)}</div>
        <div class="name">${n ? t('prize.' + v.id) : '？？？'}</div>
        <div class="meta"><span class="stars">${stars}</span>${n ? `<span class="count">×${n}</span>` : ''}</div>
      </div>`;
    }).join('');
  }
}

/** フェルトの Clawd の絵（SVG）。known が false なら影だけ。 */
export function clawdIcon(v, known = true) {
  const body = known ? v.color : '#3c4a52', eye = known ? '#141414' : '#3c4a52';
  const st = known ? v.thread : 'none';
  const rect = (x, y, w, h, fill, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" ${extra}/>`;
  const dash = `stroke="${st}" stroke-width="2.4" stroke-dasharray="4 4" fill="none"`;
  let s = '';
  s += rect(12, 35, 24, 22, body) + rect(114, 35, 24, 22, body);
  for (const x of [32, 53, 86, 107]) s += rect(x, 70, 11, 26, body);
  s += rect(32, 8, 86, 66, body);
  if (known) {
    s += `<rect x="36" y="12" width="78" height="58" rx="3" ${dash}/>`;
    s += rect(50, 22, 13, 13, eye, 'rx="2"') + rect(88, 22, 13, 13, eye, 'rx="2"');
    const acc = v.acc || [];
    if (acc.includes('hibiscus')) s += flower(110, 14, 13, '#e8354c', '#ffd24a');
    if (acc.includes('shades')) s += `<path d="M44 20 H107 V27 H103 V33 H82 V27 H69 V33 H48 V27 H44 Z" fill="#1b1b22"/><rect x="52" y="24" width="5" height="3" fill="#fff"/><rect x="86" y="24" width="5" height="3" fill="#fff"/>`;
    if (acc.includes('lei')) for (let i = 0; i < 7; i++) { const u = i / 6 - 0.5; s += flower(45 + i * 10, 52 + (1 - u * u * 4) * 6, 5.5, ['#ff6f91', '#ffd84d', '#ffffff', '#ff9a3c'][i % 4], '#ffd24a'); }
    if (acc.includes('strawhat')) s += `<rect x="54" y="-14" width="42" height="18" rx="7" fill="#e9c879"/><rect x="38" y="2" width="74" height="8" rx="4" fill="#e9c879"/><rect x="54" y="-2" width="42" height="5" fill="#d8384a"/>`;
    if (acc.includes('stars')) for (const [x, y] of [[44, 50], [96, 44], [70, 58]]) s += `<path d="M${x} ${y - 6} L${x + 2} ${y - 1} L${x + 7} ${y - 1} L${x + 3} ${y + 2} L${x + 4} ${y + 7} L${x} ${y + 4} L${x - 4} ${y + 7} L${x - 3} ${y + 2} L${x - 7} ${y - 1} L${x - 2} ${y - 1} Z" fill="#ffd75a"/>`;
    if (v.gold) s += `<path d="M24 8 l3 6 l6 3 l-6 3 l-3 6 l-3 -6 l-6 -3 l6 -3 Z" fill="#fff6c8"/><path d="M128 66 l2 4 l4 2 l-4 2 l-2 4 l-2 -4 l-4 -2 l4 -2 Z" fill="#fff6c8"/>`;
  }
  return `<svg viewBox="0 -18 150 118" aria-hidden="true">${s}</svg>`;
}

function flower(cx, cy, r, petal, center) {
  let s = '';
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; s += `<circle cx="${(cx + Math.cos(a) * r * 0.55).toFixed(1)}" cy="${(cy + Math.sin(a) * r * 0.55).toFixed(1)}" r="${(r * 0.55).toFixed(1)}" fill="${petal}"/>`; }
  return s + `<circle cx="${cx}" cy="${cy}" r="${(r * 0.35).toFixed(1)}" fill="${center}"/>`;
}
