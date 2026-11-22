// Shared behaviour of every game page. Link lib/kit.css, write the page like this, then load this file:
//
//   <div id="bar">
//     <div id="title">Solitaire</div>
//     <button id="undoBtn" data-icon="undo">Annuler le dernier coup</button>   icons: undo, bulb, help, close
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
//   Kit.say(text)                           the message line
//   Kit.showLevel(level), Kit.showWins(n)   the level line under the name: "Niveau facile · 3 victoires"
//   Kit.dialog(title, text, [[label, fn, primary]], soft)   soft: the win sheet, with a light backdrop
//   Kit.closeDialog(), Kit.openHelp(), Kit.closeHelp()
//   Kit.isOpen()                            true while the rules or a dialog are open
//   Kit.escape()                            closes the rules or the dialog; false if nothing was open
(() => {
  'use strict';
  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
    help: '<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.4-2.7 4.3"/><path d="M12 17.6v.1"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
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
  // to leave a game. This one closes the game and goes back to the library. The game is already saved.
  if (bar && !$('quit')) {
    bar.insertAdjacentHTML('beforeend', '<button id="quit" data-icon="close" aria-label="Fermer le jeu" title="Fermer le jeu et revenir à la liste des jeux"></button>');
    $('quit').addEventListener('click', home);
  }
  if ($('rail') && !$('rail').querySelector('.credit'))
    $('rail').insertAdjacentHTML('afterbegin', `<a class="credit" href="https://x.com/JulienCoulaud" target="_blank" rel="noopener"><img src="${libRoot}icons/julien.webp" width="34" height="34" alt=""><span>Fait par <b>Julien Coulaud</b></span></a>`);
  document.querySelectorAll('button[data-icon]').forEach(b => b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon)));

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
    if (msg.scrollWidth > msg.clientWidth + 1) msg.classList.add('long');
  };
  // A new text flashes once, so his eye goes to the line when it changes.
  const say = text => {
    stir();
    if (!msg) return;
    const changed = msg.textContent !== text;
    msg.textContent = text; fit();
    if (changed) { msg.classList.remove('flash'); void msg.offsetWidth; msg.classList.add('flash'); }
  };
  addEventListener('resize', fit);

  // Dialog
  if (!$('over')) document.body.insertAdjacentHTML('beforeend',
    '<div id="over"><div id="box" role="dialog" aria-modal="true" aria-labelledby="overTitle"><h2 id="overTitle"></h2><p id="overText"></p><div id="overBtns"></div></div></div>');
  const over = $('over');
  // The control that had the focus before a dialog or the rules opened gets it back when they close.
  let opener = null;
  const remember = () => { if (!isOpen()) opener = document.activeElement; };
  const giveBack = () => { if (!isOpen() && opener && opener.isConnected) opener.focus({ preventScroll: true }); opener = null; };
  const closeDialog = () => { over.classList.remove('on', 'soft'); giveBack(); };
  function dialog(title, text, buttons, soft) {
    remember();
    $('overTitle').textContent = title;
    $('overText').textContent = text;
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
  function openHelp() { if (!help) return; remember(); help.classList.add('on'); showPage(0); }
  let firstStart = null;
  function firstVisit(start) {
    firstStart = start;
    $('table').hidden = true;
    openHelp();
  }
  function closeHelp() {
    if (!helpOpen()) return;
    help.classList.remove('on');
    giveBack();
    if (firstStart) chooseLevel(null, false, level => {
      const start = firstStart;
      firstStart = null;
      $('table').hidden = false;
      start(level);
      $('newBtn').focus();
    });
  }
  const helpOpen = () => !!help && help.classList.contains('on');
  const isOpen = () => over.classList.contains('on') || helpOpen();
  function escape() {
    if (helpOpen()) { closeHelp(); return true; }
    if (over.classList.contains('on')) { if (!firstStart) closeDialog(); return true; }
    return false;
  }

  // Keep Tab inside the dialog. In a short window, include the scrollable rules.
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const box = over.classList.contains('on') ? $('box') : $('helpBox');
    const items = [...box.querySelectorAll('button, #helpText')].filter(e =>
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
  const NUDGE = { facile: [15, 40], moyen: [30, 0], fort: [60, 0] };
  let shownLevel = null, idle = 0, nudged = null, autoDone = false;
  function stir() {
    idle = 0;
    if (nudged) { nudged.classList.remove('nudge'); nudged = null; }
  }
  const visible = e => e && !e.disabled && !e.hidden && e.offsetParent !== null;
  function nudgeTarget() {
    const marked = [...document.querySelectorAll('[data-nudge]')].find(visible);
    if (marked) return marked;
    const hint = $('hintBtn');
    return visible(hint) ? hint : null;
  }
  function tick() {
    if (document.hidden || isOpen() || ($('table') && $('table').hidden)) { stir(); return; }
    idle++;
    const [pulse, auto] = NUDGE[shownLevel] || NUDGE.moyen;
    const target = nudgeTarget();
    if (!target) { stir(); return; }
    if (idle >= pulse && target !== nudged) {
      if (nudged) nudged.classList.remove('nudge');
      target.classList.add('nudge');
      nudged = target;
    }
    if (auto && idle >= auto && !autoDone && target.id === 'hintBtn' && target.dataset.auto !== 'no') {
      autoDone = true;
      target.click();
    }
  }
  setInterval(tick, 1000);
  // Only his own hand or keys allow a new automatic hint.
  for (const type of ['pointerdown', 'keydown', 'wheel'])
    addEventListener(type, e => { stir(); if (e.isTrusted) autoDone = false; }, { capture: true, passive: true });

  // A window that is behind (another window or the backup saved a newer game) cannot save:
  // it asks to reload, at each refused save, until it is reloaded.
  addEventListener('gg-stale', () => {
    if (firstStart || !over.classList.contains('on')) dialog('Le jeu a changé ailleurs',
      'Ce jeu a été enregistré dans une autre fenêtre. Rechargez-le pour continuer la partie à jour.',
      [['Recharger le jeu', () => location.reload(), true]]);
  });

  window.Kit = { home, firstVisit, levelNames, showLevel, showWins, chooseLevel, say, dialog, closeDialog, openHelp, closeHelp, isOpen, escape, icon };
})();
