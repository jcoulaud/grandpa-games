// Helpers shared by the API routes.

export const VISIT_DAYS = 90; // daily visits are kept this long, and the admin chart covers them

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

// The UTC day, YYYY-MM-DD, `back` days before `now`. Statistics are counted per UTC day.
export const utcDay = (now: number, back = 0) => new Date(now - back * 86_400_000).toISOString().slice(0, 10);

// The network a request comes from: the IPv4 address, or the /64 prefix of an IPv6 address,
// because one IPv6 user usually holds a whole /64.
export function network(request: Request): string {
  const ip = request.headers.get('CF-Connecting-IP') ?? '';
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [], t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 4).join(':') + '::/64';
}
