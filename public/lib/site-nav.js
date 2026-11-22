// The menus of the site bar and of the rules pages are <details>, so they open without this file.
// This file closes them the way a menu closes: with Escape, a click elsewhere, a chosen link,
// or the keyboard leaving them. On a rules page, it also marks the part being read.
(() => {
  'use strict';
  const menus = [...document.querySelectorAll('details.site-menu, details.rules-jump')];
  for (const menu of menus) {
    const summary = menu.querySelector('summary');
    menu.addEventListener('keydown', e => {
      if (e.key === 'Escape' && menu.open) { menu.open = false; summary.focus(); }
    });
    menu.addEventListener('focusout', e => {
      if (e.relatedTarget && !menu.contains(e.relatedTarget)) menu.open = false;
    });
    menu.addEventListener('click', e => { if (e.target.closest('a[href]')) menu.open = false; });
  }
  // Mouse hover is a preview. A click pins the menu, while touch and keyboard use the native trigger.
  for (const menu of document.querySelectorAll('details.site-menu')) {
    const summary = menu.querySelector('summary');
    let preview = false;
    let closeTimer;
    summary.addEventListener('pointerenter', e => {
      if (e.pointerType !== 'mouse' || menu.open) return;
      preview = true;
      menu.open = true;
    });
    menu.addEventListener('pointerenter', () => clearTimeout(closeTimer));
    menu.addEventListener('pointerleave', e => {
      if (e.pointerType !== 'mouse' || !preview) return;
      closeTimer = setTimeout(() => {
        if (preview && !menu.contains(document.activeElement)) menu.open = false;
        preview = false;
      }, 180);
    });
    summary.addEventListener('click', e => {
      if (e.pointerType !== 'mouse' || !preview || !menu.open) return;
      e.preventDefault();
      preview = false;
    });
    menu.addEventListener('toggle', () => {
      if (!menu.open) preview = false;
    });
  }
  document.addEventListener('click', e => {
    for (const menu of menus) if (menu.open && !menu.contains(e.target)) menu.open = false;
  });

  // The part being read: the last section whose top passed a third of the window.
  const sections = [...document.querySelectorAll('.rules-article > section[id]')];
  const now = document.querySelector('.rules-jump-now');
  if (!sections.length) return;
  const links = [...document.querySelectorAll('.rules-contents a, .rules-jump-list a')];
  const start = now && now.textContent;
  let shown;
  function mark() {
    const line = innerHeight / 3;
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
    let current = atEnd ? sections[sections.length - 1] : null;
    if (!current) for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    const id = current ? current.id : '';
    if (id === shown) return;
    shown = id;
    for (const a of links) {
      if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
    if (now) {
      const link = links.find(a => a.getAttribute('href') === '#' + id);
      now.textContent = link ? link.textContent : start;
    }
  }
  let queued = false;
  addEventListener('scroll', () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mark(); });
  }, { passive: true });
  addEventListener('resize', mark);
  mark();
})();
