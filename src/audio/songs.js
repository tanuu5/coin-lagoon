// 曲のデータ（書き方は sequencer.js の先頭）。南の島の 3 曲：タイトル・遊んでいるとき・サンセットフィーバー。
// 楽器はスチールパン（steel）・ウクレレ（uke）・マリンバ・やわらかいベース・シェイカー・コンガ（synth.js）。
// 繰り返し聞く曲は 8 小節で、最後の小節（属和音）から最初の小節（主和音）へ戻る。

const U = (c, pat) => pat.replace(/x/g, c);  // 和音のきざみ：pat の x を和音に置きかえる

export const SONGS = {
  // ゆったりした島の朝（F – Dm – Bb – C）
  title: {
    id: 'title', bpm: 92, gain: 0.85,
    tracks: {
      steel: { inst: 'steel', vol: 0.75, pan: 0.1, bars: [
        'A5 - - G5 F5 - C5 - D5 - F5 - G5 - - .',
        'A5 - - . F5 - D5 - C5 - D5 - F5 - - .',
        'D6 - - C6 Bb5 - F5 - G5 - Bb5 - A5 - G5 -',
        'G5 - - - E5 - - - C5 - - - . . . .',
        'A5 - - G5 F5 - C5 - D5 - F5 - A5 - C6 -',
        'D6 - - C6 A5 - F5 - G5 - A5 - F5 - - .',
        'D5 - F5 - Bb5 - A5 - G5 - F5 - D5 - C5 -',
        'E5 - - - G5 - - - F5 - - - . . . .',
      ] },
      uke: { inst: 'uke', vol: 0.55, pan: -0.25, bars: [
        U('F4+A4+C5', 'x . . x . . x . x . x . x . . .'),
        U('D4+F4+A4', 'x . . x . . x . x . x . x . . .'),
        U('D4+F4+Bb4', 'x . . x . . x . x . x . x . . .'),
        U('E4+G4+C5', 'x . . x . . x . x . x . x . . .'),
      ] },
      bass: { inst: 'bassSoft', vol: 0.7, bars: [
        'F2 - - . . . C3 . F2 - - . A2 . C3 .',
        'D2 - - . . . A2 . D2 - - . F2 . A2 .',
        'Bb1 - - . . . F2 . Bb1 - - . D2 . F2 .',
        'C2 - - . . . G2 . C2 - - . E2 . G2 .',
      ] },
      perc: { inst: 'drums', vol: 0.7, bars: [
        { kick: 'x.......x.......', shaker: 'oxoxoxoxoxoxoxox', conga: '......x....x..x.' },
        { kick: 'x.......x.......', shaker: 'oxoxoxoxoxoxoxox', conga: '......x...x.x.x.' },
      ] },
    },
  },
  // 遊んでいるとき：明るいカリプソ（C – Am – F – G）。メロディは控えめ
  play: {
    id: 'play', bpm: 104, gain: 0.72,
    tracks: {
      steel: { inst: 'steel', vol: 0.55, pan: 0.15, bars: [
        'E5 - G5 - C6 - - - B5 - A5 - G5 - - -',
        'A5 - - - E5 - - - C5 - D5 - E5 - - -',
        'F5 - A5 - C6 - - - A5 - G5 - F5 - E5 -',
        'D5 - - - G5 - - - B4 - - - . . . .',
        'E5 - G5 - C6 - E6 - D6 - C6 - G5 - - -',
        'A5 - C6 - E6 - - - D6 - C6 - A5 - - -',
        'F5 - A5 - G5 - F5 - E5 - D5 - C5 - - -',
        'D5 - E5 - F5 - G5 - - - . . . . . .',
      ] },
      uke: { inst: 'uke', vol: 0.5, pan: -0.2, bars: [
        U('C4+E4+G4', '. . x . . . x . . . x . . . x .'),
        U('A3+C4+E4', '. . x . . . x . . . x . . . x .'),
        U('F3+A3+C4', '. . x . . . x . . . x . . . x .'),
        U('G3+B3+D4', '. . x . . . x . . . x . . x x .'),
      ] },
      marimba: { inst: 'marimba', vol: 0.3, pan: 0.3, bars: [
        'C5 . G4 . E5 . G4 . C5 . G4 . E5 . G4 .',
        'A4 . E4 . C5 . E4 . A4 . E4 . C5 . E4 .',
        'F4 . C5 . A4 . C5 . F4 . C5 . A4 . C5 .',
        'G4 . D5 . B4 . D5 . G4 . B4 . D5 . . .',
      ] },
      bass: { inst: 'bassSoft', vol: 0.75, bars: [
        'C2 . . C2 . . G2 . C2 . . C2 . . G2 .',
        'A1 . . A1 . . E2 . A1 . . A1 . . E2 .',
        'F1 . . F1 . . C2 . F1 . . F1 . . C2 .',
        'G1 . . G1 . . D2 . G1 . . G1 . . D2 .',
      ] },
      perc: { inst: 'drums', vol: 0.75, bars: [
        { kick: 'x.......x.......', conga: '......x....x..x.', shaker: 'xoxoxoxoxoxoxoxo' },
        { kick: 'x.......x.....x.', conga: '......x...x.x.x.', shaker: 'xoxoxoxoxoxoxoxo' },
      ] },
    },
  },
  // サンセットフィーバー：速いきざみと四つ打ち（F – G – Em – Am）
  fever: {
    id: 'fever', bpm: 128, gain: 0.8,
    tracks: {
      steel: { inst: 'steel', vol: 0.7, pan: 0.15, bars: [
        'A5 . C6 . A5 . C6 . F6 - - - E6 - C6 -',
        'B5 . D6 . B5 . D6 . G6 - - - F6 - D6 -',
        'G5 . B5 . E6 - - - D6 . B5 . G5 - E5 -',
        'A5 . C6 . E6 . A6 . G6 - E6 - C6 - B5 -',
      ] },
      uke: { inst: 'uke', vol: 0.5, pan: -0.2, bars: [
        U('F4+A4+C5', '. . x . . . x x . . x . . . x .'),
        U('G3+B3+D4', '. . x . . . x x . . x . . . x .'),
        U('E4+G4+B4', '. . x . . . x x . . x . . . x .'),
        U('A3+C4+E4', '. . x . . . x x . . x . . x x x'),
      ] },
      bass: { inst: 'bassSoft', vol: 0.8, bars: [
        'F2 . F2 . F2 . F2 . F2 . F2 . F2 . C3 .',
        'G2 . G2 . G2 . G2 . G2 . G2 . G2 . D3 .',
        'E2 . E2 . E2 . E2 . E2 . E2 . E2 . B2 .',
        'A2 . A2 . A2 . A2 . G2 . G2 . E2 . E2 .',
      ] },
      perc: { inst: 'drums', vol: 0.8, bars: [
        { kick: 'x...x...x...x...', snare: '....x.......x...', shaker: 'xxxxxxxxxxxxxxxx', conga: '..x...x...x..x.x' },
        { kick: 'x...x...x...x...', snare: '....x.......x..o', shaker: 'xxxxxxxxxxxxxxxx', conga: '..x...x...x.xx.x' },
      ] },
    },
  },
};
