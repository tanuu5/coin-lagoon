// 景品（フェルトの Clawd）の種類と出やすさ。名前は i18n の prize.<id>。
// rarity：1 よく出る 〜 5 めったに出ない。weight：抽選の重み。acc：つける小物（view/ClawdFelt.js が作る）
export const VARIANTS = [
  { id: 'classic', color: '#C67D5F', thread: '#fff1dc', rarity: 1, weight: 26 },
  { id: 'lagoon', color: '#38bfc4', thread: '#ffffff', rarity: 1, weight: 20 },
  { id: 'coconut', color: '#7b5236', thread: '#f6e3c4', rarity: 1, weight: 18 },
  { id: 'hibiscus', color: '#C67D5F', thread: '#fff1dc', acc: ['hibiscus'], rarity: 2, weight: 13 },
  { id: 'mango', color: '#f2892a', thread: '#fff6d8', rarity: 2, weight: 11 },
  { id: 'shades', color: '#C67D5F', thread: '#fff1dc', acc: ['shades'], rarity: 2, weight: 9 },
  { id: 'lei', color: '#f29db6', thread: '#ffffff', acc: ['lei'], rarity: 3, weight: 6 },
  { id: 'strawhat', color: '#C67D5F', thread: '#fff1dc', acc: ['strawhat'], rarity: 3, weight: 5 },
  { id: 'night', color: '#2c3b78', thread: '#ffd75a', acc: ['stars'], rarity: 4, weight: 2.5 },
  { id: 'golden', color: '#e2ad2e', thread: '#fff6c8', gold: true, rarity: 5, weight: 1 },
];
export const VARIANT = Object.fromEntries(VARIANTS.map((v) => [v.id, v]));

/** 重みで 1 つ選ぶ。have（持っている種類）を渡すと、NEW_BIAS の割合でまだ持っていない種類から選ぶ（集めきれずに飽きないように）。 */
export const NEW_BIAS = 0.35;
export function pickVariant(have = null, rnd = Math.random) {
  let list = VARIANTS;
  if (have) {
    const fresh = VARIANTS.filter((v) => !have[v.id]);
    if (fresh.length && rnd() < NEW_BIAS) list = fresh;
  }
  const total = list.reduce((s, v) => s + v.weight, 0);
  let x = rnd() * total;
  for (const v of list) { x -= v.weight; if (x <= 0) return v.id; }
  return list[0].id;
}
