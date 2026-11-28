// The pendu without a browser: the word list, the letters with and without accents, a word proposed, the
// petals, the hint, no word twice, the check of a save, and that each level is harder than the one below.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/pendu/words.js');
require('../public/pendu/engine.js');
const P = globalThis.Pendu, W = globalThis.PenduWords;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };
const LV = ['facile', 'moyen', 'fort'];
const avg = a => a.reduce((s, x) => s + x, 0) / a.length;
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const letters = w => w.key.replace(/-/g, '');
const game = (level, word) => {
  const w = P.bank(level).find(x => x.word === word);
  if (!w) throw new Error('no word ' + word + ' at ' + level);
  const given = P.LEVELS[level].first ? [w.key[0]] : [];
  return { level, word: w.word, theme: w.theme, tried: [...given], given, wrong: [], result: '' };
};
const play = (G, list) => { for (const L of list) G = P.guess(G, L).G; return G; };

// 1. The word list: thousands of words, in themes, plain French words written with their accents.
{
  const all = LV.flatMap(lv => P.bank(lv));
  ok(all.length >= 3000, `${all.length} words in all`);
  for (const lv of LV) ok(P.bank(lv).length >= 800, `${lv}: ${P.bank(lv).length} words`);
  const themes = new Set(all.map(w => w.theme));
  ok(themes.size >= 30, `${themes.size} themes, each word with its theme`);
  const bad = all.filter(w => !/^[a-zàâäçéèêëîïôöùûüÿ]+(-[a-zàâäçéèêëîïôöùûüÿ]+)*$/.test(w.word) || !/^[A-Z]+(-[A-Z]+)*$/.test(w.key));
  ok(!bad.length, 'each word is lower case letters, with accents and hyphens only: no apostrophe, space, capital or ligature', bad.map(w => w.word).join(' '));
  const keys = all.map(w => letters(w));
  ok(new Set(keys).size === keys.length, 'no word comes twice, in any level or theme', keys.filter((k, i) => keys.indexOf(k) !== i).join(' '));
  const BLOCKED = ['mort', 'tuer', 'sang', 'cercueil', 'tombe', 'cancer', 'maladie', 'pendu', 'potence', 'corde-raide', 'guerre', 'fusil', 'merde', 'con', 'cul', 'pute', 'vieillard', 'hôpital', 'chirurgien'];
  ok(!all.some(w => BLOCKED.includes(w.word)), 'no sad, rude or medical word');
  ok(all.every(w => w.zipf >= 1 && w.zipf <= 8), 'each word carries its frequency');
  for (const lv of LV) {
    const ordered = Object.values(W[lv]).every(list => { const z = list.split(' ').map(x => +x.match(/\d+$/)[0]); return z.every((v, i) => !i || v <= z[i - 1]); });
    ok(ordered, `${lv}: in each theme the words go from the most common to the rarest`);
  }
}

// 2. The levels: Facile has short frequent words, Moyen longer and rarer ones, Difficile the longest, the rarest
// and the rare letters; and fewer petals at each level.
{
  const L = Object.fromEntries(LV.map(lv => [lv, P.bank(lv)]));
  ok(L.facile.every(w => w.key.length >= 5 && w.key.length <= 7 && !/[KWYZ-]/.test(w.key)), 'Facile: words of 5 to 7 letters, no K, W, Y, Z or hyphen');
  ok(L.moyen.every(w => letters(w).length >= 6 && letters(w).length <= 9), 'Moyen: words of 6 to 9 letters');
  ok(L.fort.every(w => letters(w).length >= 6), 'Difficile: words of 6 letters or more');
  const len = Object.fromEntries(LV.map(lv => [lv, avg(L[lv].map(w => letters(w).length))]));
  ok(len.facile < len.moyen && len.moyen < len.fort, `the words get longer: ${LV.map(lv => len[lv].toFixed(2)).join(', ')} letters on average`);
  const z = Object.fromEntries(LV.map(lv => [lv, median(L[lv].map(w => w.zipf))]));
  ok(z.facile > z.moyen && z.moyen > z.fort, `the words get rarer: median frequency ${LV.map(lv => z[lv].toFixed(1)).join(', ')} (Zipf)`);
  const rare = Object.fromEntries(LV.map(lv => [lv, L[lv].filter(w => /[KWYZ]/.test(w.key)).length / L[lv].length]));
  ok(rare.facile === 0 && rare.moyen < rare.fort && rare.fort > .05, `the rare letters K, W, Y, Z: ${LV.map(lv => (rare[lv] * 100).toFixed(1) + ' %').join(', ')} of the words`);
  ok(P.LEVELS.facile.lives > P.LEVELS.moyen.lives && P.LEVELS.moyen.lives > P.LEVELS.fort.lives, `fewer petals: ${LV.map(lv => P.LEVELS[lv].lives).join(', ')}`);
  ok(P.LEVELS.facile.first && !P.LEVELS.moyen.first && !P.LEVELS.fort.first, 'only Facile shows the first letter');
  // A player who knows nothing tries the letters in the order of their frequency in French. He needs more misses
  // to find a word at each level, and with fewer petals he finds fewer words.
  const naive = lv => {
    let wins = 0, misses = 0;
    for (const w of L[lv]) {
      const word = new Set(letters(w)), tried = new Set(P.LEVELS[lv].first ? [w.key[0]] : []);
      let m = 0;
      for (const c of P.FRENCH) { if ([...word].every(x => tried.has(x))) break; if (tried.has(c)) continue; tried.add(c); if (!word.has(c)) m++; }
      misses += m;
      let G = game(lv, w.word);
      for (const c of P.FRENCH) { if (G.result) break; if (!G.tried.includes(c)) G = P.guess(G, c).G; }
      if (G.result === 'won') wins++;
    }
    return { misses: misses / L[lv].length, wins: wins / L[lv].length };
  };
  const N = Object.fromEntries(LV.map(lv => [lv, naive(lv)]));
  ok(N.facile.misses < N.moyen.misses && N.moyen.misses < N.fort.misses, `a player who tries the letters in order misses more at each level: ${LV.map(lv => N[lv].misses.toFixed(2)).join(', ')} misses a word`);
  ok(N.facile.wins > N.moyen.wins + .15 && N.moyen.wins > N.fort.wins + .1, `and finds fewer words: ${LV.map(lv => (N[lv].wins * 100).toFixed(0) + ' %').join(', ')}`);
  // The same player with the petals of each level, measured on the same words: the petals alone make a level harder.
  const sameWords = lv => { let wins = 0; for (const w of L.moyen) { let G = { ...game('moyen', w.word), level: lv, tried: [], given: [] }; for (const c of P.FRENCH) { if (G.result) break; if (!G.tried.includes(c)) G = P.guess(G, c).G; } if (G.result === 'won') wins++; } return wins / L.moyen.length; };
  const S = LV.map(sameWords);
  ok(S[0] > S[1] && S[1] > S[2], `on the same words, 10, 8 and 6 petals let him find ${S.map(s => (s * 100).toFixed(0) + ' %').join(', ')}`);
}

// 3. The letters: E finds É, È, Ê, C finds Ç; the hyphen shows from the start; a letter tried twice costs nothing.
{
  let G = game('facile', 'crème');
  ok(G.tried.join('') === 'C' && P.shown(G).join('') === ['C', null, null, null, null].join(''), 'Facile shows the first letter');
  let r = P.guess(G, 'e');
  ok(r.kind === 'hit' && r.n === 2 && P.shown(r.G)[2] === 'È' && P.shown(r.G)[4] === 'E', 'E finds È and E, written with their accents');
  r = P.guess(r.G, 'é');
  ok(r.kind === 'again' && P.misses(r.G) === 0, 'a letter typed again, with or without its accent, costs nothing');
  const fr = P.bank('facile').find(w => w.word.includes('ç'));
  if (fr) { const g = P.guess({ ...game('facile', fr.word), tried: [], given: [] }, 'C'); ok(g.kind === 'hit' && P.shown(g.G).includes('Ç'), `C finds Ç in ${fr.word}`); }
  const hy = [...P.bank('moyen'), ...P.bank('fort')].find(w => w.word.includes('-'));
  const H = game(P.bank('moyen').includes(hy) ? 'moyen' : 'fort', hy.word);
  ok(P.shown(H).filter(c => c === '-').length === (hy.word.match(/-/g) || []).length, `the hyphens of ${hy.word.toUpperCase()} show from the start`);
  ok(P.guess(G, '7').kind === 'bad' && P.guess(G, '-').kind === 'bad', 'only a letter is tried');
}

// 4. The petals: each miss takes one; the last one ends the word; finding every letter wins.
{
  let G = game('fort', P.bank('fort')[0].word);
  const absent = P.FRENCH.split('').filter(c => !G.word.toUpperCase().normalize('NFD').includes(c));
  for (let k = 0; k < 5; k++) G = P.guess(G, absent[k]).G;
  ok(P.lives(G) === 1 && !G.result, 'Difficile: five misses leave one petal');
  const r = P.guess(G, absent[5]);
  ok(r.kind === 'miss' && r.G.result === 'lost' && P.lives(r.G) === 0, 'the sixth miss makes the last petal fall: the word is lost');
  ok(P.shown(r.G).every(c => c !== null), 'a lost word shows all its letters');
  ok(P.guess(r.G, 'E').kind === 'over', 'a finished word takes no more letters');
  let F = game('facile', 'tomate');
  F = play(F, ['O', 'M', 'A', 'E']);
  ok(F.result === 'won' && P.misses(F) === 0, 'finding every letter wins');
}

// 5. A word proposed: accents, capitals, spaces and hyphens do not count; a wrong length is refused without a
// petal; a wrong word costs one petal, once.
{
  let G = game('moyen', P.bank('moyen').find(w => /é/.test(w.word)).word);
  const plain = G.word.normalize('NFD').replace(/[̀-ͯ]/g, '');
  ok(P.propose(G, plain.toUpperCase()).kind === 'won' && P.propose(G, ' ' + plain + ' ').G.result === 'won', `« ${plain.toUpperCase()} » finds ${G.word.toUpperCase()}`);
  const len = P.propose(G, plain + 'x');
  ok(len.kind === 'length' && P.misses(len.G) === 0, 'a word of another length is refused, without a petal');
  ok(P.propose(G, '').kind === 'empty', 'an empty word is refused');
  const other = P.bank('moyen').find(w => letters(w).length === letters(P.bank('moyen').find(x => x.word === G.word)).length && w.word !== G.word);
  const m = P.propose(G, other.word);
  ok(m.kind === 'miss' && P.misses(m.G) === 1, 'a wrong word costs one petal');
  ok(P.propose(m.G, other.word.toUpperCase()).kind === 'again' && P.misses(P.propose(m.G, other.word).G) === 1, 'the same wrong word again costs nothing more');
  const hy = P.bank('fort').find(w => w.word === 'arc-en-ciel') || P.bank('moyen').find(w => w.word === 'arc-en-ciel');
  if (hy) ok(P.propose(game(P.bank('fort').includes(hy) ? 'fort' : 'moyen', 'arc-en-ciel'), 'arc en ciel').kind === 'won', '« arc en ciel » finds ARC-EN-CIEL');
  const won = P.propose(G, plain).G;
  ok(P.solved(won) && P.valid(won), 'a word found by proposing it shows all its letters, and saves');
}

// 6. The hint: an untried letter, in the most words still possible of the theme; the word is always possible.
{
  let always = true, bestLetter = true, wins = Object.fromEntries(LV.map(lv => [lv, 0])), counted = 0;
  for (const lv of LV) for (const w of P.bank(lv).filter((x, i) => i % 7 === 0)) {
    let G = game(lv, w.word);
    while (!G.result) {
      const c = P.candidates(G), h = P.hint(G);
      if (!c.some(x => x.word === G.word)) always = false;
      if (G.tried.includes(h.letter)) bestLetter = false;
      const best = Math.max(...P.FRENCH.split('').filter(L => !G.tried.includes(L)).map(L => c.filter(x => x.key.includes(L)).length));
      if (h.has !== best || h.n !== c.length) bestLetter = false;
      G = P.guess(G, h.letter).G;
    }
    counted++;
    if (G.result === 'won') wins[lv]++;
  }
  ok(always, 'the word is always among the words still possible');
  ok(bestLetter, 'the hint gives an untried letter that the most words still possible contain');
  ok(LV.every(lv => wins[lv] > 0) && Object.values(wins).reduce((a, b) => a + b) / counted > .98, `following the hint wins ${(Object.values(wins).reduce((a, b) => a + b) / counted * 100).toFixed(1)} % of ${counted} words`);
  const G = game('facile', 'tomate');
  ok(P.candidates(G).every(w => w.theme === G.theme && w.key.length === 6 && w.key[0] === 'T'), 'the words still possible share the theme, the length and the letters shown');
}

// 7. No word twice until the level has none left.
{
  for (const lv of LV) {
    const used = [], n = P.bank(lv).length;
    let twice = false, all = true;
    for (let k = 0; k < n; k++) {
      const G = P.newGame(lv, 1000 + k, used);
      if (!G.fresh) all = false;
      const key = P.key(G.word);
      if (used.includes(key)) twice = true;
      used.push(key);
    }
    const next = P.newGame(lv, 5, used);
    ok(!twice && all && new Set(used).size === n && next.fresh === false, `${lv}: the ${n} words come once each, then the list starts again`);
  }
  ok(JSON.stringify(P.newGame('moyen', 77)) === JSON.stringify(P.newGame('moyen', 77)), 'a seed always gives the same word');
  ok(P.newGame('expert', 3).level === 'facile', 'an unknown level makes a Facile word');
}

// 8. Saves: a real game loads, a broken one does not.
{
  const G = play(game('moyen', P.bank('moyen')[3].word), ['E', 'Z']);
  ok(P.valid(G), 'a game in progress is valid');
  ok(!P.valid({ ...G, word: 'zzzzzz' }), 'a word not in the list is refused');
  ok(!P.valid({ ...G, tried: ['E', 'E'] }), 'a letter twice is refused');
  ok(!P.valid({ ...G, result: 'won' }), 'a win without the letters is refused');
  ok(!P.valid({ ...G, tried: ['é'] }), 'a letter with an accent in a save is refused');
  ok(!P.valid(null) && !P.valid('x'), 'no game is refused');
  const { level, ...noLevel } = game('facile', 'tomate');
  ok(P.withLevel(noLevel).level === 'facile' && P.valid(P.withLevel(noLevel)), 'a save without its level is a Facile game');
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
