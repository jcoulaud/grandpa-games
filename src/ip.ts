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
