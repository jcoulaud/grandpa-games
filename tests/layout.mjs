// Every screen, in two fonts and five window sizes, against the same rules of layout.
//
// Fonts (tests/fonts): Selawik has the metrics of Segoe UI, the font of his PC, so the text takes the
// room it takes on Windows. DejaVu Sans is much wider: it shows where a longer text or another font
// would break. Each font replaces Segoe UI in the page, so the result is the same on any machine.
//
// Windows: his laptop in Edge, the same laptop with the text at 125%, a 1920 by 1080 monitor, the same
// monitor at 150%, a phone, and the laptop and the monitor enlarged with the size buttons of the page.
//
// Rules, on each screen:
//   - nothing goes past the sides of the window;
//   - no text is cut, and with the Segoe UI metrics the rules pages need no scrolling in a window of 620 px
//     or more (in the wide font they may scroll);
//   - all text is 20 px or more (13 on a phone), apart from the cards themselves and the pictures of the library;
//   - every button is at least 44 px high, and no two buttons overlap;
//   - a dialog fits in the window.
// A screenshot of each screen goes to tests/screenshots/layout (or SHOTS/layout).
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, gameUrl, OUT } from './harness.mjs';

const font = file => readFileSync(new URL(`fonts/${file}.woff2`, import.meta.url)).toString('base64');
const FONTS = {
  segoe: { 400: font('selawik-400'), 600: font('selawik-600'), 700: font('selawik-700') },
  wide: { 400: font('dejavu-400'), 700: font('dejavu-700') },
};
// minText: the smallest text allowed. On a phone the cards are small, and so are the words drawn on
// their places. rulesFit: each page of the rules fits without scrolling; in a lower window it scrolls.
const WINDOWS = [
  { name: 'laptop', width: 1366, height: 680, minText: 20, rulesFit: true },
  { name: 'laptop-125', width: 1093, height: 530, minText: 20 },
  { name: 'monitor', width: 1920, height: 1000, minText: 20, rulesFit: true },
  { name: 'monitor-150', width: 1280, height: 620, minText: 20, rulesFit: true },
  { name: 'phone', width: 390, height: 760, isMobile: true, hasTouch: true, minText: 13 },
  // The size buttons (lib/zoom.js) at the largest size each window holds: about 1050 by 540 px of page.
  { name: 'laptop-zoom-130', width: 1366, height: 680, minText: 20, zoom: 1.3 },
  { name: 'monitor-zoom-175', width: 1920, height: 1000, minText: 20, zoom: 1.75 },
];
const GAMES = ['solitaire', 'freecell', 'dames', 'dame-de-pique'];
// The longest kind of message a game says, to check the message line never cuts it.
const LONG = 'Vous pouvez déplacer 3 cartes à la fois pour le moment. Videz une case libre ou une colonne pour en déplacer plus.';
const shots = join(OUT, 'layout');
mkdirSync(shots, { recursive: true });

// Runs in the page before its own scripts: the test font takes the names of Segoe UI.
function useFont(faces) {
  const names = ['Segoe UI Variable Display', 'Segoe UI Variable Text', 'Segoe UI'];
  for (const [weight, b64] of Object.entries(faces)) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    for (const name of names) document.fonts.add(new FontFace(name, bytes, { weight }));
  }
}

// Runs in the page: the list of what breaks the rules on the screen as it is now.
function audit({ minText, rulesFit }) {
  const W = innerWidth, H = innerHeight, bad = [];
  const shown = e => { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !e.closest('[hidden]'); };
  const name = e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : ''))
    + ` "${(e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`;
  // What is under a dialog does not count: only the dialog is in front of him.
  const front = document.querySelector('#over.on') || document.querySelector('#help.on');
  const inScope = e => !front || front.contains(e);
  // A scrolling panel may hold more than it shows: what it hides is reached by scrolling.
  const scroller = e => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return p; } return null; };
  // Pictures, and text only for a screen reader (.sr), are not text he reads.
  const decor = e => e.closest('.card, .art, .backs, #deco, svg, .sr');
  const texts = [...document.querySelectorAll('body *')].filter(e => inScope(e) && shown(e) && !decor(e)
    && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
  for (const e of texts) {
    const s = getComputedStyle(e), r = e.getBoundingClientRect();
    if (parseFloat(s.fontSize) < minText - .5) bad.push(`text under ${minText} px (${s.fontSize}): ${name(e)}`);
    if (!scroller(e) && (r.right > W + 1 || r.left < -1)) bad.push(`text past the side of the window: ${name(e)}`);
    if (s.overflowX !== 'visible' && e.scrollWidth > e.clientWidth + 1) bad.push(`text cut on the right: ${name(e)}`);
    if (s.overflowY !== 'visible' && s.overflowY !== 'auto' && e.scrollHeight > e.clientHeight + 1) bad.push(`text cut at the bottom: ${name(e)}`);
  }
  // Text that overflows a box with visible overflow still spills out of it.
  for (const e of document.querySelectorAll('button, #msg, .tile .body')) {
    if (!inScope(e) || !shown(e)) continue;
    if (e.scrollWidth > e.clientWidth + 2) bad.push(`text wider than its box: ${name(e)}`);
  }
  // A label in the bar stays on one line, apart from a phone, where its three game buttons share a row.
  if (W >= 700) for (const e of document.querySelectorAll('#bar button, #bar #title, #home')) {
    if (!inScope(e) || !shown(e)) continue;
    const tops = new Set();
    for (const walk = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); walk.nextNode();) {
      if (!walk.currentNode.textContent.trim() || !shown(walk.currentNode.parentElement)) continue;
      const range = document.createRange(); range.selectNodeContents(walk.currentNode);
      for (const r of range.getClientRects()) if (r.width > 1) tops.add(Math.round(r.top / 4));
    }
    if (e.id !== 'title' && tops.size > 1) bad.push(`label on two lines: ${name(e)}`);
    if (e.id === 'title' && e.querySelector('#level') && tops.size > 2) bad.push(`label on three lines: ${name(e)}`);
  }
  const targets = [...document.querySelectorAll('button, a#home, a.tile')].filter(e => inScope(e) && shown(e));
  const rects = targets.map(e => e.getBoundingClientRect());
  // A scrolling panel clips its buttons at the panel edge.
  const visibleRects = targets.map((e, i) => {
    const r = rects[i], panel = scroller(e);
    if (!panel) return r;
    const p = panel.getBoundingClientRect();
    return { left: Math.max(r.left, p.left), right: Math.min(r.right, p.right),
      top: Math.max(r.top, p.top), bottom: Math.min(r.bottom, p.bottom) };
  });
  targets.forEach((e, i) => {
    const r = rects[i];
    if (r.height < 44) bad.push(`button under 44 px high (${Math.round(r.height)}): ${name(e)}`);
    if (!scroller(e) && (r.right > W + 1 || r.left < -1)) bad.push(`button past the side of the window: ${name(e)}`);
    for (let j = i + 1; j < targets.length; j++) {
      const v = visibleRects[i], q = visibleRects[j];
      if (v.right <= v.left || v.bottom <= v.top || q.right <= q.left || q.bottom <= q.top) continue;
      if (!targets[j].contains(e) && !e.contains(targets[j]) && v.left < q.right - 1 && q.left < v.right - 1 && v.top < q.bottom - 1 && q.top < v.bottom - 1)
        bad.push(`buttons overlap: ${name(e)} and ${name(targets[j])}`);
    }
  });
  for (const id of ['box', 'helpBox']) {
    const e = document.getElementById(id);
    if (!e || !shown(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) bad.push(`dialog does not fit in the window: #${id}`);
  }
  const help = document.getElementById('helpText');
  if (rulesFit && help && shown(help) && help.scrollHeight > help.clientHeight + 1) bad.push('the rules page needs scrolling');
  if (document.scrollingElement.scrollWidth > W + 1) bad.push(`the page scrolls sideways (${document.scrollingElement.scrollWidth} px)`);
  return [...new Set(bad)];
}

const browser = await launch();
let failed = 0, screens = 0;
try {
  for (const [fontName, faces] of Object.entries(FONTS)) for (const win of WINDOWS) {
    const ctx = await browser.newContext({ viewport: { width: win.width, height: win.height }, isMobile: win.isMobile, hasTouch: win.hasTouch, reducedMotion: 'reduce' });
    await ctx.addInitScript(useFont, faces);
    if (win.zoom) await ctx.addInitScript(z => localStorage.setItem('gg:zoom', String(z)), win.zoom);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const tag = `${fontName} ${win.name}`;
    const check = async (screen, settle = 150) => {
      await page.waitForTimeout(settle);
      await page.evaluate(() => document.fonts.ready);
      // The test font must be the one drawing the page.
      if (win.zoom && await page.evaluate(() => Zoom.z()) !== win.zoom) { failed++; console.log(`FAIL ${tag} ${screen}: the page is not at ${win.zoom * 100} %`); }
      const used = await page.evaluate(() => document.fonts.check('20px "Segoe UI"') && [...document.fonts].some(f => f.family === 'Segoe UI' && f.status === 'loaded'));
      const bad = used ? await page.evaluate(audit, { ...win, rulesFit: win.rulesFit && fontName === 'segoe' }) : ['the test font did not load'];
      await page.screenshot({ path: join(shots, `${fontName}-${win.name}-${screen}.png`) });
      screens++;
      if (bad.length) { failed++; console.log(`FAIL ${tag} ${screen}`); for (const b of bad) console.log('     ' + b); }
    };

    await page.goto(gameUrl('.'));
    await check('library');

    for (const game of GAMES) {
      await page.goto(gameUrl(game));
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      // The first visit: each page of the rules, then the choice of the level.
      const pages = await page.locator('#helpText .page').count();
      for (let n = 1; n <= pages; n++) { await check(`${game}-rules-${n}`, n === 1 ? 300 : 80); await page.click('#helpNext'); }
      await check(`${game}-level`);
      await page.locator('#overBtns button', { hasText: 'Facile' }).click();
      await check(`${game}-table`, 900);
      await page.evaluate(t => Kit.say(t), LONG);
      await check(`${game}-long-message`, 50);
      if (game === 'dame-de-pique') {
        // After the pass: the trick, the seats and the side column.
        await page.evaluate(() => { picks = G.hands[0].slice(0, 3); render(); });
        await page.click('#passBtn');
        await check(`${game}-play`, 2500);
      }
      await page.click('#newBtn');
      await check(`${game}-new-game`);
      await page.keyboard.press('Escape');
    }
    if (errors.length) { failed++; console.log(`FAIL ${tag} page errors: ${errors.join(' | ')}`); }
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(`${failed ? 'FAIL' : 'PASS'} layout: ${screens} screens, ${failed} with a problem (screenshots in ${shots})`);
process.exit(failed ? 1 : 0);
