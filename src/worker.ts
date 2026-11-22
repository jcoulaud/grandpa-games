// Anonymous statistics and error reports for the admin page. The static files in public/ are served
// by Cloudflare before this code runs. The saves never come here: they stay on each PC.
//
//   POST /api/stats  { id, kind: 'visit' }                     a PC opened the site today
//   POST /api/stats  { id, kind: 'start' | 'won', game }       a game started or won
//   POST /api/errors { id, message, stack, page, agent }       a JavaScript error
//
// id is the random id of the PC. /api/admin/* is in admin.ts.
import { admin, type AdminEnv } from './admin';
import { json, utcDay, VISIT_DAYS } from './util';

const GAMES = ['solitaire', 'freecell', 'dames', 'dame-de-pique', 'demineur'];         // add each new game here
const ERRORS_PER_DAY = 20;           // per PC
const KEEP_ERRORS = 2_000;           // in all

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > 10_000) return null;
  try {
    const b: unknown = JSON.parse(text);
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');

export default {
  async fetch(request: Request, env: AdminEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/admin/')) return admin(request, env, url.pathname.slice('/api/admin/'.length));
    if (request.method !== 'POST') return json({ error: 'not found' }, 404);
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

    if (url.pathname === '/api/errors') {
      const pc = id.slice(0, 6);
      const today = await db.prepare('SELECT COUNT(*) AS n FROM errors WHERE pc = ? AND at > ?')
        .bind(pc, now - 86_400_000).first<{ n: number }>();
      if ((today?.n ?? 0) >= ERRORS_PER_DAY) return json({ ok: true, kept: 0 });
      await db.batch([
        db.prepare('INSERT INTO errors (pc, page, message, stack, agent, at) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(pc, str(b.page, 200), str(b.message, 500) || 'Erreur', str(b.stack, 4000), str(b.agent, 200), now),
        db.prepare('DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY id DESC LIMIT ?)').bind(KEEP_ERRORS),
      ]);
      return json({ ok: true, kept: 1 });
    }

    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<AdminEnv>;
