// Latte art: pour steamed milk into an espresso on the counter and try to match a heart or a tulip. This module is
// the coffee's surface; the cup, the jug and the controls are in main.js.
// The cup's surface is a grid of how much milk is at each spot (0 to 1). Pouring at a point pushes everything around
// it outward to make room (area is kept, as in a real cup: the new milk surfaces as a growing white disc); moving the
// jug fast drags the surface along with it (the pull-through that gives a heart its point).
const N = 160; // grid cells across the canvas
const C = N / 2, R = N * 0.47; // the cup's centre and the coffee's radius, in cells
const CAP = 0.62 * Math.PI * R * R; // milk in the jug, as surface area
const RATE = 0.1 * Math.PI * R * R; // poured per second, holding still
// the shapes to aim for, poured by this same simulation (so a good pour can match them exactly): where the jug goes,
// in coffee radii from the centre (+y toward you), and for how long; "pull" is a quick pull-through toward you
const PLANS = {
  heart: [[0, -0.12, 2.6], ["pull", -0.12, 0.78, 0.2]],
  tulip: [[0, 0.32, 0.6], [0, -0.06, 0.5], [0, -0.4, 0.4], ["pull", -0.4, 0.55, 0.1]],
};
const QUIPS = [[85, "Okay… you’re hired. 🤝"], [65, "Not bad at all! I’d serve that."], [40, "It’s… abstract. I like it."], [0, "Tastes the same either way, right? 😅"]];

let milk = new Float32Array(N * N), tmp = new Float32Array(N * N);
const noise = Float32Array.from({ length: N * N }, () => Math.random());
const inCup = (x, y) => (x - C) ** 2 + (y - C) ** 2 < R * R;
function sample(a, x, y) { // bilinear, 0 outside the grid
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const at = (u, v) => (u < 0 || v < 0 || u >= N || v >= N ? 0 : a[v * N + u]);
  return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
}
// pour area dA at (px, py): each spot's milk comes from nearer the spout, so a disc of new milk opens up in the middle
function pour(px, py, dA) {
  const k = dA / Math.PI;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (!inCup(x + 0.5, y + 0.5)) { tmp[i] = 0; continue; }
    const dx = x + 0.5 - px, dy = y + 0.5 - py, d2 = dx * dx + dy * dy, s2 = d2 - k;
    if (s2 <= 0) { tmp[i] = 1; continue; }
    const s = Math.sqrt(s2 / d2);
    tmp[i] = sample(milk, px + dx * s - 0.5, py + dy * s - 0.5);
  }
  [milk, tmp] = [tmp, milk];
}
// the jug moving from a to b drags the surface near it along: a band narrow across the move, short ahead of the jug
// and long behind it (the liquid it passed through follows it). Pulled from the middle of a blob toward you, the
// back of the blob is drawn in (a heart's notch) and the front drawn out (its point)
function drag(ax, ay, bx, by) {
  const mx = bx - ax, my = by - ay, len = Math.hypot(mx, my), ACROSS = N * 0.055, AHEAD = N * 0.05, BEHIND = N * 0.2;
  if (len < 1e-3) return;
  const ux = mx / len, uy = my / len;
  tmp.set(milk);
  const pad = BEHIND * 2.5, x0 = Math.max(0, Math.floor(bx - pad)), x1 = Math.min(N - 1, Math.ceil(bx + pad));
  const y0 = Math.max(0, Math.floor(by - pad)), y1 = Math.min(N - 1, Math.ceil(by + pad));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (!inCup(x + 0.5, y + 0.5)) continue;
    const dx = x + 0.5 - bx, dy = y + 0.5 - by, along = dx * ux + dy * uy, across = dx * uy - dy * ux;
    const L = along > 0 ? AHEAD : BEHIND, w = Math.exp(-(across * across) / (2 * ACROSS * ACROSS) - (along * along) / (2 * L * L));
    if (w < 0.01) continue;
    tmp[y * N + x] = sample(milk, x - mx * w, y - my * w);
  }
  [milk, tmp] = [tmp, milk];
}

// the coffee's surface, as a texture for the cup in the shop: the grid drawn over the whole canvas (the coffee's
// circle fills it edge to edge), with the shape to aim for, faint and dashed
const off = Object.assign(document.createElement("canvas"), { width: N, height: N }), octx = off.getContext("2d");
const img = octx.createImageData(N, N);
const smooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
export const surface = Object.assign(document.createElement("canvas"), { width: 512, height: 512 });
const sctx = surface.getContext("2d");
export function draw(shape) {
  const T = shape && target(shape);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, n = noise[i], rim = Math.min(1, Math.hypot(x + 0.5 - C, y + 0.5 - C) / R);
    const f = smooth(0.35, 0.65, milk[i]), dark = rim ** 3 * 34 - (T && T[i] ? 22 : 0); // crema darkens toward the rim; the target shows paler
    img.data[i * 4] = (122 - dark + n * 10) * (1 - f) + (249 - n * 7) * f;
    img.data[i * 4 + 1] = (74 - dark * 0.7 + n * 7) * (1 - f) + (243 - n * 7) * f;
    img.data[i * 4 + 2] = (38 - dark * 0.4 + n * 4) * (1 - f) + (231 - n * 8) * f;
    img.data[i * 4 + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  const W = surface.width;
  sctx.imageSmoothingEnabled = true;
  sctx.drawImage(off, C - R, C - R, 2 * R, 2 * R, 0, 0, W, W);
}

let left = CAP;
export const jugLeft = () => left / CAP; // 1 full, 0 empty
export function reset() { milk.fill(0); left = CAP; }
// one frame of pouring with the spout over grid point b, having come from a: the surface is dragged along, and milk
// goes in if the spout is over the coffee (the faster you move, the thinner the stream: a pull-through adds little)
export function pourStep(a, b, dt) {
  const speed = Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.max(dt, 1e-3);
  drag(a[0], a[1], b[0], b[1]);
  if (!inCup(b[0], b[1]) || left <= 0) return;
  const dA = Math.min(left, RATE * dt * Math.max(0.15, 1 - speed / (N * 1.2)));
  pour(b[0], b[1], dA);
  left -= dA;
}
// a point on the coffee (x across, z toward you, its radius rw) to the grid
export const toGrid = (lx, lz, rw) => [C + (lx / rw) * R, C + (lz / rw) * R];
export const quip = (score) => QUIPS.find(([s]) => score >= s)[1];

const TARGETS = {};
function target(shape) { // pour the plan once, on a clean cup, and keep where the milk ended up
  if (TARGETS[shape]) return TARGETS[shape];
  const keep = milk.slice(), keepLeft = left;
  milk.fill(0); left = Infinity;
  const at = (x, y) => [C + x * R, C + y * R], DT = 1 / 60;
  for (const step of PLANS[shape]) {
    let last = null; // the jug lifts between pours
    if (step[0] === "pull") {
      const [, y0, y1, t] = step, n = Math.round(t / DT);
      for (let i = 0; i <= n; i++) { const b = at(0, y0 + ((y1 - y0) * i) / n); pourStep(last || b, b, DT); last = b; }
    } else {
      const [x, y, t] = step;
      for (let i = 0; i < t / DT; i++) { const b = at(x + Math.sin(i / 4) * 0.02, y); pourStep(last || b, b, DT); last = b; }
    }
  }
  TARGETS[shape] = Uint8Array.from(milk, (m) => m > 0.5);
  milk.set(keep); left = keepLeft;
  return TARGETS[shape];
}
// spots within r cells of a set spot
function grow(A, r) {
  const B = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (A[y * N + x])
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const u = x + dx, v = y + dy;
      if (dx * dx + dy * dy <= r * r && u >= 0 && v >= 0 && u < N && v < N) B[v * N + u] = 1;
    }
  return B;
}
// how well the milk matches the shape, forgiving a couple of cells: how much of your milk is on the shape and how much
// of the shape you covered, combined, then stretched to 0-100 (a plain round blob still gets about 0.85 of the way)
export function score(shape) {
  const want = target(shape), got = Uint8Array.from(milk, (m) => m > 0.5), wantNear = grow(want, 2), gotNear = grow(got, 2);
  let a = 0, b = 0, aOn = 0, bOn = 0;
  for (let i = 0; i < N * N; i++) { a += got[i]; b += want[i]; aOn += got[i] & wantNear[i]; bOn += want[i] & gotNear[i]; }
  const p = a ? aOn / a : 0, q = bOn / b, f = p + q ? (2 * p * q) / (p + q) : 0;
  return Math.round(Math.max(0, Math.min(1, (f - 0.78) / 0.17)) * 100);
}
