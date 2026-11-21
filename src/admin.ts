// The admin API, used by public/admin/. Every request needs `Authorization: Bearer <ADMIN_TOKEN>`.
// ADMIN_TOKEN is a Worker secret (wrangler secret put ADMIN_TOKEN). Without it, the admin API is off.

import { network } from './ip';

export interface AdminEnv {
  DB: D1Database;
  ADMIN_TOKEN?: string;
}

const CODE = /^[A-Z2-9]{6}$/;
const MAX_FAILURES = 10;
const FAILURE_WINDOW_MS = 15 * 60_000;
const PENDING_TTL_MS = 7 * 86_400_000;

// A PC never approved and not seen for a week is dropped. A real one comes back at its next start.
export const dropStalePending = (db: D1Database, now: number) =>
  db.prepare('DELETE FROM devices WHERE approved = 0 AND player IS NULL AND last_seen < ?').bind(now - PENDING_TTL_MS);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// Compares in constant time, so the answer time does not reveal how much of the token was right.
async function sameSecret(given: string, expected: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([given, expected].map(v => crypto.subtle.digest('SHA-256', enc.encode(v))));
  return crypto.subtle.timingSafeEqual(a, b);
}

async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const b: unknown = await request.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
const codeOf = (v: unknown) => (typeof v === 'string' ? v.toUpperCase().replace(/\s/g, '') : '');

export async function admin(request: Request, env: AdminEnv, path: string): Promise<Response> {
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
  if ((count.results[0]?.n ?? 0) > MAX_FAILURES) return json({ error: 'Trop d’essais. Réessayez dans 15 minutes.' }, 429);
  if (!(await sameSecret(given, env.ADMIN_TOKEN))) return json({ error: 'password' }, 401);
  await db.prepare('DELETE FROM admin_failures WHERE id = ?').bind(tried.results[0]?.id ?? -1).run();

  if (path === 'overview' && request.method === 'GET') {
    const [, devices, saves, errors] = await db.batch([
      dropStalePending(db, Date.now()),
      db.prepare('SELECT code, name, player, approved, created_at, last_seen, last_write FROM devices ORDER BY last_seen DESC'),
      db.prepare('SELECT player, game, updated_at, summary FROM saves ORDER BY updated_at DESC'),
      db.prepare(`SELECT id, device_code, player, page, message, stack, version, agent, happened_at, received_at
        FROM errors ORDER BY id DESC LIMIT 100`),
    ]);
    return json({ devices: devices.results, saves: saves.results, errors: errors.results });
  }

  if (request.method !== 'POST') return json({ error: 'not found' }, 404);
  const b = await body(request);
  const code = codeOf(b.code);

  if (path === 'errors/clear') {
    await db.prepare('DELETE FROM errors').run();
    return json({ ok: true });
  }
  if (!CODE.test(code)) return json({ error: 'code' }, 400);
  const device = await db.prepare('SELECT code, approved, player FROM devices WHERE code = ?').bind(code)
    .first<{ code: string; approved: number; player: string | null }>();
  if (!device) return json({ error: 'unknown PC' }, 404);

  if (path === 'approve') {
    // "as": the code of an approved PC whose saves this PC takes over (a new PC for the same person).
    const as = codeOf(b.as);
    // Without "as", a PC approved again keeps the player it had, so its saves stay together.
    let player = device.player ?? code;
    if (as) {
      const old = await db.prepare('SELECT player FROM devices WHERE code = ? AND approved = 1 AND player IS NOT NULL').bind(as)
        .first<{ player: string }>();
      if (!old) return json({ error: 'No approved PC has this code' }, 400);
      player = old.player;
    }
    await db.prepare('UPDATE devices SET approved = 1, player = ? WHERE code = ?').bind(player, code).run();
    return json({ ok: true });
  }
  if (path === 'rename') {
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : '';
    await db.prepare('UPDATE devices SET name = ? WHERE code = ?').bind(name || null, code).run();
    return json({ ok: true });
  }
  if (path === 'revoke') {
    // The PC keeps playing and keeps its saves on the PC. It stops sending backups.
    await db.prepare('UPDATE devices SET approved = 0 WHERE code = ?').bind(code).run();
    return json({ ok: true });
  }
  if (path === 'forget') {
    if (device.approved) return json({ error: 'Revoke the PC first' }, 400);
    await db.prepare('DELETE FROM devices WHERE code = ?').bind(code).run();
    return json({ ok: true });
  }
  return json({ error: 'not found' }, 404);
}
