// Cloud backup of the saves. The static files in public/ are served by Cloudflare before this code runs.
//
// A PC sends its random id in the X-Device header. Unknown PCs are recorded but cannot save until
// they are approved on the admin page or with `bun run approve <code>`. Approved PCs share the saves of one player.
// Approved PCs also send their JavaScript errors here, for the admin page. /api/admin/* is in admin.ts.
import { admin, dropStalePending, type AdminEnv } from './admin';
import { network } from './ip';

type Env = AdminEnv;

interface Device {
  id: string;
  code: string;
  player: string | null;
  approved: number;
  last_write: number | null;
}

interface ErrorItem {
  message?: unknown; stack?: unknown; page?: unknown; version?: unknown; agent?: unknown; at?: unknown;
}

interface SaveBody {
  updatedAt: number;
  data: unknown;
  summary?: string;
  base?: number;    // the server rev the PC last saw
  player?: string;  // the player the PC believes it saves for
}

const MAX_BYTES = 100_000;   // one save
const MAX_PENDING = 200;     // PCs waiting for approval
const PENDING_PER_NETWORK = 5;            // of them from one network
const KEEP_HISTORY = 30;     // old versions kept per game
const HISTORY_EVERY_MS = 3_600_000; // at most one old version per hour, so 30 versions cover days
const MIN_WRITE_MS = 1_000;  // between two saves of one PC
const ERRORS_PER_DAY = 50;   // per PC
const KEEP_ERRORS = 2_000;   // in all

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 });
    if (url.pathname.startsWith('/api/admin/')) return admin(request, env, url.pathname.slice('/api/admin/'.length));
    const id = request.headers.get('X-Device') ?? '';
    if (!/^[A-Z2-9]{26}$/.test(id)) return json({ error: 'device' }, 400);
    const now = Date.now();

    let device = await env.DB.prepare('SELECT id, code, player, approved, last_write FROM devices WHERE id = ?').bind(id).first<Device>();

    if (url.pathname === '/api/hello' && request.method === 'POST') {
      if (!device) {
        // One network can add only a few PCs, so strangers cannot fill the list with made-up ones.
        // The limits are checked inside the insert, so parallel requests cannot pass them together.
        const ip = network(request);
        const [, added] = await env.DB.batch([
          dropStalePending(env.DB, now),
          env.DB.prepare(`INSERT OR IGNORE INTO devices (id, code, approved, created_at, last_seen, ip)
            SELECT ?1, ?2, 0, ?3, ?3, ?4
            WHERE (SELECT COUNT(*) FROM devices WHERE approved = 0 AND player IS NULL) < ?5
              AND (SELECT COUNT(*) FROM devices WHERE approved = 0 AND player IS NULL AND ip = ?4) < ?6`)
            .bind(id, id.slice(0, 6), now, ip, MAX_PENDING, PENDING_PER_NETWORK),
        ]);
        // "full": the PC is not on the list, so the library does not show a code nobody can find.
        // An insert can also be skipped because another tab of this PC added it just before.
        const listed = added.meta.changes > 0
          || !!(await env.DB.prepare('SELECT 1 FROM devices WHERE id = ?').bind(id).first());
        return json({ approved: false, full: !listed });
      }
      // A PC that waited before the network was recorded gets it now, so it counts in the limit.
      await env.DB.prepare('UPDATE devices SET last_seen = ?, ip = COALESCE(ip, ?) WHERE id = ?').bind(now, network(request), id).run();
      const ok = device.approved === 1 && !!device.player;
      return json({ approved: ok, player: ok ? device.player : null });
    }

    if (!device || device.approved !== 1 || !device.player) return json({ error: 'not approved' }, 403);
    const player = device.player;

    if (url.pathname === '/api/saves' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT game, updated_at, data, summary, device, rev FROM saves WHERE player = ?').bind(player)
        .all<{ game: string; updated_at: number; data: string; summary: string | null; device: string | null; rev: number }>();
      // "mine": this PC wrote the server copy, so it is not a conflict even if the PC missed the answer.
      const saves: Record<string, SaveBody & { mine: boolean; rev: number }> = {};
      for (const r of rows.results) {
        saves[r.game] = { updatedAt: r.updated_at, data: JSON.parse(r.data), summary: r.summary ?? '', mine: r.device === id, rev: r.rev };
      }
      return json({ saves });
    }

    if (url.pathname === '/api/errors' && request.method === 'POST') {
      const text = await request.text();
      if (text.length > 60_000) return json({ error: 'too large' }, 413);
      let items: ErrorItem[];
      try { items = (JSON.parse(text) as { items: ErrorItem[] }).items; } catch { return json({ error: 'json' }, 400); }
      if (!Array.isArray(items)) return json({ error: 'shape' }, 400);
      const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM errors WHERE device_code = ? AND received_at > ?')
        .bind(device.code, now - 86_400_000).first<{ n: number }>();
      const room = Math.max(0, ERRORS_PER_DAY - (today?.n ?? 0));
      const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : '');
      const rows = items.slice(0, Math.min(10, room)).map(e => env.DB.prepare(
        `INSERT INTO errors (device_code, player, page, message, stack, version, agent, happened_at, received_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(device.code, player, str(e.page, 200), str(e.message, 500) || 'Erreur',
        str(e.stack, 4000), str(e.version, 60), str(e.agent, 200), typeof e.at === 'number' ? e.at : now, now));
      if (rows.length) {
        await env.DB.batch([...rows,
          env.DB.prepare('DELETE FROM errors WHERE id NOT IN (SELECT id FROM errors ORDER BY id DESC LIMIT ?)').bind(KEEP_ERRORS)]);
      }
      // The PC drops what it sent, also what was over the daily limit.
      return json({ ok: true, kept: rows.length });
    }

    const m = url.pathname.match(/^\/api\/saves\/([a-z0-9-]{1,40})$/);
    if (m && request.method === 'PUT') {
      if (device.last_write && now - device.last_write < MIN_WRITE_MS) return json({ error: 'slow down' }, 429);
      const text = await request.text();
      if (text.length > MAX_BYTES) return json({ error: 'too large' }, 413);
      let body: SaveBody;
      try { body = JSON.parse(text) as SaveBody; } catch { return json({ error: 'json' }, 400); }
      if (typeof body.updatedAt !== 'number' || body.data === undefined) return json({ error: 'shape' }, 400);
      const game = m[1];
      // The PC was moved to another player since its last sync: it must take that player's saves first.
      if (body.player !== player) return json({ error: 'player' }, 409);
      // Another PC saved after the rev this PC last saw: keep the server copy. A copy this PC wrote
      // itself is never a conflict, even if the PC missed the answer. Clocks play no part.
      const current = await env.DB.prepare('SELECT updated_at, device, rev FROM saves WHERE player = ? AND game = ?').bind(player, game)
        .first<{ updated_at: number; device: string | null; rev: number }>();
      const base = typeof body.base === 'number' ? body.base : -1;
      if (current && current.device !== id && current.rev !== base) return json({ error: 'behind' }, 409);
      // A late request from this PC, older than what it already stored: nothing to do.
      if (current && current.device === id && body.updatedAt <= current.updated_at) return json({ ok: true, rev: current.rev });
      const rev = (current?.rev ?? 0) + 1;
      const data = JSON.stringify(body.data);
      const summary = typeof body.summary === 'string' ? body.summary.slice(0, 120) : '';
      const [write] = await env.DB.batch([
        // Written only if the row is still at the rev read above, so two PCs saving at once cannot both win.
        env.DB.prepare(`INSERT INTO saves (player, game, updated_at, data, summary, device, rev) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
          ON CONFLICT (player, game) DO UPDATE SET updated_at = ?3, data = ?4, summary = ?5, device = ?6, rev = ?7
          WHERE saves.rev = ?8`).bind(player, game, body.updatedAt, data, summary, id, rev, current?.rev ?? 0),
        env.DB.prepare(`INSERT INTO history (player, game, updated_at, data, saved_at) SELECT ?1, ?2, ?3, ?4, ?5
          WHERE NOT EXISTS (SELECT 1 FROM history WHERE player = ?1 AND game = ?2 AND saved_at > ?6)`)
          .bind(player, game, body.updatedAt, data, now, now - HISTORY_EVERY_MS),
        env.DB.prepare(`DELETE FROM history WHERE player = ?1 AND game = ?2 AND id NOT IN
          (SELECT id FROM history WHERE player = ?1 AND game = ?2 ORDER BY id DESC LIMIT ?3)`).bind(player, game, KEEP_HISTORY),
        env.DB.prepare('UPDATE devices SET last_write = ?, last_seen = ? WHERE id = ?').bind(now, now, id),
      ]);
      // Another request changed the row since it was read (often this PC's own earlier upload):
      // ask the PC to try again, and the next attempt gets the real answer.
      if (!write.meta.changes) return json({ error: 'slow down' }, 429);
      return json({ ok: true, rev });
    }

    return json({ error: 'not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
