// Renders the images: node scripts/icons.mjs
// public/icons/icon.svg to the PNG sizes the app manifest needs. The link preview images are drawn by
// scripts/og.mjs.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';
const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const out = name => new URL(`../public/${name}`, import.meta.url).pathname;
const b = await chromium.launch();
for (const size of [192, 512]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await p.screenshot({ path: out(`icons/icon-${size}.png`), omitBackground: true });
}
// Apple devices take a square icon without transparency for the home screen.
const apple = await b.newPage({ viewport: { width: 180, height: 180 } });
await apple.setContent(`<style>html,body{margin:0;background:#0F4F47}svg{width:180px;height:180px;display:block}</style>${svg.replace('rx="112"', 'rx="0"')}`);
await apple.screenshot({ path: out('icons/apple-touch-icon.png') });
await b.close();
