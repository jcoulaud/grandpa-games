// Saves for every game in the library. They stay in the browser of the PC (localStorage).
//
//   GG.load(game)                     -> the saved data, or null
//   GG.save(game, data, { summary })  -> Promise<boolean> that resolves when the save is written
//       summary: one short line for the library tile, for example "12 victoires".
//   GG.meta(game)                     -> { summary, updatedAt } or null
//   GG.track(game, 'start' | 'won')   -> counts a game started or won, for the admin page
//
// A window that is behind (another window saved the game since it loaded it) refuses to save and
// fires a "gg-stale" event at each refused save. lib/kit.js then asks to reload.
//
// For the admin page, each PC also sends an anonymous visit once a day and its JavaScript errors.
// It sends only the random id of the PC (lib/ph.js), never a save. PostHog also gets the games
// started and won.
(() => {
  const P = 'gg:';
  const SRC = document.currentScript.src;
  const API = location.protocol === 'https:' || location.hostname === 'localhost' ? '/api' : null;
  const get = k => { try { return JSON.parse(localStorage.getItem(P + k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // Ask Edge not to clear this site's data when the disk is full.
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  // The offline copy (sw.js sits next to the library page, one folder up from this file).
  // On the library page, a new version starts as soon as it is downloaded, and the page reloads with it.
  if (API && 'serviceWorker' in navigator) {
    const sw = navigator.serviceWorker;
    const home = location.pathname === new URL('../', SRC).pathname;
    const updating = !!sw.controller;
    sw.register(new URL('../sw.js', SRC)).then(reg => {
      if (!home) return;
      let retryTimer;
      const retry = () => {
        clearTimeout(retryTimer);
        if (document.hidden || !reg.waiting) return;
        reg.waiting.postMessage('start');
        // Closing a game in a different window might not refocus this library.
        retryTimer = setTimeout(retry, 2000);
      };
      retry();
      addEventListener('focus', retry);
      document.addEventListener('visibilitychange', retry);
      reg.addEventListener('updatefound', () => {
        reg.installing?.addEventListener('statechange', retry);
      });
      sw.addEventListener('controllerchange', () => { if (updating) location.reload(); });
    }).catch(() => {});
  }

  // The online backup is gone: drop what it kept on the PC, to free the space for the games.
  try {
    Object.keys(localStorage).filter(k => /^gg:(cloud:|base:|behind:|epoch:|dirty$|approved$|player$|errors$)/.test(k))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}

  // The anonymous id of this PC, made by lib/ph.js. A PC from the time of the backup keeps the id it had.
  const id = PH.id;
  // Statistics are best effort: offline, they are lost, and the game never waits for them.
  const send = (path, body) => {
    if (!API) return;
    fetch(API + path, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...body }) }).catch(() => {});
  };
  const today = new Date().toISOString().slice(0, 10);
  if (get('visit') !== today && set('visit', today)) send('/stats', { kind: 'visit' });

  // Errors: 5 per page at most, no repeats.
  const seen = new Set();
  function report(message, stack) {
    const m = String(message || 'Erreur').slice(0, 500);
    if (seen.has(m) || seen.size >= 5) return;
    seen.add(m);
    send('/errors', { message: m, stack: String(stack || '').slice(0, 4000), page: location.pathname,
      agent: navigator.userAgent.slice(0, 200) });
  }
  addEventListener('error', e => report(e.message, (e.error && e.error.stack) || `${e.filename}:${e.lineno}:${e.colno}`));
  addEventListener('unhandledrejection', e => {
    const r = e.reason || {};
    report('Promesse rejetée : ' + (r.message || r), r.stack);
  });

  // known[game]: the time of the copy this window last read or wrote. A window whose copy is older
  // than the saved one cannot write its older game over the newer one.
  const known = {};
  function load(game) {
    const r = get('save:' + game);
    known[game] = r?.updatedAt ?? null;
    return r ? r.data : null;
  }
  async function writeSave(game, data, { summary, undoLimits = [Infinity] } = {}) {
    // Take a snapshot before waiting for another window to release the lock.
    const snapshot = structuredClone(data);
    const key = 'save:' + game;
    const write = () => {
      const previous = get(key);
      if ((previous?.updatedAt ?? null) !== (known[game] ?? null)) {
        dispatchEvent(new Event('gg-stale'));
        return false;
      }
      const updatedAt = Math.max(Date.now(), (previous?.updatedAt ?? 0) + 1);
      const label = summary ?? previous?.summary ?? get('meta:' + game)?.summary ?? '';
      for (const n of undoLimits) {
        const data = snapshot.undo && n !== Infinity
          ? { ...snapshot, undo: n ? snapshot.undo.slice(-n) : [] } : snapshot;
        if (!set(key, { updatedAt, summary: label, data })) continue;
        known[game] = updatedAt;
        return true;
      }
      return false;
    };
    try {
      return navigator.locks ? await navigator.locks.request(P + key, write) : write();
    } catch {
      return false;
    }
  }

  const pending = new Set();
  function save(game, data, options) {
    const write = writeSave(game, data, options);
    pending.add(write);
    const done = () => pending.delete(write);
    write.then(done, done);
    return write;
  }

  async function flush() {
    while (pending.size) await Promise.allSettled(pending);
  }

  function meta(game) {
    const save = get('save:' + game);
    return typeof save?.summary === 'string'
      ? { summary: save.summary, updatedAt: save.updatedAt }
      : get('meta:' + game);
  }

  window.GG = {
    load,
    meta,
    save, flush,
    track: (game, kind) => {
      send('/stats', { game, kind });
      PH.capture(kind === 'won' ? 'game won' : 'game started', { game });
    },
    get, set, // small per-PC flags for the library
  };
})();
