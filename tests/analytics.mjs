// The events lib/ph.js, lib/store.js and lib/kit.js send to PostHog on jeux-papi.fr. The site is served
// from public/ at that address, and a stand-in for PostHog's script records each call.
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './harness.mjs';

const pub = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };

// The stand-in reads the init call and the queue the way array.js does, and reports every call. Like
// PostHog, it keeps the registered props in the browser, so they reach the events of the next pages.
const STUB = `(() => {
  const q = window.posthog, [[, config]] = q._i;
  const kept = () => JSON.parse(localStorage.getItem('stub:props') || '{}');
  const keep = props => localStorage.setItem('stub:props', JSON.stringify(props));
  const ph = { __loaded: true,
    capture: (event, props) => window.phCall('capture', event, { ...kept(), ...props }),
    register: props => { keep({ ...kept(), ...props }); window.phCall('register', null, props); },
    unregister: key => { const k = kept(); delete k[key]; keep(k); } };
  window.posthog = ph;
  window.phCall('init', null, { distinct: config.bootstrap.distinctID });
  config.loaded(ph);
  for (const [method, ...args] of q) ph[method](...args);
})();`;

let failed = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); if (!ok) failed++; };

const browser = await launch();
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1400, height: 900 } });
const calls = [];
await ctx.exposeBinding('phCall', ({ page }, method, event, props) => calls.push({ path: new URL(page.url()).pathname, method, event, props }));
await ctx.route('https://eu-assets.i.posthog.com/**', r => r.fulfill({ body: STUB, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' } }));
await ctx.route('https://jeux-papi.fr/**', r => {
  const path = new URL(r.request().url()).pathname;
  if (path.startsWith('/api/')) return r.fulfill({ status: 204 });
  let file = join(pub, decodeURIComponent(path));
  if (path.endsWith('/')) file = join(file, 'index.html');
  if (!existsSync(file)) return r.fulfill({ status: 404 });
  r.fulfill({ body: readFileSync(file), contentType: TYPES[extname(file)] || 'application/octet-stream' });
});
const page = await ctx.newPage();
const registered = path => Object.assign({}, ...calls.filter(c => c.path === path && c.method === 'register').map(c => c.props));
const events = (path, name) => calls.filter(c => c.path === path && c.method === 'capture' && c.event === name);
const until = async test => { for (let i = 0; i < 50 && !test(); i++) await page.waitForTimeout(100); return test(); };

await page.goto('https://jeux-papi.fr/');
await until(() => registered('/').page_type);
check('the library is a library page', registered('/').page_type === 'library', JSON.stringify(registered('/')));
check('a browser tab is not the installed app', registered('/').installed === false);
const id = calls.find(c => c.method === 'init').props.distinct;
check('PostHog knows the PC by its anonymous id', /^[A-Z2-9]{26}$/.test(id) && id === await page.evaluate(() => JSON.parse(localStorage.getItem('gg:device'))));

await page.goto('https://jeux-papi.fr/blog/');
await until(() => registered('/blog/').page_type);
check('the blog is a blog page', registered('/blog/').page_type === 'blog' && !registered('/blog/').game);

await page.goto('https://jeux-papi.fr/solitaire/regles/');
await until(() => registered('/solitaire/regles/').page_type);
check('a rules page names its game', registered('/solitaire/regles/').page_type === 'rules' && registered('/solitaire/regles/').game === 'solitaire',
  JSON.stringify(registered('/solitaire/regles/')));
await page.click('a.play >> nth=0');
await page.waitForURL('https://jeux-papi.fr/solitaire/');
const play = events('/solitaire/regles/', 'play clicked')[0];
check('"Jouer" on a rules page sends play clicked', play?.props.to_game === 'solitaire' && play?.props.place === 'play button', JSON.stringify(play));

// The game opens its guide the first time, then asks for the level.
await until(() => events('/solitaire/', 'rules guide opened').length);
check('the game is a game page', registered('/solitaire/').page_type === 'game' && registered('/solitaire/').game === 'solitaire');
check('the first guide says it opened by itself', events('/solitaire/', 'rules guide opened')[0]?.props.first_visit === true);
await page.click('#helpClose');
const closed = events('/solitaire/', 'rules guide closed')[0];
check('closing the guide says how far it was read', closed?.props.page === 1 && closed.props.read_all === false && closed.props.pages > 1, JSON.stringify(closed));
await page.click('#box button:has-text("Facile")');
await until(() => events('/solitaire/', 'game started').length);
check('a new game sends game started', events('/solitaire/', 'game started')[0]?.props.game === 'solitaire');
check('the level goes with the later events', registered('/solitaire/').level === 'facile');
const hint = page.locator('#hintBtn');
if (await hint.isVisible()) {
  await hint.click();
  await until(() => events('/solitaire/', 'hint used').length);
  check('a hint asked by hand sends hint used', events('/solitaire/', 'hint used')[0]?.props.automatic === false);
}

// The game and the level of a game do not follow him to the next page.
await page.goto('https://jeux-papi.fr/blog/');
await page.evaluate(() => PH.capture('test event'));
await until(() => events('/blog/', 'test event').length);
const after = events('/blog/', 'test event')[0].props;
check('a page after a game has no game and no level', after.page_type === 'blog' && !('game' in after) && !('level' in after), JSON.stringify(after));
await page.goto('https://jeux-papi.fr/rami/');
await page.evaluate(() => PH.capture('test event'));
await until(() => events('/rami/', 'test event').length);
const rami = events('/rami/', 'test event')[0].props;
check('another game does not get the level of the last one', rami.game === 'rami' && !('level' in rami), JSON.stringify(rami));

// Away from jeux-papi.fr, nothing loads.
const local = await ctx.newPage();
await local.goto(new URL('../public/solitaire/regles/index.html', import.meta.url).href);
check('a page opened from disk does not load PostHog', await local.evaluate(() => !window.posthog && typeof PH.id === 'string'));

await browser.close();
if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('analytics: all passed');
