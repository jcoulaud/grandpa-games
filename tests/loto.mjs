// Plays the loto with a real mouse: the first visit and its coach, drawing, the jetons, refusals, a wrong call,
// the hint, a good call and its lot, a neighbour's call, undo, reloads, the end and the win counted once, broken
// and old saves, the levels, the rules guide, and the layout at every window and size of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('loto');
const errors = [];
const watch = p => p.on('pageerror', e => errors.push(e.message));

let page = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
watch(page);
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
// A click, then the mouse moves away and waits, so the next click on the same thing is not a double-click.
const click = async sel => { await page.locator(sel).first().click(); await page.mouse.move(5, 5); await wait(520); };
const box = (c, n) => `#cartons .box[data-c="${c}"][data-n="${n}"]`;
// Puts the game in a known state and draws it.
const setGame = (fn, arg) => g(([f, a]) => { G = new Function('G', 'L', 'a', f)(G, Loto, a); save(); render(); }, [fn, arg]);

// 1. The first visit: a game at Facile at once, with no dialog, and the coach on « Tirer le numéro ».
await page.goto(URL);
await wait(400);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && G.drawn === 0 && G.covered.length === 1), 'the first visit starts a game at Facile with one carton, with no dialog');
ok(/Cliquez sur « Tirer le numéro »/.test(await msg()), 'the message line says what to click: ' + await msg());
ok(await g(() => Kit.coaching() && document.getElementById('drawBtn').classList.contains('coach')), 'the coach rings « Tirer le numéro »');
ok(await g(() => document.getElementById('undoBtn').disabled && !!document.getElementById('undoBtn').dataset.why), 'the grey undo button says why');
ok(await page.locator('#cartons .box.num').count() === 15 && await page.locator('#cartons .box.blank').count() === 12, 'his carton has 15 numbers and 12 empty boxes');
ok(await page.locator('.seat').count() === 3, 'three neighbours sit at his table');
ok(await page.locator('#lots .lot').count() === 3 && await page.locator('#lots .lot.now').count() === 1, 'the three lots are shown, the quine in play');

// 2. The rules guide: five pages that fit, and Fermer.
await page.click('#helpBtn');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/loto-rules-${n + 1}.png` });
  if (n < 4) await page.click('#helpNext');
}
await page.click('#helpClose');
ok(await g(() => !Kit.isOpen()), 'the rules close back to the game');

// 3. A draw: the number comes out, shows on the board, and at Facile glows on his carton when it is his.
await g(() => { G = Loto.newGame('facile', 5150); save(); render(); });
const mine = await g(() => Loto.numbersOf(Loto.setup(G).mine[0]));
const order = await g(() => Loto.setup(G).order);
const firstMine = order.findIndex(n => mine.includes(n));
await click('#drawBtn');
ok(await g(() => G.drawn === 1) && await page.locator('#board i.out').count() === 1, 'a click on « Tirer le numéro » draws one number, shown on the board');
ok(await page.locator('#callName b').textContent() === `Le ${order[0]}`, 'the caller shows the number: ' + await page.locator('#callName b').textContent());
if (!mine.includes(order[0])) ok(/n’est pas sur votre carton/.test(await msg()), 'a number not on his carton says so and what to click next: ' + await msg());
// Draw up to his first number with the bag itself.
await g(n => { while (G.drawn < n) G = Loto.next(G).G; save(); render(); }, firstMine);
await click('#bag');
const n1 = order[firstMine];
ok(await g(n => G.drawn > 0 && Loto.setup(G).order[G.drawn - 1] === n, n1), 'a click on the bag draws too');
ok(new RegExp(`Le ${n1} ! Il est sur votre carton : cliquez sur le ${n1} qui brille`).test(await msg()), 'his number is named, with what to click: ' + await msg());
ok(await page.locator(`${box(0, n1)}.lit`).count() === 1, 'at Facile his number glows before any click');
ok(await g(() => Kit.coaching() && document.querySelector('#cartons .box.coach') !== null), 'the coach points at the number to cover');

// 4. Jetons: on a number out, refused on a number not out, an empty box and a covered number say why.
await click(box(0, n1));
ok(await g(n => G.covered[0].includes(n), n1) && await page.locator(`${box(0, n1)} .jeton`).count() === 1, 'a click on his number puts a jeton on it');
ok(/Jeton posé sur le/.test(await msg()), 'the jeton is said: ' + await msg());
const notOut = mine.find(n => order.indexOf(n) > firstMine + 3);
await click(box(0, notOut));
ok(new RegExp(`Le ${notOut} n’est pas encore sorti`).test(await msg()) && await g(n => !G.covered[0].includes(n), notOut), 'a number not out yet is refused, with the reason');
await click('#cartons .box.blank');
ok(/Cette case est vide/.test(await msg()), 'an empty box says what to do');
await click(box(0, n1));
ok(/a déjà son jeton/.test(await msg()), 'a covered number says it has its jeton');
// A double-click on a number puts one jeton, once.
// 5. Undo takes back the last jeton; Ctrl+Z too.
await click('#undoBtn');
ok(await g(n => !G.covered[0].includes(n), n1) && /Jeton retiré du/.test(await msg()), 'undo takes back his last jeton');
await page.locator(box(0, n1)).dblclick();
await page.mouse.move(5, 5); await wait(520);
ok(await g(n => G.covered[0].filter(x => x === n).length === 1 && G.undo.length === 1, n1) && !/déjà/.test(await msg()), 'a double-click puts one jeton and says nothing wrong');
await page.keyboard.press('Control+z');
ok(await g(n => !G.covered[0].includes(n), n1), 'Ctrl+Z takes back the jeton');

// 6. A wrong call says why, kindly, and costs nothing.
await click('#callBtn');
ok(/^Pas encore : la quine, c’est 5 numéros couverts sur une même ligne\. Votre meilleure ligne en a \d\.$/.test(await msg()) && await g(() => G.phase === 0),
  'a call too early says why: ' + await msg());
// A row all out but one number without its jeton: « Presque ! » names it.
const row = await g(() => Loto.setup(G).mine[0][0].filter(Boolean));
await setGame('const need = a; const at = Math.max(...need.map(n => L.setup(G).order.indexOf(n))) + 1; return { ...G, drawn: at, covered: [need.slice(0, 4)], undo: [] };', row);
await click('#callBtn');
ok(new RegExp(`^Presque ! Le ${row[4]} est sorti mais n’a pas de jeton : couvrez-le, puis criez\\.$`).test(await msg()), 'a call with a number left uncovered names it: ' + await msg());
ok(await page.locator(`${box(0, row[4])}.lit`).count() === 1, 'and rings it');

// 7. The hint: it rings a number to cover, then turns the call yellow.
// The hint names the most recent number out that has no jeton, and rings it.
const advice = await g(() => Loto.advice(G));
await page.click('#hintBtn');
ok(advice.kind === 'cover' && new RegExp(`Le ${advice.n} est sorti et il est sur votre carton : cliquez sur le ${advice.n} entouré`).test(await msg()), 'the hint names the number to cover: ' + await msg());
await click(box(0, row[4]));
ok(await g(() => document.getElementById('callBtn').classList.contains('ready') && document.getElementById('callBtn').hasAttribute('data-nudge')), 'at Facile a quine ready turns « Quine ! » yellow');
ok(/cliquez sur « Quine ! »/.test(await msg()), 'the message line says to call: ' + await msg());

// 8. A good call wins the lot: the prize shows, the lot goes to him, the double quine is in play.
const lot = await g(() => Loto.setup(G).lots[0][1]);
await click('#callBtn');
ok(await g(() => G.phase === 1 && G.winners[0].who === -1), 'his quine is accepted');
ok((await msg()).startsWith(`Quine ! Bravo, vous gagnez ${lot}. On joue la double quine`), 'the lot is named: ' + await msg());
ok(await page.locator('#lots .lot.mine').count() === 1 && await page.locator('#callBtn').textContent() === 'Double quine !', 'his lot is marked on the shelf, and the button says « Double quine ! »');
ok(await page.locator('#cartons .box.won').count() === 5, 'his winning row is underlined');
ok(await g(() => G.undo.length === 0 && document.getElementById('undoBtn').disabled), 'a call cannot be undone');
await page.screenshot({ path: `${OUT}/loto-quine.png` });

// 9. A neighbour calls: his click on « Tirer le numéro » shows the call instead of a number.
await setGame(`for (;;) { const d = L.dueCall(G); if (d) return G; const r = L.next(G); G = r.G; }`);
const due = await g(() => Loto.dueCall(G));
const drawnBefore = await g(() => G.drawn);
const who = await g(k => Loto.setup(G).hall[k].name, due.who);
await click('#drawBtn');
ok(await g(d => G.drawn === d && G.phase === 2 && G.winners[1].who >= 0, drawnBefore), 'a neighbour calls the double quine, and no number comes out');
ok((await msg()).startsWith(`${who} crie « Double quine ! » et gagne`), 'the call is said with the lot: ' + await msg());
ok(await page.locator('.seat .bubble').count() === 1, 'a bubble shows the call at the seat');

// 10. A reload keeps the game.
const before = await g(() => JSON.stringify(G));
await page.reload(); await wait(400);
ok(await g(s => JSON.stringify(G) === s, before), 'a reload brings back the same game');
ok(await page.locator('#cartons .jeton').count() === await g(() => G.covered[0].length), 'the jetons come back');

// 11. The end: carton plein by him, counted once as a win.
await setGame('const nums = L.numbersOf(L.setup(G).mine[0]); return { ...G, drawn: 90, covered: [nums], undo: [] };');
await click('#callBtn');
await page.waitForFunction(() => document.getElementById('over').classList.contains('on'), null, { timeout: 8000 });
ok(await page.locator('#overTitle').textContent() === 'Bravo, vous avez gagné !', 'the win says bravo');
ok(/Vous repartez avec/.test(await page.locator('#overText').textContent()), 'the dialog names his lots: ' + await page.locator('#overText').textContent());
ok(await g(() => G.phase === 3 && stats.won === 1 && GG.meta('loto').summary === '1 victoire'), 'the win is counted, and the tile says so');
ok(await g(() => document.getElementById('newBtn').hasAttribute('data-nudge') && document.getElementById('drawBtn').disabled && !!document.getElementById('drawBtn').dataset.why),
  'the end points to « Nouvelle partie », and the grey draw button says why');
await page.screenshot({ path: `${OUT}/loto-won.png` });
await page.keyboard.press('Escape');
await page.reload(); await wait(400);
ok(await g(() => G.phase === 3 && stats.won === 1 && !Kit.isOpen()), 'a reload after the win counts it once and opens no dialog');

// 12. A partie with no lot for him ends kindly.
await g(() => { G = Loto.newGame('facile', 8); render(); });
await setGame('for (let i = 0; i < 400 && G.phase < 3; i++) G = L.next(G).G; return { ...G, phase: 2, starts: G.starts.slice(0, 3), winners: G.winners.slice(0, 2) };');
await click('#drawBtn');
await page.waitForFunction(() => document.getElementById('over').classList.contains('on'), null, { timeout: 8000 });
ok(await page.locator('#overTitle').textContent() === 'La partie est finie' && /Pas de lot pour vous cette fois/.test(await page.locator('#overText').textContent()), 'a partie without a lot ends kindly');
ok(await g(() => stats.won === 1), 'and counts no win');
await page.keyboard.press('Escape');

// 13. A broken save starts a new game and keeps the wins; a save without a level loads at Facile.
await g(() => { const v = GG.load('loto'); v.G.covered = [[999]]; localStorage.setItem('gg:save:loto', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload(); await wait(400);
ok(await g(() => !Kit.isOpen() && G.drawn === 0 && G.phase === 0 && stats.won === 1), 'a broken save starts a new game and keeps the wins');
await click('#drawBtn');
await g(() => { const v = GG.load('loto'); delete v.G.level; localStorage.setItem('gg:save:loto', JSON.stringify({ updatedAt: Date.now(), data: v })); });
await page.reload(); await wait(400);
ok(await g(() => G.level === 'facile' && G.drawn === 1), 'a save without a level loads at Facile');

// 14. The levels: two cartons and no light at Moyen, three at Difficile.
await page.click('#newBtn');
ok(await page.locator('#overText.warn').count() === 1, 'a new game during a partie warns that it will be erased');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
await wait(200);
ok(await page.locator('#cartons .carton').count() === 2 && await g(() => G.level === 'moyen'), 'Moyen deals two cartons');
await g(() => { G = Loto.newGame('moyen', 5150); for (let i = 0; i < 40; i++) G = Loto.next(G).G; save(); render(); });
ok(await page.locator('#cartons .box.lit').count() === 0, 'at Moyen the numbers out do not glow');
ok(/Couvrez les numéros sortis/.test(await g(() => turnText())), 'at Moyen the line says to cover the numbers out');
await page.click('#newBtn');
await page.getByRole('button', { name: 'Difficile', exact: true }).click();
await wait(200);
ok(await page.locator('#cartons .carton').count() === 3, 'Difficile deals three cartons');

// 14b. Review fixes. The keyboard alone can play: Tab reaches the numbers of the carton, which show a focus
// ring, and Enter or Space puts a jeton. And after a jeton, the line names what the phase in play needs.
await g(() => { G = Loto.newGame('moyen', 2); for (let i = 0; i < 67; i++) G = { ...G, drawn: G.drawn + 1 }; save(); render(); });
await page.locator('#cartons .box.num').first().focus();
await page.keyboard.press('Tab');
const focused = await g(() => { const e = document.activeElement; return e && e.matches('#cartons .box.num') ? { c: +e.dataset.c, n: +e.dataset.n, ring: getComputedStyle(e).outlineStyle, tab: e.tabIndex } : null; });
ok(focused && focused.tab === 0 && focused.ring === 'solid', 'Tab moves from number to number on the carton, with a visible ring');
const kbN = await g(() => { const s = new Set(Loto.setup(G).order.slice(0, G.drawn)); const e = [...document.querySelectorAll('#cartons .box.num')].find(b => s.has(+b.dataset.n)); e.focus(); return +e.dataset.n; });
await page.keyboard.press('Enter');
ok(await g(n => G.covered.some(c => c.includes(n)), kbN), 'Enter puts a jeton on the focused number');
const kbM = await g(() => { const s = new Set(Loto.setup(G).order.slice(0, G.drawn)); const e = [...document.querySelectorAll('#cartons .box.num')].find(b => s.has(+b.dataset.n) && !G.covered[+b.dataset.c].includes(+b.dataset.n)); e.focus(); return +e.dataset.n; });
await page.keyboard.press(' ');
ok(await g(n => G.covered.some(c => c.includes(n)), kbM), 'Space puts a jeton too');
for (const [phase, words] of [[0, 'si une ligne est pleine'], [1, 'si deux lignes d’un même carton sont pleines'], [2, 'si un carton est plein']]) {
  await g(p => { G = { ...Loto.newGame('moyen', 2), drawn: 67, phase: p, starts: Array(p + 1).fill(0), winners: Array.from({ length: p }, () => ({ who: 0, carton: 0, at: 0 })) }; save(); render(); }, phase);
  const n = await g(() => Loto.numbersOf(Loto.setup(G).mine[0]).find(x => Loto.setup(G).order.slice(0, G.drawn).includes(x)));
  await click(box(0, n));
  ok((await msg()).endsWith(`« ${['Quine !', 'Double quine !', 'Carton plein !'][phase]} » ${words}.`), `after a jeton in phase ${phase + 1}, the line says when to call: ` + await msg());
}

// 15. Every window and size of docs/design.md: the table fits, the boxes and the board are large enough,
// the text is 20 px or more, the buttons 44 px or more, the longest message fits, and the end dialog fits.
const LONG = 'Jeton posé sur le 88. Cliquez sur « Tirer le numéro », ou sur « Double quine ! » si deux lignes d’un même carton sont pleines.';
const sizes = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [1366, 680, 1.3], [1920, 1000, 1.75], [390, 760, 1]];
for (const [w, h, z] of sizes) for (const lv of ['facile', 'fort']) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce', ...(w < 700 ? { isMobile: true, hasTouch: true } : {}) });
  watch(p);
  await p.addInitScript(z => localStorage.setItem('gg:size', JSON.stringify(z)), z);
  page = p;
  await p.goto(URL); await wait(300);
  const name = `${w}x${h}${z > 1 ? ' at ' + z * 100 + ' %' : ''} ${lv}`;
  await g(lv => { newGame(lv); for (let i = 0; i < 60; i++) G = Loto.next(G).G; const s = Loto.setup(G); s.mine.forEach((c, k) => Loto.numbersOf(c).forEach((n, j) => { if (j % 2) { const r = Loto.cover(G, k, n); if (r.G) G = r.G; } })); render(); layout(); }, lv);
  await g(t => Kit.say(t), LONG);
  await wait(100);
  const r = await g(() => {
    const bad = [];
    const vw = innerWidth / Zoom.z(), vh = innerHeight / Zoom.z();
    if (document.scrollingElement.scrollWidth > innerWidth + 1) bad.push('the page scrolls sideways');
    const t = document.getElementById('table');
    if (innerWidth >= 700 && t.scrollHeight > t.clientHeight + 1) bad.push(`the table overflows (${t.scrollHeight} > ${t.clientHeight})`);
    const inside = el => { const b = el.getBoundingClientRect(), Z = Zoom.z(); return b.left >= -1 && b.right / Z <= vw + 1 && b.top >= -1; };
    for (const el of document.querySelectorAll('#cartons .carton, #boardBox, #lots, #drawBtn, #callBtn, .seat')) if (!inside(el)) bad.push((el.id || el.className) + ' outside');
    // Every carton lies whole on the wooden table, never cut by it.
    const wood = document.getElementById('wood').getBoundingClientRect();
    for (const el of document.querySelectorAll('#cartons .carton')) {
      const b = el.getBoundingClientRect();
      if (b.top < wood.top - 1 || b.bottom > wood.bottom + 1 || b.left < wood.left - 1 || b.right > wood.right + 1) bad.push('a carton is cut by the table');
    }
    // Text: 20 px or more, 13 on a phone (the numbers of the cartons and the board included).
    const minText = innerWidth < 700 ? 13 : 20;
    // The word LOTO printed on the stub of a carton is part of the card, like the indexes of a playing card.
    for (const el of document.querySelectorAll('#table b, #table span, #table i, #drawBtn, #callBtn, #msg')) {
      if (!el.offsetParent || !el.textContent.trim() || el.closest('.stub')) continue;
      const f = parseFloat(getComputedStyle(el).fontSize);
      if (f < minText - .1) bad.push(`text ${f}px: ${el.textContent.trim().slice(0, 20)}`);
    }
    for (const el of document.querySelectorAll('#drawBtn, #callBtn, #bar button')) if (el.offsetParent && el.getBoundingClientRect().height / Zoom.z() < 44) bad.push('button < 44 px: ' + el.id);
    const msg = document.getElementById('msg');
    if (msg.scrollWidth > msg.clientWidth + 1 || msg.scrollHeight > msg.clientHeight + 1) bad.push('the message is cut');
    const cell = document.querySelector('#cartons .box.num').getBoundingClientRect().width / Zoom.z();
    const bc = document.querySelector('#board i').getBoundingClientRect().width / Zoom.z();
    return { bad, cell: Math.round(cell), bc: Math.round(bc) };
  });
  ok(!r.bad.length, `${name}: the table fits, text and buttons large enough ${r.bad.slice(0, 4).join(', ')}`);
  // At Facile the one carton has boxes of 44 px or more, 38 px on a page of 1100 px or less (a size key up).
  const minCell = w < 700 ? 30 : lv === 'facile' ? (w / z < 1100 ? 38 : 44) : 28;
  ok(r.cell >= minCell && r.bc >= (w < 700 ? 28 : 27), `${name}: the boxes are ${r.cell} px, the board ${r.bc} px`);
  await p.screenshot({ path: `${OUT}/loto-${w}x${h}${z > 1 ? '-' + z : ''}-${lv}.png` });
  if (lv === 'facile' && h / z >= 620) {
    await p.click('#helpBtn');
    let fit = true;
    for (let n = 0; n < 5; n++) { fit &&= await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }); await p.click('#helpNext'); }
    ok(fit, `${name}: every rules page fits without scrolling`);
  }
  if (lv === 'fort') {
    await g(() => { G = { ...G, drawn: 90, phase: 2, starts: [0, 0, 0], winners: [{ who: -1, carton: 0, at: 0 }, { who: 0, carton: 0, at: 0 }] }; G.covered = Loto.setup(G).mine.map((c, k) => k ? [] : Loto.numbersOf(c)); G.undo = []; render(); });
    await p.locator('#callBtn').click();
    await p.locator('#over.on').waitFor();
    ok(await g(() => { const b = document.getElementById('box').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; }), `${name}: the end dialog fits`);
  }
  await p.close();
}

// 16. With motion: the token comes out of the bag and lands, the jeton drops in, the prize shows then goes.
page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
watch(page);
await page.goto(URL); await wait(300);
await g(() => { G = Loto.newGame('facile', 5150); save(); render(); });
await click('#drawBtn');
ok(await g(() => document.getElementById('ball').classList.contains('out') && document.getElementById('bag').classList.contains('shake')), 'with motion, the bag shakes and the token comes out');
await setGame('const nums = L.setup(G).mine[0][0].filter(Boolean); const at = Math.max(...nums.map(n => L.setup(G).order.indexOf(n))) + 1; return { ...G, drawn: at, covered: [nums], undo: [] };');
await click('#callBtn');
ok(await g(() => document.getElementById('prize').classList.contains('on')), 'the prize shows in the middle of the table');
await wait(3600);
ok(await g(() => !document.getElementById('prize').classList.contains('on')), 'then it goes, so nothing waits on it');

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
