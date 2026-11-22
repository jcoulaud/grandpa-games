// Anonymous statistics and error reports for the admin page. The static files in public/ are served
// by Cloudflare before this code runs. The saves never come here: they stay on each PC.
//
//   POST /api/stats  { id, kind: 'visit' }                     a PC opened the site today
//   POST /api/stats  { id, kind: 'start' | 'won', game }       a game started or won
//   POST /api/errors { id, message, stack, page, agent }       a JavaScript error
//
// id is the random id of the PC. /api/admin/* is in admin.ts.
import { admin, type AdminEnv } from './admin';
import { json, network, utcDay, VISIT_DAYS } from './util';

const GAMES = ['solitaire', 'freecell', 'dames', 'dame-de-pique', 'demineur', 'yams', 'bataille-navale', 'paires', 'mots-meles', 'sudoku'];         // add each new game here
const ERRORS_PER_DAY = 20;           // per PC
const ERRORS_PER_NETWORK = 40;
const ERRORS_GLOBAL_PER_DAY = 1_000;
const KEEP_ERRORS = 2_000;           // in all

async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.body || Number(request.headers.get('Content-Length')) > 30_000) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 30_000) { void reader.cancel().catch(() => {}); return null; }
      text += decoder.decode(value, { stream: true });
      if (text.length > 10_000) { void reader.cancel().catch(() => {}); return null; }
    }
    text += decoder.decode();
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
  if (text.length > 10_000) return null;
  try {
    const b: unknown = JSON.parse(text);
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

// Use a keyed digest so the diagnostic table does not store network addresses.
async function errorNetwork(request: Request, secret: string | undefined): Promise<string | null> {
  const ip = network(request);
  if (!ip || !secret) return null;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode('errors:' + ip));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: AdminEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/admin/')) return admin(request, env, url.pathname.slice('/api/admin/'.length));
    if (request.method !== 'POST' || (url.pathname !== '/api/stats' && url.pathname !== '/api/errors')) return json({ error: 'not found' }, 404);
    const b = await body(request);
    const id = typeof b?.id === 'string' && /^[A-Z2-9]{26}$/.test(b.id) ? b.id : '';
    if (!b || !id) return json({ error: 'shape' }, 400);
    const db = env.DB, now = Date.now(), day = utcDay(now);
    // Every call marks the PC as seen today, so a PC that plays past midnight still counts.
    const seen = [
      db.prepare(`INSERT INTO players (id, first_day, last_day) VALUES (?1, ?2, ?2)
        ON CONFLICT (id) DO UPDATE SET last_day = ?2`).bind(id, day),
      db.prepare('INSERT OR IGNORE INTO visits (day, id) VALUES (?, ?)').bind(day, id),
    ];

    if (url.pathname === '/api/stats') {
      if (b.kind === 'visit') {
        await db.batch([...seen, db.prepare('DELETE FROM visits WHERE day <= ?').bind(utcDay(now, VISIT_DAYS))]);
        return json({ ok: true });
      }
      if ((b.kind === 'start' || b.kind === 'won') && typeof b.game === 'string' && GAMES.includes(b.game)) {
        await db.batch([...seen, db.prepare(`INSERT INTO plays (day, game, kind, n) VALUES (?, ?, ?, 1)
          ON CONFLICT (day, game, kind) DO UPDATE SET n = n + 1`).bind(day, b.game, b.kind)]);
        return json({ ok: true });
      }
      return json({ error: 'shape' }, 400);
    }

    const pc = id.slice(0, 6), cutoff = now - 86_400_000;
    const net = await errorNetwork(request, env.ADMIN_TOKEN);
    // One statement considers all quotas and inserts the row atomically.
    const [insert] = await db.batch([
      db.prepare(`INSERT INTO errors (pc, page, message, stack, agent, at, network_key)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
        WHERE (SELECT COUNT(*) FROM errors WHERE pc = ?1 AND at > ?8) < ?9
          AND (?7 IS NULL OR (SELECT COUNT(*) FROM errors WHERE network_key = ?7 AND at > ?8) < ?10)
          AND (SELECT COUNT(*) FROM errors WHERE at > ?8) < ?11`)
        .bind(pc, str(b.page, 200), str(b.message, 500) || 'Erreur', str(b.stack, 4000), str(b.agent, 200), now,
          net, cutoff, ERRORS_PER_DAY, ERRORS_PER_NETWORK, ERRORS_GLOBAL_PER_DAY),
      db.prepare('DELETE FROM errors WHERE id < (SELECT id FROM errors ORDER BY id DESC LIMIT 1 OFFSET ?)').bind(KEEP_ERRORS - 1),
    ]);
    return json({ ok: true, kept: insert.meta.changes });

  },
} satisfies ExportedHandler<AdminEnv>;
