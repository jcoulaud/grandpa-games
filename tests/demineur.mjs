// Plays the démineur with a real mouse: the guided Facile, the first click, flags with the right button and with the
// "Drapeau" button, refusals, opening around a number, the hint followed to a win, a mine and its undo,
// undo of the first click, double-clicks, saves across a reload, the sizes of the squares and a phone.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('demineur');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const cell = i => page.locator(`.c[data-i="${i}"]`);
// A click, then the mouse moves away and waits, so the next click on the same square is not a double-click.
const click = async (i, button = 'left') => { await cell(i).click({ button }); await page.mouse.move(5, 5); await wait(520); };
const cells = () => g(() => G.cells);
const start = async level => {
  await page.click('#newBtn');
  await page.locator('#overBtns button', { hasText: { facile: 'Facile', moyen: 'Moyen', fort: 'Difficile' }[level] }).click();
};

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 5; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/demineur-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Facile', exact: true }).click();
// A fixed seed, so the steps below meet the same board each time. Moyen, because Facile refuses a guess.
await g(() => { G = Demineur.newGame('moyen', 12345); save(); render(); });
ok(await page.locator('.c').count() === 140, 'Moyen has 14 by 10 squares');
ok(await g(() => G.first === -1 && G.layout === null), 'no mine is placed before the first click');

// 2. Before the first click: a flag is refused, the hint says to click anywhere.
await click(40, 'right');
ok(/Ouvrez d'abord une case/.test(await msg()) && !(await cells()).includes('f'), 'a flag before the first click is refused, with the reason');
await page.click('#hintBtn');
ok(/première ne cache jamais de mine/.test(await msg()), 'the hint before the first click says to click anywhere');

// 3. The first click opens an area, never a mine.
await click(40);
const opened = (await cells()).split('').filter(c => c === 'o').length;
ok(opened > 1 && await g(() => G.result === null && !Demineur.isMine(G, 40)), `the first click opens ${opened} squares and no mine`);
await page.screenshot({ path: `${OUT}/demineur-first.png` });

// 4. Flags: the right button, the "Drapeau" button for one square, a click on a flag takes it off.
const closed = async () => (await cells()).indexOf('.');
let c = await closed();
await click(c, 'right');
ok((await cells())[c] === 'f', 'the right button puts a flag');
ok(await g(() => /Drapeaux\s*1 sur 22/.test(document.getElementById('flags').textContent) && !!document.getElementById('flags').closest('#table')), 'the sign by the board counts the flag');
await click(c);
ok((await cells())[c] === '.' && /Drapeau retiré/.test(await msg()), 'a left click on a flag takes it off and does not open the square');
await page.click('#flagBtn');
ok(await g(() => document.getElementById('flagBtn').getAttribute('aria-pressed')) === 'true', '"Drapeau" stays pressed while it waits for a square');
await click(c);
ok((await cells())[c] === 'f' && await g(() => document.getElementById('flagBtn').getAttribute('aria-pressed')) === 'false', '"Drapeau" puts one flag, then a click opens again');
await page.click('#flagBtn'); await page.keyboard.press('Escape');
ok(await g(() => !arming) && /Drapeau annulé/.test(await msg()), 'Escape puts "Drapeau" back');
await click(c, 'right');
const openSq = (await cells()).indexOf('o');
await click(openSq, 'right');
ok(/déjà ouverte/.test(await msg()), 'a flag on an open square is refused, with the reason');

// 5. Double-clicks count once: two quick right clicks leave one flag.
c = await closed();
await cell(c).dblclick({ button: 'right' });
await page.mouse.move(5, 5); await wait(520);
ok((await cells())[c] === 'f', 'a quick double right click puts one flag, not two');
await click(c, 'right');

// 6. Opening around a number: refused with too few flags, then it opens once the flags are right.
const num = await g(() => [...G.cells].findIndex((x, i) => x === 'o' && Demineur.number(G, i) > 0
  && Demineur.neighbours(G.w, G.h)[i].some(j => G.cells[j] === '.' && !Demineur.isMine(G, j))));
await click(num);
ok(/ne touche aucun drapeau : il en faut/.test(await msg()), 'a number with too few flags says how many it needs: ' + await msg());
await g(i => { for (const j of Demineur.neighbours(G.w, G.h)[i]) if (Demineur.isMine(G, j) && G.cells[j] === '.') G = Demineur.flag(G, j); render(); }, num);
await click(num);
ok(await g(i => Demineur.neighbours(G.w, G.h)[i].every(j => G.cells[j] !== '.'), num), 'with the right flags, a click on the number opens the squares around it');

// 7. A mine: it goes off, the dialog offers to undo first, and undo takes back only that click.
ok(await g(() => G.result === null && G.layout.some(i => G.cells[i] === '.')), 'the game goes on with mines still closed');
const before = await cells();
const mine = await g(() => G.layout.find(i => G.cells[i] === '.'));
await cell(mine).click();
await page.locator('.blast').waitFor();
ok(await page.locator('.blast').count() === 1 && !(await g(() => Kit.isOpen())), 'the mine explodes before the dialog opens');
await page.waitForFunction(() => Kit.isOpen());
ok(await page.locator('.blast').count() === 0, 'the explosion clears itself before the dialog');
await page.mouse.move(5, 5);
ok(await g(() => G.result === 'lost' && G.boom >= 0), 'a click on a mine loses the game');
ok(await page.locator('.c.boom svg').count() === 1, 'only the mine that went off is shown');
ok(await page.locator('#overBtns button.primary').textContent() === 'Annuler le dernier coup', 'the dialog offers "Annuler le dernier coup" first');
await page.screenshot({ path: `${OUT}/demineur-lost.png` });
await page.locator('#overBtns button.primary').click();
ok(await cells() === before && await g(() => G.result === null && G.boom === -1), 'undo takes back the click on the mine and nothing else');

// 8. Saves: a reload brings back the same squares and flags.
await click(await g(() => G.layout.find(i => G.cells[i] === '.')), 'right');
const saved = await cells();
await page.reload();
await wait(300);
ok(await cells() === saved && await g(() => G.result === null), 'a reload brings back the same game');

// 9. The hint, followed square by square with the mouse, wins the game. A wrong flag comes first.
const wrong = await g(() => [...G.cells].findIndex((x, i) => x === '.' && !Demineur.isMine(G, i)));
await click(wrong, 'right');
await page.click('#hintBtn');
ok(await g(i => [...document.querySelectorAll('.c.hint')].map(e => +e.dataset.i).join() === String(i), wrong) && /pas de mine sous le drapeau/.test(await msg()),
  'the hint frames a wrong flag first');
await click(wrong);
const sentences = new Set();
// Clicks what the hint frames until the game is won: the right button on a mine, the left on a safe square.
const followHint = async () => {
  let steps = 0;
  for (; steps < 200 && await g(() => !G.result); steps++) {
    await page.click('#hintBtn');
    const h = await g(() => { const i = +document.querySelector('.c.hint').dataset.i; return { i, mine: Demineur.isMine(G, i) }; });
    sentences.add(await msg());
    await click(h.i, h.mine ? 'right' : 'left');
  }
  await wait(800);
  return steps;
};
const steps = await followHint();
ok(await g(() => G.result === 'won'), `following the hint wins, in ${steps} clicks`);
ok(![...sentences].some(t => t === 'La case encadrée est sûre : ouvrez-la.'), 'the hint always gives its reason: ' + sentences.size + ' sentences');
ok(await page.locator('#overTitle').textContent() === 'Bravo, vous avez gagné !', 'the win says bravo');
ok(await g(() => stats.won === 1 && GG.meta('demineur').summary === '1 victoire'), 'the win is counted once and the tile says so');
await page.screenshot({ path: `${OUT}/demineur-won.png` });
await page.keyboard.press('Escape');
await page.click('#undoBtn');
ok(await g(() => G.result === null), 'undo after the win takes back the last click');
await followHint();
await page.keyboard.press('Escape');
ok(await g(() => G.result === 'won' && stats.won === 1), 'winning again after an undo does not count a second win');

// 10. Undo of the first click: the board closes, and the same square opens the same board again.
await start('facile');
await click(30);
const layout = await g(() => JSON.stringify(G.layout));
await page.click('#undoBtn');
ok(await g(() => G.first === -1 && !G.cells.includes('o')), 'undo of the first click closes the board');
await click(30);
ok(await g(() => JSON.stringify(G.layout)) === layout, 'the same first square opens the same board again');

// 11. The levels: their sizes, and squares large enough on his laptop and with the text at 125 %.
for (const [level, w, h, n] of [['moyen', 14, 10, 22], ['fort', 20, 10, 36]]) {
  await start(level);
  ok(await g(() => [G.w, G.h, G.mines].join()) === [w, h, n].join(), `${level}: ${w} by ${h} with ${n} mines`);
  const S = await g(() => S);
  ok(S >= 40, `${level}: squares are ${S} px at 1366x680`);
}
await page.screenshot({ path: `${OUT}/demineur-fort.png` });
await page.setViewportSize({ width: 1093, height: 530 });
await wait(200);
const small = await g(() => S);
ok(small >= 26 && await g(() => { const f = document.getElementById('frame').getBoundingClientRect(); return f.bottom <= innerHeight && f.right <= innerWidth; }),
  `Difficile fits a 1093 by 530 window, with squares of ${small} px`);

// 12. Facile guides him: the marks are right, the reason comes after each move, a guess is refused,
// a click on a red "!" puts a flag, and clicking only the marks wins.
await start('facile');
await g(() => { G = Demineur.newGame('facile', 4242); save(); render(); });
ok(await page.locator('.c').count() === 81, 'Facile has 9 by 9 squares');
await click(40);
const marks = () => g(() => ({ safe: [...document.querySelectorAll('.c.safe')].map(e => +e.dataset.i), mine: [...document.querySelectorAll('.c.danger')].map(e => +e.dataset.i) }));
let m = await marks();
ok(m.safe.length + m.mine.length > 0 && /^Bien joué ! /.test(await msg()), `the first click marks ${m.safe.length} safe squares and ${m.mine.length} mines, and gives the reason: ${await msg()}`);
ok(await page.locator('.c.ring').count() > 0, 'the number behind the reason has a yellow ring');
await page.screenshot({ path: `${OUT}/demineur-guided.png` });
const guess = await g(() => { const s = Demineur.sure(G); return [...G.cells].findIndex((x, i) => x === '.' && !s.safe.includes(i) && !s.mine.includes(i)); });
await click(guess);
ok(await g(() => G.result === null) && /n'est pas sûre/.test(await msg()), 'a click on a square without a mark is refused, with the reason');
let wrongMark = 0, clicks = 0;
for (; clicks < 120 && await g(() => !G.result); clicks++) {
  m = await marks();
  if (await g(s => s.safe.some(i => Demineur.isMine(G, i)) || s.mine.some(i => !Demineur.isMine(G, i)), m)) wrongMark++;
  const danger = m.mine[0];
  await click(danger >= 0 ? danger : m.safe[0]);
  if (danger >= 0 && (await cells())[danger] !== 'f') wrongMark++;
}
await wait(800);
ok(!wrongMark && await g(() => G.result === 'won'), `left clicks on the marks alone win, in ${clicks} clicks, with no wrong mark`);
await page.keyboard.press('Escape');

// 13. A phone: the wide board turns a quarter, so its squares stay large.
const phone = await browser.newPage({ viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true });
await phone.goto(URL);
await phone.evaluate(() => { Kit.closeHelp(); });
await phone.locator('#overBtns button', { hasText: 'Difficile' }).click();
const turned = await phone.evaluate(() => ({ turned: document.getElementById('board').classList.contains('turned'), S: S,
  fits: document.getElementById('frame').getBoundingClientRect().right <= innerWidth }));
ok(turned.turned && turned.S >= 30 && turned.fits, `a phone turns Difficile, with squares of ${turned.S} px`);
await phone.screenshot({ path: `${OUT}/demineur-phone.png` });

// 14. At 130 %, the explosion is still centred on the mine that went off. Moyen, because Facile refuses the click.
const big = await browser.newPage({ viewport: { width: 1366, height: 680 } });
await big.addInitScript(() => localStorage.setItem('gg:zoom', '1.3'));
await big.goto(URL);
await big.evaluate(() => { Kit.closeHelp(); });
await big.locator('#overBtns button', { hasText: 'Moyen' }).click();
await big.evaluate(() => { G = Demineur.newGame('moyen', 12345); save(); render(); });
await big.locator('.c[data-i="40"]').click();
await big.mouse.move(5, 5); await big.waitForTimeout(520);
// The mine is measured before the click: the board shakes during the explosion.
const mid = el => el.evaluate(e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
const bomb = big.locator(`.c[data-i="${await big.evaluate(() => G.layout.find(i => G.cells[i] === '.'))}"]`);
const a = await mid(bomb);
await bomb.click();
const b = await mid(big.locator('.blast'));
const off = { z: await big.evaluate(() => Zoom.z()), d: Math.round(Math.hypot(a[0] - b[0], a[1] - b[1])) };
ok(off.z === 1.3 && off.d <= 2, `at 130 %, the explosion is centred on the mine (${off.d} px off)`);
await big.close();

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
