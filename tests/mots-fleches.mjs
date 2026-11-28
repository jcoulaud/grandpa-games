// Plays the mots fléchés with a real mouse and keyboard: the first visit and its coach, the rules, choosing
// a word by a cell or a definition, typing on the keyboard and on the large keys, accents, Backspace and the
// arrows, the other word of a cell, « Vérifier », the hint, a reload, the win and its count, broken saves,
// and the layout at every window of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('mots-fleches');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const cellAt = i => page.locator(`#grid [data-i="${i}"]`);
const click = async i => { await cellAt(i).click(); await page.mouse.move(5, 5); await wait(560); };
const words = () => g(() => M.wordsOf(G).map(w => ({ word: w.word, cells: w.cells, dir: w.dir, clue: w.clue, part: w.part })));
const state = () => g(() => ({ word, at, typed: G.typed }));

// 1. The first visit: a game at Facile starts at once, with the coach on the key of the next letter.
await page.goto(URL);
await wait(500);
ok(!(await g(() => Kit.isOpen())) && await g(() => G.level === 'facile' && Kit.coaching()), 'the first visit starts a game at Facile at once, with the coach');
ok(await g(() => { const k = document.querySelector('#keys .coach'); const i = M.wordsOf(G)[word].cells.find(c => G.typed[c] === ' '); return !!k && k.dataset.k === G.grid[i]; }),
  'the coach rings the key of the next letter');
ok(await g(() => document.getElementById('defText').textContent === G.defs[word] && parseFloat(getComputedStyle(document.getElementById('defText')).fontSize) >= 28),
  'the card shows the definition of the word in large type');
await page.click('#helpBtn');
ok(await g(() => Kit.isOpen()), 'the rules open on « Règles »');
const pages = await page.locator('#helpText .page').count();
ok(pages >= 3 && pages <= 5, `the rules have ${pages} pages`);
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/mots-fleches-rules-${n + 1}.png` });
  await page.click('#helpNext');
}

// 2. A fixed grid, so the steps below meet the same grid each time.
await g(() => { G = M.newGame('facile', 0); word = 0; at = M.wordsOf(G)[0].cells[1] ?? M.wordsOf(G)[0].cells[0]; save(); render({ newDef: true }); });
const ws = await words();
const grid = await g(() => G.grid);
ok(await g(() => G.cols === 9 && G.rows === 7), 'Facile has a grid of 9 by 7 cells');
const box = await cellAt(ws[0].cells[0]).boundingBox();
ok(box.width >= 44, `the cells are large on his laptop: ${Math.round(box.width)} px`);
ok(await g(() => parseFloat(getComputedStyle(document.querySelector('.cell')).fontSize) >= 30), 'the letters are 30 px or more');
ok(await g(() => M.wordsOf(G).every(w => G.typed[w.cells[0]] === G.grid[w.cells[0]])), 'Facile shows the first letter of every word');
await page.screenshot({ path: `${OUT}/mots-fleches-start.png` });

// 3. A click on a white cell takes its word; a second click on the same cell takes the other word.
const across = ws.findIndex(w => w.dir === 'h' && w.cells.length >= 3 && ws.some(v => v.dir === 'v' && v.cells.includes(w.cells[1])));
const cross = ws[across].cells[1];
await click(cross);
let s = await state();
const first = s.word;
ok(s.at === cross && ws[s.word].cells.includes(cross), 'a click on a white cell chooses it and a word through it');
ok(/tapez les lettres/.test(await msg()) && (await msg()).includes(await g(() => G.defs[word])), 'the message line says the definition and what to do');
ok(await g(i => document.querySelector(`#grid [data-i="${i}"]`).classList.contains('cur'), cross), 'the chosen cell is yellow');
await click(cross);
s = await state();
ok(s.word !== first && ws[s.word].cells.includes(cross), 'a second click on the same cell takes the other word');
ok(await page.locator('#other').isVisible() && await g(f => +document.getElementById('other').dataset.w === f, first), 'the card offers the other word of the cell');
await page.click('#other'); await page.mouse.move(5, 5); await wait(300);
ok((await state()).word === first, 'a click on the other word takes it');

// 4. Typing: a letter goes in the yellow cell and the yellow moves on. Accents are dropped. A large key writes
// too. Backspace erases.
await g(([w, c]) => { word = w; at = c; render(); }, [across, ws[across].cells[1]]);
const target = ws[across].word;
await page.keyboard.press(target[1].toLowerCase());
s = await state();
ok(s.typed[ws[across].cells[1]] === target[1], `a key writes the letter ${target[1]}`);
// The next cell he can write: the letters given by the game are skipped.
const nextFree = await g(c => c.slice(2).find(i => G.given[i] !== '1'), ws[across].cells);
ok(s.at === nextFree, 'the yellow cell moves to the next cell of the word he can write');
// A French keyboard sends é as its own key.
await g(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'é', bubbles: true })));
ok((await state()).typed[nextFree] === 'E', 'é is written E, as in the newspaper');
await page.keyboard.press('Backspace');
s = await state();
ok(s.typed[ws[across].cells[2]] === ' ' && s.at === ws[across].cells[2] || s.typed[ws[across].cells[3]] === ' ', 'Backspace erases the letter');
await g(([w, c]) => { word = w; at = c; render(); }, [across, ws[across].cells[2]]);
await page.click(`#keys button[data-k="${target[2]}"]`); await page.mouse.move(5, 5); await wait(200);
ok((await state()).typed[ws[across].cells[2]] === target[2], `a large key on the screen writes ${target[2]}`);
// The arrow keys move the yellow cell to the next white cell.
await g(([w, c]) => { word = w; at = c; render(); }, [across, ws[across].cells[1]]);
await page.keyboard.press('ArrowRight');
ok((await state()).at === ws[across].cells[2], 'the right arrow moves the yellow cell to the right');

// 5. A click on a definition takes its word; on a cell with two definitions, each half takes its own.
const two = ws.findIndex((w, k) => ws.some((v, j) => j !== k && v.clue === w.clue) && w.part === 1);
const top = ws.findIndex(w => w.clue === ws[two].clue && w.part === 0);
const cb = await cellAt(ws[two].clue).boundingBox();
await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height * .8); await page.mouse.move(5, 5); await wait(560);
ok((await state()).word === two, 'the bottom half of a definition cell takes its word ' + JSON.stringify([(await state()).word, two, top, ws[two], await msg()]));
await page.mouse.click(cb.x + cb.width / 2, cb.y + cb.height * .2); await page.mouse.move(5, 5); await wait(560);
ok((await state()).word === top, 'the top half takes the other word');
ok(await g(t => document.querySelector(`#grid .part[data-w="${t}"]`).classList.contains('on'), top), 'the definition of the word he is on is lit in the grid');

// 5b. A word whose last letter is given: a click on that given letter, then a key, fills the first empty
// cell of the word, and never says the letters are all given (review: KOALA on Facile grid 0).
{
  const k = ws.findIndex(w => w.word === 'KOALA');
  ok(k >= 0, 'Facile grid 0 has KOALA');
  const cells = ws[k].cells;
  const kb = await cellAt(ws[k].clue).boundingBox(), parts = await g(c => document.querySelector(`#grid [data-i="${c}"]`).children.length, ws[k].clue);
  await page.mouse.click(kb.x + kb.width / 2, kb.y + kb.height * (parts > 1 ? (ws[k].part ? .8 : .2) : .5)); await page.mouse.move(5, 5); await wait(560);
  ok((await state()).word === k, 'a click on its definition takes KOALA');
  const last = cells[cells.length - 1];
  ok(await g(i => G.given[i] === '1', last), 'the last A of KOALA is given by the game');
  await click(last);
  await g(([w, c]) => { word = w; at = c; render(); }, [k, last]);
  const empty = await g(c => c.find(i => G.typed[i] === ' '), cells);
  await page.keyboard.press(grid[empty]);
  ok(await g(([i, L]) => G.typed[i] === L, [empty, grid[empty]]) && !/déjà données/.test(await msg()), `a key on the given last letter fills the first empty cell of KOALA with ${grid[empty]}`);
}

// 5c. Space presses a focused button, as everywhere: a letter key writes its letter, « Règles » opens.
{
  const target = await g(() => { const ws = M.wordsOf(G); for (let k = 0; k < ws.length; k++) { const i = ws[k].cells.find(c => G.typed[c] === ' '); if (i !== undefined) { word = k; at = i; render(); return i; } } return -1; });
  const L = grid[target];
  await page.focus(`#keys button[data-k="${L}"]`);
  await page.keyboard.press('Space');
  ok(await g(([i, L]) => G.typed[i] === L, [target, L]), `Space on the focused key ${L} writes ${L}`);
  await page.focus('#helpBtn');
  await page.keyboard.press('Space');
  await wait(200);
  ok(await g(() => Kit.isOpen()), 'Space on the focused « Règles » opens the rules');
  await page.keyboard.press('Escape');
  await g(() => document.activeElement.blur());
}

// 6. « Vérifier » strikes the wrong letters in red and says how many.
const free = ws[across].cells.find(i => !(ws.some(w => w.cells[0] === i)));
await g(([w, c]) => { word = w; at = c; render(); }, [across, free]);
const wrong = grid[free] === 'Z' ? 'Y' : 'Z';
await page.keyboard.press(wrong);
await page.click('#checkBtn'); await page.mouse.move(5, 5); await wait(300);
ok(await g(i => document.querySelector(`#grid [data-i="${i}"]`).classList.contains('wrong'), free) && /ne va pas|ne vont pas/.test(await msg()), '« Vérifier » strikes a wrong letter in red and says so');
await page.screenshot({ path: `${OUT}/mots-fleches-check.png` });

// 7. The hint writes one right letter, first the wrong one of the word he is on, and says which.
await g(([w, c]) => { word = w; at = c; render(); }, [across, free]);
await page.click('#hintBtn'); await page.mouse.move(5, 5); await wait(300);
ok(await g(i => G.typed[i] === G.grid[i] && G.given[i] === '1', free) && /Corrigé/.test(await msg()), 'the hint fixes the wrong letter and says it');
ok(await g(i => document.querySelector(`#grid [data-i="${i}"]`).classList.contains('aid'), free), 'the letter of the hint keeps a gold corner');

// 8. A reload keeps the grid, the letters and the word he is on.
const before = await g(() => ({ grid: G.grid, typed: G.typed, word }));
await wait(500);
await page.reload(); await wait(400);
ok(await g(b => G.grid === b.grid && G.typed === b.typed && word === b.word, before) && !(await g(() => Kit.isOpen())), 'a reload keeps the grid, the letters and the word');

// 9. The win: every letter typed. The letters lift in a wave, the dialog opens, the win is counted once.
const sent = { won: 0, start: 0 };
await page.exposeFunction('sent', kind => { sent[kind]++; });
await g(() => { GG.track = (game, kind) => window.sent(kind); });
for (let k = 0; k < ws.length; k++) {
  const empty = await g(k => M.wordsOf(G)[k].cells.filter(i => G.typed[i] !== G.grid[i]), k);
  if (!empty.length) continue;
  await g(([k, c]) => { word = k; at = c; render(); }, [k, empty[0]]);
  for (const i of empty) { await g(i => { at = i; }, i); await page.keyboard.press(grid[i]); }
  await wait(500);
}
await wait(300);
ok(await g(() => G.result === 'won'), 'every letter right wins the grid');
await page.waitForSelector('#over.on', { timeout: 6000 });
ok(/Bravo, vous avez gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the win dialog says bravo');
ok(sent.won === 1 && await g(() => stats.won === 1 && GG.meta('mots-fleches').summary === '1 grille finie'), 'the win is counted once, and the tile says so');
ok(await g(() => document.getElementById('wins').textContent) === '1 victoire', 'the level line shows the grids finished');
await page.screenshot({ path: `${OUT}/mots-fleches-won.png` });
await page.keyboard.press('Escape');
await page.keyboard.press('A');
ok(/Cette grille est finie/.test(await msg()), 'a key after the win says to start a new grid');
ok(await g(() => document.getElementById('hintBtn').disabled && 'nudge' in document.getElementById('newBtn').dataset), 'the hint rests, and « Nouvelle partie » is the next thing to press');
await page.reload(); await wait(400);
ok(await g(() => G.result === 'won' && !Kit.isOpen()) && /Bravo, la grille est finie/.test(await msg()), 'a reload after the win shows it without the dialog');

// 10. A new game, then broken saves.
await g(() => { GG.track = (game, kind) => window.sent(kind); });
await page.click('#newBtn');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
await wait(300);
ok(sent.start === 1 && await g(() => G.level === 'moyen' && G.cols === 11 && G.rows === 8 && !G.result), 'a new Moyen grid starts, 11 by 8, and is counted');
ok(await g(() => played.moyen.length === 1 && played.moyen[0] === G.n), 'the grid is remembered, so it does not come back soon');
await g(() => { const v = GG.load('mots-fleches'); v.G.grid = 'A' + v.G.grid.slice(1); return GG.save('mots-fleches', v); });
await page.reload(); await wait(400);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && stats.won === 1), 'a broken save starts a new grid at Facile and keeps the count');
for (const [label, cols] of [['Difficile', 13]]) {
  await page.click('#newBtn');
  await page.locator('#overBtns button', { hasText: label }).click();
  await wait(300);
  ok(await g(c => G.cols === c && G.level === 'fort' && G.defs.length === M.wordsOf(G).length, cols), `${label} has ${cols} columns`);
}
// A new game during a game warns first.
await g(() => { const w = M.wordsOf(G)[0]; at = w.cells.find(i => G.typed[i] === ' '); word = 0; render(); });
await page.keyboard.press('A');
await page.click('#newBtn');
ok(/effacée/.test(await g(() => document.getElementById('overText').textContent)), 'a new game during a game warns first');
await page.keyboard.press('Escape');
await page.close();

// 11. The layout at every window: nothing past the sides, the grid and the card inside the table, no text
// under 20 px (13 px on a phone) but the print of the definition cells, buttons and keys of 44 px, no
// overlap, the longest message in the line, the rules without scrolling in a window 620 px high or more.
const LONG = '« Tous ses chemins y mènent », en 12 lettres : tapez les lettres au clavier, ou cliquez-les à droite.';
const WINDOWS = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75]];
for (const [w, h, z] of WINDOWS) {
  const phone = w < 700;
  const p = await browser.newPage(phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(z => localStorage.setItem('gg:size', JSON.stringify(z)), z);
  await p.goto(URL);
  await p.waitForTimeout(400);
  const tag = `${w}x${h}${z !== 1 ? ' at ' + z * 100 + ' %' : ''}`;
  if (h / z >= 620) {
    let fit = true;
    await p.evaluate(() => Kit.openHelp());
    for (let k = 0; k < pages; k++) {
      fit = fit && await p.evaluate(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; });
      await p.click('#helpNext');
    }
    ok(fit, `${tag}: every rules page fits without scrolling`);
  }
  for (const label of ['Facile', 'Moyen', 'Difficile']) {
    if (await p.evaluate(() => !Kit.isOpen())) await p.click('#newBtn');
    await p.locator('#overBtns button', { hasText: label }).first().click();
    await p.waitForTimeout(200);
    // A word with two definitions in its cell and a crossing word, so the other word shows too.
    await p.evaluate(LONG => { stats.won = 14; const ws = M.wordsOf(G); const k = ws.findIndex(w => w.cells.some(i => ws.filter(v => v.cells.includes(i)).length > 1));
      word = k; at = ws[k].cells.find(i => ws.filter(v => v.cells.includes(i)).length > 1); render({ newDef: true }); Kit.say(LONG); }, LONG);
    const r = await p.evaluate(phone => {
      const inside = (e, box) => { const a = e.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1; };
      const table = document.getElementById('table');
      const wide = document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1 && [...document.querySelectorAll('#bar, #say, #table, #rail, #sheet, #side, #keys button, .zoom button')].filter(e => e.getClientRects().length).every(e => e.getBoundingClientRect().right <= innerWidth + 1);
      // On a phone the card is under the grid and the table scrolls to it; elsewhere both fit in the table.
      const fits = phone ? true : inside(document.getElementById('sheet'), table) && inside(document.getElementById('side'), table);
      const small = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('svg, #help, #over, .print') || !e.getClientRects().length) continue;
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const f = parseFloat(getComputedStyle(e).fontSize);
        if (f < (phone ? 13 : 20)) small.push(e.tagName + '.' + e.className + ' ' + f);
      }
      const cut = [...document.querySelectorAll('#defText, #defMeta, #other .t, #count, #kicker, #bar button, #wins, #title .name *')].filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
      const buttons = [...document.querySelectorAll('#bar button, #bar #home, #rail button, #keys button, #other:not(.off)')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      const zz = window.Zoom ? Zoom.z() : 1;
      const lowButton = buttons.filter(b => b.height < 44 * zz - 1).length;
      let overlap = 0;
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], b = buttons[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
      }
      const m = document.getElementById('msg');
      return { wide, fits, small, cut, lowButton, overlap, msg: m.scrollHeight <= m.clientHeight + 1 || phone,
        f: parseFloat(getComputedStyle(document.querySelector('.cell')).fontSize) * zz, c: document.querySelector('.cell').getBoundingClientRect().width };
    }, phone);
    const good = r.wide && r.fits && !r.small.length && !r.cut.length && !r.lowButton && !r.overlap && r.msg && r.f >= (phone ? 13 : 20);
    ok(good, `${tag} ${label}: fits, cells of ${Math.round(r.c)} px, letters of ${Math.round(r.f)} px` + (good ? '' : ' ' + JSON.stringify(r)));
    await p.screenshot({ path: `${OUT}/mots-fleches-${w}x${h}-${z}-${label.toLowerCase()}.png` });
  }
  await p.click('#newBtn');
  ok(await p.evaluate(() => { const b = document.getElementById('box').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1; }), `${tag}: the level dialog fits`);
  await p.close();
}

ok(!errors.length, 'no error in the page' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
if (fails) { console.log(`${fails} FAILED`); process.exit(1); }
console.log('All passed');
