import { fresh, current, restore, play, undo, course, hint, simulate, oldLevel, oldFinished } from './engine.js';
import { createScene } from './scene.js';
const $ = (id) => document.getElementById(id);
const DRAG = 16, // a press that moves less is a click
  GRAB = 60, // the zone around the ball where a press starts a pull
  CANCEL = 26; // back this near the ball, the pull is cancelled
let game,
  view,
  target = null,
  loaded = '',
  busy = false,
  stale = false,
  press = null;
addEventListener('gg-stale', () => {
  stale = true;
});
const holes = () => course(game.level, game.seed);
const finished = () => game.rounds.length === 9 && current(game).done;
const sum = () => game.rounds.reduce((n, r) => n + r.length, 0);
const totalPar = () => holes().reduce((n, h) => n + h.par, 0);
const newSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const plural = (n, word) => n + ' ' + word + (n > 1 ? 's' : '');
// How a score compares with the par, as on the score card.
const gap = (d) => (d < 0 ? -d + ' de moins' : d ? d + ' de plus' : 'Le par');
// The strength of a shot, 0 to 1, and how far it rolls on flat turf: the pull and the buttons share it.
const distOf = (h, s) => h.reach * s ** 1.5 + 0.15;
const strengthOf = (h, d) => Math.min(1, Math.max(0, (d - 0.15) / h.reach) ** (2 / 3));
function meter(s) {
  $('force').querySelector('b').style.width = Math.round(s * 100) + '%';
}
const blocked = () => !game || busy || stale || Kit.isOpen() || current(game).done;
async function save() {
  const summary =
    (finished() ? 'Parcours terminé' : 'Trou ' + game.rounds.length + ' sur 9 en cours') +
    ' · ' +
    game.finished +
    (game.finished === 1 ? ' parcours fini' : ' parcours finis');
  const ok = await GG.save('golf', game, { summary });
  if (!ok && !stale) Kit.say('La partie ne peut pas être enregistrée sur cet appareil.');
  return ok;
}
function render(message) {
  const { h, ball, done, count } = current(game),
    key = game.level + game.seed + ':' + h.index;
  if (key !== loaded) {
    view.load(h);
    loaded = key;
  }
  target = null;
  meter(0);
  view.trace(null);
  view.pose(ball, !done, done);
  $('holeNo').textContent = h.index + 1;
  $('holeOf').textContent = 'Trou ' + (h.index + 1) + ' sur 9';
  $('courseName').textContent = h.name;
  $('par').textContent = h.par;
  $('strokes').textContent = count;
  const [numbers, inked] = $('progress').rows;
  numbers.innerHTML = holes()
    .map((_, i) => '<th' + (i === h.index ? ' class="now"' : '') + '>' + (i + 1) + '</th>')
    .join('');
  inked.innerHTML = holes()
    .map((_, i) => '<td' + (i === h.index ? ' class="now"' : '') + '>' + (i < h.index || (i === h.index && done) ? game.rounds[i].length : '') + '</td>')
    .join('');
  const shoot = $('shoot');
  shoot.disabled = !done;
  shoot.textContent = finished() ? 'Voir le résultat' : done ? 'Trou suivant' : 'Taper la balle';
  $('undoBtn').disabled = !sum();
  $('hintBtn').disabled = done;
  $('stage').classList.toggle('idle', done);
  Kit.showLevel(game.level);
  Kit.say(
    message ||
      (done
        ? 'Le trou est terminé : cliquez sur « ' + shoot.textContent + ' ».'
        : 'Tirez la balle en arrière puis lâchez, ou cliquez sur le gazon.')
  );
}
// A click on the lane: the dotted path of that shot, and the yellow button plays it.
function aim(p, advice = false) {
  if (blocked()) return;
  if (!p) {
    Kit.say('Cliquez sur le gazon, à l’intérieur des bords.');
    return;
  }
  const { h, ball } = current(game),
    shot = simulate(h, ball, p);
  target = p;
  meter(strengthOf(h, Math.hypot(p.x - ball.x, p.z - ball.z)));
  view.trace(shot, p, game.level, advice);
  $('shoot').disabled = false;
  Kit.say(
    advice
      ? shot.sunk
        ? 'Ce coup entre dans le trou : cliquez sur « Taper la balle ».'
        : 'Ce coup rapproche la balle du trou : cliquez sur « Taper la balle ».'
      : 'Cliquez sur « Taper la balle », ou sur le gazon pour changer de cible.'
  );
}

// « Moins fort » and « Plus fort »: the same direction, one tenth of the strength less or more.
function step(by) {
  if (blocked()) return;
  if (!target) {
    Kit.say('Visez d’abord : tirez la balle en arrière, ou cliquez sur le gazon.');
    return;
  }
  const { h, ball } = current(game),
    dx = target.x - ball.x,
    dz = target.z - ball.z,
    d = Math.hypot(dx, dz) || 1,
    s = Math.min(1, Math.max(0.1, Math.round((strengthOf(h, d) + by) * 10) / 10)),
    // « Plus fort » never shortens a hint aimed past the longest pull.
    reach = Math.max(distOf(h, s), by > 0 ? d : 0);
  aim({ x: ball.x + (dx / d) * reach, z: ball.z + (dz / d) * reach });
  Kit.say('Force ' + Math.round(s * 10) + ' sur 10 : cliquez sur « Taper la balle », ou changez la force.');
}

// ---------- The pull ----------
// Press on the ball (or near it), pull back as with a slingshot and let go. The longer the pull, the
// further the ball goes. Back on the ball, the pull is cancelled.
function pullOf(p) {
  const { h, ball } = current(game),
    at = view.screen(ball),
    px = Math.hypot(p.x - at.x, p.y - at.y);
  if (px < CANCEL) return null;
  const hand = view.ground(p, view.ballHeight(ball));
  if (!hand) return null;
  const dx = ball.x - hand.x,
    dz = ball.z - hand.z,
    d = Math.hypot(dx, dz) || 1,
    full = Math.max(150, Math.min(280, $('stage').clientHeight * 0.45)),
    strength = Math.min(1, (px - CANCEL) / (full - CANCEL)),
    // The longest shot crosses the hole; a short pull is a gentle putt.
    reach = distOf(h, strength);
  return { strength, target: { x: ball.x + (dx / d) * reach, z: ball.z + (dz / d) * reach } };
}
function showPull(p, pull) {
  const band = $('band'),
    stage = $('stage');
  // An SVG element has no hidden property: set the attribute.
  band.toggleAttribute('hidden', !p);
  $('force').classList.toggle('live', !!p);
  if (!p) return;
  const { ball } = current(game),
    at = view.screen(ball);
  band.setAttribute('viewBox', '0 0 ' + stage.clientWidth + ' ' + stage.clientHeight);
  const knob = band.querySelector('circle');
  for (const line of band.querySelectorAll('line')) {
    line.setAttribute('x1', at.x);
    line.setAttribute('y1', at.y);
    line.setAttribute('x2', p.x);
    line.setAttribute('y2', p.y);
  }
  knob.setAttribute('cx', p.x);
  knob.setAttribute('cy', p.y);
  band.classList.toggle('cancel', !pull);
  // The strength shows in the card beside the hole, so nothing covers the lane.
  meter(pull ? pull.strength : 0);
}
function down(e) {
  if (e.button !== 0 || blocked()) return;
  const p = view.local(e),
    at = view.screen(current(game).ball);
  press = { start: p, near: Math.hypot(p.x - at.x, p.y - at.y) <= GRAB, dragging: false, pull: null, id: e.pointerId };
  e.target.setPointerCapture(e.pointerId);
}
function move(e) {
  const p = view.local(e);
  if (!press) {
    if (!blocked()) {
      const at = view.screen(current(game).ball);
      e.target.style.cursor = Math.hypot(p.x - at.x, p.y - at.y) <= GRAB ? 'grab' : 'crosshair';
    }
    return;
  }
  if (!press.dragging) {
    if (!press.near || Math.hypot(p.x - press.start.x, p.y - press.start.y) < DRAG) return;
    press.dragging = true;
    target = null;
    $('shoot').disabled = true;
    e.target.style.cursor = 'grabbing';
  }
  const pull = pullOf(p),
    { h, ball } = current(game);
  press.pull = pull;
  view.trace(pull ? simulate(h, ball, pull.target) : null, null, game.level);
  showPull(p, pull);
  Kit.say(pull ? 'Lâchez pour taper la balle, ou revenez sur elle pour annuler.' : 'Lâchez ici pour annuler le coup.');
}
function up(e) {
  if (!press || e.pointerId !== press.id) return;
  const p = view.local(e),
    was = press;
  press = null;
  e.target.style.cursor = '';
  showPull(null);
  if (was.dragging) {
    if (!was.pull || blocked()) {
      view.trace(null);
      meter(0);
      if (!blocked()) Kit.say('Le coup est annulé : la balle n’a pas bougé.');
      return;
    }
    target = was.pull.target;
    shoot();
    return;
  }
  const at = view.screen(current(game).ball);
  if (Math.hypot(p.x - at.x, p.y - at.y) < CANCEL)
    Kit.say('Pour taper, tirez la balle vers l’arrière, ou cliquez sur le gazon.');
  else aim(view.pick(p));
}
function cancel() {
  if (!press) return;
  press = null;
  showPull(null);
  view.trace(null);
  meter(0);
}

async function start(level) {
  if (stale || busy) return;
  game = fresh(level, game?.finished || 0, newSeed());
  busy = true;
  render();
  if (await save()) GG.track('golf', 'start');
  busy = false;
}
function choose() {
  if (!busy && !stale) Kit.chooseLevel(game.level, !finished(), start);
}
// The score card: a paper card, one row per hole. Strokes are written in blue ink, circled under par and
// boxed over par, as golfers mark them.
function card(end) {
  const total = sum(),
    par = totalPar();
  Kit.dialog(
    end ? 'Parcours terminé !' : 'Carte de score',
    end
      ? (total <= par ? 'Bravo, vous avez gagné : ' : 'Bravo pour ces neuf trous : ') + plural(total, 'coup') + ' pour un par de ' + par + '.'
      : '',
    end
      ? [
          ['Revoir le terrain', null, true],
          ['Nouvelle partie', choose]
        ]
      : [['Fermer', null, true]]
  );
  const last = game.rounds.length - 1,
    kind = (d) => (d < 0 ? 'better' : d ? 'worse' : 'even');
  let parDone = 0,
    shotsDone = 0;
  const rows = holes().map((h, i) => {
    const shots = game.rounds[i]?.length ?? 0,
      done = i < last || (i === last && current(game).done),
      now = i === last && !done;
    let cls = 'later',
      ink = '',
      note = '';
    if (done) {
      parDone += h.par;
      shotsDone += shots;
      cls = kind(shots - h.par);
      ink = shots;
      note = gap(shots - h.par);
    } else if (now) {
      cls = 'now';
      ink = shots || '';
      note = 'En cours';
    }
    return (
      '<tr class="' + cls + '"><th scope="row"><span class="no">' + (i + 1) + '</span><span class="name">' + h.name +
      '</span></th><td class="n par">' + h.par + '</td><td class="n"><span class="ink">' + ink + '</span></td><td class="gap">' + note + '</td></tr>'
    );
  });
  const d = shotsDone - parDone,
    table = document.createElement('table');
  table.className = 'scores';
  table.innerHTML =
    '<caption>Niveau ' + Kit.levelNames[game.level].toLowerCase() + ' · neuf trous</caption>' +
    '<thead><tr><th scope="col">Trou</th><th scope="col" class="n">Par</th><th scope="col" class="n">Coups</th><th scope="col">Bilan</th></tr></thead><tbody>' +
    rows.join('') +
    '</tbody><tfoot><tr class="' + (parDone ? kind(d) : '') + '"><th scope="row">Total</th><td class="n par">' + par +
    '</td><td class="n"><span class="ink">' + total + '</span></td><td class="gap">' + (parDone ? gap(d) : '') + '</td></tr></tfoot>';
  $('overText').append(table);
}
async function shoot() {
  if (busy || stale) return;
  if (finished()) {
    card(true);
    return;
  }
  const { h, done } = current(game);
  if (done) {
    game.rounds.push([]);
    busy = true;
    render();
    await save();
    busy = false;
    return;
  }
  if (!target) return;
  busy = true;
  const shot = play(game, target);
  target = null;
  $('shoot').disabled = true;
  $('undoBtn').disabled = $('hintBtn').disabled = true;
  Kit.say('La balle roule…');
  const end = finished(),
    win = end && sum() <= totalPar() && !game.won;
  if (end && !game.credited) {
    game.finished++;
    game.credited = true;
  }
  if (win) game.won = true;
  // The win counts as soon as it is saved, so leaving during the animation does not lose it.
  const saved = save().then((ok) => {
    if (ok && win) GG.track('golf', 'won');
    return ok;
  });
  const [written] = await Promise.all([saved, view.animate(shot)]);
  view.remember(shot.sunk ? null : shot);
  const count = game.rounds.at(-1).length,
    away = Math.hypot(shot.end.x - h.cup.x, shot.end.z - h.cup.z);
  if (shot.sunk) {
    const ribbon = $('ribbon');
    ribbon.textContent = count === 1 ? 'Du premier coup !' : count < h.par ? 'Sous le par !' : 'Dans le trou !';
    ribbon.classList.remove('on');
    void ribbon.offsetWidth;
    ribbon.classList.add('on');
  }
  render(
    shot.sunk
      ? count === 1
        ? 'Du premier coup, dans le trou : bravo !'
        : 'Dans le trou en ' + count + ' coups, pour un par de ' + h.par + (count <= h.par ? ' : bravo !' : '.')
      : count === 8
        ? 'Après huit coups, la balle est posée dans le trou : passons au suivant.'
        : 'La balle s’arrête à ' +
          (away < 1 ? Math.max(1, Math.round(away * 100)) + ' cm' : String(Math.round(away * 10) / 10).replace('.', ',') + ' m') +
          ' du trou.'
  );
  if (written) {
    if (end) card(true);
  } else if (!stale) Kit.say('La partie ne peut pas être enregistrée sur cet appareil.');
  busy = false;
}
async function back() {
  if (!game || busy || stale || Kit.isOpen() || !undo(game)) return;
  busy = true;
  view.remember(null);
  render('Votre dernier coup est annulé.');
  await save();
  busy = false;
}
function init() {
  const canvas = document.querySelector('canvas');
  try {
    view = createScene(canvas);
  } catch {
    Kit.dialog(
      'Le terrain ne peut pas s’afficher',
      'Pour jouer, activez l’accélération graphique dans Edge, puis rechargez la page.',
      [['Retour aux jeux', Kit.home, true]]
    );
    return;
  }
  // Where the ball is drawn, in the canvas's own pixels: for the tests, which drag it like a hand would.
  canvas.ballAt = () => view.screen(current(game).ball);
  canvas.cupAt = () => view.screen(current(game).h.cup, 0);
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', cancel);
  canvas.addEventListener('lostpointercapture', cancel);
  $('hintBtn').onclick = () => {
    if (blocked()) return;
    const { h, ball } = current(game);
    aim(hint(h, ball), true);
  };
  $('undoBtn').onclick = back;
  $('weaker').onclick = () => step(-0.1);
  $('stronger').onclick = () => step(0.1);
  $('newBtn').onclick = choose;
  $('helpBtn').onclick = () => {
    if (!busy) Kit.openHelp();
  };
  $('shoot').onclick = shoot;
  $('score').onclick = () => {
    if (!busy) card(false);
  };
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (press) cancel();
      else Kit.escape();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      back();
    }
  });
  const raw = GG.load('golf');
  game = restore(raw);
  if (game) {
    render();
    if (finished()) card(true);
  } else if (oldLevel(raw)) {
    // A save from the first version, or one that no longer replays: a fresh course at the same level.
    game = fresh(oldLevel(raw), oldFinished(raw), newSeed());
    render('Voici un nouveau parcours de neuf trous.');
    save();
  } else Kit.firstVisit(start);
}
init();
