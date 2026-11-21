// The rules of the jeu de dames and the computer player, without a browser.
// The positions come from the FMJD rules: each one checks every legal route.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/dames/engine.js');
const D = globalThis.Dames;
let fails = 0;
const ok = (c, m, extra = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (c ? '' : ' ' + extra)); if (!c) fails++; };

// A board from two lists of squares: "12,K28" is a man on 12 and a king on 28.
function board(white, black) {
  const b = new Array(51).fill(0);
  const put = (list, side) => String(list).split(',').filter(Boolean).forEach(s => {
    const king = s.startsWith('K'); b[+s.replace('K', '')] = side * (king ? 2 : 1);
  });
  put(white, 1); put(black, -1);
  return b;
}
// Every route as "12x21x32" (a capture) or "46-41" (a quiet move).
const routes = ms => ms.flatMap(m => m.routes.map(r => m.from + (m.caps.length ? 'x' : '-') + r.path.join('x'))).sort();
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// 1. The opening tree: the published counts (perft) of international draughts.
const perft = (b, t, d) => d ? D.moves(b, t).reduce((n, m) => n + perft(D.apply(b, m), -t, d - 1), 0) : 1;
const counts = [9, 81, 658, 4265, 27117, 167140];
counts.forEach((n, i) => ok(perft(D.startBoard(), 1, i + 1) === n, `opening moves at depth ${i + 1}: ${n}`));

// 2. Legal moves. turn -1: black to move. moves: the number of distinct moves, when routes share one.
const CASES = [
  ['backward capture, no quiet move', '28,40', '32', 1, ['28x37']],
  ['a man takes backwards', '32', '37', 1, ['32x41']],
  ['two men beat one king', '12,K28', '17,27,K39', 1, ['12x21x32']],
  ['two men beat one king, again', '32,35', '17,27,K30', 1, ['32x21x12']],
  ['equal count, free choice', '38,K15', '32,K10', 1, ['15x4', '38x27']],
  ['equal count, king or man', '32,K46', '27,K41', 1, ['32x21', '46x37']],
  ['a king flies, a piece on the edge cannot be taken', 'K1', '45', 1, ['1-12', '1-18', '1-23', '1-29', '1-34', '1-40', '1-6', '1-7']],
  ['a king lands anywhere beyond', 'K46', '23', 1, ['46x10', '46x14', '46x19', '46x5']],
  ['two pieces side by side cannot be jumped', 'K46', '32,37', 1, ['46-41']],
  ['a friendly piece blocks the king', '37,K46', '32', 1, ['37x28']],
  ['two jumps on one line', 'K28', '14,23', 1, ['28x19x10', '28x19x5']],
  ['only one landing keeps the most pieces', 'K46', '23,24', 1, ['46x19x30', '46x19x35']],
  ['only one landing keeps the most pieces, again', 'K46', '24,28', 1, ['46x19x30', '46x19x35']],
  ['a taken piece blocks the way back', 'K17', '11,39', 1, ['17x44', '17x50', '17x6']],
  ['a taken piece blocks the way back, again', 'K28', '22,33', 1, ['28x11', '28x17', '28x39', '28x44', '28x50', '28x6']],
  ['a man that passes over the last row stays a man', '13', '7,8', 1, ['13x2x11']],
  ['the same, from the other side', '11', '7,8', 1, ['11x2x13']],
  ['a man that ends on the last row crowns, and cannot fly yet', '13', '8,11', 1, ['13x2']],
  ['crowned on the second visit of the last row', '11', '7,8,9', 1, ['11x2x13x4']],
  ['six routes, three moves', 'K46', '19,32', 1, ['46x23x10', '46x23x14', '46x23x5', '46x28x10', '46x28x14', '46x28x5']],
  ['three routes, one move', 'K15', '24,41,42', 1, ['15x29x47x36', '15x33x47x36', '15x38x47x36']],
  ['back to the start square', '42', '27,28,37,38', 1, ['42x31x22x33x42', '42x33x22x31x42']],
  ['back to the start square, again', '28', '12,13,22,23', 1, ['28x17x8x19x28', '28x19x8x17x28']],
  ['blocked: no move', '6', '1', 1, []],
  ['blocked with a man on the board', '46', '37,41', 1, []],
  ['black crowns on a quiet move', '26', '41', -1, ['41-46', '41-47']],
  ['black moves down', '32', '21', -1, ['21-26', '21-27']],
];
for (const [name, w, b, turn, want] of CASES) {
  const got = routes(D.moves(board(w, b), turn));
  ok(same(got, want), name, `got ${got.join(' ')}, want ${want.join(' ')}`);
}
// Routes that take the same pieces and end on the same square are one move.
ok(D.moves(board('K15', '24,41,42'), 1).length === 1, 'three routes count as one move');
ok(D.moves(board('K46', '19,32'), 1).length === 3, 'six routes count as three moves');
ok(D.moves(board('42', '27,28,37,38'), 1).length === 1, 'two routes back to the start count as one move');
// The same end square with different pieces taken: different moves.
{
  const ms = D.moves(board('K25', '7,8,19,20'), 1);
  const ends = ms.map(m => m.to + ':' + m.caps.join(','));
  ok(ms.length >= 2 && new Set(ms.map(m => m.to)).size < ms.length, 'same end square, different pieces taken: ' + ends.join(' '));
  const ms2 = D.moves(board('K27', '13,32,33,39'), 1);
  ok(ms2.length === 4, 'four moves when the end squares are shared: ' + routes(ms2).join(' '));
}
// Crowning
{
  let b = D.apply(board('13', '8,11'), D.moves(board('13', '8,11'), 1)[0]);
  ok(b[2] === 2 && b[11] === -1 && b[8] === 0, 'the man crowns on 2, the piece on 11 stays');
  const m = D.moves(board('13', '7,8'), 1)[0];
  b = D.apply(board('13', '7,8'), m);
  ok(b[11] === 1, 'a man that only passed over the last row stays a man');
  const back = D.moves(board('42', '27,28,37,38'), 1)[0];
  b = D.apply(board('42', '27,28,37,38'), back);
  ok(b[42] === 1 && [27, 28, 37, 38].every(n => b[n] === 0), 'a move back to the start square keeps the piece and takes all four');
}

// 3. Results and draws.
const game = (w, b, turn = 1, extra = {}) => {
  const bd = board(w, b);
  return Object.assign({ b: bd, turn, quiet: 0, endLeft: D.endLimit(bd), reps: { [D.key(bd, turn)]: 1 }, result: null }, extra);
};
const playStr = (G, s) => {
  const [from, ...path] = s.split(/[-x]/).map(Number);
  const m = D.moves(G.b, G.turn).find(m => m.from === from && m.routes.some(r => r.path.join() === path.join()));
  if (!m) throw new Error('illegal ' + s);
  return D.advance(G, m);
};
{
  let G = game('K46,K47', 'K3,K4');
  G.endLeft = null; // two kings each: no short ending
  const seq = ['47-42', '3-9', '42-47', '9-3'];
  for (let i = 0; i < 4; i++) G = playStr(G, seq[i]);
  ok(!G.result, 'the position comes back a second time: the game goes on');
  for (let i = 0; i < 3; i++) G = playStr(G, seq[i]);
  ok(!G.result, 'seven plies: the game goes on');
  G = playStr(G, seq[3]);
  ok(G.result && G.result.winner === 0 && G.result.why === 'repeat', 'the third time, the game is drawn');
  ok(D.key(board('K1', 'K50'), 1) !== D.key(board('K1', 'K50'), -1), 'the side to move changes the key');
  ok(D.key(board('K1', 'K50'), 1) !== D.key(board('1', 'K50'), 1), 'a man and a king have different keys');
}
{
  let G = game('K1,K2,30', 'K49,K50,21', 1, { quiet: 48 });
  G = playStr(G, '1-6');
  ok(!G.result && G.quiet === 49, '49 quiet king plies: the game goes on');
  G = playStr(G, '50-45');
  ok(G.result && G.result.why === 'quiet', 'the 50th quiet king ply draws, with men on the board');
  G = game('K1,K2,30', 'K49,K50,21', 1, { quiet: 49 });
  G = playStr(G, '30-25');
  ok(!G.result && G.quiet === 0, 'a man move resets the count');
  G = game('K46,K2,30', 'K1,23,21', 1, { quiet: 49 });
  G = playStr(G, '46x19');
  ok(!G.result && G.quiet === 0, 'a capture resets the count');
}
{
  // Three kings against one: 16 moves each, so the 32nd ply after the ending began draws.
  for (const w of ['K47,K48,K49', 'K47,K48,39', 'K47,38,39']) {
    let G = game(w, 'K3');
    ok(G.endLeft === 32, `${w} against a lone king: 32 plies`, 'got ' + G.endLeft);
    G.endLeft = 2;
    const m1 = D.moves(G.b, 1).find(m => Math.abs(G.b[m.from]) === 2 && !m.caps.length);
    G = D.advance(G, m1);
    ok(!G.result && G.endLeft === 1, `${w}: the 31st ply lets the game go on`);
    G = D.advance(G, D.moves(G.b, -1).find(m => !m.caps.length));
    ok(G.result && G.result.why === 'ending', `${w}: the 32nd ply draws`, JSON.stringify(G.result));
  }
  ok(game('38,39,40', 'K3').endLeft === null, 'three men against a king: no limit');
  ok(game('K47,K48,K49', 'K5').endLeft === 10, 'the lone king alone on the long diagonal: 10 plies');
  ok(game('K47,K48,K46', 'K5').endLeft === 32, 'the long diagonal shared: 32 plies');
  ok(game('K47,K48', 'K3').endLeft === 10, 'two kings against one: 10 plies');
  ok(game('K47,38', 'K3').endLeft === 10, 'a king and a man against one: 10 plies');
  ok(game('K47', 'K3').endLeft === 10, 'a king against a king: 10 plies');
  ok(game('47,48', 'K3').endLeft === null, 'two men against a king: no limit');
  // A capture into a smaller ending keeps the nearer deadline.
  let G = game('K18,K23,K33', 'K17', -1, { endLeft: 7 });
  G = playStr(G, '17x39');
  ok(!G.result && G.endLeft === 6, 'a capture keeps the earlier deadline: 6 plies left', 'got ' + G.endLeft);
  // A capture that leaves no such ending keeps the deadline: here black takes the only white king.
  G = game('K18,46,47', 'K12', -1, { endLeft: 1 });
  G = playStr(G, '12x23');
  ok(G.result && G.result.why === 'ending', 'a capture out of the ending keeps its deadline', JSON.stringify(G.result) + ' ' + G.endLeft);
  // A win on the last allowed ply is a win.
  G = game('K32', 'K23', 1, { endLeft: 1 });
  G = playStr(G, '32x19');
  ok(G.result && G.result.winner === 1, 'taking the last piece on the last ply wins');
}
{
  let G = playStr(game('K30', '24', 1), '30x19');
  ok(G.result && G.result.winner === 1 && G.result.why === 'taken', 'taking the last piece wins', JSON.stringify(G.result));
  G = playStr(game('15,46', '5', 1), '46-41');
  ok(!G.result, 'black still has a move');
  const blocked = playStr(game('15,14', '5', 1), '15-10');
  ok(blocked.result && blocked.result.winner === 1 && blocked.result.why === 'blocked', 'blocking the last pieces wins', JSON.stringify(blocked.result));
}

// 4. The computer.
{
  const G = game('32', '21', -1);
  let all = true;
  for (let i = 0; i < 10; i++) { const r = D.think(G, { time: 400, depth: 6 }); if (r.move.to !== 26) all = false; }
  ok(all, 'Moyen does not give a man away: 21-26, not 21-27');
  const G2 = game('28', '23,19', -1);
  const r2 = D.think(G2, { time: 300, depth: 6 });
  ok(r2 && r2.move, 'the computer finds a move in a small position');
  // Facile keeps the captures compulsory: its choice is always legal.
  let legal = true;
  let H = D.newGame();
  for (let i = 0; i < 40 && !H.result; i++) {
    const r = D.think(H, H.turn === 1 ? { time: 100, depth: 2, spread: 80 } : { time: 100, depth: 4 });
    if (!D.moves(H.b, H.turn).some(m => m.from === r.move.from && m.to === r.move.to && m.caps.join() === r.move.caps.join())) legal = false;
    H = D.advance(H, r.move);
  }
  ok(legal, '40 plies of computer play are all legal');
  const t0 = Date.now();
  D.think(D.newGame(), { time: 300 });
  ok(Date.now() - t0 < 600, `the search stops on time (${Date.now() - t0} ms for 300 ms)`);
}

if (fails) { console.log(`\n${fails} FAILED`); process.exit(1); }
console.log('\nAll rules tests passed');
