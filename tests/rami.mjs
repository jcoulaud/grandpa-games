// Plays the rami with a real mouse: taking a card, refusals, opening with 51 points, adding to a
// combination, throwing, Odette's turn, the sort, undo, the hint, reloads, the win, the loss, broken and
// old saves, the rules pages, and the layout at every window size of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('rami');

let page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
const errors = [];
const watch = p => p.on('pageerror', e => errors.push(e.message));
watch(page);
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
// Cards by name: "QS" the dame de pique, "8H" the 8 de cœur, "10D", "AC", "JK" a joker.
const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => n === 'JK' ? 52 : n === 'JK2' ? 53 : SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
// Clicks a card of his hand where it shows, then moves the mouse away and waits past the double-click time.
const at = sel => g(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + Math.min(14, b.width / 2), b.top + Math.min(18, b.height / 2)]; }, sel);
const mid = sel => g(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
const clickAt = async xy => { await page.mouse.click(...xy); await page.mouse.move(5, 5); await wait(560); };
const clickCard = async n => clickAt(await at(`.card.hand[data-c="${card(n)}"]`));
const clickEl = async sel => clickAt(await mid(sel));
const clickMeld = async i => clickEl(`.meld[data-m="${i}"]`);
const waitFor = async (fn, arg, tries = 100) => { for (let i = 0; i < tries && !(await g(fn, arg)); i++) await wait(100); return g(fn, arg); };
// Puts a game on the table: the two hands, the défausse (its top card last), the combinations, and the
// pioche (the next card last). The other cards go under the pioche.
const setGame = (hands, opts = {}) => g(([hands, opts]) => {
  cancelAll();
  const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const card = n => n === 'JK' ? 52 : n === 'JK2' ? 53 : SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
  const cards = s => s.split(' ').filter(Boolean).map(card);
  const hs = hands.map(cards), st = cards(opts.stock || ''), pl = cards(opts.pile || '');
  const ms = (opts.melds || []).map(([owner, s]) => { const m = RA.combo(cards(s)); return { owner, type: m.type, slots: m.slots }; });
  const used = new Set([...hs.flat(), ...st, ...pl, ...ms.flatMap(m => m.slots.map(x => x[0]))]);
  const rest = [...Array(54).keys()].filter(c => !used.has(c));
  G = { v: 1, hands: hs, stock: [...rest, ...st], pile: pl, melds: ms, opened: [ms.some(m => m.owner === 0), ms.some(m => m.owner === 1)],
    turn: 0, phase: 'draw', taken: null, took: [[], []], turns: [0, 0], rs: 7, seed: 9, n: 0, last: { kind: 'deal', seat: null }, result: null, ...(opts.extra || {}) };
  if (!RA.valid(JSON.parse(JSON.stringify(G)))) throw new Error('impossible game: ' + hands.join(' | '));
  undo = []; hint = null; sel = new Set(); started = true;
  clearCards(); save(); say(turnMessage()); render();
  if (G.turn !== 0) later(step, 200);
}, [hands, opts]).then(() => wait(300));
// The layout at the window size in use: nothing past the sides, no text under 20 px (13 on a phone), no
// button under 44 px, no text cut, and the places of the table inside it, apart from each other.
// table: only the table and the message line. The shared bar runs past the side between 701 and 820 px.
const layoutCheck = (table = false) => g(table => {
  const bad = [];
  const z = Zoom.z(), phone = innerWidth < 700;
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden], .sr'); };
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left / z, r: r.right / z, t: r.top / z, b: r.bottom / z, w: r.width / z, h: r.height / z }; };
  const W = innerWidth / z;
  const shown = [...document.body.querySelectorAll('*')].filter(e => vis(e) && !e.closest('#confetti, #help:not(.on), #over:not(.on), svg, .fly') && !(table && e.closest('#bar')));
  for (const e of shown) {
    const r = R(e);
    if (r.l < -1 || r.r > W + 1) bad.push('past the side: ' + (e.id || e.className || e.tagName));
    const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && !e.closest('.card, .fan') && parseFloat(getComputedStyle(e).fontSize) < (phone ? 13 : 20)) bad.push('small text: ' + e.textContent.trim().slice(0, 30));
    const box = e.closest('.seat, .zlabel');
    if (own && box && box !== e) { const b = R(box); if (r.l < b.l - 1 || r.r > b.r + 1) bad.push('text out of its box: ' + e.textContent.trim().slice(0, 30)); }
    if (e.matches('button, a#home') && r.h < 44 - .5) bad.push('small button: ' + e.textContent.trim().slice(0, 30));
  }
  const m = document.getElementById('msg');
  if (m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1) bad.push('message cut');
  const t = R(document.getElementById('table'));
  const places = ['opp', 'stock', 'pileBox', 'layBtn', 'throwBtn', 'sortBtn', 'zone0', 'zone1'].map(id => document.getElementById(id)).filter(vis);
  for (const e of places) { const r = R(e); if (r.l < t.l - 1 || r.r > t.r + 1 || r.t < t.t - 1 || r.b > t.b + 1) bad.push('outside the table: ' + e.id); }
  const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++)
    if (hit(R(places[i]), R(places[j]))) bad.push(`overlap: ${places[i].id} and ${places[j].id}`);
  // Each combination stays inside its zone, clear of the other combinations and of the label.
  const melds = [...document.querySelectorAll('.meld')];
  melds.forEach((e, i) => {
    const mm = G.melds[+e.dataset.m], zone = R(document.getElementById('zone' + mm.owner)), r = R(e);
    if (r.l < zone.l - 1 || r.r > zone.r + 1 || r.t < zone.t - 1 || r.b > zone.b + 1) bad.push('combination out of its zone');
    if (hit(r, R(document.querySelector(`#zone${mm.owner} .zlabel`)))) bad.push('combination over the label');
    for (let j = i + 1; j < melds.length; j++) if (hit(r, R(melds[j]))) bad.push('two combinations overlap');
  });
  // The corner of each card of his hand is in view, clear of the places.
  const hand = [...document.querySelectorAll('.card.hand')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  hand.forEach((e, i) => {
    const r = R(e), corner = { l: r.l, r: r.l + r.w * .3, t: r.t, b: r.t + r.h * .3 };
    if (corner.b > t.b + 1) bad.push('hand corner below the window');
    if (i < hand.length - 1 && R(hand[i + 1]).l - r.l < r.w * .25) bad.push('hand corner covered');
    for (const p of places) if (hit(corner, R(p))) bad.push('hand corner under ' + p.id);
  });
  return bad;
}, table);

// Every corner index can be read: inside the table and the window, and on top at its own place, under
// no other card, label or key. The cards on the table take no clicks, so the check lets them for a moment.
const indexCheck = () => g(() => {
  const bad = [], t = document.getElementById('table').getBoundingClientRect();
  const on = document.createElement('style');
  on.textContent = '.card { pointer-events: auto !important; }';
  document.head.appendChild(on);
  const labels = [...document.querySelectorAll('.mlab, #gauge, .pill, .gbar, .badge')].filter(l => l.offsetWidth);
  for (const e of document.querySelectorAll('.card.hand, .card.mc, .card.pile.top')) {
    const ix = e.querySelector(e.classList.contains('mc') ? '.mx' : '.ix'), r = ix.getBoundingClientRect();
    if (r.left < t.left - 1 || r.right > t.right + 1 || r.top < t.top - 1 || r.bottom > Math.min(t.bottom, innerHeight) + 1) bad.push('index clipped: ' + e.dataset.c);
    for (const [fx, fy] of [[.2, .15], [.8, .15], [.5, .5], [.2, .85], [.8, .85]]) {
      const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy)?.closest('.card:not(.flipback)');
      if (hit !== e) { bad.push(`index covered: ${e.dataset.c} by ${hit ? hit.dataset.c : 'something else'}`); break; }
    }
    for (const l of labels) {
      const b = l.getBoundingClientRect();
      if (r.left < b.right - 1 && b.left < r.right - 1 && r.top < b.bottom - 1 && b.top < r.bottom - 1) bad.push(`index ${e.dataset.c} under ${l.className || l.id}`);
    }
  }
  on.remove();
  return bad;
});
const gauge = () => g(() => { const e = document.getElementById('gauge'); return e.offsetWidth ? e.textContent + (e.classList.contains('full') ? ' (gold)' : '') : null; });

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/rami-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
await wait(300);
ok(!(await g(() => Kit.isOpen())) && await g(() => level === 'moyen'), 'the level is chosen after the rules');
ok((await g(() => document.getElementById('level').textContent)) === 'Niveau moyen', 'the level shows under the name');
ok(await g(() => G.hands.every(h => h.length === 13) && G.pile.length === 1 && G.turn === 0 && G.phase === 'draw'), 'a new game deals 13 cards each, and he starts');
ok((await msg()) === 'Prenez une carte : la pioche ou la défausse.', 'the line says what to do: ' + await msg());
ok(await g(() => !document.getAnimations().length && !document.querySelector('.card.fly, .flipback') && document.querySelectorAll('.card.hand').length === 13),
  'with reduced motion, the deal places the cards at once');
ok((await gauge()) === 'Ouverture : 0 / 51 points', 'the opening gauge shows by his zone: ' + await gauge());
ok(await g(() => document.querySelector('#opp img').getAttribute('src') === '../lib/avatars/odette.webp' && document.querySelector('#opp .badge').textContent === '13 cartes'
  && document.querySelectorAll('#opp .fan i').length === 13), "Odette's seat shows her face, a fan of 13 backs and \"13 cartes\"");
let bad = await layoutCheck();
ok(!bad.length, 'the table fits at 1366x680 ' + bad.join(', '));
ok(await g(() => L.w >= 100), `his cards are ${await g(() => L.w)} px wide at 1366x680`);
await page.screenshot({ path: `${OUT}/rami-start.png` });

// 2. Taking a card: a card of his hand first is refused, then the défausse.
await setGame(['KS KH KC QD JD 10D 9D 5H 6H 2C 3S 4S 8C', 'AS 2S 3H 4H 9C 10C JC 7D 7S 2H 3D 4D 5D'], { pile: '7C', stock: '9S' });
ok(await g(() => document.getElementById('stock').classList.contains('can') && document.getElementById('pileBox').classList.contains('can')), 'the pioche and the défausse are framed in yellow');
await clickCard('KS');
ok((await msg()) === "Prenez d'abord une carte : la pioche ou la défausse." && await g(() => !sel.size), 'a card of his hand before taking one is refused: ' + await msg());
ok(await g(() => document.getElementById('bubble').classList.contains('on')), 'the reason also shows in a bubble');
// With reduced motion, nothing flies: a card drawn is at its place in his hand in the same instant.
ok(await g(() => {
  const s = JSON.stringify(G);
  tapStock();
  const e = document.querySelector(`.card.hand[data-c="${G.last.card}"]`);
  const still = G.last.from === 'stock' && !document.getAnimations().length && getComputedStyle(e).translate === 'none' && !e.querySelector('.flipback');
  G = JSON.parse(s); undo = []; say(turnMessage()); render();
  return still;
}), 'with reduced motion, a card drawn from the pioche is in his hand at once');
await clickEl('#pileBox');
ok(await g(c => G.phase === 'play' && G.taken === c && G.hands[0].includes(c), card('7C')), 'a click on the défausse takes its card');

ok((await msg()).startsWith('Vous prenez le 7 de trèfle de la défausse.'), 'the line says it: ' + await msg());
ok(await g(c => document.querySelector(`.card.hand[data-c="${c}"] .tag`)?.textContent === 'Prise', card('7C')), 'the card taken carries a "Prise" tag');
await clickEl('#stock');
ok((await msg()).startsWith('Vous avez déjà pris une carte'), 'a second card is refused: ' + await msg());
// The card taken cannot go back.
await clickCard('7C');
await clickEl('#pileBox');
ok((await msg()) === 'Vous venez de prendre le 7 de trèfle à la défausse : jetez une autre carte.' && await g(() => G.phase === 'play'), 'the card taken from the défausse cannot be thrown back: ' + await msg());
await clickCard('7C');

// 3. Choosing cards: they rise with a ring; a double-click counts once; the line says the next step.
await clickCard('5H');
ok(await g(c => sel.has(c) && document.querySelector(`.card.hand[data-c="${c}"]`).classList.contains('sel'), card('5H')), 'a click chooses a card, which rises with a yellow ring');
ok((await msg()).startsWith('Cliquez sur la défausse pour jeter le 5 de cœur'), 'the line says how to throw it: ' + await msg());
await clickCard('5H');
ok(await g(() => !sel.size), 'a second click puts it back');
const xy = await at(`.card.hand[data-c="${card('6H')}"]`);
await page.mouse.dblclick(...xy); await page.mouse.move(5, 5); await wait(560);
ok(await g(c => sel.size === 1 && sel.has(c), card('6H')), 'a double-click chooses the card once');
await clickCard('6H');

// 4. Opening: 39 points are refused with what is missing, then 60 points open.
for (const n of ['KS', 'KH', 'KC']) await clickCard(n);
ok((await gauge()) === 'Ouverture : 30 / 51 points', 'the gauge counts the brelan of rois: ' + await gauge());
await clickCard('JD');
ok(await g(() => !document.getElementById('layBtn').disabled && document.getElementById('layBtn').classList.contains('primary')), '"Poser" is yellow once 3 cards are chosen');
await clickEl('#layBtn');
ok((await msg()) === 'Ces cartes ne font pas de combinaison : une suite de même couleur, ou des cartes de même valeur.', 'cards that make no combination: ' + await msg());
await clickCard('JD');
await clickEl('#layBtn');
ok((await msg()) === 'Il manque 21 points pour ouvrir : il en faut 51.' && await g(() => !G.opened[0]), 'a brelan of rois alone: the line says what is missing: ' + await msg());
for (const n of ['QD', 'JD', '10D']) await clickCard(n);
ok((await gauge()) === 'Ouverture : 60 / 51 points (gold)' && await g(() => document.getElementById('layBtn').hasAttribute('data-nudge')),
  'with the suite of carreau the gauge reads 60, turns gold and "Poser" is the next key: ' + await gauge());
await clickEl('#layBtn');
ok(await g(() => G.opened[0] && G.melds.length === 2 && G.hands[0].length === 8 && !sel.size), 'the rois and the suite of carreau open the game');
ok((await msg()).startsWith('Vous posez 2 combinaisons : vous ouvrez avec 60 points.'), 'the line says it: ' + await msg());
ok((await gauge()) === null && await g(() => document.querySelector('.ribbon')?.textContent === 'Ouvert ! 60 points'), 'the gauge leaves with a gold "Ouvert ! 60 points" ribbon');
ok(await g(() => !document.getAnimations().length && !document.querySelector('.shimmer')), 'with reduced motion, the laid cards are on their trays at once');
ok(await g(() => [...document.querySelectorAll('.mlab')].map(e => e.textContent).sort().join() === 'Brelan,Suite'), 'each tray says "Suite" or "Brelan"');
ok(await g(() => document.querySelectorAll('#zone0 ~ .meld').length === 2 || document.querySelectorAll('.meld').length === 2), 'his two combinations lie in his zone');
bad = await layoutCheck();
ok(!bad.length, 'the table fits with his combinations ' + bad.join(', '));
await page.screenshot({ path: `${OUT}/rami-opened.png` });

// 5. Adding: the 9 de carreau goes on his suite; the meld it fits is framed.
await clickCard('9D');
const suite = await g(() => G.melds.findIndex(m => m.type === 'run'));
ok(await g(i => document.querySelector(`.meld[data-m="${i}"]`).classList.contains('can'), suite), 'the combination the card fits is framed in yellow');
await clickMeld(await g(() => G.melds.findIndex(m => m.type === 'set')));
ok((await msg()) === 'Le 9 de carreau ne va pas sur cette combinaison.' && await g(c => sel.has(c), card('9D')), 'a card that does not fit says why, and stays chosen: ' + await msg());
await clickMeld(suite);
ok(await g(([i, c]) => G.melds[i].slots.length === 4 && G.melds[i].slots[0][0] === c && !sel.size, [suite, card('9D')]), 'a click on his suite adds the 9 de carreau');
ok((await msg()).startsWith('Vous ajoutez le 9 de carreau à votre suite.'), 'the line says it: ' + await msg());

// 6. Sorting by value, then by colour.
const order = () => g(() => [...document.querySelectorAll('.card.hand:not(.grp)')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(e => +e.dataset.c));
await clickEl('#sortBtn');
const byRank = await order();
ok(await g(o => sortBy === 'rank' && o.every((c, i) => !i || RA.rank(o[i - 1]) <= RA.rank(c) || RA.isJ(c)), byRank), 'the hand is sorted by value');
ok((await g(() => document.getElementById('sortBtn').textContent)) === 'Trier par couleur', 'the key now offers the colour');
await clickEl('#sortBtn');
ok(await g(() => sortBy === 'suit'), 'and back by colour');

// 7. The hint: the best card to throw, framed with the défausse.
await page.click('#hintBtn');
ok(await g(() => hint && hint.type === 'throw' && !!document.querySelector('.card.hand.hint') && document.getElementById('pileBox').classList.contains('hint')), 'the hint frames a card to throw and the défausse: ' + await msg());
await page.keyboard.press('Escape');
ok(await g(() => !hint), 'Escape takes the hint away');

// 8. Throwing: one card, then a click on the défausse. Odette plays, and the line names what she does.
const snap = await g(() => JSON.stringify(G));
await clickCard('2C');
await clickEl('#pileBox');
ok(await g(c => RA.top(G) === c && G.turn === 1, card('2C')) && (await msg()) === 'Vous jetez le 2 de trèfle. Odette réfléchit…', 'a card is thrown on the défausse: ' + await msg());
ok(await waitFor(() => G.turn === 1 && G.phase === 'play') && /^Odette prend (une carte de la pioche|le 2 de trèfle de la défausse)\.$/.test(await msg()), 'Odette takes a card, and the line says it: ' + await msg());
ok(await g(() => document.getElementById('opp').classList.contains('turn')), 'her seat shows she plays');
ok(await waitFor(() => G.turn === 0) && /^Odette jette .*\. À vous : prenez une carte, la pioche ou la défausse\.$/.test(await msg()), 'she throws a card, then his turn comes: ' + await msg());

// 9. Undo takes back his throw and her turn.
await page.click('#undoBtn');
await wait(200);
ok((await g(() => JSON.stringify(G))) === snap, 'undo puts the table back as it was before his throw');
ok((await msg()).startsWith('Coup annulé.'), 'the line says the move is taken back');

// 10. A reload keeps the game, the level and the sort.
await clickEl('#sortBtn');
await g(() => GG.flush());
await page.reload(); await wait(400);
ok((await g(() => JSON.stringify(G))) === snap && await g(() => level === 'moyen' && sortBy === 'rank'), 'a reload brings back the same game, level and sort');
await clickEl('#sortBtn');

// 11. Adding to Odette's combination, and the hint that opens.
await setGame(['8H 2C 3S 9S', '4D 5D 6D 7D'], { melds: [[0, 'KS KH KC'], [1, '5H 6H 7H']], extra: { phase: 'play' } });
await clickCard('8H');
await clickMeld(1);
ok(await g(() => G.melds[1].slots.length === 4 && G.melds[1].owner === 1), 'his card goes on Odette\'s suite');
ok((await msg()).startsWith("Vous ajoutez le 8 de cœur à la suite d'Odette."), 'the line says it: ' + await msg());
await setGame(['KS KH KC QD JD 10D 2C 3S 9S', '4D 5D 6D 7D'], { extra: { phase: 'play' } });
await page.click('#hintBtn');
ok(await g(() => hint && hint.type === 'lay' && document.querySelectorAll('.card.hand.hint').length === 6) && /^Vous pouvez ouvrir avec 60 points/.test(await msg()), 'the hint shows the cards that open: ' + await msg());
// Before opening, nothing goes on the table.
await setGame(['8H 2C 3S 9S', '4D 5D 6D 7D'], { melds: [[1, '5H 6H 7H']], extra: { phase: 'play' } });
await clickCard('8H');
await clickMeld(0);
ok((await msg()) === "Ouvrez d'abord avec 51 points : ensuite vous pourrez ajouter des cartes." && await g(() => G.melds[0].slots.length === 3), 'before opening, a card cannot go on the table: ' + await msg());

// 12. The win: his last card thrown. It counts once.
await setGame(['9S', 'KD 5C JK 2H'], { melds: [[0, 'KS KH KC']], extra: { phase: 'play' } });
await clickCard('9S');
await clickEl('#pileBox');
await page.locator('#over.on').waitFor();
ok(await g(() => G.phase === 'over' && G.result.winner === 0 && stats.won === 1), 'he wins with his last card thrown');
ok((await g(() => document.getElementById('overTitle').textContent)) === 'Bravo, vous avez gagné !', 'the win sheet shows');
ok(/Odette garde 37 points en main\./.test(await g(() => document.getElementById('overText').textContent)), 'it says the points left in her hand: joker 20, roi 10, 5 and 2: ' + await g(() => document.getElementById('overText').textContent));
await page.screenshot({ path: `${OUT}/rami-won.png` });
ok((await g(() => GG.meta('rami').summary)) === '1 victoire', 'the library tile shows the win');
await g(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => stats.won === 1 && G.phase === 'over' && !Kit.isOpen()) && /^Bravo, vous avez gagné/.test(await msg()), 'a reload does not count the win again');
// The win by laying the last cards.
await g(() => { wonNow = false; });
await setGame(['2C 3C 4C', 'KD 5C'], { melds: [[0, 'KS KH KC']], extra: { phase: 'play' } });
for (const n of ['2C', '3C', '4C']) await clickCard(n);
await clickEl('#layBtn');
await page.locator('#over.on').waitFor();
ok(await g(() => G.result.winner === 0 && stats.won === 2) && /en posant vos dernières cartes/.test(await g(() => document.getElementById('overText').textContent)), 'laying his last cards wins too');
await g(() => Kit.closeDialog());

// 13. The loss: Odette lays her last cards.
await g(() => { wonNow = false; });
await setGame(['9S 2D 5H', '4D 5D 6D'], { melds: [[1, 'KS KH KC']], stock: 'AC', extra: { turn: 1 } });
await page.locator('#over.on').waitFor({ timeout: 15000 });
ok(await g(() => G.phase === 'over' && G.result.winner === 1 && stats.won === 2), 'Odette goes out');
ok((await g(() => document.getElementById('overTitle').textContent)) === 'Odette a gagné' && /Il vous reste 16 points en main\./.test(await g(() => document.getElementById('overText').textContent)), 'the sheet says she won and his points: ' + await g(() => document.getElementById('overText').textContent));
await g(() => Kit.closeDialog());

// 14. The levels: "Nouvelle partie" asks, the level is kept.
await page.click('#newBtn');
await page.getByRole('button', { name: 'Difficile', exact: true }).click();
await wait(300);
ok(await g(() => level === 'fort' && document.getElementById('level').textContent.startsWith('Niveau difficile') && stats.won === 2 && G.hands[0].length === 13), 'Difficile is chosen, the wins stay');

// 15. A broken save starts a new game; an old save without a level loads at Facile.
await g(() => { localStorage.setItem('gg:save:rami', JSON.stringify({ updatedAt: 1, summary: '', data: { v: 1, level: 'moyen', stats: { won: 4 }, G: { v: 1, hands: [[1, 2]] } } })); });
await page.reload(); await wait(400);
ok(await g(() => RA.valid(G) && G.hands[0].length === 13 && level === 'moyen' && stats.won === 4), 'a broken save starts a new game, with its level and wins');
ok((await msg()).includes("n'a pas pu être relue"), 'the line says why');
await g(() => { const s = JSON.parse(localStorage.getItem('gg:save:rami')); delete s.data.level; delete s.data.G.took; delete s.data.G.turns; s.updatedAt++; localStorage.setItem('gg:save:rami', JSON.stringify(s)); });
await page.reload(); await wait(400);
ok(await g(() => level === 'facile' && RA.valid(G) && G.turns.length === 2) && !(await g(() => Kit.isOpen())), 'an old save without a level loads at Facile');
await page.close();

// 16. Every window and size of docs/design.md: a full hand, many combinations on both sides and the
// longest message fit, and so does the end sheet.
const CROWD = [['AS 3S 5S 7S 9S JS KS 2H 4H 6H 8H 10H QH 9C', '2S 4S'], { pile: '10C',
  melds: [[0, 'KC KD KH'], [0, '5C 6C 7C 8C'], [0, 'QD QS QC'], [0, 'AD 2D 3D 4D'], [1, '9D 10D JD'], [1, '2C 3C 4C'], [1, 'JH JC JK'], [1, '5D 6D 7D']],
  extra: { phase: 'play' } }];
const sizes = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [1366, 680, 1.3], [1920, 1000, 1.75], [390, 760, 1]];
for (const [w, h, z] of sizes) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  watch(p);
  await p.addInitScript(z => localStorage.setItem('gg:zoom', JSON.stringify(z)), z);
  page = p;
  await p.goto(URL); await wait(300);
  const name = `${w}x${h}${z > 1 ? ' at ' + z * 100 + ' %' : ''}`;
  if (h / z >= 620) {
    let fit = true;
    for (let n = 0; n < 5; n++) { fit &&= await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }); await p.click('#helpNext'); }
    ok(fit, `${name}: every rules page fits without scrolling`);
  } else await p.click('#helpClose');
  await p.getByRole('button', { name: 'Facile', exact: true }).click();
  await wait(300);
  ok(await g(z => Zoom.z() === z, z), `${name}: the page is at ${z * 100} %`);
  bad = [...await layoutCheck(w < 820 && w > 700), ...await indexCheck()];
  ok(!bad.length, `${name}: the table fits at the deal, every index in view ${bad.join(', ')}`);
  await setGame(...CROWD);
  await g(() => say('Odette jette le 10 de carreau. La pioche est vide : la défausse est mélangée. À vous : prenez une carte, la pioche ou la défausse.'));
  for (const n of ['AS', '3S']) await clickCard(n);
  bad = await layoutCheck(w < 820 && w > 700);
  ok(!bad.length, `${name}: 14 cards, 8 combinations and the longest message fit ${bad.join(', ')}`);
  bad = await indexCheck();
  ok(!bad.length, `${name}: every corner index of his hand, the trays and the défausse can be read ${bad.join(', ')}`);
  ok(await g(() => L.w >= (innerWidth < 700 ? 50 : 54) && document.querySelector('.card.mc').offsetWidth >= (innerWidth < 700 ? 34 : 40)), `${name}: his cards are ${await g(() => L.w)} px, the cards on the table ${await g(() => document.querySelector('.card.mc').offsetWidth)} px`);
  await p.screenshot({ path: `${OUT}/rami-${w}x${h}${z > 1 ? '-' + z : ''}.png` });
  await setGame(['9S', 'KD 5C JK 2H'], { melds: [[0, 'KS KH KC']], extra: { phase: 'play' } });
  await clickCard('9S');
  await clickEl('#pileBox');
  await p.locator('#over.on').waitFor();
  ok(await g(() => { const r = document.getElementById('box').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; }), `${name}: the end sheet fits`);
  await p.close();
}

// 17. With motion: the deal flies in and turns his cards over, a drawn card turns over on its way, laid
// cards land 60 ms apart on a tray that grows in and shimmers, a refused "Poser" rocks the cards, and a
// win lifts his trays in a wave before the cards of the four suits and the dialog, which waits for the rules.
page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
watch(page);
await page.goto(URL); await wait(300);
await page.click('#helpClose');
await page.getByRole('button', { name: 'Facile', exact: true }).click();
await wait(150);
ok(await g(() => document.querySelectorAll('.card.hand .flipback').length === 13 && document.querySelectorAll('.card.down.fly').length === 13),
  'the deal: his 13 cards turn over in flight and 13 backs fly to Odette');
const dealDelays = await g(() => [...document.querySelectorAll('.card.hand')].map(e => e.flight.effect.getTiming().delay).sort((a, b) => a - b));
ok(dealDelays.every((d, i) => d === i * 150), 'his cards leave the pioche every other 75 ms: ' + dealDelays.join(' '));
await wait(2600);
ok(await g(() => !document.querySelector('.card.fly, .flipback')), 'the deal has landed');
await g(() => tapStock());
ok(await g(() => { const e = document.querySelector(`.card.hand[data-c="${G.last.card}"]`); return !!e.querySelector('.flipback') && e.flight.effect.getTiming().duration === 520; }),
  'a card drawn from the pioche turns over during a 520 ms flight');
await wait(700);
await setGame(['KS KH KC QD JD 10D 2C 3S 9S', '4D 5D 6D 7D'], { extra: { phase: 'play' } });
for (const n of ['KS', 'KH', 'KC']) await clickCard(n);
await page.click('#layBtn');
ok(await g(() => [...document.querySelectorAll('.card.hand.sel')].every(e => e.getAnimations().some(a => a.effect.getTiming().duration === 420))),
  'a refused "Poser" rocks the chosen cards for 420 ms');
await wait(600);
for (const n of ['QD', 'JD', '10D']) await clickCard(n);
await page.click('#layBtn');
const lay = await g(() => ({ delays: [...document.querySelectorAll('.card.mc')].map(e => e.flight?.effect.getTiming().delay).sort((a, b) => a - b),
  trays: [...document.querySelectorAll('.meld')].every(e => e.getAnimations().some(a => a.effect.getTiming().duration === 260)),
  shimmer: document.querySelectorAll('.shimmer').length, ribbon: document.querySelector('.ribbon')?.textContent }));
ok(lay.delays.join() === '0,60,120,180,240,300' && lay.trays && lay.shimmer === 2 && lay.ribbon === 'Ouvert ! 60 points',
  'the laid cards land 60 ms apart on trays that grow in and shimmer, and the ribbon says "Ouvert ! 60 points": ' + JSON.stringify(lay));
// The ribbon starts when the last card lands, 300 + 520 ms after the click, and stays 1.4 s.
await wait(2400);
ok(await g(() => !document.querySelector('.ribbon, .shimmer')), 'the ribbon and the shimmer are gone after 1.4 s');
await setGame(['9S', 'KD 5C JK 2H'], { melds: [[0, 'KS KH KC'], [0, '5H 6H 7H']], extra: { phase: 'play' } });
await clickCard('9S');
await g(() => tapPile());
await wait(800);
ok(await g(() => [...document.querySelectorAll('.meld')].some(e => e.getAnimations().length)), 'his trays lift in a wave');
await wait(500);
ok(await g(() => document.querySelectorAll('#confetti i').length > 20), 'then small cards of the four suits cross the felt');
await page.click('#helpBtn');
await wait(3000);
ok(await g(() => !document.getElementById('over').classList.contains('on') && document.getElementById('help').classList.contains('on')), 'the win dialog waits while he reads the rules');
await page.click('#helpClose');
await wait(300);
ok(await g(() => document.getElementById('over').classList.contains('on') && document.getElementById('overTitle').textContent === 'Bravo, vous avez gagné !'), 'and opens when he closes them');
await page.close();

ok(!errors.length, 'no error in the page ' + errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
