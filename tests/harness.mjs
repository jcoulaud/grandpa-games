// Shared setup for the browser tests.
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));

// The game is opened from disk, the way it runs on the PC.
export const gameUrl = id => pathToFileURL(join(here, '..', 'public', id, 'index.html')).href;
export const URL = gameUrl('solitaire');

// Screenshots go to tests/screenshots, or to the folder in SHOTS.
export const OUT = process.env.SHOTS || join(here, 'screenshots');
mkdirSync(OUT, { recursive: true });

// The fonts of the page: Selawik, which has the metrics of Segoe UI, the font of his PC, takes the names
// of Segoe UI in every page (see tests/fonts). So the text takes the same room on any machine, and a
// size checked here is the size on his PC.
const selawik = w => readFileSync(join(here, "fonts", `selawik-${w}.woff2`)).toString('base64');
export const SEGOE = { 400: selawik(400), 600: selawik(600), 700: selawik(700) };
// Runs in the page before its own scripts. The site draws its text in its own fonts (lib/kit.css); the
// cards still use Segoe UI. With everywhere: true, the font also replaces the site's fonts.
export function useFont({ everywhere = false, ...faces }) {
  const names = ['Segoe UI Variable Display', 'Segoe UI Variable Text', 'Segoe UI'];
  for (const [weight, b64] of Object.entries(faces)) {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    for (const name of names) document.fonts.add(new FontFace(name, bytes, { weight }));
  }
  if (everywhere) {
    const style = document.createElement('style');
    style.textContent = ':root { --ui: "Segoe UI" !important; --title: "Segoe UI" !important; }';
    const add = () => document.documentElement.append(style);
    if (document.documentElement) add(); else document.addEventListener('readystatechange', add, { once: true });
  }
}

// A page starts at 80 % (lib/zoom.js), but the layout checks were written for 100 %: a page with no size saved
// gets 100 %. tests/zoom.mjs passes { zoom: false } to see the real default.
const atFullSize = () => { if (localStorage.getItem('gg:zoom') === null) localStorage.setItem('gg:zoom', '1'); };

// CHROMIUM can name a browser binary when Playwright's own download is missing.
export async function launch({ zoom = true } = {}) {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async options => {
    const ctx = await newContext(options);
    await ctx.addInitScript(useFont, SEGOE);
    if (zoom) await ctx.addInitScript(atFullSize);
    return ctx;
  };
  // A page of its own, in a context of its own that closes with it, like Playwright's browser.newPage.
  browser.newPage = async options => {
    const ctx = await browser.newContext(options), page = await ctx.newPage();
    page.on('close', () => ctx.close().catch(() => {}));
    return page;
  };
  return browser;
}
