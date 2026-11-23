import * as E from './engine.js';
import { createTable } from './table.js';
import { drawGuide, trayBall } from './guide.js';
const $ = (id) => document.getElementById(id);
const T = E.table;
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const STEP = (0.5 * Math.PI) / 180; // one press of ↺ or ↻: half a degree
const OPPONENT = 'René';
const BREAK = 'À vous de casser : visez le paquet, puis cliquez sur « Tirer ».';
let game,
  view,
  aim = { angle: 0, power: 5, spin: 0 },
  hand = null, // where the white stands while he has it in hand
  placing = false,
  busy = false,
  stale = false;
addEventListener('gg-stale', () => {
  stale = true;
});

// ---------- Names, as he reads them ----------
const ballName = E.ballName;
const listOf = (ids) => (ids.length < 2 ? ballName(ids[0]) : ids.slice(0, -1).map(ballName).join(', ') + ' et ' + ballName(ids.at(-1)));
const groupName = (g) => (g === 'pleines' ? 'les pleines, de 1 à 7' : 'les rayées, de 9 à 15');
const other = (g) => (g === 'pleines' ? 'rayees' : 'pleines');
const groupFor = (who) => (who === 'player' ? game.groups.player : game.groups.player && other(game.groups.player));
const upper = (t) => t[0].toUpperCase() + t.slice(1);

// ---------- State helpers ----------
const over = () => !!game?.over;
const myTurn = () => game && !over() && game.turn === 'player';
const blocked = () => !game || busy || stale || Kit.isOpen() || !myTurn();
// The balls as he sees them now: with the white where he holds it while it is in his hand.
function ballsNow() {
  const balls = game.balls.filter((b) => b.id !== 0 || !game.ballInHand);
  if (game.ballInHand && hand && myTurn()) balls.push({ id: 0, x: hand.x, y: hand.y, q: [1, 0, 0, 0] });
  return balls;
}
const white = () => ballsNow().find((b) => b.id === 0);
const shotOf = () => ({ angle: aim.angle, power: aim.power, spin: { side: 0, top: aim.spin * 0.6 } });

async function save() {
  const summary = (over() ? 'Partie terminée' : 'Partie en cours') + ' · ' + game.wins + (game.wins === 1 ? ' victoire' : ' victoires');
  const ok = await GG.save('billard', game, { summary });
  if (!ok && !stale) Kit.say('La partie ne peut pas être enregistrée sur cet appareil.');
  return ok;
}

// ---------- The two players ----------
function panels() {
  for (const who of ['player', 'cpu']) {
    const box = $(who === 'player' ? 'you' : 'cpu'),
      group = groupFor(who),
      turn = !over() && game.turn === who;
    box.classList.toggle('turn', turn);
    box.querySelector('.now').textContent = over()
      ? game.over.winner === who ? 'A gagné la partie' : ''
      : turn
        ? who === 'player'
          ? game.ballInHand ? 'À vous, la blanche en main' : 'À vous de jouer'
          : busy ? 'Joue' : 'À son tour'
        : 'Attend son tour';
    const tray = box.querySelector('.tray');
    if (!group) tray.innerHTML = '<span class="open">Billes pas encore choisies</span>';
    else {
      const on = new Set(game.balls.map((b) => b.id)),
        ids = group === 'pleines' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      tray.innerHTML = ids.map((id) => trayBall(id, !on.has(id))).join('') + trayBall(8, !on.has(8), 'eight');
    }
  }
  Kit.showLevel(game.level);
  Kit.showWins(game.wins);
}

// ---------- The preview of his shot ----------
// The path stops sooner at each level: Facile shows where the ball goes, Difficile only the line to the contact.
const SHOW = { facile: { object: 9, cue: 0.6, gold: true }, moyen: { object: 0.45, cue: 0.2, gold: true }, fort: { object: 0.12, cue: 0, gold: false } };
function cut(pts, metres) {
  if (!pts?.length) return [];
  const out = [pts[0]];
  let left = metres;
  for (let i = 1; i < pts.length && left > 0; i++) {
    const a = pts[i - 1],
      b = pts[i],
      d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= left) out.push(b);
    else out.push({ x: a.x + ((b.x - a.x) * left) / d, y: a.y + ((b.y - a.y) * left) / d });
    left -= d;
  }
  return out;
}
function preview() {
  const s = view.state;
  s.balls = ballsNow();
  s.headLine = myTurn() && game.ballInHand && game.behindLine;
  s.hand = null;
  const cue = white();
  if (!myTurn() || !cue || placing) {
    s.preview = null;
    s.cue = null;
    view.draw();
    return;
  }
  const show = SHOW[game.level] ?? SHOW.facile,
    line = E.aimLine(s.balls, aim.angle),
    path = E.previewPath(s.balls, shotOf()),
    contact = line.contact;
  s.cue = { angle: aim.angle, pull: 0.02 + aim.power * 0.006, alpha: 1 };
  s.preview = {
    aim: [cue, contact],
    ghost: line.hit != null ? contact : null,
    object: line.hit != null ? cut(path.object, show.object) : [],
    cue: line.hit != null ? cut(afterContact(path.cue, contact), show.cue) : [],
    gold: show.gold && path.potted
  };
  // The ball the cue points at, as a small copy of it, or « Bande »: short enough for the narrowest panel.
  $('aimLabel').innerHTML = line.hit != null ? trayBall(line.hit) : 'Bande';
  $('aimLabel').setAttribute('aria-label', line.hit != null ? upper(ballName(line.hit)) : 'La bande');
  view.draw();
}
// The cue ball's path from the contact on: the preview already draws the line up to it.
function afterContact(pts, contact) {
  if (!pts?.length || !contact) return [];
  let best = 0,
    near = Infinity;
  pts.forEach((p, i) => {
    const d = Math.hypot(p.x - contact.x, p.y - contact.y);
    if (d < near) {
      near = d;
      best = i;
    }
  });
  return [contact, ...pts.slice(best + 1)];
}
function controls() {
  const shown = Math.round(aim.power);
  [...$('segments').children].forEach((seg, i) => seg.classList.toggle('on', i < shown));
  $('forceLabel').textContent = shown + ' sur 10';
  $('spinLabel').textContent = ['Rétro', 'Au centre', 'Coulé'][aim.spin + 1];
  $('spinBall').firstElementChild.style.translate = '0 ' + -aim.spin * 8 + 'px';
  const mine = myTurn() && !busy && !stale;
  for (const id of ['turnLeft', 'turnRight', 'weaker', 'stronger', 'spinDown', 'spinUp', 'shoot']) $(id).disabled = !mine || placing;
  $('weaker').disabled ||= Math.round(aim.power) <= 1;
  $('stronger').disabled ||= Math.round(aim.power) >= 10;
  $('spinDown').disabled ||= aim.spin <= -1;
  $('spinUp').disabled ||= aim.spin >= 1;
  $('panelTitle').textContent = game.turn === 'cpu' && !over() ? 'Au tour de ' + OPPONENT : 'Votre coup';
  $('place').hidden = !(mine && game.ballInHand);
  $('place').classList.toggle('on', placing);
  $('place').textContent = placing ? 'Ne pas la déplacer' : 'Déplacer la blanche';
  $('hintBtn').disabled = !mine;
  $('undoBtn').disabled = busy || stale || !game.history?.length;
  $('stage').classList.toggle('wait', busy || !myTurn());
}
function render(message) {
  panels();
  controls();
  preview();
  if (message) Kit.say(message);
}

// ---------- His turn ----------
// Each turn starts aimed at the nearest of his balls, with force 5 and no effect.
function newTurn(message) {
  view.state.rings = [];
  placing = false;
  hand = game.ballInHand ? E.suggestPlace(game) : null;
  aim = { angle: aimAtNearest(), power: game.broken ? 5 : 9, spin: 0 };
  render(
    message +
      (game.ballInHand
        ? ' Vous avez la blanche en main : visez, ou cliquez sur « Déplacer la blanche ».'
        : '')
  );
}
function aimAtNearest() {
  const cue = white();
  if (!cue) return 0;
  const group = groupFor('player'),
    left = group ? E.remaining(game, 'player') : [],
    wanted = (id) => id !== 0 && (group ? (left.length ? left.includes(id) : id === 8) : id !== 8),
    targets = game.balls.filter((b) => wanted(b.id));
  if (!targets.length) return 0;
  const t = targets.reduce((a, b) => (Math.hypot(b.x - cue.x, b.y - cue.y) < Math.hypot(a.x - cue.x, a.y - cue.y) ? b : a));
  return Math.atan2(t.y - cue.y, t.x - cue.x);
}
const ballAt = (p, balls = ballsNow()) => balls.find((b) => b.id !== 0 && Math.hypot(b.x - p.x, b.y - p.y) < T.R * 1.5);
const onCloth = (p) => p.x > -0.01 && p.x < T.L + 0.01 && p.y > -0.01 && p.y < T.W + 0.01;
function click(ev) {
  if (ev.button !== 0 || blocked()) return;
  const p = view.toTable(ev);
  if (placing) {
    if (!E.canPlace(game, p.x, p.y)) {
      window.Sound?.play('bad');
      Kit.say(game.behindLine && p.x > T.headString
        ? 'Après une faute à la casse, la blanche se pose derrière la ligne blanche, du côté de la casse.'
        : 'La blanche ne tient pas ici : choisissez une place libre sur le tapis.');
      return;
    }
    hand = { x: p.x, y: p.y };
    placing = false;
    aim.angle = aimAtNearest();
    render('La blanche est posée. Visez, puis cliquez sur « Tirer ».');
    return;
  }
  if (!onCloth(p)) {
    Kit.say('Cliquez sur une bille, ou sur le tapis, pour viser.');
    return;
  }
  const cue = white();
  if (Math.hypot(p.x - cue.x, p.y - cue.y) < T.R * 1.5) {
    Kit.say('C’est la blanche : cliquez sur la bille à toucher.');
    return;
  }
  const b = ballAt(p),
    to = b ?? p;
  aim.angle = Math.atan2(to.y - cue.y, to.x - cue.x);
  view.state.rings = [];
  render(b ? 'Vous visez ' + ballName(b.id) + '. Réglez la force, puis cliquez sur « Tirer ».' : 'Réglez la force, puis cliquez sur « Tirer ».');
}
function hover(ev) {
  if (!game) return;
  const p = view.toTable(ev),
    s = view.state;
  if (placing && myTurn() && !busy) {
    s.hand = onCloth(p) ? { x: p.x, y: p.y, ok: E.canPlace(game, p.x, p.y) } : null;
    s.hover = null;
    view.draw();
    return;
  }
  const b = ballAt(p, s.balls);
  const next = b ? { id: b.id, x: b.x, y: b.y, text: upper(ballName(b.id)) } : null;
  if (next?.id !== s.hover?.id) {
    s.hover = next;
    view.draw();
  }
}
function turn(dir) {
  if (blocked() || placing) return;
  aim.angle += dir * STEP;
  view.state.rings = [];
  preview();
}
// Holding ↺ or ↻ keeps turning, slowly at first.
function holdable(button, act) {
  let timer = null;
  const stop = () => {
    clearTimeout(timer);
    timer = null;
  };
  button.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    act();
    let delay = 420;
    const again = () => {
      act();
      delay = Math.max(45, delay * 0.8);
      timer = setTimeout(again, delay);
    };
    timer = setTimeout(again, delay);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(ev, stop);
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      act();
    }
  });
}

// ---------- A shot, his or René's ----------
function report(res, who) {
  const me = who === 'player',
    by = me ? 'Vous avez' : OPPONENT + ' a',
    next = me ? ' ' + OPPONENT + ' pose la blanche où il veut.' : '';
  if (res.foul) {
    const first = res.sim.firstHit;
    const why =
      res.foul === 'scratch'
        ? 'la blanche est tombée dans un trou.'
        : res.foul === 'miss'
          ? 'la blanche n’a touché aucune bille.'
          : 'la blanche a d’abord touché ' + ballName(first) + (first === 8 ? '.' : me ? ', une bille de ' + OPPONENT + '.' : ', une de vos billes.');
    return (me ? 'Faute : ' : 'Faute de ' + OPPONENT + ' : ') + why + next;
  }
  const parts = [];
  if (res.pocketed.eight) parts.push('La noire est tombée à la casse : elle revient sur la table.');
  if (res.assigned)
    parts.push(me ? 'Vous jouez ' + groupName(res.assigned) + '.' : OPPONENT + ' joue ' + groupName(res.assigned) + ', vous ' + groupName(other(res.assigned)) + '.');
  if (res.pocketed.own.length) parts.push(by + ' rentré ' + listOf(res.pocketed.own) + '.');
  if (res.pocketed.other.length) parts.push(upper(listOf(res.pocketed.other)) + (res.pocketed.other.length > 1 ? ' sont rentrées' : ' est rentrée') + ' aussi.');
  if (res.keepsTurn) parts.push(me ? 'Rejouez.' : 'Il rejoue.');
  else if (!res.pocketed.own.length && !res.pocketed.other.length) parts.push(me ? 'Aucune bille n’est rentrée : à ' + OPPONENT + '.' : OPPONENT + ' n’a rien rentré : à vous.');
  else parts.push(me ? 'À ' + OPPONENT + ' de jouer.' : 'À vous de jouer.');
  return parts.join(' ');
}
async function animate(shot, res) {
  view.state.preview = null;
  view.state.rings = [];
  view.state.hover = null;
  view.state.headLine = false;
  view.state.cue = { angle: shot.angle, pull: 0.03, alpha: 1 };
  await view.stroke(shot.angle, shot.power);
  await view.play(res.sim);
}
async function shoot() {
  if (blocked() || placing) return;
  busy = true;
  const shot = { ...shotOf(), ...(game.ballInHand && hand && { place: { x: hand.x, y: hand.y } }) },
    res = E.play(game, shot, true);
  if (!res) {
    busy = false;
    placing = true;
    window.Sound?.play('bad');
    render('La blanche ne tient pas à cette place : cliquez sur le tapis pour la poser ailleurs.');
    return;
  }
  controls();
  Kit.say('La blanche part…');
  const win = res.over?.winner === 'player';
  const saved = save().then((ok) => {
    if (ok && win) GG.track('billard', 'won');
    return ok;
  });
  await Promise.all([saved, animate(shot, res)]);
  busy = false;
  if (res.over) return end(res, 'player');
  if (game.turn === 'player') newTurn(report(res, 'player'));
  else {
    render(report(res, 'player'));
    await pause(PACE.mine);
    opponent();
  }
}
// René plays by himself, slowly enough to follow: he thinks, turns his cue, waits, shoots, and the result
// stays on the line for a while. While the rules or a dialog are open, he waits.
const PACE = { mine: 4500, read: 2400, think: 1500, place: 1300, turn: 1300, settle: 700 };
async function pause(ms) {
  await view.wait(ms);
  while (Kit.isOpen() && !stale) await view.wait(300);
}
let lastCpuAngle = Math.PI;
async function opponent() {
  if (busy || stale || over() || game.turn !== 'cpu') return;
  busy = true;
  controls();
  view.state.preview = null;
  view.state.rings = [];
  view.state.hover = null;
  view.state.cue = null;
  view.state.balls = game.balls.filter((b) => b.id !== 0 || !game.ballInHand);
  view.draw();
  let said = 'À vous de jouer.';
  while (!over() && game.turn === 'cpu' && !stale) {
    Kit.say(OPPONENT + ' réfléchit…');
    await pause(PACE.think);
    const shot = E.cpuShot(game);
    if (shot.place) {
      view.state.balls = [...game.balls.filter((b) => b.id !== 0), { id: 0, ...shot.place, q: [1, 0, 0, 0] }];
      Kit.say(OPPONENT + ' pose la blanche.');
      view.draw();
      await pause(PACE.place);
    }
    await view.turnCue(lastCpuAngle, shot.angle, PACE.turn);
    lastCpuAngle = shot.angle;
    await pause(PACE.settle);
    const res = E.play(game, shot, true);
    const saved = save().then((ok) => {
      if (ok && res.over?.winner === 'player') GG.track('billard', 'won');
      return ok;
    });
    await Promise.all([saved, animate(shot, res)]);
    panels();
    if (res.over) {
      busy = false;
      return end(res, 'cpu');
    }
    said = report(res, 'cpu');
    Kit.say(said);
    if (game.turn === 'cpu') await pause(PACE.read);
  }
  busy = false;
  if (!stale && myTurn()) newTurn(said);
}

// ---------- The end of a game ----------
function end(res, shooter) {
  panels();
  controls();
  preview();
  const o = game.over,
    won = o.winner === 'player',
    me = shooter === 'player',
    how = res.foul === 'scratch'
      ? 'mais la blanche est tombée aussi.'
      : res.foul === 'miss'
        ? 'mais la blanche n’avait touché aucune bille.'
        : 'mais la blanche a d’abord touché ' + ballName(res.sim.firstHit) + '.';
  const why = {
    win: me ? 'Vous avez rentré la noire après vos sept billes.' : OPPONENT + ' a rentré la noire après ses sept billes.',
    '8-early': me ? 'La noire est tombée avant la fin de vos billes.' : OPPONENT + ' a fait tomber la noire trop tôt.',
    '8-foul': (me ? 'Vous avez rentré la noire, ' : OPPONENT + ' a rentré la noire, ') + how
  }[o.reason] ?? '';
  if (won) {
    const ribbon = $('ribbon');
    ribbon.textContent = 'Bravo !';
    ribbon.classList.remove('on');
    void ribbon.offsetWidth;
    ribbon.classList.add('on');
    confetti();
  }
  window.Sound?.play(won ? 'win' : 'lose');
  Kit.say(won ? 'Vous avez gagné la partie : bravo !' : OPPONENT + ' a gagné la partie.');
  // The result waits for its game: it never opens over another dialog, the rules or a new game.
  const shown = game;
  clearTimeout(endTimer);
  const open = () => {
    if (shown !== game || !game.over || stale) return;
    if (Kit.isOpen()) {
      endTimer = setTimeout(open, 300);
      return;
    }
    Kit.dialog(won ? 'Vous avez gagné !' : OPPONENT + ' a gagné', why + (won ? '' : ' Une revanche ?'), [
      ['Nouvelle partie', choose, true],
      ['Revoir la table', null]
    ]);
  };
  endTimer = setTimeout(open, won && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 1600 : 300);
}
let endTimer = 0;
function confetti() {
  const box = $('confetti');
  box.innerHTML = Array.from({ length: 46 }, (_, i) => `<i style="left:${(i * 37) % 100}%;animation-delay:${(i % 9) * 0.07}s"></i>`).join('');
  setTimeout(() => (box.innerHTML = ''), 2600);
}

// ---------- Games ----------
async function start(level) {
  if (stale || busy) return;
  clearTimeout(endTimer);
  game = E.fresh(level, game?.wins || 0, newSeed());
  lastCpuAngle = Math.PI;
  newTurn(BREAK);
  if (await save()) GG.track('billard', 'start');
}
function choose() {
  if (busy && game?.turn === 'cpu') {
    Kit.say(OPPONENT + ' joue. Attendez la fin de son coup.');
    return;
  }
  if (!busy && !stale) Kit.chooseLevel(game?.level, !over(), start);
}
async function back() {
  if (!game || busy || stale || Kit.isOpen() || !E.undo(game)) return;
  clearTimeout(endTimer);
  busy = true;
  await save();
  busy = false;
  newTurn('Votre dernier coup est annulé.');
}
function hint() {
  if (blocked()) return;
  placing = false;
  const h = E.hint(game);
  if (h.place) hand = { x: h.place.x, y: h.place.y };
  aim = { angle: h.angle, power: h.power, spin: 0 };
  const rings = [];
  const target = game.balls.find((b) => b.id === h.target);
  if (target) rings.push({ x: target.x, y: target.y });
  const pocket = T.pockets.find((p) => p.id === h.pocket);
  if (pocket) rings.push({ x: pocket.x, y: pocket.y, r: (pocket.mouth ?? 0.12) * 0.62 });
  view.state.rings = rings;
  render(h.reason);
}

function init() {
  drawGuide(T);
  view = createTable(document.querySelector('canvas'), T);
  const canvas = document.querySelector('canvas');
  canvas.addEventListener('pointerdown', click);
  canvas.addEventListener('pointermove', hover);
  canvas.addEventListener('pointerleave', () => {
    view.state.hover = null;
    view.state.hand = null;
    view.draw();
  });
  // For the tests: where a ball is drawn, in css pixels of the canvas.
  canvas.ballAt = (id) => {
    const b = view.state.balls.find((x) => x.id === id);
    return b && view.toScreen(b.x, b.y);
  };
  holdable($('turnLeft'), () => turn(-1));
  holdable($('turnRight'), () => turn(1));
  $('weaker').onclick = () => {
    if (blocked()) return;
    aim.power = Math.max(1, Math.round(aim.power) - 1);
    render();
  };
  $('stronger').onclick = () => {
    if (blocked()) return;
    aim.power = Math.min(10, Math.round(aim.power) + 1);
    render();
  };
  $('spinDown').onclick = () => {
    if (blocked()) return;
    aim.spin = Math.max(-1, aim.spin - 1);
    render(aim.spin < 0 ? 'Rétro : après le choc, la blanche revient en arrière.' : 'Au centre : après un choc bien plein, la blanche s’arrête presque.');
  };
  $('spinUp').onclick = () => {
    if (blocked()) return;
    aim.spin = Math.min(1, aim.spin + 1);
    render(aim.spin > 0 ? 'Coulé : après le choc, la blanche suit la bille.' : 'Au centre : après un choc bien plein, la blanche s’arrête presque.');
  };
  $('place').onclick = () => {
    if (blocked()) return;
    placing = !placing;
    render(placing ? 'Cliquez sur le tapis, là où vous voulez poser la blanche.' : 'La blanche reste ici. Visez, puis cliquez sur « Tirer ».');
  };
  $('shoot').onclick = shoot;
  $('hintBtn').onclick = hint;
  $('undoBtn').onclick = back;
  $('newBtn').onclick = choose;
  $('helpBtn').onclick = () => {
    Kit.openHelp();
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (placing && !Kit.isOpen()) {
        placing = false;
        render('La blanche reste à sa place.');
      } else Kit.escape();
    }
    if (Kit.isOpen() || e.target.closest?.('button')) return;
    if (e.key === 'ArrowLeft') turn(-1);
    if (e.key === 'ArrowRight') turn(1);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      back();
    }
  });
  const raw = GG.load('billard');
  if (!raw) {
    Kit.firstVisit(start);
    return;
  }
  game = E.restore(raw, newSeed());
  if (over()) {
    render('La partie est terminée. Cliquez sur « Nouvelle partie » pour rejouer.');
  } else if (game.turn === 'cpu') {
    render('C’est au tour de ' + OPPONENT + '.');
    pause(PACE.read).then(opponent);
  } else newTurn(game.shots ? 'À vous de jouer.' : BREAK);
}
init();
