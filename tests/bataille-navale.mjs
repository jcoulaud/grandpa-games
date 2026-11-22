// Plays the bataille navale with a real mouse: the first visit, placing the ships again, shots,
// refusals, the computer's answer, the hint, double-clicks, a reload during the computer's turn,
// the win, the loss, and a phone.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('bataille-navale');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const sq = (k, i) => page.locator(`.q[data-k="${k}"][data-i="${i}"]`);
// A click, then the mouse moves away and waits, so the next click on the same square is not a double-click.
const click = async (k, i) => { await sq(k, i).click(); await page.mouse.move(5, 5); await wait(520); };
const answered = () => page.waitForFunction(() => G.turn === 'me' || G.result);
const water = () => g(() => { const v = Bataille.view(G, 1); return v.findIndex((x, i) => x === '.' && Bataille.shipAt(G, 1, i) < 0); });

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
const pages = await page.locator('#helpText .page').count();
ok(pages >= 3 && pages <= 5, `the rules have ${pages} pages`);
ok(await g(() => [...document.querySelectorAll('#help .page')].every(p => p.querySelector('.bn-pic[aria-hidden="true"]') && p.querySelector('.guide-lead'))), 'each rules page is one picture and a short sentence');
ok(await g(() => !document.querySelector('#help .q, #help .boat')), 'the squares and ships of the rules use their own classes');
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Facile', exact: true }).click();
await g(() => { G = Bataille.newGame('facile', 4242); save(); render(); });
ok(await page.locator('.q').count() === 200, 'two seas of 10 by 10 squares');
ok(await page.locator('#sea0 .boat').count() === 5 && await page.locator('#sea1 .boat').count() === 0, 'his ships show, the computer\'s are hidden');

// 2. Before the first shot, his ships can be placed again; the button goes after the first shot.
const before = await g(() => JSON.stringify(G.fleets[0]));
await page.click('#moveBtn');
ok(await g(b => JSON.stringify(G.fleets[0]) !== b, before) && /placés autrement/.test(await msg()), '"Changer mes bateaux" places his ships again');

// 3. Refusals: his own sea, with the reason.
await click(0, 0);
ok(/C'est votre flotte/.test(await msg()) && await g(() => G.shots[1] === '.'.repeat(100)), 'a click on his own sea is refused, with the reason');

// 4. A shot in the water, then the computer's answer, with its last shot ringed.
let w = await water();
await sq(1, w).click();
ok(await g(i => G.shots[1][i] === 'o', w) && /à l'eau/.test(await msg()), 'a shot in the water says so');
await answered();
ok(/L'ordinateur tire en [A-J]\d+/.test(await msg()) && /À vous/.test(await msg()), 'the computer answers and says where');
ok(await page.locator('#sea0 .q.last').count() === 1 && await page.locator('#sea1 .q.last').count() === 1, 'the last shot of each side is ringed');
ok(!(await page.locator('#moveBtn').isVisible()), 'the button to place the ships again goes after the first shot');
await page.mouse.move(5, 5); await wait(520);

// 5. The same square again is refused, and a double-click fires once.
await click(1, w);
ok(/déjà tiré/.test(await msg()), 'a square already fired is refused, with the reason');
w = await water();
await sq(1, w).dblclick();
await answered();
ok(await g(() => [...G.shots[1]].filter(x => x !== '.').length) === 2 && await g(() => [...G.shots[0]].filter(x => x !== '.').length) === 2,
  'a double-click fires one shot');
await page.mouse.move(5, 5); await wait(520);

// 6. A click during the computer's turn waits.
w = await water();
const w2 = await g(a => { const v = Bataille.view(G, 1); return v.findIndex((x, i) => x === '.' && i !== a); }, w);
await g(([a, b]) => { tap(1, a); tap(1, b); }, [w, w2]);
ok(/Attendez/.test(await msg()) && await g(b => G.shots[1][b] === '.', w2), 'a click during the computer\'s turn waits, with the reason');
await answered();

// 7. Sinking a ship: the squares around it are marked, and a click there is refused.
const torp = await g(() => G.fleets[1][4]);
await click(1, torp[0]); await answered();
await sq(1, torp[1]).click();
ok(/touché, coulé ! C'était son torpilleur/.test(await msg()), 'the sinking is said, with the ship');
await answered(); await page.mouse.move(5, 5); await wait(520);
ok(await g(t => t.every(i => Bataille.view(G, 1)[i] === 's'), torp) && await page.locator('#sea1 .boat.sunk').count() === 1, 'a sunk ship shows on his sea');
const clear = await g(() => Bataille.view(G, 1).indexOf('c'));
await click(1, clear);
ok(/touche un bateau coulé/.test(await msg()), 'a square beside a sunk ship is refused, with the reason');
await page.screenshot({ path: `${OUT}/bataille-navale-sunk.png` });

// 8. The hint frames a new square on the computer's sea and says why.
await page.click('#hintBtn');
const hinted = await g(() => [...document.querySelectorAll('#sea1 .q.hint')].map(e => +e.dataset.i));
ok(hinted.length === 1 && await g(i => Bataille.view(G, 1)[i] === '.', hinted[0]) && /Tirez en [A-J]\d+/.test(await msg()), 'the hint frames a new square and says why');
const hit = await g(() => G.fleets[1][0][0]);
await click(1, hit); await answered();
await page.click('#hintBtn');
ok(/touché|ligne|colonne/.test(await msg()) && await page.locator('#sea1 .q.ring').count() >= 1, 'after a hit, the hint follows it and rings it');

// 9. A reload during the computer's turn: the computer answers, with the same shot.
w = await water();
const expected = await g(i => { const n = Bataille.fire(G, 1, i).G; return Bataille.aim(n); }, w);
await g(i => { timers.forEach(clearTimeout); const r = Bataille.fire(G, 1, i); G = r.G; return save(); }, w);
await page.reload();
await answered();
ok(await g(i => G.last[0] === i, expected), 'after a reload during its turn, the computer fires the same shot');

// 10. The win: the dialog counts the shots and the win; the library line says it.
await g(() => { for (const i of G.fleets[1].flat().filter(j => G.shots[1][j] === '.').slice(0, -1)) G = Bataille.fire(G, 1, i).G; G.turn = 'me'; save(); render(); });
const last = await g(() => G.fleets[1].flat().find(i => G.shots[1][i] === '.'));
await click(1, last);
await page.waitForSelector('#over.on');
ok(/Bravo/.test(await page.textContent('#overTitle')) && /première victoire/.test(await page.textContent('#overText')), 'the win dialog, with the first win');
ok(await g(() => GG.meta('bataille-navale').summary) === '1 victoire', 'the library line counts the win');
await page.screenshot({ path: `${OUT}/bataille-navale-won.png` });
await page.locator('#overBtns button', { hasText: 'Nouvelle partie' }).click();
await page.locator('#overBtns button', { hasText: 'Moyen' }).click();
ok(await g(() => G.level === 'moyen' && !G.result && stats.won === 1), 'a new game at Moyen keeps the win');

// 11. The loss: the computer's ships left afloat show, pale.
await g(() => { for (const i of G.fleets[0].flat().slice(0, -1)) G = Bataille.fire(G, 0, i).G; G = { ...G, turn: 'me' }; save(); render(); });
await g(() => { const i = G.fleets[0].flat().find(j => G.shots[0][j] === '.'); G = { ...G, turn: 'them' }; const r = Bataille.fire(G, 0, i); G = r.G; save(); render(); finish(true); });
await page.waitForSelector('#over.on');
ok(/L'ordinateur a gagné/.test(await page.textContent('#overTitle')) && await page.locator('#sea1 .boat.reveal').count() === 5, 'the loss dialog, and his ships left afloat show');
ok(await g(() => stats.won === 1), 'a loss counts no win');

// 11b. A save that fails (the disk is full) keeps the warning, and the computer still answers.
await page.keyboard.press('Escape');
await g(() => { newGame('facile'); window.realSave = GG.save; GG.save = () => false; });
w = await water();
await g(i => tap(1, i), w);
await answered();
ok(/pas pu être enregistrée/.test(await msg()) && await g(() => G.turn === 'me' && G.last[0] >= 0), 'a failed save keeps its warning, and the computer still answers');
await g(() => { GG.save = realSave; save(); });

// 11c. The win shown late does not cover the levels he opened in between.
await g(() => { for (const i of G.fleets[1].flat().filter(j => G.shots[1][j] === '.').slice(0, -1)) G = Bataille.fire(G, 1, i).G; G.turn = 'me'; save(); render(); });
await g(() => { tap(1, G.fleets[1].flat().find(i => G.shots[1][i] === '.')); askNewGame(); });
await wait(900);
ok(await page.textContent('#overTitle') === 'Nouvelle partie', 'the win dialog does not replace the levels');
await page.keyboard.press('Escape');

// 11d. A press made during the computer's turn, released after its shot, does not fire.
await g(() => newGame('facile'));
w = await water();
await g(async i => { await tap(1, i); timers.forEach(clearTimeout); timers = []; }, w);
const w3 = await water();
const box = await sq(1, w3).boundingBox();
await page.mouse.move(box.x + 10, box.y + 10); await page.mouse.down();
await g(() => answer());
await page.mouse.up();
ok(await g(i => G.shots[1][i] === '.', w3), 'a press during the computer\'s turn, released after it, does not fire');

// 11e. A refused click on his own ship leaves the ship whole on top of the square.
await g(() => newGame('facile'));
const own = await g(() => G.fleets[0][1][1]);
await click(0, own);
const onTop = await g(i => { const q = document.querySelector(`.q[data-k="0"][data-i="${i}"]`), r = q.getBoundingClientRect();
  const e = document.elementsFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e.findIndex(x => x.classList.contains('boat')) < e.indexOf(q); }, own);
ok(onTop, 'a refused click on his own ship does not hide the ship');

// 11f. With animations on, each shot takes its time: his shot falls with its word, the computer's
// sight looks over his sea, then its shot falls, about 3.5 s after his click.
const slow = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'no-preference' });
slow.on('pageerror', e => errors.push(e.message));
await slow.goto(URL);
await slow.click('#helpClose');
await slow.getByRole('button', { name: 'Facile', exact: true }).click();
await slow.evaluate(() => { const v = Bataille.view(G, 1); tap(1, v.findIndex((x, i) => x === '.' && Bataille.shipAt(G, 1, i) < 0)); });
await slow.waitForTimeout(600);
ok(await slow.locator('#sea1 .word.eau').textContent() === 'Plouf !', 'a shot in the water says "Plouf !" over its square');
ok(await slow.evaluate(() => G.turn === 'them' && /L'ordinateur vise/.test(document.getElementById('msg').textContent)), 'his shot shows first, while the computer aims');
await slow.waitForTimeout(1700);
ok(await slow.locator('#sea0 .scope').count() === 1 && await slow.evaluate(() => G.turn === 'them'), 'then the computer\'s sight looks over his sea');
await slow.waitForFunction(() => G.turn === 'me', null, { timeout: 4000 });
ok(await slow.locator('#sea0 .scope').count() === 0 && await slow.locator('#sea0 .word').count() === 1, 'then it fires with its word, and the sight goes');
await slow.waitForTimeout(2600);
ok(await slow.locator('.word').count() === 0, 'the words go after their animation');
await slow.evaluate(() => { G = { ...G, turn: 'me' }; const i = G.fleets[1][0][0]; tap(1, i); });
await slow.waitForTimeout(700);
await slow.screenshot({ path: `${OUT}/bataille-navale-hit.png` });
ok(await slow.locator('#sea1 .word.touche').count() === 1 && await slow.locator('#sea1 .q.last.boom').count() === 1, 'a hit says "Touché !" and its square shakes');
await slow.close();

// 12. A phone: the computer's sea on top, and a click there fires.
const phone = await browser.newPage({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
phone.on('pageerror', e => errors.push(e.message));
await phone.goto(URL);
await phone.click('#helpClose');
await phone.getByRole('button', { name: 'Facile', exact: true }).click();
const tops = await phone.evaluate(() => [0, 1].map(k => document.getElementById('sea' + k).getBoundingClientRect().top));
ok(tops[1] < tops[0], 'on a phone the computer\'s sea comes first');
await phone.locator('.q[data-k="1"][data-i="55"]').tap();
ok(await phone.evaluate(() => G.shots[1][55] !== '.'), 'a tap on a phone fires');
await phone.screenshot({ path: `${OUT}/bataille-navale-phone.png` });

ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
