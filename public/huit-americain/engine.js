// Rules of the huit américain for four players, and the computer players. No DOM: the page loads it
// with <script> and the tests load it in Node.
//
// A card is 0..51 as in lib/cards.js: suit = card / 13 (0 pique, 1 cœur, 2 carreau, 3 trèfle),
// rank = card % 13 + 1 (1 = as, 11 = valet, 12 = dame, 13 = roi).
// Seats: 0 the player (bottom), 1 left, 2 across, 3 right. dir 1 plays 0, 1, 2, 3 (the way of the
// hands of a clock, seen from above), dir -1 plays 0, 3, 2, 1.
//
// The rules:
//   - 7 cards each. One card turned up starts the défausse; a special card turned up goes back under
//     the pioche and the next one is turned. Each round, the next player starts.
//   - Play a card of the colour asked or of the same rank as the top card.
//   - The 8 goes on any card, and its player names the colour to play next.
//   - The as changes the way of play. The 2 makes the next player draw 2 cards and miss the turn.
//     The valet makes the next player miss the turn.
//   - A player with no card to play draws one. If it fits, the player may play it; else the turn passes.
//     A player who can play may not draw.
//   - An empty pioche takes back the défausse, shuffled, except its top card.
//   - The first player with no card left wins the round, at once. Each player then scores the cards
//     left in hand: 8 = 50, roi, dame, valet = 10, as = 1, the others their value.
//   - With nothing to draw, the turn passes. Every card but the top of the défausse is then in a hand,
//     8s too, so some player can always play.
//   - The game ends after a round where a total reaches 100. The lowest total wins; ties share the win.
//
// A game G, plain JSON so it can be saved:
//   v 1, round (from 0), scores [4] the totals before this round is scored, hands [4], stock (the
//   pioche, the next card to draw last), pile (the défausse, the top card last), suit (the colour to
//   play: the top card's, or the one named after an 8), dir, turn, phase 'play' | 'drawn' (the seat to
//   play drew a card that fits: it may play it or pass) | 'done' (the round is scored) | 'over' (the
//   game too), drawn (the card drawn in phase 'drawn'), rs (the state of the random stream for the shuffles), seed (for the computers' choices),
//   n (the number of actions so far in the round), last (what just happened, for the page),
//   voids [4][4] (a seat showed it held no card of that colour), roundPts [4], out (who emptied the
//   hand), result null or { winners, winner }.
//
//   HA.newGame(rnd)              a new game, round 0 dealt
//   HA.nextRound(G, rnd)         the next round, dealt
//   HA.legal(G)                  the cards the seat to play may play
//   HA.refusal(G, card)          why a card cannot be played now: 'turn', 'drawn', 'fit', or null
//   HA.canDraw(G)                true when the seat to play has no card that fits
//   HA.play(G, card, suit)       the game after the seat to play plays card (suit: the colour named for an 8)
//   HA.draw(G)                   the game after the seat to play draws
//   HA.pass(G)                   the game after the seat to play keeps the card drawn and passes
//   HA.choose(G, level, rnd)     what a computer does: { type: 'play', card, suit } | { type: 'draw' } | { type: 'pass' }
//   HA.bestSuit(hand, without)   the colour a hand holds most of, without the 8s and without one card
//   HA.apply(G, action)          the game after that action
//   HA.valid(G)                  true when a saved game holds together
(function factory(root) {
  'use strict';
  const HAND = 7;
  const suit = c => (c / 13) | 0;
  const rank = c => c % 13 + 1;
  const EIGHT = 8, ACE = 1, TWO = 2, JACK = 11;
  const special = c => { const r = rank(c); return r === EIGHT || r === ACE || r === TWO || r === JACK; };
  const points = c => { const r = rank(c); return r === EIGHT ? 50 : r > 10 ? 10 : r; };
  const handPoints = h => h.reduce((a, c) => a + points(c), 0);
  const sortHand = h => h.slice().sort((a, b) => suit(a) - suit(b) || rank(a) - rank(b));
  const clone = G => JSON.parse(JSON.stringify(G));
  const next = (G, seat) => (seat + G.dir + 4) % 4;
  const top = G => G.pile[G.pile.length - 1];

  // A random stream whose state lives in the game, so a reload or an undo shuffles the same way.
  function stream(G) {
    return () => {
      G.rs = (G.rs + 0x6D2B79F5) >>> 0;
      let t = G.rs;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const seeded = seed => stream({ rs: seed >>> 0 });
  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function deal(G, rnd) {
    G.rs = Math.floor(rnd() * 4294967296);
    G.seed = Math.floor(rnd() * 4294967296);
    const deck = shuffle([...Array(52).keys()], stream(G));
    G.hands = [0, 1, 2, 3].map(s => sortHand(deck.slice(s * HAND, s * HAND + HAND)));
    G.stock = deck.slice(4 * HAND);
    // The first card of the défausse is a plain one: a special card goes back under the pioche.
    let c = G.stock.pop();
    while (special(c)) { G.stock.unshift(c); c = G.stock.pop(); }
    G.pile = [c];
    G.suit = suit(c);
    G.dir = 1;
    G.turn = G.round % 4;
    G.phase = 'play';
    G.drawn = null; G.n = 0;
    G.last = { kind: 'deal', seat: null, card: c };
    G.voids = [0, 1, 2, 3].map(() => [false, false, false, false]);
    G.roundPts = null; G.out = null;
    return G;
  }
  function newGame(rnd = Math.random) {
    return deal({ v: 1, round: 0, scores: [0, 0, 0, 0], result: null }, rnd);
  }
  function nextRound(G, rnd = Math.random) {
    if (G.phase !== 'done') throw new Error('the round is not over');
    const g = clone(G);
    g.round++;
    return deal(g, rnd);
  }

  const fits = (G, c) => rank(c) === EIGHT || suit(c) === G.suit || rank(c) === rank(top(G));
  function refusal(G, card) {
    if (G.phase !== 'play' && G.phase !== 'drawn') return 'turn';
    if (!G.hands[G.turn].includes(card)) return 'turn';
    if (G.phase === 'drawn' && card !== G.drawn) return 'drawn';
    return fits(G, card) ? null : 'fit';
  }
  const legal = G => G.phase === 'play' || G.phase === 'drawn' ? G.hands[G.turn].filter(c => !refusal(G, c)) : [];
  const canDraw = G => G.phase === 'play' && !legal(G).length;

  // Takes up to n cards from the pioche for a seat. An empty pioche first takes back the défausse,
  // shuffled, except its top card. Returns the cards taken, and whether the défausse was shuffled in.
  function take(g, seat, n) {
    const got = [];
    let shuffled = false;
    for (let i = 0; i < n; i++) {
      if (!g.stock.length && g.pile.length > 1) {
        const t = g.pile.pop();
        g.stock = shuffle(g.pile, stream(g));
        g.pile = [t];
        shuffled = true;
      }
      if (!g.stock.length) break;
      got.push(g.stock.pop());
    }
    if (got.length) g.hands[seat] = sortHand(g.hands[seat].concat(got));
    return { got, shuffled };
  }

  function endRound(g, out) {
    g.out = out;
    g.roundPts = g.hands.map(handPoints);
    g.scores = g.scores.map((v, s) => v + g.roundPts[s]);
    g.phase = 'done';
    g.drawn = null;
    if (Math.max(...g.scores) >= 100) {
      const low = Math.min(...g.scores);
      const winners = g.scores.flatMap((v, s) => v === low ? [s] : []);
      g.phase = 'over';
      g.result = { winners, winner: winners.includes(0) ? 0 : winners[0] };
    }
  }

  // The actions change g in place: the fast path for the computer's look-ahead. The public ones copy.
  function playIn(g, card, chosen) {
    const seat = g.turn, hand = g.hands[seat];
    hand.splice(hand.indexOf(card), 1);
    g.pile.push(card);
    g.n++;
    g.drawn = null;
    g.voids[seat][suit(card)] = false;
    const r = rank(card);
    g.suit = r === EIGHT && [0, 1, 2, 3].includes(chosen) ? chosen : suit(card);
    const last = { kind: 'play', seat, card, suit: g.suit, effect: r === EIGHT ? 'eight' : null, victim: null, got: [], shuffled: false };
    g.last = last;
    if (!hand.length) { endRound(g, seat); return g; }
    g.phase = 'play';
    if (r === ACE) {
      g.dir = -g.dir;
      last.effect = 'ace';
      g.turn = next(g, seat);
    } else if (r === TWO || r === JACK) {
      const v = next(g, seat);
      last.effect = r === TWO ? 'two' : 'jack';
      last.victim = v;
      if (r === TWO) {
        const t = take(g, v, 2);
        g.voids[v] = [false, false, false, false];
        last.got = t.got; last.shuffled = t.shuffled;
      }
      g.turn = next(g, v);
    } else g.turn = next(g, seat);
    return g;
  }
  function drawIn(g) {
    const seat = g.turn;
    g.n++;
    // It had no card of the colour asked: the computers remember it.
    g.voids[seat][g.suit] = true;
    const t = take(g, seat, 1);
    const c = t.got[0];
    g.last = { kind: 'draw', seat, card: c ?? null, fits: false, shuffled: t.shuffled };
    if (c === undefined) {
      // Nothing to draw: the turn passes.
      g.last.kind = 'empty';
      g.turn = next(g, seat);
      return g;
    }
    if (fits(g, c)) { g.phase = 'drawn'; g.drawn = c; g.last.fits = true; }
    else g.turn = next(g, seat);
    return g;
  }
  function passIn(g) {
    const seat = g.turn;
    g.n++;
    g.phase = 'play'; g.drawn = null;
    g.last = { kind: 'pass', seat };
    g.turn = next(g, seat);
    return g;
  }

  function play(G, card, chosen) {
    if (refusal(G, card)) throw new Error('illegal card ' + card);
    return playIn(clone(G), card, chosen);
  }
  function draw(G) {
    if (!canDraw(G)) throw new Error('cannot draw');
    return drawIn(clone(G));
  }
  function pass(G) {
    if (G.phase !== 'drawn') throw new Error('nothing to pass');
    return passIn(clone(G));
  }

  /* ---------- The computer players ----------
     Each one sees only its own hand, the défausse, the number of cards of each player, the scores, and
     the colours a player showed it lacked by drawing.
     Facile plays any card that fits, at random, and names any colour after an 8.
     Moyen keeps its 8s for when nothing else fits, plays the colour it holds most of, and names it
     after an 8.
     Difficile also gets rid of its big cards first, and of its 8s once a player is about to go out. It
     counts the cards seen, names a colour the next player showed it lacks, and keeps its 2s, valets
     and as for the player about to go out. */

  // How many cards of a colour a hand holds, without the 8s and without one card.
  const count = (hand, s, without) => { let n = 0; for (const x of hand) if (x !== without && suit(x) === s && rank(x) !== EIGHT) n++; return n; };
  // The colour a hand holds most of, without the 8s; ties go to the first colour.
  function bestSuit(hand, without) {
    let s = 0;
    for (let k = 1; k < 4; k++) if (count(hand, k, without) > count(hand, s, without)) s = k;
    return s;
  }

  function easy(G, cards, rnd) {
    const c = cards[Math.floor(rnd() * cards.length)];
    return { type: 'play', card: c, suit: rank(c) === EIGHT ? Math.floor(rnd() * 4) : undefined };
  }

  function medium(G, cards) {
    const hand = G.hands[G.turn];
    let best = -1, most = -1;
    for (const c of cards) {
      if (rank(c) === EIGHT) continue;
      // The card after which it holds the most cards of the colour on the table.
      const left = count(hand, suit(c), c);
      if (left > most) { most = left; best = c; }
    }
    if (best < 0) return { type: 'play', card: cards[0], suit: bestSuit(hand, cards[0]) };
    return { type: 'play', card: best };
  }

  function hard(G, cards) {
    const seat = G.turn, hand = G.hands[seat];
    const sizes = G.hands.map(h => h.length);
    const nx = next(G, seat), back = (seat - G.dir + 4) % 4;
    // The fewest cards another player holds: 2 or less, and that player may go out soon.
    const danger = Math.min(...[0, 1, 2, 3].filter(s => s !== seat).map(s => sizes[s]));
    // The cards of each colour it has not seen yet.
    const seen = new Set([...hand, ...G.pile]);
    const out = [0, 0, 0, 0];
    for (let c = 0; c < 52; c++) if (!seen.has(c) && rank(c) !== EIGHT) out[suit(c)]++;
    // A colour is good to leave on the table when it holds many of it and the next player showed it
    // lacks it. Few cards of it still out break the ties.
    const value = (s, without) => count(hand, s, without) * 3 + (G.voids[nx][s] ? 2 : 0) - out[s] * .01;
    let best = null, bestKey = -Infinity;
    for (const c of cards) {
      const r = rank(c);
      let k, named;
      if (r === EIGHT) {
        let v = -Infinity;
        for (let s = 0; s < 4; s++) if (value(s, c) > v) { v = value(s, c); named = s; }
        // The 8 waits, unless the next player is about to go out: then its 50 points go.
        k = v - (danger <= 1 ? 0 : 100);
      } else {
        // Big cards first, and faster when a player is about to go out.
        k = value(suit(c), c) + points(c) * (danger <= 2 ? 1 : .5);
        // A 2 or a valet on a player about to go out.
        if ((r === TWO || r === JACK) && sizes[nx] <= 2) k += r === TWO ? 6 : 4;
        // The as turns the play away from a player about to go out, never towards one.
        if (r === ACE && sizes[nx] <= 2 && sizes[back] > sizes[nx]) k += 6;
        if (r === ACE && sizes[back] <= 2 && sizes[nx] > sizes[back]) k -= 6;
      }
      if (k > bestKey) { bestKey = k; best = { type: 'play', card: c, suit: named }; }
    }
    return best;
  }

  // A random stream for one decision, from the round's seed and the position.
  const decisionRnd = G => seeded((G.seed ^ Math.imul(G.n + 1, 0x9E3779B1) ^ Math.imul(G.turn + 7, 0x85EBCA77)) >>> 0);
  const LEVELS = { facile: 0, moyen: 1, fort: 2 };
  function choose(G, level, rnd = decisionRnd(G)) {
    const cards = legal(G);
    if (G.phase === 'play' && !cards.length) return { type: 'draw' };
    // After a draw that fits, the card drawn is the only legal card: every level plays it.
    if (level === 'fort') return hard(G, cards);
    if (level === 'facile') return easy(G, cards, rnd);
    return medium(G, cards);
  }

  // Plays one action chosen for the seat to play.
  function apply(G, a) {
    if (a.type === 'draw') return draw(G);
    if (a.type === 'pass') return pass(G);
    return play(G, a.card, a.suit);
  }

  // A saved game holds together: each card once, a known phase and seat, numbers where numbers go.
  function valid(G) {
    try {
      if (!G || typeof G !== 'object' || G.v !== 1) return false;
      if (!['play', 'drawn', 'done', 'over'].includes(G.phase)) return false;
      if (!Array.isArray(G.hands) || G.hands.length !== 4 || !G.hands.every(Array.isArray) || !Array.isArray(G.stock) || !Array.isArray(G.pile) || !G.pile.length) return false;
      const all = [...G.hands.flat(), ...G.stock, ...G.pile];
      if (all.length !== 52 || new Set(all).size !== 52 || !all.every(c => Number.isInteger(c) && c >= 0 && c < 52)) return false;
      if (![0, 1, 2, 3].includes(G.turn) || ![1, -1].includes(G.dir) || ![0, 1, 2, 3].includes(G.suit)) return false;
      if (!Array.isArray(G.scores) || G.scores.length !== 4 || !G.scores.every(Number.isFinite)) return false;
      if (!Number.isInteger(G.round) || G.round < 0 || !Number.isFinite(G.rs) || !Number.isFinite(G.seed)) return false;
      const seat = s => [0, 1, 2, 3].includes(s);
      // The card drawn is in the hand and fits, so the seat can play it.
      if (G.phase === 'drawn' && (!G.hands[G.turn].includes(G.drawn) || !fits(G, G.drawn))) return false;
      if ((G.phase === 'done' || G.phase === 'over') && (!Array.isArray(G.roundPts) || G.roundPts.length !== 4 || !G.roundPts.every(Number.isFinite))) return false;
      if ((G.phase === 'done' || G.phase === 'over') && !seat(G.out)) return false;
      if (G.phase === 'over' && (!G.result || !Array.isArray(G.result.winners) || !G.result.winners.length || !G.result.winners.every(seat) || !seat(G.result.winner))) return false;
      if ((G.phase === 'play' || G.phase === 'drawn') && !G.hands.every(h => h.length)) return false;
      // Fields a computer only reads: an old save without them gets them.
      if (!Array.isArray(G.voids) || G.voids.length !== 4 || !G.voids.every(v => Array.isArray(v) && v.length === 4))
        G.voids = [0, 1, 2, 3].map(() => [false, false, false, false]);
      if (!Number.isInteger(G.n)) G.n = 0;
      // What just happened only drives the page: one it cannot show is replaced by the deal.
      const e = G.last;
      if (!e || typeof e !== 'object' || !(e.seat === null || seat(e.seat)) || !(e.victim == null || seat(e.victim)) || !(e.got === undefined || Array.isArray(e.got)))
        G.last = { kind: 'deal', seat: null, card: top(G) };
      if (G.phase !== 'drawn') G.drawn = null;
      return true;
    } catch (e) { return false; }
  }

  const api = { HAND, suit, rank, points, handPoints, special, sortHand, seeded, newGame, nextRound, legal, refusal, canDraw,
    play, draw, pass, choose, bestSuit, apply, valid, next, top, LEVELS };
  root.HA = api;
})(typeof self !== 'undefined' ? self : globalThis);
