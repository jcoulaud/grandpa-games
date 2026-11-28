// The picture of the pendu: a daisy in a terracotta pot on a windowsill, in front of a morning sky. Each letter
// that is not in the word makes one petal fall onto the sill, so the game never shows a hanged man. No game rules
// here: the page and the rules guide only draw with it.
//
//   Daisy.svg({ petals, fallen, id })   the whole picture as SVG markup: petals on the flower, fallen on the sill
//   Daisy.ORDER[n]                      the order in which the n petals fall, so the flower stays balanced
//   Daisy.petalAt(n, i)                 where petal i of n sits: { x, y, a } in the picture, its middle and angle
//   Daisy.spot(k)                       where the k-th fallen petal lies on the sill: { x, y, a }
(function (root) {
  'use strict';
  const CX = 150, CY = 116, R0 = 21, L = 68;
  // Each next petal falls far from the one before, so the flower never looks bald on one side.
  const ORDER = { 10: [0, 5, 3, 8, 1, 6, 4, 9, 2, 7], 8: [0, 4, 2, 6, 1, 5, 3, 7], 6: [0, 3, 1, 4, 2, 5] };
  const order = n => ORDER[n] || [...Array(n).keys()];
  // Petal i points this way, in degrees from straight up; petal 0 points right.
  const angle = (n, i) => 90 + i * 360 / n;
  const width = n => n >= 10 ? 14 : n >= 8 ? 17 : 21;
  // A petal drawn around its own middle, its tip up.
  const petalPath = w => `M0 ${L / 2}C${-w} ${L * .22} ${-w * 1.05} ${-L * .3} 0 ${-L / 2}C${w * 1.05} ${-L * .3} ${w} ${L * .22} 0 ${L / 2}Z`;
  function petalAt(n, i) {
    const a = angle(n, i), r = R0 + L / 2 - 5, rad = a * Math.PI / 180;
    return { x: CX + Math.sin(rad) * r, y: CY - Math.cos(rad) * r, a };
  }
  // The places on the sill, left and right of the pot in turn. The sill is seen from a little above: a petal
  // lying on it is flattened.
  const SPOTS = [[64, 298, 78], [238, 300, -64], [92, 303, 104], [264, 297, 70], [38, 302, -82],
    [210, 303, 96], [76, 307, -70], [250, 306, 112], [48, 296, 60], [226, 296, -100]];
  const spot = k => { const [x, y, a] = SPOTS[k % SPOTS.length]; return { x, y, a }; };

  function svg({ petals = 10, fallen = 0, id = 'daisy' } = {}) {
    const n = petals, w = width(n), gone = new Set(order(n).slice(0, fallen));
    const p = id + '-';
    const onFlower = [...Array(n).keys()].filter(i => !gone.has(i)).map(i => {
      const { x, y, a } = petalAt(n, i);
      return `<g class="petal" data-i="${i}" transform="translate(${(x - CX).toFixed(2)} ${(y - CY).toFixed(2)}) rotate(${a})"><path d="${petalPath(w)}" fill="url(#${p}petal)"/><path class="vein" d="M0 ${L * .36}V${-L * .3}"/></g>`;
    }).join('');
    const onSill = [...Array(fallen).keys()].map(k => {
      const s = spot(k);
      return `<g class="lying" transform="translate(${s.x} ${s.y}) scale(.92 .5) rotate(${s.a})"><path d="${petalPath(w)}" fill="url(#${p}petal)"/></g>`;
    }).join('');
    // The seeds of the heart, on a spiral, as in a real daisy.
    const seeds = [...Array(34).keys()].map(k => {
      const r = 2.6 * Math.sqrt(k + .5), t = k * 2.39996;
      return `<circle cx="${(Math.cos(t) * r).toFixed(2)}" cy="${(Math.sin(t) * r).toFixed(2)}" r="1.25"/>`;
    }).join('');
    return `<svg class="daisy" viewBox="0 0 300 360" aria-hidden="true" focusable="false">
<defs>
  <linearGradient id="${p}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BFE0F6"/><stop offset=".62" stop-color="#E6F3FA"/><stop offset="1" stop-color="#F7F4E4"/></linearGradient>
  <radialGradient id="${p}sun" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="#FFE9A6"/><stop offset="1" stop-color="#FFE9A6" stop-opacity="0"/></radialGradient>
  <linearGradient id="${p}petal" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#E9EEF3"/><stop offset=".35" stop-color="#FFFFFF"/><stop offset="1" stop-color="#FBFCFE"/></linearGradient>
  <radialGradient id="${p}heart" cx=".38" cy=".34" r=".7"><stop offset="0" stop-color="#FFE27A"/><stop offset=".6" stop-color="#F6B51E"/><stop offset="1" stop-color="#D9890E"/></radialGradient>
  <linearGradient id="${p}pot" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#A84A26"/><stop offset=".32" stop-color="#D9774A"/><stop offset=".55" stop-color="#C45F35"/><stop offset="1" stop-color="#8E3C1E"/></linearGradient>
  <linearGradient id="${p}sill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E8C595"/><stop offset=".25" stop-color="#D4A671"/><stop offset="1" stop-color="#B98553"/></linearGradient>
  <clipPath id="${p}win"><rect x="14" y="14" width="272" height="290" rx="10"/></clipPath>
</defs>
<rect width="300" height="360" rx="18" fill="#FFFDF6"/>
<g clip-path="url(#${p}win)">
  <rect x="14" y="14" width="272" height="290" fill="url(#${p}sky)"/>
  <circle cx="236" cy="66" r="44" fill="url(#${p}sun)"/><circle cx="236" cy="66" r="21" fill="#FFE07A"/>
  <g class="cloud c1" fill="#fff" opacity=".9"><ellipse cx="70" cy="66" rx="30" ry="12"/><ellipse cx="88" cy="58" rx="20" ry="13"/><ellipse cx="58" cy="60" rx="14" ry="10"/></g>
  <g class="cloud c2" fill="#fff" opacity=".75"><ellipse cx="186" cy="118" rx="24" ry="9"/><ellipse cx="200" cy="111" rx="15" ry="10"/></g>
  <path d="M14 246C60 222 98 228 140 240S228 226 286 236V304H14z" fill="#CFE5B8"/>
  <path d="M14 268C70 250 120 262 170 266S250 250 286 258V304H14z" fill="#B3D597"/>
  <path d="M14 286C80 276 150 284 210 282S270 276 286 280V304H14z" fill="#9CC87F"/>
</g>
<rect x="14" y="14" width="272" height="290" rx="10" fill="none" stroke="#E3D6BE" stroke-width="2"/>
<g class="plant">
  <path class="stem" d="M150 236C145 206 157 178 151 ${CY + 12}" fill="none" stroke="#4D8A39" stroke-width="6" stroke-linecap="round"/>
  <path d="M149 208C132 196 116 198 106 206C120 214 136 214 149 208z" fill="#5FA046"/><path d="M149 208C134 205 120 205 108 206" stroke="#3E7A2C" stroke-width="1.5" fill="none"/>
  <path d="M152 188C166 172 184 170 194 176C182 188 166 190 152 188z" fill="#6AAE4F"/><path d="M152 188C166 182 180 178 192 177" stroke="#3E7A2C" stroke-width="1.5" fill="none"/>
  <g class="flower" transform="translate(${CX} ${CY})">
    <g class="petals">${onFlower}</g>
    <circle r="${R0 + 2}" fill="url(#${p}heart)" stroke="#C47B0C" stroke-width="1.2"/>
    <g fill="#B8700C" opacity=".55">${seeds}</g>
  </g>
</g>
<rect x="104" y="230" width="92" height="18" rx="4" fill="#C9663D"/><rect x="104" y="230" width="92" height="5" rx="2.5" fill="#E08A5E"/>
<ellipse cx="150" cy="233" rx="38" ry="3.2" fill="#5B3A26"/>
<path d="M110 248H190L181 302H119z" fill="url(#${p}pot)"/>
<path d="M121 254H129L125 296H119z" fill="#fff" opacity=".18"/>
<rect x="6" y="300" width="288" height="22" rx="4" fill="url(#${p}sill)"/>
<rect x="10" y="322" width="280" height="12" rx="3" fill="#A07047"/>
<path d="M6 303H294" stroke="#F3DDB6" stroke-width="2" opacity=".7"/>
<ellipse cx="150" cy="303" rx="44" ry="4" fill="#6E4A2C" opacity=".28"/>
<g class="sill">${onSill}</g>
<g class="fly"></g>
</svg>`;
  }
  // The butterfly of a won game: two pairs of wings and a body, centred on its body.
  const BUTTERFLY = `<g class="bfly"><g class="wing wl"><path d="M0 0C-8 -16 -26 -22 -30 -10C-33 0 -16 4 0 0z" fill="#F2A23C" stroke="#9A5A12" stroke-width="1.2"/><path d="M0 1C-6 8 -20 18 -24 10C-27 4 -12 2 0 1z" fill="#F7C062" stroke="#9A5A12" stroke-width="1.2"/><circle cx="-19" cy="-9" r="2.6" fill="#fff" opacity=".85"/></g><g class="wing wr"><path d="M0 0C8 -16 26 -22 30 -10C33 0 16 4 0 0z" fill="#F2A23C" stroke="#9A5A12" stroke-width="1.2"/><path d="M0 1C6 8 20 18 24 10C27 4 12 2 0 1z" fill="#F7C062" stroke="#9A5A12" stroke-width="1.2"/><circle cx="19" cy="-9" r="2.6" fill="#fff" opacity=".85"/></g><path d="M0 -9V9" stroke="#3B2A1A" stroke-width="3.2" stroke-linecap="round"/><path d="M0 -9C-3 -15 -6 -17 -8 -18M0 -9C3 -15 6 -17 8 -18" stroke="#3B2A1A" stroke-width="1.2" fill="none"/></g>`;

  root.Daisy = { svg, ORDER, order, petalAt, spot, petalPath, width, BUTTERFLY, CX, CY };
})(typeof window !== 'undefined' ? window : globalThis);
