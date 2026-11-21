// The size of the page: two buttons, "Réduire" and "Agrandir", that make everything smaller or larger, like the zoom
// of the browser, which few people know. Load this file in the <head> of a page, so the page is drawn
// at its size from the start, and put <div class="zoom"></div> where the buttons go.
//
//   Zoom.z()   the size in use, 1 for 100 %. Positions from the mouse are divided by it.
//
// Media queries see the window, not the size of the page in it. So the page gets classes for what they
// would say: "zoomed" when the size is not 100 %, "narrow" when the page is 1340 px wide or less, where
// the win count goes, and "short" and "low" when it is 660 or 600 px high or less,
// where the dialogs close up. The size is also in --z: a length in vw or vh is divided by it.
//
// The size is kept on the PC and shared by every window: a change in the library reaches an open game.
// It is never larger than the window can hold: 1050 by 520 px of page at least, so every game still
// fits. A phone always stays at 100 %.
(() => {
  'use strict';
  const KEY = 'gg:zoom';
  const STEPS = [0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2];
  const read = () => { try { const v = +JSON.parse(localStorage.getItem(KEY)); return STEPS.includes(v) ? v : 1; } catch (e) { return 1; } };
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const phone = () => innerWidth < 700;
  const max = () => phone() ? 1 : Math.max(1, ...STEPS.filter(s => innerWidth / s >= 1050 && innerHeight / s >= 520));
  const min = () => phone() ? 1 : STEPS[0];
  let wanted = read(), z = 1;

  function apply() {
    const next = Math.min(Math.max(wanted, min()), max());
    const changed = next !== z;
    z = next;
    const root = document.documentElement;
    root.style.zoom = z === 1 ? '' : String(z);
    root.classList.toggle('zoomed', z !== 1);
    root.classList.toggle('narrow', innerWidth / z <= 1340);
    root.classList.toggle('short', innerHeight / z <= 660);
    root.classList.toggle('low', innerHeight / z <= 600);
    root.style.setProperty('--z', String(z));
    document.querySelectorAll('.zoom').forEach(draw);
    // The games lay out their table again, as after a change of the window.
    if (changed && document.readyState !== 'loading') dispatchEvent(new Event('resize'));
  }
  function step(dir) {
    const at = STEPS.indexOf(z);
    const next = STEPS[Math.min(STEPS.length - 1, Math.max(0, at + dir))];
    if (next > max() || next < min()) return;
    wanted = next; write(wanted); apply();
  }

  // Two keys like the other buttons, with a word each and a magnifying glass: no number to read.
  const css = `
  .zoom { flex: none; display: flex; align-items: center; gap: 10px; }
  .zoom button { min-height: 46px; padding: 4px 16px 4px 12px; border-radius: 15px; cursor: pointer;
    display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
    background: #fff; color: #1B2422; border: 2px solid #9AA6A1; box-shadow: 0 3px 0 #9AA6A1; font: 600 21px var(--ui, system-ui); }
  .zoom button svg { width: 26px; height: 26px; flex: none; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
  .zoom button:hover { background: #E8EEEB; }
  .zoom button:active { background: #D5DCD9; box-shadow: none; transform: translateY(3px); }
  .zoom button:focus-visible { outline: 4px solid #fff; outline-offset: 3px; box-shadow: 0 0 0 3px #1B2422; }
  .zoom button:disabled, .zoom button:disabled:hover { background: rgba(255,255,255,.55); color: #6E7874; border: 2px dashed #C9D1CE;
    box-shadow: none; transform: none; cursor: default; }
  @media (max-width: 699px) { .zoom { display: none !important; } }`;
  const glass = sign => `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21M7.5 10.5h6${sign > 0 ? 'M10.5 7.5v6' : ''}"/></svg>`;

  function draw(box) {
    if (!box.firstChild) {
      box.setAttribute('role', 'group');
      box.setAttribute('aria-label', 'Taille de l’affichage');
      box.innerHTML = `<button type="button" data-dir="-1" title="Tout afficher en plus petit">${glass(-1)}Réduire</button>`
        + `<button type="button" data-dir="1" title="Tout afficher en plus grand">${glass(1)}Agrandir</button>`;
      box.addEventListener('click', e => { const b = e.target.closest('button'); if (b) step(+b.dataset.dir); });
    }
    const at = STEPS.indexOf(z);
    box.querySelector('[data-dir="-1"]').disabled = at <= 0 || STEPS[at - 1] < min();
    box.querySelector('[data-dir="1"]').disabled = at >= STEPS.length - 1 || STEPS[at + 1] > max();
  }

  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
  apply();
  addEventListener('DOMContentLoaded', apply);
  addEventListener('resize', apply);
  // Another window changed the size.
  addEventListener('storage', e => { if (e.key === KEY) { wanted = read(); apply(); } });

  window.Zoom = { z: () => z };
})();
