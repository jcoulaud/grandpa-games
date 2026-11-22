// The admin dashboard: key figures, the activity chart, the games and the errors, from /api/admin/overview.
'use strict';
const KEY = 'gg-admin-token', RANGE_KEY = 'gg-admin-range';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = { get: k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
  set: (k, v) => { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} } };
// A game's name from its folder: dame-de-pique -> Dame de pique, unless NAMES gives it.
const NAMES = { freecell: 'FreeCell', demineur: 'Démineur', 'mots-meles': 'Mots mêlés', 'huit-americain': 'Huit américain' }; // names that the folder cannot spell
const gameName = id => NAMES[id] || (id.charAt(0).toUpperCase() + id.slice(1)).replace(/-/g, ' ');
const fmt = v => Number(v || 0).toLocaleString('fr-FR');
const plural = (v, one, many) => `${fmt(v)} ${v > 1 ? many : one}`;
const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function ago(ms) {
  const s = (ms - Date.now()) / 1000, a = Math.abs(s);
  if (a < 60) return 'à l’instant';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}
// Days are UTC, as on the server.
const dayOf = back => new Date(Date.now() - back * 864e5).toISOString().slice(0, 10);
const dayLabel = (day, long) => new Date(day + 'T12:00:00Z').toLocaleDateString('fr-FR',
  long ? { weekday: 'long', day: 'numeric', month: 'long' } : { day: 'numeric', month: 'short' });

let toastT = 0;
function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}

let session = 0;
async function api(path, body) {
  const current = session;
  const token = store.get(KEY);
  const r = await fetch('/api/admin/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (current !== session || token !== store.get(KEY)) return;
  if (r.status === 401) { showLogin('Mot de passe incorrect.'); throw new Error('401'); }
  if (r.status === 429) { showLogin('Trop d’essais. Réessayez dans 15 minutes.'); throw new Error('429'); }
  const d = await r.json().catch(() => ({}));
  if (current !== session || token !== store.get(KEY)) return;
  if (!r.ok) { toast(d.error || 'Erreur ' + r.status); throw new Error(d.error); }
  return d;
}

function showLogin(err) {
  session++;
  store.set(KEY, '');
  data = null; byDay = {};
  chart.points = [];
  renderEmpty();
  $('login').hidden = false; $('app').hidden = true;
  $('loginErr').textContent = err || '';
  $('pw').focus();
}

// Remove the snapshot from the DOM so a later login starts with a clean dashboard.
function renderEmpty() {
  for (const id of ['games', 'errors', 'chartSvg', 'tip', 'errSub', 'total', 'rangeLabel',
    'kToday', 'k7', 'kNew', 'kGames', 'fToday', 'f7', 'fNew', 'fGames', 'spToday', 'sp7', 'spGames']) {
    $(id).replaceChildren();
  }
  $('tip').hidden = $('clearErr').hidden = true;
}

let data = null, byDay = {}, range = [7, 30, 90].includes(+store.get(RANGE_KEY)) ? +store.get(RANGE_KEY) : 30;
async function load() {
  const current = session;
  const overview = await api('overview');
  if (!overview || current !== session) return;
  data = overview;
  byDay = Object.fromEntries(data.days.map(d => [d.day, d]));
  $('login').hidden = true; $('app').hidden = false;
  render();
}

// Every day of the last n, also the empty ones.
function series(n) {
  return Array.from({ length: n }, (_, i) => {
    const day = dayOf(n - 1 - i), d = byDay[day] || {};
    return { day, players: d.players || 0, starts: d.starts || 0, wins: d.wins || 0 };
  });
}
const sum = (list, k) => list.reduce((a, d) => a + d[k], 0);

function delta(cur, prev) {
  if (!prev) return cur ? '<span class="delta up">nouveau</span>' : '<span class="delta flat">=</span>';
  const p = Math.round(100 * (cur - prev) / prev);
  if (!p) return '<span class="delta flat">=</span>';
  return `<span class="delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)} %</span>`;
}

// The chart colours come from the CSS, so the page has one palette.
const color = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const TEAL = color('--teal'), GOLD = color('--gold');

// SVG helpers shared by the sparklines and the chart.
const linePath = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
const fade = (id, c, opacity) => `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${c}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></linearGradient>`;
// A line with a fading area under it, down to `base`.
const areaLine = (pts, base, c, id, opacity, width) => {
  const line = linePath(pts);
  return `<defs>${fade(id, c, opacity)}</defs>
    <path d="${line}L${pts[pts.length - 1][0].toFixed(1)} ${base}L${pts[0][0].toFixed(1)} ${base}Z" fill="url(#${id})"/>
    <path d="${line}" fill="none" stroke="${c}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
};

function spark(el, values, c) {
  const w = 96, h = 34, max = Math.max(1, ...values), step = w / Math.max(1, values.length - 1);
  el.setAttribute('viewBox', `0 0 ${w} ${h}`);
  el.innerHTML = areaLine(values.map((v, i) => [i * step, h - 3 - (h - 6) * v / max]), h, c, 'g' + el.id, .22, 1.8);
}

// A round top for the y axis: 1, 2, 2.5 or 5 times a power of ten, split in 4.
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v / 4));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p * 4 >= v) return m * p * 4;
  return v;
}

const chart = { points: [], y: v => v };
function drawChart() {
  const svg = $('chartSvg'), list = series(range);
  const W = svg.clientWidth || 800, H = svg.clientHeight || 280;
  const L = 34, R = 8, T = 10, B = 26, iw = W - L - R, ih = H - T - B, base = T + ih;
  const top = niceMax(Math.max(...list.map(d => Math.max(d.players, d.starts))));
  const step = iw / list.length, bw = Math.min(18, step * .55);
  const y = v => base - ih * v / top;
  const points = list.map((d, i) => ({ ...d, x: L + step * (i + .5) }));
  Object.assign(chart, { points, y });
  const grid = [0, 1, 2, 3, 4].map(k => {
    const v = top * k / 4, yy = y(v).toFixed(1);
    return `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text x="${L - 8}" y="${+yy + 4}" text-anchor="end">${fmt(v)}</text>`;
  }).join('');
  const every = Math.ceil(list.length / (W < 500 ? 4 : 7));
  const ticks = points.map((p, i) => (list.length - 1 - i) % every ? '' :
    `<text x="${p.x.toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(dayLabel(p.day))}</text>`).join('');
  const bars = points.map((p, i) => p.starts ? `<rect class="bar" data-i="${i}" x="${(p.x - bw / 2).toFixed(1)}" y="${y(p.starts).toFixed(1)}"
    width="${bw.toFixed(1)}" height="${(base - y(p.starts)).toFixed(1)}" rx="${Math.min(3, bw / 3).toFixed(1)}"/>` : '').join('');
  const dots = range > 30 ? '' : points.map(p =>
    `<circle cx="${p.x.toFixed(1)}" cy="${y(p.players).toFixed(1)}" r="2.6" fill="#fff" stroke="${TEAL}" stroke-width="1.6"/>`).join('');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = `<g class="grid axis">${grid}</g><g class="axis">${ticks}</g>${bars}
    ${areaLine(points.map(p => [p.x, y(p.players)]), base, TEAL, 'area', .18, 2.2)}${dots}
    <line class="guide" id="guide" y1="${T}" y2="${base}" visibility="hidden"/>
    <circle id="hot" r="4.5" fill="${TEAL}" stroke="#fff" stroke-width="2" visibility="hidden"/>`;
}

function hover(e) {
  const { points, y } = chart;
  if (!points.length) return;
  const svg = $('chartSvg'), box = svg.getBoundingClientRect(), scale = box.width / svg.viewBox.baseVal.width;
  const x = (e.clientX - box.left) / scale;
  const i = points.reduce((best, p, k) => Math.abs(p.x - x) < Math.abs(points[best].x - x) ? k : best, 0);
  const p = points[i];
  $('guide').setAttribute('x1', p.x); $('guide').setAttribute('x2', p.x); $('guide').setAttribute('visibility', 'visible');
  $('hot').setAttribute('cx', p.x); $('hot').setAttribute('cy', y(p.players)); $('hot').setAttribute('visibility', 'visible');
  svg.querySelectorAll('.bar').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  const tip = $('tip');
  tip.innerHTML = `<b>${esc(dayLabel(p.day, true))}</b>
    <div><span><i style="background:${TEAL}"></i>Joueurs</span><span class="num">${fmt(p.players)}</span></div>
    <div><span><i style="background:${GOLD}"></i>Parties</span><span class="num">${fmt(p.starts)}</span></div>
    <div><span><i></i>Gagnées</span><span class="num">${fmt(p.wins)}</span></div>`;
  tip.hidden = false;
  tip.style.left = Math.min(Math.max(p.x * scale + 8, 90), box.width - 80) + 'px';
  tip.style.top = (y(Math.max(p.players, p.starts)) * scale + 2) + 'px';
}
function unhover() {
  $('tip').hidden = true;
  ['guide', 'hot'].forEach(id => $(id) && $(id).setAttribute('visibility', 'hidden'));
  $('chartSvg').querySelectorAll('.bar.on').forEach(b => b.classList.remove('on'));
}

function render() {
  const { totals: t, games, errors } = data;
  const week = series(14), cur = week.slice(7), prev = week.slice(0, 7);
  const g7 = sum(cur, 'starts'), w7 = sum(cur, 'wins');
  $('kpis').classList.remove('loading');
  $('total').textContent = `${plural(t.players, 'joueur', 'joueurs')} depuis le début`;

  $('kToday').textContent = fmt(t.today);
  $('fToday').innerHTML = `${delta(t.today, prev[6].players)} <span>vs hier</span>`;
  $('k7').textContent = fmt(t.active7);
  $('f7').innerHTML = `${delta(t.active7, t.active7prev)} <span>· ${fmt(t.active30)} sur 30 jours</span>`;
  $('kNew').textContent = fmt(t.new7);
  $('fNew').innerHTML = `${delta(t.new7, t.new7prev)} <span>vs semaine précédente</span>`;
  $('kGames').textContent = fmt(g7);
  $('fGames').innerHTML = `${delta(g7, sum(prev, 'starts'))} <span>· ${plural(w7, 'gagnée', 'gagnées')}</span>`;
  spark($('spToday'), week.map(d => d.players), TEAL);
  spark($('sp7'), series(30).map(d => d.players), TEAL);
  spark($('spGames'), week.map(d => d.starts), GOLD);

  document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.range === range)));
  const list = series(range);
  $('rangeLabel').textContent = `${dayLabel(list[0].day)} – ${dayLabel(list[list.length - 1].day)}`;
  drawChart();

  $('games').innerHTML = !games.length
    ? '<div class="empty"><b>Aucune partie pour le moment</b>Les parties apparaîtront ici dès qu’un joueur commence.</div>'
    : games.map(g => {
      const rate = g.starts7 ? Math.round(100 * g.wins7 / g.starts7) : 0;
      return `<div class="game">
        <img src="../${esc(g.game)}/icon.svg" alt="">
        <div><b>${esc(gameName(g.game))}</b><div class="meta">${plural(g.starts, 'partie', 'parties')} en tout · ${plural(g.wins, 'gagnée', 'gagnées')}</div></div>
        <div class="big num">${fmt(g.starts7)}<small>parties</small></div>
        <div class="rate"><div class="track"><div class="fill" style="width:${rate}%"></div></div><span class="num">${rate} % gagnées</span></div>
      </div>`;
    }).join('');

  const total = errors.reduce((a, e) => a + e.n, 0);
  $('errSub').textContent = errors.length ? `${fmt(total)} fois` : '';
  $('clearErr').hidden = !errors.length;
  $('errors').innerHTML = !errors.length
    ? '<div class="empty"><span class="ok"><svg class="ico"><use href="#i-check"/></svg></span><b>Aucune erreur</b>Tout fonctionne chez les joueurs.</div>'
    : errors.map(e => `<details class="error"><summary><span class="dot"></span>
        <div><div class="msg">${esc(e.message)}</div><div class="meta">${esc(ago(e.last))} · ${plural(e.pcs, 'ordinateur', 'ordinateurs')}${e.page ? ' · ' + esc(e.page) : ''}</div></div>
        <span class="count num">${fmt(e.n)}×</span></summary>
        <pre>${esc(e.stack || '(pas de pile)')}\n\nNavigateur : ${esc(e.agent || '?')}</pre></details>`).join('');
}

$('chart').addEventListener('mousemove', hover);
$('chart').addEventListener('mouseleave', unhover);
let resizeT = 0;
addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => data && drawChart(), 120); });
document.querySelector('.seg').addEventListener('click', e => {
  const b = e.target.closest('button[data-range]');
  if (!b || !data) return;
  range = +b.dataset.range; store.set(RANGE_KEY, String(range));
  render();
});
$('clearErr').onclick = async () => {
  if (!confirm('Effacer toutes les erreurs ?')) return;
  try { if (await api('errors/clear', {})) { toast('Erreurs effacées.'); await load(); } } catch {}
};
$('logout').onclick = () => showLogin();
$('login').querySelector('form').onsubmit = async e => {
  e.preventDefault();
  session++;
  store.set(KEY, $('pw').value.trim());
  $('pw').value = '';
  try { await load(); } catch (err) {}
};

addEventListener('storage', e => { if (e.key === KEY && !store.get(KEY)) showLogin(); });

if (store.get(KEY)) { $('app').hidden = false; load().catch(() => {}); } else showLogin();
