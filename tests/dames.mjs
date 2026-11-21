// Plays the jeu de dames with a real mouse: moves, captures step by step, refusals, the computer in its
// worker, undo, hint, drag, saves across a reload, the win, the loss and the draw counter.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('dames');

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
const msg = () => g(() => document.getElementById('msg').textContent);
// The middle of square n, on the screen.
const at = n => g(`(() => { const r = document.getElementById('board').getBoundingClientRect(); return [r.left + Dames.colOf(${n}) * S + S / 2, r.top + Dames.rowOf(${n}) * S + S / 2]; })()`);
const click = async n => { await page.mouse.click(...await at(n)); await wait(80); await page.mouse.move(5, 5); await wait(450); };
const goes = () => g(() => [...document.querySelectorAll('.sq.go')].map(e => +e.dataset.n).sort((a, b) => a - b));
// Puts a position on the board, white to move: "12,K28" is a man on 12 and a king on 28.
const setPos = (w, b, extra = {}) => g(`(() => {
  cancelAll();
  const bd = new Array(51).fill(0);
  const put = (l, s) => l.split(',').filter(Boolean).forEach(x => bd[+x.replace('K', '')] = s * (x[0] === 'K' ? 2 : 1));
  put(${JSON.stringify(w)}, 1); put(${JSON.stringify(b)}, -1);
  G = Object.assign({ b: bd, turn: 1, quiet: 0, endLeft: Dames.endLimit(bd), reps: {}, result: null }, ${JSON.stringify(extra)});
  last = null; undo = []; sel = null; hint = null; phase = 'player'; started = true;
  save(); say(turnMessage()); render();
})()`);
const waitTurn = async () => { for (let i = 0; i < 60 && await g(() => phase !== 'player' && phase !== 'over'); i++) await wait(100); };

// 1. The first visit: the rules open, and each page fits without scrolling.
await page.goto(URL);
await wait(500);
ok(await g(() => Kit.isOpen()), 'the rules open on the first visit');
for (let n = 0; n < 4; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/dames-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
await page.getByRole('button', { name: 'Facile', exact: true }).click();
ok(!(await g(() => Kit.isOpen())), '"J\'ai compris" closes the rules');

// 2. Layout: large squares, and the board and the side column fit in the window.
const lay = await g(() => {
  const r = id => document.getElementById(id).getBoundingClientRect(), f = r('frame'), t = table.getBoundingClientRect();
  const panels = ['whoB', 'whoW'].map(r);
  return { S, fits: f.bottom <= t.bottom && f.top >= t.top && panels.every(p => p.left >= t.left && p.right <= t.right && p.bottom <= t.bottom),
    apart: panels.every(p => p.right < f.left || p.left > f.right), twoCols };
});
ok(lay.S >= 46, `squares are ${lay.S} px at 1366x680`);
ok(lay.fits && lay.apart, 'the board and the two panels fit side by side');
ok(lay.twoCols, 'a laptop window puts the computer on the left and the player on the right');

// 3. A move: click a piece, then a framed square. The computer answers from its worker.
await click(32);
ok(JSON.stringify(await goes()) === '[27,28]', 'a man shows its two squares forward');
await page.screenshot({ path: `${OUT}/dames-chosen.png` });
await click(28);
ok(await g(() => G.b[28] === 1 && G.b[32] === 0), 'the man moved from 32 to 28');
ok(await g(() => phase === 'thinking' || phase === 'anim'), 'the computer takes its turn');
await page.screenshot({ path: `${OUT}/dames-thinking.png` });
await waitTurn();
ok(await g(() => G.turn === 1 && phase === 'player'), 'the computer answered');
ok(await g(() => workerOk && !!worker), 'the computer thinks in a worker, also from a file');
ok((await msg()).startsWith("L'ordinateur a"), 'the line says what the computer did: ' + await msg());
ok(await g(() => document.querySelectorAll('.sq.last').length === 2), 'the computer\'s move stays marked');
await page.screenshot({ path: `${OUT}/dames-answered.png` });

// The computer's answer is random: start again from the opening for the next checks.
await g(() => newGame('facile'));

// 4. A double-click on a piece counts as one click: the piece stays chosen.
await page.mouse.dblclick(...await at(33)); await wait(300);
ok(await g(() => sel && sel.from === 33), 'a double-click chooses the piece once');
await wait(400);
await click(33);
ok(await g(() => sel === null), 'a second, slower click puts it back');

// 5. Refusals, in one sentence each.
await click(17);
ok((await msg()).includes("à l'ordinateur"), 'a black piece: ' + await msg());
await click(45);
ok((await msg()).includes("Ce pion ne peut pas avancer") || (await msg()).includes('Cliquez'), 'a blocked man: ' + await msg());

// 6. Undo while the computer thinks: his move comes back and no answer arrives later.
const before = await g(() => JSON.stringify(G.b));
await click(31); await click(26);
await page.click('#undoBtn');
await wait(2500);
ok(await g(() => JSON.stringify(G.b)) === before && await g(() => G.turn === 1), 'undo during the computer\'s turn takes back the move, and no late answer comes');

// 7. A capture of two pieces with a flying king, one landing at a time, saved across a reload.
await setPos('K46,31', '23,24');
ok((await msg()).startsWith('Vous devez prendre'), 'the line says a capture is compulsory: ' + await msg());
ok(await g(() => document.querySelectorAll('.pc.must').length === 1), 'the piece that must take is circled');
await click(31);
ok((await msg()).includes('obligatoire'), 'a man that cannot take is refused: ' + await msg());
await click(46);
ok(JSON.stringify(await goes()) === '[19]', 'only the landing that keeps the most pieces is framed');
await click(14);
ok((await msg()).includes('entourée'), 'a wrong square keeps the piece: ' + await msg());
await click(19);
ok(await g(() => document.querySelectorAll('.pc.taken').length === 1), 'the first piece taken is crossed out and stays');
ok(JSON.stringify(await goes()) === '[30,35]', 'then both landings beyond the second piece are framed');
await page.screenshot({ path: `${OUT}/dames-capture.png` });
await page.reload(); await wait(500);
ok(await g(() => sel && sel.from === 46 && sel.path.join() === '19'), 'a capture half done comes back after a reload');
ok(JSON.stringify(await goes()) === '[30,35]', 'with the same landings framed');
await click(35);
await wait(1200);
ok(await g(() => G.result && G.result.winner === 1), 'taking the last pieces wins');
ok(await g(() => stats.won === 1 && document.getElementById('over').classList.contains('on')), 'the win is counted and shown');
ok(await g(() => document.querySelectorAll('#trayW i.b').length === 20 && document.getElementById('tookW').textContent.includes('20 pièces')), 'every black piece is in his tray');
await page.screenshot({ path: `${OUT}/dames-won.png` });
ok((await g(() => [...document.querySelectorAll('#overBtns button')].map(b => b.textContent).join())) === 'Nouvelle partie,Retour aux jeux', 'the win offers a new game or the way back to the games');
await g(() => Kit.closeDialog());
await page.click('#undoBtn');
ok(await g(() => !G.result && G.b[46] === 2), 'undo after the win');
await click(46); await click(19); await click(30);
await wait(1200);
ok(await g(() => stats.won === 1), 'winning the same game again counts once');
ok(await g(() => GG.meta('dames').summary.includes('1 victoire')), 'the library tile shows the win: ' + await g(() => GG.meta('dames').summary));
await g(() => Kit.closeDialog());

// 7b. Undo during a hint, with a capture half done, takes back only the landings clicked.
await setPos('K46,31', '23,24,1');
await g(() => { undo.push(JSON.stringify({ G, last })); save(); });
await click(46); await click(19);
// The hint is kept waiting, so the undo surely comes while it searches.
await g(() => { window.realAsk = ask; window.ask = () => new Promise(() => {}); });
await page.click('#hintBtn');
ok(await g(() => phase === 'hint'), 'the hint is searching');
await page.click('#undoBtn');
await g(() => { window.ask = window.realAsk; });
ok(await g(() => undo.length === 1 && sel === null && phase === 'player' && G.b[46] === 2), 'undo during a hint keeps the turn before');

// 7c. Two quick clicks on two squares are two clicks: the move is played.
await setPos('32', '1');
// Both clicks land near the corner the two squares share, 8 px apart.
const corner = await g(() => { const r = boardEl.getBoundingClientRect(); return [r.left + 4 * S, r.top + 6 * S]; });
await page.mouse.click(corner[0] - 3, corner[1] + 3); await wait(120);
await page.mouse.click(corner[0] + 3, corner[1] - 3); await wait(200);
ok(await g(() => G.b[28] === 1), 'a quick second click on another square plays the move');
await waitTurn();

// 8. The most pieces: a king that can take one piece is refused when a man can take two.
await setPos('12,K28', '17,27,K39,1');
await click(28);
ok((await msg()).includes('le plus de pièces'), 'taking fewer pieces is refused: ' + await msg());
await click(12);
ok(JSON.stringify(await goes()) === '[21]', 'the man that takes two shows its first landing');

// 9. The loss, and undo from its dialog.
await setPos('36', '27');
await click(36); await click(31);
await waitTurn(); await wait(1200);
ok(await g(() => G.result && G.result.winner === -1), 'the computer takes the last piece and wins');
ok((await g(() => document.getElementById('overTitle').textContent)).includes("L'ordinateur a gagné"), 'the loss is shown');
await page.click('#overBtns button.primary');
ok(await g(() => !G.result && G.b[36] === 1 && G.turn === 1), '"Annuler mon dernier coup" brings the game back');

// 10. The hint: a framed piece and a blinking square. Clicking the square plays it.
await page.goto(URL); await wait(300);
await g(() => newGame('facile'));
await page.click('#hintBtn');
await wait(1600);
ok(await g(() => document.querySelectorAll('.pc.hint').length === 1 && document.querySelectorAll('.sq.hint').length === 1), 'the hint frames a piece and a square');
ok(await g(() => boardEl.classList.contains('hinting')), 'the hint hides the other frames');
await page.screenshot({ path: `${OUT}/dames-hint.png` });
const hs = await g(() => +document.querySelector('.sq.hint').dataset.n);
await click(hs);
ok(await g(n => G.b[n] === 1, hs), 'clicking the blinking square plays the hint');
await waitTurn();

// 11. Drag a piece onto a square.
await setPos('31,40', '1');
const piece = { from: 31, to: 26 };
const [x0, y0] = await at(piece.from), [x1, y1] = await at(piece.to);
await page.mouse.move(x0, y0); await page.mouse.down();
await page.mouse.move(x0 + 20, y0 - 20, { steps: 3 }); await page.mouse.move(x1, y1, { steps: 6 });
await page.mouse.up(); await wait(400);
ok(await g(m => G.b[m.to] > 0 && G.b[m.from] === 0, piece), 'dragging a piece plays it');
await waitTurn();

// 12. Closing while the computer thinks: it answers once after the reload.
const m2 = await g(() => Dames.moves(G.b, 1)[0]);
await g(m => { tap(m.from); m.routes[0].path.forEach(s => tap(s)); }, m2);
const undoLen = await g(() => undo.length);
await page.reload(); await wait(300);
await waitTurn();
ok(await g(() => G.turn === 1) && await g(() => undo.length) === undoLen, 'after a reload, the computer answers once');

// 13. The draw counter, and the level chosen for a new game.
await setPos('K47,K48', 'K3');
ok((await g(() => document.getElementById('drawNote').textContent)).includes('dans 10 coups'), 'a short ending says when it is drawn: ' + await g(() => document.getElementById('drawNote').textContent));
await g(() => { G.endLeft = 1; render(); });
ok((await g(() => document.getElementById('drawNote').textContent)).startsWith('Partie nulle après votre prochain coup'), 'one ply left on his turn: the draw comes after his next move');
await g(() => { G.turn = -1; render(); });
ok((await g(() => document.getElementById('drawNote').textContent)).startsWith("Partie nulle au prochain coup de l'ordinateur"), "one ply left on the computer's turn: the draw comes with its move");
await page.screenshot({ path: `${OUT}/dames-ending.png` });
await page.click('#newBtn');
ok((await g(() => [...document.querySelectorAll('#overBtns button')].map(b => b.textContent).join())).includes('Facile,Moyen,Difficile'), 'a new game offers three levels');
await page.click('#overBtns button:text-is("Moyen")');
ok(await g(() => level === 'moyen' && document.getElementById('levelB').textContent === 'Niveau moyen'), 'the level is chosen and shown');
await page.reload(); await wait(300);
ok(await g(() => level === 'moyen'), 'the level is kept');

// 13b. Undo while the strongest level thinks, then play again: its old watchdog leaves the worker alone.
await g(() => newGame('fort'));
await click(32); await click(28);
await page.click('#undoBtn');
await click(33); await click(29);
await wait(7000);
await waitTurn();
ok(await g(() => workerOk && G.turn === 1), 'after an undo, the computer still thinks in its worker');

// 13c. Opened as a file, the way back names the library page.
ok((await g(() => document.getElementById('home').href)).endsWith('/public/index.html'), 'the way back to the games works from a file');

// 13d. A phone-sized window shows the whole board.
await page.setViewportSize({ width: 360, height: 640 }); await wait(200);
ok(await g(() => { const r = boardEl.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }), 'a narrow window shows the whole board');
await setPos('K47,K48', 'K3');
// The bar takes two rows on a phone: the warning is the first thing under the board, one scroll of the table away.
ok(await g(() => { const d = document.getElementById('drawNote'); d.parentElement.firstElementChild === d && d.scrollIntoView({ block: 'nearest' });
  const r = d.getBoundingClientRect(); return d.parentElement.firstElementChild === d && d.offsetParent && r.width > 100 && r.bottom <= innerHeight + 1 && r.top >= 0; }),
  'a narrow window shows the draw warning first under the board');
await g(() => { table.scrollTop = 0; });
await page.setViewportSize({ width: 780, height: 1024 }); await wait(200);
ok(await g(() => { const r = document.getElementById('drawNote').getBoundingClientRect(); return r.bottom <= innerHeight && r.top >= 0; }), 'an upright tablet shows the draw warning without scrolling');
await page.setViewportSize({ width: 740, height: 360 }); await wait(200);
ok(await g(() => [...document.querySelectorAll('.tray')].every(t => t.getBoundingClientRect().right <= t.parentElement.getBoundingClientRect().right + 1)), 'a short narrow window keeps the trays inside their panels');
await page.setViewportSize({ width: 360, height: 640 }); await wait(200);
await page.screenshot({ path: `${OUT}/dames-phone.png` });

// 14. A wide screen gets larger squares.
await page.setViewportSize({ width: 1920, height: 1000 }); await wait(200);
ok(await g(() => S) >= 70, `squares are ${await g(() => S)} px at 1920x1000`);
await page.screenshot({ path: `${OUT}/dames-1920.png` });

ok(!errors.length, 'no page errors ' + errors.join(' | '));
await browser.close();
if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log('\nAll dames tests passed');
