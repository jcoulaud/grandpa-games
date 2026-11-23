// Plays the mots mêlés with a real mouse: the rules, a first letter and its cancel by a click, the button "Enlever" and Escape, words found from either
// end and by a drag, refusals with their reasons, the hint, undo, a reload, the win and its count, broken
// and old saves, the levels, and the layout at every window of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('mots-meles');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
const cellAt = i => page.locator(`.cell[data-i="${i}"]`);
// A click, then the mouse moves away and waits, so the next click on the same letter is not a double-click.
const click = async i => { await cellAt(i).click(); await page.mouse.move(5, 5); await wait(560); };
const ends = w => g(w => { const c = MotsMeles.cells(G, w); return [c[0], c[c.length - 1]]; }, w);
const cls = i => cellAt(i).getAttribute('class');

// 1. The first visit: a game at Facile starts at once, with the coach on the first letter of a word. The
// rules stay on "Règles", and each page fits without scrolling.
await page.goto(URL);
await wait(400);
ok(!(await g(() => Kit.isOpen())) && await g(() => G.level === 'facile' && Kit.coaching()), 'the first visit starts a game at Facile at once, with the coach');
ok(await g(() => { const c = document.querySelector('.cell.coach'); return !!c && +c.dataset.i === MotsMeles.cells(G, MotsMeles.hint(G, -1))[0]; }), 'the coach rings the first letter of a word');
await click(await g(() => +document.querySelector('.cell.coach').dataset.i));
ok(await g(() => { const c = document.querySelector('.cell.coach'), w = MotsMeles.hint(G, -1), cs = MotsMeles.cells(G, w);
  return anchor === cs[0] && !!c && +c.dataset.i === cs[cs.length - 1] && document.getElementById('hintBtn').dataset.auto === 'no'; }),
  'once the first letter is chosen, the coach rings its last letter, and the automatic hint waits');
await page.click('#helpBtn');
ok(await g(() => Kit.isOpen()), 'the rules open on « Règles »');
const pages = await page.locator('#helpText .page').count();
ok(pages >= 3 && pages <= 5, `the rules have ${pages} pages`);
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/mots-meles-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.click('#newBtn');
await page.getByRole('button', { name: 'Facile', exact: true }).click();
ok(await page.locator('.cell').count() >= 64 && await page.locator('#words li').count() === 6, 'Facile has a grid of 8 or 9 letters across and 6 words');
// A fixed seed, so the steps below meet the same grid each time.
await g(() => { G = MotsMeles.newGame('facile', 4242); save(); render(); });
const words = await g(() => G.words.map(w => w.word));
const caps = words.map(w => w.toLocaleUpperCase('fr-FR'));
const box = await cellAt(0).boundingBox();
ok(box.width >= 44, `the letters have large squares on his laptop: ${Math.round(box.width)} px`);
ok(await g(() => parseFloat(getComputedStyle(document.querySelector('.cell')).fontSize) >= 30), 'the letters are 30 px or more');
await page.screenshot({ path: `${OUT}/mots-meles-start.png` });

// 2. The first letter: ringed in yellow, with its lines, then cancelled by a click on it.
const [s0, e0] = await ends(0);
await click(s0);
ok(/anchor/.test(await cls(s0)) && await page.locator('.cell.lane').count() > 0 && /dernière lettre/.test(await msg()), 'a click chooses the first letter, rings it and shows its lines');
await click(s0);
ok(!/anchor/.test(await cls(s0)) && await page.locator('.cell.lane').count() === 0 && /Lettre annulée/.test(await msg()), 'a second click on it cancels it');
// 2b. "Enlever le A": shown under the list while a letter is chosen, it cancels it. Its place stays, so nothing moves.
const drop = page.locator('#drop');
const shown = () => g(() => getComputedStyle(document.getElementById('drop')).visibility === 'visible');
const listBox = async () => JSON.stringify(await page.locator('#list').boundingBox()) + JSON.stringify(await page.locator('#board').boundingBox());
ok(!(await shown()), 'no letter chosen: the button "Enlever" is hidden');
const still = await listBox();
await click(s0);
const letter = await g(i => G.grid[i], s0);
ok(await shown() && (await drop.textContent()).trim() === `Enlever le ${letter}` && (await drop.boundingBox()).height >= 54, `a letter chosen shows "Enlever le ${letter}", 54 px high`);
ok(await msg() === `Vous avez choisi le ${letter}. Cliquez sur la dernière lettre du mot, ou encore sur le ${letter} pour l'enlever.`, 'the message says both what to do next and how to take the letter back');
ok(await listBox() === still, 'the grid and the list do not move when the button shows');
const db = await drop.boundingBox(), wb = await page.locator('#words').boundingBox();
ok(db.y >= wb.y + wb.height, 'the button is under the word list');
await drop.click(); await page.mouse.move(5, 5); await wait(560);
ok(!/anchor/.test(await cls(s0)) && await page.locator('.cell.lane').count() === 0 && /Lettre annulée/.test(await msg()) && !(await shown()), 'the button cancels the letter and hides');
ok(await listBox() === still, 'nothing moves when it hides');
await click(s0);
await page.keyboard.press('Escape');
ok(!/anchor/.test(await cls(s0)) && !(await shown()), 'Escape also cancels the letter and hides the button');

// 3. A word found: the band, the list, the message.
await click(s0); await click(e0);
ok(await page.locator('.band:not(.try)').count() === 1 && /found/.test(await page.locator('#words li').nth(0).getAttribute('class')), 'the first and last letter circle the word and strike it in the list');
ok(await msg() === `Vous avez trouvé ${caps[0]}. Encore 5 mots : cliquez sur la première lettre d'un autre mot.`, `the message says "Vous avez trouvé ${caps[0]}." and what to do next`);
ok(await g(() => document.getElementById('count').textContent) === '1 mot trouvé sur 6', 'the sheet counts the words found');
ok(await g(() => GG.meta('mots-meles').summary === 'Partie en cours'), 'the tile says a game is in progress');
await page.screenshot({ path: `${OUT}/mots-meles-found.png` });

// 4. From the last letter to the first also finds a word.
const [s1, e1] = await ends(1);
await click(e1); await click(s1);
ok((await msg()).startsWith(`Vous avez trouvé ${caps[1]}.`) && await page.locator('.band:not(.try)').count() === 2, 'the last letter, then the first, also find the word');

// 5. Refusals, each with its reason. A refused pair keeps the first letter.
await click(s0); await click(e0);
ok(new RegExp(`déjà trouvé ${caps[0]}`).test(await msg()), 'a word found before says so');
await click(s0); // cancel the letter kept
const n = await g(() => G.size);
const free = await g(() => { const used = new Set(G.words.flatMap((w, k) => MotsMeles.cells(G, k))); return [...G.grid].map((x, i) => i).filter(i => !used.has(i)); });
const a = free[0], ar = Math.floor(a / n), ac = a % n;
const offLine = (ar + 1 < n ? ar + 1 : ar - 1) * n + (ac + 2 < n ? ac + 2 : ac - 2);
await click(a); await click(offLine);
ok(/pas sur une même ligne/.test(await msg()) && /anchor/.test(await cls(a)), 'two letters off a line are refused, and the first letter stays chosen');
const diag = (ar + 1 < n ? ar + 1 : ar - 1) * n + (ac + 1 < n ? ac + 1 : ac - 1);
await click(diag);
ok(/Au niveau facile/.test(await msg()), 'a diagonal at Facile says why');
// A line that spells no word: the letters read, quoted.
const none = await g(a => { for (let b = 0; b < G.grid.length; b++) { const r = MotsMeles.check(G, a, b); if (r.kind === 'none') return { b, text: r.text }; } return null; }, a);
await click(none.b);
ok((await msg()).startsWith(`« ${none.text} » n'est pas un mot de la liste`), `a line that spells no word quotes its letters: ${none.text}`);
ok(await page.locator('.band.try').count() === 1, 'the line chosen shows dashed for a moment');
await click(a);

// 6. The hint rings the first letter of a word still to find. A letter chosen stays chosen.
await click(a);
await page.click('#hintBtn');
const hinted = await g(() => [...document.querySelectorAll('.cell.hint')].map(e => +e.dataset.i));
const [s2] = await ends(2);
ok(hinted.length === 1 && hinted[0] === s2 && (await msg()).includes(`Le mot ${caps[2]} commence par la lettre entourée`), 'the hint rings the first letter of the next word to find');
ok(await g(a => anchor === a, a) && /Enlevez d'abord le/.test(await msg()), 'the hint keeps the letter chosen, and says to take it back first');
ok(await g(() => { const h = getComputedStyle(document.querySelector('.cell.hint'), '::before'), c = getComputedStyle(document.querySelector('.cell.anchor'), '::before');
  return h.borderTopStyle === 'dashed' && h.borderTopColor !== c.backgroundColor; }), 'the hint ring is dashed blue, unlike the yellow disc of the letter chosen');
await page.click('#hintBtn');
const [, e2] = await ends(2);
ok(await g(([s2, e2]) => [...document.querySelectorAll('.cell.hint')].map(e => +e.dataset.i).sort((x, y) => x - y).join() === [s2, e2].sort((x, y) => x - y).join(), [s2, e2]),
  'a second hint on the same word rings its last letter too');
await page.click('#hintBtn');
const [s3] = await ends(3);
ok(await g(s3 => document.querySelectorAll('.cell.hint').length === 1 && document.querySelector('.cell.hint')?.dataset.i === String(s3), s3), 'a third hint shows the next word');

// 7. A drag from the first letter to the last also finds a word.
const [, e3] = await ends(3);
const from = await cellAt(s3).boundingBox(), to = await cellAt(e3).boundingBox();
await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
await page.mouse.up();
await page.mouse.move(5, 5); await wait(560);
ok((await msg()).startsWith(`Vous avez trouvé ${caps[3]}.`) && await page.locator('.cell.hint').count() === 0, 'a drag finds a word, and its hint goes');
// A letter chosen at the start of a word: the hint rings its last letter, and keeps the letter.
{
  const [s5, e5] = await ends(5);
  await click(s5);
  await page.click('#hintBtn');
  ok(await g(([s5, e5]) => anchor === s5 && document.querySelector(`.cell[data-i="${e5}"]`).classList.contains('hint'), [s5, e5]) && /cliquez sur sa dernière lettre/.test(await msg()),
    'with the first letter of a word chosen, the hint rings its last letter');
  await click(s5);
}

// 8. A double-click on a letter counts as one click.
const [s4, e4] = await ends(4);
await cellAt(s4).dblclick(); await page.mouse.move(5, 5);
ok(/anchor/.test(await cls(s4)), 'a double-click chooses the letter once, without cancelling it');
await wait(560);
await click(s4);

// 9. Undo takes back the last word, also with Ctrl+Z.
await page.click('#undoBtn');
await wait(400);
ok(await g(() => G.found.length === 2) && !/found/.test(await page.locator('#words li').nth(3).getAttribute('class')) && (await msg()).includes(`Vous avez annulé ${caps[3]}`), 'undo takes back the last word found');
ok(await page.locator('.band:not(.try)').count() === 2, 'its band goes');
await page.keyboard.press('Control+z');
await wait(400);
ok(await g(() => G.found.length === 1), 'Ctrl+Z also takes back a word');

// 10. A reload keeps the grid and the words found.
await click(s1); await click(e1);
const before = await g(() => ({ grid: G.grid, found: G.found }));
await page.reload();
await wait(300);
ok(await g(b => G.grid === b.grid && JSON.stringify(G.found) === JSON.stringify(b.found), before) && await page.locator('.band').count() === 2, 'a reload keeps the grid, the words found and their bands');
ok(!(await g(() => Kit.isOpen())) && /Encore 4 mots à trouver/.test(await msg()), 'a reload says how many words are left');

// 10b. Slips of the hand. A refused drag keeps its first letter, so a click on the right last letter ends it.
const centre = async i => { const b = await cellAt(i).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const drag = async (from, points) => {
  await page.mouse.move(...await centre(from)); await page.mouse.down();
  for (const pt of points) await page.mouse.move(...pt, { steps: 8 });
  await page.mouse.up(); await page.mouse.move(5, 5); await wait(560);
};
const c2 = await g(() => MotsMeles.cells(G, 2));
await drag(c2[0], [await centre(c2[c2.length - 2])]);
ok(/Presque/.test(await msg()) && /anchor/.test(await cls(c2[0])), 'a refused drag keeps its first letter');
await click(c2[c2.length - 1]);
ok((await msg()).startsWith(`Vous avez trouvé ${caps[2]}.`), 'a click on the right last letter then finds the word');
// A press on the last letter that moves 18 px inside it is still a click on it.
const [w3s, w3e] = await ends(3);
await click(w3s);
const [ex, ey] = await centre(w3e);
await page.mouse.move(ex - 9, ey); await page.mouse.down(); await page.mouse.move(ex + 9, ey, { steps: 4 }); await page.mouse.up();
await page.mouse.move(5, 5); await wait(560);
ok((await msg()).startsWith(`Vous avez trouvé ${caps[3]}.`), 'a small move of the mouse inside the last letter still finds the word');
// A drag let go outside the grid finds nothing and keeps its first letter.
const [w4s, w4e] = await ends(4);
const gridBox = await page.locator('#board').boundingBox();
await drag(w4s, [await centre(w4e), [gridBox.x + gridBox.width + 60, gridBox.y + gridBox.height + 60]]);
ok(await g(() => !G.found.includes(4)) && /anchor/.test(await cls(w4s)) && /Vous avez choisi/.test(await msg()), 'a drag let go outside the grid finds nothing and keeps its first letter');
await click(w4e);
ok(await g(() => G.found.includes(4)), 'a click on the last letter then finds the word');
// A double-click that lands in the next letter is one click.
const edge = await g(() => [...G.grid].findIndex((x, i) => i % G.size < G.size - 1));
const eb = await cellAt(edge).boundingBox();
await page.mouse.click(eb.x + eb.width - 3, eb.y + eb.height / 2); await wait(120);
await page.mouse.click(eb.x + eb.width + 3, eb.y + eb.height / 2);
await page.mouse.move(5, 5);
ok(/anchor/.test(await cls(edge)) && /Vous avez choisi/.test(await msg()), 'a double-click across two letters chooses the first one only');
await wait(560); await click(edge);
// A double-click on "Annuler le dernier coup" takes back one word.
const foundBefore = await g(() => G.found.length);
await page.dblclick('#undoBtn');
await wait(400);
ok(await g(() => G.found.length) === foundBefore - 1, 'a double-click on undo takes back one word, not two');
await click(w4s); await click(w4e);

// 11. The win: every word, the bands pop in a wave, then the dialog. It is counted once.
const sent = { won: 0, start: 0 };
await page.exposeFunction('sent', kind => { sent[kind]++; });
await g(() => { GG.track = (game, kind) => window.sent(kind); });
for (let w = 0; w < 6; w++) {
  if (await g(w => G.found.includes(w), w)) continue;
  const [s, e] = await ends(w);
  await click(s); await click(e);
}
await wait(200);
ok(await g(() => G.result === 'won' && document.getElementById('sheet').classList.contains('wave')), 'the last word wins and the bands pop in a wave');
ok(!(await g(() => Kit.isOpen())), 'the win sheet waits for the wave');
// The rules opened during the wave: the win dialog is there when they close.
await page.click('#helpBtn');
await wait(3000);
ok(await g(() => !document.getElementById('over').classList.contains('on')), 'the win dialog does not open over the rules');
await page.click('#helpClose');
await page.waitForSelector('#over.on', { timeout: 1000 });
ok(/Bravo/.test(await g(() => document.getElementById('overTitle').textContent)), 'the rules opened during the wave do not lose the win dialog');
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(/Bravo, vous avez gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the win dialog says bravo');
await page.screenshot({ path: `${OUT}/mots-meles-won.png` });
ok(sent.won === 1 && await g(() => stats.won === 1 && GG.meta('mots-meles').summary === '1 grille finie'), 'the win is counted once, and the tile says so');
ok(await g(() => document.getElementById('wins').textContent) === '1 victoire', 'the level line shows the grids finished');
await page.keyboard.press('Escape');
await click(0);
ok(/Cette grille est finie/.test(await msg()), 'a click after the win says to start a new grid');
ok(await g(() => document.getElementById('undoBtn').disabled && document.getElementById('hintBtn').disabled), 'undo and the hint rest after the win');
ok(await g(() => /Nouvelle partie/.test(document.getElementById('hintBtn').dataset.why) && 'nudge' in document.getElementById('newBtn').dataset), 'the grey hint says why, and « Nouvelle partie » is the next thing to press');
await page.reload();
await wait(300);
ok(await g(() => G.result === 'won' && !Kit.isOpen()) && /Bravo, vous avez trouvé les 6 mots/.test(await msg()), 'a reload after the win shows it without the dialog');

// 12. A new game starts and is counted, then a broken save starts again with the rules.
await g(() => { GG.track = (game, kind) => window.sent(kind); });
await page.click('#newBtn');
ok(!/Attention/.test(await g(() => document.getElementById('overText').textContent)), 'a new game after a win does not warn');
await page.getByRole('button', { name: 'Facile', exact: true }).click();
await wait(200);
ok(sent.start === 1 && await g(() => !G.result && G.found.length === 0), 'a new grid starts and is counted');
await g(() => { const v = GG.load('mots-meles'); v.G.grid = 'x' + v.G.grid.slice(1); return GG.save('mots-meles', v); });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.level === 'facile' && G.found.length === 0), 'a broken save is not loaded: a new grid starts at Facile');
ok(await g(() => stats.won === 1 && GG.load('mots-meles').stats.won === 1), 'a broken grid keeps the count of grids finished');
// A save with a level this game does not know loads at the level of its size.
await g(() => { const G0 = MotsMeles.find(MotsMeles.newGame('moyen', 9), 0); return GG.save('mots-meles', { G: { ...G0, level: 'normal' } }); });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.level === 'moyen' && G.found.length === 1), 'a save with an unknown level loads at the level of its size');
// An old save without its level, its statistics or its themes still loads.
await g(() => { const G0 = MotsMeles.find(MotsMeles.newGame('moyen', 9), 0); const { level, ...bare } = G0; return GG.save('mots-meles', { G: bare }); });
await page.reload();
await wait(300);
ok(await g(() => !Kit.isOpen() && G.level === 'moyen' && G.found.length === 1 && document.getElementById('level').textContent === 'Niveau moyen'), 'an old save without its level loads at the level of its size');

// 13. The levels: their sizes, and the letters stay 30 px on his laptop.
for (const [label, size, count] of [['Moyen', 11, 9], ['Difficile', 11, 12]]) {
  await page.click('#newBtn');
  await page.locator('#overBtns button', { hasText: label }).click();
  await wait(200);
  const s = await g(() => ({ size: G.size, words: document.querySelectorAll('#words li').length, f: parseFloat(getComputedStyle(document.querySelector('.cell')).fontSize) }));
  ok(s.size === size && s.words === count && s.f >= 30, `${label} has ${size} by ${size} letters of ${s.f} px and ${count} words`);
  await page.screenshot({ path: `${OUT}/mots-meles-${label.toLowerCase()}.png` });
}
// A press held on the last letter of Difficile while a new Facile grid starts: the release does nothing.
const lastCell = await g(() => G.grid.length - 1);
await page.mouse.move(...await centre(lastCell)); await page.mouse.down();
await g(() => newGame('facile'));
await page.mouse.up(); await page.mouse.move(5, 5); await wait(560);
ok(!/undefined/.test(await msg()) && await g(() => anchor === -1), 'a press held across a new grid is forgotten');
await click(0); await click(1);
// Undo whose save is still on its way when a new grid starts: the new grid is left alone.
const undoAcross = await g(async () => {
  newGame('fort');
  await GG.flush?.();
  G = MotsMeles.find(G, 11); render();
  const real = GG.save;
  let release, called;
  const reached = new Promise(r => { called = r; });
  GG.save = (...a) => { GG.save = real; called(); return new Promise(r => { release = () => r(real.apply(GG, a)); }); };
  const u = undo();
  await reached;
  newGame('facile');
  release();
  try { await u; } catch (e) { return e.message; }
  return document.getElementById('msg').textContent;
});
ok(!/annulé/.test(undoAcross) && /Trouvez les 6 mots/.test(undoAcross), 'an undo saved after a new grid started says nothing about it: ' + undoAcross);
const [n0s, n0e] = await ends(0);
await click(n0s); await click(n0e);
await page.click('#newBtn');
ok(/Attention/.test(await g(() => document.getElementById('overText').textContent)), 'a new game during a game warns first');
await page.keyboard.press('Escape');
// The longest message fits in the line.
await g(() => Kit.say("Vous avez choisi le W. Cliquez sur la dernière lettre du mot, ou encore sur le W pour l'enlever."));
ok(await g(() => { const m = document.getElementById('msg'); return m.scrollHeight <= m.clientHeight + 1 && m.scrollWidth <= m.clientWidth + 1; }), 'the longest message fits in the line');
await page.close();

// 14. The layout at every window: nothing past the sides, no text under 20 px, buttons of 44 px, the rules
// without scrolling in a window 620 px high or more.
// A 768 px window too, where the two counts and the size buttons need two rows.
const WINDOWS = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75], [768, 680, 1]];
// The letters on his laptop, in pixels of the screen, at each level and size: "Agrandir" never makes them smaller.
const laptop = {};
for (const [w, h, z] of WINDOWS) {
  const phone = w < 700;
  const p = await browser.newPage(phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true } : { viewport: { width: w, height: h } });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(z => localStorage.setItem('gg:size', JSON.stringify(z)), z);
  await p.goto(URL);
  await p.waitForTimeout(300);
  const tag = `${w}x${h}${z !== 1 ? ' at ' + z * 100 + ' %' : ''}`;
  if (h / z >= 620) {
    let fit = true;
    const pages = await p.locator('#helpText .page').count();
    await p.evaluate(() => Kit.openHelp());
    for (let k = 0; k < pages; k++) {
      fit = fit && await p.evaluate(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; });
      await p.click('#helpNext');
    }
    ok(fit, `${tag}: every rules page fits without scrolling`);
  } else await p.evaluate(() => Kit.closeHelp());
  for (const label of ['Facile', 'Moyen', 'Difficile']) {
    if (await p.evaluate(() => !Kit.isOpen())) await p.click('#newBtn');
    await p.locator('#overBtns button', { hasText: label }).first().click();
    await p.waitForTimeout(150);
    // One word found and one letter chosen, so the band and the ring are measured too.
    // A count of grids finished too, so both chips of the bottom bar are measured.
    await p.evaluate(() => { stats.won = 14; G = MotsMeles.find(G, 0); anchor = MotsMeles.cells(G, 1)[0]; render(); Kit.say("Vous avez choisi le W. Cliquez sur la dernière lettre du mot, ou encore sur le W pour l'enlever."); });
    const r = await p.evaluate(phone => {
      const inside = (e, box) => { const a = e.getBoundingClientRect(), b = box.getBoundingClientRect(); return a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1; };
      const sheet = document.getElementById('sheet'), table = document.getElementById('table');
      const wide = document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1 && [...document.querySelectorAll('#bar, #say, #table, #rail, #sheet, #wins, #count, #drop, .zoom button')].filter(e => e.getClientRects().length).every(e => e.getBoundingClientRect().right <= innerWidth + 1);
      const fits = phone ? sheet.getBoundingClientRect().right <= table.getBoundingClientRect().right + 1 : inside(sheet, table);
      const listApart = (() => { const a = document.getElementById('board').getBoundingClientRect(), b = document.getElementById('list').getBoundingClientRect(); return a.right <= b.left + 1 || a.bottom <= b.top + 1; })();
      const small = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('svg, #help, #over') || !e.getClientRects().length) continue;
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const f = parseFloat(getComputedStyle(e).fontSize);
        if (f < (phone ? 13 : 20)) small.push(e.tagName + '.' + e.className + ' ' + f);
      }
      const cut = [...document.querySelectorAll('#theme, #words .w, #drop, #bar button, #wins, #count, #title .name *')].filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
      const buttons = [...document.querySelectorAll('#bar button, #bar #home, #rail button, #drop')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      const lowButton = buttons.filter(b => b.height < 44 * (window.Zoom ? Zoom.z() : 1) - 1).length;
      let overlap = 0;
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], b = buttons[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
      }
      const m = document.getElementById('msg');
      // The button "Enlever" is shown, 54 px high, inside the sheet, and in the window on a phone.
      const d = document.getElementById('drop'), dr = d.getBoundingClientRect(), z = window.Zoom ? Zoom.z() : 1;
      const dropOk = getComputedStyle(d).visibility === 'visible' && dr.height >= 54 * z - 1 && inside(d, sheet) && dr.right <= innerWidth + 1
        && (!phone || dr.top >= document.getElementById('board').getBoundingClientRect().bottom - 1);
      return { wide, fits, listApart, dropOk, small, cut, lowButton, overlap, msg: m.scrollHeight <= m.clientHeight + 1,
        f: parseFloat(getComputedStyle(document.querySelector('.cell')).fontSize) };
    }, phone);
    const good = r.wide && r.fits && r.dropOk && r.listApart && !r.small.length && !r.cut.length && !r.lowButton && !r.overlap && r.msg && r.f >= 20;
    ok(good, `${tag} ${label}: fits, letters ${r.f} px` + (good ? '' : ' ' + JSON.stringify(r)));
    if (w === 1366) (laptop[label] ??= {})[z] = r.f * z;
    await p.screenshot({ path: `${OUT}/mots-meles-${w}x${h}-${z}-${label.toLowerCase()}.png` });
  }
  // The dialogs fit in the window.
  await p.click('#newBtn');
  ok(await p.evaluate(() => { const b = document.getElementById('box').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1; }), `${tag}: the level dialog fits`);
  await p.close();
}

for (const [label, at] of Object.entries(laptop))
  ok(at[1] >= 30 && at[1.3] >= at[1], `${label} on his laptop: letters of ${at[1].toFixed(1)} px at 100 % and ${at[1.3].toFixed(1)} px at 130 % of the screen`);

// 14b. Slips found in the second review.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 } });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await p.click('#newBtn');
  await p.getByRole('button', { name: 'Facile', exact: true }).click();
  const at = async i => { const b = await p.locator(`.cell[data-i="${i}"]`).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
  const pmsg = () => p.evaluate(() => document.getElementById('msg').textContent);
  // A press on the last letter, dragged straight out of the grid without crossing a letter, is not a click.
  const [a, b] = await p.evaluate(() => { const c = MotsMeles.cells(G, 0); return [c[0], c[c.length - 1]]; });
  await p.locator(`.cell[data-i="${a}"]`).click(); await p.mouse.move(5, 5); await p.waitForTimeout(560);
  const board = await p.locator('#board').boundingBox();
  await p.mouse.move(...await at(b)); await p.mouse.down();
  await p.mouse.move(board.x + board.width + 80, board.y - 40, { steps: 1 }); await p.mouse.up();
  await p.mouse.move(5, 5); await p.waitForTimeout(560);
  ok(await p.evaluate(b => !G.found.includes(0) && anchor === b, b) && /Vous avez choisi/.test(await pmsg()), 'a press dragged out of the grid finds nothing: its letter becomes the first letter');
  await p.locator(`.cell[data-i="${b}"]`).click(); await p.mouse.move(5, 5); await p.waitForTimeout(560);
  // A press that goes 40 px away and comes back to its letter is a drag, not a click on that letter.
  await p.evaluate(() => { anchor = -1; lastTap = null; render(); });
  await p.locator(`.cell[data-i="${a}"]`).click(); await p.mouse.move(5, 5); await p.waitForTimeout(560);
  const [bx, by] = await at(b);
  await p.mouse.move(bx, by); await p.mouse.down();
  await p.mouse.move(board.x + board.width + 40, by, { steps: 2 }); await p.mouse.move(bx + 3, by, { steps: 2 }); await p.mouse.up();
  await p.mouse.move(5, 5); await p.waitForTimeout(560);
  ok(await p.evaluate(b => !G.found.includes(0) && anchor === b, b), 'a press that goes away and comes back is a drag: it finds nothing');
  await p.evaluate(() => { anchor = -1; lastTap = null; render(); });

  // A save that waits while a new grid starts: when the win cannot be saved, the next grid does not keep it.
  const won = await p.evaluate(async () => {
    newGame('fort');
    await saving;
    const before = stats.won;
    for (let k = 0; k < G.words.length - 1; k++) G = MotsMeles.find(G, k);
    render();
    const real = GG.save;
    let release, called;
    const reached = new Promise(r => { called = r; });
    GG.save = () => { GG.save = real; called(); return new Promise(r => { release = () => r(false); }); };
    const c = MotsMeles.cells(G, G.words.length - 1);
    const done = pair(c[0], c[c.length - 1]);
    await reached;
    newGame('facile');
    release();
    await done; await saving; await GG.flush();
    return { before, now: stats.won, stored: GG.load('mots-meles').stats?.won ?? 0 };
  });
  ok(won.now === won.before && won.stored === won.before, 'a win whose save failed is not stored by the next grid: ' + JSON.stringify(won));

  // The level dialog opened during the win wave and closed: the win dialog still comes.
  const winNow = () => p.evaluate(() => { for (let k = 0; k < G.words.length - 1; k++) G = MotsMeles.find(G, k); render(); const c = MotsMeles.cells(G, G.words.length - 1); return pair(c[0], c[c.length - 1]); });
  const bravo = () => p.waitForFunction(() => document.getElementById('over').classList.contains('on') && /Bravo, vous avez gagné/.test(document.getElementById('overTitle').textContent), null, { timeout: 4000 }).then(() => true, () => false);
  await winNow();
  await p.click('#newBtn');
  await p.keyboard.press('Escape');
  ok(await bravo(), 'the level dialog closed during the win wave does not lose the win dialog');
  await p.keyboard.press('Escape');
  // The rules opened during the wave, then closed and opened again at once once it ended: the win dialog still comes.
  await p.evaluate(() => newGame('facile'));
  await winNow();
  await p.click('#helpBtn');
  await p.waitForFunction(() => !document.getElementById('sheet').classList.contains('wave'));
  await p.evaluate(() => { Kit.closeHelp(); document.getElementById('helpBtn').click(); });
  await p.click('#helpClose');
  ok(await bravo(), 'the rules closed and opened again after the wave do not lose the win dialog');
  await p.close();

  // On a small phone, a tap on the next square within half a second is a new tap, not a double-click.
  const ph = await browser.newPage({ viewport: { width: 280, height: 640 }, isMobile: true, hasTouch: true });
  ph.on('pageerror', e => errors.push(e.message));
  await ph.goto(URL);
  await ph.evaluate(() => { Kit.closeHelp(); Kit.closeDialog(); newGame('fort'); });
  const tapAt = async i => { const r = await ph.locator(`.cell[data-i="${i}"]`).boundingBox(); await ph.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); return r.width; };
  const width = await tapAt(0);
  await ph.waitForTimeout(150);
  await tapAt(1);
  ok(width < 24 && await ph.evaluate(() => !/Vous avez choisi/.test(document.getElementById('msg').textContent)), `on a 280 px phone, squares of ${width.toFixed(0)} px: a tap on the next square within half a second counts`);
  await ph.close();
}

// 15. With reduced motion, the win still comes, at once.
const calm = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
calm.on('pageerror', e => errors.push(e.message));
await calm.goto(URL);
await calm.click('#newBtn');
await calm.getByRole('button', { name: 'Facile', exact: true }).click();
await calm.evaluate(() => { for (let w = 0; w < G.words.length - 1; w++) G = MotsMeles.find(G, w); save(); render(); });
// The memory is full at the last word: the win dialog says the grid was not saved.
await calm.evaluate(() => { GG.save = async () => false; });
const last = await calm.evaluate(() => { const c = MotsMeles.cells(G, G.words.length - 1); return [c[0], c[c.length - 1]]; });
for (const i of last) { await calm.locator(`.cell[data-i="${i}"]`).click(); await calm.mouse.move(5, 5); await calm.waitForTimeout(560); }
await calm.waitForSelector('#over.on', { timeout: 1500 });
ok(await calm.evaluate(() => G.result === 'won' && !document.getElementById('sheet').classList.contains('wave')), 'with reduced motion the win comes without the wave');
ok(/mémoire de l'ordinateur est pleine/.test(await calm.evaluate(() => document.getElementById('overText').textContent)), 'a win that could not be saved says so in the dialog');
await calm.close();

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
