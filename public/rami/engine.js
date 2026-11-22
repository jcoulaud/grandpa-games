// Rules of the rami à 51 for two players, and the computer player. No DOM: the page loads it with
// <script> and the tests load it in Node.
//
// A card is 0..53: 0..51 as in lib/cards.js, suit = card / 13 (0 pique, 1 cœur, 2 carreau, 3 trèfle),
// rank = card % 13 + 1 (1 = as, 11 = valet, 12 = dame, 13 = roi). 52 and 53 are the two jokers.
// Seats: 0 the player, 1 Odette.
//
// The rules:
//   - 13 cards each. The next card starts the défausse, the rest is the pioche. The player starts.
//   - A turn: take the top card of the pioche or of the défausse. Then lay combinations and add cards
//     to the combinations on the table, if you like. Then throw one card on the défausse. A card taken
//     from the défausse cannot be thrown back the same turn.
//   - A suite: 3 or more cards of one suit that follow. The as goes before the 2 or after the roi, never
//     both. A brelan or a carré: 3 or 4 cards of one rank, all of different suits. A joker stands for any
//     one card, one joker at most in a combination.
//   - The first combinations a player lays ("ouvrir") must make 51 points, laid at once: 2 to 10 their
//     value, valet, dame and roi 10, the as 11 (1 in A-2-3), a joker the card it stands for. Before
//     opening, a player cannot add cards to the table. After, a player adds to any combination.
//   - The first with no card left wins: by throwing the last card or by laying the last cards.
//   - An empty pioche takes the défausse, shuffled, except its top card.
//   - The loser counts the cards left in hand: joker 20, as 11, figures 10, the others their value.
//
// A combination on the table: { owner, type: 'run' | 'set', slots: [[card, r], ...] }. r is the rank a
// card stands for: 1 to 14 in a suite (14 = the as after the roi), the rank in a brelan. A joker keeps
// the place it was laid in. A suite is kept in order.
//
// A game G, plain JSON so it can be saved:
//   v 1, hands [2], stock (the next card last), pile (the top card last), melds, opened [2], turn,
//   phase 'draw' | 'play' | 'over', taken (the card taken from the défausse this turn, or null),
//   took [2] (the cards each one took from the défausse, seen by the other), turns [2] (turns played),
//   rs (the random stream of the shuffles), seed (for the computer's choices), n (actions so far),
//   last (what just happened, for the page), result null or { winner, points }.
//
//   RA.newGame(rnd)                 a new game, dealt
//   RA.take(G, from)                'stock' or 'pile'
//   RA.layCheck(G, cards)           { groups, pts } or { why, ... }: can these cards be laid now?
//   RA.lay(G, cards)                lays them, split into combinations
//   RA.addCheck(G, i, cards)        null, or why these cards cannot go on combination i
//   RA.add(G, i, cards)
//   RA.throwCheck(G, card)          null, or why this card cannot be thrown
//   RA.discard(G, card)
//   RA.chooseDraw(G, level)         what the computer takes: 'stock' | 'pile'
//   RA.planTurn(G, level)           its actions after the draw: [{ type: 'lay', groups } | { type: 'add', meld, cards } | { type: 'throw', card }]
//   RA.apply(G, action)             the game after one action ({ type: 'take', from } too)
//   RA.hint(G)                      a good next action for the seat to play
//   RA.valid(G)                     true when a saved game holds together
(function factory(root) {
  'use strict';
  const HAND = 13, OPEN = 51, JOKERS = [52, 53], DECK = 54;
  const isJ = c => c >= 52;
  const suit = c => isJ(c) ? -1 : (c / 13) | 0;
  const rank = c => isJ(c) ? 0 : c % 13 + 1;
  // What a card counts in the hand at the end.
  const handValue = c => isJ(c) ? 20 : rank(c) === 1 ? 11 : rank(c) > 10 ? 10 : rank(c);
  const handPoints = h => h.reduce((a, c) => a + handValue(c), 0);
  // What a place counts in a combination: in a suite the as is 1 before the 2 and 11 after the roi.
  const runVal = r => r === 1 ? 1 : r === 14 ? 11 : r > 10 ? 10 : r;
  const setVal = r => r === 1 ? 11 : r > 10 ? 10 : r;
  const meldPoints = m => m.slots.reduce((a, [, r]) => a + (m.type === 'run' ? runVal(r) : setVal(r)), 0);
  const clone = G => JSON.parse(JSON.stringify(G));
  const top = G => G.pile[G.pile.length - 1];
  // By colour: the suits in turn, each from the as to the roi. By value: the ranks, each in the order of
  // the suits. The jokers at the end.
  const sortHand = (h, by = 'suit') => h.slice().sort((a, b) => isJ(a) - isJ(b) || (by === 'rank'
    ? rank(a) - rank(b) || suit(a) - suit(b) : suit(a) - suit(b) || rank(a) - rank(b)) || a - b);

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

  /* ---------- Combinations ----------
     An item is { c, r }: r is the place a card already holds on the table, or null for a card from
     the hand, whose place is free (an as before the 2 or after the roi, a joker anywhere). */
  function makeRun(items) {
    if (items.length < 3) return null;
    const jokers = items.filter(it => isJ(it.c));
    if (jokers.length > 1) return null;
    const nat = items.filter(it => !isJ(it.c));
    if (!nat.length) return null;
    const s = suit(nat[0].c);
    if (nat.some(it => suit(it.c) !== s)) return null;
    const free = jokers.filter(it => it.r == null);
    let best = null;
    for (const high of [false, true]) {
      const slots = items.filter(it => !(isJ(it.c) && it.r == null))
        .map(it => [it.c, it.r != null ? it.r : rank(it.c) === 1 && high ? 14 : rank(it.c)]).sort((a, b) => a[1] - b[1]);
      if (slots.some((x, i) => i && x[1] === slots[i - 1][1])) continue;
      const lo = slots[0][1], hi = slots[slots.length - 1][1];
      const gaps = hi - lo + 1 - slots.length;
      if (gaps > free.length) continue;
      if (free.length) {
        let r = null;
        if (gaps === 1) { r = lo + 1; while (slots.some(x => x[1] === r)) r++; }
        // A joker at an end goes after the last card, or before the first when the suite ends on the as.
        else if (hi < 14 && !(lo === 1 && hi === 13)) r = hi + 1;
        else if (lo > 1 && !(lo === 2 && hi === 14)) r = lo - 1;
        if (r === null) continue;
        slots.push([free[0].c, r]);
        slots.sort((a, b) => a[1] - b[1]);
      }
      const L = slots[0][1], H = slots[slots.length - 1][1];
      if (L < 1 || H > 14 || (L === 1 && H === 14)) continue;
      const m = { type: 'run', slots };
      const pts = meldPoints(m);
      if (!best || pts > best.pts) best = { ...m, pts };
    }
    return best;
  }
  function makeSet(items) {
    if (items.length < 3 || items.length > 4) return null;
    const jokers = items.filter(it => isJ(it.c)), nat = items.filter(it => !isJ(it.c));
    if (jokers.length > 1 || !nat.length) return null;
    const r = rank(nat[0].c);
    if (nat.some(it => rank(it.c) !== r)) return null;
    if (new Set(nat.map(it => suit(it.c))).size !== nat.length) return null;
    const slots = nat.map(it => [it.c, r]).sort((a, b) => a[0] - b[0]).concat(jokers.map(it => [it.c, r]));
    const m = { type: 'set', slots };
    return { ...m, pts: meldPoints(m) };
  }
  // The combination these cards of a hand make, or null. A suite and a brelan cannot share 3 cards.
  const free = cards => cards.map(c => ({ c, r: null }));
  const combo = cards => makeRun(free(cards)) || makeSet(free(cards));
  // A combination of the table with more cards from a hand, or null. It stays a suite or a brelan.
  function extend(m, cards) {
    const items = m.slots.map(([c, r]) => ({ c, r })).concat(free(cards));
    return m.type === 'run' ? makeRun(items) : makeSet(items);
  }

  // Every combination a set of cards holds, each with a bit mask over the cards.
  function candidates(cards) {
    const out = [], seen = new Set();
    const idx = new Map(cards.map((c, i) => [c, i]));
    const push = cs => {
      const key = cs.slice().sort((a, b) => a - b).join();
      if (seen.has(key)) return;
      seen.add(key);
      const m = combo(cs);
      if (!m) return;
      let mask = 0;
      for (const c of cs) mask |= 1 << idx.get(c);
      out.push({ cards: cs, mask, pts: m.pts, value: handPoints(cs) });
    };
    const jok = cards.filter(isJ), nat = cards.filter(c => !isJ(c));
    for (let r = 1; r <= 13; r++) {
      const g = nat.filter(c => rank(c) === r);
      for (let mask = 1; mask < 1 << g.length; mask++) {
        const sub = g.filter((_, i) => mask >> i & 1);
        if (sub.length >= 3) push(sub);
        if (sub.length >= 2 && sub.length <= 3) for (const j of jok) push([...sub, j]);
      }
    }
    for (let s = 0; s < 4; s++) {
      const at = new Map();
      for (const c of nat) if (suit(c) === s) { at.set(rank(c), c); if (rank(c) === 1) at.set(14, c); }
      if (at.size < (jok.length ? 2 : 3)) continue;
      for (let lo = 1; lo <= 12; lo++) for (let hi = lo + 2; hi <= 14; hi++) {
        if (lo === 1 && hi === 14) continue;
        let miss = 0;
        const cs = [];
        for (let r = lo; r <= hi && miss < 2; r++) if (at.has(r)) cs.push(at.get(r)); else miss++;
        if (miss > 1) break;
        if (!miss) push(cs);
        else for (const j of jok) push([...cs, j]);
      }
    }
    return out;
  }

  // The best set of combinations that do not share a card. key 'pts': the most points (to open).
  // key 'value': the most points taken out of the hand (a joker 20). exact: every card in a combination.
  function bestPack(cards, key = 'pts', exact = false) {
    const n = cards.length, cands = candidates(cards);
    const byLow = Array.from({ length: n }, () => []);
    for (const k of cands) byLow[31 - Math.clz32(k.mask & -k.mask)].push(k);
    for (const list of byLow) list.sort((a, b) => b[key] - a[key]);
    const most = c => key === 'pts' ? 11 : handValue(c);
    const rest = Array(n + 1).fill(0);
    for (let i = n - 1; i >= 0; i--) rest[i] = rest[i + 1] + most(cards[i]);
    let best = null;
    const list = [];
    (function go(i, used, score) {
      while (i < n && used >> i & 1) i++;
      if (best && score + rest[i] <= best.score) return;
      if (i === n) { best = { score, groups: list.map(k => k.cards) }; return; }
      for (const k of byLow[i]) if (!(k.mask & used)) { list.push(k); go(i + 1, used | k.mask, score + k[key]); list.pop(); }
      if (!exact) go(i + 1, used | 1 << i, score);
    })(0, 0, 0);
    if (!best) return null;
    const groups = best.groups;
    return { groups, pts: groups.reduce((a, g) => a + combo(g).pts, 0), cards: groups.flat() };
  }
  // How the cards he chose split into combinations, with the most points: null if they do not.
  const split = cards => cards.length >= 3 && cards.length <= 14 && new Set(cards).size === cards.length ? bestPack(cards, 'pts', true) : null;

  // Why the cards chosen make no combination, in one short reason.
  function whyNot(cards) {
    if (cards.length < 3) return 'few';
    const nat = cards.filter(c => !isJ(c)), jok = cards.length - nat.length;
    if (jok > 1 && jok * 3 > cards.length) return 'jokers';
    if (nat.every(c => rank(c) === rank(nat[0]))) return 'set';
    if (nat.every(c => suit(c) === suit(nat[0]))) {
      const rs = nat.map(rank);
      if (rs.includes(1) && rs.includes(13) && rs.includes(2)) return 'ace';
      return 'gap';
    }
    return 'mixed';
  }

  /* ---------- The turn ---------- */
  // An empty pioche takes the défausse, shuffled, except its top card.
  function refill(g) {
    if (g.stock.length || g.pile.length < 2) return false;
    const t = g.pile.pop();
    g.stock = shuffle(g.pile, stream(g));
    g.pile = [t];
    return true;
  }
  function deal(rnd) {
    const G = { v: 1, rs: Math.floor(rnd() * 4294967296), seed: Math.floor(rnd() * 4294967296) };
    const deck = shuffle([...Array(DECK).keys()], stream(G));
    G.hands = [deck.slice(0, HAND), deck.slice(HAND, 2 * HAND)];
    G.pile = [deck[2 * HAND]];
    G.stock = deck.slice(2 * HAND + 1);
    Object.assign(G, { melds: [], opened: [false, false], turn: 0, phase: 'draw', taken: null, took: [[], []], turns: [0, 0], n: 0,
      last: { kind: 'deal', seat: null }, result: null });
    return G;
  }
  const newGame = (rnd = Math.random) => deal(rnd);

  const canTake = (G, from) => G.phase === 'draw' && (from === 'pile' ? G.pile.length > 0 : G.stock.length > 0);
  function takeIn(g, from) {
    const seat = g.turn, c = from === 'pile' ? g.pile.pop() : g.stock.pop();
    g.hands[seat].push(c);
    g.taken = from === 'pile' ? c : null;
    if (from === 'pile') g.took[seat].push(c);
    g.phase = 'play';
    g.n++;
    g.last = { kind: 'take', seat, from, card: c };
    return g;
  }
  function take(G, from) {
    if (!canTake(G, from)) throw new Error('cannot take from ' + from);
    return takeIn(clone(G), from);
  }

  // The hand left after these cards go: it must hold a card to throw, or nothing (the game is won).
  function leaves(G, cards) {
    const rest = G.hands[G.turn].filter(c => !cards.includes(c));
    return rest.length === 0 || rest.some(c => c !== G.taken);
  }
  function layCheck(G, cards) {
    if (G.phase !== 'play') return { why: 'phase' };
    const hand = G.hands[G.turn];
    if (!cards.length || cards.some(c => !hand.includes(c)) || new Set(cards).size !== cards.length) return { why: 'phase' };
    const s = split(cards);
    if (!s) return { why: whyNot(cards) };
    if (!G.opened[G.turn] && s.pts < OPEN) return { why: 'open', pts: s.pts, missing: OPEN - s.pts };
    if (!leaves(G, cards)) return { why: 'keep' };
    return { groups: s.groups, pts: s.pts };
  }
  function end(g, seat) {
    g.phase = 'over';
    g.taken = null;
    g.result = { winner: seat, points: handPoints(g.hands[1 - seat]) };
  }
  function layIn(g, groups) {
    const seat = g.turn, opening = !g.opened[seat], first = g.melds.length;
    let pts = 0;
    for (const cs of groups) {
      const m = combo(cs);
      pts += m.pts;
      g.melds.push({ owner: seat, type: m.type, slots: m.slots });
      g.hands[seat] = g.hands[seat].filter(c => !cs.includes(c));
    }
    g.opened[seat] = true;
    g.n++;
    g.last = { kind: 'lay', seat, melds: groups.map((_, i) => first + i), pts, opening };
    if (!g.hands[seat].length) end(g, seat);
    return g;
  }
  function lay(G, cards) {
    const c = layCheck(G, cards);
    if (c.why) throw new Error('cannot lay: ' + c.why);
    return layIn(clone(G), c.groups);
  }
  function layGroups(G, groups) {
    if (G.phase !== 'play' || !groups.length) throw new Error('cannot lay');
    const all = groups.flat(), hand = G.hands[G.turn];
    if (all.some(c => !hand.includes(c)) || new Set(all).size !== all.length || groups.some(g => !combo(g))) throw new Error('cannot lay these groups');
    if (!G.opened[G.turn] && groups.reduce((a, g) => a + combo(g).pts, 0) < OPEN) throw new Error('not enough to open');
    if (!leaves(G, all)) throw new Error('no card left to throw');
    return layIn(clone(G), groups);
  }

  function addCheck(G, i, cards) {
    if (G.phase !== 'play') return 'phase';
    const hand = G.hands[G.turn], m = G.melds[i];
    if (!m || !cards.length || cards.some(c => !hand.includes(c)) || new Set(cards).size !== cards.length) return 'phase';
    if (!G.opened[G.turn]) return 'closed';
    if (!extend(m, cards)) return cards.filter(isJ).length + m.slots.filter(([c]) => isJ(c)).length > 1 ? 'joker' : 'fit';
    if (!leaves(G, cards)) return 'keep';
    return null;
  }
  function addIn(g, i, cards) {
    const seat = g.turn;
    g.melds[i].slots = extend(g.melds[i], cards).slots;
    g.hands[seat] = g.hands[seat].filter(c => !cards.includes(c));
    g.n++;
    g.last = { kind: 'add', seat, meld: i, cards: cards.slice() };
    if (!g.hands[seat].length) end(g, seat);
    return g;
  }
  function add(G, i, cards) {
    const why = addCheck(G, i, cards);
    if (why) throw new Error('cannot add: ' + why);
    return addIn(clone(G), i, cards);
  }

  function throwCheck(G, card) {
    if (G.phase !== 'play' || !G.hands[G.turn].includes(card)) return 'phase';
    if (card === G.taken) return 'taken';
    return null;
  }
  function discardIn(g, card) {
    const seat = g.turn;
    g.hands[seat] = g.hands[seat].filter(c => c !== card);
    g.pile.push(card);
    g.n++;
    g.turns[seat]++;
    g.last = { kind: 'throw', seat, card, shuffled: false };
    if (!g.hands[seat].length) { end(g, seat); return g; }
    g.turn = 1 - seat;
    g.phase = 'draw';
    g.taken = null;
    g.last.shuffled = refill(g);
    return g;
  }
  function discard(G, card) {
    const why = throwCheck(G, card);
    if (why) throw new Error('cannot throw: ' + why);
    return discardIn(clone(G), card);
  }

  function apply(G, a) {
    if (a.type === 'take') return take(G, a.from);
    if (a.type === 'lay') return a.groups ? layGroups(G, a.groups) : lay(G, a.cards);
    if (a.type === 'add') return add(G, a.meld, a.cards);
    if (a.type === 'throw') return discard(G, a.card);
    throw new Error('unknown action');
  }

  /* ---------- The computer player ----------
     It sees its own hand, the table, the défausse and the cards the other player took from it.
     Facile always takes the pioche, opens after 12 turns, and throws a card at random among those
     outside its combinations. Moyen takes the défausse when its card completes a combination, opens
     after 8 turns, and throws its biggest loose card. Difficile opens as soon as it can. It keeps the
     cards that nearly make a combination, counting the unseen cards that would complete them, takes
     the défausse when its card makes the hand much better, and does not throw a card the other player
     showed it wants or could add to the table.
     The tests play 1000 deals each way: Moyen wins about 84 % of its games against Facile, and
     Difficile about 55 % against Moyen. */
  const LEVELS = { facile: 0, moyen: 1, fort: 2 };
  const decisionRnd = G => seeded((G.seed ^ Math.imul(G.n + 1, 0x9E3779B1) ^ Math.imul(G.turn + 7, 0x85EBCA77)) >>> 0);
  // Two cards that nearly make a combination: the same rank, or the same suit at most gap ranks apart.
  function near(a, b, gap) {
    if (isJ(a) || isJ(b) || a === b) return false;
    if (rank(a) === rank(b)) return true;
    if (suit(a) !== suit(b)) return false;
    const ra = rank(a), rb = rank(b);
    // The as also sits after the roi.
    const d = Math.min(Math.abs(ra - rb), ra === 1 ? 14 - rb : rb === 1 ? 14 - ra : 99);
    return d <= gap;
  }
  const canAddAny = (G, c) => G.melds.some(m => extend(m, [c]));
  const packValue = cards => { const p = bestPack(cards, 'value'); return p ? p.groups.reduce((a, g) => a + handPoints(g), 0) : 0; };

  function chooseDraw(G, level) {
    if (!G.pile.length) return 'stock';
    if (!G.stock.length) return 'pile';
    if (level === 'facile') return 'stock';
    const seat = G.turn, hand = G.hands[seat], t = top(G);
    if (isJ(t)) return 'pile';
    if (G.opened[seat] && canAddAny(G, t)) return 'pile';
    const with_ = bestPack([...hand, t], 'value');
    if (with_ && with_.cards.includes(t) && packValue(with_.cards) > packValue(hand)) return 'pile';
    if (level === 'fort') {
      const live = liveCards(G, seat), ev = h => handEval(h, live);
      const now = ev(hand), more = [...hand, t];
      let bestAfter = -Infinity;
      for (const c of hand) bestAfter = Math.max(bestAfter, ev(more.filter(d => d !== c)));
      if (bestAfter >= now + 20) return 'pile';
    }
    return 'stock';
  }

  // The card to throw, among those the seat may throw.
  function chooseThrow(g, level, rnd) {
    const seat = g.turn, hand = g.hands[seat], opp = 1 - seat;
    const allowed = hand.filter(c => c !== g.taken);
    const pack = bestPack(hand, 'value');
    const inPack = new Set(pack ? pack.cards : []);
    let pool = allowed.filter(c => !inPack.has(c) && !isJ(c));
    if (!pool.length) pool = allowed.filter(c => !isJ(c));
    if (!pool.length) pool = allowed;
    if (level === 'facile') return pool[Math.floor(rnd() * pool.length)];
    if (level === 'moyen') return pool.reduce((a, c) => handValue(c) > handValue(a) ? c : a);
    // Difficile keeps the hand with the most points in combinations and the most cards still to come
    // that would make a new one. A card the other player showed it wants goes last.
    const live = liveCards(g, seat);
    let best = null, bestKey = -Infinity;
    for (const c of pool) {
      const rest = hand.filter(d => d !== c);
      const wanted = g.took[opp].some(d => near(c, d, 2)) ? 1 : 0;
      const feeds = g.opened[opp] && canAddAny(g, c) ? 1 : 0;
      const k = handEval(rest, live) - 12 * wanted - 25 * feeds + handValue(c) / 2;
      if (k > bestKey) { bestKey = k; best = c; }
    }
    return best;
  }
  // The cards the seat has not seen: not in its hand, on the table, in the défausse, or taken by the other.
  function liveCards(g, seat) {
    const seen = new Set([...g.hands[seat], ...g.pile, ...g.melds.flatMap(m => m.slots.map(s => s[0])), ...g.took[1 - seat]]);
    const live = new Set();
    for (let c = 0; c < DECK; c++) if (!seen.has(c)) live.add(c);
    return live;
  }
  // A hand is worth the points it holds in combinations and the unseen cards that would make a new one.
  const handEval = (h, live) => 3 * packValue(h) + 8 * outs(h, live);
  // How many unseen cards would turn two loose cards of a hand into a combination of three.
  function outs(hand, live) {
    const p = bestPack(hand, 'value'), used = new Set(p ? p.cards : []);
    const loose = hand.filter(c => !used.has(c) && !isJ(c));
    const jokers = JOKERS.filter(j => live.has(j)).length;
    let n = 0;
    const has = (s, r) => r >= 1 && r <= 14 && live.has(s * 13 + (r === 14 ? 0 : r - 1));
    for (let i = 0; i < loose.length; i++) for (let j = i + 1; j < loose.length; j++) {
      const a = loose[i], b = loose[j];
      if (rank(a) === rank(b)) { let k = jokers; for (let s = 0; s < 4; s++) if (s !== suit(a) && s !== suit(b) && live.has(s * 13 + rank(a) - 1)) k++; n += k; continue; }
      if (suit(a) !== suit(b)) continue;
      for (const [x, y] of [[rank(a), rank(b)], [rank(a) === 1 ? 14 : 0, rank(b) === 1 ? 14 : 0]]) {
        if (!x && !y) continue;
        const lo = Math.min(x || rank(a), y || rank(b)), hi = Math.max(x || rank(a), y || rank(b)), s = suit(a);
        if (hi - lo === 1) { n += has(s, lo - 1) + has(s, hi + 1) + jokers; break; }
        if (hi - lo === 2) { n += has(s, lo + 1) + jokers; break; }
      }
    }
    return n;
  }

  // Its actions after the draw, tried on a copy of the game: combinations, cards added, then the card thrown.
  function planTurn(G, level, rnd = decisionRnd(G)) {
    const g = clone(G), seat = g.turn, acts = [];
    if (g.phase !== 'play') return acts;
    if (!g.opened[seat]) {
      const p = bestPack(g.hands[seat], 'pts');
      let groups = p && p.pts >= OPEN ? p.groups.slice() : null;
      // Without a card to throw, the smallest combination stays in the hand.
      while (groups && !leaves(g, groups.flat())) {
        groups.sort((a, b) => combo(b).pts - combo(a).pts);
        groups.pop();
        if (!groups.length || groups.reduce((a, x) => a + combo(x).pts, 0) < OPEN) groups = null;
      }
      const all = groups && groups.flat().length === g.hands[seat].length;
      const wait = level === 'facile' ? 12 : level === 'moyen' ? 8 : 0;
      if (groups && (g.turns[seat] >= wait || all)) { acts.push({ type: 'lay', groups }); layIn(g, groups); }
    }
    if (g.opened[seat] && g.phase === 'play') {
      const p = bestPack(g.hands[seat], 'value');
      if (p && p.groups.length) {
        const groups = p.groups.slice();
        while (groups.length && !leaves(g, groups.flat())) groups.pop();
        if (groups.length) { acts.push({ type: 'lay', groups }); layIn(g, groups); }
      }
      // Cards added to the table, one at a time, while one fits.
      for (let more = true; more && g.phase === 'play';) {
        more = false;
        for (const c of g.hands[seat].slice()) {
          const i = g.melds.findIndex(m => extend(m, [c]));
          if (i < 0 || !leaves(g, [c])) continue;
          acts.push({ type: 'add', meld: i, cards: [c] });
          addIn(g, i, [c]);
          more = true;
          break;
        }
      }
    }
    if (g.phase === 'play') acts.push({ type: 'throw', card: chooseThrow(g, level, rnd) });
    return acts;
  }

  // A good next action for the seat to play, as Difficile would play it, opening as soon as it can.
  function hint(G) {
    if (G.phase === 'draw') return { type: 'take', from: chooseDraw(G, 'fort') };
    if (G.phase !== 'play') return null;
    const a = planTurn(G, 'fort')[0];
    return a.type === 'lay' ? { type: 'lay', cards: a.groups.flat(), groups: a.groups } : a;
  }

  // A saved game holds together: each card once, combinations that are valid, a known phase and seat.
  function valid(G) {
    try {
      if (!G || typeof G !== 'object' || G.v !== 1) return false;
      if (!['draw', 'play', 'over'].includes(G.phase) || ![0, 1].includes(G.turn)) return false;
      if (!Array.isArray(G.hands) || G.hands.length !== 2 || !G.hands.every(Array.isArray) || !Array.isArray(G.stock) || !Array.isArray(G.pile)) return false;
      if (!Array.isArray(G.melds) || !G.melds.every(m => m && [0, 1].includes(m.owner) && ['run', 'set'].includes(m.type) && Array.isArray(m.slots)
        && m.slots.length >= 3 && m.slots.every(s => Array.isArray(s) && s.length === 2 && Number.isInteger(s[1])))) return false;
      const all = [...G.hands.flat(), ...G.stock, ...G.pile, ...G.melds.flatMap(m => m.slots.map(s => s[0]))];
      if (all.length !== DECK || new Set(all).size !== DECK || !all.every(c => Number.isInteger(c) && c >= 0 && c < DECK)) return false;
      // Each combination is laid as the rules say: the same places, in the same order.
      for (const m of G.melds) {
        const again = (m.type === 'run' ? makeRun : makeSet)(m.slots.map(([c, r]) => ({ c, r })));
        if (!again || JSON.stringify(again.slots) !== JSON.stringify(m.slots)) return false;
      }
      if (!Array.isArray(G.opened) || G.opened.length !== 2 || !Number.isFinite(G.rs) || !Number.isFinite(G.seed)) return false;
      for (const s of [0, 1]) if (G.melds.some(m => m.owner === s) && !G.opened[s]) return false;
      if (G.phase === 'over') {
        if (!G.result || ![0, 1].includes(G.result.winner) || G.hands[G.result.winner].length || !Number.isFinite(G.result.points)) return false;
      } else {
        if (!G.hands.every(h => h.length)) return false;
        if (G.taken != null && (G.phase !== 'play' || !G.hands[G.turn].includes(G.taken))) return false;
      }
      // Fields that only the computer or the page read: an old save without them gets them.
      if (!Array.isArray(G.took) || G.took.length !== 2 || !G.took.every(Array.isArray)) G.took = [[], []];
      if (!Array.isArray(G.turns) || G.turns.length !== 2 || !G.turns.every(Number.isInteger)) G.turns = [0, 0];
      if (!Number.isInteger(G.n)) G.n = 0;
      if (G.taken === undefined) G.taken = null;
      if (!G.last || typeof G.last !== 'object') G.last = { kind: 'deal', seat: null };
      return true;
    } catch (e) { return false; }
  }

  const api = { HAND, OPEN, JOKERS, isJ, suit, rank, handValue, handPoints, runVal, setVal, meldPoints, sortHand, seeded, combo, extend, split, whyNot,
    candidates, bestPack, newGame, canTake, take, layCheck, lay, layGroups, addCheck, add, throwCheck, discard, apply, chooseDraw, planTurn, hint,
    valid, top, LEVELS };
  root.RA = api;
})(typeof self !== 'undefined' ? self : globalThis);
