// Shared behaviour of every game page. Link lib/kit.css, write the page like this, then load this file:
//
//   <div id="bar">
//     <div id="title">Solitaire</div>
//     <button id="undoBtn" data-icon="undo">Annuler le dernier coup</button>   icons: undo, bulb, help, close
//     <span class="spacer"></span>
//     <button id="newBtn" class="game">Nouvelle partie</button>
//   </div>
//   <div id="msgRail"><div id="msg" aria-live="polite"></div><div id="wins"></div></div>
//   <div id="table"></div>
//   <div id="help" data-title="Comment jouer"><section class="page">…</section>…</div>
//
// This file adds the "Jeux" button that goes back to the library, the button icons, the frame and
// the page buttons of the rules guide, and the dialog. The game then calls:
//
//   Kit.say(text)                           the message line
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
  if (bar && !$('home')) {
    bar.insertAdjacentHTML('afterbegin', `<a id="home" href="${libRoot}" aria-label="Retour aux jeux">${icon('back')}Jeux</a>`);
  }
  document.querySelectorAll('button[data-icon]').forEach(b => b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon)));

  // Message line
  const msg = $('msg');
  const say = text => { if (msg) msg.textContent = text; };

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
    buttons.forEach(([label, fn, primary]) => {
      const e = document.createElement('button');
      e.textContent = label; if (primary) { e.className = 'primary'; first = first || e; }
      e.onclick = () => { closeDialog(); if (fn) fn(); };
      b.appendChild(e);
    });
    over.classList.toggle('soft', !!soft);
    over.classList.add('on');
    (first || b.firstChild).focus();
  }

  // Rules guide: short pages, so they never need scrolling. "Fermer" works from every page.
  const help = $('help');
  let pages = [], at = 0;
  if (help) {
    const sections = help.innerHTML;
    help.innerHTML = `<div id="helpBox" role="dialog" aria-modal="true" aria-labelledby="helpTitle">
      <div class="head"><h2 id="helpTitle"></h2><button id="helpClose">${icon('close')}Fermer</button></div>
      <div id="helpText">${sections}</div>
      <div class="end"><button id="helpPrev">Précédent</button><span id="helpPage"></span><button id="helpNext" class="primary">Suivant</button></div>
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
    pages.forEach((e, k) => e.classList.toggle('on', k === n));
    $('helpPage').textContent = `Page ${n + 1} sur ${pages.length}`;
    $('helpPrev').hidden = n === 0;
    const next = $('helpNext');
    next.textContent = n === pages.length - 1 ? "J'ai compris" : 'Suivant';
    next.focus();
  }
  function openHelp() { if (!help) return; remember(); help.classList.add('on'); showPage(0); }
  function closeHelp() { if (help) { help.classList.remove('on'); giveBack(); } }
  const helpOpen = () => !!help && help.classList.contains('on');
  const isOpen = () => over.classList.contains('on') || helpOpen();
  function escape() {
    if (helpOpen()) { closeHelp(); return true; }
    if (over.classList.contains('on')) { closeDialog(); return true; }
    return false;
  }

  // While a dialog or the rules are open, Tab moves only between their buttons:
  // the buttons of the bar behind them cannot be reached.
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || !isOpen()) return;
    const box = over.classList.contains('on') ? $('box') : $('helpBox');
    const items = [...box.querySelectorAll('button')].filter(b => !b.hidden && !b.disabled);
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  }, true);

  // A window that is behind (another window or the backup saved a newer game) cannot save:
  // it asks to reload, at each refused save, until it is reloaded.
  addEventListener('gg-stale', () => {
    if (!over.classList.contains('on')) dialog('Le jeu a changé ailleurs',
      'Ce jeu a été enregistré dans une autre fenêtre. Rechargez-le pour continuer la partie à jour.',
      [['Recharger le jeu', () => location.reload(), true]]);
  });

  window.Kit = { say, dialog, closeDialog, openHelp, closeHelp, isOpen, escape, icon };
})();
