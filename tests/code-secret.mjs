// Plays the code secret with a real mouse: the first visit and its coach, the rules guide, colours put and
// taken out, the rule of Facile, « Valider » and its clue, a click on an old row, the hint, undo, a reload, the
// win, the loss, a broken save, the keyboard, and the layout at every window size.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('code-secret');
const errors = [];

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent.replace(/\u00a0/g, ' '));
const pick = async c => { await page.locator(`.pick[data-c="${c}"]`).click(); await page.mouse.move(5, 5); await wait(80); };
const hole = i => page.locator(`#board .col.now .hole[data-i="${i}"]`);

// 1. The first visit: a game at Facile starts at once, with the coach on a colour of the tray.
await page.goto(URL);
await wait(400);
ok(!(await g(() => Kit.isOpen())) && await g(() => G.level === 'facile' && G.rows === 12) && await page.locator('#board .col').count() === 12,
  'the first visit starts a game at Facile at once, with 12 columns');
ok(await g(() => Kit.coaching() && document.querySelector('.pick.coach') !== null && !document.getElementById('coachHand').hidden), 'the coach rings a colour and points the hand at it');
ok(/Cliquez sur une couleur/.test(await msg()), 'the message line says what to click first');
ok(await g(() => document.querySelector('#board .col.now .hole.target') !== null), 'the hole where the colour goes is framed before any click');
ok(await g(() => { const b = document.getElementById('bar'); return b.scrollWidth <= b.clientWidth; }), 'the bar fits on his laptop');
ok(await g(() => document.getElementById('okBtn').disabled && /Il manque encore 4\spions/.test(document.getElementById('okBtn').dataset.why)), '« Valider » is grey and says why');
ok(await g(() => !document.querySelector('#vault .peg')), 'the code is not in the page while the game goes on');
await page.click('#helpBtn');
const pages = await page.locator('#helpText .page').count();
ok(pages === 5, `the rules have ${pages} pages`);
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/code-secret-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
ok(!(await g(() => Kit.isOpen())), 'the last page closes the rules');

// 1b. Regression: during the coach, blue in the first hole must not make the coach point at blue again.
await pick(1);
await wait(200);
const coached = await g(() => { const e = document.querySelector('.pick.coach'); return e ? +e.dataset.c : -1; });
ok(await g(() => Kit.coaching() && G.cur[0] === 1 && sel === 1), 'with the coach on, blue goes in the first hole');
ok(coached >= 0 && coached !== 1, `the coach then points at a colour the row accepts, not blue: ${coached}`);
await page.locator(`.pick[data-c="${coached}"]`).click(); await page.mouse.move(5, 5); await wait(100);
ok(await g(c => G.cur[1] === c, coached) && !/ne sert qu’une fois/.test(await msg()), 'the colour the coach shows is taken, with no refusal');

// 2. A fixed code: rouge, bleu, jaune, vert.
await g(() => { G = { ...CodeSecret.newGame('facile', 1), code: [0, 1, 2, 3] }; sel = 0; save(); render(); });
await pick(0);
ok(await g(() => G.cur[0] === 0 && document.querySelector('#board .col.now .hole[data-i="0"] .peg') !== null), 'a click on a colour puts it in the framed hole');
ok(/Vous avez posé le rouge/.test(await msg()) && await g(() => sel === 1), 'the line names it and the frame moves to the next hole');
await pick(0);
ok(/chaque couleur ne sert qu’une fois : le rouge est déjà posé/.test(await msg()) && await g(() => G.cur[1] === -1), 'at Facile, a colour twice is refused with the reason');
ok(await g(() => document.querySelector('.pick[data-c="0"]').classList.contains('used')), 'at Facile, a colour already in the row is marked in the tray');
await pick(1); await pick(4);
await hole(0).click(); await page.mouse.move(5, 5); await wait(400);
ok(await g(() => G.cur[0] === -1 && sel === 0) && /Vous avez enlevé le rouge/.test(await msg()), 'a click on a peg takes it out and frames its hole');
await pick(3);
ok(await g(() => JSON.stringify(G.cur) === '[3,1,4,-1]'), 'the next colour goes in the hole made empty');
await pick(0);
ok(await g(() => !document.getElementById('okBtn').disabled && 'nudge' in document.getElementById('okBtn').dataset) && /cliquez sur « Valider »/.test(await msg()),
  'a full row turns « Valider » yellow and says to click it');
await pick(2);
ok(/La colonne est pleine/.test(await msg()), 'a colour on a full row says what to do');

// 3. « Valider »: the pins come in, then the clue in words. vert bleu blanc rouge against rouge bleu jaune vert: 1 and 2.
await page.click('#okBtn');
await wait(100);
ok(await g(() => G.tries.length === 1 && G.tries[0].black === 1 && G.tries[0].white === 2), 'the clue is 1 bien placée, 2 mal placées');
ok(await g(() => document.querySelectorAll('#board .col[data-r="0"] .pin.b').length === 1 && document.querySelectorAll('#board .col[data-r="0"] .pin.w').length === 2),
  'one black pin and two white rings show on the column');
await wait(1200);
ok(/^Essai 1 : 1 bien placée, 2 mal placées\./.test(await msg()) && /Encore 11 essais/.test(await msg()), `the line says the clue in words: ${(await msg()).replace('\n', ' ')}`);
ok(/Essai 1.*1 bien placée.*2 mal placées/.test(await g(() => document.getElementById('note').textContent)), 'the card of the tray says it too');
ok(await g(() => document.querySelector('#board .col[data-r="0"] .count').textContent === '12'), 'the counts under the pins read 1 and 2');
await page.screenshot({ path: `${OUT}/code-secret-clue.png` });
await page.locator('#board .col[data-r="0"]').click(); await page.mouse.move(5, 5);
ok(/Essai 1 : vert, bleu, blanc et rouge\. 1 bien placée, 2 mal placées\./.test(await msg()), 'a click on an old row reads it again');
await page.locator('#board .col[data-r="5"]').click(); await page.mouse.move(5, 5);
ok(/servira plus tard/.test(await msg()), 'a click on a later column says where to play');
await page.locator('#vault').click(); await page.mouse.move(5, 5);
ok(/caché sous ce couvercle/.test(await msg()), 'a click on the lid says the code is under it');

// 4. The hint fits the clue, says why, and waits for « Valider ».
await wait(4200);
await page.click('#hintBtn');
await wait(500);
ok(await g(() => G.cur.every(c => c >= 0) && CodeSecret.fits(G, G.cur)), 'the hint fills the row with a combination that fits the clue');
ok(/Elle respecte tous vos indices : le code est une des \d+ combinaisons possibles\. Cliquez sur « Valider »\./.test(await msg()), `the hint says why: ${await msg()}`);
ok(await g(() => document.getElementById('hintBtn').dataset.auto === 'no'), 'the automatic hint never replaces pegs in the row');

// 5. Undo: one peg, the rest of the row, then the last row given back.
await page.click('#undoBtn');
ok(await g(() => G.cur.filter(c => c >= 0).length === 3), 'undo takes back the last peg');
for (let k = 0; k < 3; k++) await page.click('#undoBtn');
ok(await g(() => G.cur.every(c => c < 0) && G.tries.length === 1), 'undo empties the row peg by peg');
await page.click('#undoBtn');
ok(await g(() => G.tries.length === 0 && JSON.stringify(G.cur) === '[3,1,4,0]') && /L’essai 1 est repris/.test(await msg()), 'with an empty row, undo gives the last row back');
await page.click('#okBtn');
await wait(1200);

// 6. A reload keeps the rows and the pegs being put.
await pick(0);
await g(() => GG.flush());
await page.reload();
await wait(400);
ok(await g(() => G.tries.length === 1 && G.cur[0] === 0 && G.order.length === 1 && !document.querySelector('#vault .peg')), 'a reload keeps the rows and the row being filled');
ok(await g(() => GG.meta('code-secret').summary === 'Partie en cours'), 'the tile says a game is in progress');

// 7. The win: the code with the mouse, the lid opens, the win is counted once.
const sent = { won: 0 };
await page.exposeFunction('sent', kind => { if (kind === 'won') sent.won++; });
await g(() => { GG.track = (game, kind) => window.sent(kind); });
await hole(0).click(); await wait(400);
for (const c of [0, 1, 2, 3]) await pick(c);
await page.click('#okBtn');
ok(!(await g(() => Kit.isOpen())) && !(await g(() => document.getElementById('vault').classList.contains('open'))), 'the lid waits for the pins');
await wait(1500);
ok(await g(() => document.getElementById('vault').classList.contains('open') && document.querySelectorAll('#vault .peg').length === 4), 'then the lid opens on the code');
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(/Bravo, vous avez trouvé le code/.test(await g(() => document.getElementById('overTitle').textContent))
  && /rouge, bleu, jaune et vert en 2\sessais/.test(await g(() => document.getElementById('overText').textContent)), 'the win sheet names the code and the tries');
await page.screenshot({ path: `${OUT}/code-secret-won.png` });
ok(sent.won === 1 && await g(() => stats.won === 1 && /1 victoire/.test(document.getElementById('level').textContent)), 'the win is counted once, on the level line');
ok(await g(() => document.getElementById('undoBtn').disabled && /code est dévoilé/.test(document.getElementById('undoBtn').dataset.why)), 'after the end, undo is grey and says why');
await page.keyboard.press('Escape');
await pick(2);
ok(/La partie est finie/.test(await msg()), 'a colour after the end says to start a new game');
await page.reload();
await wait(400);
ok(await g(() => G.result === 'won' && !Kit.isOpen() && document.getElementById('vault').classList.contains('open')) && /Bravo, vous avez trouvé le code en 2\sessais/.test(await msg()),
  'a reload after the win shows it open, without the sheet');

// 8. The loss, at Moyen: ten rows without the code.
await page.click('#newBtn');
await page.getByRole('button', { name: 'Moyen', exact: true }).click();
ok(await g(() => G.level === 'moyen' && G.rows === 10) && await page.locator('#board .col').count() === 10, 'Moyen has 10 columns');
await g(() => {
  G = { ...CodeSecret.newGame('moyen', 2), code: [5, 5, 5, 5] };
  for (let k = 0; k < 9; k++) { [0, 1, 2, 3].forEach(i => { G = CodeSecret.place(G, i, k % 2); }); G = CodeSecret.submit(G); }
  sel = 0; save(); render();
});
await pick(0); await pick(0);
ok(await g(() => G.cur[1] === 0), 'at Moyen, a colour can come back in the row');
await pick(1); await pick(1);
await page.click('#okBtn');
await page.waitForSelector('#over.on', { timeout: 5000 });
ok(/Le code est resté secret/.test(await g(() => document.getElementById('overTitle').textContent))
  && /violet, violet, violet et violet/.test(await g(() => document.getElementById('overText').textContent)), 'the last row without the code loses and shows it');
ok(await g(() => stats.won === 1), 'a loss counts no win');
await page.keyboard.press('Escape');

// 9. A broken save starts a new game and keeps the wins.
await g(() => { const v = GG.load('code-secret'); v.G.tries[0].black = 4; return GG.save('code-secret', v); });
await page.reload();
await wait(400);
ok(await g(() => !G.tries.length && G.result === '' && stats.won === 1), 'a broken save is not loaded: a new game starts, the wins stay');

// 10. The keyboard: 1 to 6 put a colour, Retour arrière takes one back, Entrée validates.
await page.mouse.click(5, 300);
for (const k of ['1', '2', '3', '4']) await page.keyboard.press(k);
ok(await g(() => JSON.stringify(G.cur) === '[0,1,2,3]'), 'the keys 1 to 4 put the first four colours');
await page.keyboard.press('Backspace');
ok(await g(() => G.cur[3] === -1), 'Retour arrière takes the last peg back');
await page.keyboard.press('5');
await page.keyboard.press('Enter');
ok(await g(() => G.tries.length === 1), 'Entrée validates a full row');
await wait(1500);

// 11. Difficile: 5 holes, 8 colours and 10 rows, with a hint that comes quickly.
await page.click('#newBtn');
await page.getByRole('button', { name: 'Difficile', exact: true }).click();
ok(await g(() => G.holes === 5 && G.colors === 8) && await page.locator('.pick').count() === 8 && await page.locator('#board .col.now .hole').count() === 5, 'Difficile has 5 holes and 8 colours');
await page.click('#hintBtn'); await page.click('#okBtn'); await wait(1800);
const t0 = Date.now();
await page.click('#hintBtn');
ok(Date.now() - t0 < 1500 && await g(() => G.cur.every(c => c >= 0)), `the second hint of Difficile comes in ${Date.now() - t0} ms`);
await page.screenshot({ path: `${OUT}/code-secret-difficile.png` });

// 12. The layout at every window: nothing past the window, text 20 px or more (13 on a phone), buttons 44 px or
// more, the board and the tray inside the table, the rules without scrolling from 620 px high. On a phone the
// board scrolls sideways, inside its own frame, to the column in play.
async function check(p, label) {
  const r = await p.evaluate(() => {
    const bad = [], z = Zoom.z(), phone = innerWidth < 700, min = phone ? 13 : 20;
    const shown = e => { const s = getComputedStyle(e), b = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
    const wrap = document.getElementById('boardWrap').getBoundingClientRect();
    for (const e of document.querySelectorAll('body *')) {
      if (!shown(e) || e.closest('svg, .sr') || e.closest('#over:not(.on), #help:not(.on)')) continue;
      const b = e.getBoundingClientRect(), name = e.id || e.className || e.tagName;
      const scrolled = phone && e.closest('#boardWrap');
      if (!scrolled && (b.right > innerWidth + 1 || b.left < -1)) bad.push('past the side: ' + name);
      const text = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      if (text && parseFloat(getComputedStyle(e).fontSize) < min) bad.push('small text: ' + name);
      if (e.tagName === 'BUTTON' && !phone && b.height / z < 43.5) bad.push('small button: ' + name);
    }
    const t = document.getElementById('table').getBoundingClientRect();
    for (const id of ['board', 'tray']) {
      const b = document.getElementById(id).getBoundingClientRect();
      if (b.bottom > t.bottom + 1 || b.top < t.top - 1) bad.push('cut: ' + id);
      if (!phone && (b.right > t.right + 1 || b.left < t.left - 1)) bad.push('cut on the side: ' + id);
    }
    if (phone && (wrap.right > innerWidth + 1 || wrap.left < -1)) bad.push('the board frame is past the side');
    const now = document.querySelector('#board .col.now');
    if (phone && now) { const b = now.getBoundingClientRect(); if (b.left < wrap.left - 1 || b.right > wrap.right + 1) bad.push('the column in play is out of view'); }
    const m = document.getElementById('msg');
    if (m.scrollWidth > m.clientWidth + 1 || m.scrollHeight > m.clientHeight + 1) bad.push('message cut');
    if (document.documentElement.scrollWidth > innerWidth) bad.push('page scrolls sideways');
    return bad;
  });
  ok(!r.length, `${label}: nothing cut or too small${r.length ? ': ' + [...new Set(r)].slice(0, 6).join(', ') : ''}`);
}
const WINDOWS = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75]];
const LONG = 'Au niveau facile, chaque couleur ne sert qu’une fois : le violet est déjà posé. Choisissez une autre couleur.';
const sizes = {};
for (const [w, h, z] of WINDOWS) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, ...(w < 700 ? { isMobile: true, hasTouch: true } : {}) });
  p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(z => localStorage.setItem('gg:size', JSON.stringify(z)), z);
  await p.goto(URL);
  await p.waitForTimeout(300);
  const label = `${w}x${h}${z !== 1 ? ' at ' + z * 100 + ' %' : ''}`;
  await p.click('#helpBtn');
  let fit = true;
  for (let n = 0; n < 5; n++) {
    if (h / z >= 620 && !(await p.evaluate(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }))) fit = false;
    await check(p, `${label} rules page ${n + 1}`);
    if (n < 4) await p.click('#helpNext');
  }
  if (h / z >= 620) ok(fit, `${label}: every rules page fits without scrolling`);
  await p.evaluate(() => Kit.closeHelp());
  for (const lv of ['facile', 'moyen', 'fort']) {
    // Three rows played and the longest message, as in a game.
    await p.evaluate(([lv, long]) => {
      newGame(lv);
      for (let k = 0; k < 3; k++) {
        const h = CodeSecret.hint(G);
        if (h.guess.join() === G.code.join()) break;
        G = CodeSecret.submit(h.guess.reduce((g, c, i) => CodeSecret.place(g, i, c), G));
      }
      G = CodeSecret.place(G, 0, 1); sel = 1; render(); Kit.say(long);
    }, [lv, LONG]);
    await p.waitForTimeout(500);
    await check(p, `${label} ${lv}`);
    const s = await p.evaluate(() => Math.round(document.querySelector('#board .hole').getBoundingClientRect().width / Zoom.z()));
    sizes[`${label} ${lv}`] = s;
    ok(s >= 26, `${label} ${lv}: holes of ${s} px`);
    ok(await p.evaluate(() => [...document.getElementById('rail').children].every(e => e.matches('.credit, .zoom'))), `${label} ${lv}: nothing of the game in the bottom bar`);
    await p.screenshot({ path: `${OUT}/code-secret-${lv}-${w}x${h}${z !== 1 ? '-' + z : ''}.png` });
  }
  await p.close();
}
ok(sizes['1366x680 facile'] >= 48 && sizes['1366x680 fort'] >= 44, `on his laptop the holes are ${sizes['1366x680 facile']} px at Facile and ${sizes['1366x680 fort']} px at Difficile`);

// 13. With reduced motion, the end shows at once.
{
  const p = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(URL);
  await p.waitForTimeout(300);
  await p.evaluate(() => { G.code.forEach((c, i) => { G = CodeSecret.place(G, i, c); }); render(); validate(); });
  await p.waitForSelector('#over.on', { timeout: 1500 }).catch(() => {});
  ok(await p.evaluate(() => document.getElementById('over').classList.contains('on') && document.getElementById('vault').classList.contains('open')), 'with reduced motion, the code and the sheet show at once');
  await p.close();
}

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
