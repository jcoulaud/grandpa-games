// Plays the jeu des paires with a real mouse: the rules, a first card, a miss that turns back by
// itself and at the next click, a pair, refusals, the hint, a reload during a game, the win and its
// record, a broken save, the levels and a phone.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('paires');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const card = i => page.locator(`.card[data-i="${i}"]`);
// A click, then the mouse moves away and waits until the card is turned and named, so the next click on
// the same card is not a double-click.
const click = async i => { await card(i).click(); await page.mouse.move(5, 5); await wait(700); };
const cls = i => card(i).getAttribute('class');

// 1. The first visit: the rules open, each page fits without scrolling, then the level.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
const pages = await page.locator('#helpText .page').count();
ok(pages >= 3 && pages <= 5, `the rules have ${pages} pages`);
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/paires-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Facile', exact: true }).click();
ok(await page.locator('.card').count() === 12, 'Facile has 12 cards');
ok(await g(() => document.getElementById('grid').dataset.board === 'deal'), 'a new game deals the cards in');
// A fixed seed, so the steps below meet the same deal each time.
await g(() => { G = Paires.newGame('facile', 4242); save(); render(); });
const cards = await g(() => G.cards);
const twin = i => cards.findIndex((c, k) => k !== i && c === cards[i]);
const other = i => cards.findIndex(c => c !== cards[i]);
const size = await card(0).boundingBox();
ok(size.width >= 120, `the cards are large on his laptop: ${Math.round(size.width)} px`);
await page.screenshot({ path: `${OUT}/paires-start.png` });

// 2. A first card turns up and says what it is.
await click(0);
ok(/up/.test(await cls(0)) && /Où se cache l'autre carte/.test(await msg()), 'a click turns a card up and names it');
await click(0);
ok(/déjà retournée/.test(await msg()) && await g(() => G.up === 0 && G.turns === 0), 'a second click on it is refused, with the reason');

// 3. A miss: both stay up, framed in red, then turn back by themselves.
const b = other(0);
await click(b);
ok(/miss/.test(await cls(0)) && /miss/.test(await cls(b)) && /ce n'est pas une paire/.test(await msg()), 'two different cards stay up in red and say so');
await page.screenshot({ path: `${OUT}/paires-miss.png` });
ok(await g(() => G.turns === 1 && G.up === -1), 'the miss counts one turn');
await wait(1800);
ok(/up/.test(await cls(0)), 'they stay up for a moment');
await wait(1000);
ok(!/up/.test(await cls(0)) && !/up/.test(await cls(b)), 'they turn back by themselves after a moment');

// 4. A miss turns back at once at the next click.
const c = cards.findIndex((x, k) => k !== 0 && k !== b && x !== cards[0] && x !== cards[b] && twin(k) !== b);
const d = cards.findIndex((x, k) => k !== c && k !== 0 && k !== b && x !== cards[c]);
await click(c); await click(d);
await click(0);
ok(!/up/.test(await cls(c)) && !/up/.test(await cls(d)) && /up/.test(await cls(0)), 'the next click turns the miss back and the new card up');

// 5. The hint shows the twin seen before.
const twinSeen = await g(k => G.seen[k] === '1', twin(0));
await page.click('#hintBtn');
const hinted = await g(() => [...document.querySelectorAll('.card.hint')].map(e => +e.dataset.i));
ok(hinted.length === 1 && (!twinSeen || hinted[0] === twin(0)) && /encadrée/.test(await msg()), `the hint frames one card, the twin when it was seen: ${hinted}`);

// 6. A pair: it stays up with its tick, and a click on it is refused.
await click(twin(0));
ok(/found/.test(await cls(0)) && /found/.test(await cls(twin(0))) && /Bravo, une paire/.test(await msg()), 'two same cards make a pair that stays up');
ok(await g(() => document.getElementById('pairs').textContent === '1 sur 6' && document.getElementById('turns').textContent === '3' && !!document.getElementById('score').closest('#table')),
  'the score card on the table counts the pairs and the turns');
const after = await card(0).boundingBox();
ok(after.width === size.width && after.x === size.x, `the cards keep their size and place while he plays: ${Math.round(size.width)} then ${Math.round(after.width)} px`);
await click(0);
ok(/déjà trouvée/.test(await msg()), 'a click on a pair found is refused, with the reason');
ok(await g(() => GG.meta('paires').summary === 'Partie en cours'), 'the tile says a game is in progress');

// 7. A reload keeps the game, with the card up.
await click(b);
await page.reload();
await wait(300);
ok(await g(b => G.turns === 3 && G.up === b && G.found[0] === '1', b) && /up/.test(await cls(b)) && /found/.test(await cls(0)), 'a reload keeps the pairs, the turns and the card up');

// 8. The win, counted once, with the record.
const stats = { won: 0 };
await page.exposeFunction('sent', kind => { if (kind === 'won') stats.won++; });
await g(() => { GG.track = (game, kind) => window.sent(kind); });
for (let k = 0; k < 20 && !(await g(() => G.result)); k++) {
  const h = await g(() => Paires.hint(G).cells[0]);
  await click(h);
}
ok(!(await g(() => Kit.isOpen())), 'the win sheet waits for the wave across the board');
await page.waitForSelector('#over.on', { timeout: 3000 });
ok(await g(() => G.result === 'won') && /Bravo, vous avez gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the last pair wins and shows the win');
await page.screenshot({ path: `${OUT}/paires-won.png` });
ok(stats.won === 1 && await g(() => stats.won === 1 && stats.best.facile === G.turns && GG.meta('paires').summary === '1 victoire'), 'the win is counted once, with the best score, and the tile says so');
await page.keyboard.press('Escape');
await click(3);
ok(/Cette partie est gagnée/.test(await msg()), 'a click after the win says to start a new game');
await page.reload();
ok(await g(() => G.result === 'won' && !Kit.isOpen()) && /Bravo, vous avez trouvé/.test(await msg()), 'a reload after the win shows it without the dialog');

// 9. A broken save starts a new game with the rules.
await g(() => { const v = GG.load('paires'); v.G.found = '1' + v.G.found.slice(1, -1) + '0'; return GG.save('paires', v); });
await page.reload();
await wait(300);
ok(await g(() => Kit.isOpen()), 'a broken save is not loaded');
await page.click('#helpClose');
await page.getByRole('button', { name: 'Facile', exact: true }).click();
// A double-click on a card counts as one click: it does not start the next turn.
await card(0).dblclick(); await page.mouse.move(5, 5);
ok(await g(() => G.up === 0 && G.turns === 0 && !/déjà/.test(document.getElementById('msg').textContent)), 'a double-click turns one card only, without a refusal');
await wait(1000);
const diff = await g(() => G.cards.findIndex(c => c !== G.cards[0]));
await card(diff).dblclick(); await page.mouse.move(5, 5);
ok(await g(() => G.up === -1 && G.turns === 1), 'a double-click on the second card does not turn a third');
// Any click turns a miss back, even outside the cards.
await page.mouse.click(5, 300);
ok(!/up/.test(await cls(0)), 'a click beside the cards turns the miss back');

// 10. The levels: 20 and 30 cards, still large enough.
for (const [label, n, min] of [['Moyen', 20, 110], ['Difficile', 30, 110]]) {
  await page.click('#newBtn');
  await page.locator('#overBtns button', { hasText: label }).click();
  const box = await card(0).boundingBox();
  ok(await page.locator('.card').count() === n && box.width >= min, `${label} has ${n} cards of ${Math.round(box.width)} px`);
  await page.screenshot({ path: `${OUT}/paires-${label.toLowerCase()}.png` });
}
// The level of a game in progress is kept, and a new game asks first.
await click(0);
await page.click('#newBtn');
ok(/Attention/.test(await g(() => document.getElementById('overText').textContent)), 'a new game during a game warns first');
await page.keyboard.press('Escape');

// 11. A phone stands the grid up: every card is on the screen.
const phone = await browser.newPage({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true });
await phone.goto(URL);
await phone.evaluate(() => { Kit.closeHelp(); });
await phone.getByRole('button', { name: 'Difficile', exact: true }).click();
const fits = await phone.evaluate(() => [...document.querySelectorAll('.card')].every(e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.width >= 50; }));
ok(fits && await phone.evaluate(() => cols === 5), 'on a phone the grid stands up, 5 by 6, and every card fits');
await phone.screenshot({ path: `${OUT}/paires-phone.png` });

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
