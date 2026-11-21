// The rules guide, labels, messages, saving across a reload, the stuck dialog and the win.
import { launch, URL, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const errors = [];

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
page.on('pageerror', e => errors.push(e.message));
const g = fn => page.evaluate(fn);
await page.goto(URL); await page.waitForTimeout(2200);
for (let n = 0; n < 3; n++) {
  const fit = await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; });
  ok(fit, `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/a-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Facile', exact: true }).click();
await page.waitForTimeout(1800);
ok(!(await g(() => dialogOpen())), '"J\'ai compris" closes the rules');

// Labels under the stock and the waste
const labels = await g(() => [...document.querySelectorAll('.plabel')].map(e => e.textContent));
ok(['Pioche', 'Défausse', 'Rangement'].every(t => labels.includes(t)), 'labels: ' + labels.join(', '));
// The labels share one row under the top row: no two may overlap.
const overlap = await g(() => {
  const rs = [...document.querySelectorAll('.plabel')].map(e => e.getBoundingClientRect());
  return rs.some((a, i) => rs.some((b, j) => i < j && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
});
ok(!overlap, 'the Pioche, Défausse and Rangement labels do not overlap');
const bankFits = await g(() => foundXY(3)[1] + L.h <= L.H);
ok(bankFits, 'the four Rangement piles fit in the window');

// The user's case: a column card clicked, then the waste clicked
const [tx, ty] = await g(() => { const r = table.getBoundingClientRect(); return [r.left, r.top]; });
await g(() => { if (!S.waste.length) clickStock(); });
await page.waitForTimeout(600);
const cand = await g(() => { for (let i = 0; i < 7; i++) { const c = last(S.tab[i]); if (c && destinations(locate(c.id)).length !== 1) return c.id; } return null; });
if (cand !== null) {
  await g(`choose(${cand})`);
  const wp = await g(() => [bankX(1) + L.w / 2, L.top + L.h / 2]);
  await page.mouse.click(tx + wp[0], ty + wp[1]);
  const m = await g(() => document.getElementById('msg').textContent);
  console.log('     message: ' + m);
  ok(m.includes('défausse') || (await g(() => sel)) !== cand, 'clicking the waste explains that no card goes on the défausse');
} else console.log('SKIP no column card with 0 or 2+ places');
await g(() => unchoose());
await page.screenshot({ path: `${OUT}/b-labels.png` });

// Rules button
await page.click('#helpBtn');
ok(await g(() => help.classList.contains('on')), 'Règles opens the rules');
const cb = await g(() => { const r = document.getElementById('helpClose').getBoundingClientRect(); return { h: r.height, t: document.getElementById('helpClose').textContent, focus: document.activeElement.id }; });
ok(cb.h >= 52 && cb.t === 'Fermer' && cb.focus === 'helpNext', `Fermer button is ${cb.h}px tall on page 1 and Suivant keeps the focus`);
await page.screenshot({ path: `${OUT}/b2-rules-fermer.png` });
await page.click('#helpClose');
ok(!(await g(() => help.classList.contains('on'))), 'Fermer closes the rules from page 1');
await page.click('#helpBtn'); await page.click('#helpNext');
await page.click('#helpClose');
ok(!(await g(() => help.classList.contains('on'))), 'Fermer closes the rules from page 2');
await page.click('#helpBtn');
await page.keyboard.press('Control+z');
await page.keyboard.press('Escape');
ok(!(await g(() => help.classList.contains('on'))), 'Escape closes the rules');

// Autosave across a reload
await g(() => { for (let n = 0; n < 3; n++) clickStock(); });
// Safe cards may still be going home on their own: wait until the board stops changing.
const snap = () => g(() => JSON.stringify({ S: { stock: S.stock, waste: S.waste, tab: S.tab, found: S.found }, u: undo.length }));
let before = await snap();
for (let n = 0; n < 20; n++) { await page.waitForTimeout(700); const s2 = await snap(); if (s2 === before) break; before = s2; }
await page.reload(); await page.waitForTimeout(1500);
ok(!(await g(() => help.classList.contains('on'))), 'rules do not open again after the first visit');
const after = await g(() => JSON.stringify({ S: { stock: S.stock, waste: S.waste, tab: S.tab, found: S.found }, u: undo.length }));
ok(before === after, 'reload restores the same game and the same undo history');
const u0 = await g(() => undo.length);
await page.click('#undoBtn'); await page.waitForTimeout(200);
ok(await g(() => undo.length) === u0 - 1, 'undo works after a reload');

// Stuck dialog: seven spades on top, every other card hidden, no stock
await g(() => {
  const tops = [1, 2, 3, 4, 5, 6, 7];
  const rest = [...Array(52).keys()].filter(i => !tops.includes(i));
  S = { stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []], moves: 3, won: false, stuckShown: false };
  rest.forEach((id, n) => S.tab[n % 7].push({ id, up: false }));
  tops.forEach((id, i) => S.tab[i].push({ id, up: true }));
  undo = [JSON.stringify(S)];
  render({ instant: true }); autoStep();
});
await page.waitForTimeout(300);
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent === 'Plus aucun coup possible'), 'stuck dialog shows');
await page.screenshot({ path: `${OUT}/c-stuck.png` });
ok(await g(() => document.activeElement.textContent) === 'Revenir en arrière', 'stuck dialog focuses Revenir en arrière');
await page.click('#overBtns button:text-is("Nouvelle partie")');
await page.click('#overBtns button:text-is("Moyen")');
await page.waitForTimeout(2000);
ok(!(await g(() => dialogOpen())) && await g(() => S.moves) === 0, 'Nouvelle partie from the stuck dialog deals a new game');

// Lost dialog: cards can still move, but the solver proves the game cannot be won.
// The position comes from random play on a winnable deal.
await g(() => {
  winnableDeal();
  const good = JSON.stringify(S);
  const x = { f: [7, 6, 8, 8], t: [9, 34], cols: [
    { d: [], u: [38, 50, 36, 48, 21, 7] }, { d: [], u: [] }, { d: [], u: [51, 24, 10] }, { d: [], u: [12, 37, 49, 35, 8, 20] },
    { d: [], u: [25] }, { d: [], u: [] }, { d: [19, 47, 11, 22], u: [23] }] };
  S = { stock: x.t.map(id => ({ id, up: false })), waste: [], moves: 9, won: false, stuckShown: false, lostShown: false,
    found: x.f.map((n, s) => [...Array(n).keys()].map(r => ({ id: s * 13 + r, up: true }))),
    tab: x.cols.map(c => [...c.d.map(id => ({ id, up: false })), ...c.u.map(id => ({ id, up: true }))]) };
  undo = [good];
  render({ instant: true }); autoStep();
});
await page.waitForTimeout(300);
ok(await g(() => sMoves(toSolver()).length > 0), 'lost position still has moves');
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent === 'Partie perdue'), 'lost dialog shows while cards can still move');
await page.screenshot({ path: `${OUT}/c2-lost.png` });
ok(await g(() => document.activeElement.textContent) === 'Revenir en arrière', 'lost dialog focuses Revenir en arrière');
await page.click('#overBtns >> text=Revenir en arrière');
await page.waitForTimeout(300);
ok(await g(() => !dialogOpen() && S.moves === 0 && solve(toSolver(), 20000).win), 'Revenir en arrière goes back to a winnable position');
await g(() => { clickStock(); });
await page.waitForTimeout(800);
ok(!(await g(() => dialogOpen())), 'no lost dialog in a winnable game');

// Win: the piles hop, then the dialog shows
await g(() => {
  S = { stock: [], waste: [], found: [0, 1, 2, 3].map(s => [...Array(12).keys()].map(r => ({ id: s * 13 + r, up: true }))), tab: [[{ id: 12, up: true }], [{ id: 25, up: true }], [{ id: 38, up: true }], [{ id: 51, up: true }], [], [], []], moves: 5, won: false, stuckShown: false };
  render({ instant: true }); autoStep();
});
let hops = 0;
for (let n = 0; n < 40 && !hops; n++) {
  await page.waitForTimeout(100);
  hops = await g(() => S.found.filter(f => f.length && E[last(f).id].getAnimations().length).length);
}
ok(hops >= 1, `finished piles hop (${hops} animating)`);
await page.waitForTimeout(2500);
ok(await g(() => dialogOpen() && document.getElementById('overTitle').textContent.includes('Bravo')), 'win dialog shows after the hop');
ok(await g(() => document.getElementById('wins').textContent).then(t => /Victoires/.test(t)), 'the win count shows next to the message line');
await page.screenshot({ path: `${OUT}/d-win.png` });

// Tab stays inside an open dialog, and closing it gives the focus back to the button that opened it.
await g(() => Kit.closeDialog());
await page.focus('#newBtn');
await page.evaluate(() => Kit.dialog('Partie perdue', 'Test', [['Revenir en arrière', null, true], ['Nouvelle partie', null]]));
for (let n = 0; n < 4; n++) await page.keyboard.press('Tab');
ok(await g(() => !!document.activeElement.closest('#box')), 'Tab stays inside the dialog');
await page.keyboard.press('Escape');
ok(await g(() => document.activeElement.id === 'newBtn'), 'closing the dialog gives the focus back');

// Two windows of the same game: the older one cannot save over the newer game, and asks to reload.
const ctx = await browser.newContext({ viewport: { width: 1366, height: 680 } });
const a = await ctx.newPage(), b = await ctx.newPage();
for (const p of [a, b]) { p.on('pageerror', e => errors.push(e.message)); await p.goto(URL); await p.waitForTimeout(2200); await p.keyboard.press('Escape'); }
// A test save that no game writes by itself, so only these two calls touch it.
await a.evaluate(() => GG.load('twotabs')); await b.evaluate(() => GG.load('twotabs'));
const first = await a.evaluate(() => GG.save('twotabs', { won: 7 }));
const second = await b.evaluate(() => GG.save('twotabs', { won: 0 }));
ok(first && !second && (await a.evaluate(() => GG.load('twotabs'))).won === 7, 'an older window does not save over a newer game');
ok(await b.evaluate(() => dialogOpen() && document.getElementById('overTitle').textContent.includes('changé')), 'the older window asks to reload');
await ctx.close();

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
