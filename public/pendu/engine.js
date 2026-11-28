// The pendu: the choice of a word, the letters, a word proposed, the hint and the check of a save. No DOM, so
// the page and the tests run the same code. Load words.js first.
//
// A game G: { level, word: 'râteau' as the list writes it, theme: 'Au jardin', tried: the letters clicked, in
//   order, as capitals without accents, given: the letters shown at the start, wrong: the words proposed that were
//   not the word, as keys, result: '' | 'won' | 'lost' }.
// A letter is typed or clicked without its accent: E finds É, È, Ê and Ë, C finds Ç. The hyphen of a word such as
// « arc-en-ciel » is shown from the start.
// No drawing of a hanged man: each wrong letter or wrong word makes a petal fall from a daisy, and the game is lost
// when the last petal falls.
(function (root) {
  'use strict';
  // The key 'fort' shows as "Difficile" (lib/kit.js). lives: the petals of the daisy. first: the first letter is
  // shown at the start, everywhere it is in the word.
  const LEVELS = {
    facile: { lives: 10, first: true },
    moyen: { lives: 8, first: false },
    fort: { lives: 6, first: false },
  };
  const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  // The letters of French text, the most frequent first: the order a player who knows nothing would try.
  const FRENCH = 'EASIRNTOULDCMPGBVHFQYXJKWZ';

  // A word as the game compares it: capitals without accents, the hyphen kept. « Crème » becomes CREME.
  const key = word => String(word).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  // A word as the tiles and the messages write it: capitals with their accents.
  const caps = word => String(word).toLocaleUpperCase('fr-FR');
  const lettersOf = word => new Set([...key(word)].filter(c => c !== '-'));

  // The word list (words.js): per level, per theme, words with their frequency, from the most common to the rarest.
  let banks = null;
  function bank(level) {
    if (!banks) {
      banks = {};
      for (const [lv, themes] of Object.entries(root.PenduWords)) {
        banks[lv] = [];
        for (const [theme, list] of Object.entries(themes))
          for (const item of list.split(' ')) {
            const m = /^(.+?)(\d+)$/.exec(item);
            banks[lv].push({ word: m[1], theme, zipf: +m[2] / 10, key: key(m[1]) });
          }
      }
    }
    return banks[LEVELS[level] ? level : 'facile'];
  }

  // A small seeded random source (mulberry32), so a seed always gives the same word.
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A new word of the level, never one of used (the keys of the words already played at this level). When every
  // word of the level was played, used starts again: the caller then keeps only the new word.
  function newGame(level, seed, used = []) {
    if (!LEVELS[level]) level = 'facile';
    const rnd = random(seed), all = bank(level), seen = new Set(used);
    let pool = all.filter(w => !seen.has(w.key));
    const fresh = pool.length > 0;
    if (!fresh) pool = all;
    const w = pool[Math.floor(rnd() * pool.length)];
    const given = LEVELS[level].first ? [w.key[0]] : [];
    return { level, word: w.word, theme: w.theme, tried: [...given], given, wrong: [], result: '', fresh };
  }

  const inWord = (G, L) => key(G.word).includes(L);
  const misses = G => G.tried.filter(L => !inWord(G, L)).length + G.wrong.length;
  const lives = G => LEVELS[G.level].lives - misses(G);
  // Every letter of the word is found.
  const solved = G => [...lettersOf(G.word)].every(L => G.tried.includes(L));
  // The word as the tiles show it: each letter, or null while it is hidden. The hyphen always shows.
  function shown(G) {
    const k = key(G.word), w = caps(G.word);
    return [...k].map((c, i) => c === '-' || G.tried.includes(c) || G.result ? w[i] : null);
  }
  const count = (G, L) => [...key(G.word)].filter(c => c === L).length;

  // A letter clicked or typed. kind: 'hit' (n times in the word), 'miss' (a petal falls), 'again' (already tried),
  // 'over' (the game is finished), 'bad' (not a letter).
  function guess(G, letter) {
    const L = key(letter);
    if (G.result) return { G, kind: 'over' };
    if (!/^[A-Z]$/.test(L)) return { G, kind: 'bad' };
    if (G.tried.includes(L)) return { G, kind: 'again', L, n: count(G, L) };
    const g = { ...G, tried: [...G.tried, L] };
    const n = count(g, L);
    if (n && solved(g)) g.result = 'won';
    else if (!n && lives(g) <= 0) g.result = 'lost';
    return { G: g, kind: n ? 'hit' : 'miss', L, n };
  }

  // A word proposed in full. kind: 'won', 'miss' (a petal falls), 'length' (not the length of the word: refused,
  // without a petal, as a slip of the keyboard), 'empty', 'again' (proposed before), 'over'. Accents, capitals,
  // spaces and hyphens do not count: « arc en ciel » finds ARC-EN-CIEL.
  const bare = s => key(s).replace(/[^A-Z]/g, '');
  function propose(G, text) {
    if (G.result) return { G, kind: 'over' };
    const t = bare(text), w = bare(G.word);
    if (!t) return { G, kind: 'empty' };
    if (t.length !== w.length) return { G, kind: 'length', length: w.length, typed: t.length };
    if (t === w) return { G: { ...G, result: 'won', tried: [...G.tried, ...[...lettersOf(G.word)].filter(L => !G.tried.includes(L))] }, kind: 'won', found: true };
    if (G.wrong.includes(t)) return { G, kind: 'again', text: t };
    const g = { ...G, wrong: [...G.wrong, t] };
    if (lives(g) <= 0) g.result = 'lost';
    return { G: g, kind: 'miss', text: t };
  }

  // The words of the level and of the theme that still fit what he sees: the same letters in the same places,
  // the same hyphens, none of the letters that missed, no other place for a letter found, and not a word he
  // proposed. The word itself is always one of them.
  function candidates(G) {
    const k = key(G.word), tried = new Set(G.tried), wrong = new Set(G.wrong);
    const pattern = [...k].map(c => c === '-' || tried.has(c) ? c : null);
    return bank(G.level).filter(w => {
      if (w.theme !== G.theme || w.key.length !== k.length || wrong.has(w.key.replace(/-/g, ''))) return false;
      for (let i = 0; i < k.length; i++) {
        const c = w.key[i], p = pattern[i];
        if (p !== null ? c !== p : (c === '-' || tried.has(c))) return false;
      }
      return true;
    });
  }

  // "Que jouer maintenant ?": the letter not yet tried that the most words still possible contain; between two,
  // the more frequent in French. n: the words still possible, has: how many of them contain the letter.
  function hint(G) {
    if (G.result) return null;
    const list = candidates(G), tried = new Set(G.tried);
    let best = null;
    for (const L of FRENCH) {
      if (tried.has(L)) continue;
      const has = list.filter(w => w.key.includes(L)).length;
      if (!best || has > best.has) best = { letter: L, has };
    }
    return best && { ...best, n: list.length };
  }

  // A save read back must be a game this file could have made: a word of the list, letters, and a result that
  // matches them.
  function valid(G) {
    if (!G || typeof G !== 'object' || !LEVELS[G.level] || typeof G.word !== 'string' || typeof G.theme !== 'string') return false;
    if (!bank(G.level).some(w => w.word === G.word && w.theme === G.theme)) return false;
    if (!Array.isArray(G.tried) || !G.tried.every(L => typeof L === 'string' && /^[A-Z]$/.test(L)) || new Set(G.tried).size !== G.tried.length) return false;
    if (!Array.isArray(G.given) || !G.given.every(L => G.tried.includes(L))) return false;
    if (!Array.isArray(G.wrong) || !G.wrong.every(t => typeof t === 'string' && /^[A-Z]+$/.test(t))) return false;
    const won = solved(G), lost = lives(G) <= 0;
    if (G.result === 'won') return won;
    if (G.result === 'lost') return lost;
    return G.result === '' && !won && !lost;
  }
  // A save without a known level is a Facile game.
  const withLevel = G => G && typeof G === 'object' && !LEVELS[G.level] ? { ...G, level: 'facile' } : G;

  root.Pendu = { LEVELS, ALPHABET, FRENCH, key, caps, bank, random, newGame, guess, propose, candidates, hint, shown,
    misses, lives, solved, count, valid, withLevel, lettersOf };
})(typeof window !== 'undefined' ? window : globalThis);
