// Saves for every game in the library. They stay in the browser of the PC (localStorage).
//
//   GG.load(game)                     -> the saved data, or null
//   GG.save(game, data, { summary })  -> true if the save was written
//       summary: one short line for the library tile, for example "12 victoires".
//   GG.meta(game)                     -> { summary, updatedAt } or null
//   GG.track(game, 'start' | 'won')   -> counts a game started or won, for the admin page
//
// A window that is behind (another window saved the game since it loaded it) refuses to save and
// fires a "gg-stale" event at each refused save. lib/kit.js then asks to reload.
//
// For the admin page, each PC also sends an anonymous visit once a day and its JavaScript errors.
// It sends only a random id made on the PC, never a save.
(() => {
  const P = 'gg:';
  const SRC = document.currentScript.src;
  const API = location.protocol === 'https:' || location.hostname === 'localhost' ? '/api' : null;
  const get = k => { try { return JSON.parse(localStorage.getItem(P + k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // Ask Edge not to clear this site's data when the disk is full.
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  // The offline copy (sw.js sits next to the library page, one folder up from this file).
  if (API && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('../sw.js', SRC)).catch(() => {});
  }

  // The online backup is gone: drop what it kept on the PC, to free the space for the games.
  try {
    Object.keys(localStorage).filter(k => /^gg:(cloud:|base:|behind:|epoch:|dirty$|approved$|player$|errors$)/.test(k))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) {}

  // The anonymous id of this PC. A PC from the time of the backup keeps the id it had.
  let id = get('device');
  if (typeof id !== 'string' || !/^[A-Z2-9]{26}$/.test(id)) {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    id = Array.from(crypto.getRandomValues(new Uint8Array(26)), b => abc[b % 32]).join('');
    set('device', id);
  }
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
    known[game] = r ? r.updatedAt : null;
    return r ? r.data : null;
  }
  function save(game, data, opts = {}) {
    if (game in known && ((get('save:' + game) || {}).updatedAt ?? null) !== known[game]) {
      dispatchEvent(new Event('gg-stale'));
      return false;
    }
    const updatedAt = Math.max(Date.now(), (known[game] || 0) + 1);
    if (!set('save:' + game, { updatedAt, data })) return false;
    known[game] = updatedAt;
    const summary = opts.summary !== undefined ? opts.summary : (get('meta:' + game) || {}).summary || '';
    set('meta:' + game, { summary, updatedAt });
    return true;
  }

  window.GG = {
    load,
    meta: game => get('meta:' + game),
    save,
    track: (game, kind) => send('/stats', { game, kind }),
    get, set, // small per-PC flags for the library
  };
})();
