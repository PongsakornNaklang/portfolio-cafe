import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
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
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
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
sun.shadow.mapSize.set(2048, 2048);
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
  new GLTFLoader().loadAsync("storefront.glb"),
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
  camera.fov = THREE.MathUtils.lerp(rig.cams.CAM_front.fov, rig.cams.CAM_close.fov, ease(progress));
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
  if (bubble?.contains(e.target)) return;
  bubble?.remove();
  bubble = null;
  const o = hotspotAt(e.clientX, e.clientY);
  if (!o) return;
  const key = o.userData.hotspot;
  if (key === "music") return toggleMusic(e.clientX, e.clientY);
  const c = cards[key];
  if (c) showBubble(c, e.clientX, e.clientY);
});

function showBubble(c, x, y, ttl = 0) {
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
  const w = bubble.offsetWidth, hgt = bubble.offsetHeight;
  const left = THREE.MathUtils.clamp(x - w / 2, 16, innerWidth - w - 16);
  bubble.style.left = left + "px";
  bubble.style.top = Math.max(16, y - hgt - 22) + "px";
  bubble.style.setProperty("--tail", THREE.MathUtils.clamp(x - left, 24, w - 24) + "px");
  if (ttl) { const b = bubble; setTimeout(() => { b.remove(); if (bubble === b) bubble = null; }, ttl); }
}
addEventListener("keydown", (e) => { if (e.key === "Escape") { bubble?.remove(); bubble = null; } });

// ---------------------------------------------------------------- music: the record player toggles it
let audio = null, synth = null;
function toggleMusic(x, y) {
  if (site.musicUrl) {
    audio ??= Object.assign(new Audio(site.musicUrl), { loop: true, volume: 0.5 });
    audio.paused ? audio.play() : audio.pause();
    return showBubble({ title: audio.paused ? "Music off" : "♪ Music on" }, x, y, 1400);
  }
  synth ??= lofiSynth();
  synth.toggle();
  showBubble({ title: synth.on ? "♪ Music on" : "Music off" }, x, y, 1400);
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
renderer.setAnimationLoop(() => {
  placeCamera();
  renderer.render(scene, camera);
});
