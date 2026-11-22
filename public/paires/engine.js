// The jeu des paires: the rules, the deal and the hint. No DOM, so the page and the tests run the same code.
//
// A game G: { level, cols, rows, cards: [picture id per place], found: string of 0/1 per place,
//   seen: string of 0/1 per place (turned up once in this game), up: the place of the card turned up
//   alone, or -1, turns: the pairs of cards turned, result: '' or 'won' }.
// flip(G, i) gives { G, event } where event is 'first', 'pair' or 'miss'. A miss turns both cards back:
// the page shows them for a moment from the event.
(function (root) {
  'use strict';
  // The pictures, with what the messages say about them: one, two, and the pair.
  const PICTURES = [
    ['coq', 'un coq', 'coqs'], ['vache', 'une vache', 'vaches'], ['cochon', 'un cochon', 'cochons'],
    ['chat', 'un chat', 'chats'], ['chien', 'un chien', 'chiens'], ['mouton', 'un mouton', 'moutons'],
    ['canard', 'un canard', 'canards'], ['lapin', 'un lapin', 'lapins'], ['tournesol', 'un tournesol', 'tournesols'],
    ['pomme', 'une pomme', 'pommes'], ['cerises', 'des cerises', 'cerises'], ['poire', 'une poire', 'poires'],
    ['carotte', 'une carotte', 'carottes'], ['tracteur', 'un tracteur', 'tracteurs'], ['arrosoir', 'un arrosoir', 'arrosoirs'],
  ].map(([id, one, many]) => ({ id, one, many }));
  // The key 'fort' shows as "Difficile" (lib/kit.js).
  const LEVELS = {
    facile: { cols: 4, rows: 3 },
    moyen: { cols: 5, rows: 4 },
    fort: { cols: 6, rows: 5 },
  };

  // A small seeded random source (mulberry32), so a seed always gives the same deal.
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
  function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function newGame(level, seed) {
    const L = LEVELS[level] || LEVELS.facile;
    const rnd = random(seed);
    const n = L.cols * L.rows / 2;
    const pics = shuffle(PICTURES.map((p, k) => k), rnd).slice(0, n);
    const cards = shuffle([...pics, ...pics], rnd);
    const zero = '0'.repeat(cards.length);
    return { level: LEVELS[level] ? level : 'facile', cols: L.cols, rows: L.rows, cards, found: zero, seen: zero, up: -1, turns: 0, result: '' };
  }

  const set = (s, i) => s.slice(0, i) + '1' + s.slice(i + 1);
  const pairs = G => [...G.found].filter(x => x === '1').length / 2;
  const total = G => G.cards.length / 2;

  // Why place i cannot be turned now, or '' when it can.
  function refusal(G, i) {
    if (G.result) return 'won';
    if (G.found[i] === '1') return 'found';
    if (G.up === i) return 'up';
    return '';
  }

  function flip(G, i) {
    if (refusal(G, i)) return null;
    const g = { ...G, seen: set(G.seen, i) };
    if (G.up < 0) return { G: { ...g, up: i }, event: 'first' };
    const a = G.up;
    g.up = -1; g.turns = G.turns + 1;
    if (G.cards[a] !== G.cards[i]) return { G: g, event: 'miss', a, b: i };
    g.found = set(set(G.found, a), i);
    if (pairs(g) === total(g)) g.result = 'won';
    return { G: g, event: 'pair', a, b: i };
  }

  // The hint uses only what he has seen.
  //   { kind: 'match', cells: [j] }       the card turned up has its twin at j, seen before
  //   { kind: 'known', cells: [a, b] }    two cards seen before make a pair
  //   { kind: 'new', cells: [j] }         turn a card not seen yet
  //   { kind: 'last', cells: [j] }        the card turned up has its twin among cards not seen yet: here is one
  function hint(G) {
    if (G.result) return null;
    const open = i => G.found[i] === '0';
    const seenAt = pic => G.cards.map((c, k) => k).filter(k => G.cards[k] === pic && open(k) && G.seen[k] === '1');
    const unseen = G.cards.map((c, k) => k).filter(k => open(k) && G.seen[k] === '0' && k !== G.up);
    if (G.up >= 0) {
      const twin = seenAt(G.cards[G.up]).filter(k => k !== G.up);
      if (twin.length) return { kind: 'match', cells: twin };
      return { kind: 'new', cells: unseen.slice(0, 1) };
    }
    for (let k = 0; k < G.cards.length; k++) {
      if (!open(k) || G.seen[k] === '0') continue;
      const both = seenAt(G.cards[k]);
      if (both.length === 2) return { kind: 'known', cells: both };
    }
    return { kind: 'new', cells: unseen.slice(0, 1) };
  }

  // A save without its level takes the level of its number of cards.
  function withLevel(G) {
    if (!G || typeof G !== 'object' || LEVELS[G.level] || !Array.isArray(G.cards)) return G;
    const key = Object.keys(LEVELS).find(k => LEVELS[k].cols * LEVELS[k].rows === G.cards.length);
    return key ? { ...G, level: key, cols: LEVELS[key].cols, rows: LEVELS[key].rows } : G;
  }

  // A save read back must be a game this file could have made.
  function valid(G) {
    const L = G && LEVELS[G.level];
    if (!L || G.cols !== L.cols || G.rows !== L.rows || !Array.isArray(G.cards) || G.cards.length !== L.cols * L.rows) return false;
    const count = {};
    for (const c of G.cards) {
      if (!Number.isInteger(c) || c < 0 || c >= PICTURES.length) return false;
      count[c] = (count[c] || 0) + 1;
    }
    if (Object.values(count).some(n => n !== 2)) return false;
    const bits = s => typeof s === 'string' && s.length === G.cards.length && /^[01]*$/.test(s);
    if (!bits(G.found) || !bits(G.seen)) return false;
    for (let k = 0; k < G.cards.length; k++) {
      if (G.found[k] === '1' && G.seen[k] === '0') return false;
      if (G.found[k] === '1' && G.found[G.cards.findIndex((c, j) => c === G.cards[k] && j !== k)] !== '1') return false;
    }
    if (!Number.isInteger(G.up) || G.up < -1 || G.up >= G.cards.length || (G.up >= 0 && (G.found[G.up] === '1' || G.seen[G.up] === '0'))) return false;
    if (!Number.isInteger(G.turns) || G.turns < pairs(G)) return false;
    // Each turn shows two cards, and the card up one more: no more cards can have been seen.
    const seen = [...G.seen].filter(x => x === '1').length;
    if (seen > 2 * G.turns + (G.up >= 0 ? 1 : 0)) return false;
    return G.result === (pairs(G) === total(G) ? 'won' : '');
  }

  root.Paires = { PICTURES, LEVELS, newGame, flip, hint, refusal, valid, withLevel, pairs, total, random };
})(typeof window !== 'undefined' ? window : globalThis);
