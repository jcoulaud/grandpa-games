// Every game page and every rules page shows its own link preview image, and the image exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const at = (path) => new URL(`../public/${path}`, import.meta.url);
const library = readFileSync(at('index.html'), 'utf8');
const games = [...library.matchAll(/\{ id: '([^']+)', family: '[^']+'/g)].map((m) => m[1]);
const image = (html) => html.match(/<meta property="og:image" content="https:\/\/jeux-papi\.fr\/([^"]+)">/)?.[1];

test('each game page has its own preview image', () => {
  assert.ok(games.length >= 18);
  for (const id of games) {
    const src = image(readFileSync(at(`${id}/index.html`), 'utf8'));
    assert.equal(src, `og/jeux/${id}.jpg`, id);
    assert.ok(existsSync(at(src)), src);
  }
});

test('each rules page has its own preview image', () => {
  for (const id of games) {
    if (!existsSync(at(`${id}/regles/index.html`))) continue;
    const src = image(readFileSync(at(`${id}/regles/index.html`), 'utf8'));
    assert.equal(src, `og/${id}.jpg`, id);
    assert.ok(existsSync(at(src)), src);
  }
});
