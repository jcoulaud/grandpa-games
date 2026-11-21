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
ok(!(await g(() => dialogOpen())), '"J\'ai compris" closes the rules');

// Labels under the stock and the waste
const labels = await g(() => [...document.querySelectorAll('.plabel')].map(e => e.textContent));
ok(['Pioche', 'Défausse', 'Rangement'].every(t => labels.includes(t)), 'labels: ' + labels.join(', '));
const overlap = await g(() => { const r = foundLabel.getBoundingClientRect(), s = document.querySelectorAll('.plabel')[0].getBoundingClientRect(); return s.bottom > r.top; });
ok(!overlap, 'Pioche label does not overlap Rangement label');
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
  const m = await g(() => msgEl.textContent);
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
await page.waitForTimeout(800);
const before = await g(() => JSON.stringify({ S: { stock: S.stock, waste: S.waste, tab: S.tab, found: S.found }, u: undo.length }));
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
await page.click('text=Nouvelle partie >> nth=-1');
await page.waitForTimeout(2000);
ok(!(await g(() => dialogOpen())) && await g(() => S.moves) === 0, 'Nouvelle partie from the stuck dialog deals a new game');

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
ok(await g(() => document.getElementById('wins').textContent).then(t => /Victoires/.test(t)), 'toolbar shows the win count');
await page.screenshot({ path: `${OUT}/d-win.png` });

ok(errors.length === 0, 'no page errors ' + errors.join(' | '));
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED');
process.exit(fails ? 1 : 0);
