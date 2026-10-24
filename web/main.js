import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cards, site, drinks } from "./content.js?v=10";
import { createSound, createStreetLife } from "./life.js?v=10";

// ---------------------------------------------------------------- time of day (visitor's clock; ?time=night to test)
const PRESETS = {
  //       sky        sun colour  sun   sun dir (toward the sun)   hemi  emissive  lamps
  day:    { sky: 0xbfe3ff, sun: 0xfff4e6, sunI: 1.9, dir: [-0.53, 0.57, 0.63], hemi: 0.55, emit: 0.35, lamp: 3 },
  sunset: { sky: 0xf6c7a1, sun: 0xffad6b, sunI: 1.4, dir: [-0.83, 0.28, 0.48], hemi: 0.4, emit: 0.5, lamp: 4 },
  night:  { sky: 0x2a3866, sun: 0x9db3ff, sunI: 0.12, dir: [-0.53, 0.57, 0.63], hemi: 0.18, emit: 0.9, lamp: 6 },
};
const h = new Date().getHours();
const timeKey = new URLSearchParams(location.search).get("time") || (h >= 6 && h < 17 ? "day" : h >= 17 && h < 19 ? "sunset" : "night");
const P = PRESETS[timeKey] || PRESETS.day;
document.body.style.background = "#" + P.sky.toString(16).padStart(6, "0");

// ---------------------------------------------------------------- renderer, scene, lights
const renderer = new THREE.WebGLRenderer({ antialias: true });
const phone = matchMedia("(pointer: coarse)").matches || Math.min(innerWidth, innerHeight) < 600;
renderer.setPixelRatio(Math.min(devicePixelRatio, phone ? 1.5 : 2)); // phones: fewer pixels, steadier frame rate
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NoToneMapping; // like Blender's "Standard" view: keeps the sign's lemon yellow saturated
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(P.sky);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // something for the polished metal to mirror
scene.environmentIntensity = timeKey === "night" ? 0.1 : 0.3;

scene.add(new THREE.HemisphereLight(P.sky, 0xd8d2c6, P.hemi));
const sun = new THREE.DirectionalLight(P.sun, P.sunI);
sun.position.set(...P.dir).multiplyScalar(30);
sun.target.position.set(0.9, 0, 0);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(phone ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -6, near: 1, far: 70 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
// warm counter spots inside the shop (glTF coords: x, up, -y); the pendant lamps get their own lights after loading
for (const [x, y, z] of [[-1.6, 3.2, -3.4], [2.6, 2.8, -1.2]]) {
  const l = new THREE.PointLight(0xffd6a0, P.lamp, 6, 1.6);
  l.position.set(x, y, z);
  scene.add(l);
}

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);

// ---------------------------------------------------------------- load the shop
const [gltf, rig] = await Promise.all([
  new GLTFLoader()
    .setDRACOLoader(new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/"))
    .loadAsync("storefront.glb"),
  fetch("rig.json").then((r) => r.json()),
]);
scene.add(gltf.scene);
gltf.scene.traverse((o) => {
  if (!o.isMesh) return;
  const m = o.material;
  o.castShadow = !m.transparent;
  o.receiveShadow = true;
  if (m.emissiveIntensity !== undefined && m.emissive && m.emissive.getHex() !== 0) m.emissiveIntensity *= P.emit;
});
// ---------------------------------------------------------------- props that react: lamps, clock, record, door, board
const D = THREE.MathUtils.degToRad;
const firstMesh = (o) => (o.isMesh ? o : o.getObjectByProperty("isMesh", true));
const lamps = [0, 1].map((i) => {
  const o = scene.getObjectByName(`HOT_lamp_${i}`);
  const light = new THREE.PointLight(0xffd6a0, P.lamp, 6, 1.6);
  light.position.copy(o.getWorldPosition(new THREE.Vector3())).y -= 0.15;
  scene.add(light);
  const mesh = firstMesh(scene.getObjectByName(`pendant_bulb_${i}`));
  mesh.material = mesh.material.clone(); // each lamp switches on its own
  return { o, light, mesh, glow: mesh.material.emissiveIntensity, on: true };
});
function toggleLamp(o) {
  const l = lamps.find((x) => x.o === o);
  l.on = !l.on;
  l.light.visible = l.on;
  l.mesh.material.emissiveIntensity = l.on ? l.glow : 0;
}

const hourHand = scene.getObjectByName("clock_hour"), minuteHand = scene.getObjectByName("clock_minute");
function animateClock() { // the visitor's real time; hands turn clockwise as seen from the street (about -Z in glTF)
  const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60;
  minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
  hourHand.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
}

const recordSpin = ["HOT_record_disc", "HOT_record_label"].map((n) => scene.getObjectByName(n));
const musicOn = () => (audio ? !audio.paused : !!synth?.on);

const door = scene.getObjectByName("HOT_door");
let doorOpen = false, doorAmt = 0;

// guestbook board: visitors draw in a window; the drawing is painted onto the board (kept in this browser)
const boardMesh = firstMesh(scene.getObjectByName("HOT_board_panel"));
boardMesh.material = boardMesh.material.clone();
const BOARD_BG = "#2b4c8c";
function paintBoard(src) {
  const tex = new THREE.CanvasTexture(src);
  tex.flipY = false; // glTF UV convention
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  boardMesh.material.map = tex;
  boardMesh.material.color.set(0xffffff);
  boardMesh.material.needsUpdate = true;
}
try {
  const saved = localStorage.getItem("nakang-board");
  if (saved) { const img = new Image(); img.onload = () => paintBoard(img); img.src = saved; }
} catch {}

document.getElementById("loading").style.opacity = 0;
setTimeout(() => document.getElementById("loading").remove(), 600);

// ---------------------------------------------------------------- scroll walk: from across the street up to the shop window
// ponytail: the Blender PATH_walk runs past the end of the modelled street, so the walk goes from the wide
// toy-diorama shot (CAM_front) to the window shot (CAM_close), drifting in from the left like a passer-by.
const [front, close] = [rig.cams.CAM_front.pos, rig.cams.CAM_close.pos].map((p) => new THREE.Vector3(...p));
const walk = new THREE.CatmullRomCurve3([front, new THREE.Vector3(-1.2, 2.6, 12.5), new THREE.Vector3(-0.4, 2.2, 9.5), close]);
const shopFront = new THREE.Vector3(0.6, 2.0, 0);
const ease = (t) => t * t * (3 - 2 * t);
// with the door open the page grows and the walk carries on: to the door, through it, and round to the counter
const inside = new THREE.CatmullRomCurve3([close, new THREE.Vector3(3.2, 1.8, 3.2), new THREE.Vector3(4.16, 1.65, 0.4),
  new THREE.Vector3(4.0, 1.6, -0.9), new THREE.Vector3(2.9, 1.6, -1.3)]);
const doorLook = new THREE.Vector3(4.16, 1.55, -1.5), counterLook = new THREE.Vector3(-1.0, 1.75, -1.6);
const scrollEl = document.getElementById("scroll");
const OUT = 3, IN = 4; // screen-heights of scrolling for the street walk and the walk inside
let progress = 0, inProgress = 0;
let director = null; // { pos, look, fov } while the tour or the table owns the camera
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camFov = 30, camReady = false;
function placeCamera() {
  const t = THREE.MathUtils.clamp(scrollY / (OUT * innerHeight), 0, 1);
  const u = doorOpen ? THREE.MathUtils.clamp((scrollY - OUT * innerHeight) / (IN * innerHeight), 0, 1) : 0;
  progress += (t - progress) * 0.12; // a little lag so the walk feels like steps, not a slider
  inProgress += (u - inProgress) * 0.12;
  const look = shopFront.clone().setY(THREE.MathUtils.lerp(2.6, 1.9, ease(progress)));
  if (inProgress > 0.001) {
    camera.position.copy(inside.getPoint(inProgress));
    look.lerp(doorLook, ease(Math.min(inProgress / 0.45, 1))).lerp(counterLook, ease(THREE.MathUtils.clamp((inProgress - 0.45) / 0.55, 0, 1)));
  }
  let pos = inProgress > 0.001 ? inside.getPoint(inProgress) : walk.getPoint(progress);
  // the Blender shots are framed for 4:3; on a tall phone screen widen the view so the shop still fits across
  let fov = THREE.MathUtils.lerp(THREE.MathUtils.lerp(rig.cams.CAM_front.fov, rig.cams.CAM_close.fov, ease(progress)), 58, ease(inProgress));
  if (director) { pos = director.pos; look.copy(director.look); fov = director.fov; }
  const k0 = camReady ? 0.07 : 1; // fly smoothly between shots
  camPos.lerp(pos, k0); camLook.lerp(look, k0); camFov += (fov - camFov) * k0;
  camReady = true;
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  const k = Math.max(1, (4 / 3) / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camFov) / 2) * k));
  camera.updateProjectionMatrix();
  const hint = document.getElementById("hint");
  hint.textContent = t > 0.9 && doorOpen ? "Scroll to step inside ↓" : "Scroll to walk to the shop ↓";
  hint.style.opacity = director || (t > 0.9 && !doorOpen) || u > 0.95 ? 0 : 1;
}

function shotOf(o, dist = 2.6) {
  const c = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
  const pos = new THREE.Vector3(c.x * 0.75 + close.x * 0.25, c.y + 0.35, Math.max(c.z + dist, 2.4)); // stay outside the glass
  // aim a little low so the object sits in the upper half, clear of the tour card at the bottom
  return { pos, look: c.clone().add(new THREE.Vector3(0, -0.12 * pos.distanceTo(c), 0)), fov: 34 };
}
function lockScroll(on) { document.documentElement.style.overflow = on ? "hidden" : ""; }

function toggleDoor() {
  doorOpen = !doorOpen;
  if (doorOpen) scrollEl.style.height = (OUT + IN + 1) * 100 + "vh";
  else { // step back out to the window first, then shrink the page
    if (scrollY > OUT * innerHeight) scrollTo({ top: OUT * innerHeight });
    scrollEl.style.height = (OUT + 1) * 100 + "vh";
  }
}
function animateProps(dt) {
  doorAmt += ((doorOpen ? 1 : 0) - doorAmt) * Math.min(1, dt * 5);
  door.rotation.y = -ease(doorAmt) * D(95); // swings into the shop on its right-hand hinge
  if (musicOn()) for (const o of recordSpin) o.rotation.y -= dt * 3.5; // 33⅓ rpm
  animateClock();
}

// ---------------------------------------------------------------- hotspots: hover tip, click -> speech bubble
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = document.getElementById("tip");
const LABEL = { about: "About me", skills: "Menu", hello: "Say hi", music: "Music on / off", guestbook: "Write on the board",
  contact: "Contact", clock: "What time is it?", lamp: "Light on / off" };

function hotspotAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // nearest solid surface wins: clicks pass through the shop glass (except the door's own glass),
  // but a wall or counter in front blocks whatever is behind it
  for (const h of ray.intersectObject(gltf.scene, true)) {
    let hot = null;
    for (let o = h.object; o && !hot; o = o.parent) if (o.userData.hotspot) hot = o;
    if (hot) return hot;
    if (!h.object.material?.transparent) return null;
  }
  return null;
}

addEventListener("pointermove", (e) => {
  const o = hotspotAt(e.clientX, e.clientY);
  renderer.domElement.style.cursor = o ? "pointer" : "";
  tip.style.opacity = o ? 1 : 0;
  if (o) {
    const k = o.userData.hotspot;
    tip.textContent = k === "sip" ? "Take a sip" : k === "door" ? (doorOpen ? "Close the door" : "Open the door") : LABEL[k] || cards[k]?.title || k;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
  }
});

let bubble = null;
addEventListener("click", (e) => {
  if (bubble?.contains(e.target) || e.target.closest?.("#tour, #help, #board, #mute, #seatbar")) return;
  bubble?.remove();
  bubble = null;
  const o = hotspotAt(e.clientX, e.clientY);
  if (!o) return;
  const key = o.userData.hotspot;
  if (key === "sip") return sip();
  feedback(o, !["hello", "skills", "door", "clock", "lamp", "guestbook"].includes(key)); // flat or hanging things: sound + buzz only
  tip.style.opacity = 0;
  const r = screenRect(o);
  if (key === "music") return toggleMusic(r);
  if (key === "door") return toggleDoor();
  if (key === "lamp") return toggleLamp(o);
  if (key === "guestbook") return openBoard();
  if (key === "clock") {
    const d = new Date();
    return showBubble({ title: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      body: d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) }, r);
  }
  if (key === "about") { wave(); return showBubble({ ...cards.about, actions: [{ label: "☕ Order a drink", run: () => drinkMenu(r) }] }, r); }
  const c = cards[key];
  if (c) showBubble(c, r);
});

// the object's on-screen box, so a bubble can sit next to it instead of on top of it
const _box = new THREE.Box3(), _v = new THREE.Vector3();
function screenRect(o) {
  _box.setFromObject(o);
  const r = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(camera);
    const x = (_v.x + 1) / 2 * innerWidth, y = (1 - _v.y) / 2 * innerHeight;
    r.left = Math.min(r.left, x); r.right = Math.max(r.right, x); r.top = Math.min(r.top, y); r.bottom = Math.max(r.bottom, y);
  }
  return r;
}

// above the object if it fits, else beside it (the side with more room), else below; never over it
function showBubble(c, r, ttl = 0) {
  bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.setAttribute("role", "dialog");
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
  bubble.innerHTML =
    `<button class="x" aria-label="Close">×</button><h2>${esc(c.title)}</h2>` +
    (c.body ? `<p>${esc(c.body)}</p>` : "") +
    (c.rows ? `<table>${c.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table>` : "") +
    [].concat(c.link || [], c.links || []).map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(" ") +
    (c.actions ? `<div class="acts">${c.actions.map((a, i) => `<button class="btn" data-act="${i}">${esc(a.label)}</button>`).join("")}</div>` : "");
  document.body.append(bubble);
  bubble.querySelectorAll("[data-act]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); c.actions[+b.dataset.act].run(); }));
  bubble.querySelector(".x").onclick = () => { bubble.remove(); bubble = null; };
  const w = bubble.offsetWidth, hgt = bubble.offsetHeight, gap = 20, m = 16;
  const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  const clampX = (x) => THREE.MathUtils.clamp(x, m, innerWidth - w - m);
  const clampY = (y) => THREE.MathUtils.clamp(y, m, innerHeight - hgt - m);
  let left, top, tail = "down";
  if (r.top - gap - hgt >= m) { left = clampX(cx - w / 2); top = r.top - gap - hgt; }
  else if (Math.max(r.left, innerWidth - r.right) - gap - w >= m) {
    const right = innerWidth - r.right >= r.left;
    left = right ? r.right + gap : r.left - gap - w; top = clampY(cy - hgt / 2); tail = right ? "left" : "right";
  } else if (innerHeight - r.bottom - gap - hgt >= m) { left = clampX(cx - w / 2); top = r.bottom + gap; tail = "up"; }
  else { left = clampX(cx - w / 2); top = m; tail = "none"; } // tiny screen and a huge object: pin to the top
  bubble.style.left = left + "px";
  bubble.style.top = top + "px";
  bubble.dataset.tail = tail;
  bubble.style.setProperty("--tail", (tail === "down" || tail === "up" ? THREE.MathUtils.clamp(cx - left, 24, w - 24) : THREE.MathUtils.clamp(cy - top, 24, hgt - 24)) + "px");
  if (ttl) { const b = bubble; setTimeout(() => { b.remove(); if (bubble === b) bubble = null; }, ttl); }
}
addEventListener("keydown", (e) => { if (e.key === "Escape") { bubble?.remove(); bubble = null; } });
addEventListener("scroll", () => { if (bubble && !bubble.dataset.keep) { bubble.remove(); bubble = null; } }, { passive: true });

document.getElementById("help").onclick = (e) => { e.stopPropagation(); startTour(true); };

// ---------------------------------------------------------------- click feedback: a soft pop, a tiny buzz on phones, a squash-bounce
let fx = null;
const bouncing = new Map();
function feedback(o, bounce = true) {
  navigator.vibrate?.(12);
  try {
    fx ??= new AudioContext();
    const t = fx.currentTime, osc = fx.createOscillator(), g = fx.createGain();
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(fx.destination);
    osc.start(t);
    osc.stop(t + 0.13);
  } catch {}
  if (!bounce) return;
  if (!bouncing.has(o)) bouncing.set(o, { rest: o.scale.clone(), t0: 0 });
  bouncing.get(o).t0 = performance.now();
}
function animateBounces(now) {
  for (const [o, b] of bouncing) {
    const t = (now - b.t0) / 1000;
    const k = t < 0.45 ? Math.sin(t * Math.PI * 4.4) * 0.07 * (1 - t / 0.45) : 0; // ponytail: damped sine, no tween lib
    o.scale.set(b.rest.x * (1 - k * 0.5), b.rest.y * (1 + k), b.rest.z * (1 - k * 0.5));
    if (t >= 0.45) bouncing.delete(o);
  }
}

function openBoard() {
  const dlg = document.getElementById("board");
  const cv = document.getElementById("board-canvas"), ctx = cv.getContext("2d");
  const fresh = () => { ctx.fillStyle = BOARD_BG; ctx.fillRect(0, 0, cv.width, cv.height); };
  fresh();
  const tex = boardMesh.material.map;
  if (tex?.image) ctx.drawImage(tex.image, 0, 0, cv.width, cv.height); // keep drawing on what's already there
  let ink = "#f4f2ec", size = 6, last = null;
  const at = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * cv.width / b.width, (e.clientY - b.top) * cv.height / b.height]; };
  cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); last = at(e); cv.onpointermove(e); };
  cv.onpointermove = (e) => {
    if (!last) return;
    const p = at(e);
    ctx.strokeStyle = ink; ctx.lineWidth = size; ctx.lineCap = ctx.lineJoin = "round"; ctx.globalAlpha = 0.92; // chalky
    ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke();
    last = p;
  };
  cv.onpointerup = cv.onpointercancel = () => { last = null; };
  dlg.querySelectorAll("[data-ink]").forEach((b) => (b.onclick = () => {
    ink = b.dataset.ink; size = ink === BOARD_BG ? 26 : 6; // the board colour works as an eraser
    dlg.querySelectorAll("[data-ink]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  }));
  document.getElementById("board-clear").onclick = fresh;
  document.getElementById("board-cancel").onclick = () => dlg.close();
  document.getElementById("board-done").onclick = () => {
    const copy = document.createElement("canvas");
    copy.width = cv.width; copy.height = cv.height;
    copy.getContext("2d").drawImage(cv, 0, 0);
    paintBoard(copy);
    try { localStorage.setItem("nakang-board", copy.toDataURL("image/png")); } catch {}
    dlg.close();
  };
  dlg.showModal();
}

// ---------------------------------------------------------------- music: the record player toggles it
let audio = null, synth = null;
function toggleMusic(r) {
  if (site.musicUrl) {
    audio ??= Object.assign(new Audio(site.musicUrl), { loop: true, volume: 0.5 });
    audio.paused ? audio.play() : audio.pause();
    return showBubble({ title: audio.paused ? "Music off" : "♪ Music on" }, r, 1400);
  }
  synth ??= lofiSynth();
  synth.toggle();
  showBubble({ title: synth.on ? "♪ Music on" : "Music off" }, r, 1400);
}

// ponytail: a tiny built-in lofi loop (soft chords + dusty beat) until a real track is set in content.js
function lofiSynth() {
  const ac = new AudioContext();
  const out = ac.createGain();
  out.gain.value = 0;
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  out.connect(lp).connect(ac.destination);
  const chords = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]; // Fmaj7 Em7 Dm7 Cmaj7
  const hz = (n) => 440 * 2 ** ((n - 69) / 12);
  const beat = 60 / 72;
  let bar = 0, timer = null;
  function note(f, t, len, type = "triangle", vol = 0.06) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.value = f;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + 0.05);
  }
  function hit(t, f0, len, vol) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(40, t + len);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + len);
  }
  function scheduleBar() {
    const t0 = ac.currentTime + 0.05, ch = chords[bar++ % chords.length];
    ch.forEach((n, i) => note(hz(n), t0 + i * 0.02, beat * 4, "triangle", 0.045));
    note(hz(ch[0] - 12), t0, beat * 2, "sine", 0.12);
    note(hz(ch[2] - 12), t0 + beat * 2.5, beat * 1.5, "sine", 0.1);
    for (let b = 0; b < 4; b++) {
      if (b % 2 === 0) hit(t0 + b * beat, 120, 0.25, 0.35);
      else hit(t0 + b * beat, 900, 0.08, 0.06);
    }
  }
  return {
    on: false,
    toggle() {
      this.on = !this.on;
      ac.resume();
      out.gain.setTargetAtTime(this.on ? 0.8 : 0, ac.currentTime, 0.3);
      clearInterval(timer);
      if (this.on) { scheduleBar(); timer = setInterval(scheduleBar, beat * 4 * 1000); }
    },
  };
}

// ---------------------------------------------------------------- loop
addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// ---------------------------------------------------------------- the character waves when you reach the window, and keeps eye contact
// Mixamo clips on the auto-rigged character: "idle" (Breathing Idle) loops, "wave" (Waving) blends in and back out.
const mixer = new THREE.AnimationMixer(gltf.scene);
const clip = (n) => THREE.AnimationClip.findByName(gltf.animations, n);
const idleAction = mixer.clipAction(clip("idle")).play();
const waveAction = mixer.clipAction(clip("wave"));
waveAction.setLoop(THREE.LoopOnce);
waveAction.clampWhenFinished = true;
mixer.addEventListener("finished", (e) => {
  if (e.action === waveAction) { idleAction.reset().play(); waveAction.crossFadeTo(idleAction, 0.5, false); }
});
let waved = false;
function wave() {
  if (waveAction.isRunning()) return;
  waveAction.reset().play();
  idleAction.crossFadeTo(waveAction, 0.35, false);
}

const headBone = scene.getObjectByName("mixamorigHead");
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _dir = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1); // the character faces the street (+Z)
const look = new THREE.Quaternion();
const headMixed = headBone.quaternion.clone(); // the clip's own head pose, before our look-at offset
function animateCharacter(dt) {
  if (progress > 0.85 && !waved) { waved = true; wave(); }
  if (progress < 0.5) waved = false; // walk away and back to get another hello
  // the mixer only writes a bone when the clip value changes, so put back the clip pose before it runs,
  // otherwise the look-at offset would stack up frame after frame while the clip stands still
  headBone.quaternion.copy(headMixed);
  mixer.update(dt);
  headMixed.copy(headBone.quaternion);
  // eye contact: turn the head toward the camera on top of the clip, within a natural neck range, eased
  headBone.getWorldPosition(_hp);
  _dir.subVectors(camera.position, _hp).normalize();
  _q.setFromUnitVectors(forward, _dir);
  look.slerp(new THREE.Quaternion().rotateTowards(_q, D(30 + 35 * inProgress)), 0.08); // turns further once you're inside
  headBone.parent.getWorldQuaternion(_pq);
  headBone.quaternion.premultiply(_pq.clone().invert().multiply(look).multiply(_pq));
}

// ---------------------------------------------------------------- order a drink, then sit at the corner table
const table = scene.getObjectByName("mcm_table");
const drinkTpl = Object.fromEntries(drinks.map((d) => [d.id, scene.getObjectByName(`TPL_drink_${d.id}`)]));
for (const t of Object.values(drinkTpl)) t?.parent?.remove(t);
let myDrink = null, seated = false;
function drinkMenu(r) {
  bubble?.remove();
  showBubble({ title: "Menu", body: "What can I get you?",
    actions: drinks.map((d) => ({ label: `${d.emoji} ${d.name}`, run: () => order(d) })) }, r);
}
function order(d) {
  bubble?.remove(); bubble = null;
  wave();
  const me = scene.getObjectByName("HOT_character");
  showBubble({ title: `${d.name}, coming right up!`, body: "Take a seat at the corner table." }, screenRect(me), 1800);
  setTimeout(() => sitDown(d), 1900);
}
function sitDown(d) {
  const top = new THREE.Box3().setFromObject(table);
  const c = top.getCenter(new THREE.Vector3());
  myDrink?.parent?.remove(myDrink);
  myDrink = drinkTpl[d.id].clone(true);
  myDrink.position.set(c.x - 0.15, top.max.y, c.z + 0.05);
  myDrink.userData.hotspot = "sip";
  myDrink.userData.level = 1;
  gltf.scene.add(myDrink); // inside gltf.scene so taps find it
  seated = true;
  lockScroll(true);
  // sitting on the chair by the bookshelf: your drink in front, the room and the street window beyond
  director = { pos: new THREE.Vector3(c.x - 0.8, 1.35, c.z - 0.05), look: new THREE.Vector3(c.x - 0.1, 0.9, c.z + 0.9), fov: 58 };
  showSeatBar(d);
}
function showSeatBar(d) {
  const bar = document.getElementById("seatbar");
  bar.hidden = false;
  document.getElementById("seat-title").textContent = `${d.emoji} ${d.name}`;
  document.getElementById("seat-leave").onclick = (e) => { e.stopPropagation(); standUp(); };
}
function sip() {
  if (!myDrink) return;
  const lq = myDrink.getObjectByName(myDrink.name + "_liquid") || myDrink.children.find((c) => /_liquid$/.test(c.name));
  myDrink.userData.level = Math.max(0, myDrink.userData.level - 0.25);
  if (lq) lq.scale.y = Math.max(0.02, myDrink.userData.level);
  if (myDrink.userData.level === 0) showBubble({ title: "All gone!", body: "Thanks for stopping by." }, screenRect(myDrink), 1600);
}
function standUp() {
  seated = false;
  director = null;
  lockScroll(false);
  document.getElementById("seatbar").hidden = true;
}

// ---------------------------------------------------------------- music notes float up from the record player while it plays
const noteTex = ["♪", "♫"].map((ch) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const x = cv.getContext("2d"); x.fillStyle = "#2b2420"; x.font = "bold 96px serif"; x.textAlign = "center"; x.textBaseline = "middle";
  x.fillText(ch, 64, 70);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
});
const notes = [];
let noteTimer = 0;
const recordObj = scene.getObjectByName("HOT_record");
function animateNotes(dt) {
  if (musicOn() && (noteTimer -= dt) < 0) {
    noteTimer = 0.55;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTex[Math.random() < 0.5 ? 0 : 1], transparent: true, depthWrite: false }));
    const p = new THREE.Box3().setFromObject(recordObj).getCenter(new THREE.Vector3());
    sp.position.set(p.x + (Math.random() - 0.5) * 0.2, p.y + 0.15, p.z);
    sp.scale.setScalar(0.16);
    sp.userData = { t: 0, x0: sp.position.x, ph: Math.random() * 6 };
    scene.add(sp);
    notes.push(sp);
  }
  for (let i = notes.length - 1; i >= 0; i--) {
    const sp = notes[i], u = sp.userData;
    u.t += dt;
    sp.position.y += dt * 0.35;
    sp.position.x = u.x0 + Math.sin(u.t * 3 + u.ph) * 0.08;
    sp.material.opacity = Math.min(1, u.t * 3) * Math.max(0, 1 - u.t / 2.2);
    if (u.t > 2.2) { scene.remove(sp); notes.splice(i, 1); }
  }
}

// ---------------------------------------------------------------- street life + sound (sound starts on the first tap or key)
const sound = createSound();
// traffic stays parked until the Meshy tuk-tuk and taxi (with their dog and cat drivers) replace the placeholders
const life = createStreetLife({ scene, camera, sound });
const startSound = () => { sound.start(); removeEventListener("pointerdown", startSound); removeEventListener("keydown", startSound); };
addEventListener("pointerdown", startSound);
addEventListener("keydown", startSound);
const muteBtn = document.getElementById("mute");
muteBtn.onclick = (e) => { e.stopPropagation(); sound.start(); muteBtn.textContent = sound.toggleMute() ? "🔇" : "🔊"; };

// ---------------------------------------------------------------- guided tour: the camera visits everything you can tap
const TOUR = [
  { title: "Welcome to NAKANG", body: "A little shop for my work. I'll show you what you can tap — or scroll anytime to walk around on your own.", shot: () => ({ pos: close.clone(), look: shopFront.clone().setY(1.9), fov: rig.cams.CAM_close.fov }) },
  { obj: "HOT_project_iport", title: "Projects", body: "Everything I've built sits in this case. Tap one to read about it and open it." },
  { obj: "HOT_character", title: "That's me", body: "Tap to say hi, read about me, or order a drink and sit down for a bit." },
  { obj: "HOT_menu", title: "The menu", body: "My skills and tools, listed like a coffee menu." },
  { obj: "HOT_record", title: "Music", body: "Tap the record player to put some lofi on." },
  { obj: "HOT_board", title: "Guestbook", body: "Leave a note — draw anything on the blue board.",
    shot: () => ({ pos: new THREE.Vector3(2.4, 1.75, -1.75), look: new THREE.Vector3(4.9, 1.45, -1.75), fov: 40 }) },
  { obj: "HOT_clock", title: "Clock", body: "Shows your time. The shop lights follow it too." },
  { obj: "HOT_lamp_0", title: "Lamps", body: "Tap a lamp to switch it on or off." },
  { obj: "HOT_door", title: "The door", body: "Tap to open it, then keep scrolling to walk inside." },
  { obj: "HOT_mailbox", title: "Say hello", body: "The mailbox has my contact details." },
];
function startTour(force = false) {
  let seen = false;
  try { seen = localStorage.getItem("nakang-tour") === "done"; } catch {}
  if (seen && !force) return;
  standUp();
  const tour = document.getElementById("tour"), next = document.getElementById("tour-next"), back = document.getElementById("tour-back");
  let i = 0;
  const show = () => {
    const s = TOUR[i];
    document.getElementById("tour-step").textContent = `${i + 1} / ${TOUR.length}`;
    document.getElementById("tour-icon").textContent = "";
    document.getElementById("tour-title").textContent = s.title;
    document.getElementById("tour-body").textContent = s.body;
    next.textContent = i === TOUR.length - 1 ? "Let's go" : "Next";
    back.hidden = i === 0;
    director = s.shot ? s.shot() : shotOf(scene.getObjectByName(s.obj), s.obj === "HOT_mailbox" ? 3.2 : 2.6);
    if (s.obj) feedback(scene.getObjectByName(s.obj), false);
    const b = tour.querySelector(".bubble");
    b.style.animation = "none"; b.offsetWidth; b.style.animation = "";
  };
  const close = () => {
    tour.hidden = true;
    director = null;
    lockScroll(false);
    try { localStorage.setItem("nakang-tour", "done"); } catch {}
  };
  next.onclick = (e) => { e.stopPropagation(); i < TOUR.length - 1 ? (i++, show()) : close(); };
  back.onclick = (e) => { e.stopPropagation(); if (i > 0) { i--; show(); } };
  document.getElementById("tour-skip").onclick = (e) => { e.stopPropagation(); close(); };
  tour.hidden = false;
  lockScroll(true);
  show();
  next.focus();
}

startTour(); // after everything above is defined
const frameClock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(frameClock.getDelta(), 0.1);
  placeCamera();
  animateCharacter(dt);
  animateProps(dt);
  animateNotes(dt);
  life.update(dt, performance.now() / 1000, !director && progress < 0.45);
  animateBounces(performance.now());
  renderer.render(scene, camera);
});
