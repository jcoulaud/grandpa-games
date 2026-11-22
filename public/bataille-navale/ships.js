// The pictures of the bataille navale: the five ships seen from above, the explosion of a hit and
// the splash of a shot in the water. No DOM: each function returns SVG markup.
//
//   Ships.ship(s, down)   ship s of the fleet (0 porte-avions … 4 torpilleur), lying along a row,
//                         or down a column if down is true. One square is 100 units.
//   Ships.hit, Ships.splash   the marks of a shot, drawn in a square
(function (root) {
  'use strict';
  const EDGE = '#1F2A31', HULL = '#7C8A94', DECK = '#AEBAC2', TOP = '#D5DDE2', DARK = '#4F5C65';

  // A hull with a square stern on the left and a pointed bow on the right, between y = t and y = b.
  const hull = (W, t, b, fill = HULL) => {
    const m = (t + b) / 2;
    return `<path d="M10 ${t + 8}Q10 ${t} 20 ${t}L${W - 95} ${t}Q${W - 30} ${t + 2} ${W - 6} ${m}Q${W - 30} ${b - 2} ${W - 95} ${b}L20 ${b}Q10 ${b} 10 ${b - 8}Z" fill="${fill}" stroke="${EDGE}" stroke-width="5" stroke-linejoin="round"/>`;
  };
  const deck = (W, t, b) => {
    const m = (t + b) / 2;
    return `<path d="M22 ${t + 8}L${W - 100} ${t + 8}Q${W - 50} ${t + 10} ${W - 28} ${m}Q${W - 50} ${b - 10} ${W - 100} ${b - 8}L22 ${b - 8}Z" fill="${DECK}"/>`;
  };
  // A gun turret at x, its barrel pointing to dir (1 to the bow, -1 to the stern).
  const turret = (x, dir, r = 15) => `<path d="M${x} 47h${dir * (r + 26)}M${x} 53h${dir * (r + 26)}" stroke="${EDGE}" stroke-width="5" stroke-linecap="round"/>`
    + `<circle cx="${x}" cy="50" r="${r}" fill="${TOP}" stroke="${EDGE}" stroke-width="4.5"/>`;
  const block = (x, w, t, b, fill = TOP) => `<rect x="${x}" y="${t}" width="${w}" height="${b - t}" rx="6" fill="${fill}" stroke="${EDGE}" stroke-width="4.5"/>`;
  const funnel = (x, r = 10) => `<ellipse cx="${x}" cy="50" rx="${r + 4}" ry="${r}" fill="${DARK}" stroke="${EDGE}" stroke-width="4"/><ellipse cx="${x}" cy="50" rx="${r - 3}" ry="${r - 6}" fill="${EDGE}"/>`;
  // A small plane on the deck of the porte-avions.
  const plane = (x, y) => `<path d="M${x - 16} ${y}h32M${x + 4} ${y - 14}v28M${x - 13} ${y - 6}v12" stroke="#E9EEF1" stroke-width="5" stroke-linecap="round"/>`;

  const DRAW = [
    // Porte-avions: a wide flat deck with its runway, two planes and the island on one side.
    W => hull(W, 12, 88, '#6E7B85')
      + `<path d="M24 22H${W - 100}Q${W - 40} 26 ${W - 24} 50Q${W - 40} 74 ${W - 100} 78H24Z" fill="#59656E"/>`
      + `<path d="M40 50H${W - 70}" stroke="#E9EEF1" stroke-width="3.5" stroke-dasharray="22 16"/>`
      + `<path d="M60 68L${W * .55} 34" stroke="#E9EEF1" stroke-width="2.5" stroke-dasharray="12 10" opacity=".7"/>`
      + plane(90, 32) + plane(150, 66) + block(W * .62, 80, 12, 34) + `<path d="M${W * .62 + 40} 14v-8" stroke="${EDGE}" stroke-width="5" stroke-linecap="round"/>`,
    // Croiseur: two turrets at each end, a bridge and a funnel between.
    W => hull(W, 18, 82) + deck(W, 18, 82) + turret(72, -1) + turret(120, -1, 13) + block(170, 70, 32, 68) + funnel(270) + turret(W - 120, 1, 13) + turret(W - 74, 1),
    // Contre-torpilleur: slimmer, one turret at each end, a bridge and two funnels.
    W => hull(W, 24, 76) + deck(W, 24, 76) + turret(62, -1, 12) + funnel(118, 8) + funnel(150, 8) + block(178, 46, 36, 64) + turret(W - 66, 1, 12),
    // Sous-marin: a long dark rounded hull with its tower.
    W => `<rect x="10" y="26" width="${W - 20}" height="48" rx="24" fill="#3C4850" stroke="${EDGE}" stroke-width="5"/>`
      + `<path d="M40 50H${W - 40}" stroke="#56636C" stroke-width="3"/>`
      + `<rect x="${W * .4}" y="35" width="70" height="30" rx="15" fill="#2C353C" stroke="${EDGE}" stroke-width="4"/>`
      + `<path d="M${W * .4 + 22} 50h26" stroke="#7D8C96" stroke-width="4" stroke-linecap="round"/>`,
    // Torpilleur: small, a bridge and one gun at the bow.
    W => hull(W, 26, 74) + deck(W, 26, 74) + block(40, 52, 36, 64) + funnel(112, 7) + turret(W - 56, 1, 11),
  ];
  const SIZES = [5, 4, 3, 3, 2];

  function ship(s, down) {
    const W = SIZES[s] * 100;
    const g = DRAW[s](W);
    return down
      ? `<svg viewBox="0 0 100 ${W}" aria-hidden="true"><g transform="translate(100 0) rotate(90)">${g}</g></svg>`
      : `<svg viewBox="0 0 ${W} 100" aria-hidden="true">${g}</svg>`;
  }

  // A hit: a burst of fire. A shot in the water: white rings and drops. The ring of class "wave"
  // shows only on the last shot, where it spreads out once (see the page's style).
  const hit = '<svg viewBox="0 0 100 100" aria-hidden="true" overflow="visible">'
    + '<circle class="wave" cx="50" cy="50" r="40" fill="none" stroke="#FFB23F" stroke-width="8"/>'
    + '<path d="M50 4l9 22 21-12-6 24 23 6-20 13 15 19-24-3-2 24-16-19-16 19-2-24-24 3 15-19-20-13 23-6-6-24 21 12z" fill="#E8411F" stroke="#7A0D0B" stroke-width="4" stroke-linejoin="round"/>'
    + '<path d="M50 24l6 14 14-6-4 15 14 5-13 7 8 12-15-2-2 14-8-12-8 12-2-14-15 2 8-12-13-7 14-5-4-15 14 6z" fill="#FFB23F"/>'
    + '<circle cx="50" cy="52" r="11" fill="#FFF1A8"/></svg>';
  const splash = '<svg viewBox="0 0 100 100" aria-hidden="true" overflow="visible">'
    + '<circle class="wave" cx="50" cy="50" r="40" fill="none" stroke="#fff" stroke-width="6"/>'
    + '<circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="5"/>'
    + '<circle cx="50" cy="50" r="15" fill="#F4F8FA" stroke="rgba(255,255,255,.6)" stroke-width="6"/>'
    + '<circle cx="18" cy="24" r="5" fill="#F4F8FA"/><circle cx="82" cy="22" r="4" fill="#F4F8FA"/><circle cx="84" cy="78" r="5" fill="#F4F8FA"/><circle cx="20" cy="80" r="4" fill="#F4F8FA"/></svg>';

  root.Ships = { ship, hit, splash };
})(typeof window !== 'undefined' ? window : globalThis);
