// Playing cards for every card game: names in French, the suit shapes, and the face drawings.
// A card id is 0..51: suit = id / 13 (pique, cœur, carreau, trèfle), rank = id % 13 + 1 (1 = as, 13 = roi).
// Link lib/cards.css too. The suit shapes are SVG symbols #su0..#su3, added to the page here.
(() => {
'use strict';
const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'V', 'D', 'R'];
const RANK_NAMES = ['', 'as', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'valet', 'dame', 'roi'];
const SUIT_NAMES = ['pique', 'cœur', 'carreau', 'trèfle'];
const SUIT_PLURALS = ['piques', 'cœurs', 'carreaux', 'trèfles'];
const rk = id => id % 13 + 1;
const st = id => (id / 13) | 0;
const rd = id => st(id) === 1 || st(id) === 2;
const cap = s => s[0].toUpperCase() + s.slice(1);
function cardName(id) {
  const r = rk(id);
  return (r === 1 ? "l'" : r === 12 ? 'la ' : 'le ') + RANK_NAMES[r] + ' de ' + SUIT_NAMES[st(id)];
}
// The faces are drawn here. Suits are the SVG symbols su0..su3, so they look the same on every PC.
const suitHtml = s => `<svg class="s" viewBox="0 0 100 100"><use href="#su${s}"/></svg>`;
const pip = (s, x, y, d) => `<use href="#su${s}" x="${x - d / 2}" y="${y - d / 2}" width="${d}" height="${d}"/>`;
// Pip places in an 88 x 84 box: [x, y] per pip, then the pip size.
const PIPS = (() => {
  const Lx = 18, C = 44, R = 70, pair = y => [[Lx, y], [R, y]];
  const three = [12, 42, 72].flatMap(pair), four = [11, 31.5, 52, 72.5].flatMap(pair);
  return {
    // The 2 and the 3 go on a diagonal, away from the corner suit: in one column under it,
    // the corner suit read as one more pip.
    2: [[[64, 18], [24, 66]], 32], 3: [[[67, 13], [C, 42], [21, 71]], 25],
    4: [[...pair(18), ...pair(66)], 28], 5: [[...pair(16), [C, 42], ...pair(68)], 26],
    6: [three, 23], 7: [[...three, [C, 27]], 22], 8: [[...three, [C, 27], [C, 57]], 22],
    9: [[...four, [C, 42]], 19.5], 10: [[...four, [C, 21], [C, 62.5]], 19.5],
  };
})();
// Court cards: a flat bust in the suit colour. The valet wears a feathered cap,
// the dame long hair and a pearl diadem, the roi a tall crown and a beard.
function court(r, s) {
  const red = s === 1 || s === 2, P = red ? '#C4122F' : '#1C2B45', bg = red ? '#FCEDE9' : '#E9EDF3';
  const G = '#E0A526', GD = '#8A5F00', SK = '#F2CFA8', SK2 = '#E0B58A', H = '#4A3222', IV = '#FFFDF6', INK = '#14171A';
  const eyes = `<circle cx="39.6" cy="36.5" r="1.5" fill="${INK}"/><circle cx="48.4" cy="36.5" r="1.5" fill="${INK}"/>`;
  const robe = `<path d="M8 82C9 63 26 56 44 56s35 7 36 26z" fill="${P}"/>`;
  const neck = `<rect x="39" y="46" width="10" height="13" fill="${SK2}"/>`;
  let fig;
  if (r === 13) fig = `${robe}
    <path d="M22 61c8-6 17-5 22 2 5-7 14-8 22-2l2 11c-8-6-18-5-24 3-6-8-16-9-24-3z" fill="${IV}" stroke="${INK}" stroke-width=".6"/>
    <g fill="${INK}"><ellipse cx="29" cy="65" rx="1.1" ry="2"/><ellipse cx="36" cy="66.5" rx="1.1" ry="2"/><ellipse cx="52" cy="66.5" rx="1.1" ry="2"/><ellipse cx="59" cy="65" rx="1.1" ry="2"/></g>
    <path d="M30 30c-2 10 0 18 4 23h20c4-5 6-13 4-23z" fill="${H}"/>${neck}
    <ellipse cx="44" cy="38" rx="11.5" ry="13" fill="${SK}"/>
    <path d="M32.5 39c.5 14 5.5 21 11.5 21s11-7 11.5-21c-2.5 5-6.5 6.5-11.5 6.5S35 44 32.5 39z" fill="${H}"/>
    <path d="M40.5 48.5q3.5 2 7 0" fill="none" stroke="${SK}" stroke-width="1.5" stroke-linecap="round"/>${eyes}
    <path d="M28 27L26 9l9 8 9-12 9 12 9-8-2 18z" fill="${G}" stroke="${GD}" stroke-width=".8" stroke-linejoin="round"/>
    <rect x="27.5" y="23" width="33" height="5" rx="1" fill="${P}"/>
    <g fill="${P}"><circle cx="26" cy="9" r="2.4"/><circle cx="44" cy="5" r="2.4"/><circle cx="62" cy="9" r="2.4"/></g><circle cx="44" cy="25.5" r="1.7" fill="${G}"/>`;
  else if (r === 12) fig = `<path d="M26 39c0-18 8-25 18-25s18 7 18 25c0 12 3 20 9 26H17c6-6 9-14 9-26z" fill="${H}"/>${robe}
    <path d="M32 57.5L44 73l12-15.5c-5-2-19-2-24 0z" fill="${SK}"/>${neck}
    <path d="M34.5 59q9.5 9 19 0" fill="none" stroke="${G}" stroke-width="1.8"/>
    <ellipse cx="44" cy="38.5" rx="10.5" ry="12.5" fill="${SK}"/>
    <path d="M33.5 36c0-9 5-12 10.5-12s10.5 3 10.5 12c-3-5-6.5-7-10.5-7s-7.5 2-10.5 7z" fill="${H}"/>${eyes}
    <circle cx="37.5" cy="42.5" r="2.2" fill="#E58F7C" opacity=".6"/><circle cx="50.5" cy="42.5" r="2.2" fill="#E58F7C" opacity=".6"/>
    <path d="M41 45.5q3 2.6 6 0q-3 1-6 0z" fill="#C4122F" stroke="#C4122F" stroke-width=".8" stroke-linejoin="round"/>
    <path d="M32 23l-1-11 6.5 5L44 8l6.5 9 6.5-5-1 11z" fill="${G}" stroke="${GD}" stroke-width=".8" stroke-linejoin="round"/>
    <g fill="${IV}" stroke="${GD}" stroke-width=".7"><circle cx="31" cy="12" r="2"/><circle cx="44" cy="8" r="2"/><circle cx="57" cy="12" r="2"/></g>`;
  else fig = `${robe}
    <path d="M27 59l17 6 17-6 2 9-19 8-19-8z" fill="${IV}" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>
    <path d="M30 31c-2 10-1 17 2 23h24c3-6 4-13 2-23z" fill="${H}"/>${neck}
    <ellipse cx="44" cy="39" rx="11" ry="13" fill="${SK}"/>${eyes}
    <path d="M40.5 46q3.5 2.6 7 0" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M58 22C60 9 70 3 81 5c-4 7-10 14-21 20z" fill="${IV}" stroke="${INK}" stroke-width=".6" stroke-linejoin="round"/>
    <path d="M59.5 23.5Q68 11 79 6" fill="none" stroke="${G}" stroke-width="1.1"/>
    <path d="M29 29C25 15 38 8 49 10s15 9 11 19z" fill="${P}"/>
    <rect x="28" y="26" width="33" height="5" rx="1" fill="${G}" stroke="${GD}" stroke-width=".7"/>`;
  // The bust is enlarged from its top edge and cut by the frame. The suit sits on a brooch at the collar.
  return `<rect x="1" y="1" width="86" height="82" rx="7" fill="${bg}"/>
    <g clip-path="url(#courtClip)"><g transform="translate(44 4) scale(1.15) translate(-44 -4)">${fig}</g></g>
    <circle cx="44" cy="75.5" r="6.8" fill="${IV}" stroke="${G}" stroke-width="1.5"/><g fill="${P}">${pip(s, 44, 75.5, 9.5)}</g>
    <rect x="1" y="1" width="86" height="82" rx="7" fill="none" stroke="${P}" stroke-width="1.6"/>`;
}
function faceSvg(id) {
  const s = st(id), r = rk(id);
  let g;
  if (r === 1) g = `<circle cx="44" cy="42" r="39" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="44" cy="42" r="35" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray=".1 4.3" stroke-linecap="round"/>${pip(s, 44, 42, 50)}`;
  else if (r > 10) g = court(r, s);
  else g = PIPS[r][0].map(([x, y]) => pip(s, x, y, PIPS[r][1])).join('');
  return `<svg viewBox="0 0 88 84" aria-hidden="true">${g}</svg>`;
}

document.body.insertAdjacentHTML('afterbegin', `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <symbol id="su0" viewBox="0 0 100 100"><path d="M50 5C62 26 95 40 95 61c0 12-10 20-21 20-8 0-15-4-19-11 1 11 6 20 13 26H32c7-6 12-15 13-26-4 7-11 11-19 11C15 81 5 73 5 61 5 40 38 26 50 5z"/></symbol>
  <symbol id="su1" viewBox="0 0 100 100"><path d="M50 92C22 66 5 50 5 31 5 17 16 7 29 7c9 0 17 5 21 14 4-9 12-14 21-14 13 0 24 10 24 24 0 19-17 35-45 61z"/></symbol>
  <symbol id="su2" viewBox="0 0 100 100"><path d="M50 2Q69 29 91 50Q69 71 50 98Q31 71 9 50Q31 29 50 2z"/></symbol>
  <symbol id="su3" viewBox="0 0 100 100"><circle cx="50" cy="26" r="21"/><circle cx="26" cy="58" r="21"/><circle cx="74" cy="58" r="21"/><path d="M40 40h20v20H40z"/><path d="M46 56c0 18-5 31-13 40h34c-8-9-13-22-13-40z"/></symbol>
  <clipPath id="courtClip"><rect x="1" y="1" width="86" height="82" rx="7"/></clipPath>
</defs></svg>`);

window.Cards = { RANKS, RANK_NAMES, SUIT_NAMES, SUIT_PLURALS, rk, st, rd, cap, cardName, suitHtml, pip, faceSvg };
})();
