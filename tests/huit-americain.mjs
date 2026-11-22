// Plays the huit américain with a real mouse: refusals, a card, an 8 and its colour, the pioche, the
// computer players and their special cards, undo, hint, reloads, the end of a round, the win, a broken
// save, and the layout at every window size of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('huit-americain');

let page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
const watch = p => p.on('pageerror', e => errors.push(e.message));
watch(page);
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
// Cards by name: "QS" the dame de pique, "8H" the 8 de cœur, "10D", "AC".
const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const card = n => SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
// Clicks a card of his hand where it shows, then moves the mouse away and waits past the double-click time.
const clickCard = async c => {
  await g(c => document.querySelector(`.card.hand[data-c="${c}"]`).flight?.finished.catch(() => {}), c);
  const r = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 16]; }, c);
  await page.mouse.click(...r); await page.mouse.move(5, 5); await wait(560);
};
const clickEl = async sel => {
  const r = await g(sel => { const b = document.querySelector(sel).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }, sel);
  await page.mouse.click(...r); await page.mouse.move(5, 5); await wait(560);
};
const myTurnNow = () => g(() => myTurn());
const waitMyTurn = async () => { for (let i = 0; i < 150 && !(await myTurnNow()); i++) await wait(100); };
// Puts a round in progress on the table: the hands, the top card of the défausse and the pioche (the
// next card last). Every other card lies under the top card.
const setRound = (hands, topName, stock = '', extra = {}) => g(([hands, topName, stock, extra]) => {
  cancelAll(); closeSuits(true);
  const SU = 'SHDC', RK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const card = n => SU.indexOf(n.slice(-1)) * 13 + RK.indexOf(n.slice(0, -1));
  const cards = s => s.split(' ').filter(Boolean).map(card);
  const hs = hands.map(h => HA.sortHand(cards(h))), st = cards(stock), t = card(topName);
  const used = new Set([...hs.flat(), ...st, t]);
  const under = [...Array(52).keys()].filter(c => !used.has(c));
  G = Object.assign({ v: 1, round: 0, scores: [0, 0, 0, 0], result: null, hands: hs, stock: st, pile: [...under, t], suit: (t / 13) | 0,
    dir: 1, turn: 0, phase: 'play', drawn: null, rs: 7, seed: 9, n: 0, last: { kind: 'deal', seat: null, card: t },
    voids: [0, 1, 2, 3].map(() => [false, false, false, false]), roundPts: null, out: null }, extra);
  // A deal that holds a card twice would be refused on a reload: the test would not be a real game.
  if (!HA.valid(JSON.parse(JSON.stringify(G)))) throw new Error('impossible deal: ' + hands.join(' | ') + ' on ' + topName + ', pioche ' + stock);
  undo = []; hint = null; started = true;
  clearCards(); save(); say(turnMessage()); render();
  if (G.turn !== 0) later(step, 200);
}, [hands, topName, stock, extra]).then(() => wait(650));

// The layout at the window size in use: nothing past the sides, no text under 20 px (13 on a phone),
// no button under 44 px, no text cut, and the places on the table do not overlap.
// table: only the table and the message line. The bar of lib/kit.css runs past the side from 701 to
// about 820 px in every game, a fault of the shared bar, not of this game.
const layoutCheck = (table = false) => g(table => {
  const bad = [];
  const z = Zoom.z(), phone = innerWidth < 700;
  const vis = e => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[hidden], .sr'); };
  const R = e => { const r = e.getBoundingClientRect(); return { l: r.left / z, r: r.right / z, t: r.top / z, b: r.bottom / z, w: r.width / z, h: r.height / z }; };
  const W = innerWidth / z, H = innerHeight / z;
  const shown = [...document.body.querySelectorAll('*')].filter(e => vis(e) && !e.closest('#confetti, #help:not(.on), #over:not(.on), svg, .fly') && !(table && e.closest('#bar')));
  for (const e of shown) {
    const r = R(e);
    if (r.l < -1 || r.r > W + 1) bad.push('past the side: ' + (e.id || e.className || e.tagName));
    const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (own && !e.closest('.card, .fan') && parseFloat(getComputedStyle(e).fontSize) < (phone ? 13 : 20)) bad.push('small text: ' + e.textContent.trim().slice(0, 30));
    // A text inside a seat or a sheet stays inside it: nothing cut.
    const box = e.closest('.seat, .sheet, #badge');
    if (own && box && box !== e) { const b = R(box); if (r.l < b.l - 1 || r.r > b.r + 1) bad.push('text out of its box: ' + e.textContent.trim().slice(0, 30)); }
    if ((e.matches('button, a#home') || (e.getAttribute('role') === 'button' && !e.matches('.card, #stock'))) && r.h < 44 - .5) bad.push('small button: ' + e.textContent.trim().slice(0, 30));
  }
  const m = document.getElementById('msg');
  if (m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1) bad.push('message cut');
  // The places on the table.
  const t = R(document.getElementById('table'));
  const places = ['seat0', 'seat1', 'seat2', 'seat3', 'stock', 'badge', 'drawBtn'].map(id => document.getElementById(id)).filter(vis);
  const top = document.querySelector('.card.pile.top'); if (top) places.push(top);
  for (const e of places) { const r = R(e); if (r.l < t.l - 1 || r.r > t.r + 1 || r.t < t.t - 1 || r.b > t.b + 1) bad.push('outside the table: ' + (e.id || 'pile')); }
  const hit = (a, b) => a.l < b.r - 1 && b.l < a.r - 1 && a.t < b.b - 1 && b.t < a.b - 1;
  for (let i = 0; i < places.length; i++) for (let j = i + 1; j < places.length; j++)
    if (hit(R(places[i]), R(places[j]))) bad.push(`overlap: ${places[i].id || 'pile'} and ${places[j].id || 'pile'}`);
  // The corner of each card of his hand is in view, clear of the seats.
  // In the order they show: a card drawn is added at the end of the page, not of the hand.
  const hand = [...document.querySelectorAll('.card.hand')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  hand.forEach((e, i) => {
    const r = R(e), corner = { l: r.l, r: r.l + r.w * .3, t: r.t, b: r.t + r.h * .3 };
    if (corner.b > Math.min(t.b, H) + 1) bad.push('hand corner below the window');
    if (i < hand.length - 1 && R(hand[i + 1]).l - r.l < r.w * .25) bad.push('hand corner covered');
    for (const p of places) if (hit(corner, R(p))) bad.push('hand corner under ' + (p.id || 'pile'));
  });
  return bad;
}, table);
// A sheet stands inside the window with its buttons in view.
const sheetCheck = id => g(id => {
  const z = Zoom.z(), e = document.getElementById(id), r = e.getBoundingClientRect();
  const inside = r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
  const buttons = [...e.querySelectorAll('button')].every(b => { const q = b.getBoundingClientRect(); return q.height / z >= 44 && document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2)?.closest('button') === b; });
  return e.classList.contains('on') && inside && buttons;
}, id);

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/ha-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
await wait(300);
ok(!(await g(() => Kit.isOpen())) && await g(() => level === 'moyen'), 'the level is chosen after the rules');
ok((await g(() => document.getElementById('level').textContent)) === 'Niveau moyen', 'the level shows under the name');
ok(await g(() => G.hands.every(h => h.length === 7) && G.pile.length === 1 && G.turn === 0), 'a new game deals 7 cards each, and he starts');
ok(await g(() => cast.length === 3 && cast.every(id => Object.hasOwn(CAST, id))), 'three players of the computer sit at the table');
ok(/^(À vous : posez un|Vous n'avez ni)/.test(await msg()), 'the line says what he may play: ' + await msg());
await wait(800);
ok((await layoutCheck()).length === 0, 'the table fits at 1366x680 ' + (await layoutCheck()).join(', '));
ok(await g(() => L.w >= 105), `the cards are ${await g(() => L.w)} px wide at 1366x680`);
await page.screenshot({ path: `${OUT}/ha-start.png` });

// The checks below name the first three players: Josette on the left, Lucien across, Ginette on the right.
await g(() => { setCast(['josette', 'lucien', 'ginette']); save(); render(); });

// 2. A refused card says why; a card that fits is played with one click.
await setRound(['9H 4H KC 3D 5S', '3S 5D 6D 7D', '6S 7S 10D', '10S JS QD'], '9C', '2D 3H 4C');
ok(await g(() => document.querySelectorAll('.card.hand.no').length === 3 && document.querySelectorAll('.card.hand.can').length === 2), 'the cards that do not fit are darker');
await clickCard(card('4H'));
ok(await g(c => G.hands[0].includes(c), card('4H')) && (await msg()) === 'Il faut un trèfle ou un 9.', 'a card that does not fit stays, and the line says why: ' + await msg());
ok(await g(c => {
  const b = document.getElementById('bubble'), r = b.getBoundingClientRect(), k = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect();
  return b.classList.contains('on') && b.textContent === 'Il faut un trèfle ou un 9.' && r.bottom <= k.top && r.right > k.left && r.left < k.right;
}, card('4H')), 'the reason also shows in a bubble just above the card');
await page.screenshot({ path: `${OUT}/ha-refused.png` });
await clickEl('#stock');
ok((await msg()).startsWith('Une de vos cartes va'), 'the pioche is refused while a card fits: ' + await msg());
ok(await g(() => document.getElementById('drawBtn').hidden), 'no "Piocher" key while a card fits');
// A double-click plays the card once.
const r9 = await g(c => { const b = document.querySelector(`.card.hand[data-c="${c}"]`).getBoundingClientRect(); return [b.left + 12, b.top + 16]; }, card('9H'));
await page.mouse.dblclick(...r9); await page.mouse.move(5, 5);
await wait(100);
ok(await g(c => G.pile[G.pile.length - 1] === c && G.hands[0].length === 4 && G.suit === 1, card('9H')), 'a card that fits goes on the défausse with one click, a double-click counts once');
ok((await msg()) === 'Vous posez le 9 de cœur.', 'the line says what he played');
ok(await g(() => document.getElementById('badge').textContent.includes('Cœur')), 'the colour in the middle turns to cœur');
// The computers answer, one at a time, each named.
await wait(1100);
ok(await g(() => G.turn !== 0 || G.last.seat !== 0) && /^Josette (pose|pioche)/.test(await msg()), 'Josette answers, and the line names her: ' + await msg());
await waitMyTurn();
ok(await g(() => G.turn === 0 && document.getElementById('seat0').classList.contains('turn')), 'his turn comes back, his seat says so');
ok(/^Ginette .*\. (À vous|Vous n'avez)/.test(await msg()), 'the line keeps what Ginette did, then says his turn: ' + await msg());

// 3. An 8: the four colours, a cancel, then the colour named.
await setRound(['8S 4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3D 4D');
await clickCard(card('8S'));
ok(await g(() => document.getElementById('suitSheet').classList.contains('on') && document.querySelectorAll('#suits button').length === 4), 'an 8 opens the four colours');
ok(await sheetCheck('suitSheet'), 'the colour sheet fits, with large buttons');
ok((await g(() => document.getElementById('suitTitle').textContent)) === 'Choisissez la couleur', 'the sheet says "Choisissez la couleur"');
await page.screenshot({ path: `${OUT}/ha-suits.png` });
await page.click('#suitCancel');
ok(await g(() => !document.getElementById('suitSheet').classList.contains('on') && G.hands[0].length === 3), '"Garder mon 8" keeps the card');
await clickCard(card('8S'));
await page.keyboard.press('Escape');
ok(await g(() => !document.getElementById('suitSheet').classList.contains('on') && G.hands[0].length === 3), 'Escape keeps the card too');
await clickCard(card('8S'));
await page.click('#suits button[data-suit="3"]');
await wait(100);
ok(await g(() => G.suit === 3 && G.hands[0].length === 2 && document.getElementById('badge').classList.contains('named')), 'trèfle is named: the middle shows it, with a gold ring');
ok((await msg()) === 'Vous posez un 8 et choisissez le trèfle.', 'the line says the colour named');

// 4. No card fits: "Piocher", a card that fits, "Passer mon tour".
await setRound(['4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3H');
ok(await g(() => !document.getElementById('drawBtn').hidden && document.getElementById('drawBtn').textContent === 'Piocher'), 'no card fits: the big "Piocher" key shows');
ok((await msg()) === "Vous n'avez ni cœur ni 9, ni 8 : cliquez sur « Piocher ».", 'the line says why he draws: ' + await msg());
await page.click('#hintBtn');
ok(await g(() => document.getElementById('drawBtn').classList.contains('hint')) && (await msg()).includes('Piocher'), 'the hint frames "Piocher"');
await clickEl('#stock');
ok(await g(c => G.phase === 'drawn' && G.drawn === c && G.hands[0].includes(c), card('3H')), 'a click on the pioche draws the 3 de cœur');
ok(await g(() => document.getElementById('drawBtn').textContent === 'Passer mon tour' && !!document.querySelector('.card.hand.drawn .tag')), 'the card drawn stands up with a tag, and "Passer mon tour" shows');
ok((await msg()).startsWith('Vous avez pioché le 3 de cœur. Cette carte va'), 'the line says he may play it: ' + await msg());
await clickCard(card('4C'));
ok((await msg()).startsWith('Vous venez de piocher'), 'another card is refused after a draw');
await page.click('#drawBtn');
await wait(100);
ok(await g(c => G.turn === 1 && G.hands[0].includes(c) && G.phase === 'play', card('3H')), '"Passer mon tour" keeps the card and the turn passes');
// A card drawn that does not fit: the turn passes at once.
await setRound(['4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D');
await page.click('#drawBtn');
await wait(100);
ok(await g(() => G.turn === 1) && (await msg()) === 'Vous piochez le 2 de carreau. Cette carte ne va pas : votre tour passe.', 'a card drawn that does not fit: the turn passes');
// A double-click on "Piocher" draws once: the second click does not press "Passer mon tour", which
// takes the place of "Piocher". The first move counts the game as started, also after a reload.
await setRound(['4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3H');
await g(() => { started = false; });
const rd = await g(() => { const b = document.getElementById('drawBtn').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
await page.mouse.click(...rd); await wait(150); await page.mouse.click(...rd); await page.mouse.move(5, 5); await wait(560);
ok(await g(() => G.phase === 'drawn' && G.turn === 0), 'a double-click on "Piocher" draws, and does not pass the turn');
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => started && G.phase === 'drawn' && GG.meta('huit-americain').summary.startsWith('Partie en cours')), 'after the first move and a reload, the game is still in progress');
// The line names the 8 when he holds one, and when the top card is an 8.
await setRound(['8S AC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3D');
ok((await msg()) === 'À vous : posez un cœur, un 9 ou un 8.', 'with an 8 in hand, the line names it: ' + await msg());
await clickCard(card('AC'));
ok((await msg()) === 'Il faut un cœur, un 9 ou un 8.', 'a refused card names the 8 too: ' + await msg());
await clickEl('#stock');
ok((await msg()) === 'Une de vos cartes va : posez un cœur, un 9 ou un 8.', 'the refused pioche names the 8 too: ' + await msg());
await setRound(['4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '8D', '2D 3D', { suit: 1 });
ok((await msg()) === "Vous n'avez ni cœur ni 8 : cliquez sur « Piocher ».", 'after an 8, the line names the 8 once: ' + await msg());
// His last card is an 8: the hint does not ask for a colour, the round ends with it.
await setRound(['8S', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3D');
await page.click('#hintBtn');
ok((await msg()) === 'Posez le 8 de pique : la carte entourée de jaune.', 'with a last 8, the hint does not ask for a colour: ' + await msg());
ok((await g(() => { G.last = { kind: 'empty', seat: 0 }; return describe(G); })) === "Il n'y a plus de carte à piocher : votre tour passe.", 'with nothing to draw, the line does not say the défausse is empty');

// 5. The computers' special cards: Ginette's 2 makes him draw two cards and miss his turn.
await setRound(['4C KC 5D', '3S 5S 6S', '7S 10S KS', '2H 3C 5C'], '9H', '2D 3D 4D', { turn: 3 });
for (let i = 0; i < 40 && !(await g(() => G.last.kind === 'play' && G.last.seat === 3)); i++) await wait(100);
ok(await g(() => G.hands[0].length === 5 && G.turn === 1), 'Ginette plays her 2: he draws two cards and Josette plays next');
ok((await msg()) === 'Ginette pose le 2 de cœur : vous piochez deux cartes et passez votre tour.', 'the line says it: ' + await msg());
ok(await g(() => document.querySelector('#seat0 .fx')?.textContent === '+2 cartes'), 'a "+2 cartes" sign rises over his seat');
await page.screenshot({ path: `${OUT}/ha-two.png` });
// Josette's as turns the way.
await setRound(['4C KC 5D', 'AH 3C 5C', '6S 7S 10S', '2S 3S 5S'], '9H', '2D 3D 4D', { turn: 1 });
for (let i = 0; i < 40 && !(await g(() => G.last.kind === 'play')); i++) await wait(100);
ok(await g(() => G.dir === -1 && G.turn === 0 && document.getElementById('ring').classList.contains('ccw')), 'Josette plays an as: the way turns, the ring of arrows too, and his turn comes');
ok((await msg()).startsWith('Josette pose l\'as de cœur : le sens du jeu change.'), 'the line says it: ' + await msg());
// Josette's 2 on Lucien, across: the label shows under his seat, inside the table.
const fxInside = id => g(id => {
  const f = document.querySelector(`#${id} .fx`), t = document.getElementById('table').getBoundingClientRect();
  if (!f) return false;
  const r = f.getBoundingClientRect();
  return r.top >= t.top - 1 && r.bottom <= t.bottom + 1 && r.left >= t.left - 1 && r.right <= t.right + 1 && f.scrollWidth <= f.clientWidth + 1;
}, id);
await setRound(['4C KC 5D', '2H 3C 5C', '7S 10S KS', '3S 5S 6S'], '9H', '2D 3D 4D', { turn: 1 });
for (let i = 0; i < 40 && !(await g(() => !!document.querySelector('#seat2 .fx'))); i++) await wait(100);
await wait(400);
ok(await fxInside('seat2'), 'the "+2 cartes" label over the player across stays inside the table');

// 6. Undo takes back his move and the moves after it, also while the others play.
await setRound(['9H 4H KC 3D 5S', '3S 5D 6D 7D', '6S 7S 10D', '10S JS QD'], '9C', '2D 3H 4C 5C 6C 7C');
const snap = await g(() => JSON.stringify(G));
await clickCard(card('KC'));
await wait(1500);
await page.click('#undoBtn');
ok((await g(() => JSON.stringify(G))) === snap, 'undo puts the table back as it was before his card');
ok((await msg()).startsWith('Coup annulé.'), 'the line says the move is taken back');
await clickCard(card('KC'));
await waitMyTurn();
const one = await g(() => undo.length);
if (await g(() => HA.canDraw(G))) await page.click('#drawBtn'); else await clickCard(await g(() => HA.legal(G)[0]));
await page.dblclick('#undoBtn');
ok(await g(() => undo.length === 1), 'a double-click takes back only one move');
await page.dispatchEvent('#undoBtn', 'keydown', { key: 'z', ctrlKey: true, repeat: true });
ok(await g(() => undo.length === 1), 'holding the undo shortcut leaves the next move in place');
await page.locator('#undoBtn').press('Enter');
ok((await g(() => JSON.stringify(G))) === snap && one === 1, 'two undos go back two of his moves');
// An undo entry that cannot be read, or a position of a computer's turn, is skipped.
await wait(600);
await g(() => { undo = ['{']; render(); });
await page.click('#undoBtn'); await wait(600);
ok((await g(() => JSON.stringify(G))) === snap && await g(() => document.getElementById('undoBtn').disabled), 'an undo entry that cannot be read is skipped');
await g(() => { undo = [JSON.stringify({ ...G, turn: 1 })]; render(); });
await page.click('#undoBtn'); await wait(600);
ok((await g(() => JSON.stringify(G))) === snap && await g(() => !undo.length), 'an undo entry of a computer\'s turn is skipped, so the table never waits for nobody');

// 7. A reload keeps the game, the level and the turn.
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok((await g(() => JSON.stringify(G))) === snap && await g(() => level === 'moyen'), 'a reload brings back the same game and level');
ok(await g(() => cast.join() === 'josette,lucien,ginette'), 'and the same players');

// 8. The hint frames a card that fits.
await page.click('#hintBtn');
ok(await g(() => hint && HA.legal(G).includes(hint.card) && !!document.querySelector('.card.hand.hint')), 'the hint frames a card he may play: ' + await msg());
await page.keyboard.press('Escape');
ok(await g(() => !hint && !document.querySelector('.card.hand.hint')), 'Escape takes the hint away');
// The hint names the colour with an 8.
await setRound(['8S 4C', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3D 4D');
await page.click('#hintBtn');
ok(/^Posez le 8 de pique, puis choisissez le trèfle\.$/.test(await msg()), 'with an 8, the hint names the colour: ' + await msg());
await clickCard(card('8S'));
ok(await g(() => !!document.querySelector('#suits button.hint[data-suit="3"]')), 'the colour of the hint is framed on the sheet');
await page.click('#suitCancel');

// 9. The end of a round: the score sheet, which Escape does not close, then the next round.
await setRound(['5H', '3S 5D KD', '8S 7S', '10S JS QD'], '9H', '2D 3D 4D', { scores: [10, 20, 30, 40] });
await clickCard(card('5H'));
for (let i = 0; i < 40 && !(await g(() => document.getElementById('scoreSheet').classList.contains('on'))); i++) await wait(100);
ok(await g(() => G.phase === 'done' && G.out === 0 && G.scores.join() === '10,38,87,70'), 'he goes out: the others score their cards, an 8 counts 50');
ok((await g(() => document.getElementById('scoreTitle').textContent)) === 'Fin de la manche 1' && (await g(() => document.getElementById('scoreNote').textContent)).includes('vous gagnez la manche'), 'the score sheet shows');
ok(await sheetCheck('scoreSheet'), 'the score sheet fits, with its button in view');
await page.screenshot({ path: `${OUT}/ha-scores.png` });
await page.keyboard.press('Escape');
ok(await g(() => document.getElementById('scoreSheet').classList.contains('on')), 'Escape leaves the score sheet in place');
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => document.getElementById('scoreSheet').classList.contains('on')), 'the score sheet comes back after a reload');
await page.click('#nextBtn'); await wait(300);
ok(await g(() => G.round === 1 && G.phase === 'play' && G.hands.every(h => h.length === 7) && G.scores.join() === '10,38,87,70' && !undo.length), 'the next round deals again, and the totals carry on');
ok(await g(() => G.turn === 1), 'Josette starts the second round');

// 10. The win: a total reaches 100, and he has the lowest. It counts once.
await setRound(['5H', '3S 5D KD', '8S 7S', '10S JS QD'], '9H', '2D 3D 4D', { scores: [10, 90, 60, 40] });
await clickCard(card('5H'));
await page.locator('#confetti').waitFor();
ok(await g(() => !Kit.isOpen() && !$('scoreSheet').classList.contains('on')), 'the four suits fan out before the win dialog');
await page.click('#newBtn');
await page.getByRole('button', { name: 'Continuer la partie' }).click();
await page.click('#helpBtn');
await page.locator('#confetti').waitFor({ state: 'detached' });
ok(await g(() => $('help').classList.contains('on')), 'the rules stay open through the end of the celebration');
await page.click('#helpClose');
await page.locator('#over.on').waitFor();
ok(await g(() => G.phase === 'over' && G.result.winner === 0 && stats.won === 1), 'he wins with the lowest total');
ok((await g(() => document.getElementById('overTitle').textContent)) === 'Bravo, vous avez gagné !', 'the win sheet shows');
ok(await g(() => /atteint 100 points : la partie est finie\.\n[^]*\nLes points : Vous 10, Josette 108/.test(document.getElementById('overText').textContent)), 'the win sheet says why the game ended, with the four totals');
await page.screenshot({ path: `${OUT}/ha-won.png` });
ok((await g(() => GG.meta('huit-americain').summary)) === '1 victoire', 'the library tile shows the win');
await page.evaluate(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => stats.won === 1 && G.phase === 'over' && document.getElementById('scoreSheet').classList.contains('on')), 'a reload does not count the win again');
ok(/^Josette et Lucien ont atteint 100 points\. Vous avez le moins de points/.test(await g(() => $('scoreNote').textContent)), 'after a reload, the score sheet still says why the game ended: ' + await g(() => $('scoreNote').textContent));
// The loss.
await g(() => { wonNow = false; });
await setRound(['5H 9S', '3S', '8S 7S', '10S JS QD'], '3H', '2D 3D 4D', { scores: [95, 10, 20, 30], turn: 1 });
for (let i = 0; i < 40 && !(await g(() => document.getElementById('over').classList.contains('on'))); i++) await wait(100);
ok(await g(() => G.phase === 'over' && G.result.winner === 1) && (await g(() => document.getElementById('overTitle').textContent)) === 'Josette a gagné', 'Josette goes out with the lowest total: she wins');
await g(() => Kit.closeDialog());

// 11. The levels: "Nouvelle partie" asks, the level is kept.
await page.click('#newBtn');
await page.getByRole('button', { name: 'Difficile', exact: true }).click();
await wait(300);
ok(await g(() => level === 'fort' && document.getElementById('level').textContent.startsWith('Niveau difficile') && G.round === 0 && stats.won === 1), 'Difficile is chosen, the wins stay');
ok(await g(() => !['josette', 'lucien', 'ginette'].some(id => cast.includes(id))), 'a new game seats three other players');
// A win that is taken back while it is being saved still counts in the statistics, once.
await setRound(['5H', '3S 5D KD', '8S 7S', '10S JS QD'], '9H', '2D 3D 4D', { scores: [10, 90, 60, 40] });
const wonBefore = await g(() => { wonNow = false; window.sent = []; GG.track = (game, kind) => sent.push(kind);
  const real = GG.save; let first = true;
  GG.save = (...a) => { if (!first) return real(...a); first = false; return new Promise(r => { window.release = () => { GG.save = real; real(...a).then(r); }; }); };
  return stats.won; });
await clickCard(card('5H'));
await g(() => doUndo());
await g(() => release()); await wait(200);
ok(await g(b => sent.includes('won') && stats.won === b + 1 && wonNow, wonBefore), 'a win undone while it is saved is counted once');
await g(() => { wonNow = false; });
// A win that cannot be written, undone while it waits: the undo's save waits for it, and holds no win.
await setRound(['5H', '3S 5D KD', '8S 7S', '10S JS QD'], '9H', '2D 3D 4D', { scores: [10, 90, 60, 40] });
const lostBefore = await g(async () => { await GG.flush(); wonNow = false; window.sent = []; GG.track = (game, kind) => sent.push(kind);
  const real = GG.save; let first = true;
  GG.save = (...a) => { if (!first) return real(...a); first = false; return new Promise(r => { window.release = () => { GG.save = real; r(false); }; }); };
  return stats.won; });
await clickCard(card('5H'));
await g(() => doUndo());
await g(() => release()); await wait(200);
ok(await g(async b => { await GG.flush(); const d = GG.load('huit-americain');
  return !sent.includes('won') && stats.won === b && !wonNow && d.stats.won === b && !d.wonNow && d.G.phase === 'play'; }, lostBefore),
  'a win that could not be saved and is undone meanwhile leaves no win in the later save');

// 12. A broken save starts a new game, and an old save without a level still loads.
await g(() => { localStorage.setItem('gg:save:huit-americain', JSON.stringify({ updatedAt: 1, summary: '', data: { v: 1, level: 'moyen', stats: { won: 4 }, G: { v: 1, hands: [[1, 2]] } } })); });
await page.reload(); await wait(400);
ok(await g(() => HA.valid(G) && G.round === 0 && level === 'moyen' && stats.won === 4), 'a broken save starts a new game, with its level and wins');
ok((await msg()).includes("n'a pas pu être relue"), 'the line says why');
await g(() => { const s = JSON.parse(localStorage.getItem('gg:save:huit-americain')); delete s.data.level; delete s.data.cast; delete s.data.G.voids; s.updatedAt++; localStorage.setItem('gg:save:huit-americain', JSON.stringify(s)); });
await page.reload(); await wait(400);
ok(await g(() => level === 'facile' && HA.valid(G) && G.voids.length === 4) && !(await g(() => Kit.isOpen())), 'an old save without a level loads at Facile');

// 13. Every window and size of docs/design.md: the table, the colour sheet and the score sheet fit.
const sizes = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [1366, 680, 1.3], [1920, 1000, 1.75]];
for (const [w, h, z] of sizes) {
  const p = await browser.newPage({ viewport: { width: w, height: h } });
  watch(p);
  await p.addInitScript(z => localStorage.setItem('gg:zoom', JSON.stringify(z)), z);
  page = p;
  await p.goto(URL); await wait(300);
  const name = `${w}x${h}${z > 1 ? ' at ' + z * 100 + ' %' : ''}`;
  if (h / z >= 620) {
    let fit = true;
    for (let n = 0; n < 5; n++) { fit &&= await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }); await p.click('#helpNext'); }
    ok(fit, `${name}: every rules page fits without scrolling`);
  } else { await p.click('#helpClose'); }
  await p.getByRole('button', { name: 'Facile', exact: true }).click();
  await wait(900);
  ok(await g(z => Zoom.z() === z, z), `${name}: the page is at ${z * 100} %`);
  // A long hand and the longest message: the corners stay in view.
  await setRound(['AS 3S 4S 5S 6S 7S 9S 10S JS QS KS 2H 3H 4H 5H 6H', '3D 5D', '6D 7D 10D', '10C JC QC'], '9C', '2D 7H 4C');
  await g(() => say('Ginette pose le 2 de cœur : vous piochez deux cartes et passez votre tour. À vous : posez un trèfle ou une dame.'));
  await wait(700);
  let bad = await layoutCheck();
  ok(!bad.length, `${name}: the table fits, with 16 cards in his hand ${bad.join(', ')}`);
  await p.screenshot({ path: `${OUT}/ha-${w}x${h}${z > 1 ? '-' + z : ''}.png` });
  await setRound(['4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3H');
  await wait(500);
  bad = await layoutCheck();
  ok(!bad.length && await g(() => !document.getElementById('drawBtn').hidden), `${name}: "Piocher" fits beside the pioche ${bad.join(', ')}`);
  await clickEl('#drawBtn');
  bad = await layoutCheck();
  ok(!bad.length && await g(() => document.getElementById('drawBtn').textContent === 'Passer mon tour'), `${name}: "Passer mon tour" fits beside the pioche ${bad.join(', ')}`);
  await setRound(['8S 4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3D 4D');
  await clickCard(card('8S'));
  ok(await sheetCheck('suitSheet'), `${name}: the colour sheet fits`);
  bad = await layoutCheck();
  ok(!bad.length, `${name}: nothing past the window with the colour sheet ${bad.join(', ')}`);
  await p.click('#suitCancel');
  await setRound(['5H', '3S 5D KD', '8S 7S', '10S JS QD'], '9H', '2D 3D 4D', { scores: [10, 20, 30, 40] });
  await clickCard(card('5H'));
  await wait(1700);
  ok(await sheetCheck('scoreSheet'), `${name}: the score sheet fits`);
  await p.close();
}

// 13b. Narrow windows: the seats never overlap, with a seven-card deal and totals of three digits, and
// "Passer mon tour", wider than "Piocher", stays clear of his seat and the pioche.
const DEAL = [['3H 4C 5S 6S 7S 10S QS', '3S 5D 6D 7D 9D 10D KD', '4S KS 2C 3C 5C 6C 7C', '10C JC QD 9C 4D 5H 6H'], '9H', '2D 3D', { scores: [100, 100, 100, 100] }];
const DRAWN = [['4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3H'];
// Raymond on the right with ten cards and the two others with one, on Raymond's turn: the widest right seat.
const UNEVEN = [['4C KC 5D', '3S', '6S', '7H 8H JH QH KH AH 2S 4S 5S 7S'], '9H', '2D 3D', { turn: 3 }];
for (const [w, h] of [[720, 900], [360, 760], [1093, 680]]) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  watch(p);
  page = p;
  await p.goto(URL); await wait(300);
  await p.click('#helpClose');
  await p.getByRole('button', { name: 'Facile', exact: true }).click();
  await setRound(...DEAL);
  let bad = await layoutCheck(true);
  ok(!bad.length, `${w}x${h}: a seven-card deal with totals of 100 fits, no seat over another ${bad.join(', ')}`);
  await setRound(...DRAWN);
  await clickEl('#drawBtn');
  bad = await layoutCheck(true);
  ok(!bad.length && await g(() => G.phase === 'drawn' && document.getElementById('drawBtn').textContent === 'Passer mon tour'), `${w}x${h}: "Passer mon tour" clears his seat and the pioche ${bad.join(', ')}`);
  await setRound(...UNEVEN);
  bad = await layoutCheck(true);
  ok(!bad.length, `${w}x${h}: a wide right seat does not cover the middle seat ${bad.join(', ')}`);
  // Every width from 360 px: the same two tables.
  if (w === 360) {
    const fails = [];
    for (let x = 360; x <= 1500; x += 20) {
      await p.setViewportSize({ width: x, height: h });
      await setRound(...DEAL);
      bad = await layoutCheck(true);
      await setRound(...DRAWN);
      await g(() => { G = HA.draw(G); render(); });
      bad = bad.concat(await layoutCheck(true));
      if (bad.length) fails.push(`${x}: ${bad.join(', ')}`);
    }
    ok(!fails.length, 'every width from 360 to 1500 px: nothing overlaps ' + fails.join(' | '));
  }
  await p.close();
}

// 14. A phone: the bar on two rows, the players in one row on top.
{
  const p = await browser.newPage({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true });
  watch(p);
  page = p;
  await p.goto(URL); await wait(300);
  let fit = true;
  for (let n = 0; n < 5; n++) { fit &&= await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }); await p.click('#helpNext'); }
  ok(fit, '390x760: every rules page fits without scrolling');
  await p.getByRole('button', { name: 'Facile', exact: true }).click();
  await wait(900);
  let bad = await layoutCheck();
  ok(!bad.length, '390x760: the table fits ' + bad.join(', '));
  await setRound(['4C KC 3D 5S 6S 7S 10S JS QS 2C', '3S 5D 6D', '4S KS 10D', '10C JC QD'], '9H', '2D 3H');
  await wait(500);
  bad = await layoutCheck();
  ok(!bad.length && await g(() => !document.getElementById('drawBtn').hidden), '390x760: "Piocher" fits under the middle ' + bad.join(', '));
  await p.screenshot({ path: `${OUT}/ha-phone.png` });
  await p.tap('#drawBtn'); await wait(200);
  ok(await g(() => G.phase === 'drawn'), '390x760: a tap on "Piocher" draws');
  // The cards of a computer fly to its seat: its fan of backs is hidden on a phone.
  ok(await g(() => { const [x, y] = fanCenter(1), s = document.getElementById('seat1');
    return Math.abs(x + L.w / 2 - (s.offsetLeft + s.offsetWidth / 2)) < 2 && Math.abs(y + L.h / 2 - (s.offsetTop + s.offsetHeight / 2)) < 2; }), '390x760: a computer\'s cards fly to its seat');
  for (const [victim, hands] of [['seat2', ['4C KC 5D', '2H 3C 5C', '7S 10S KS', '3S 5S 6S']], ['seat1', ['4C KC 5D', '3S 5S 6S', '2H 3C 5C', '7S 10S KS']]]) {
    // Josette's 2 hits Lucien; Lucien's 2, with the way turned, hits Josette.
    await setRound(hands, '9H', '2D 3D 4D', victim === 'seat2' ? { turn: 1 } : { turn: 2, dir: -1 });
    for (let i = 0; i < 40 && !(await g(v => !!document.querySelector(`#${v} .fx`), victim)); i++) await wait(100);
    await wait(400);
    ok(await fxInside(victim), `390x760: the "+2 cartes" label over ${victim} stays inside the table, and whole`);
  }
  await setRound(['8S 4C KC', '3S 5D 6D', '6S 7S 10D', '10S JS QD'], '9H', '2D 3D 4D');
  await clickCard(card('8S'));
  ok(await sheetCheck('suitSheet'), '390x760: the colour sheet fits');
  await p.close();
}

// 15. Reduced motion: the game plays the same, without the moves.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  watch(p);
  page = p;
  await p.goto(URL); await wait(300);
  await p.click('#helpClose');
  await p.getByRole('button', { name: 'Facile', exact: true }).click();
  await setRound(['5H', '3S 5D KD', '8S 7S', '10S JS QD'], '9H', '2D 3D 4D', { scores: [10, 90, 60, 40] });
  await clickCard(card('5H'));
  for (let i = 0; i < 30 && !(await g(() => document.getElementById('over').classList.contains('on'))); i++) await wait(100);
  ok(await g(() => G.phase === 'over' && !document.getElementById('confetti')), 'with reduced motion, the win shows without the burst of colours');
  await p.close();
}

ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log('\nALL PASSED');
