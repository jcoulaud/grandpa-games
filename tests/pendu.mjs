// Plays the pendu with a real mouse and keyboard: the first visit and its coach, the rules, letters found and
// missed, the petals, the hint, a word proposed, the win and the loss, no word twice, a reload, broken saves,
// and the layout at every window of docs/design.md.
import { launch, gameUrl, OUT } from './harness.mjs';
const browser = await launch();
let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const URL = gameUrl('pendu');
const errors = [];

const page = await browser.newPage({ viewport: { width: 1366, height: 680 } });
page.on('pageerror', e => errors.push(e.message));
const g = (fn, arg) => page.evaluate(fn, arg);
const wait = ms => page.waitForTimeout(ms);
// The message, with its unbreakable spaces as plain spaces.
const msg = () => g(() => document.getElementById('msg').textContent.replace(/\u00a0/g, ' '));
const key = L => page.locator(`.key[data-l="${L}"]`);
// A click, then the mouse moves away and waits, so the next click on the same key is not a double-click.
const click = async L => { await key(L).click(); await page.mouse.move(5, 5); await wait(560); };
// A fixed word, so the steps below meet the same letters each time.
const setWord = (lv, word) => g(([lv, word]) => {
  const w = Pendu.bank(lv).find(x => x.word === word);
  const given = Pendu.LEVELS[lv].first ? [w.key[0]] : [];
  G = { level: lv, word, theme: w.theme, tried: [...given], given, wrong: [], result: '' };
  level = lv; wonNow = false; Kit.showLevel(lv); Kit.gameOver(false); hintL = ''; typing = false; save(); render(); drawDaisy(false);
}, [lv, word]);

// 1. The first visit: a word at Facile starts at once, with the coach on the letter the hint would give.
await page.goto(URL);
await wait(400);
ok(!(await g(() => Kit.isOpen())) && await g(() => G.level === 'facile' && Kit.coaching()), 'the first visit starts a word at Facile at once, with the coach');
ok(await g(() => { const c = document.querySelector('.key.coach'); return !!c && c.dataset.l === Pendu.hint(G).letter; }), 'the coach rings the letter the hint would give');
ok(await g(() => document.querySelector('.tile.on')?.textContent === Pendu.caps(G.word)[0]), 'Facile shows the first letter of the word');
ok(/la première est donnée/.test(await msg()), 'the message says the first letter is given and what to click');
await page.click('#helpBtn');
const pages = await page.locator('#helpText .page').count();
ok(pages >= 3 && pages <= 5, `the rules have ${pages} pages`);
for (let n = 0; n < pages; n++) {
  ok(await g(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; }), `rules page ${n + 1} fits without scrolling`);
  await page.screenshot({ path: `${OUT}/pendu-rules-${n + 1}.png` });
  await page.click('#helpNext');
}
ok(!(await g(() => Kit.isOpen())), "« J'ai compris » closes the rules");

// 2. A letter of the word: its tiles show, the key turns green with a tick.
await setWord('facile', 'tomate');
await click('A');
ok(await g(() => [...document.querySelectorAll('.tile')].map(t => t.textContent).join('|')) === 'T|||A|T|', 'A shows in its place, beside the T given');
ok(/hit/.test(await key('A').getAttribute('class')) && (await msg()).startsWith('Oui, il y a un A dans le mot.'), 'the key turns green and the message says so');
ok(await g(() => getComputedStyle(document.querySelector('.key[data-l="A"]'), '::after').backgroundColor) !== 'rgba(0, 0, 0, 0)', 'a found letter carries a tick');

// 3. A letter not in the word: a petal falls onto the sill, the key gets a red cross, the count goes down.
await click('S');
ok(/miss/.test(await key('S').getAttribute('class')), 'a missed letter is greyed with a red cross');
ok(await g(() => document.getElementById('petals').textContent) === 'Encore 9 pétales', 'the count under the daisy says 9 petals');
ok(await g(() => document.querySelectorAll('#daisyBox .flower .petal').length === 9 && document.querySelectorAll('#daisyBox .sill .lying').length === 1), 'one petal left the flower and lies on the sill');
{ const m = await msg(); ok(m === 'Pas d’S dans ce mot : un pétale tombe, il en reste 9. Essayez une autre lettre.', 'the message says the petal fell and what to do next: ' + m); }
await page.screenshot({ path: `${OUT}/pendu-miss.png` });

// 4. A letter tried again costs nothing and says so; a double-click counts once.
await click('S');
ok(/déjà essayé/.test(await msg()) && await g(() => Pendu.misses(G)) === 1, 'a letter tried again costs nothing and says why');
await key('R').dblclick();
await page.mouse.move(5, 5); await wait(560);
ok(await g(() => G.tried.filter(L => L === 'R').length === 1 && Pendu.misses(G) === 2), 'a double-click on a key tries it once');

// 5. His own keyboard: a letter, and a letter with an accent.
await page.keyboard.press('o');
ok(await g(() => G.tried.includes('O')), 'a letter typed on the keyboard is tried');
await setWord('facile', 'crème');
// A key with an accent, as a French keyboard sends it.
await g(() => dispatchEvent(new KeyboardEvent('keydown', { key: 'é', bubbles: true })));
await wait(300);
{ const t = await g(() => G.tried.join('') + ' ' + [...document.querySelectorAll('.tile')].map(t => t.textContent).join('')); ok(t === 'CE CÈE', 'é typed on the keyboard finds È and E: ' + t); }

// 6. The hint: rings an untried letter, says why in one sentence, and the ringed key plays.
await page.click('#hintBtn');
const h = await g(() => Pendu.hint(G).letter);
ok(/hint/.test(await key(h).getAttribute('class')) && (await msg()).includes(`Cliquez sur la lettre entourée.`) && /Essayez/.test(await msg()), `the hint rings ${h} and says why`);
await click(h);
ok(await g(h => G.tried.includes(h), h) && !(await page.locator('.key.hint').count()), 'a click on the ringed letter plays it and the ring goes');

// 7. Proposer le mot: a large field instead of the keys; a wrong length is refused without a petal, a wrong word
// costs one, the right word wins.
await setWord('moyen', 'cornichon');
await page.click('#proposeBtn');
ok(await g(() => !document.getElementById('propose').hidden && document.activeElement.id === 'guessIn'), 'the field opens with the focus');
const fb = await page.locator('#guessIn').boundingBox(), kb = await page.locator('#keysBox').boundingBox();
ok(fb.height >= 54 && fb.y >= kb.y - 1 && fb.y + fb.height <= kb.y + kb.height + 1, 'the field is large and takes the place of the keys, so nothing moves');
await page.keyboard.type('melon'); await page.keyboard.press('Enter');
await wait(200);
ok(/Le mot a 9 lettres, et vous en avez tapé 5/.test(await msg()) && await g(() => Pendu.misses(G)) === 0, 'a word of another length is refused without a petal');
await page.fill('#guessIn', 'chocolats');
await page.click('#sendBtn');
await wait(300);
ok(/Ce n’est pas CHOCOLATS : un pétale tombe/.test(await msg()) && await g(() => Pendu.misses(G)) === 1 && await g(() => document.getElementById('propose').hidden), 'a wrong word costs a petal and the keys come back');
await page.click('#proposeBtn');
await page.keyboard.press('Escape');
ok(await g(() => document.getElementById('propose').hidden && !typing), 'Escape closes the field');
await page.click('#proposeBtn');
await page.keyboard.type('CORNICHON');
const wonBefore = await g(() => stats.won);
await page.click('#sendBtn');
await wait(300);
ok(await g(() => G.result === 'won') && await g(() => [...document.querySelectorAll('.tile')].map(t => t.textContent).join('')) === 'CORNICHON', 'the right word wins and shows all its letters');
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(/Bravo, vous avez gagné/.test(await g(() => document.getElementById('overTitle').textContent)), 'the win dialog opens after the butterfly');
ok(await g(w => stats.won === w + 1, wonBefore) && /victoire/.test(await g(() => document.getElementById('wins').textContent)), 'the win is counted on the level line');
await page.screenshot({ path: `${OUT}/pendu-win.png` });
await page.keyboard.press('Escape');
ok(await g(() => document.getElementById('proposeBtn').textContent.includes('Mot suivant') && 'nudge' in document.getElementById('proposeBtn').dataset), '« Mot suivant » takes the place of « Proposer le mot » and is the next thing to press');
await click('E');
ok(/Ce mot est trouvé : cliquez sur « Mot suivant »/.test((await msg()).replace(/ /g, ' ')), 'a letter after the end says what to click');
const before = await g(() => G.word);
await page.click('#proposeBtn');
ok(await g(b => G.word !== b && !G.result && G.level === 'moyen', before), '« Mot suivant » gives a new word at the same level');

// 8. The loss: the last petal falls, the word shows in terracotta, the dialog says it kindly.
await setWord('fort', 'xylophone');
for (const L of ['A', 'I', 'S', 'R', 'U']) await click(L);
ok(await g(() => document.getElementById('petals').textContent) === 'Encore 1 pétale', 'Difficile: after 5 misses, 1 petal is left');
await click('T');
await page.waitForSelector('#over.on', { timeout: 4000 });
ok(await g(() => document.getElementById('overTitle').textContent) === 'La marguerite a perdu ses pétales' && /XYLOPHONE/.test(await g(() => document.getElementById('overText').textContent)), 'the loss dialog gives the word');
ok(await page.locator('.tile.missed').count() > 0, 'the letters not found show in terracotta');
await page.keyboard.press('Escape');

// 9. No word twice: each new word joins the words played at its level.
{
  const r = await g(async () => {
    used.facile = [];
    const seen = new Set();
    for (let k = 0; k < 40; k++) { await newGame('facile'); seen.add(G.word); }
    return { seen: seen.size, used: used.facile.length };
  });
  ok(r.seen === 40 && r.used === 40, `40 new words at Facile are 40 different words: ${JSON.stringify(r)}`);
  const rest = await g(async () => { used.facile = Pendu.bank('facile').map(w => w.key).filter(k => k !== 'TOMATE'); await newGame('facile'); return { word: G.word, used: used.facile.length }; });
  ok(rest.word === 'tomate', 'the last word left of the level comes next');
  const again = await g(async () => { await newGame('facile'); return used.facile.length; });
  ok(again === 1, 'once every word was played, the list starts again');
}

// 10. A reload keeps the word and the letters; a broken save starts a new word.
await setWord('facile', 'tomate');
await click('A'); await click('S');
await g(() => GG.flush());
await page.reload(); await wait(400);
ok(await g(() => G.word === 'tomate' && G.tried.join('') === 'TAS' && document.querySelectorAll('#daisyBox .sill .lying').length === 1), 'a reload keeps the word, the letters and the fallen petal');
ok(await g(() => GG.meta('pendu').summary.startsWith('Partie en cours')), 'the tile says a game is in progress');
await g(async () => { const v = GG.load('pendu'); await GG.save('pendu', { ...v, G: { ...v.G, word: 'zzz' } }); await GG.flush(); });
await page.reload(); await wait(400);
ok(await g(() => Pendu.valid(G) && G.word !== 'zzz'), 'a broken save starts a new word');
ok(await g(() => stats.won >= 1), 'a broken word keeps the wins');

// 11. The longest message fits the message line.
await g(() => Kit.say('Le mot a 14 lettres, et vous en avez tapé 13. Corrigez-le, puis cliquez sur « Valider ».'));
ok(await g(() => { const m = document.getElementById('msg'); return m.scrollHeight <= m.clientHeight + 1 && m.scrollWidth <= m.clientWidth + 1; }), 'the longest message fits in the line');
await page.click('#newBtn');
ok(await g(() => Kit.isOpen()), '« Nouvelle partie » opens the levels');
await page.keyboard.press('Escape');
await page.close();

// 12. The layout at every window: nothing past the sides, text of 20 px or more (13 on a phone), keys and
// buttons of 44 px or more that never overlap, the rules without scrolling in a window 620 px high or more.
const WINDOWS = [[1366, 680, 1], [1093, 530, 1], [1920, 1000, 1], [1280, 620, 1], [390, 760, 1], [1366, 680, 1.3], [1920, 1000, 1.75], [768, 680, 1]];
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
    await p.evaluate(() => Kit.openHelp());
    for (let k = 0; k < 5; k++) {
      fit = fit && await p.evaluate(() => { const t = document.getElementById('helpText'); return t.scrollHeight <= t.clientHeight + 1; });
      await p.click('#helpNext');
    }
    ok(fit, `${tag}: every rules page fits without scrolling`);
  }
  // The longest word of each level, with a few letters tried, a hint and a count of wins.
  for (const lv of ['facile', 'moyen', 'fort']) {
    await p.evaluate(lv => {
      const w = Pendu.bank(lv).reduce((a, b) => b.key.length > a.key.length ? b : a);
      const given = Pendu.LEVELS[lv].first ? [w.key[0]] : [];
      G = { level: lv, word: w.word, theme: w.theme, tried: [...given], given, wrong: [], result: '' };
      for (const L of 'EASZ') G = Pendu.guess(G, L).G;
      stats.won = 14; hintL = Pendu.hint(G).letter; typing = false; Kit.showLevel(lv); render(); drawDaisy(false);
      Kit.say('Essayez le R : il est dans 12 des 31 mots du thème qui restent possibles. Cliquez sur la lettre entourée.');
    }, lv);
    await p.waitForTimeout(600);
    const r = await p.evaluate(phone => {
      const z = window.Zoom ? Zoom.z() : 1;
      const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
      const table = document.getElementById('table').getBoundingClientRect();
      const wide = document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth + 1
        && [...document.querySelectorAll('#bar, #say, #table, #rail, #stage, #sheet, #scene, #petals, .key, .tile, .zoom button')].filter(e => e.getClientRects().length).every(e => e.getBoundingClientRect().right <= innerWidth + 1 && e.getBoundingClientRect().left >= -1);
      const fits = inside(document.getElementById('stage').getBoundingClientRect(), table) || phone && document.getElementById('table').scrollHeight <= document.getElementById('table').clientHeight + 1;
      const small = [];
      for (const e of document.querySelectorAll('body *')) {
        if (e.closest('svg, #help, #over') || !e.getClientRects().length) continue;
        if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const f = parseFloat(getComputedStyle(e).fontSize);
        if (f < (phone ? 13 : 20)) small.push(e.tagName + '.' + e.className + ' ' + f);
      }
      const cut = [...document.querySelectorAll('#theme, #petals, #proposeBtn, #bar button, #wins, #title .name *')].filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => e.textContent);
      const buttons = [...document.querySelectorAll('#bar button, #bar #home, #rail button, #proposeBtn, .key')].filter(e => e.getClientRects().length).map(e => e.getBoundingClientRect());
      const lowButton = buttons.filter(b => b.height < 44 * z - 1).length;
      let overlap = 0;
      for (let i = 0; i < buttons.length; i++) for (let j = i + 1; j < buttons.length; j++) {
        const a = buttons[i], b = buttons[j];
        if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) overlap++;
      }
      const m = document.getElementById('msg');
      const tiles = [...document.querySelectorAll('.tile')].map(t => t.getBoundingClientRect());
      const oneRow = new Set(tiles.map(t => Math.round(t.top))).size <= 2;
      const lows = [...document.querySelectorAll('#bar button, #bar #home, #rail button, #proposeBtn, .key')].filter(e => e.getClientRects().length && e.getBoundingClientRect().height < 44 * z - 1).map(e => e.id || e.className);
      return { wide, fits, small, cut, lowButton, lows, overlap, oneRow, msg: m.scrollHeight <= m.clientHeight + 1,
        key: Math.round(document.querySelector('.key').getBoundingClientRect().height / z), tile: Math.round(tiles[0].width / z),
        f: parseFloat(getComputedStyle(document.querySelector('.tile')).fontSize) };
    }, phone);
    const good = r.wide && r.fits && !r.small.length && !r.cut.length && !r.lowButton && !r.overlap && r.msg && r.oneRow && r.f >= (phone ? 13 : 22);
    ok(good, `${tag} ${lv}: fits, keys ${r.key} px, tiles ${r.tile} px, letters ${r.f} px` + (good ? '' : ' ' + JSON.stringify(r)));
    await p.screenshot({ path: `${OUT}/pendu-${w}x${h}-${z}-${lv}.png` });
  }
  // A new word, so the dialog is the level choice of a game not started (the dialog of a game in progress is the
  // kit's, shared by every game).
  await p.evaluate(() => newGame('facile'));
  await p.click('#newBtn');
  ok(await p.evaluate(() => { const b = document.getElementById('box').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight + 1 && b.left >= 0 && b.right <= innerWidth + 1; }), `${tag}: the level dialog fits`);
  await p.close();
}

// 13. With reduced motion, the win dialog comes at once, and no petal flies.
const calm = await browser.newPage({ viewport: { width: 1366, height: 680 }, reducedMotion: 'reduce' });
calm.on('pageerror', e => errors.push(e.message));
await calm.goto(URL);
await calm.evaluate(() => { G = Pendu.newGame('facile', 9); delete G.fresh; render(); drawDaisy(false); });
const miss = await calm.evaluate(() => Pendu.FRENCH.split('').find(c => !Pendu.key(G.word).includes(c)));
await calm.keyboard.press(miss);
await calm.waitForTimeout(300);
ok(await calm.evaluate(() => !document.querySelector('#daisyBox .falling') && document.querySelectorAll('#daisyBox .sill .lying').length === 1), 'with reduced motion the petal lies on the sill at once');
for (const L of await calm.evaluate(() => [...Pendu.lettersOf(G.word)].filter(L => !G.tried.includes(L)))) await calm.keyboard.press(L);
await calm.waitForSelector('#over.on', { timeout: 800 });
ok(await calm.evaluate(() => G.result === 'won'), 'with reduced motion the win dialog opens at once');
await calm.close();

ok(!errors.length, 'no page error' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
process.exit(fails ? 1 : 0);
