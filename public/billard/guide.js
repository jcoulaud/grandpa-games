// The balls of the trays and the pictures of the rules guide, drawn like the game: the blue cloth, the walnut
// rails, the balls with their numbers. The pictures are only pictures: nothing in them can be clicked.
import { COLOURS } from './table.js';
const rgb = (id) => 'rgb(' + (COLOURS[id > 8 ? id - 8 : id] ?? [250, 247, 236]).join(',') + ')';

// A ball of a tray: its colour, a white band for a stripe, its number in a white disc.
export const trayBall = (id, sunk = false, extra = '') =>
  `<span class="mb${id > 8 ? ' stripe' : ''}${sunk ? ' in' : ''}${extra ? ' ' + extra : ''}" style="--c:${rgb(id)}" title="${id === 8 ? 'La noire' : 'La ' + id}"><b>${id}</b></span>`;

// A ball in an SVG picture, r in the units of the picture.
function ball(id, x, y, r) {
  const c = id === 0 ? '#FAF7EC' : rgb(id);
  let s = `<circle cx="${x + r * 0.18}" cy="${y + r * 0.26}" r="${r * 1.05}" fill="#001A33" opacity=".35"/>`;
  s += `<circle cx="${x}" cy="${y}" r="${r}" fill="${id > 8 ? '#FAF7EC' : c}"/>`;
  if (id > 8)
    s += `<clipPath id="st${id}-${x | 0}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath><rect x="${x - r}" y="${y - r * 0.5}" width="${2 * r}" height="${r}" fill="${c}" clip-path="url(#st${id}-${x | 0})"/>`;
  if (id > 0)
    s += `<circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="#fff"/><text x="${x}" y="${y + r * 0.2}" font-size="${r * (id > 9 ? 0.55 : 0.62)}" text-anchor="middle" fill="#16181A">${id}</text>`;
  s += `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#shine)"/>`;
  return s;
}
const DEFS = `<defs><radialGradient id="shine" cx=".34" cy=".3" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
<radialGradient id="clothG" cx=".5" cy=".45" r=".8"><stop offset="0" stop-color="#3586C2"/><stop offset="1" stop-color="#1F5F95"/></radialGradient></defs>`;
// A corner of the table: the cloth, the rails along the top and the right, and the corner pocket.
const corner = (w, h) =>
  `<rect x="0" y="0" width="${w}" height="${h}" rx="14" fill="#5C2F17"/><rect x="0" y="22" width="${w - 22}" height="${h - 22}" fill="url(#clothG)"/>` +
  `<rect x="0" y="22" width="${w - 22}" height="8" fill="#000" opacity=".18"/><rect x="${w - 30}" y="22" width="8" height="${h - 22}" fill="#000" opacity=".18"/>` +
  `<circle cx="${w - 26}" cy="26" r="25" fill="#0B0705"/><circle cx="${w - 26}" cy="26" r="25" fill="none" stroke="#1E120B" stroke-width="5"/>`;
const cue = (x, y, angle) =>
  `<g transform="translate(${x} ${y}) rotate(${angle})"><rect x="-262" y="-5" width="236" height="10" rx="5" fill="#E2C38A"/><rect x="-262" y="-6" width="110" height="12" rx="6" fill="#1E1512"/><rect x="-32" y="-5" width="7" height="10" fill="#E8E2D6"/><rect x="-27" y="-5" width="3" height="10" fill="#3F6EA8"/></g>`;
const dots = (x1, y1, x2, y2, colour) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#001A33" stroke-opacity=".45" stroke-width="8" stroke-linecap="round" stroke-dasharray="0.1 18"/><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colour}" stroke-width="5" stroke-linecap="round" stroke-dasharray="0.1 18"/>`;
const ring = (x, y, r) =>
  `<circle cx="${x}" cy="${y}" r="${r + 2}" fill="none" stroke="#1B2422" stroke-width="8"/><circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#FFC83D" stroke-width="6"/>`;
const hand = (x, y) => `<use href="#kit-hand" x="${x}" y="${y}" width="40" height="48"/>`;
const svg = (w, h, inner) => `<svg class="bl-cloth" viewBox="0 0 ${w} ${h}">${DEFS}${inner}</svg>`;

const PICS = {
  // Click on the 3: the cue turns to it, the white dots lead to it and the gold dots to the pocket.
  aim: () =>
    svg(520, 230,
      corner(520, 230) +
        dots(130, 170, 344, 104, '#fff') +
        `<circle cx="344" cy="104" r="20" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="6 5"/>` +
        dots(380, 92, 482, 40, '#FFC83D') +
        cue(130, 170, -17) +
        ball(0, 130, 170, 20) +
        ball(3, 382, 92, 20) +
        ring(382, 92, 33) +
        hand(392, 104)),
  // The two families and the black last.
  groups: () =>
    `<div class="bl-row">Pleines ${[1, 2, 3, 4, 5, 6, 7].map((id) => trayBall(id)).join('')}</div>` +
    `<div class="bl-row">Rayées ${[9, 10, 11, 12, 13, 14, 15].map((id) => trayBall(id)).join('')}</div>` +
    `<div class="bl-row">Puis ${trayBall(8)}</div>`,
  // The white falls into the pocket: a foul. The other player then places it where he wants.
  foul: () =>
    svg(520, 230,
      corner(520, 230) +
        dots(230, 200, 470, 52, '#fff') +
        `<circle cx="494" cy="26" r="16" fill="#FAF7EC" opacity=".55"/>` +
        `<path d="M478 64 l18 -14 m0 0 l-4 18" stroke="#FF6B5E" stroke-width="5" fill="none" stroke-linecap="round"/>` +
        `<circle cx="120" cy="150" r="34" fill="none" stroke="#FFC83D" stroke-width="5" stroke-dasharray="10 7"/>` +
        ball(0, 120, 150, 20) +
        ball(11, 300, 120, 20) +
        `<text x="120" y="215" font-size="22" text-anchor="middle" fill="#FFF4D6">En main</text>`)
};

export function drawGuide() {
  for (const el of document.querySelectorAll('#help [data-pic]')) el.innerHTML = PICS[el.dataset.pic]?.() ?? '';
}
