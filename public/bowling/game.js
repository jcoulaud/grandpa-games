import {
  fresh,
  restore,
  defaults,
  pinsFor,
  sheet,
  play,
  undo,
  hint,
  clamp,
  trajectory,
  arrival
} from './engine.js';
import { createScene } from './scene.js';
const $ = (id) => document.getElementById(id),
  canvas = document.querySelector('canvas');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
let game,
  view,
  shot,
  stale = false,
  busy = false;
addEventListener('gg-stale', () => {
  stale = true;
});
const blocked = () => busy || stale || !game || Kit.isOpen() || sheet(game).done;
const THROW = 'cliquez sur « Lancer la boule ».',
  OVER = 'La partie est terminée : cliquez sur « Nouvelle partie ».';
// What he does next, said at the end of each line of his turn.
function next(s = sheet(game)) {
  if (s.done) return OVER;
  const which = ['Premier', 'Deuxième', 'Troisième'][s.roll] + ' lancer : ';
  return which + (s.freshRack ? THROW : 'visez les quilles debout, puis ' + THROW);
}
// A throw he set himself, or the hint's: « Lancer la boule » is the next thing to press. His own setting
// also stops the automatic hint of Facile, so it never replaces his throw.
function chosen(his) {
  $('shoot').dataset.nudge = '';
  if (his) $('hintBtn').dataset.auto = 'no';
  else delete $('hintBtn').dataset.auto;
  Kit.point($('shoot'));
}
// Why each grey button is grey: the kit says it when he clicks one.
function why(text) {
  for (const b of document.querySelectorAll('#console button,#undoBtn,#hintBtn')) {
    if (!b.disabled) delete b.dataset.why;
    else b.dataset.why = b.id === 'undoBtn' && !game.throws.length ? 'Il n’y a pas encore de coup à annuler.' : text;
  }
}
async function save() {
  const s = sheet(game),
    summary =
      (s.done ? 'Partie terminée' : 'Partie en cours, tour ' + (s.next + 1) + ' sur 10') +
      ' · ' +
      game.wins +
      (game.wins === 1 ? ' victoire' : ' victoires');
  const ok = await GG.save('bowling', game, { summary });
  if (!ok && !stale) Kit.say('La partie ne peut pas être enregistrée sur cet appareil.');
  return ok;
}
function preview(choice = shot) {
  [...$('segments').children].forEach((segment, i) => segment.classList.toggle('on', i < choice.speed));
  $('meter').querySelector('span').textContent = choice.speed + ' sur 10';
  const curve = choice.curve;
  [...$('curveSegments').children].forEach((cell, i) => {
    const offset = i - 3;
    cell.classList.toggle('on', offset !== 0 && Math.sign(offset) === Math.sign(curve) && Math.abs(offset) <= Math.abs(curve));
  });
  // The aim and the start, from the middle of the lane, in boards: 39 boards between the gutters.
  // The meters say « 6 à droite » so they keep one line; the message line says « planches ».
  const off = Math.round(choice.aim - 20);
  $('aimMark').style.left = ((onLane(choice.aim) - 0.5) / 39) * 100 + '%';
  const start = choice.start ?? 20,
    from = Math.round(start - 20);
  $('startMark').style.left = ((onLane(start) - 0.5) / 39) * 100 + '%';
  $('startLabel').textContent =
    from === 0 ? 'Au milieu' : Math.abs(from) + (from < 0 ? ' à gauche' : ' à droite');
  $('aimLabel').textContent =
    arrival(trajectory(choice, game.level)) === null ? 'Dans la rigole' : off === 0 ? 'Au milieu' : Math.abs(off) + (off < 0 ? ' à gauche' : ' à droite');
  $('curveLabel').textContent = curve === 0 ? 'Tout droit' :
    ['', 'Un peu vers', 'Vers', 'Fort vers'][Math.abs(curve)] + (curve < 0 ? ' la gauche' : ' la droite');
  view.aim(pinsFor(game), choice, game.level);
}
// The aim stays on the 39 boards of the lane, so each press of ◀ or ▶ moves the mark he sees.
// Only a curve that carries the ball off the boards sends it into the gutter.
const onLane = (aim) => clamp(aim, 1, 39);
// « 6 planches à droite », for the message line.
function spoken(board, middle, before = '') {
  const n = Math.round(board - 20);
  return n === 0 ? middle : before + Math.abs(n) + (Math.abs(n) > 1 ? ' planches' : ' planche') + (n < 0 ? ' à gauche' : ' à droite');
}
// The ball would leave the boards before the pins with this start, aim and curve.
const gutterWarning = () =>
  arrival(trajectory(shot, game.level)) === null ? 'Ainsi, la boule tombe dans la rigole avant les quilles : changez le départ ou la courbe.' : null;
function pinPlan(pins) {
  for (const pin of $('pins').querySelectorAll('.pin'))
    pin.classList.toggle('down', !pins.some((p) => p.id === +pin.dataset.pin));
}
// The score sheet goes where it fits, measured in page pixels so the size buttons count: first in the
// right column above the panel, else above the lane, in one row, or in two rows when its totals need
// the width. The card closes up when it is too tall.
function fitLayout() {
  const root = document.documentElement;
  root.classList.remove('sheet-top', 'sheet-rows', 'card-tight');
  if (innerWidth < 700) return;
  const table = $('table').getBoundingClientRect(),
    panel = $('console').getBoundingClientRect();
  if (panel.bottom > table.bottom + 1 || panel.right > table.right + 1) root.classList.add('sheet-top');
  const crowded = () =>
    [...$('strip').querySelectorAll('.frame b, .boxes i')].some((e) => e.scrollWidth > e.clientWidth + 1);
  if ((root.classList.contains('sheet-top') || root.classList.contains('short')) && crowded()) root.classList.add('sheet-rows');
  // The card closes up its score box, as in a low window, when it is too tall for the table.
  if ($('card').getBoundingClientRect().bottom > table.bottom + 1) root.classList.add('card-tight');
}
function render(msg, previous) {
  // Every throw starts from the same settings: the middle, straight, force 6.
  shot = defaults();
  const s = sheet(game),
    frame = Math.min(10, s.next + 1);
  $('tour').textContent = 'Tour ' + frame + ' sur 10';
  $('roll').textContent = s.done ? 'Terminé' : ['1er lancer', '2e lancer', '3e lancer'][s.roll];
  $('score').textContent = s.total;
  $('goal').textContent = game.goal;
  $('toGoal').firstChild.style.width = Math.min(100, (100 * s.total) / game.goal) + '%';
  $('toGoal').classList.toggle('won', s.total >= game.goal);
  $('strip').innerHTML =
    s.frames
      .map((f, i) => {
        const boxes = Array.from({ length: i === 9 ? 3 : 2 }, (_, j) => {
          const mark = f.marks[j] ?? '';
          return '<i class="' + (['X', '/'].includes(mark) ? 'bonus' : '') + '">' + mark + '</i>';
        }).join('');
        return (
          '<div class="frame ' +
          (s.next === i ? 'current' : '') +
          '"><span class="label">' +
          (i + 1) +
          '</span><div class="boxes">' +
          boxes +
          '</div><b>' +
          (f.total ?? '') +
          '</b></div>'
        );
      })
      .join('') +
    '<div class="frame"><span class="label">Total</span><b id="total">' +
    s.total +
    '</b></div>';
  const total = $('total');
  if (previous !== undefined && s.total > previous && !reduced()) {
    const start = performance.now();
    function count(now) {
      const k = Math.min(1, (now - start) / 450);
      total.textContent = Math.round(previous + (s.total - previous) * k);
      if (k < 1 && total.isConnected) requestAnimationFrame(count);
    }
    count(start);
  }
  pinPlan(pinsFor(game));
  $('undoBtn').disabled = !game.throws.length;
  $('hintBtn').disabled = s.done;
  $('shoot').textContent = s.done ? 'Voir le résultat' : 'Lancer la boule';
  for (const b of $('console').querySelectorAll('button')) b.disabled = s.done && b.id !== 'shoot';
  why(OVER);
  delete $('shoot').dataset.nudge;
  delete $('hintBtn').dataset.auto;
  Kit.showLevel(game.level);
  Kit.showWins(game.wins);
  Kit.gameOver(s.done);
  preview();
  Kit.say(msg || (s.done ? OVER : game.throws.length ? next(s) : 'Réglez votre lancer à droite, puis ' + THROW));
  fitLayout();
  // The coach of his first game: the throw as it is set is a fine first try.
  if (!s.done) Kit.point($('shoot'));
}
function message(result) {
  if (result.gutter) return 'La boule est tombée dans la rigole.';
  const n = result.count,
    ids = result.standing.map((p) => p.id);
  // Many pins: their count only, so the next step still fits on the line; the plan shows which ones.
  const left =
    ids.length === 1
      ? ' Il reste la quille ' + ids[0] + '.'
      : ids.length > 4
        ? ' Il reste ' + ids.length + ' quilles.'
        : ids.length > 1
          ? ' Il reste les quilles ' + ids.slice(0, -1).join(', ') + ' et ' + ids.at(-1) + '.'
          : '';
  if (!n && ids.length === 10) return 'Aucune quille n’est tombée. Les dix quilles sont encore debout.';
  return 'Vous avez fait tomber ' + n + (n > 1 ? ' quilles.' : ' quille.') + left;
}
function celebrate(mark) {
  if (reduced() || !['X', '/'].includes(mark)) return;
  const ribbon = $('ribbon');
  ribbon.textContent = mark === 'X' ? 'Strike !' : 'Spare !';
  ribbon.classList.add('on');
  if (mark === 'X')
    for (let i = 0; i < 32; i++) {
      const bit = document.createElement('i');
      bit.style.left = ((i * 37) % 100) + '%';
      bit.style.animationDelay = -(i % 9) * 0.035 + 's';
      $('confetti').append(bit);
    }
  setTimeout(() => {
    ribbon.classList.remove('on');
    $('confetti').replaceChildren();
  }, 1600);
}
function end() {
  const s = sheet(game);
  Kit.dialog(
    s.total >= game.goal ? 'Bravo, vous avez gagné !' : 'Partie terminée',
    'Score : ' + s.total + ' points\nPour gagner : ' + game.goal + ' points',
    [
      ['Nouvelle partie', choose, true],
      ['Retour aux jeux', Kit.home]
    ],
    s.total >= game.goal
  );
}
async function shoot() {
  if (busy || stale || Kit.isOpen()) return;
  const before = sheet(game);
  if (before.done) {
    end();
    return;
  }
  busy = true;
  const result = play(game, shot, true),
    s = sheet(game),
    mark = s.frames[before.next].marks.at(-1);
  for (const b of document.querySelectorAll('#console button,#undoBtn,#hintBtn')) b.disabled = true;
  why('La boule roule, attendez.');
  Kit.say('La boule roule…');
  window.Sound?.play('roll');
  const won = s.done && s.total >= game.goal && !game.reported;
  if (won) game.reported = true;
  const write = save().then((ok) => {
    if (ok && !stale && won) GG.track('bowling', 'won');
    return ok;
  });
  const announce = () => {
    if (!stale) {
      Kit.say(message(result));
      pinPlan(result.standing);
      if (['X', '/'].includes(mark)) window.Sound?.play('good');
      celebrate(mark);
    }
  };
  const [ok] = await Promise.all([write, view.animate(result, announce, pinsFor(game), s.freshRack && !s.done)]);
  busy = false;
  if (stale) return;
  render(ok ? message(result) + ' ' + next(s) : 'La partie ne peut pas être enregistrée sur cet appareil.', before.total);
  if (s.done && ok) {
    window.Sound?.play(s.total >= game.goal ? 'win' : 'lose');
    end();
  }
}
async function start(level) {
  if (busy || stale) return;
  busy = true;
  game = fresh(level, game?.wins || 0, seed());
  shot = defaults();
  render();
  if (await save()) GG.track('bowling', 'start');
  busy = false;
}
function choose() {
  if (!busy && !stale) Kit.chooseLevel(game.level, !sheet(game).done, start);
}
async function back() {
  if (busy || stale || Kit.isOpen() || !undo(game)) return;
  busy = true;
  render('Votre dernier coup est annulé. ' + next());
  await save();
  busy = false;
}
function init() {
  new ResizeObserver(() => game && fitLayout()).observe($('table'));
  try {
    view = createScene(canvas);
  } catch {
    Kit.dialog(
      'La piste ne peut pas s’afficher',
      'Pour jouer, activez l’accélération graphique dans Edge, puis rechargez la page.',
      [['Retour aux jeux', Kit.home, true]]
    );
    return;
  }
  canvas.ballAt = view.ballAt;
  for (const ids of [[7, 8, 9, 10], [4, 5, 6], [2, 3], [1]]) {
    const row = document.createElement('div');
    row.className = 'pinrow';
    $('pins').append(row);
    for (const id of ids) {
      // The plan only shows which pins stand: he sets his throw with the keys.
      const pin = document.createElement('span');
      pin.className = 'pin';
      pin.textContent = id;
      pin.dataset.pin = id;
      row.append(pin);
    }
  }
  for (const [id, key, by] of [
    ['left', 'aim', -1],
    ['right', 'aim', 1],
    ['slower', 'speed', -1],
    ['faster', 'speed', 1]
  ]) {
    $(id).onclick = () => {
      if (blocked()) return;
      const to = key === 'aim' ? onLane(shot.aim + by) : clamp(shot.speed + by, 1, 10);
      if (to === shot[key]) {
        window.Sound?.play('bad');
        Kit.say((key === 'aim' ? 'C’est le bord de la piste : vous ne pouvez pas viser plus loin.' : to === 10 ? 'C’est déjà la force la plus grande.' : 'C’est déjà la force la plus petite.') + ' Cliquez sur « Lancer la boule ».');
        chosen(true);
        return;
      }
      shot[key] = to;
      preview();
      Kit.say(
        key === 'aim'
          ? gutterWarning() ??
            'Vous visez ' + spoken(shot.aim, 'le milieu') + ', puis ' + THROW
          : 'Force ' + shot.speed + ' sur 10, puis ' + THROW
      );
      chosen(true);
    };
  }
  for (const [id, step] of [['curveLeft', -1], ['curveRight', 1]]) {
    $(id).onclick = () => {
      if (blocked()) return;
      shot.curve = clamp(shot.curve + step, -3, 3);
      preview();
      Kit.say(gutterWarning() ?? $('curveLabel').textContent + ', puis ' + THROW);
      chosen(true);
    };
  }
  // The start spot on the foul line, one board per press. The aim keeps its board at the pins.
  for (const [id, step] of [['startLeft', -1], ['startRight', 1]]) {
    $(id).onclick = () => {
      if (blocked()) return;
      const next = onLane((shot.start ?? 20) + step);
      if (next === shot.start) {
        window.Sound?.play('bad');
        Kit.say('C’est le bord de la piste : la boule ne peut pas partir plus loin. Cliquez sur « Lancer la boule ».');
        chosen(true);
        return;
      }
      shot.start = next;
      preview();
      Kit.say(gutterWarning() ?? 'La boule part ' + spoken(shot.start, 'du milieu', 'à ') + ', puis ' + THROW);
      chosen(true);
    };
  }
  $('hintBtn').onclick = () => {
    if (!blocked()) {
      shot = hint(game);
      preview();
      Kit.say(shot.reason.replace(' : elle est seule.', ', seule debout.').replace(/\.$/, ', puis ') + THROW);
      chosen(false);
    }
  };
  $('shoot').onclick = shoot;
  // The lane and the plan of the pins take no mouse input: a click on them says where to set the throw.
  for (const id of ['stage', 'pins'])
    $(id).addEventListener('click', () => {
      if (!game || stale || Kit.isOpen()) return;
      Kit.tell(
        busy
          ? 'La boule roule, attendez.'
          : sheet(game).done
            ? OVER
            : 'Réglez votre lancer avec les boutons à droite, puis ' + THROW
      );
    });
  $('undoBtn').onclick = back;
  $('helpBtn').onclick = () => {
    if (!busy) Kit.openHelp();
  };
  $('newBtn').onclick = choose;
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Kit.escape();
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      back();
    }
  });
  const raw = GG.load('bowling');
  if (!raw) {
    Kit.firstVisit(start);
    return;
  }
  game = restore(raw, seed());
  shot = defaults();
  const reset = game.seed !== raw.seed || game.throws.length !== raw.throws?.length || raw.v !== 1;
  render(reset ? 'Voici une nouvelle partie de bowling.' : undefined);
  if (reset) save();
  else if (sheet(game).done) end();
}
init();
