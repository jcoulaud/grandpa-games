import * as E from './engine.js';
import { createScene } from './scene.js';
const $ = (id) => document.getElementById(id),
  canvas = document.querySelector('canvas');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const NAME = E.NAME;
const THROW = 'cliquez sur « Lancer la boule ».',
  COCHONNET = 'cliquez sur « Lancer le cochonnet ».',
  NEXT = 'Cliquez sur « Mène suivante ».',
  OVER = 'La partie est terminée : cliquez sur « Nouvelle partie ».',
  WAIT = NAME + ' joue. Attendez la fin de son lancer.';
// Marius takes his time, so each throw can be followed.
const PACE = { think: 1300, read: 2600, mine: 2200, measure: 2400 };
let game,
  view,
  busy = false,
  stale = false,
  shot,
  length = E.COCHONNET.start;
addEventListener('gg-stale', () => {
  stale = true;
});
const sit = () => E.situation(game);
const mene = () => sit().mene;
const pending = () => sit().menes.length > (game.ack ?? 0) && !sit().over;
const turn = () => E.turn(game);
const myTurn = () => !!game && !pending() && turn()?.who === 'you';
const blocked = () => busy || stale || !game || Kit.isOpen() || !myTurn();
const fresh = () => ({ style: 'demi', dx: 0, dl: 0, ti: 0 });

// ---------- Words ----------
const far = (d) => {
  const cm = Math.max(0, Math.round(d * 100));
  return cm < 100 ? cm + ' cm' : (Math.round(d * 100) / 100).toFixed(2).replace('.', ',') + ' m';
};
const metres = (z) => String(z).replace('.', ',') + ' m';
const plural = (n, word) => n + ' ' + word + (n > 1 ? 's' : '');
// The line of his turn: what to set, then what to click.
function next() {
  const t = turn();
  if (!t) return OVER;
  if (pending()) return NEXT;
  if (t.who !== 'you') return NAME + ' joue.';
  if (t.kind === 'cochonnet') return 'À vous de lancer le cochonnet : réglez sa longueur, puis ' + COCHONNET;
  const left = mene().left.you;
  return (left === 3 ? 'Choisissez votre lancer, puis ' : 'Encore ' + plural(left, 'boule') + ' : ') + THROW;
}

// ---------- Saves ----------
async function save() {
  const s = sit(),
    summary = (s.over ? 'Partie terminée' : 'Partie en cours, ' + s.score.you + ' à ' + s.score.cpu) + ' · ' + plural(game.wins, 'victoire');
  const ok = await GG.save('petanque', game, { summary });
  if (!ok && !stale) Kit.say('La partie ne peut pas être enregistrée sur cet appareil.');
  return ok;
}

// Saves after a throw. A throw that ends the game with his win, his own or Marius's last one, counts the
// win in the statistics once.
function saveAndReport(res) {
  const won = res.after.over?.winner === 'you' && !game.reported;
  if (won) game.reported = true;
  return save().then((ok) => {
    if (ok && won && !stale) GG.track('petanque', 'won');
    return ok;
  });
}

// ---------- His throw ----------
// The other player's boules he can shoot, nearest the cochonnet first.
function targets() {
  const m = mene();
  if (game.level === 'facile' || !m.cochonnet) return [];
  return m.boules.filter((b) => !b.dead && b.owner === 'cpu').sort((a, b) => E.gap(a, m.cochonnet) - E.gap(b, m.cochonnet));
}
// The line from his hand to the cochonnet, and the side to his right.
function aimLine() {
  const c = mene().cochonnet,
    dz = c.z - 0.3,
    d = Math.hypot(c.x, dz);
  return { c, u: { x: c.x / d, z: dz / d }, p: { x: dz / d, z: -c.x / d } };
}
// The choice the panel sets, as the engine takes it.
function choice() {
  const t = turn();
  if (t.kind === 'cochonnet') return { aim: { x: 0, z: length } };
  if (shot.style === 'tir') {
    const b = targets()[shot.ti];
    if (b) {
      const { p } = aimLine();
      return { style: 'tir', aim: { x: b.x + p.x * shot.dx * 0.02, z: b.z + p.z * shot.dx * 0.02 }, target: b.id };
    }
    shot.style = 'demi';
  }
  const { c, u, p } = aimLine();
  const dl = shot.dl * 0.1,
    dx = shot.dx * 0.05;
  return { style: shot.style, aim: { x: c.x + u.x * dl + p.x * dx, z: c.z + u.z * dl + p.z * dx } };
}
function previewPath() {
  const t = turn();
  if (!t || t.who !== 'you' || pending()) return view.clearPreview();
  const m = mene(),
    c = choice();
  const action = { ...c, who: 'you', kind: t.kind, id: t.kind === 'cochonnet' ? 0 : m.boules.length + 1 };
  const path = E.simulate(t.kind === 'cochonnet' ? [] : E.onTerrain(m), E.launchOf(action), null).path;
  const level = game.level;
  if (t.kind === 'cochonnet') view.preview(path, { cut: 1, stop: true });
  else if (c.style === 'tir') view.preview(level === 'fort' ? null : path, { cut: 0, stop: false, target: c.aim });
  else if (level === 'facile') view.preview(path, { cut: 1, stop: true });
  else if (level === 'moyen') view.preview(path, { cut: 0.5, stop: false });
  else view.preview(path, { cut: 0, stop: false, area: true });
  if (c.style === 'tir' && level === 'fort') view.preview([{ ...c.aim, y: 0, air: false }], { cut: 0, stop: false, target: c.aim });
}
// A throw he set himself, or the hint's: « Lancer la boule » is the next thing to press. His own setting
// also stops the automatic hint of Facile, so it never replaces his throw.
function chosen(his) {
  $('shoot').dataset.nudge = '';
  if (his) $('hintBtn').dataset.auto = 'no';
  else delete $('hintBtn').dataset.auto;
  Kit.point($('shoot'));
}

// ---------- The table ----------
function card() {
  const s = sit(),
    m = s.over ? s.menes.at(-1) : pending() ? s.menes.at(-1) : s.mene;
  $('mene').textContent = 'Mène ' + (m?.n ?? 1);
  $('goalLine').textContent = 'Partie en ' + E.GOAL[game.level] + ' points';
  const live = pending() || s.over ? null : s.mene;
  const p = live?.cochonnet ? E.point(live) : null;
  const t = turn();
  for (const [who, id] of [
    ['you', 'pYou'],
    ['cpu', 'pCpu']
  ]) {
    const el = $(id);
    el.querySelector('.pts').textContent = s.score[who];
    const left = live ? live.left[who] : 0;
    el.querySelectorAll('.left i').forEach((i, k) => i.classList.toggle('used', k >= left));
    const playing = !!live && t?.who === who;
    el.classList.toggle('turn', playing);
    el.classList.toggle('point', p?.holder === who);
    el.querySelector('.now').textContent = s.over
      ? s.over.winner === who
        ? who === 'you'
          ? 'Vous avez gagné'
          : 'Il a gagné'
        : ''
      : playing
        ? who === 'you'
          ? 'À vous de jouer'
          : 'Il joue'
        : live
          ? left
            ? plural(left, 'boule') + ' en main'
            : 'Plus de boule'
          : '';
  }
}
// The panel: the cochonnet's length, or the style, the direction and the length of a boule.
function panel() {
  const t = turn(),
    s = sit();
  const mine = myTurn(),
    kind = pending() ? 'next' : t?.kind ?? 'over';
  const tir = game.level !== 'facile';
  document.documentElement.classList.toggle('no-tir', !tir);
  $('styles').querySelector('[data-style="tir"]').hidden = !tir;
  $('panelTitle').textContent = kind === 'cochonnet' ? 'Le cochonnet' : 'Votre lancer';
  $('styleRow').hidden = $('dirRow').hidden = kind === 'cochonnet';
  $('lenRow').hidden = kind !== 'cochonnet' && shot.style === 'tir';
  $('targetRow').hidden = kind === 'cochonnet' || shot.style !== 'tir';
  for (const b of $('styles').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.style === shot.style));
  if (kind === 'cochonnet') {
    $('lenLabel').textContent = metres(length);
    $('lenMark').style.left = ((length - E.COCHONNET.min) / (E.COCHONNET.max - E.COCHONNET.min)) * 100 + '%';
  } else {
    $('lenLabel').textContent = shot.dl === 0 ? 'Au cochonnet' : Math.abs(shot.dl * 10) + ' cm plus ' + (shot.dl < 0 ? 'court' : 'long');
    $('lenMark').style.left = 50 + shot.dl * 2.5 + '%';
  }
  const step = shot.style === 'tir' ? 2 : 5;
  $('dirLabel').textContent = shot.dx === 0 ? 'Droit' : Math.abs(shot.dx * step) + ' cm à ' + (shot.dx < 0 ? 'gauche' : 'droite');
  $('dirMark').style.left = 50 + shot.dx * 2.5 + '%';
  const list = targets();
  const target = list[shot.ti];
  $('targetLabel').textContent = target ? 'À ' + far(E.gap(target, mene().cochonnet)) : 'Aucune boule';
  $('shoot').textContent = { cochonnet: 'Lancer le cochonnet', boule: 'Lancer la boule', next: 'Mène suivante', over: 'Voir le résultat' }[kind];
  // Which buttons can be pressed now, and why the others cannot.
  const why = s.over ? OVER : pending() ? NEXT : busy || !mine ? WAIT : '';
  for (const b of document.querySelectorAll('#console button')) {
    const free = b.id === 'shoot' ? !busy && (mine || pending() || !!s.over) : mine && !busy;
    b.disabled = !free;
    if (free) delete b.dataset.why;
    else b.dataset.why = why || WAIT;
  }
  const tirKey = $('styles').querySelector('[data-style="tir"]');
  if (mine && !busy && kind === 'boule' && !list.length) {
    tirKey.disabled = true;
    tirKey.dataset.why = 'Il n’y a pas de boule de ' + NAME + ' à tirer pour le moment.';
  }
  for (const id of ['prevTarget', 'nextTarget'])
    if (mine && list.length < 2) {
      $(id).disabled = true;
      $(id).dataset.why = 'Il n’y a qu’une boule de ' + NAME + ' à tirer.';
    }
  const any = game.actions.some((a) => a.who === 'you');
  $('undoBtn').disabled = busy || !any || !!s.over;
  $('undoBtn').dataset.why = !any ? 'Il n’y a pas encore de coup à annuler.' : busy ? WAIT : OVER;
  $('hintBtn').disabled = !mine || busy;
  $('hintBtn').dataset.why = s.over ? OVER : pending() ? NEXT : WAIT;
  delete $('shoot').dataset.nudge;
  if (pending()) $('shoot').dataset.nudge = '';
  fit();
}
// The panel fits the table: measured in page pixels, so the size buttons count.
function fit() {
  const root = document.documentElement;
  root.classList.remove('tight', 'narrow');
  if (innerWidth < 700) return;
  if ([...document.querySelectorAll('.meter span')].some((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1)) root.classList.add('narrow');
  const table = $('table').getBoundingClientRect();
  if ($('shoot').getBoundingClientRect().bottom > table.bottom + 1 || $('console').scrollHeight > $('console').clientHeight + 1) root.classList.add('tight');
}
// The state on the terrain, the card, the panel and the message line.
function render(msg) {
  const s = sit();
  const m = pending() || s.over ? s.menes.at(-1) : s.mene;
  const p = !pending() && !s.over && s.mene.cochonnet ? E.point(s.mene) : null;
  view.setState(m, { holder: p?.holder, near: p?.holder ? p.near[p.holder] : null });
  card();
  panel();
  Kit.showLevel(game.level);
  Kit.showWins(game.wins);
  Kit.gameOver(!!s.over);
  sheet();
  previewPath();
  if (msg !== undefined) Kit.say(msg);
  if (myTurn() && !busy) Kit.point($('shoot'));
}
// The paper sheet of a mène that is over, until « Mène suivante ».
function sheet() {
  const s = sit(),
    last = s.menes.at(-1),
    show = !!last && (pending() || !!s.over);
  $('sheet').hidden = !show;
  if (!show) return;
  $('sheetTitle').textContent = 'Mène ' + last.n + ' : ' + meneWords(last);
  $('sheetText').textContent = 'Vous ' + s.score.you + ' · ' + NAME + ' ' + s.score.cpu;
}
function meneWords(r) {
  if (!r.winner) return r.reason === 'out' ? 'le cochonnet est sorti, personne ne marque' : 'personne ne marque';
  return r.winner === 'you' ? 'vous marquez ' + plural(r.points, 'point') : NAME + ' marque ' + plural(r.points, 'point');
}

// ---------- A throw, his or Marius's ----------
const SOUNDS = { land: ['cushion', 'roll'], 'land-c': ['piece'], clack: ['clack'], tick: ['hit'], board: ['piece'] };
const sound = (name) => (SOUNDS[name] ?? [name]).forEach((n) => window.Sound?.play(n));
// What happened, in one or two sentences, from the point of view of the player who threw.
function describe(res) {
  const who = res.action.who,
    m = res.mene,
    c = m.cochonnet;
  if (res.action.kind === 'cochonnet') return (who === 'you' ? 'Votre cochonnet' : 'Le cochonnet de ' + NAME) + ' est à ' + metres(Math.round(c.z * 10) / 10) + '.';
  const b = m.boules.at(-1),
    name = who === 'you' ? 'Votre boule' : 'La boule de ' + NAME;
  const words = [];
  if (b.dead) words.push(name + ' a touché la planche : elle est morte.');
  else if (c.dead) words.push(name + ' a poussé le cochonnet hors du terrain.');
  else words.push(name + ' s’arrête à ' + far(E.gap(b, c)) + ' du cochonnet.');
  if (res.action.style === 'tir') {
    const before = res.before.mene.boules.find((x) => x.id === res.action.target),
      after = m.boules.find((x) => x.id === res.action.target);
    if (before && (after.dead || Math.hypot(after.x - before.x, after.z - before.z) > 0.3))
      words[0] = (who === 'you' ? 'Vous avez chassé la boule de ' + NAME : NAME + ' a chassé votre boule') + (carreau(res) ? ' : carreau !' : '.');
    else words[0] = (who === 'you' ? 'Votre tir a manqué la boule de ' + NAME : 'Le tir de ' + NAME + ' a manqué votre boule') + '.';
  }
  return words.join(' ');
}
// A carreau: the shooter's boule stays where the boule it hit was.
function carreau(res) {
  if (res.action.style !== 'tir') return false;
  const before = res.before.mene.boules.find((x) => x.id === res.action.target),
    after = res.mene.boules.find((x) => x.id === res.action.target),
    mine = res.mene.boules.at(-1);
  return !!before && !mine.dead && (after.dead || Math.hypot(after.x - before.x, after.z - before.z) > 0.5) && Math.hypot(mine.x - before.x, mine.z - before.z) < 0.15;
}
// Who has the point now, with the measure when it is close.
function pointWords(m) {
  if (!m.cochonnet || m.cochonnet.dead) return '';
  const p = E.point(m);
  if (p.tie) return 'Les deux boules sont à la même distance.';
  if (!p.holder) return '';
  return p.holder === 'you' ? 'Vous avez le point.' : NAME + ' a le point.';
}
function close(m) {
  if (!m.cochonnet || m.cochonnet.dead) return null;
  const p = E.point(m);
  if (p.best.you === Infinity || p.best.cpu === Infinity || Math.abs(p.best.you - p.best.cpu) >= 0.1) return null;
  return p;
}
function celebrate(text) {
  if (reduced()) return;
  const ribbon = $('ribbon');
  ribbon.textContent = text;
  ribbon.classList.remove('on');
  void ribbon.offsetWidth;
  ribbon.classList.add('on');
  setTimeout(() => ribbon.classList.remove('on'), 1800);
}
function confetti() {
  if (reduced()) return;
  $('confetti').innerHTML = Array.from({ length: 40 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${-(i % 9) * 0.05}s"></i>`).join('');
  setTimeout(() => $('confetti').replaceChildren(), 1900);
}
async function pause(ms) {
  await new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 400) : ms));
  while (Kit.isOpen() && !stale) await new Promise((r) => setTimeout(r, 300));
}
// Plays a throw that the engine has decided, then tells what it did. Returns the line to show.
async function perform(res) {
  const before = res.before.mene;
  const ids = res.action.kind === 'cochonnet' ? [0] : [...E.onTerrain(before).map((b) => b.id), before.boules.length + 1];
  const owners = res.action.kind === 'cochonnet' ? [null] : [...E.onTerrain(before).map((b) => b.owner), res.action.who];
  view.clearMeasure();
  $('sheet').hidden = true;
  await view.animate(res.sim, ids, owners, sound);
  if (stale) return '';
  const m = res.mene;
  view.setState(m, {});
  const dead = m.boules.filter((b) => b.dead && !before.boules.find((x) => x.id === b.id)?.dead).map((b) => b.id);
  if (m.cochonnet?.dead) dead.push(0);
  if (dead.length) await view.fadeOut(dead);
  let line = describe(res);
  if (res.action.kind === 'boule') {
    const b = m.boules.at(-1);
    if (carreau(res)) celebrate('Carreau !');
    else if (!b.dead && m.cochonnet && !m.cochonnet.dead && E.gap(b, m.cochonnet) < 0.006) celebrate('Biberon !');
    const p = close(m);
    if (p) {
      // A close call: the tape goes from the cochonnet to the best boule of each player.
      const list = ['you', 'cpu'].map((who) => {
        const b = m.boules.find((x) => x.id === p.near[who]);
        return { x: b.x, z: b.z, owner: who, cm: Math.max(0, Math.round(p.best[who] * 100)) };
      });
      view.measure(list, m.cochonnet);
      line = 'On mesure : votre boule est à ' + far(p.best.you) + ', celle de ' + NAME + ' à ' + far(p.best.cpu) + '.';
    }
    const words = pointWords(m);
    if (words && !res.ended) line += ' ' + words;
    const p2 = E.point(m);
    if (!res.ended) view.setState(m, { holder: p2.holder, near: p2.holder ? p2.near[p2.holder] : null });
  }
  return line;
}
// The end of a mène: the sheet on the terrain and « Mène suivante ».
function meneOver(line) {
  const s = sit(),
    last = s.menes.at(-1);
  window.Sound?.play(last.winner === 'you' ? 'good' : last.winner ? 'bad' : 'tap');
  const words = 'Fin de la mène : ' + meneWords(last) + '.';
  if (s.over) {
    game.ack = s.menes.length;
    return end(line + ' ' + words);
  }
  render(line + ' ' + words + ' ' + NEXT);
}
async function shoot() {
  if (busy || stale || Kit.isOpen() || !game) return;
  const s = sit();
  if (s.over) return end();
  if (pending()) return nextMene();
  if (!myTurn()) return Kit.tell(WAIT);
  busy = true;
  const c = choice(),
    t = turn();
  const res = E.play(game, c, true);
  panel();
  view.clearPreview();
  Kit.say(t.kind === 'cochonnet' ? 'Le cochonnet part…' : c.style === 'tir' ? 'Votre boule part au tir…' : 'Votre boule part en ' + E.STYLE_NAMES[c.style].toLowerCase() + '…');
  if (res.after.over) game.ack = res.after.menes.length;
  const write = saveAndReport(res);
  const [, line] = await Promise.all([write, perform(res)]);
  busy = false;
  if (stale) return;
  if (res.ended) return meneOver(line);
  afterThrow(line);
}
// After a throw: his turn again, or Marius's.
async function afterThrow(line) {
  shot = fresh();
  if (turn()?.who === 'cpu') {
    render(line + ' ' + NAME + ' joue.');
    busy = true;
    panel();
    await pause(PACE.mine);
    busy = false;
    return opponent();
  }
  await view.glide('aim');
  render(line + ' ' + next());
}
async function nextMene() {
  if (busy || stale) return;
  game.ack = sit().menes.length;
  shot = fresh();
  view.clearMeasure();
  await save();
  window.Sound?.play('tap');
  if (turn()?.who === 'cpu') {
    render(NAME + ' lance le cochonnet.');
    return opponent();
  }
  await view.glide('aim');
  render(next());
}
// Marius plays by himself, one throw after the other, slowly enough to follow. While the rules or a
// dialog are open, he waits.
async function opponent() {
  if (busy || stale || !game) return;
  busy = true;
  panel();
  let line = '';
  while (!stale && turn()?.who === 'cpu' && !pending()) {
    const t = turn();
    Kit.say((line ? line + ' ' : '') + NAME + ' se prépare…');
    await view.glide('aim');
    await pause(PACE.think);
    if (stale) return;
    const c = E.cpuChoice(game);
    const res = E.play(game, c, true);
    if (res.after.over) game.ack = res.after.menes.length;
    Kit.say(t.kind === 'cochonnet' ? NAME + ' lance le cochonnet…' : c.style === 'tir' ? NAME + ' tire votre boule…' : NAME + ' pointe en ' + E.STYLE_NAMES[c.style].toLowerCase() + '…');
    const [, said] = await Promise.all([saveAndReport(res), perform(res)]);
    if (stale) return;
    line = said;
    card();
    if (res.ended) {
      busy = false;
      return meneOver(line);
    }
    Kit.say(line);
    await pause(close(res.mene) ? PACE.measure + 600 : PACE.read);
  }
  busy = false;
  if (stale) return;
  shot = fresh();
  window.Sound?.play('turn');
  await view.glide('aim');
  render(line + ' ' + next());
}

// ---------- The end of a game ----------
let endTimer = 0;
function end(line) {
  const s = sit(),
    won = s.over.winner === 'you';
  render((line ? line + ' ' : '') + (won ? 'Vous avez gagné la partie : bravo !' : NAME + ' a gagné la partie.') + ' Cliquez sur « Nouvelle partie » pour rejouer.');
  if (line) {
    window.Sound?.play(won ? 'win' : 'lose');
    if (won) {
      celebrate('Bravo !');
      confetti();
    }
  }
  clearTimeout(endTimer);
  const shown = game;
  const open = () => {
    if (shown !== game || stale) return;
    if (Kit.isOpen()) {
      endTimer = setTimeout(open, 300);
      return;
    }
    Kit.dialog(won ? 'Bravo, vous avez gagné !' : NAME + ' a gagné', 'Vous : ' + plural(s.score.you, 'point') + '\n' + NAME + ' : ' + plural(s.score.cpu, 'point'), [
      ['Nouvelle partie', choose, true],
      ['Retour aux jeux', Kit.home]
    ], won);
  };
  endTimer = setTimeout(open, line && won && !reduced() ? 1800 : 300);
}

// ---------- Games ----------
async function start(level) {
  if (busy || stale) return;
  clearTimeout(endTimer);
  game = E.fresh(level, game?.wins || 0, newSeed());
  shot = fresh();
  length = E.COCHONNET.start;
  view.clearMeasure();
  view.setView('aim');
  render('Une nouvelle partie commence. ' + next());
  if (await save()) GG.track('petanque', 'start');
}
function choose() {
  if (busy && game && !myTurn()) return Kit.tell(WAIT);
  if (!busy && !stale) Kit.chooseLevel(game?.level, !!game && !sit().over, start);
}
async function back() {
  if (!game || busy || stale || Kit.isOpen()) return;
  // Ctrl+Z goes past the greyed « Annuler » key: a finished game cannot be taken back.
  if (sit().over) return Kit.tell(OVER);
  if (!E.undo(game)) return;
  clearTimeout(endTimer);
  busy = true;
  shot = fresh();
  view.clearMeasure();
  await save();
  busy = false;
  view.setView('aim');
  render('Votre dernier lancer est annulé. ' + next());
}
function hint() {
  if (blocked()) return;
  const h = E.hint(game);
  if (!h) return;
  if (turn().kind === 'cochonnet') length = h.aim.z;
  else if (h.style === 'tir') {
    shot = { ...fresh(), style: 'tir', ti: Math.max(0, targets().findIndex((b) => b.id === h.target)) };
  } else {
    const { c, u, p } = aimLine();
    const ax = h.aim.x - c.x,
      az = h.aim.z - c.z;
    shot = { ...fresh(), style: h.style, dl: Math.round((ax * u.x + az * u.z) / 0.1), dx: Math.round((ax * p.x + az * p.z) / 0.05) };
  }
  panel();
  previewPath();
  Kit.say(h.reason + ' Cliquez sur « ' + (turn().kind === 'cochonnet' ? 'Lancer le cochonnet' : 'Lancer la boule') + ' ».');
  chosen(false);
}
// The keys of the panel. Each press moves one step and says where the throw goes.
function step(key, by) {
  if (blocked()) return;
  const t = turn();
  const limit = 20;
  if (key === 'len' && t.kind === 'cochonnet') {
    const to = E.clamp(length + by * E.COCHONNET.step, E.COCHONNET.min, E.COCHONNET.max);
    if (to === length) return refuse(by > 0 ? 'Le cochonnet se lance à 10 m au plus.' : 'Le cochonnet se lance à 6 m au moins.', COCHONNET);
    length = to;
    panel();
    previewPath();
    Kit.say('Le cochonnet ira à ' + metres(length) + ', puis ' + COCHONNET);
    return chosen(true);
  }
  if (key === 'target') {
    const n = targets().length;
    if (n < 2) return refuse('Il n’y a qu’une boule de ' + NAME + ' à tirer.', THROW);
    shot.ti = (shot.ti + by + n) % n;
    shot.dx = 0;
  } else {
    const field = key === 'dir' ? 'dx' : 'dl';
    const to = E.clamp(shot[field] + by, -limit, limit);
    if (to === shot[field]) return refuse('C’est le plus loin que ce réglage peut aller.', THROW);
    shot[field] = to;
  }
  panel();
  previewPath();
  const c = choice();
  const words =
    key === 'target'
      ? 'Vous visez la boule de ' + NAME + ' à ' + far(E.gap(targets()[shot.ti], mene().cochonnet)) + ' du cochonnet'
      : key === 'dir'
        ? shot.dx === 0
          ? 'Vous visez droit'
          : 'Vous visez ' + $('dirLabel').textContent
        : shot.dl === 0
          ? 'La boule ira au cochonnet'
          : 'La boule ira ' + $('lenLabel').textContent;
  Kit.say(words + (c.style === 'tir' && key !== 'target' ? ' de la boule visée' : '') + ', puis ' + THROW);
  chosen(true);
}
function refuse(text, then) {
  window.Sound?.play('bad');
  Kit.say(text + ' ' + then.charAt(0).toUpperCase() + then.slice(1));
  chosen(true);
}
const STYLE_SAID = {
  roulette: 'Roulette : la boule roule presque tout le chemin',
  demi: 'Demi-portée : la boule vole la moitié du chemin, puis roule',
  plombee: 'Plombée : la boule monte haut et tombe près du cochonnet',
  tir: 'Tir : votre boule vole droit sur la boule de ' + NAME
};
function setStyle(style) {
  if (blocked()) return;
  if (style === 'tir' && !targets().length) return refuse('Il n’y a pas de boule de ' + NAME + ' à tirer.', THROW);
  shot = { ...fresh(), style };
  panel();
  previewPath();
  Kit.say(STYLE_SAID[style] + ', puis ' + THROW);
  chosen(true);
}

function init() {
  try {
    view = createScene(canvas, $('jeu'));
  } catch {
    Kit.dialog('Le terrain ne peut pas s’afficher', 'Pour jouer, activez l’accélération graphique dans Edge, puis rechargez la page.', [['Retour aux jeux', Kit.home, true]]);
    return;
  }
  canvas.bodyAt = view.bodyAt;
  new ResizeObserver(() => game && fit()).observe($('table'));
  for (const b of $('styles').querySelectorAll('button')) b.onclick = () => setStyle(b.dataset.style);
  $('left').onclick = () => step('dir', -1);
  $('right').onclick = () => step('dir', 1);
  $('shorter').onclick = () => step('len', -1);
  $('longer').onclick = () => step('len', 1);
  $('prevTarget').onclick = () => step('target', -1);
  $('nextTarget').onclick = () => step('target', 1);
  $('shoot').onclick = shoot;
  $('hintBtn').onclick = hint;
  $('undoBtn').onclick = back;
  $('newBtn').onclick = choose;
  $('helpBtn').onclick = () => Kit.openHelp();
  // The terrain takes no mouse input: a click on it says where to set the throw.
  $('stage').addEventListener('click', () => {
    if (!game || stale || Kit.isOpen()) return;
    Kit.tell(
      sit().over
        ? OVER
        : pending()
          ? NEXT
          : busy || !myTurn()
            ? WAIT
            : 'Réglez votre lancer avec les boutons à droite, puis ' + (turn().kind === 'cochonnet' ? COCHONNET : THROW)
    );
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Kit.escape();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      back();
    }
  });
  const raw = GG.load('petanque');
  if (!raw) {
    Kit.firstVisit(start);
    return;
  }
  game = E.restore(raw, newSeed());
  shot = fresh();
  const reset = game.seed !== raw.seed || game.actions.length !== raw.actions?.length;
  if (reset) {
    render('Voici une nouvelle partie de pétanque. ' + next());
    save();
    return;
  }
  const s = sit();
  if (s.over) {
    render(OVER);
    end();
  } else if (pending()) {
    const last = s.menes.at(-1);
    render('Fin de la mène : ' + meneWords(last) + '. ' + NEXT);
  } else if (turn().who === 'cpu') {
    render(NAME + ' joue.');
    opponent();
  } else render(next());
}
init();
