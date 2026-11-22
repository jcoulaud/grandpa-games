// Rules of the belote for four players in two teams, and the computer players. No DOM: the page loads
// it with <script> and the tests load it in Node.
//
// A card is a number as in lib/cards.js: suit = card / 13 (0 pique, 1 cœur, 2 carreau, 3 trèfle),
// rank = card % 13 + 1 (1 = as, 11 valet, 12 dame, 13 roi). The belote uses the 32 cards from the 7 to the as.
// Seats: 0 the player (bottom), 1 right, 2 across (his partner), 3 left. Play goes to the right, as in
// France: 0, 1, 2, 3. Team 0 is seats 0 and 2, team 1 is seats 1 and 3.
//
// A game G, plain JSON so it can be saved:
//   scores   [2] the totals of the two teams before this hand; target: 501
//   handNo   the hand number, from 0; dealer: the seat that deals
//   phase    'bid1' (taking the suit of the retourne), 'bid2' (naming another suit), 'play', 'done' or 'over'
//   hands    [4] the cards each seat holds, sorted
//   turnup   the retourne, the card turned face up; stock: the 11 cards still to deal after the bids
//   bids     [[seat, bid]] what each said in this deal: 'pass', 'take' (round 1) or a suit (round 2)
//   redeal   true on a new deal after everyone passed twice
//   turn     the seat to bid or play; leader: the seat that led the trick in progress
//   taker, trump   who took, and the trump suit, once someone took
//   trick    the cards of the trick in progress, from the leader; tricks: the tricks done (0..8)
//   won      [2] the card points each team took in this hand, with the dix de der: 10 for the last trick,
//            100 in a capot (FFB 9.2), so a capot makes 252
//   tricksWon [2] the tricks each team took
//   belote   the seat that holds the king and the queen of trumps, or null; said: how many of the two it played
//   log      [[seat, card]] every card played in this hand, in order
//   voids    [4][4] voids[seat][suit]: the seat showed it has no card of that suit
//   caps     [4] the seat showed it has no trump above this trump order (8: nothing shown)
//   last     the last trick done: { leader, cards, winner, pts }, or null
//   handPts  [2] the points the hand gave each team once done; outcome: 'made', 'dedans' or 'capot';
//            capot: the team that took every trick, or null
//   seed     the seed of the computers' choices: the same position always gets the same answer
//   result   null, or { winner } at the end of the game: the team with the most points
//
//   Belote.newGame(rnd)                   a new game, the first hand dealt; the player bids first
//   Belote.bid(G, choice)                 the game after the seat to bid says choice: 'pass', 'take' or a suit
//   Belote.bidOptions(G)                  what the seat to bid may say
//   Belote.legal(G), refusal(G, card)     the cards the seat to play may play; why a card may not be played
//   Belote.play(G, card)                  the game after the seat to play plays card
//   Belote.nextHand(G, rnd)               the next hand, dealt by the next seat
//   Belote.chooseBid(G, level, rnd)       what a computer says for the seat to bid
//   Belote.choosePlay(G, level, rnd)      the card a computer plays for the seat to play
//   Belote.check(G)                       true if a saved game is whole and fits the rules
(function factory(root) {
  'use strict';
  const RANKS = [1, 7, 8, 9, 10, 11, 12, 13];
  const DECK = [];
  for (let s = 0; s < 4; s++) for (const r of RANKS) DECK.push(s * 13 + r - 1);
  const suit = c => (c / 13) | 0;
  const rank = c => c % 13 + 1;
  const team = seat => seat % 2;
  // Orders from 0 (weakest) to 7. Trumps: V 9 A 10 R D 8 7. Other suits: A 10 R D V 9 8 7.
  const PLAIN_ORDER = { 7: 0, 8: 1, 9: 2, 11: 3, 12: 4, 13: 5, 10: 6, 1: 7 };
  const TRUMP_ORDER = { 7: 0, 8: 1, 12: 2, 13: 3, 10: 4, 1: 5, 9: 6, 11: 7 };
  const PLAIN_PTS = { 1: 11, 10: 10, 13: 4, 12: 3, 11: 2, 9: 0, 8: 0, 7: 0 };
  const TRUMP_PTS = { 11: 20, 9: 14, 1: 11, 10: 10, 13: 4, 12: 3, 8: 0, 7: 0 };
  const order = (c, trump) => suit(c) === trump ? TRUMP_ORDER[rank(c)] : PLAIN_ORDER[rank(c)];
  const points = (c, trump) => suit(c) === trump ? TRUMP_PTS[rank(c)] : PLAIN_PTS[rank(c)];
  const clone = G => JSON.parse(JSON.stringify(G));
  const LAST_TRICK = 10, LAST_CAPOT = 100, BELOTE = 20, CAPOT = 252, TOTAL = 162, TARGET = 501;

  // A hand as it is held: the trumps first, then the other suits in turn red and black, the strongest
  // card on the left of each suit.
  function sortHand(h, trump = null) {
    const suits = [0, 1, 3, 2];
    if (trump !== null) { suits.splice(suits.indexOf(trump), 1); suits.unshift(trump); }
    // Keep the colours apart after the trump: no two suits of the same colour side by side, when possible.
    const red = s => s === 1 || s === 2;
    const have = suits.filter(s => h.some(c => suit(c) === s));
    for (let i = 1; i < have.length - 1; i++) if (red(have[i]) === red(have[i - 1])) {
      const j = have.findIndex((s, k) => k > i && red(s) !== red(have[i - 1]));
      if (j > 0) [have[i], have[j]] = [have[j], have[i]];
    }
    return h.slice().sort((a, b) => have.indexOf(suit(a)) - have.indexOf(suit(b)) || order(b, trump) - order(a, trump));
  }

  function shuffle(a, rnd) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // The deal: 3 cards, then 2, to each player from the one after the dealer, and the retourne face up.
  function deal(G, rnd) {
    const deck = shuffle(DECK.slice(), rnd);
    const hands = [[], [], [], []];
    let k = 0;
    for (const n of [3, 2]) for (let i = 1; i <= 4; i++) { const s = (G.dealer + i) % 4; hands[s].push(...deck.slice(k, k + n)); k += n; }
    G.hands = hands.map(h => sortHand(h));
    G.turnup = deck[k++];
    G.stock = deck.slice(k);
    G.phase = 'bid1'; G.bids = []; G.redeal = false;
    G.turn = (G.dealer + 1) % 4; G.leader = G.turn;
    G.taker = null; G.trump = null;
    G.trick = []; G.tricks = 0; G.won = [0, 0]; G.tricksWon = [0, 0];
    G.belote = null; G.said = 0; G.log = [];
    G.voids = [0, 1, 2, 3].map(() => [false, false, false, false]); G.caps = [8, 8, 8, 8];
    G.last = null; G.handPts = null; G.outcome = null; G.capot = null;
    G.seed = Math.floor(rnd() * 4294967296);
    return G;
  }

  // The first dealer is on his left, so he speaks first.
  function newGame(rnd = Math.random) {
    return deal({ v: 1, target: TARGET, scores: [0, 0], handNo: 0, dealer: 3, result: null }, rnd);
  }
  function nextHand(G, rnd = Math.random) {
    const g = clone(G);
    g.handNo++;
    g.dealer = (g.dealer + 1) % 4;
    return deal(g, rnd);
  }

  // What the seat to bid may say. In the first round, take the suit of the retourne or pass. In the
  // second, name one of the three other suits or pass.
  function bidOptions(G) {
    if (G.phase === 'bid1') return ['take', 'pass'];
    if (G.phase === 'bid2') return [0, 1, 2, 3].filter(s => s !== suit(G.turnup)).concat('pass');
    return [];
  }
  function bid(G, choice) {
    if (!bidOptions(G).includes(choice)) throw new Error('bad bid ' + choice);
    const g = clone(G);
    g.redeal = false;
    g.bids.push([g.turn, choice]);
    if (choice !== 'pass') return take(g, g.turn, choice === 'take' ? suit(g.turnup) : choice);
    g.turn = (g.turn + 1) % 4;
    if (g.turn === (g.dealer + 1) % 4) {
      if (g.phase === 'bid1') g.phase = 'bid2';
      else {
        // Everyone passed twice: the next player deals again. The scores do not change.
        const next = nextHand(g, seeded(g.seed ^ 0x2545F491));
        next.handNo = g.handNo;
        next.redeal = true;
        return next;
      }
    }
    return g;
  }
  // The taker gets the retourne and 2 cards, the others 3, from the player after the dealer.
  function take(g, seat, trump) {
    g.taker = seat; g.trump = trump;
    g.hands[seat].push(g.turnup);
    let k = 0;
    for (let i = 1; i <= 4; i++) {
      const s = (g.dealer + i) % 4, n = s === seat ? 2 : 3;
      g.hands[s].push(...g.stock.slice(k, k + n)); k += n;
    }
    g.stock = [];
    g.hands = g.hands.map(h => sortHand(h, trump));
    const K = trump * 13 + 12, Q = trump * 13 + 11;
    const holder = g.hands.findIndex(h => h.includes(K) && h.includes(Q));
    g.belote = holder >= 0 ? holder : null;
    g.phase = 'play';
    g.leader = g.turn = (g.dealer + 1) % 4;
    return g;
  }

  // The seat and the card that win the cards played so far.
  function bestOf(cards, trump) {
    let best = 0;
    for (let i = 1; i < cards.length; i++) {
      const c = cards[i], b = cards[best];
      if (suit(c) === suit(b) ? order(c, trump) > order(b, trump) : suit(c) === trump) best = i;
    }
    return best;
  }
  const trickWinner = (leader, cards, trump) => (leader + bestOf(cards, trump)) % 4;

  // Why a card in hand may not be played, for the seat to play, or null.
  //   'suit'  he has the suit led;  'monter'  trumps were led and he has a higher trump;
  //   'couper'  he has none of the suit led, his partner is not winning, and he has a trump;
  //   'surcouper'  the trick is trumped by the other team and he has a higher trump.
  // As in the FFB rules (5.2): a player who must trump and cannot go higher plays a lower trump; he
  // discards only when he has no trump.
  function refusal(G, card) {
    const hand = G.hands[G.turn], T = G.trump;
    if (!G.trick.length) return null;
    const led = suit(G.trick[0]);
    const win = bestOf(G.trick, T), top = G.trick[win];
    const higher = c => suit(c) === T && (suit(top) !== T || order(c, T) > order(top, T));
    if (hand.some(c => suit(c) === led)) {
      if (suit(card) !== led) return 'suit';
      if (led === T && !higher(card) && hand.some(higher)) return 'monter';
      return null;
    }
    // He has none of the suit led. His partner winning: any card. Otherwise a trump, a higher one if he has one.
    const partnerWins = team((G.leader + win) % 4) === team(G.turn);
    const trumps = hand.filter(c => suit(c) === T);
    if (partnerWins || !trumps.length) return null;
    if (suit(top) === T && trumps.some(higher)) return higher(card) ? null : 'surcouper';
    return suit(card) === T ? null : 'couper';
  }
  const legal = G => G.phase === 'play' ? G.hands[G.turn].filter(c => !refusal(G, c)) : [];

  // The points of a finished hand. The taking team must score more than the other, belote counted.
  // If not, it is "dedans": the other team scores 162. Each team keeps its belote. All 8 tricks: capot, 252.
  function scoreHand(g) {
    const T = team(g.taker), D = 1 - T, bel = [0, 0];
    if (g.belote !== null) bel[team(g.belote)] = BELOTE;
    const pts = [0, 0];
    g.capot = g.tricksWon[0] === 8 ? 0 : g.tricksWon[1] === 8 ? 1 : null;
    if (g.capot !== null) {
      pts[g.capot] = CAPOT + bel[g.capot]; pts[1 - g.capot] = bel[1 - g.capot];
      g.outcome = g.capot === T ? 'capot' : 'dedans';
    } else if (g.won[T] + bel[T] > g.won[D] + bel[D]) {
      pts[T] = g.won[T] + bel[T]; pts[D] = g.won[D] + bel[D];
      g.outcome = 'made';
    } else {
      pts[D] = TOTAL + bel[D]; pts[T] = bel[T];
      g.outcome = 'dedans';
    }
    g.handPts = pts;
    g.scores = g.scores.map((v, t) => v + pts[t]);
    g.phase = 'done';
    // The game ends once a team reaches the target; the larger total wins. A tie plays one more hand.
    const [a, b] = g.scores;
    if (Math.max(a, b) >= g.target && a !== b) { g.phase = 'over'; g.result = { winner: a > b ? 0 : 1 }; }
  }

  // Changes g in place: the fast path for the computer's look-ahead.
  function playInPlace(g, card) {
    const seat = g.turn, hand = g.hands[seat], T = g.trump;
    hand.splice(hand.indexOf(card), 1);
    // What the card shows about the rest of the hand.
    if (g.trick.length) {
      const led = suit(g.trick[0]), win = bestOf(g.trick, T), top = g.trick[win];
      const partnerWins = team((g.leader + win) % 4) === team(seat);
      if (suit(card) !== led) g.voids[seat][led] = true;
      const beats = suit(card) === T && (suit(top) !== T || order(card, T) > order(top, T));
      if (led === T) {
        if (suit(card) === T && !beats) g.caps[seat] = Math.min(g.caps[seat], order(top, T));
      } else if (suit(card) !== led && !partnerWins) {
        // He had to trump: a discard shows no trump, a trump under the one played shows none higher.
        if (suit(card) !== T) g.voids[seat][T] = true;
        else if (suit(top) === T && !beats) g.caps[seat] = Math.min(g.caps[seat], order(top, T));
      }
    }
    if (g.belote === seat && suit(card) === T && (rank(card) === 12 || rank(card) === 13)) g.said++;
    g.trick.push(card);
    g.log.push([seat, card]);
    if (g.trick.length < 4) { g.turn = (seat + 1) % 4; return g; }
    const winner = trickWinner(g.leader, g.trick, T);
    let p = 0;
    for (const c of g.trick) p += points(c, T);
    g.tricks++;
    // The dix de der is 100 when the same team took the seven tricks before: a capot (FFB 9.2).
    if (g.tricks === 8) p += g.tricksWon[team(winner)] === 7 ? LAST_CAPOT : LAST_TRICK;
    g.won[team(winner)] += p;
    g.tricksWon[team(winner)]++;
    g.last = { leader: g.leader, cards: g.trick, winner, pts: p };
    g.trick = [];
    g.leader = g.turn = winner;
    if (g.tricks === 8) scoreHand(g);
    return g;
  }
  function play(G, card) {
    if (G.phase !== 'play' || !G.hands[G.turn].includes(card) || refusal(G, card)) throw new Error('illegal card ' + card);
    return playInPlace(clone(G), card);
  }

  /* ---------- The computer players ----------
     Each one knows only its own hand, the retourne, the bids and the cards played, and what the cards
     played show: the suits a player has no more, and the trumps it cannot hold. */

  // The cards a seat has not seen yet.
  function unseen(G, seat) {
    const known = new Set(G.hands[seat]);
    for (const [, c] of G.log) known.add(c);
    return DECK.filter(c => !known.has(c));
  }

  // Bidding by counting: the jack and the nine of trumps, the other trumps, the belote and the aces.
  // cards: the 5 cards and the retourne, which the taker always gets.
  function strength(cards, trump) {
    let v = 0;
    const tr = cards.filter(c => suit(c) === trump);
    for (const c of tr) v += { 11: 3.2, 9: 2.3, 1: 1.3, 10: 1.1, 13: .9, 12: .8, 8: .7, 7: .7 }[rank(c)];
    if (tr.includes(trump * 13 + 12) && tr.includes(trump * 13 + 11)) v += 1;
    if (tr.length >= 4) v += 1;
    for (let s = 0; s < 4; s++) {
      if (s === trump) continue;
      const side = cards.filter(c => suit(c) === s);
      if (side.some(c => rank(c) === 1)) v += 1.1;
      if (side.some(c => rank(c) === 10)) v += side.some(c => rank(c) === 1) ? .6 : .2;
      if (!side.length) v += .4;
    }
    return v;
  }
  const bidCards = G => G.hands[G.turn].concat(G.turnup);
  const BID_LEVEL = { facile: 5.2, moyen: 6.1 };
  function countBid(G, level, rnd) {
    const cards = bidCards(G), need = BID_LEVEL[level] + (level === 'facile' ? (rnd() - .5) * 3 : 0);
    if (G.phase === 'bid1') return strength(cards, suit(G.turnup)) >= need ? 'take' : 'pass';
    let best = 'pass', top = need;
    for (const s of bidOptions(G)) if (s !== 'pass') { const v = strength(cards, s); if (v >= top) { top = v; best = s; } }
    return best;
  }
  // Difficile and his partner try each suit on 36 deals of the unseen cards, played to the end, and
  // take when the hand gives their team more than the other.
  function simBid(G, rnd, trials = 36) {
    const seat = G.turn, mine = G.hands[seat];
    const rest = DECK.filter(c => !mine.includes(c) && c !== G.turnup);
    const options = bidOptions(G).filter(b => b !== 'pass');
    let best = 'pass', top = 8;
    for (const b of options) {
      const trump = b === 'take' ? suit(G.turnup) : b;
      // A quick count first: a hand far too weak is not worth the trials.
      if (strength(mine.concat(G.turnup), trump) < 4.2) continue;
      let sum = 0;
      for (let t = 0; t < trials; t++) {
        const g = clone(G), pool = shuffle(rest.slice(), rnd);
        // The other hands, then the stock: what the deal gives each seat once someone takes.
        let k = 0;
        for (let s = 0; s < 4; s++) if (s !== seat) { g.hands[s] = pool.slice(k, k + 5); k += 5; }
        g.stock = pool.slice(k);
        const w = take(g, seat, trump);
        while (w.phase === 'play') playInPlace(w, heuristic(w, legal(w)));
        sum += w.handPts[team(seat)] - w.handPts[1 - team(seat)];
      }
      if (sum / trials > top) { top = sum / trials; best = b; }
    }
    return best;
  }

  // The heuristic player, used by Moyen, and by Difficile for the rest of each trial deal.
  function heuristic(G, cards) {
    if (cards.length === 1) return cards[0];
    const seat = G.turn, T = G.trump, hand = G.hands[seat], me = team(seat);
    const out = unseen(G, seat);
    const outTrumps = out.filter(c => suit(c) === T).length;
    // Nobody else can hold a card above c in its suit.
    const master = c => !out.some(o => suit(o) === suit(c) && order(o, T) > order(c, T));
    const opp = s => team(s) !== me;
    // A card's cost when it is given away: its points, a trump costs more, and a master card is worth keeping.
    const cost = c => points(c, T) * 2 + order(c, T) * .3 + (suit(c) === T ? 12 : 0) + (master(c) && suit(c) !== T ? 6 : 0);
    const cheapest = list => list.reduce((a, b) => cost(b) < cost(a) ? b : a);
    const dearest = list => list.reduce((a, b) => points(b, T) > points(a, T) || (points(b, T) === points(a, T) && order(b, T) < order(a, T)) ? b : a);
    // Opponents who may still trump a suit: known void in it, and not known void in trumps.
    const oppCuts = s => outTrumps > 0 && [1, 3].some(k => { const o = (seat + k) % 4; return G.voids[o][s] && !G.voids[o][T]; });

    if (!G.trick.length) {
      const trumps = cards.filter(c => suit(c) === T);
      const plain = cards.filter(c => suit(c) !== T);
      const takers = team(G.taker) === me;
      // The taking team draws the trumps: a master trump, or a low one to bring them out.
      if (takers && outTrumps > 0 && trumps.length) {
        const top = trumps.find(master);
        if (top !== undefined) return top;
        if (G.taker === seat && trumps.length >= 2) return trumps.reduce((a, b) => order(b, T) < order(a, T) ? b : a);
        if (G.taker !== seat && G.tricks < 2) return trumps.reduce((a, b) => order(b, T) < order(a, T) ? b : a);
      }
      // A master card that nobody can trump.
      const sure = plain.filter(c => master(c) && !oppCuts(suit(c)));
      if (sure.length) return dearest(sure);
      if (!plain.length) return trumps.find(master) ?? trumps.reduce((a, b) => order(b, T) < order(a, T) ? b : a);
      // Otherwise a small card, best in a suit his partner can trump and the others cannot, and not
      // from a suit where it leaves a 10 without its ace.
      const partner = (seat + 2) % 4;
      let pick = null, key = Infinity;
      for (const c of plain) {
        const s = suit(c), n = hand.filter(x => suit(x) === s).length;
        let k = points(c, T) * 2 + order(c, T) * .4;
        if (oppCuts(s)) k += 14;
        if (G.voids[partner][s] && !G.voids[partner][T] && outTrumps > 0) k -= 6;
        if (hand.some(x => suit(x) === s && rank(x) === 10) && !hand.some(x => suit(x) === s && rank(x) === 1) && rank(c) !== 10 && n <= 2) k += 6;
        if (k < key) { key = k; pick = c; }
      }
      return pick;
    }

    const win = bestOf(G.trick, T), winSeat = (G.leader + win) % 4, top = G.trick[win];
    const led = suit(G.trick[0]);
    let trickPts = 0;
    for (const c of G.trick) trickPts += points(c, T);
    const after = [];
    for (let k = G.trick.length + 1; k < 4; k++) after.push((G.leader + k) % 4);
    // Can a player of the other team, still to play, beat card c?
    const beaten = c => after.some(s => {
      if (!opp(s)) return false;
      const voidLed = G.voids[s][led] || !out.some(o => suit(o) === led);
      const higherTrump = o => suit(o) === T && order(o, T) < G.caps[s] && (suit(c) !== T || order(o, T) > order(c, T));
      const canTrump = !G.voids[s][T] && out.some(higherTrump);
      if (suit(c) === T) return (led === T || voidLed) && canTrump;
      if (!voidLed && out.some(o => suit(o) === suit(c) && order(o, T) > order(c, T))) return true;
      return voidLed && canTrump;
    });
    const beats = c => bestOf(G.trick.concat(c), T) === G.trick.length;

    if (!opp(winSeat)) {
      // His partner wins the trick. Sure of it: give points. Not sure: give little.
      if (!beaten(top) && led !== T) {
        const plain = cards.filter(c => suit(c) !== T);
        return dearest(plain.length ? plain : cards);
      }
      return cheapest(cards);
    }
    const winners = cards.filter(beats);
    if (winners.length) {
      const safe = winners.filter(c => !beaten(c));
      // The cheapest card that wins for sure. Otherwise a cut is worth trying, and a high card on a trick with points.
      if (safe.length) return safe.reduce((a, b) => (suit(a) === T) !== (suit(b) === T) ? (suit(a) === T ? b : a) : order(b, T) < order(a, T) ? b : a);
      const cut = winners.filter(c => suit(c) === T && led !== T);
      if (cut.length) return cut.reduce((a, b) => order(b, T) < order(a, T) ? b : a);
      if (trickPts >= 10 && G.trick.length === 2) return winners.reduce((a, b) => order(b, T) > order(a, T) ? b : a);
    }
    return cheapest(cards);
  }

  // Facile: often any legal card; otherwise its highest card when it can win, and its lowest when not.
  function easy(G, cards, rnd) {
    if (rnd() < .45) return cards[Math.floor(rnd() * cards.length)];
    const T = G.trump;
    if (!G.trick.length) return cards.reduce((a, b) => order(b, T) > order(a, T) ? b : a);
    const win = cards.filter(c => bestOf(G.trick.concat(c), T) === G.trick.length);
    if (win.length) return win.reduce((a, b) => order(b, T) > order(a, T) ? b : a);
    return cards.reduce((a, b) => order(b, T) < order(a, T) ? b : a);
  }

  // Deals of the unseen cards that fit what the seat knows: how many cards each seat holds, the voids,
  // the trumps a seat cannot hold, and the retourne, which the taker holds until played. Each fitting
  // deal is equally likely: a card goes to a seat in proportion to the ways to deal the rest after it.
  function dealer(G, seat) {
    const others = [0, 1, 2, 3].filter(s => s !== seat);
    const T = G.trump;
    const turnupOut = G.taker !== seat && !G.log.some(x => x[1] === G.turnup);
    // After "Belote !", the other card of the pair is still in the hand that said it.
    const K = T * 13 + 12, Q = T * 13 + 11;
    const pending = G.belote !== null && G.belote !== seat && G.said === 1 ? (G.log.some(x => x[1] === K) ? Q : K) : null;
    const fits = (c, s) => {
      if (turnupOut && c === G.turnup) return s === G.taker;
      if (c === pending) return s === G.belote;
      if (G.voids[s][suit(c)]) return false;
      if (suit(c) === T && order(c, T) >= G.caps[s]) return false;
      return true;
    };
    const cards = unseen(G, seat);
    const masks = cards.map(c => others.reduce((m, s, k) => fits(c, s) ? m | 1 << k : m, 0));
    const need = others.map(s => G.hands[s].length);
    const n = cards.length;
    const memo = new Map();
    const ways = (i, a, b) => {
      const c = n - i - a - b;
      if (a < 0 || b < 0 || c < 0) return 0;
      if (i === n) return 1;
      const k = (i * 10 + a) * 10 + b;
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
        while (!w[k]) k--;
        if (k === 0) a--; else if (k === 1) b--;
        g.hands[others[k]].push(cards[i]);
      }
      for (const s of others) g.hands[s] = sortHand(g.hands[s], T);
      // An unannounced belote is not known: it comes from the deal imagined, whether or not the real deal has one.
      if (g.belote !== seat && g.said === 0) {
        const h = g.hands.findIndex(x => x.includes(K) && x.includes(Q));
        g.belote = h >= 0 ? h : null;
      }
      return g;
    };
  }
  const sampleDeal = (G, seat, rnd) => { const d = dealer(G, seat); return d ? d(rnd) : null; };

  // Difficile: each legal card tried on many deals that fit what it knows, each played to the end
  // with the heuristic; it keeps the card that gives its team the most points.
  function monteCarlo(G, cards, rnd, trials) {
    const seat = G.turn, total = new Map(cards.map(c => [c, 0]));
    const deal = dealer(G, seat);
    if (!deal) return heuristic(G, cards);
    for (let t = 0; t < trials; t++) {
      const world = deal(rnd);
      for (const c of cards) {
        const g = playInPlace(clone(world), c);
        while (g.phase === 'play') playInPlace(g, heuristic(g, legal(g)));
        total.set(c, total.get(c) + g.handPts[team(seat)] - g.handPts[1 - team(seat)]);
      }
    }
    let best = cards[0];
    for (const c of cards) if (total.get(c) > total.get(best)) best = c;
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
  const decisionRnd = (G, salt) => seeded((G.seed ^ Math.imul(G.log.length + G.bids.length * 40 + 1, 0x9E3779B1) ^ Math.imul(salt + 7, 0x85EBCA77)) >>> 0);

  const LEVELS = { facile: 0, moyen: 1, fort: 2 };
  function choosePlay(G, level, rnd = decisionRnd(G, G.turn), opts = {}) {
    const cards = legal(G);
    if (cards.length === 1) return cards[0];
    if (level === 'facile') return easy(G, cards, rnd);
    if (level === 'moyen') return heuristic(G, cards);
    return monteCarlo(G, cards, rnd, opts.trials || 30);
  }
  function chooseBid(G, level, rnd = decisionRnd(G, 20 + G.turn)) {
    if (level === 'fort') return simBid(G, rnd);
    return countBid(G, level, rnd);
  }

  // A saved game read back: every field there, of the right kind, and the 32 cards each in one place.
  function check(G) {
    try {
      const isCard = c => Number.isInteger(c) && DECK.includes(c);
      const isSeat = s => Number.isInteger(s) && s >= 0 && s < 4;
      const isSuit = isSeat;
      if (!G || typeof G !== 'object') return false;
      if (!['bid1', 'bid2', 'play', 'done', 'over'].includes(G.phase)) return false;
      if (!Array.isArray(G.scores) || G.scores.length !== 2 || !G.scores.every(Number.isFinite)) return false;
      if (!Number.isInteger(G.target) || G.target < 1 || !isSeat(G.dealer) || !Number.isInteger(G.handNo)) return false;
      if (!Array.isArray(G.hands) || G.hands.length !== 4 || !G.hands.every(h => Array.isArray(h) && h.every(isCard))) return false;
      if (!Array.isArray(G.log) || !G.log.every(x => Array.isArray(x) && isSeat(x[0]) && isCard(x[1]))) return false;
      if (!Array.isArray(G.trick) || !G.trick.every(isCard) || G.trick.length > 3) return false;
      if (!Array.isArray(G.stock) || !G.stock.every(isCard) || !isCard(G.turnup)) return false;
      if (!Array.isArray(G.bids) || !Array.isArray(G.voids) || G.voids.length !== 4 || !Array.isArray(G.caps) || G.caps.length !== 4) return false;
      if (!Array.isArray(G.won) || !Array.isArray(G.tricksWon) || !Number.isInteger(G.seed) || !isSeat(G.turn)) return false;
      const pair = (a, ok) => Array.isArray(a) && a.length === 2 && a.every(ok);
      if (!pair(G.won, Number.isInteger) || !pair(G.tricksWon, Number.isInteger)) return false;
      if (!G.bids.every(b => Array.isArray(b) && b.length === 2 && isSeat(b[0]) && (b[1] === 'pass' || b[1] === 'take' || isSuit(b[1])))) return false;
      if (!G.voids.every(v => Array.isArray(v) && v.length === 4 && v.every(x => typeof x === 'boolean'))) return false;
      if (!G.caps.every(c => Number.isInteger(c) && c >= 0 && c <= 8)) return false;
      if (!Number.isInteger(G.tricks) || G.tricks < 0 || G.tricks > 8) return false;
      const all = G.hands.flat().concat(G.log.map(x => x[1]), G.stock);
      if (G.phase.startsWith('bid')) all.push(G.turnup);
      if (new Set(all).size !== all.length || all.length !== 32) return false;
      if (G.phase.startsWith('bid')) {
        if (G.taker !== null || G.trump !== null) return false;
        if (!G.hands.every(h => h.length === 5) || G.stock.length !== 11 || G.log.length || G.trick.length || G.tricks) return false;
      } else {
        if (!isSeat(G.taker) || !isSuit(G.trump) || !isSeat(G.leader) || G.stock.length) return false;
        if (G.log.length !== G.tricks * 4 + G.trick.length || G.trick.length !== G.log.length % 4) return false;
        if (!G.hands.every((h, s) => h.length === 8 - G.tricks - (G.trick.length > ((s - G.leader + 4) % 4) ? 1 : 0))) return false;
        if (G.phase === 'play' && (G.tricks === 8 || G.turn !== (G.leader + G.trick.length) % 4)) return false;
        if (!(G.belote === null || isSeat(G.belote)) || ![0, 1, 2].includes(G.said)) return false;
        const L = G.last;
        if (L !== null && !(L && isSeat(L.leader) && isSeat(L.winner) && Array.isArray(L.cards) && L.cards.length === 4 && L.cards.every(isCard) && Number.isInteger(L.pts))) return false;
        if (G.phase !== 'play' && (G.tricks !== 8 || !pair(G.handPts, Number.isInteger) || !['made', 'dedans', 'capot'].includes(G.outcome) || ![null, 0, 1].includes(G.capot))) return false;
        if (G.phase === 'over' && !(G.result && (G.result.winner === 0 || G.result.winner === 1))) return false;
      }
      return true;
    } catch (e) { return false; }
  }

  const api = { DECK, RANKS, TARGET, suit, rank, team, order, points, sortHand, newGame, nextHand, bidOptions, bid, legal, refusal,
    play, bestOf, trickWinner, strength, chooseBid, choosePlay, sampleDeal, unseen, seeded, check, LEVELS };
  root.Belote = api;
})(typeof self !== 'undefined' ? self : globalThis);
