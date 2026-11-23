// The anonymous id of this PC, and PostHog (EU) on jeux-papi.fr. Load this file on every page, after
// lib/zoom.js and before lib/store.js. Tests and local runs send nothing to PostHog.
//
//   PH.id                    the random id made on this PC. lib/store.js sends it with the statistics.
//   PH.capture(event, props) sends one event. Offline, the PostHog script does not load and the event is lost.
//   PH.register(props)       adds props to every later event of this page, such as the level being played.
//
// PostHog records the pages, the clicks, the time on each page, how far it was scrolled and the session.
// Each event also carries:
//   page_type    library, game, rules or blog
//   game         the game of a game page or of its rules page
//   installed    true in the window of the installed app, false in a browser tab
// This file adds "play clicked" when a rules page or the blog opens a game, and "app installed".
// lib/store.js adds "game started" and "game won", and lib/kit.js the level and the rules guide events.
(() => {
  'use strict';
  const KEY = 'gg:device';
  let id = null;
  try { id = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (typeof id !== 'string' || !/^[A-Z2-9]{26}$/.test(id)) {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    id = Array.from(crypto.getRandomValues(new Uint8Array(26)), b => abc[b % 32]).join('');
    try { localStorage.setItem(KEY, JSON.stringify(id)); } catch (e) {}
  }

  // The site's own folders, in the address. Every other first folder is a game.
  const SITE = ['', 'blog', 'lib', 'icons', 'fonts', 'og', 'admin'];
  const gameOf = path => { const m = /^\/([a-z-]+)\/(regles\/)?$/.exec(path); return m && !SITE.includes(m[1]) ? m[1] : null; };
  const path = location.pathname.replace(/index\.html$/, '');
  const page = path === '/' ? { page_type: 'library' }
    : path.startsWith('/blog/') ? { page_type: 'blog' }
    : /\/regles\/$/.test(path) ? { page_type: 'rules', game: gameOf(path) }
    : { page_type: 'game', game: gameOf(path) };
  const installed = ['standalone', 'minimal-ui', 'window-controls-overlay'].some(m => matchMedia(`(display-mode: ${m})`).matches);

  const on = location.hostname === 'jeux-papi.fr';
  let ph = null;
  if (on) {
    // The PostHog snippet: array.js reads the init call from _i and the queued calls from the array.
    ph = window.posthog = [];
    ph.__SV = 1;
    ph._i = [['phc_te2NfQa4rJfJW5G3GYCQjZt9bw3LEzTG4USXJeZijxSx', {
      api_host: 'https://eu.i.posthog.com',
      defaults: '2025-05-24',
      person_profiles: 'always',
      bootstrap: { distinctID: id },
      loaded: p => p.register({ ...page, installed }),
    }, 'posthog']];
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://eu-assets.i.posthog.com/static/array.js';
    document.head.appendChild(s);
  }
  // The page props are registered when PostHog starts, before its first page view and the queued events.
  // Before array.js loads, window.posthog is the queue it reads. After, it is the real client.
  const call = (method, ...args) => {
    if (!on) return;
    const p = window.posthog;
    p.__loaded ? p[method](...args) : p.push([method, ...args]);
  };
  const capture = (event, props, options) => call('capture', event, props, options);
  const register = props => call('register', props);

  // A link from a rules page or the blog to a game. The links open in the same tab, so the event goes
  // with sendBeacon before the page leaves.
  if (page.page_type === 'rules' || page.page_type === 'blog') {
    addEventListener('click', e => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a) return;
      const url = new URL(a.href, location.href);
      const game = url.origin === location.origin && gameOf(url.pathname);
      if (!game || url.pathname.endsWith('/regles/')) return;
      capture('play clicked', { to_game: game, place: a.classList.contains('play') ? 'play button' : 'link' }, { transport: 'sendBeacon' });
    }, true);
  }
  addEventListener('appinstalled', () => capture('app installed'));

  window.PH = { id, capture, register };
})();
