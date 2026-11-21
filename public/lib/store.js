// Saves for every game in the library.
//
// The copy on this PC (localStorage) is the main copy: it is written at once and works offline.
// A few seconds later, a smaller "cloud" copy goes to the server as a backup, but only from a PC
// that was approved with `bun run approve <code>`. At start, the library takes the newer copy.
//
//   GG.load(game)                    -> the saved data, or null
//   GG.save(game, data, { cloud, summary }) -> true if the PC copy was written
//       cloud:   what to back up (default: data). Keep it small, under 100 KB.
//       summary: one short line for the library tile, for example "12 victoires".
//   GG.meta(game)                    -> { summary, updatedAt } or null
//   GG.code                          -> this PC's code, to approve it
//   GG.sync()                        -> Promise, pulls newer saves and pushes pending ones
//
// It also records JavaScript errors on every page and sends them to the admin page (see errors below).
(() => {
  const P = 'gg:';
  const SRC = document.currentScript.src;
  const API = location.protocol === 'https:' || location.hostname === 'localhost' ? '/api' : null;
  const get = k => { try { return JSON.parse(localStorage.getItem(P + k)); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  // A random id that identifies this PC. Its first 6 letters are the code shown in the library.
  let device = get('device');
  if (typeof device !== 'string' || device.length < 26) {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    device = Array.from(crypto.getRandomValues(new Uint8Array(26)), b => abc[b % 32]).join('');
    set('device', device);
  }
  const code = device.slice(0, 6);
  // The player this window started with. If the PC changes player while the window is open,
  // the window stops saving, so it can never write one person's game into another's.
  const pagePlayer = get('player');
  // Games whose cloud copy still has to go to the server. Kept in storage, so every page sees it.
  const pending = () => new Set(get('dirty') || []);
  const mark = (game, on) => { const d = pending(); on ? d.add(game) : d.delete(game); return set('dirty', [...d]); };

  // Ask Edge not to clear this site's data when the disk is full.
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
  // The offline copy (sw.js sits next to the library page, one folder up from this file).
  if (API && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register(new URL('../sw.js', SRC)).catch(() => {});
  }

  const call = (method, path, body, keepalive) => fetch(API + path, {
    method, keepalive,
    headers: { 'Content-Type': 'application/json', 'X-Device': device },
    body: body ? JSON.stringify(body) : undefined,
  });

  // An upload names the player this PC saves for, and the server version it last saw ("base").
  // The server refuses it (409) if the PC now belongs to another player, or if another PC saved
  // after that version. The game is then "behind": the next sync takes the server copy.
  let pushing = false;
  async function push(keepalive) {
    if (!API || !get('approved') || !get('player')) return;
    // One upload at a time from this window. A save during an upload is sent right after it.
    if (pushing && !keepalive) { later(); return; }
    pushing = true;
    try { await pushAll(keepalive); } finally { pushing = false; }
  }
  async function pushAll(keepalive) {
    for (const game of pending()) {
      const c = get('cloud:' + game);
      if (!c) { mark(game, false); continue; }
      try {
        const r = await call('PUT', '/saves/' + encodeURIComponent(game),
          { updatedAt: c.updatedAt, data: c.data, summary: c.summary, base: get('base:' + game) ?? -1, player: get('player') }, keepalive);
        if (r.ok) {
          const { rev } = await r.json().catch(() => ({}));
          if (typeof rev === 'number') set('base:' + game, rev);
          // A move made during the request wrote a newer copy: keep it pending.
          if ((get('cloud:' + game) || {}).updatedAt === c.updatedAt) mark(game, false);
        } else if (r.status === 409) {
          const why = ((await r.json().catch(() => ({}))) || {}).error;
          if (why === 'player') { set('approved', false); break; }
          set('behind:' + game, true); mark(game, false);
        } else if (r.status === 403) { set('approved', false); break; }
        else if (r.status === 429) break; // too fast: the next save or start sends it
      } catch (e) { break; } // offline: try again later
    }
  }

  let timer = 0;
  const later = () => { clearTimeout(timer); timer = setTimeout(push, 3000); };
  addEventListener('online', () => push());
  addEventListener('pagehide', () => { if (pending().size) push(true); });

  // Errors: kept on the PC (20 at most), sent once the PC is approved. 5 per page at most, no repeats.
  const seen = new Set();
  function report(message, stack) {
    const m = String(message || 'Erreur').slice(0, 500);
    if (seen.has(m) || seen.size >= 5) return;
    seen.add(m);
    const list = get('errors') || [];
    list.push({ message: m, stack: String(stack || '').slice(0, 4000), page: location.pathname, at: Date.now(),
      agent: navigator.userAgent.slice(0, 200) });
    set('errors', list.slice(-20));
    setTimeout(sendErrors, 1000);
  }
  addEventListener('error', e => report(e.message, (e.error && e.error.stack) || `${e.filename}:${e.lineno}:${e.colno}`));
  addEventListener('unhandledrejection', e => {
    const r = e.reason || {};
    report('Promesse rejetée : ' + (r.message || r), r.stack);
  });
  let sending = false;
  async function sendErrors() {
    const list = get('errors') || [];
    if (!API || !get('approved') || !list.length || sending) return;
    sending = true;
    try {
      let version = '';
      try { version = ((await (await fetch(new URL('../version.js', SRC))).text()).match(/'([^']+)'/) || [])[1] || ''; } catch (e) {}
      const items = list.slice(0, 10).map(x => ({ ...x, version }));
      const r = await call('POST', '/errors', { items });
      // Drop what was sent, also if new errors arrived during the request.
      const sent = new Set(items.map(x => x.at + x.message));
      if (r.ok) set('errors', (get('errors') || []).filter(x => !sent.has(x.at + x.message)));
    } catch (e) {} finally { sending = false; }
  }

  async function sync() {
    if (!API) return { approved: false, changed: [] };
    const changed = [];
    try {
      const h = await (await call('POST', '/hello')).json();
      // A removed PC keeps its player, so its games are kept if it is approved again.
      if (!h.approved) { set('approved', false); return { approved: false, changed }; }
      // A PC that is new to this player (first approval, or moved to another person) takes the server
      // copy of every game, even if someone played on it meanwhile. It uploads nothing until that
      // restore is written, so it never overwrites the player's progress, even if this sync fails.
      // A PC approved before players were remembered keeps its games.
      if (!get('player') && get('approved')) set('player', h.player);
      const fresh = get('player') !== h.player;
      if (fresh) {
        set('approved', false);
        // Revs belong to one player's saves: forget the old player's, so none can match by chance.
        try { Object.keys(localStorage).filter(k => k.startsWith(P + 'base:')).forEach(k => localStorage.removeItem(k)); } catch (e) {}
      }
      const r = await call('GET', '/saves');
      if (!r.ok) return { approved: !!get('approved'), changed, offline: true };
      const { saves } = await r.json();
      let written = true;
      for (const [game, remote] of Object.entries(saves || {})) {
        const local = get('save:' + game);
        // Keep the PC copy if the server copy is one this PC wrote or already saw: the PC copy is then
        // as new or newer. Otherwise another PC (or a restore) saved since: take the server copy.
        const othersSaved = !remote.mine && remote.rev !== get('base:' + game);
        if (!fresh && !get('behind:' + game) && !othersSaved && local) {
          set('base:' + game, remote.rev);
          continue;
        }
        const copy = { updatedAt: remote.updatedAt, data: remote.data, summary: remote.summary || '' };
        if (!set('save:' + game, { updatedAt: remote.updatedAt, data: remote.data }) || !set('cloud:' + game, copy)) {
          written = false; continue;
        }
        set('meta:' + game, { summary: remote.summary || '', updatedAt: remote.updatedAt });
        set('base:' + game, remote.rev);
        set('behind:' + game, false);
        set('epoch:' + game, (get('epoch:' + game) || 0) + 1); // open windows of this game are now behind
        mark(game, false);
        changed.push(game);
      }
      if (!written) return { approved: !!get('approved'), changed, offline: true }; // storage full: try again later
      set('player', h.player);
      set('approved', true);
      await push();
      await sendErrors();
      return { approved: true, changed };
    } catch (e) {
      return { approved: !!get('approved'), changed, offline: true };
    }
  }

  // A window that loaded a game stops saving it once a sync replaced it with a newer copy,
  // so it can never write its older game over the newer one. Reopening the game loads the new copy.
  const loadedEpoch = {};
  function load(game) {
    loadedEpoch[game] = get('epoch:' + game) || 0;
    const r = get('save:' + game);
    return r ? r.data : null;
  }
  function save(game, data, opts = {}) {
    if (get('player') !== pagePlayer) return false; // the PC changed player: reopen the game
    if (game in loadedEpoch && (get('epoch:' + game) || 0) !== loadedEpoch[game]) return false;
    const updatedAt = Date.now();
    if (!set('save:' + game, { updatedAt, data })) return false;
    const summary = opts.summary !== undefined ? opts.summary : (get('meta:' + game) || {}).summary || '';
    // If the backup copy does not fit, report a failure: the game can then save less and try again.
    if (!set('cloud:' + game, { updatedAt, data: opts.cloud !== undefined ? opts.cloud : data, summary })) return false;
    set('meta:' + game, { summary, updatedAt });
    if (!mark(game, true)) return false;
    later();
    return true;
  }

  window.GG = {
    code,
    load,
    meta: game => get('meta:' + game),
    save,
    sync,
    get: get, set: set, // small per-PC flags for the library, never sent to the server
  };
})();
