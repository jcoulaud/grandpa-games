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

  // A hit: a burst of fire. A shot in the water: white rings and drops. The part of class "mark" pops up
  // on the last shot (see the page's style).
  const hit = '<svg viewBox="0 0 100 100" aria-hidden="true" overflow="visible">'
    + '<g class="mark"><path d="M50 4l9 22 21-12-6 24 23 6-20 13 15 19-24-3-2 24-16-19-16 19-2-24-24 3 15-19-20-13 23-6-6-24 21 12z" fill="#E8411F" stroke="#7A0D0B" stroke-width="4" stroke-linejoin="round"/>'
    + '<path d="M50 24l6 14 14-6-4 15 14 5-13 7 8 12-15-2-2 14-8-12-8 12-2-14-15 2 8-12-13-7 14-5-4-15 14 6z" fill="#FFB23F"/>'
    + '<circle cx="50" cy="52" r="11" fill="#FFF1A8"/></g></svg>';
  const splash = '<svg viewBox="0 0 100 100" aria-hidden="true" overflow="visible">'
    + '<g class="mark"><circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="5"/>'
    + '<circle cx="50" cy="50" r="15" fill="#F4F8FA" stroke="rgba(255,255,255,.6)" stroke-width="6"/>'
    + '<g class="drops"><circle cx="18" cy="24" r="5" fill="#F4F8FA"/><circle cx="82" cy="22" r="4" fill="#F4F8FA"/><circle cx="84" cy="78" r="5" fill="#F4F8FA"/><circle cx="20" cy="80" r="4" fill="#F4F8FA"/></g></g></svg>';

  // Each square is 100 units. The extra room lets the splash and fire spread over the water.
  const effect = art => '<svg viewBox="0 0 300 300" aria-hidden="true">' + art + '</svg>';
  const incoming = effect('<g class="incoming">'
    + '<circle cx="150" cy="150" r="43" fill="#FFC83D" fill-opacity=".16" stroke="#1F2A31" stroke-width="9"/>'
    + '<circle cx="150" cy="150" r="43" fill="none" stroke="#FFC83D" stroke-width="5"/>'
    + '<path d="M150 98v17m0 70v17m-52-52h17m70 0h17" stroke="#FFF1A8" stroke-width="5" stroke-linecap="round"/></g>');

  // The sideways and vertical motions run together. The values are in SVG units and milliseconds.
  const flight = (dx, rise, end, time, wait, art) =>
    `<g class="flight" style="--dx:${dx}px;--rise:${rise}px;--end:${end}px;--time:${time}ms;--wait:${wait}ms"><g>${art}</g></g>`;
  const drops = [
    [-92, 65, 26], [-65, 102, 29], [-40, 76, 16], [-16, 109, 28],
    [22, 93, 32], [50, 110, 17], [79, 67, 30], [106, 56, 24],
  ].map(([dx, rise, end], n) => flight(dx, rise, end, 600 + 24 * (n % 4), 75 + 22 * (n % 3),
    `<path d="M0-10C-3-5-8 1-8 6A8 8 0 0 0 8 6C8 1 3-5 0-10Z" transform="translate(150 148) rotate(${dx * .38})" fill="${n % 2 ? '#EAF9FF' : '#A7E0FA'}"/>`)).join('');
  const water = effect(
    '<ellipse class="ripple" cx="150" cy="165" rx="63" ry="24" fill="none" stroke="#D6F4FF" stroke-width="5" stroke-dasharray="112 10 51 9"/>'
    + '<ellipse class="ripple late" cx="150" cy="165" rx="73" ry="28" fill="none" stroke="#F4FBFF" stroke-width="4" stroke-dasharray="78 8 102 14"/>'
    + '<g class="column"><path d="M100 165C113 153 116 124 117 108C128 115 127 135 132 138C132 105 139 78 154 55C150 91 168 100 167 136C175 128 177 109 187 102C185 131 192 151 200 165Q150 190 100 165Z" fill="#82CFF4" stroke="#C4EDFF" stroke-width="4" stroke-linejoin="round"/>'
    + '<path d="M118 163C143 148 132 117 151 83C146 115 163 125 154 153Q176 155 185 163Q151 177 118 163Z" fill="#EFFAFF"/>'
    + '<path d="M108 165Q124 175 139 172M159 173Q181 171 193 163" fill="none" stroke="#F4FBFF" stroke-width="5" stroke-linecap="round"/></g>'
    + drops);

  const sparks = [
    [-108, 34, 31], [-83, 74, 3], [-57, 53, 47], [-28, 95, -2],
    [24, 89, 10], [54, 57, 43], [81, 79, 6], [115, 34, 19],
  ].map(([dx, rise, end], n) => flight(dx, rise, end, 475 + 35 * (n % 4), 28 + 20 * (n % 3),
    n % 3 === 0
      ? '<path d="M145 144l12 2-2 11-11-3Z" fill="#52362D" stroke="#FFA245" stroke-width="2.5"/>'
      : `<path d="M150 ${140 - n % 2 * 4}l4 9-4 8-4-8Z" transform="rotate(${dx * .48} 150 150)" fill="${n % 2 ? '#FFE391' : '#FF8F32'}"/>`)).join('');
  const smoke = [
    [131, 141, 20, -26, 250], [157, 129, 23, 15, 290], [168, 148, 16, 32, 355],
  ].map(([x, y, r, drift, wait]) =>
    `<g class="smoke" style="--drift:${drift}px;--wait:${wait}ms"><circle cx="${x}" cy="${y}" r="${r}" fill="#27333B"/><circle cx="${x - 4}" cy="${y - 5}" r="${r * .65}" fill="#47545D"/></g>`).join('');
  const fire = big => effect(
    `<g transform="translate(150 150) scale(${big ? 1.2 : 1}) translate(-150 -150)">`
    + '<path class="flash" d="M150 68l13 53 47-24-28 42 51 11-51 13 28 42-47-24-13 51-13-51-47 24 28-42-51-13 51-11-28-42 47 24Z" fill="#FFF4BD"/>'
    + '<g class="ball"><path d="M98 165C83 145 96 123 114 124C111 102 133 91 146 108C150 92 164 90 170 81C181 100 174 110 174 115C193 108 205 126 200 140C218 143 221 164 204 172C201 191 181 195 166 186C146 205 121 194 119 181C106 184 96 175 98 165Z" fill="#E94522" stroke="#A52318" stroke-width="4"/>'
    + '<path d="M115 159C106 141 123 132 135 136C126 122 143 114 155 123C156 112 167 109 169 102C176 117 171 125 169 130C190 122 199 144 190 152C205 163 193 177 177 170C166 189 150 184 143 173C129 183 113 173 115 159Z" fill="#FF9C30"/>'
    + '<path d="M137 161C126 152 136 142 148 145C145 135 155 132 160 123C169 134 166 141 164 144C180 137 189 155 174 161C171 173 155 176 149 165Q142 172 137 161Z" fill="#FFE691"/>'
    + '<path d="M149 154Q149 147 158 149Q163 143 169 151Q168 162 158 161Z" fill="#FFF8DB"/></g>'
    + '</g>' + sparks + smoke);
  const fx = { incoming, eau: water, touche: fire(false), coule: fire(true) };

  root.Ships = { ship, hit, splash, fx };
})(typeof window !== 'undefined' ? window : globalThis);
