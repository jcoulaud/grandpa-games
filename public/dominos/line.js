// Where each domino of the line lies on the table. No DOM: the page and the tests load it.
//
// The line grows from the domino that opened the manche, near the middle of the table, along one row. When an
// end reaches the side of the table, its next domino stands across the turn, under (or over) the last half,
// and the line comes back along a new row, as on a real table. The right end turns down, the left end
// turns up, so the two ends never meet. A double lies across the line, as players lay it, except at a turn
// or just after one, where there is no room. The page places the opening domino where the line stays
// lowest (best), so a long line takes two rows rather than three, and its dominoes stay large.
//
// The sizes are in units: a domino is 2 units long and 1 unit wide. Rows are 3 units apart.
//   DominoLine.layout(line, first, C, off) -> [{ i, x, y, w, h, dir, vi, vo, ghost }]
//     line, first: as in engine.js. C: the width of the table in units (8 or more). off: how far the
//     opening domino stands right of the middle, in units, so a long side has more room on its row.
//     i: the index of the domino in line; ghost: 'L' or 'R' for the free place after each end.
//     x, y: the top left corner; the opening domino is centred on (off, 0), the table runs from -C/2 to C/2.
//     dir: the way the line goes through the domino, E W S N, or X for a double across a row. vi is the
//     number on the side it comes from (towards the opening domino), vo the number on the far side.
//   DominoLine.bounds(rects) -> { minX, maxX, minY, maxY }
//   DominoLine.best(line, first, C, prefer) -> { off, rects, bounds }: the place of the opening domino that
//     keeps the line lowest; at equal height the one nearest prefer (the place before), then the middle.
(function (root) {
  'use strict';

  function layout(line, first, C, off = 0) {
    const rects = [];
    if (!line.length) return rects;
    const s = line[first], startDouble = s.l === s.r, half = startDouble ? .5 : 1;
    rects.push(startDouble ? { i: first, x: off - .5, y: -1, w: 1, h: 2, dir: 'X', vi: s.l, vo: s.r }
      : { i: first, x: off - 1, y: -.5, w: 2, h: 1, dir: 'E', vi: s.l, vo: s.r });
    const right = line.slice(first + 1).map((x, k) => ({ i: first + 1 + k, vi: x.l, vo: x.r }));
    const left = line.slice(0, first).map((x, k) => ({ i: k, vi: x.r, vo: x.l })).reverse();
    chain([...right, { ghost: 'R' }], off + half, 1);
    chain([...left, { ghost: 'L' }], off - half, -1);
    return rects;

    // d = 1: the right end, going right and turning down; d = -1: the left end, going left and turning up.
    function chain(list, cursor, d) {
      const E = C / 2;
      let dir = d, row = 0, turned = false;
      for (const it of list) {
        const double = !it.ghost && it.vi === it.vo;
        const yc = row * 3 * d;
        // Across the row only with room for one more domino after it, so a double never stands at a turn.
        const across = double && !turned && (dir > 0 ? cursor + 3 <= E : cursor - 3 >= -E);
        const len = across ? 1 : 2;
        if (dir > 0 ? cursor + len <= E : cursor - len >= -E) {
          const x = dir > 0 ? cursor : cursor - len;
          rects.push(across ? { ...it, x, y: yc - 1, w: 1, h: 2, dir: 'X' } : { ...it, x, y: yc - .5, w: 2, h: 1, dir: dir > 0 ? 'E' : 'W' });
          cursor += dir * len;
          turned = false;
        } else {
          // The turn: standing under (or over) the last half of the row, towards the next row.
          const x = dir > 0 ? cursor - 1 : cursor;
          rects.push({ ...it, x, y: d > 0 ? yc + .5 : yc - 2.5, w: 1, h: 2, dir: d > 0 ? 'S' : 'N' });
          row++; dir = -dir; turned = true;
        }
      }
    }
  }

  function bounds(rects) {
    let minX = 0, maxX = 0, minY = 0, maxY = 0;
    for (const r of rects) {
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.x + r.w);
      minY = Math.min(minY, r.y); maxY = Math.max(maxY, r.y + r.h);
    }
    return { minX, maxX, minY, maxY };
  }

  function best(line, first, C, prefer = 0) {
    let pick = null;
    const room = Math.floor(C / 2) - 3;
    for (let off = -room; off <= room; off++) {
      const rects = layout(line, first, C, off), b = bounds(rects), h = b.maxY - b.minY;
      const k = [h, Math.abs(off - prefer), Math.abs(off)];
      if (!pick || k[0] < pick.k[0] - 1e-9 || (Math.abs(k[0] - pick.k[0]) < 1e-9 && (k[1] < pick.k[1] || (k[1] === pick.k[1] && k[2] < pick.k[2]))))
        pick = { off, rects, bounds: b, k };
    }
    return pick;
  }

  root.DominoLine = { layout, bounds, best };
})(typeof window !== 'undefined' ? window : globalThis);
