// Every page sends its visits to PostHog, and lib/ph.js names each folder of the site correctly.
// It reads the files only, so it runs in CI with the rules tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const pages = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e =>
  e.isDirectory() ? pages(join(dir, e.name)) : e.name === 'index.html' ? [join(dir, e.name)] : []);
const ph = readFileSync(join(pub, 'lib/ph.js'), 'utf8');
const SITE = JSON.parse(/const SITE = (\[[^\]]*\])/.exec(ph)[1].replace(/'/g, '"'));

test('every page except the admin page loads lib/ph.js after lib/zoom.js, and before lib/store.js', () => {
  for (const file of pages(pub)) {
    const name = relative(pub, file);
    if (name.startsWith('admin/')) continue;
    const html = readFileSync(file, 'utf8');
    const zoom = html.search(/lib\/zoom\.js"/), tag = html.search(/lib\/ph\.js"/), store = html.search(/lib\/store\.js"/);
    assert.ok(tag > zoom && zoom >= 0, `${name} loads lib/ph.js after lib/zoom.js`);
    if (store >= 0) assert.ok(tag < store, `${name} loads lib/ph.js before lib/store.js`);
  }
});

test('a first folder with a page is a game, with lib/store.js, or is in SITE in lib/ph.js', () => {
  for (const e of readdirSync(pub, { withFileTypes: true })) {
    const page = join(pub, e.name, 'index.html');
    if (!e.isDirectory() || !existsSync(page)) continue;
    const game = readFileSync(page, 'utf8').includes('lib/store.js"');
    assert.ok(game !== SITE.includes(e.name), `${e.name}/ is ${game ? 'a game, so not in SITE' : 'not a game, so it goes in SITE'} in lib/ph.js`);
  }
});
