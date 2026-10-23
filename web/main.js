import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cards, site } from "./content.js";

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
// warm lamps inside the shop: the two globe pendants and the counter spots (glTF coords: x, up, -y)
for (const [x, y, z] of [[-0.45, 3.0, -2.4], [2.1, 3.0, -2.65], [-1.6, 3.2, -3.4], [2.6, 2.8, -1.2]]) {
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
document.getElementById("loading").style.opacity = 0;
setTimeout(() => document.getElementById("loading").remove(), 600);

// ---------------------------------------------------------------- scroll walk: from across the street up to the shop window
// ponytail: the Blender PATH_walk runs past the end of the modelled street, so the walk goes from the wide
// toy-diorama shot (CAM_front) to the window shot (CAM_close), drifting in from the left like a passer-by.
const [front, close] = [rig.cams.CAM_front.pos, rig.cams.CAM_close.pos].map((p) => new THREE.Vector3(...p));
const walk = new THREE.CatmullRomCurve3([front, new THREE.Vector3(-1.2, 2.6, 12.5), new THREE.Vector3(-0.4, 2.2, 9.5), close]);
const shopFront = new THREE.Vector3(0.6, 2.0, 0);
const ease = (t) => t * t * (3 - 2 * t);
let progress = 0;
function placeCamera() {
  const t = THREE.MathUtils.clamp(scrollY / (document.documentElement.scrollHeight - innerHeight), 0, 1);
  progress += (t - progress) * 0.12; // a little lag so the walk feels like steps, not a slider
  camera.position.copy(walk.getPoint(progress));
  camera.lookAt(shopFront.clone().setY(THREE.MathUtils.lerp(2.6, 1.9, ease(progress))));
  // the Blender shots are framed for 4:3; on a tall phone screen widen the view so the shop still fits across
  const fov = THREE.MathUtils.lerp(rig.cams.CAM_front.fov, rig.cams.CAM_close.fov, ease(progress));
  const k = Math.max(1, (4 / 3) / camera.aspect);
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * k));
  camera.updateProjectionMatrix();
  document.getElementById("hint").style.opacity = t > 0.9 ? 0 : 1;
}

// ---------------------------------------------------------------- hotspots: hover tip, click -> speech bubble
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = document.getElementById("tip");
const LABEL = { about: "About me", skills: "Menu", hello: "Say hi", music: "Music on / off", stickers: "Sticker Board", guestbook: "Guestbook" };

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
    tip.textContent = LABEL[k] || cards[k]?.title || k;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
  }
});

let bubble = null;
addEventListener("click", (e) => {
  if (bubble?.contains(e.target) || e.target.closest?.("#tour, #help")) return;
  bubble?.remove();
  bubble = null;
  const o = hotspotAt(e.clientX, e.clientY);
  if (!o) return;
  const key = o.userData.hotspot;
  feedback(o, !["hello", "skills", "stickers"].includes(key)); // signs and the door: sound + buzz only, no bounce
  tip.style.opacity = 0;
  const r = screenRect(o);
  if (key === "music") return toggleMusic(r);
  if (key === "about") wave();
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
    (c.link ? `<a class="btn" href="${esc(c.link.url)}" target="_blank" rel="noopener">${esc(c.link.label)} ↗</a>` : "");
  document.body.append(bubble);
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

// ---------------------------------------------------------------- first-visit tutorial (reopen with the ? button)
const STEPS = [
  { icon: "↓", title: "Walk up to the shop", body: "Scroll (or swipe) down to cross the street and reach the window." },
  { icon: "☝︎", title: "Tap what looks interesting", body: "The iPod in the case is a project. The person behind the counter, the menu stand and the A-frame sign all have something to say." },
  { icon: "♪", title: "Music's on the house", body: "Tap the record player on the table inside to turn the music on or off." },
];
function startTour(force = false) {
  let seen = false;
  try { seen = localStorage.getItem("nakang-tour") === "done"; } catch {}
  if (seen && !force) return;
  const tour = document.getElementById("tour"), next = document.getElementById("tour-next");
  let i = 0;
  const show = () => {
    const s = STEPS[i];
    document.getElementById("tour-step").textContent = `${i + 1} / ${STEPS.length}`;
    document.getElementById("tour-icon").textContent = s.icon;
    document.getElementById("tour-title").textContent = s.title;
    document.getElementById("tour-body").textContent = s.body;
    next.textContent = i === STEPS.length - 1 ? "Let's go" : "Next";
    const b = tour.querySelector(".bubble");
    b.style.animation = "none"; b.offsetWidth; b.style.animation = ""; // replay the pop for each step
  };
  const close = () => {
    tour.hidden = true;
    try { localStorage.setItem("nakang-tour", "done"); } catch {}
  };
  next.onclick = (e) => { e.stopPropagation(); i < STEPS.length - 1 ? (i++, show()) : close(); };
  document.getElementById("tour-skip").onclick = (e) => { e.stopPropagation(); close(); };
  tour.onclick = (e) => { if (e.target === tour) close(); };
  tour.hidden = false;
  show();
  next.focus();
}
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
const D = THREE.MathUtils.degToRad;
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _dir = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1); // the character faces the street (+Z)
const look = new THREE.Quaternion();
const headMixed = headBone.quaternion.clone(); // the clip's own head pose, before our look-at offset
const clock = new THREE.Clock();
function animateCharacter() {
  if (progress > 0.85 && !waved) { waved = true; wave(); }
  if (progress < 0.5) waved = false; // walk away and back to get another hello
  // the mixer only writes a bone when the clip value changes, so put back the clip pose before it runs,
  // otherwise the look-at offset would stack up frame after frame while the clip stands still
  headBone.quaternion.copy(headMixed);
  mixer.update(Math.min(clock.getDelta(), 0.1));
  headMixed.copy(headBone.quaternion);
  // eye contact: turn the head toward the camera on top of the clip, within a natural neck range, eased
  headBone.getWorldPosition(_hp);
  _dir.subVectors(camera.position, _hp).normalize();
  _q.setFromUnitVectors(forward, _dir);
  look.slerp(new THREE.Quaternion().rotateTowards(_q, D(30)), 0.08);
  headBone.parent.getWorldQuaternion(_pq);
  headBone.quaternion.premultiply(_pq.clone().invert().multiply(look).multiply(_pq));
}

startTour(); // after everything above is defined (STEPS, handlers)
renderer.setAnimationLoop(() => {
  placeCamera();
  animateCharacter();
  animateBounces(performance.now());
  renderer.render(scene, camera);
});
