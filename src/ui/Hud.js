// ゲーム中の表示：持っているコイン、図鑑の数、おこづかいの残り時間、大きな知らせ（帯）、小さな知らせ、操作の案内。
// 出し入れの濃さや動きはゲームの時間（update(dt)）で動かす（CSS のアニメーションは撮影の仮想時計で止められないため）。
import { t, onLangChange } from '../core/i18n.js';

const COIN_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffcf4a" stroke="#c98a12" stroke-width="2"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#e8a92a" stroke-width="1.4"/><rect x="8" y="8.6" width="8" height="5.6" fill="#c98a12"/><rect x="6.4" y="10.6" width="2" height="1.8" fill="#c98a12"/><rect x="15.6" y="10.6" width="2" height="1.8" fill="#c98a12"/><rect x="8.4" y="14.2" width="1.2" height="2" fill="#c98a12"/><rect x="10.4" y="14.2" width="1.2" height="2" fill="#c98a12"/><rect x="12.4" y="14.2" width="1.2" height="2" fill="#c98a12"/><rect x="14.4" y="14.2" width="1.2" height="2" fill="#c98a12"/></svg>`;
export const CLAWD_SVG = (color = '#C67D5F', eye = '#141414') => `<svg viewBox="0 0 150 110" aria-hidden="true"><g fill="${color}"><rect x="12" y="35" width="24" height="22"/><rect x="114" y="35" width="24" height="22"/><rect x="32" y="8" width="86" height="66"/><rect x="32" y="74" width="11" height="22"/><rect x="53" y="74" width="11" height="22"/><rect x="86" y="74" width="11" height="22"/><rect x="107" y="74" width="11" height="22"/></g><rect x="50" y="22" width="13" height="13" fill="${eye}"/><rect x="88" y="22" width="13" height="13" fill="${eye}"/></svg>`;

export class Hud {
  constructor(root) {
    root.insertAdjacentHTML('beforeend', `
<div id="hud" class="hidden">
  <div class="topbar">
    <div class="chip coins"><span class="ico">${COIN_SVG}</span><b class="n">0</b></div>
    <div class="chip book"><span class="ico clawd">${CLAWD_SVG()}</span><b class="n">0</b></div>
  </div>
  <div class="fever hidden"><b data-i18n="hud.fever">${t('hud.fever')}</b><i><span></span></i></div>
  <div class="refill hidden"></div>
  <div class="pops"></div>
  <div class="banner hidden"><b class="big"></b><small class="sub"></small></div>
  <div class="toast hidden"></div>
  <div class="touch-hint" data-i18n="hint.touch">${t('hint.touch')}</div>
  <div class="hints">
    <span><i data-glyph="aim"></i><b data-i18n="hint.aim">${t('hint.aim')}</b></span>
    <span><i data-glyph="drop"></i><b data-i18n="hint.drop">${t('hint.drop')}</b></span>
    <span><i data-glyph="pause"></i><b data-i18n="howto.pause">${t('howto.pause')}</b></span>
  </div>
</div>`);
    this.el = root.querySelector('#hud');
    this.coinEl = this.el.querySelector('.coins .n');
    this.coinChip = this.el.querySelector('.coins');
    this.bookEl = this.el.querySelector('.book .n');
    this.refillEl = this.el.querySelector('.refill');
    this.feverEl = this.el.querySelector('.fever');
    this.feverBar = this.feverEl.querySelector('span');
    this.popsEl = this.el.querySelector('.pops');
    this.bannerEl = this.el.querySelector('.banner');
    this.toastEl = this.el.querySelector('.toast');
    this.coins = 0;       // 表示している数（本当の数へ少しずつ近づける）
    this.target = 0;
    this.bump = 0;
    this.pops = [];       // { el, t }
    this.bannerT = 0;
    this.bannerDur = 0;
    this.toastT = 0;
    this.book = [0, 0];
    onLangChange(() => this.setBook(...this.book));
  }

  show(on) { this.el.classList.toggle('hidden', !on); }

  /** 持っているコイン。instant でなければ、数が転がるように増える。 */
  setCoins(n, instant = false) {
    if (n > this.target && !instant) this.bump = 1;
    this.target = n;
    if (instant || n < this.coins) { this.coins = n; this.coinEl.textContent = String(n); }
  }

  setBook(n, total) {
    this.book = [n, total];
    this.bookEl.textContent = `${n}/${total}`;
  }

  /** コインの横に「+3」などを浮かべる。 */
  pop(text, cls = '') {
    const el = document.createElement('div');
    el.className = 'pop ' + cls;
    el.textContent = text;
    this.popsEl.append(el);
    this.pops.push({ el, t: 0 });
    if (this.pops.length > 8) { this.pops[0].el.remove(); this.pops.shift(); }
  }

  /** 画面の真ん中の大きな知らせ（JACKPOT など）。 */
  banner(big, sub = '', { dur = 2.4, cls = '' } = {}) {
    this.bannerEl.className = 'banner ' + cls;
    this.bannerEl.querySelector('.big').textContent = big;
    this.bannerEl.querySelector('.sub').textContent = sub;
    this.bannerT = 0;
    this.bannerDur = dur;
  }

  toast(text, dur = 2.2) {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    this.toastT = dur;
  }

  /** フィーバーの残り（1〜0）。0 で隠す。 */
  setFever(k) {
    this.feverEl.classList.toggle('hidden', !(k > 0));
    if (k > 0) this.feverBar.style.width = (k * 100).toFixed(1) + '%';
  }

  setRefill(text) {
    this.refillEl.classList.toggle('hidden', !text);
    if (text && this.refillEl.textContent !== text) this.refillEl.textContent = text;
  }

  update(dt) {
    // コインの数を転がす
    if (this.coins < this.target) {
      const step = Math.max(1, Math.ceil((this.target - this.coins) * Math.min(1, dt * 10)));
      this.coins = Math.min(this.target, this.coins + step);
      this.coinEl.textContent = String(this.coins);
    }
    this.bump = Math.max(0, this.bump - dt * 4);
    this.coinChip.style.transform = this.bump > 0 ? `scale(${1 + this.bump * 0.12})` : '';
    // 浮かぶ数字
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      const k = p.t / 1.1;
      if (k >= 1) { p.el.remove(); this.pops.splice(i, 1); continue; }
      p.el.style.transform = `translateY(${-k * 36}px)`;
      p.el.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
    }
    // 帯
    if (this.bannerDur > 0) {
      this.bannerT += dt;
      const k = this.bannerT, d = this.bannerDur;
      if (k >= d) { this.bannerDur = 0; this.bannerEl.classList.add('hidden'); }
      else {
        this.bannerEl.classList.remove('hidden');
        const inK = Math.min(1, k / 0.18), outK = Math.min(1, Math.max(0, (d - k) / 0.3));
        const s = 0.6 + 0.4 * (1 - Math.pow(1 - inK, 3)) + (inK >= 1 ? Math.sin(Math.min(1, (k - 0.18) / 0.25) * Math.PI) * 0.06 : 0);
        this.bannerEl.style.transform = `translate(-50%, -50%) scale(${s})`;
        this.bannerEl.style.opacity = String(Math.min(inK, outK));
      }
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      this.toastEl.style.opacity = String(Math.min(1, this.toastT / 0.3));
      if (this.toastT <= 0) this.toastEl.classList.add('hidden');
    }
  }
}
