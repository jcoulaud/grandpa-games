// The admin API, used by public/admin/: the statistics and the errors.
// Every request needs `Authorization: Bearer <ADMIN_TOKEN>`.
// ADMIN_TOKEN is a Worker secret (wrangler secret put ADMIN_TOKEN). Without it, the admin API is off.

import { json, network, utcDay, VISIT_DAYS } from './util';

export interface AdminEnv {
  DB: D1Database;
  ADMIN_TOKEN?: string;
}

const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;

// Compares in constant time, so the answer time does not reveal how much of the token was right.
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function admin(request: Request, env: AdminEnv, path: string): Promise<Response> {
  const overview = path === 'overview' && request.method === 'GET';
  const clear = path === 'errors/clear' && request.method === 'POST';
  if (!overview && !clear) return json({ error: 'not found' }, 404);
  if (!env.ADMIN_TOKEN) return json({ error: 'admin off' }, 503);
  const db = env.DB;
  const auth = request.headers.get('Authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given) return json({ error: 'password' }, 401);
  // Each password try is recorded and counted in one transaction, so parallel tries cannot pass the
  // limit together. A right password removes its row. After MAX_FAILURES wrong ones from a network
  // in FAILURE_WINDOW_MS, that network is refused, even with the right password.
  const ip = network(request), now = Date.now();
  const [, tried, count] = await db.batch<{ id?: number; n?: number }>([
    db.prepare('DELETE FROM admin_failures WHERE at <= ?').bind(now - FAILURE_WINDOW_MS),
    db.prepare('INSERT INTO admin_failures (ip, at) VALUES (?, ?) RETURNING id').bind(ip, now),
    db.prepare('SELECT COUNT(*) AS n FROM admin_failures WHERE ip = ?').bind(ip),
  ]);
  const forget = () => db.prepare('DELETE FROM admin_failures WHERE id = ?').bind(tried.results[0]?.id ?? -1).run();
  // A refused try is not kept, so the lockout ends 15 minutes after the wrong passwords.
  if ((count.results[0]?.n ?? 0) > MAX_FAILURES) { await forget(); return json({ error: 'Trop d’essais. Réessayez dans 15 minutes.' }, 429); }
  if (!(await sameSecret(given, env.ADMIN_TOKEN))) return json({ error: 'password' }, 401);
  await forget();

  if (overview) {
    const today = utcDay(now), d7 = utcDay(now, 6), d14 = utcDay(now, 13), d30 = utcDay(now, 29), first = utcDay(now, VISIT_DAYS - 1);
    const [totals, days, games, errors] = await db.batch([
      db.prepare(`SELECT
          (SELECT COUNT(*) FROM players) AS players,
          (SELECT COUNT(*) FROM players WHERE first_day >= ?2) AS new7,
          (SELECT COUNT(*) FROM players WHERE first_day >= ?4 AND first_day < ?2) AS new7prev,
          (SELECT COUNT(*) FROM visits WHERE day = ?1) AS today,
          (SELECT COUNT(DISTINCT id) FROM visits WHERE day >= ?2) AS active7,
          (SELECT COUNT(DISTINCT id) FROM visits WHERE day >= ?4 AND day < ?2) AS active7prev,
          (SELECT COUNT(DISTINCT id) FROM visits WHERE day >= ?3) AS active30`).bind(today, d7, d30, d14),
      // One row per day of the chart that had a visit or a game.
      db.prepare(`SELECT day, SUM(players) AS players, SUM(starts) AS starts, SUM(wins) AS wins FROM (
          SELECT day, COUNT(*) AS players, 0 AS starts, 0 AS wins FROM visits WHERE day >= ?1 GROUP BY day
          UNION ALL
          SELECT day, 0, SUM(CASE kind WHEN 'start' THEN n END), SUM(CASE kind WHEN 'won' THEN n END)
          FROM plays WHERE day >= ?1 GROUP BY day)
        GROUP BY day ORDER BY day`).bind(first),
      db.prepare(`SELECT game,
          SUM(CASE WHEN kind = 'start' THEN n ELSE 0 END) AS starts,
          SUM(CASE WHEN kind = 'won' THEN n ELSE 0 END) AS wins,
          SUM(CASE WHEN kind = 'start' AND day >= ?1 THEN n ELSE 0 END) AS starts7,
          SUM(CASE WHEN kind = 'won' AND day >= ?1 THEN n ELSE 0 END) AS wins7
        FROM plays GROUP BY game ORDER BY starts DESC`).bind(d7),
      // One row per message: how often, on how many PCs, and the newest stack (SQLite takes the bare
      // columns from the row that has the MAX).
      db.prepare(`SELECT message, COUNT(*) AS n, COUNT(DISTINCT pc) AS pcs, MAX(at) AS last,
          page, stack, agent FROM errors GROUP BY message ORDER BY last DESC LIMIT 50`),
    ]);
    return json({ totals: totals.results[0], days: days.results, games: games.results, errors: errors.results });
  }

  await db.prepare('DELETE FROM errors').run();
  return json({ ok: true });
}
