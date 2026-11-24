// Shared behaviour of every game page. Link lib/kit.css, write the page like this, then load this file:
//
//   <div id="bar">
//     <div id="title">Solitaire</div>
//     <button id="undoBtn" data-icon="undo">Annuler le dernier coup</button>   icons: undo, bulb, help, close, hand
//     <span class="spacer"></span>
//     <button id="newBtn" class="game">Nouvelle partie</button>
//   </div>
//   <div id="say"><div id="msg" aria-live="polite"></div></div>
//   <div id="table"></div>
//   <footer id="rail"><div class="zoom"></div></footer>   the credit and the size keys only: never a count of the game
//   <div id="help" data-title="Comment jouer"><section class="page">…</section>…</div>
//
// This file adds the "Jeux" button that goes back to the library, the credit in the bottom bar, the button icons, the frame and
// the page buttons of the rules guide, and the dialog. The game then calls:
//
//   Kit.say(text)                           the message line; a \n starts a second line
//   Kit.showLevel(level), Kit.showWins(n)   the level line under the name: "Niveau facile · 3 victoires"
//   Kit.dialog(title, text, [[label, fn, primary]], soft)   text: a string or a node; soft: the win sheet, with a light backdrop
//   Kit.closeDialog(), Kit.openHelp(), Kit.closeHelp()
//   Kit.isOpen()                            true while the rules or a dialog are open
//   Kit.escape()                            closes the rules or the dialog; false if nothing was open
//   Kit.icon(name)                          an icon as SVG markup; Kit.icon('hand') is the pointing hand of the rules guide
//   Kit.firstVisit(start)                   no save yet: starts a game at Facile at once, with the coach on
//   Kit.point(el, at)                       during the coach, rings el and points the hand at it until he clicks;
//                                           at: where the finger goes down el; by default .62, or its top strip when
//                                           another card covers that spot, as in a column of cards
//   Kit.coaching()                          true during the coach of his first game
//   Kit.tell(text)                          a short answer in the message line; the line before comes back after 4 s
//   Kit.gameOver(on)                        the game is over: the nudge goes to "Nouvelle partie"
//
// Every click gets an answer. A click on a greyed button says its data-why, or the line flashes and the next
// button pulses. A click on the table that changes nothing does the same (see "No silent click" below).
// The automatic hint of Facile never fires while the hint button has data-auto="no": set it while he is in
// the middle of an action (a chosen letter, a set aim), so the hint never undoes his work.
(() => {
  'use strict';
  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.4-2.7 4.3"/><path d="M12 17.6v.1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  // The pointing hand of the rules guide, drawn once in the page: Kit.icon('hand') shows it, and a picture in
  // SVG can show it with <use href="#kit-hand" width="40" height="48"/>.
  const HAND = '<path d="M15 27V7a4.5 4.5 0 0 1 9 0v12a4 4 0 0 1 7.5 1.6a4 4 0 0 1 7 2.4V33c0 8-5 13-12 13h-4c-5 0-8-2-11-6L4.5 32a4 4 0 0 1 6.3-4.6z" fill="#fff" stroke="#1B2422" stroke-width="2.6" stroke-linejoin="round"/>';
  const icon = name => name === 'hand' ? '<svg class="guide-hand" viewBox="0 0 40 48" aria-hidden="true"><use href="#kit-hand"/></svg>'
    : `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const $ = id => document.getElementById(id);
  const libRoot = new URL('../', document.currentScript.src).href;

  // Top bar: the way back to the library first, then icons on the buttons that ask for one.
  const bar = $('bar');
  // For a screen reader: the bar, the name of the game as the heading of the page, the message line,
  // and the table as the main part.
  if (bar) bar.setAttribute('role', 'banner');
  if ($('title')) { $('title').setAttribute('role', 'heading'); $('title').setAttribute('aria-level', '1'); }
  if ($('table')) $('table').setAttribute('role', 'main');
  if (bar && !$('home')) {
    // Opened from a file, the folder alone would show a list of files: name the library page.
    const home = location.protocol === 'file:' ? libRoot + 'index.html' : libRoot;
    bar.insertAdjacentHTML('afterbegin', `<a id="home" href="${home}" aria-label="Retour aux jeux">${icon('back')}Jeux</a>`);
  }
  async function home() {
    await GG.flush();
    location.href = $('home').href;
  }
  $('home')?.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    home();
  });
  // A cross at the right end of the bar, where a window has its own: some players close the whole app
  // to leave a game. This one asks first, because a slip of the hand on it must not end a game by
  // surprise; staying is the yellow choice, and Escape stays too. A dialog the game opens meanwhile,
  // such as its result, waits behind the question and shows if he stays.
  if (bar && !$('quit')) {
    bar.insertAdjacentHTML('beforeend', '<button id="quit" data-icon="close" aria-label="Fermer le jeu" title="Fermer le jeu et revenir à la liste des jeux"></button>');
    $('quit').addEventListener('click', () => {
      if (isOpen()) return;
      quitting = true;
      show('Fermer le jeu ?', 'Vous revenez à la liste des jeux.', [
        ['Continuer la partie', null, true],
        ['Retour aux jeux', () => { held = null; staleHeld = false; home(); }]
      ]);
    });
  }
  if ($('rail') && !$('rail').querySelector('.credit'))
    $('rail').insertAdjacentHTML('afterbegin', `<a class="credit" href="https://x.com/JulienCoulaud" target="_blank" rel="noopener"><img src="${libRoot}icons/julien.webp" width="34" height="34" alt=""><span>Par <b>Julien Coulaud</b></span></a>`);
  // The icons of the buttons, and of the copies of buttons in the rules guide: a copy to click (.here) also gets the hand.
  document.querySelectorAll('button[data-icon], #help [data-icon]').forEach(b => b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon)));
  document.querySelectorAll('#help .guide-btn.here').forEach(b => b.insertAdjacentHTML('beforeend', icon('hand')));
  document.body.insertAdjacentHTML('beforeend', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="kit-hand" viewBox="0 0 40 48">${HAND}</symbol></svg>`);

  // Each label stays on one line: the bar takes the long labels if they fit, else the short ones, else one
  // word each, and last, without the name of the game (its felt still tells it). At each step the win count
  // on the level line goes first, so it never makes a label shorter. A phone puts its buttons on two rows
  // instead (kit.css).
  const FITS = [[], ['fit-short'], ['fit-tiny'], ['fit-tiny', 'fit-bare']];
  function fitBar() {
    if (!bar || innerWidth < 700) return;
    const over = () => bar.scrollWidth > bar.clientWidth;
    for (const fit of FITS) for (const nowins of [false, true]) {
      bar.classList.remove('fit-nowins', 'fit-short', 'fit-tiny', 'fit-bare');
      bar.classList.add(...fit);
      if (nowins) bar.classList.add('fit-nowins');
      if (!over()) return;
    }
  }
  fitBar();
  addEventListener('resize', fitBar);
  // A game may change a label later, such as the hint during the bids: the bar fits itself again.
  if (bar) new MutationObserver(fitBar).observe(bar, { childList: true, characterData: true, subtree: true });
  if (document.fonts) document.fonts.ready.then(fitBar);

  // Message line
  // One line in the usual size. A text too long for the window takes two lines, a little smaller, in the
  // same height, so the board never moves. Only a very narrow window (a phone) lets the line grow.
  const msg = $('msg');
  const fit = () => {
    if (!msg) return;
    msg.classList.remove('long');
    // A text with a line break shows on two lines.
    if (msg.textContent.includes('\n') || msg.scrollWidth > msg.clientWidth + 1) msg.classList.add('long');
  };
  // A new text flashes once, so his eye goes to the line when it changes.
  const say = text => {
    stir();
    told = null;
    if (!msg) return;
    const changed = msg.textContent !== text;
    msg.textContent = text; fit();
    if (changed) { msg.classList.remove('flash'); void msg.offsetWidth; msg.classList.add('flash'); }
  };
  addEventListener('resize', fit);
  // A short answer to a click, such as why a button is grey. The game's own line comes back after 4 s,
  // unless the game said something new meanwhile.
  let told = null;
  function tell(text) {
    if (!msg) return;
    const before = told ? told.before : msg.textContent;
    say(text);
    const mine = told = { before, text };
    setTimeout(() => { if (told === mine && msg.textContent === text) { say(before); } }, 4000);
  }
  const flashLine = () => { if (!msg) return; msg.classList.remove('flash'); void msg.offsetWidth; msg.classList.add('flash'); };

  // Dialog
  if (!$('over')) document.body.insertAdjacentHTML('beforeend',
    '<div id="over"><div id="box" role="dialog" aria-modal="true" aria-labelledby="overTitle"><h2 id="overTitle"></h2><p id="overText"></p><div id="overBtns"></div></div></div>');
  const over = $('over');
  // The control that had the focus before a dialog or the rules opened gets it back when they close.
  let opener = null;
  const remember = () => { if (!isOpen()) opener = document.activeElement; };
  const giveBack = () => { if (!isOpen() && opener && opener.isConnected) opener.focus({ preventScroll: true }); opener = null; };
  // While he answers the close cross, a dialog from the game is held, then shown if he stays.
  let quitting = false, held = null;
  const closeDialog = () => {
    over.classList.remove('on', 'soft');
    giveBack();
    if (!quitting) return;
    quitting = false;
    // After the click: a choice to leave drops the held dialog first.
    Promise.resolve().then(() => { const h = held; held = null; staleHeld = false; if (h) show(...h); });
  };
  // A held « Le jeu a changé ailleurs » keeps its place: a result that comes after it must not hide it.
  let staleHeld = false;
  const dialog = (...args) => {
    if (!quitting) show(...args);
    else if (!staleHeld) held = args;
  };
  function show(title, text, buttons, soft) {
    remember();
    $('overTitle').textContent = title;
    // The text is a string, or a page element such as the golf score card.
    if (typeof text === 'string') $('overText').textContent = text;
    else $('overText').replaceChildren(text);
    const b = $('overBtns'); b.innerHTML = '';
    let first = null;
    buttons.forEach(([label, fn, primary, note]) => {
      const e = document.createElement('button');
      e.textContent = label; if (primary) { e.className = 'primary'; first = first || e; }
      // A line under the label says what the choice means. It is drawn by the style sheet, so the
      // text of the button stays its label.
      // The label stays its name for a screen reader; the line is read as its description.
      // Leaving the game looks like the cross of the bar: dark, with the cross, and it says it closes the game.
      if (label === 'Retour aux jeux') { e.textContent = 'Fermer le jeu'; e.className = 'leave'; e.insertAdjacentHTML('afterbegin', icon('close')); }
      if (note) { e.classList.add('choice'); e.dataset.note = note; e.setAttribute('aria-label', label); e.setAttribute('aria-description', note); }
      e.onclick = () => { closeDialog(); if (fn) fn(); };
      b.appendChild(e);
    });
    $('box').classList.remove('levels'); $('overText').classList.remove('warn');
    over.classList.toggle('soft', !!soft);
    over.classList.add('on');
    (first || b.firstChild).focus();
  }

  // The key 'fort' shows as "Difficile". Keep the key: the saves on his PC hold it.
  const levelNames = { facile: 'Facile', moyen: 'Moyen', fort: 'Difficile' };
  const levelNotes = { facile: 'Pour commencer en douceur', moyen: 'Un peu plus de réflexion', fort: 'Pour les joueurs habitués' };
  // The level is said under the name of the game, on the left of the bar, with the count of wins after it:
  // "Niveau facile · 3 victoires". The "Nouvelle partie" button only says what it does.
  function levelLine() {
    if (!$('level')) {
      const title = $('title');
      const name = [...title.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      const box = document.createElement('span'); box.className = 'name';
      box.innerHTML = '<span></span><small id="level"><span id="levelName"></span><span id="wins"></span></small>';
      box.firstChild.textContent = name.map(n => n.textContent.trim()).join(' ');
      name.forEach(n => n.remove());
      title.appendChild(box);
    }
    return $('level');
  }
  function showLevel(level) {
    shownLevel = level;
    PH.register({ level });
    levelLine();
    $('levelName').textContent = 'Niveau ' + levelNames[level].toLowerCase();
    fitBar();
  }
  // n: the games won at any level. Nothing shows for 0.
  function showWins(n) {
    levelLine();
    const text = n > 0 ? (n === 1 ? '1 victoire' : `${n} victoires`) : '';
    if ($('wins').textContent === text) return;
    $('wins').textContent = text;
    fitBar();
  }
  // The levels, one under the other, each with a line that says what it means. During a game the safe
  // choice comes first and is yellow: "Continuer la partie". Otherwise the last level played is yellow,
  // or Facile the first time.
  function chooseLevel(level, playing, start) {
    const levels = Object.entries(levelNames).map(([key, label]) =>
      [label, () => start(key), !playing && key === (level || 'facile'), levelNotes[key]]);
    const buttons = playing ? [['Continuer la partie', null, true], ...levels]
      : [...levels, level ? ['Continuer la partie', null] : ['Retour aux jeux', home]]; // shown as "Fermer le jeu"
    dialog('Nouvelle partie', playing ? 'Attention : la partie en cours sera effacée si vous choisissez un niveau.'
      : 'Choisissez le niveau de difficulté.', buttons);
    $('box').classList.add('levels');
    $('overText').classList.toggle('warn', playing);
  }

  // Rules guide: short pages, so they never need scrolling. "Fermer" works from every page.
  const help = $('help');
  let pages = [], at = 0;
  if (help) {
    const sections = help.innerHTML;
    help.innerHTML = `<div id="helpBox" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
      <div class="head"><h2 id="helpTitle"></h2><button id="helpClose">${icon('close')}Fermer</button></div>
      <div id="helpText" tabindex="-1" role="region" aria-labelledby="helpTopic">${sections}</div>
      <div class="end"><button id="helpPrev">Précédent</button><span id="helpPage" aria-hidden="true"></span><button id="helpNext" class="primary">Suivant</button></div>
      <span id="helpStatus" class="sr" role="status"></span>
    </div>`;
    $('helpTitle').textContent = help.dataset.title || 'Comment jouer';
    pages = [...help.querySelectorAll('#helpText .page')];
    $('helpClose').onclick = () => closeHelp();
    $('helpPrev').onclick = () => showPage(Math.max(0, at - 1));
    $('helpNext').onclick = () => at < pages.length - 1 ? showPage(at + 1) : closeHelp();
    help.addEventListener('click', e => { if (e.target === help) closeHelp(); });
  }
  function showPage(n) {
    at = n;
    pages.forEach((page, k) => {
      const active = k === n;
      page.classList.toggle('on', active);
      page.querySelector('h3').id = active ? 'helpTopic' : '';
    });
    const count = `Page ${n + 1} sur ${pages.length}`;
    $('helpPage').textContent = count;
    $('helpStatus').textContent = `${count}. ${$('helpTopic').textContent}`;
    $('helpPrev').hidden = n === 0;
    const next = $('helpNext');
    next.textContent = n === pages.length - 1 ? "J'ai compris" : 'Suivant';
    next.focus();
    $('helpText').scrollTop = 0;
  }
  function openHelp() {
    if (!help) return;
    remember(); help.classList.add('on'); showPage(0);
    PH.capture('rules guide opened', { first_visit: false });
  }
  // The first visit starts a game at Facile at once: he learns on the real table, with the coach. The rules
  // guide stays one click away, on "Règles".
  function firstVisit(start) {
    coaching = true; coachStarts = 0; coachSteps = 0;
    PH.capture('first visit', { coach: true });
    const size = () => { const t = $('table'); return t ? t.clientWidth + 'x' + t.clientHeight : ''; };
    start('facile');
    const before = size();
    // The level line appears under the name and the bar may change height after the start, without a resize:
    // a game that lays out from the size of its table measures again, only when the table did change size.
    let seen = before;
    const check = () => { const now = size(); if (now !== seen) { seen = now; dispatchEvent(new Event('resize')); } };
    requestAnimationFrame(check);
    setTimeout(check, 400);
  }
  function closeHelp() {
    if (!helpOpen()) return;
    PH.capture('rules guide closed', { page: at + 1, pages: pages.length, read_all: at === pages.length - 1 });
    help.classList.remove('on');
    giveBack();
  }
  const helpOpen = () => !!help && help.classList.contains('on');
  const isOpen = () => over.classList.contains('on') || helpOpen();
  function escape() {
    if (helpOpen()) { closeHelp(); return true; }
    if (over.classList.contains('on')) { closeDialog(); return true; }
    return false;
  }

  // Keep Tab inside the dialog. In a short window, include the scrollable rules.
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const box = over.classList.contains('on') ? $('box') : $('helpBox');
    const items = [...box.querySelectorAll('button, a[href], #helpText')].filter(e =>
      e.id === 'helpText' ? e.scrollHeight > e.clientHeight : !e.hidden && !e.disabled);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  }, true);

  // The nudge. When he has done nothing for a while on his turn, the next thing to press breathes with a
  // gold ring: a button the game marks with data-nudge (such as "Manche suivante"), else the hint button.
  // The wait depends on the level. At Facile, the hint then shows by itself, once, unless the hint button
  // has data-auto="no" because its hint plays the move for him (the sudoku fills a cell).
  // During the coach of his first game, the nudge comes after 4 s and the hint after 10 s.
  const NUDGE = { facile: [15, 40], moyen: [30, 0], fort: [60, 0] }, COACH = [4, 10];
  let shownLevel = null, idle = 0, nudged = null, autoDone = false;
  function stir() {
    idle = 0;
    if (nudged) { nudged.classList.remove('nudge'); if (pointed === nudged) unpoint(); nudged = null; }
  }

  // The coach of the first game. Kit.point(el) rings the real thing to click and points the white hand of the
  // rules guide at it, until his next click. The kit also points the hand at the nudged button. The coach ends
  // after his first 8 actions, a new game or a win.
  const COACH_STEPS = 8;
  let coaching = false, coachStarts = 0, coachSteps = 0, pointed = null, pointAt = .62, hand = null;
  function point(el, at) {
    unpoint();
    if (!coaching || !el || !el.isConnected) return;
    if (at === undefined) {
      const r = el.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * .62);
      at = !top || el.contains(top) ? .62 : Math.min(.12, 22 / Math.max(r.height, 1));
    }
    pointed = el; pointAt = at;
    el.classList.add('coach');
    if (!hand) {
      document.body.insertAdjacentHTML('beforeend', `<div id="coachHand" aria-hidden="true">${icon('hand')}</div>`);
      hand = $('coachHand');
    }
    hand.hidden = false;
    if (!placing) place();
  }
  function unpoint() {
    if (pointed) pointed.classList.remove('coach');
    pointed = null;
    if (hand) hand.hidden = true;
  }
  // The hand follows the element, under it, its finger on the lower half. The page may be zoomed (lib/zoom.js).
  // One loop of frames at a time, however often the game points.
  let placing = false;
  function place() {
    placing = false;
    if (!pointed || !hand || hand.hidden) return;
    if (!pointed.isConnected || pointed.offsetParent === null) { unpoint(); return; }
    // A game that draws again may reset the classes of the element: the ring comes back.
    if (!pointed.classList.contains('coach')) pointed.classList.add('coach');
    const z = window.Zoom ? Zoom.z() : 1, r = pointed.getBoundingClientRect();
    const x = (r.left + r.width / 2) / z, y = (r.top + Math.min(r.height * pointAt, r.height - 6)) / z;
    const bottom = innerHeight / z - 70;
    hand.style.left = `${x - 22}px`;
    hand.style.top = `${Math.min(y, bottom)}px`;
    placing = true;
    requestAnimationFrame(place);
  }
  function endCoach() { coaching = false; unpoint(); }
  addEventListener('gg-track', e => {
    if (e.detail.kind === 'start') { gameOver(false); if (coaching && ++coachStarts > 1) endCoach(); }
    else endCoach();
  });
  addEventListener('pointerdown', e => {
    if (!e.isTrusted || !coaching) return;
    unpoint();
    if (e.target.closest && e.target.closest('#table, #bar button, #over button') && ++coachSteps >= COACH_STEPS) endCoach();
  }, true);

  // An undo, from the bar or from a result dialog, takes the game back into play: the end-of-game mark goes.
  addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#undoBtn, #overBtns button');
    if (b && (b.id === 'undoBtn' || /^Annuler/.test(b.textContent.trim()))) gameOver(false);
  }, true);
  // The game is over: "Nouvelle partie" becomes the next thing to press.
  function gameOver(on) {
    const b = $('newBtn');
    if (!b) return;
    if (on) b.dataset.nudge = ''; else delete b.dataset.nudge;
  }
  const visible = e => e && !e.disabled && !e.hidden && e.offsetParent !== null;
  function nudgeTarget() {
    // A button of the game, such as "Partie suivante", comes before "Nouvelle partie" of Kit.gameOver.
    const marked = [...document.querySelectorAll('[data-nudge]')].filter(visible);
    const hint = $('hintBtn');
    // "Nouvelle partie" of Kit.gameOver waits while the hint can still help: after an undo, the game goes on.
    const game = marked.find(e => e.id !== 'newBtn');
    if (game) return game;
    if (visible(hint)) return hint;
    return marked[0] || null;
  }
  function tick() {
    if (document.hidden || isOpen() || ($('table') && $('table').hidden)) { stir(); return; }
    idle++;
    const [pulse, auto] = coaching ? COACH : NUDGE[shownLevel] || NUDGE.moyen;
    const target = nudgeTarget();
    if (!target) { stir(); return; }
    if (idle >= pulse && target !== nudged) nudge(target);
    if (coaching && nudged && !pointed) point(nudged);
    if (auto && idle >= auto && !autoDone && target.id === 'hintBtn' && target.dataset.auto !== 'no' && !target.disabled) {
      autoDone = true;
      target.click();
    }
  }
  function nudge(target) {
    if (nudged) nudged.classList.remove('nudge');
    target.classList.add('nudge');
    nudged = target;
    PH.capture('nudge shown', { button: target.id || target.textContent.trim().slice(0, 40) });
  }
  setInterval(tick, 1000);

  // No silent click. A click on a greyed button says why (its data-why), else the message line flashes and the
  // next button pulses at once. A click on the table that changes nothing on the page within 0.45 s gets the
  // same answer. The canvas of the skill games draws without changing the page, so the games answer those
  // clicks themselves. Each silent click is counted, so the admin can see where he gets lost.
  const label = e => (e.id || e.getAttribute('aria-label') || e.textContent.trim()).slice(0, 40);
  function answer(why) {
    if (why) tell(why); else flashLine();
    const target = nudgeTarget();
    if (target) { idle = 0; nudge(target); }
  }
  // The second click of a double-click is not a silent click: the games ignore it on purpose.
  let watch = null, lastDown = { t: 0, x: 0, y: 0 };
  addEventListener('pointerdown', e => {
    if (!e.isTrusted || e.button !== 0 || isOpen()) return;
    const table = $('table');
    if (!table || !table.contains(e.target) || e.target.closest('canvas')) return;
    const again = e.timeStamp - lastDown.t < 500 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 24;
    lastDown = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    if (watch) watch.obs.disconnect();
    if (again) { watch = null; return; }
    // The kit's own marks (the nudge, the coach ring and hand, the flash of the line) are not an answer of the game.
    const KIT = new Set(['nudge', 'coach', 'flash', 'long']);
    const rest = v => (v || '').split(/\s+/).filter(c => c && !KIT.has(c)).sort().join(' ');
    const own = r => r.type === 'attributes' && (r.target.id === 'coachHand' ||
      r.attributeName === 'class' && rest(r.oldValue) === rest(r.target.getAttribute('class')));
    const w = watch = { changed: false, obs: new MutationObserver(list => { if (list.some(r => !own(r))) w.changed = true; }) };
    w.obs.observe(document.body, { subtree: true, childList: true, attributes: true, attributeOldValue: true, characterData: true });
  }, true);
  addEventListener('pointerup', e => {
    if (!e.isTrusted || e.button !== 0 || isOpen()) return;
    const btn = e.target.closest && e.target.closest('button');
    if (btn && btn.disabled) {
      PH.capture('dead click', { target: 'grey ' + label(btn) });
      answer(btn.dataset.why);
      return;
    }
    const w = watch;
    if (!w) return;
    setTimeout(() => {
      w.obs.disconnect();
      if (watch === w) watch = null;
      if (w.changed || isOpen()) return;
      PH.capture('dead click', { target: label(e.target.closest('[id], [class]') || e.target) });
      answer();
    }, 450);
  }, true);

  // The time from the start of a game to his first action on it, to see where he does not know what to do.
  let startedAt = 0;
  addEventListener('gg-track', e => { if (e.detail.kind === 'start') startedAt = Date.now(); });
  addEventListener('pointerdown', e => {
    if (!e.isTrusted || !startedAt || !e.target.closest || !e.target.closest('#table, #bar button:not(#quit)')) return;
    PH.capture('first action', { seconds: Math.round((Date.now() - startedAt) / 1000), coach: coaching });
    startedAt = 0;
  }, true);
  // A hint asked by his hand, or shown by itself at Facile.
  addEventListener('click', e => {
    if (e.target.closest && e.target.closest('#hintBtn')) PH.capture('hint used', { automatic: !e.isTrusted });
  }, true);
  // A soft click on the keys of the bar, the dialogs and the rules, so he hears that his click was taken.
  // The game plays its own sounds for the moves on the table (lib/sound.js).
  addEventListener('click', e => {
    if (e.isTrusted && e.target.closest && e.target.closest('#bar button, #bar a, #over button, #helpBox button')) window.Sound?.play('tap');
  }, true);
  // Only his own hand or keys allow a new automatic hint.
  for (const type of ['pointerdown', 'keydown', 'wheel'])
    addEventListener(type, e => { stir(); if (e.isTrusted) autoDone = false; }, { capture: true, passive: true });

  // A window that is behind (another window or the backup saved a newer game) cannot save:
  // it asks to reload, at each refused save, until it is reloaded.
  addEventListener('gg-stale', () => {
    if (quitting || !over.classList.contains('on')) dialog('Le jeu a changé ailleurs',
      'Ce jeu a été enregistré dans une autre fenêtre. Rechargez-le pour continuer la partie à jour.',
      [['Recharger le jeu', () => location.reload(), true]]);
    if (quitting) staleHeld = true;
  });

  window.Kit = { home, firstVisit, levelNames, showLevel, showWins, chooseLevel, say, tell, dialog, closeDialog, openHelp, closeHelp, isOpen, escape, icon,
    point, coaching: () => coaching, gameOver };
})();
