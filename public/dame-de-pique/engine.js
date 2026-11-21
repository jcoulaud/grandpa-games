// Rules of the dame de pique (Hearts) for four players, and the computer players. No DOM: the page
// loads it with <script> and the tests load it in Node.
//
// A card is 0..51 as in lib/cards.js: suit = card / 13 (0 pique, 1 cœur, 2 carreau, 3 trèfle),
// rank = card % 13 + 1 (1 = as). The as is the highest card of its suit.
// Seats: 0 the player (bottom), 1 left, 2 across, 3 right. Play goes to the left: 0, 1, 2, 3.
//
// A game G, plain JSON so it can be saved:
//   scores   [4] the totals before this hand
//   handNo   the hand number, from 0; it sets the pass: left, right, across, none
//   hands    [4] the cards each seat holds, sorted
//   phase    'pass' (choosing the 3 cards), 'play', 'done' (the hand is scored) or 'over'
//   gave     [4] the 3 cards each seat passed, or null before the pass or on a hand without pass
//   leader   the seat that led the trick in progress; turn: the seat to play
//   trick    the cards of the trick in progress, in order from the leader
//   tricks   the tricks done in this hand (0..13); broken: a heart has been played
//   pts      [4] the points taken in this hand
//   log      [[seat, card]] every card played in this hand, in order
//   voids    [4][4] voids[seat][suit]: the seat showed it has no card of that suit
//   only     [4] what a seat showed it holds only: 'points' (it threw a point card on the first trick),
//            'hearts' (it led a heart before hearts were broken), or null
//   seed     the seed of the computers' choices: the same position always gets the same answer,
//            so an undo followed by the same card replays the same game
//   last     the last trick done: { leader, cards, winner, pts }, or null
//   handPts  [4] the points scored by the hand once done, after the moon; moon: the seat that took
//            all 26 points, or null
//   qsTo     the seat that took the queen of spades in this hand, or null
//   result   null, or { winners, winner } at the end of the game: winners holds every seat with the
//            lowest score (they share the win); winner is the player (0) if he is one of them
//
//   DDP.newGame(rnd)                  a new game, hand 0 dealt
//   DDP.passTarget(G, seat)           the seat that receives this seat's cards, or null
//   DDP.doPass(G, picks)              the game after every seat passes picks[seat] (3 cards each)
//   DDP.legal(G)                      the cards the seat to play may play
//   DDP.refusal(G, card)              why a card in hand cannot be played: 'suit', 'first', 'hearts', or null
//   DDP.play(G, card)                 the game after the seat to play plays card
//   DDP.nextHand(G, rnd)              the next hand, dealt
//   DDP.choosePass(G, seat, level, rnd)  the 3 cards a computer passes
//   DDP.choosePlay(G, level, rnd)        the card a computer plays for the seat to play
(function factory(root) {
  'use strict';
  const QS = 11, TWO_CLUBS = 40, HEARTS = 1, SPADES = 0, CLUBS = 3;
  const suit = c => (c / 13) | 0;
  const power = c => { const r = c % 13 + 1; return r === 1 ? 14 : r; };
  const points = c => c === QS ? 13 : suit(c) === HEARTS ? 1 : 0;
  const isPoint = c => points(c) > 0;
  const sortHand = h => h.slice().sort((a, b) => suit(a) - suit(b) || power(a) - power(b));
  const PASS_OFFSET = [1, 3, 2, 0]; // left, right, across, none
  const clone = G => JSON.parse(JSON.stringify(G));

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function deal(G, rnd) {
    const deck = shuffle([...Array(52).keys()], rnd);
    G.hands = [0, 1, 2, 3].map(s => sortHand(deck.slice(s * 13, s * 13 + 13)));
    G.gave = null; G.trick = []; G.tricks = 0; G.broken = false; G.pts = [0, 0, 0, 0];
    G.log = []; G.voids = [0, 1, 2, 3].map(() => [false, false, false, false]); G.only = [null, null, null, null];
    G.seed = Math.floor(rnd() * 4294967296);
    G.last = null; G.handPts = null; G.moon = null; G.qsTo = null;
    if (PASS_OFFSET[G.handNo % 4]) G.phase = 'pass';
    else startPlay(G);
    return G;
  }
  function startPlay(G) {
    G.phase = 'play';
    G.leader = G.turn = G.hands.findIndex(h => h.includes(TWO_CLUBS));
  }

  function newGame(rnd = Math.random) {
    return deal({ v: 1, scores: [0, 0, 0, 0], handNo: 0, result: null }, rnd);
  }
  function nextHand(G, rnd = Math.random) {
    const g = clone(G);
    g.handNo++;
    return deal(g, rnd);
  }

  const passTarget = (G, seat) => { const o = PASS_OFFSET[G.handNo % 4]; return o ? (seat + o) % 4 : null; };
  // Every seat gives its 3 cards at the same time, so nobody passes on a card just received.
  function doPass(G, picks) {
    const g = clone(G);
    for (let s = 0; s < 4; s++) {
      const p = picks[s];
      if (!Array.isArray(p) || p.length !== 3 || new Set(p).size !== 3 || !p.every(c => G.hands[s].includes(c)))
        throw new Error('bad pass for seat ' + s);
    }
    for (let s = 0; s < 4; s++) g.hands[s] = g.hands[s].filter(c => !picks[s].includes(c));
    for (let s = 0; s < 4; s++) g.hands[passTarget(G, s)].push(...picks[s]);
    g.hands = g.hands.map(sortHand);
    g.gave = picks.map(p => p.slice());
    startPlay(g);
    return g;
  }

  // Why a card cannot be played, for the seat to play.
  function refusal(G, card) {
    const hand = G.hands[G.turn];
    if (G.trick.length) {
      const led = suit(G.trick[0]);
      if (suit(card) !== led && hand.some(c => suit(c) === led)) return 'suit';
      if (G.tricks === 0 && isPoint(card) && hand.some(c => suit(c) !== led && !isPoint(c))) return 'first';
      return null;
    }
    if (G.tricks === 0) return card === TWO_CLUBS ? null : 'two';
    if (suit(card) === HEARTS && !G.broken && hand.some(c => suit(c) !== HEARTS)) return 'hearts';
    return null;
  }
  const legal = G => G.phase === 'play' ? G.hands[G.turn].filter(c => !refusal(G, c)) : [];

  function trickWinner(leader, cards) {
    const led = suit(cards[0]);
    let best = 0;
    for (let i = 1; i < cards.length; i++) if (suit(cards[i]) === led && power(cards[i]) > power(cards[best])) best = i;
    return (leader + best) % 4;
  }

  // The hand's points once all 13 tricks are done. Taking all 26 is "shooting the moon":
  // that player scores 0 and each other player 26.
  function scoreHand(g) {
    const moon = g.pts.indexOf(26);
    g.moon = moon >= 0 ? moon : null;
    g.handPts = moon >= 0 ? g.pts.map((_, s) => s === moon ? 0 : 26) : g.pts.slice();
    g.scores = g.scores.map((v, s) => v + g.handPts[s]);
    g.phase = 'done';
    // The game ends once a score reaches 100. The lowest score wins; players tied for it share the win,
    // as in the French rules and in Windows.
    if (Math.max(...g.scores) >= 100) {
      const low = Math.min(...g.scores);
      const winners = g.scores.flatMap((v, s) => v === low ? [s] : []);
      g.phase = 'over';
      g.result = { winners, winner: winners.includes(0) ? 0 : winners[0] };
    }
  }

  // Changes g in place: the fast path for the computer's look-ahead.
  function playInPlace(g, card) {
    const seat = g.turn, hand = g.hands[seat];
    hand.splice(hand.indexOf(card), 1);
    if (g.trick.length && suit(card) !== suit(g.trick[0])) {
      g.voids[seat][suit(g.trick[0])] = true;
      if (g.tricks === 0 && isPoint(card)) g.only[seat] = g.only[seat] || 'points';
    }
    if (!g.trick.length && suit(card) === HEARTS && !g.broken) g.only[seat] = 'hearts';
    if (suit(card) === HEARTS) g.broken = true;
    g.trick.push(card);
    g.log.push([seat, card]);
    if (g.trick.length < 4) { g.turn = (seat + 1) % 4; return g; }
    const winner = trickWinner(g.leader, g.trick);
    let p = 0;
    for (const c of g.trick) p += points(c);
    g.pts[winner] += p;
    if (g.trick.includes(QS)) g.qsTo = winner;
    g.last = { leader: g.leader, cards: g.trick, winner, pts: p };
    g.trick = []; g.tricks++;
    g.leader = g.turn = winner;
    if (g.tricks === 13) scoreHand(g);
    return g;
  }
  function play(G, card) {
    if (G.phase !== 'play' || !G.hands[G.turn].includes(card) || refusal(G, card)) throw new Error('illegal card ' + card);
    return playInPlace(clone(G), card);
  }

  /* ---------- The computer players ----------
     Each one knows only its own hand, the cards played, the voids shown, and the cards it passed.
     Facile plays simple rules with some chance. Moyen plays careful rules. Difficile tries each card
     on many possible deals of the unseen cards and keeps the card that costs it the fewest points. */

  // What a seat can see: the cards nobody has shown it yet.
  function unseen(G, seat) {
    const known = new Set(G.hands[seat]);
    for (const [, c] of G.log) known.add(c);
    const out = [];
    for (let c = 0; c < 52; c++) if (!known.has(c)) out.push(c);
    return out;
  }
  const played = (G, c) => G.log.some(x => x[1] === c);

  // The heuristic player, used by Moyen, and by Difficile for the rest of each trial deal.
  function heuristic(G, cards) {
    cards = cards.slice();
    const seat = G.turn, hand = G.hands[seat];
    if (cards.length === 1) return cards[0];
    const out = new Set(unseen(G, seat));
    const qsOut = out.has(QS);
    const bySuit = s => cards.filter(c => suit(c) === s);
    const high = list => list.reduce((a, b) => power(b) > power(a) ? b : a);
    const low = list => list.reduce((a, b) => power(b) < power(a) ? b : a);

    if (!G.trick.length) {
      // Lead. Without the queen of spades, low spades chase it out while it is still out.
      const spades = bySuit(SPADES);
      const lowSp = spades.filter(c => power(c) < 12);
      if (qsOut && lowSp.length >= 2 && !spades.some(c => power(c) > 12)) return low(lowSp);
      // Otherwise the lead least likely to win: the suit where more unseen cards beat it.
      let best = null, bestScore = Infinity;
      for (const c of cards) {
        if (c === QS) continue;
        const s = suit(c);
        let higher = 0, lower = 0;
        for (const o of out) if (suit(o) === s) { if (power(o) > power(c)) higher++; else lower++; }
        let score = (higher ? -higher * 2 : 20) + lower;
        if (s === SPADES && power(c) > 12 && qsOut) score += 30; // the ace or king of spades could catch the queen
        if (s === HEARTS) score += 3;
        if (score < bestScore) { bestScore = score; best = c; }
      }
      return best ?? low(cards);
    }

    const led = suit(G.trick[0]);
    const winner = trickWinner(G.leader, G.trick);
    const winCard = G.trick[(winner - G.leader + 4) % 4];
    const lastToPlay = G.trick.length === 3;
    let trickPts = 0;
    for (const c of G.trick) trickPts += points(c);

    // A moon in the making: the player winning this trick has taken every point so far, and enough of
    // them to go on. Give it no point card, and take the trick when it holds points: a few points
    // here cost less than 26.
    const taken = G.pts.reduce((a, b) => a + b, 0);
    const moonBy = winner !== seat && taken >= 8 && G.pts[winner] === taken;
    if (moonBy) {
      const beat = cards.filter(c => suit(c) === led && power(c) > power(winCard));
      if (trickPts > 0 && beat.length) {
        const noQ = beat.filter(c => c !== QS);
        return (noQ.length ? noQ : beat).reduce((a, b) => power(b) < power(a) ? b : a);
      }
      const clean = cards.filter(c => !isPoint(c));
      if (clean.length && clean.length < cards.length) cards = clean;
    }

    if (suit(cards[0]) === led && cards.every(c => suit(c) === led)) {
      // Following suit.
      const under = cards.filter(c => power(c) < power(winCard));
      if (led === SPADES && cards.includes(QS) && power(winCard) > 12) return QS; // the queen under the ace or king
      if (lastToPlay && trickPts === 0) {
        // A clean trick: win it with the highest card, but never with the queen of spades.
        const safe = cards.filter(c => c !== QS);
        if (safe.length) return high(safe);
      }
      if (under.length) {
        return high(under);
      }
      // Every card wins: the last player wins with its highest; an earlier one hopes to be beaten.
      const noQ = cards.filter(c => c !== QS);
      if (led === SPADES && qsOut && !lastToPlay) {
        const belowQ = noQ.filter(c => power(c) < 12);
        if (belowQ.length) return high(belowQ);
      }
      const list = noQ.length ? noQ : cards;
      return lastToPlay ? high(list) : low(list);
    }

    // Void in the suit led: throw the most dangerous card.
    if (cards.includes(QS)) return QS;
    if (qsOut) {
      const big = cards.filter(c => suit(c) === SPADES && power(c) > 12);
      if (big.length) return high(big);
    }
    const hearts = bySuit(HEARTS);
    if (hearts.length) return high(hearts);
    // The highest card of the shortest suit, to make a new void.
    let pick = null, key = -Infinity;
    for (const c of cards) {
      const n = hand.filter(x => suit(x) === suit(c)).length;
      const k = power(c) * 2 - n * 3;
      if (k > key) { key = k; pick = c; }
    }
    return pick;
  }

  // Facile: follow with a low card, throw a high one, and often any legal card.
  function easy(G, cards, rnd) {
    if (rnd() < 0.35) return cards[Math.floor(rnd() * cards.length)];
    if (G.trick.length && suit(cards[0]) !== suit(G.trick[0])) return cards.reduce((a, b) => points(b) > points(a) || (points(b) === points(a) && power(b) > power(a)) ? b : a);
    return cards.reduce((a, b) => power(b) < power(a) ? b : a);
  }

  // Deals of the unseen cards that fit what the seat knows: how many cards each seat holds, the voids,
  // what a seat showed it holds only, and the cards this seat passed (still with the seat that got
  // them, unless played). Each fitting deal is equally likely: a card goes to a seat in proportion to
  // the number of ways to deal the rest after it. The counts are made once per decision.
  function dealer(G, seat) {
    const others = [0, 1, 2, 3].filter(s => s !== seat);
    const pinned = new Map();
    const to = passTarget(G, seat);
    if (G.gave && G.gave[seat] && to !== null) for (const c of G.gave[seat]) if (!played(G, c)) pinned.set(c, to);
    const fits = (c, s) => {
      if (pinned.has(c)) return pinned.get(c) === s;
      if (G.voids[s][suit(c)]) return false;
      if (G.only[s] === 'hearts') return suit(c) === HEARTS;
      if (G.only[s] === 'points') return isPoint(c);
      return true;
    };
    const cards = unseen(G, seat);
    // A card's possible seats as a mask of the three others (bit k for others[k]).
    const masks = cards.map(c => others.reduce((m, s, k) => fits(c, s) ? m | 1 << k : m, 0));
    const need = others.map(s => G.hands[s].length);
    const n = cards.length;
    // ways[i][a][b]: the ways to deal cards i.. with a places left for others[0] and b for others[1]
    // (others[2] takes the rest).
    const memo = new Map();
    const ways = (i, a, b) => {
      const c = n - i - a - b;
      if (a < 0 || b < 0 || c < 0) return 0;
      if (i === n) return 1;
      const k = (i * 14 + a) * 14 + b;
      let w = memo.get(k);
      if (w !== undefined) return w;
      const m = masks[i];
      w = (m & 1 ? ways(i + 1, a - 1, b) : 0) + (m & 2 ? ways(i + 1, a, b - 1) : 0) + (m & 4 ? ways(i + 1, a, b) : 0);
      memo.set(k, w);
      return w;
    };
    if (need[0] + need[1] + need[2] !== n || !ways(0, need[0], need[1])) return null;
    return rnd => {
      const g = clone(G);
      for (const s of others) g.hands[s] = [];
      let a = need[0], b = need[1];
      for (let i = 0; i < n; i++) {
        const m = masks[i];
        const w = [m & 1 ? ways(i + 1, a - 1, b) : 0, m & 2 ? ways(i + 1, a, b - 1) : 0, m & 4 ? ways(i + 1, a, b) : 0];
        let r = rnd() * (w[0] + w[1] + w[2]), k = 0;
        while (k < 2 && (r -= w[k]) >= 0) k++;
        while (!w[k]) k--; // rounding at the very end of the range
        if (k === 0) a--; else if (k === 1) b--;
        g.hands[others[k]].push(cards[i]);
      }
      // Sorted as a real hand, so the trial players break ties as the real ones do.
      for (const s of others) g.hands[s] = sortHand(g.hands[s]);
      // The trial deal knows nothing more than the cards: no passes to follow.
      g.gave = null;
      return g;
    };
  }
  const sampleDeal = (G, seat, rnd) => { const d = dealer(G, seat); return d ? d(rnd) : null; };

  // The cost of a finished trial hand for a seat: its points minus the average of the others,
  // so a moon by another player counts as the loss it is.
  // A hand that ends the game counts for more: winning the game, or losing it.
  function cost(g, seat) {
    const p = g.handPts || g.pts;
    let others = 0;
    for (let s = 0; s < 4; s++) if (s !== seat) others += p[s];
    const end = g.phase === 'over' ? (g.result.winners.includes(seat) ? -40 : 40) : 0;
    return p[seat] - others / 3 + end;
  }
  function rollout(g) {
    while (g.phase === 'play') playInPlace(g, heuristic(g, legal(g)));
    return g;
  }
  function monteCarlo(G, cards, rnd, trials) {
    const seat = G.turn, total = new Map(cards.map(c => [c, 0]));
    const deal = dealer(G, seat);
    if (!deal) return heuristic(G, cards);
    for (let t = 0; t < trials; t++) {
      const world = deal(rnd);
      for (const c of cards) total.set(c, total.get(c) + cost(rollout(playInPlace(clone(world), c)), seat));
    }
    let best = cards[0];
    for (const c of cards) if (total.get(c) < total.get(best)) best = c;
    return best;
  }

  // A random stream for one decision, from the hand's seed and the position.
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const decisionRnd = (G, salt) => seeded((G.seed ^ Math.imul(G.log.length + 1, 0x9E3779B1) ^ Math.imul(salt + 7, 0x85EBCA77)) >>> 0);

  const LEVELS = { facile: 0, moyen: 1, fort: 2 };
  function choosePlay(G, level, rnd = decisionRnd(G, G.turn), opts = {}) {
    const cards = legal(G);
    if (cards.length === 1) return cards[0];
    if (level === 'facile') return easy(G, cards, rnd);
    if (level === 'moyen') return heuristic(G, cards);
    return monteCarlo(G, cards, rnd, opts.trials || 40);
  }

  // The 3 cards to pass. Moyen and Difficile give away the cards most likely to take points: the high
  // spades when the queen is not well guarded, the high hearts, and a short suit to make a void.
  function choosePass(G, seat, level, rnd = decisionRnd(G, 10 + seat)) {
    const hand = G.hands[seat];
    if (level === 'facile') {
      return shuffle(hand.slice(), rnd).sort((a, b) => power(b) - power(a)).slice(0, 3);
    }
    const spades = hand.filter(c => suit(c) === SPADES);
    const lowSpades = spades.filter(c => power(c) < 12).length;
    const danger = c => {
      const s = suit(c), p = power(c);
      if (s === SPADES) {
        if (p >= 12) return lowSpades >= 4 ? -5 : c === QS ? 40 : 30 + p;
        return -10;
      }
      const n = hand.filter(x => suit(x) === s).length;
      let d = p;
      if (s === HEARTS) d += 2;
      else if (n <= 3) d += 8 - n * 2; // empty a short suit
      if (s === CLUBS && c === TWO_CLUBS) d -= 5;
      return d;
    };
    return hand.slice().sort((a, b) => danger(b) - danger(a)).slice(0, 3);
  }

  const api = { QS, TWO_CLUBS, suit, power, points, sortHand, newGame, nextHand, passTarget, doPass, legal, refusal,
    play, trickWinner, choosePlay, choosePass, sampleDeal, unseen, seeded, LEVELS };
  root.DDP = api;
})(typeof self !== 'undefined' ? self : globalThis);
