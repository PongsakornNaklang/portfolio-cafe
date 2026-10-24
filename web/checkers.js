// Thai checkers (หมากฮอส): rules and a bot. The board is 64 squares, index r * 8 + c; row 0 is the bot's back row.
// You are side 1 (moving up, toward row 0), the bot side -1. A square holds 0, ±1 (a man) or ±2 (a king, ฮอส).
// Rules: 8 men each on the dark squares of the two back rows; men step and capture diagonally forward only; a man that
// reaches the far row becomes a king; kings fly any distance diagonally and capture by jumping one piece, landing on the
// square right behind it; captures are compulsory and chain on; whoever can't move loses.

const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

export function startBoard() {
  const b = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    const r = i >> 3, c = i & 7;
    if ((r + c) % 2 === 1 && r < 2) b[i] = -1;
    if ((r + c) % 2 === 1 && r > 5) b[i] = 1;
  }
  return b;
}

// every legal move for side: { from, to, path: [squares visited], caps: [squares captured] }; captures only, if any
export function legalMoves(b, side) {
  const caps = [], steps = [];
  for (let i = 0; i < 64; i++) {
    if (Math.sign(b[i]) !== side) continue;
    const king = Math.abs(b[i]) === 2, r = i >> 3, c = i & 7;
    jumps(b, i, i, side, king, [], [i], caps);
    for (const [dr, dc] of DIRS) {
      if (!king && dr !== -side) continue;
      for (let k = 1; on(r + dr * k, c + dc * k) && !b[(r + dr * k) * 8 + c + dc * k]; k++) {
        steps.push({ from: i, to: (r + dr * k) * 8 + c + dc * k, path: [i, (r + dr * k) * 8 + c + dc * k], caps: [] });
        if (!king) break;
      }
    }
  }
  return caps.length ? caps : steps;
}

function jumps(b, start, at, side, king, taken, path, out) {
  let more = false;
  for (const [dr, dc] of DIRS) {
    if (!king && dr !== -side) continue;
    let r = (at >> 3) + dr, c = (at & 7) + dc;
    if (king) while (on(r, c) && (b[r * 8 + c] === 0 || r * 8 + c === start)) { r += dr; c += dc; } // fly over empty squares
    const mid = r * 8 + c, land = (r + dr) * 8 + c + dc;
    if (!on(r, c) || !on(r + dr, c + dc) || Math.sign(b[mid]) !== -side || taken.includes(mid)) continue;
    if (b[land] !== 0 && land !== start) continue;
    more = true;
    jumps(b, start, land, side, king, [...taken, mid], [...path, land], out);
  }
  if (!more && taken.length) out.push({ from: start, to: at, path, caps: taken });
}

export function play(b, m) { // the board after move m (a new array)
  const n = b.slice(), v = n[m.from];
  n[m.from] = 0;
  for (const x of m.caps) n[x] = 0;
  const row = m.to >> 3;
  n[m.to] = Math.abs(v) === 1 && row === (v > 0 ? 0 : 7) ? v * 2 : v; // crowned on the far row
  return n;
}

function score(b, side) { // material from side's point of view: a king is worth three men; men gain a little as they advance
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (!v) continue;
    const r = i >> 3;
    s += Math.abs(v) === 2 ? 3 * Math.sign(v) : Math.sign(v) * (1 + 0.04 * (v > 0 ? 7 - r : r));
  }
  return s * side;
}

function negamax(b, side, depth, alpha, beta) {
  const ms = legalMoves(b, side);
  if (!ms.length) return -1000 - depth; // no moves: lost (sooner is worse)
  if (depth <= 0 && (!ms[0].caps.length || depth < -6)) return score(b, side); // past the horizon, play out pending captures first
  for (const m of ms) {
    alpha = Math.max(alpha, -negamax(play(b, m), -side, depth - 1, -beta, -alpha));
    if (alpha >= beta) break;
  }
  return alpha;
}

// the bot's move. easy: two plies deep, and a random move one time in three. hard: deeper and deeper while it stays under a second
export function botMove(b, side, level) {
  const ms = legalMoves(b, side).sort(() => Math.random() - 0.5); // shuffled: equal moves differ from game to game
  if (!ms.length) return null;
  if (level === "easy" && Math.random() < 0.33) return ms[Math.floor(Math.random() * ms.length)];
  const t0 = performance.now();
  let best = ms[0];
  for (let d = 1; d <= (level === "easy" ? 2 : 12); d++) {
    let top = -Infinity, pick = best;
    for (const m of [best, ...ms.filter((x) => x !== best)]) { // last depth's best first, so cut-offs come sooner
      const v = -negamax(play(b, m), -side, d - 1, -Infinity, -top); // a cut-off move comes back equal to top: never picked
      if (v > top) { top = v; pick = m; }
    }
    best = pick;
    if (performance.now() - t0 > 120) break; // the next depth takes several times longer: stop while it's under ~1 s
  }
  return best;
}
