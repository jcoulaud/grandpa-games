// The démineur's board: its squares, their size and drawing, the explosion, and the mouse and touch.
// The page's script (index.html) holds the game, its saves and its buttons. Both are classic scripts,
// so each calls the other's functions once the page has loaded.
'use strict';
/* ---------- Drawing ---------- */
const table = document.getElementById('table'), boardEl = document.getElementById('board');
let squares = [], built = '', S = 50;
function build() {
  const key = G.w + 'x' + G.h;
  if (built === key) return;
  built = key; boardEl.innerHTML = ''; squares = [];
  for (let i = 0; i < G.w * G.h; i++) {
    const e = document.createElement('div');
    e.className = 'c'; e.dataset.i = i; e.setAttribute('role', 'gridcell');
    boardEl.appendChild(e); squares.push(e);
  }
}
// The board fills the table, in the middle, with squares as large as fit (72 px at most). A tall,
// narrow window (a phone) turns a wide board a quarter, so its squares stay large.
function layout() {
  const W = table.clientWidth, H = table.clientHeight;
  const turned = H > W && G.w > G.h;
  const cols = turned ? G.h : G.w, rows = turned ? G.w : G.h;
  const room = (len, n) => (len - 32) / (n + .4);
  // A phone scrolls down to the rest of the board rather than make its squares too small.
  S = Math.floor(Math.max(24, Math.min(room(W, cols), innerWidth < 700 ? 72 : room(H, rows), 72)));
  const F = Math.max(8, Math.round(S * .2));
  const BX = Math.round((W - cols * S) / 2), BY = Math.max(F + 8, Math.round((H - rows * S) / 2));
  const root = document.documentElement.style;
  root.setProperty('--s', S + 'px'); root.setProperty('--cols', String(G.w));
  boardEl.classList.toggle('turned', turned);
  boardEl.style.left = BX + 'px'; boardEl.style.top = BY + 'px';
  const frame = $('frame');
  frame.style.left = BX - F + 'px'; frame.style.top = BY - F + 'px';
  frame.style.width = cols * S + 2 * F + 'px'; frame.style.height = rows * S + 2 * F + 'px';
  table.style.overflowY = BY + rows * S + F > H ? 'auto' : 'hidden';
}

function render() {
  if (!G) return;
  build(); layout();
  const framed = new Set(hint ? hint.cells : []), ringed = new Set(hint && hint.ring ? hint.ring : []);
  for (let i = 0; i < squares.length; i++) {
    const e = squares[i], c = G.cells[i];
    const n = c === 'o' ? D.number(G, i) : 0;
    const boom = i === G.boom;
    let cls = 'c' + (c === 'o' ? ' o' : '') + (n ? ' n n' + n : '') + (boom ? ' boom' : '');
    if (framed.has(i)) cls += ' hint';
    if (ringed.has(i)) cls += ' ring';
    const html = boom ? MINE : c === 'f' ? FLAG : n ? String(n) : '';
    if (e.className.replace(' shake', '') !== cls) e.className = cls;
    if (e.dataset.html !== html) { e.innerHTML = html; e.dataset.html = html; }
    const r = Math.floor(i / G.w) + 1, k = i % G.w + 1;
    e.setAttribute('aria-label', `Ligne ${r}, colonne ${k} : ${boom ? 'mine' : c === 'f' ? 'drapeau' : c === 'o' ? (n ? n + (n === 1 ? ' mine autour' : ' mines autour') : 'vide') : 'fermée'}`);
  }
  $('flags').innerHTML = FLAG + `Drapeaux : ${D.flags(G)} sur ${G.mines}`;
  $('wins').textContent = stats.won ? `Victoires : ${stats.won}` : '';
  $('undoBtn').disabled = !undo.length;
  $('hintBtn').disabled = !!G.result;
  $('flagBtn').disabled = !!G.result;
}
function shake(i) {
  const e = squares[i];
  if (!e) return;
  e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake');
}

// The explosion over the mine that went off. It removes itself, or doUndo removes it.
function explode() {
  const e = squares[G.boom];
  if (!e) return;
  // On the page rather than in the table, so the edge of the table does not cut it.
  const r = e.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'blast';
  b.style.left = r.left + r.width / 2 + 'px';
  b.style.top = r.top + r.height / 2 + 'px';
  b.style.setProperty('--b', Math.round(r.width * 5) + 'px');
  b.innerHTML = '<i class="smoke"></i><i class="fire"></i><i class="flash"></i><i class="wave"></i>'
    + Array.from({ length: 14 }, (_, k) => `<i class="spark" style="--a:${k * 360 / 14 + Math.random() * 16}deg;--d:${Math.round(r.width * (1.6 + Math.random()))}px"></i>`).join('');
  document.body.appendChild(b);
  e.classList.add('pop');
  for (const x of [boardEl, $('frame')]) { x.classList.remove('quake'); void x.offsetWidth; x.classList.add('quake'); }
  later(clearBlast, 1400);
}
function clearBlast() {
  document.querySelectorAll('.blast').forEach(b => b.remove());
  for (const x of [boardEl, $('frame')]) x.classList.remove('quake');
  squares.forEach(e => e.classList.remove('pop'));
}

/* ---------- Mouse and touch ----------
   A press and release on the same square is a click; the hand may move up to 16 px. The left button
   opens, the right button puts or takes off a flag. A second click on the same square with the same
   button within half a second is a double-click: it counts as one click. */
const squareOf = e => { const el = e.target.closest && e.target.closest('.c'); return el ? +el.dataset.i : -1; };
let press = null;
boardEl.addEventListener('contextmenu', e => e.preventDefault());
boardEl.addEventListener('pointerdown', e => {
  if ((e.button !== 0 && e.button !== 2) || Kit.isOpen()) return;
  e.preventDefault();
  press = { i: squareOf(e), button: e.button, x: e.clientX, y: e.clientY, pointer: e.pointerId };
});
addEventListener('pointerup', e => {
  if (!press || e.pointerId !== press.pointer || e.button !== press.button) return;
  const p = press; press = null;
  const el = document.elementFromPoint(e.clientX, e.clientY), i = el && el.closest('.c') ? +el.closest('.c').dataset.i : -1;
  if (p.i < 0 || (i !== p.i && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 16)) return;
  const t = performance.now(), prev = lastTap;
  lastTap = { t, i: p.i, button: p.button };
  if (prev && prev.i === p.i && prev.button === p.button && t - prev.t < 500) return;
  tap(p.i, p.button === 2 ? 'flag' : 'open');
});
addEventListener('pointercancel', () => { press = null; });
