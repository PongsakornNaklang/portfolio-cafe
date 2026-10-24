import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cards, site, drinks } from "./content.js?v=24";
import { createSound, createStreetLife } from "./life.js?v=25";
import { startBoard, legalMoves, play, botMove } from "./checkers.js?v=1";

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
// warm light that only spills downward, like a lamp under its shade: none of it reaches the ceiling
function downlight(x, y, z, angle) {
  const l = new THREE.SpotLight(0xffd6a0, P.lamp, 6, angle, 0.5, 1.6);
  l.position.set(x, y, z);
  l.target.position.set(x, y - 1, z);
  scene.add(l, l.target);
  return l;
}
// the ceiling's downlights and the pendants get their lights after loading

const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 200);

// ---------------------------------------------------------------- load the shop
const loading = document.getElementById("loading");
function loaded(pct) { // the bar and the number on the loading screen
  pct = Math.round(pct);
  loading.querySelector(".bar i").style.width = pct + "%";
  loading.querySelector("small").textContent = `Opening the shop… ${pct}%`;
  loading.setAttribute("aria-valuenow", pct);
}
const [gltf, rig] = await Promise.all([
  new GLTFLoader()
    .setDRACOLoader(new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/libs/draco/gltf/"))
    .loadAsync("storefront.glb", (e) => e.total && loaded(Math.min(99, (e.loaded / e.total) * 100))), // 100 once it's all set up
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
  const p = o.getWorldPosition(new THREE.Vector3());
  const light = downlight(p.x, p.y - 0.15, p.z, 1.1); // just under the bulb; the wide dish spreads it ~63° from straight down
  light.intensity *= 2; // the pendants are the shop's main lamps: twice the ceiling spots, and reaching the floor
  light.distance = 8;
  const mesh = firstMesh(scene.getObjectByName(`pendant_bulb_${i}`));
  mesh.material = mesh.material.clone(); // each lamp switches on its own
  return { o, light, mesh, glow: mesh.material.emissiveIntensity, on: true };
});
{ // the orange disc lamp on the right wall: an orange glow on the wall around it and the corner table below
  const o = scene.getObjectByName("HOT_wall_lamp");
  const light = new THREE.PointLight(0xff8a30, P.lamp * 0.6, 3, 2);
  light.position.copy(o.getWorldPosition(new THREE.Vector3())).x -= 0.2; // just in front of the disc
  scene.add(light);
  const mesh = firstMesh(scene.getObjectByName("HOT_wall_lamp_disc"));
  lamps.push({ o, light, mesh, glow: mesh.material.emissiveIntensity, on: true });
}
function toggleLamp(o) {
  const l = lamps.find((x) => x.o === o);
  l.on = !l.on;
  l.light.visible = l.on;
  l.mesh.material.emissiveIntensity = l.on ? l.glow : 0;
}

// warm LED strips in a ceiling cove: a glowing line along the top of the back and side walls, and the soft wash it
// throws down each wall (a gradient drawn on the wall, not a real light; things in front of the wall hide it)
{
  const box = (n) => new THREE.Box3().setFromObject(scene.getObjectByName(n));
  const ceil = box("in_ceiling").min.y, back = box("in_backwall").max.z;
  const left = box("in_wall_left").max.x, right = box("in_wall_right").min.x, front = box("in_wall_left").max.z;
  const c = document.createElement("canvas");
  c.width = 1; c.height = 64;
  const g = c.getContext("2d"), grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, "rgba(255,196,128,1)");
  grad.addColorStop(0.25, "rgba(255,184,116,0.4)");
  grad.addColorStop(1, "rgba(255,176,108,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 1, 64);
  const k = { day: 0.4, sunset: 0.7, night: 1 }[timeKey] ?? 0.4; // the same strips read stronger after dark
  const wash = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.6 * k,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const led = new THREE.MeshBasicMaterial({ color: 0xffdcae });
  const H = 1.4; // how far down the wall the glow reaches
  // [length, centre x, centre z, turn]: the back wall faces +z, the left wall +x, the right wall -x
  for (const [len, x, z, ry] of [[right - left, (left + right) / 2, back, 0],
    [front - back, left, (back + front) / 2, Math.PI / 2], [front - back, right, (back + front) / 2, -Math.PI / 2]]) {
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry)); // out of the wall, into the room
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(len, H), wash);
    glow.position.set(x, ceil - H / 2, z).addScaledVector(n, 0.01);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(len, 0.02, 0.02), led);
    strip.position.set(x, ceil - 0.04, z).addScaledVector(n, 0.03);
    glow.rotation.y = strip.rotation.y = ry;
    scene.add(glow, strip);
  }
  // and along the front: a recessed LED line filling the slot between the window beam and the ceiling's front edge
  // (looking up from inside you saw the underside of the brick facade there)
  const beamZ = box("beam_top").min.z, ceilZ = box("in_ceiling").max.z, slotY = box("wall_upper").min.y;
  const ceilMat = firstMesh(scene.getObjectByName("in_ceiling")).material;
  for (const [mat, depth, y] of [[ceilMat, beamZ - ceilZ, slotY - 0.005], [led, 0.04, slotY - 0.01]]) { // the slot closed in ceiling white, the line down its middle
    const m = new THREE.Mesh(new THREE.PlaneGeometry(right - left, depth), mat);
    m.position.set((left + right) / 2, y, (beamZ + ceilZ) / 2);
    m.rotation.x = Math.PI / 2; // facing down into the shop
    scene.add(m);
  }
}

// recessed downlights in the ceiling: round warm cans in two rows, clear of the pendants and the pipes. Three carry a
// real light (every light costs on every pixel), the rest just glow
{
  const y = new THREE.Box3().setFromObject(scene.getObjectByName("in_ceiling")).min.y - 0.003;
  const lens = new THREE.MeshBasicMaterial({ color: 0xffe2b8 }), rim = new THREE.MeshStandardMaterial({ color: 0xd8d8d4, roughness: 0.4, metalness: 0.3 });
  // [x, z (glTF), carries a real light]
  const CANS = [[-1.6, -1.2, false], [0.6, -1.2, true], [2.6, -1.2, true], [4.2, -1.2, false],
    [-1.6, -3.0, false], [1.0, -3.4, false], [3.4, -3.0, true]];
  for (const [x, z, lit] of CANS) {
    for (const m of [new THREE.Mesh(new THREE.RingGeometry(0.06, 0.08, 24), rim), new THREE.Mesh(new THREE.CircleGeometry(0.06, 24), lens)]) {
      m.position.set(x, y, z);
      m.rotation.x = Math.PI / 2; // facing down
      scene.add(m);
    }
    if (lit) downlight(x, y - 0.05, z, 0.8).intensity *= 1.5; // ~46° cone; up at the ceiling, so a bit stronger
  }
}

const hourHand = scene.getObjectByName("clock_hour"), minuteHand = scene.getObjectByName("clock_minute");
function animateClock() { // the visitor's real time; hands turn clockwise as seen from the street (about -Z in glTF)
  const d = new Date(), m = d.getMinutes() + d.getSeconds() / 60;
  minuteHand.rotation.z = -(m / 60) * Math.PI * 2;
  hourHand.rotation.z = -(((d.getHours() % 12) + m / 60) / 12) * Math.PI * 2;
}

const recordSpin = ["HOT_record_disc", "HOT_record_label"].map((n) => scene.getObjectByName(n));
const musicOn = () => !!(audio && !audio.paused) || !!synth?.on;
scene.getObjectByName("vinyl_shelf").userData.hotspot = "records";

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

loaded(100);
setTimeout(() => loading.classList.add("up"), 250); // a beat at 100%, then the shutter rolls up
setTimeout(() => loading.remove(), 1300);

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
  if (director) { pos = director.pos; look.copy(director.base ? turned(pos, director.base) : director.look); fov = director.fov; }
  else {
    if (Math.abs(t - progress) + Math.abs(u - inProgress) > 0.002) { gaze.yaw *= 0.9; gaze.pitch *= 0.9; } // walking: eyes drift back ahead
    look.copy(turned(pos, look.clone().sub(pos)));
  }
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

// frame an object: far enough back that all of it fits with some room around it, seen from the street side and a
// little above; if a wall or shelf is in the way, step in front of it
const _ray = new THREE.Raycaster();
function shotOf(o, { minY = -Infinity, from = [0.12, 0.22, 1] } = {}) {
  const box = new THREE.Box3().setFromObject(o);
  box.min.y = Math.max(box.min.y, minY); // e.g. only the part of the character above the counter
  const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
  const fov = 34, half = Math.tan(THREE.MathUtils.degToRad(fov / 2));
  const dist = Math.max(1.6, (Math.max(s.y, Math.max(s.x, s.z) / Math.max(camera.aspect, 4 / 3)) * 1.4) / 2 / half + 0.3);
  const dir = new THREE.Vector3(...from).normalize();
  const pos = c.clone().addScaledVector(dir, dist);
  pos.y = THREE.MathUtils.clamp(pos.y, 1.2, 2.9); // eye height: never through the ceiling or the floor
  _ray.set(c, pos.clone().sub(c).normalize());
  _ray.far = c.distanceTo(pos);
  for (const h of _ray.intersectObject(gltf.scene, true)) {
    let mine = false;
    for (let p = h.object; p && !mine; p = p.parent) mine = p === o;
    if (mine || h.object.material?.transparent) continue;
    pos.copy(c).addScaledVector(_ray.ray.direction, Math.max(0.6, h.distance - 0.25));
    break;
  }
  const look = c.clone().setY(c.y - s.y * 0.08); // a touch low so the object sits just above the middle
  return { pos, look, fov: Math.max(fov, THREE.MathUtils.radToDeg(2 * Math.atan((s.y * 1.3) / 2 / pos.distanceTo(c)))) };
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
  door.rotation.y = -ease(doorAmt) * D(80); // swings into the shop on its right-hand hinge, stopping short of the side wall (the handle would go through it)
  if (musicOn()) for (const o of recordSpin) o.rotation.y -= dt * 3.5; // 33⅓ rpm
  animateClock();
}

// ---------------------------------------------------------------- hotspots: hover tip, click -> speech bubble
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tip = document.getElementById("tip");
const LABEL = { about: "About me", skills: "Menu", hello: "Say hi", music: "Music on / off", guestbook: "Write on the board",
  contact: "Contact", clock: "What time is it?", lamp: "Light on / off", records: "Pick a record",
  honk: "Beep beep!", bird: "Shoo!", book: "Open my portfolio", cat: "Pet the cat", chime: "7-Eleven" };

function hotspotAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  // nearest solid surface wins: clicks pass through the shop glass (except the door's own glass),
  // but a wall or counter in front blocks whatever is behind it
  for (const h of ray.intersectObject(scene, true)) { // scene, not gltf.scene: the passing cars and birds live there too
    let hot = null;
    for (let o = h.object; o && !hot; o = o.parent) if (o.userData.hotspot) hot = o;
    if (hot) return hot;
    if (!h.object.material?.transparent) return null;
  }
  return null;
}

// only the 3D scene itself is tappable: a card, button or the tour box on top of it blocks what's behind
const onScene = (e) => e.target === renderer.domElement;
addEventListener("pointermove", (e) => {
  if (game) { renderer.domElement.style.cursor = onScene(e) ? "pointer" : ""; tip.style.opacity = 0; return; } // mid-game: just the board
  const o = onScene(e) ? hotspotAt(e.clientX, e.clientY) : null;
  // a hand that grabs the view wherever you can drag to look around; the pointing hand on things you can tap
  renderer.domElement.style.cursor = gaze.drag && gaze.moved ? "grabbing" : o ? "pointer" : !director || seated ? "grab" : "";
  tip.style.opacity = o ? 1 : 0;
  if (o) {
    const k = o.userData.hotspot;
    tip.textContent = k === "sip" ? "Take a sip" : k === "seat" ? "Sit here" : k === "door" ? (doorOpen ? "Close the door" : "Open the door") : LABEL[k] || cards[k]?.title || k;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY + "px";
  }
});

let bubble = null;
// your bubble talks: one sentence at a time, fading to the next, and stops on a sign-off
function aboutBubble(actions, r) {
  const { lines, signoffs } = cards.about;
  const said = [...lines, signoffs[Math.floor(Math.random() * signoffs.length)]];
  let i = 0;
  showBubble({ title: cards.about.title, body: said[0], actions }, r);
  const me = bubble, p = me.querySelector("p");
  p.classList.add("talk");
  const timer = setInterval(() => {
    if (!me.isConnected || i === said.length - 1) return clearInterval(timer);
    p.style.opacity = 0;
    setTimeout(() => { p.textContent = said[++i]; p.style.opacity = 1; }, 250);
  }, 2800);
}
addEventListener("click", (e) => {
  if (gaze.moved) return; // that was a drag to look around
  if (game && onScene(e)) return boardClick(e);
  if (bubble?.contains(e.target) || e.target.closest?.("#tour, #help, #board, #book, #mute, #seatbar")) return;
  closeBubble();
  const o = onScene(e) ? hotspotAt(e.clientX, e.clientY) : null;
  if (!o) return;
  const key = o.userData.hotspot;
  if (key === "sip") return sip();
  if (key === "seat") return sitAt(o.userData.seat);
  if (key === "honk" || key === "bird") return life.poke(o);
  if (key === "chime") return sound.chime(); // ding-dong
  feedback(o, !["hello", "skills", "door", "clock", "lamp", "guestbook", "records"].includes(key)); // flat or hanging things: sound + buzz only
  tip.style.opacity = 0;
  const r = screenRect(o);
  if (key === "music") return toggleMusic(r);
  if (key === "records") return recordMenu(r);
  if (key === "door") return toggleDoor();
  if (key === "cat") return petCat(r);
  if (key === "lamp") return toggleLamp(o);
  if (key === "guestbook") return openBoard();
  if (key === "book") return openBook(r);
  if (key === "clock") {
    const d = new Date();
    return showBubble({ title: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      body: d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" }) }, r);
  }
  if (key === "about") {
    wave();
    const acts = [{ label: "☕ Order a drink", run: () => drinkMenu(r) },
      { label: "📖 See my portfolio", run: (btn) => { const from = btn.getBoundingClientRect(); closeBubble(); openBook(from); } }];
    if (seated && SEATS[mySeat].table === "center_table") // only while you sit at the table the board goes on
      acts.push({ label: "♟ หมากฮอส?", egg: true, run: () => { closeBubble(); checkersMenu(r); } });
    if (musicOn()) acts.push({ label: dancing ? "✋ Stop dancing" : "🕺 Dance", egg: true, run: () => { dancing = !dancing; closeBubble(); } });
    return aboutBubble(acts, r);
  }
  const c = cards[key];
  if (c) showBubble(c, r);
});

// the object's on-screen box, so a bubble can sit next to it instead of on top of it
const _box = new THREE.Box3(), _v = new THREE.Vector3();
function screenRect(o) {
  _box.setFromObject(o);
  const r = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity, obj: o }; // obj: a bubble placed here follows it
  for (let i = 0; i < 8; i++) {
    _v.set(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z).project(camera);
    const x = (_v.x + 1) / 2 * innerWidth, y = (1 - _v.y) / 2 * innerHeight;
    r.left = Math.min(r.left, x); r.right = Math.max(r.right, x); r.top = Math.min(r.top, y); r.bottom = Math.max(r.bottom, y);
  }
  return r;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
// a card's words: title, text, table rows and link buttons (the bubbles and the project book share it)
const cardHTML = (c) =>
  `<h2>${esc(c.title)}</h2>` +
  (c.body ? `<p>${esc(c.body)}</p>` : "") +
  (c.rows ? `<table>${c.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join("")}</table>` : "") +
  [].concat(c.link || [], c.links || []).map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(" ");
// shrink back into the tail and fade, then go (instantly with reduced motion)
function closeBubble(b = bubble) {
  if (!b) return;
  if (bubble === b) bubble = null;
  b.style.pointerEvents = "none";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return b.remove();
  b.animate([{}, { transform: "scale(.6)", opacity: 0 }], { duration: 160, easing: "ease-in" }).onfinish = () => b.remove();
}
function showBubble(c, r, ttl = 0) {
  bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.setAttribute("role", "dialog");
  bubble.innerHTML =
    `<button class="x" aria-label="Close">×</button>` + cardHTML(c) +
    (c.actions ? `<div class="acts">${c.actions.map((a, i) => `<button class="btn${a.egg ? " egg" : ""}" data-act="${i}">${esc(a.label)}</button>`).join("")}</div>` : "");
  document.body.append(bubble);
  bubble.querySelectorAll("[data-act]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); c.actions[+b.dataset.act].run(b); }));
  bubble.querySelector(".x").onclick = () => { closeBubble(); };
  bubble.anchor = r.obj; // re-placed every frame, so it stays on its object while you look around
  placeBubble(bubble, r);
  if (ttl) { const b = bubble; setTimeout(() => { closeBubble(b); }, ttl); }
}
// above the object if it fits, else beside it (the side with more room), else below; never over it
function placeBubble(bubble, r) {
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
}
addEventListener("keydown", (e) => { if (e.key === "Escape") { closeBubble(); } });
addEventListener("scroll", () => { if (bubble && !bubble.dataset.keep) { closeBubble(); } }, { passive: true });

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

// ---------------------------------------------------------------- the shop cat asleep on the shell chair: it breathes; tap to pet it and it purrs
const catBody = scene.getObjectByName("cat_body");
let purr = null;
function petCat(r) {
  purr?.stop();
  purr = sound.play("purr", { volume: 0.9 });
  showBubble({ title: "Purrr…" }, r, 1600);
}
function animateCat(now) {
  const k = Math.sin(now * 0.0017); // a slow breath, about one every 4 s
  catBody.scale.set(1 + k * 0.012, 1 + k * 0.025, 1 + k * 0.012);
}

// ---------------------------------------------------------------- the portfolio book on the centre table
// Everything in one book: cover, contents, about, skills, every project, interests, contact. Lies open two pages a
// spread (one page on a phone); Next / Back, the arrow keys or a tap on either half turn a leaf over the spine.
const chapters = [
  { kicker: "About", ...cards.about, body: cards.about.lines.join(" ") },
  { kicker: "Skills", ...cards.skills, title: "What I work with" },
  ...Object.keys(cards).filter((k) => k.startsWith("project:")).map((k) => ({ kicker: "Projects", ...cards[k] })),
  { kicker: "Interests", ...cards.interests },
  { kicker: "Contact", ...cards.contact },
];
const bookPages = [{ cover: true }, { toc: true }, ...chapters];
const tocHTML = () => `<div class="kicker">Contents</div><h2>Inside</h2><ol class="toc">` +
  chapters.map((c, k) => [c.kicker, k + 2]).filter(([name], k) => chapters.findIndex((c) => c.kicker === name) === k) // each chapter's first page
    .map(([name, n]) => `<li><button data-go="${n}"><span>${esc(name)}</span><i></i><b>${n}</b></button></li>`).join("") + `</ol>`;
function fillPage(el, k, side) { // k: page index; outside the book = the yellow endpaper; "blank" = the back of a page
  const p = bookPages[k];
  el.className = `pg ${side}` + (k === "blank" ? "" : !p ? " endpaper" : p.cover ? " title" : "");
  el.innerHTML = !p ? "" : p.cover
    ? `<small>${esc(site.name)}</small><h1>Portfolio</h1><p>Full-stack developer · ${new Date().getFullYear()}</p><div class="hint">Tap the page to open →</div>`
    : (p.toc ? tocHTML() : `<div class="kicker">${esc(p.kicker)}</div>` + cardHTML(p)) + `<div class="folio">${k}</div>`;
}
const book = { at: 0, busy: false }; // at: the right-hand page (the only page on a phone)
function openBook(from) { // from: the screen rect it flies in from (the book on the table, or a button)
  const dlg = document.getElementById("book"), spread = document.getElementById("book-spread");
  const L = document.getElementById("pg-l"), R = document.getElementById("pg-r");
  const prev = document.getElementById("book-prev"), next = document.getElementById("book-next");
  const two = () => innerWidth > 720;
  const last = () => (two() ? bookPages.length - 1 + ((bookPages.length - 1) % 2 ? 1 : 0) : bookPages.length - 1);
  const render = () => {
    spread.classList.toggle("one", !two());
    if (two() && book.at % 2) book.at++; // on a spread the right-hand page is always even
    book.at = Math.min(book.at, last());
    fillPage(L, book.at - 1, "left");
    fillPage(R, book.at, "right");
    prev.disabled = book.at === 0;
    next.disabled = book.at === last();
  };
  const turn = (to) => {
    if (two() && to % 2) to++;
    to = THREE.MathUtils.clamp(to, 0, last());
    if (book.busy || to === book.at) return;
    const fwd = to > book.at, from = book.at;
    const leaf = document.createElement("div");
    leaf.innerHTML = `<div class="pg front"></div><div class="pg back"></div>`;
    const [front, back] = leaf.children;
    let a0 = 0, a1 = fwd ? -180 : 180, land = () => {};
    if (two() && fwd) { // lift the right page, lay it down as the new left page
      leaf.className = "leaf on-right"; fillPage(front, from, "right"); fillPage(back, to - 1, "left"); fillPage(R, to, "right");
      land = () => fillPage(L, to - 1, "left");
    } else if (two()) { // lift the left page back over to the right
      leaf.className = "leaf on-left"; fillPage(front, from - 1, "left"); fillPage(back, to, "right"); fillPage(L, to - 1, "left");
      land = () => fillPage(R, to, "right");
    } else if (fwd) { // one page: the old page lifts away over the spine
      leaf.className = "leaf on-right"; fillPage(front, from, "right"); fillPage(back, "blank", "left"); fillPage(R, to, "right");
    } else { // one page: the new page swings back in from the spine
      leaf.className = "leaf on-right"; fillPage(front, to, "right"); fillPage(back, "blank", "left");
      [a0, a1] = [-180, 0];
      land = () => fillPage(R, to, "right");
    }
    for (const f of [front, back]) f.classList.add(f === front ? "front" : "back");
    spread.append(leaf);
    book.busy = true;
    book.at = to;
    prev.disabled = to === 0;
    next.disabled = to === last();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const opts = { duration: reduce ? 0 : 700, easing: "cubic-bezier(.45,.05,.3,1)" };
    // the page darkens as it stands up off the paper, and lightens as it lies down
    front.animate([{ filter: "brightness(1)" }, { filter: "brightness(.78)" }], opts);
    back.animate([{ filter: "brightness(.78)" }, { filter: "brightness(1)" }], opts);
    leaf.animate([{ transform: `rotateY(${a0}deg)` }, { transform: `rotateY(${(a0 + a1) / 2}deg) translateZ(18px)` }, { transform: `rotateY(${a1}deg)` }], opts)
      .finished.then(() => { land(); leaf.remove(); book.busy = false; });
    feedback(R, false);
  };
  const step = () => (two() ? 2 : 1);
  prev.onclick = () => turn(book.at - step());
  next.onclick = () => turn(book.at + step());
  spread.onclick = (e) => {
    const go = e.target.closest("[data-go]");
    if (go) return turn(+go.dataset.go);
    if (e.target.closest("a, button")) return;
    const r = spread.getBoundingClientRect(); // tap the right half to go on, the left half to go back
    turn(book.at + (e.clientX > r.left + r.width / 2 ? step() : -step()));
  };
  dlg.onkeydown = (e) => { if (e.key === "ArrowRight") next.onclick(); if (e.key === "ArrowLeft") prev.onclick(); };
  // closing, it shrinks and floats back down onto the table (where it came from, if the table's out of view)
  const close = () => {
    if (book.closing) return;
    const cover = dlg.querySelector(".cover"), end = cover.getBoundingClientRect();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return dlg.close();
    const home = scene.getObjectByName("HOT_book"), c = home.getWorldPosition(new THREE.Vector3()).project(camera);
    const onTable = c.z < 1 && Math.abs(c.x) < 1 && Math.abs(c.y) < 1; // in front of the camera and on screen
    const f = onTable ? screenRect(home) : book.from || { left: innerWidth / 2 - 40, right: innerWidth / 2 + 40, top: innerHeight / 2, bottom: innerHeight / 2 };
    const s = THREE.MathUtils.clamp((f.right - f.left) / end.width, 0.05, 1);
    const dx = (f.left + f.right) / 2 - (end.left + end.right) / 2, dy = (f.top + f.bottom) / 2 - (end.top + end.bottom) / 2;
    book.closing = true;
    const fade = dlg.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 350, fill: "forwards", pseudoElement: "::backdrop" });
    const fly = cover.animate([
      { transform: "none", opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 30}px) scale(${(s + 1) / 2}) rotate(-3deg)`, offset: 0.4 },
      { opacity: 1, offset: 0.8 },
      { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-10deg)`, opacity: 0 },
    ], { duration: 450, easing: "cubic-bezier(.5,0,.7,.4)", fill: "forwards" });
    fly.finished.then(() => {
      book.closing = false;
      dlg.close();
      fade.cancel(); fly.cancel(); // ready to show again next time
    });
  };
  document.getElementById("book-close").onclick = close;
  dlg.onclick = (e) => { if (e.target === dlg) close(); }; // tap outside the book to close it
  dlg.oncancel = (e) => { e.preventDefault(); close(); }; // Esc
  if (!book.render) addEventListener("resize", () => dlg.open && !book.busy && book.render());
  book.render = render;
  render();
  dlg.showModal();
  book.from = from;
  if (!from || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // it floats in from where you tapped, grows to the middle of the screen, and opens from the cover to the contents
  const cover = dlg.querySelector(".cover"), end = cover.getBoundingClientRect();
  const s = THREE.MathUtils.clamp((from.right - from.left) / end.width, 0.05, 1);
  const dx = (from.left + from.right) / 2 - (end.left + end.right) / 2, dy = (from.top + from.bottom) / 2 - (end.top + end.bottom) / 2;
  const opening = book.at === 0;
  book.busy = true; // no page turns mid-flight
  dlg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, pseudoElement: "::backdrop" });
  cover.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(-10deg)`, opacity: 0 },
    { opacity: 1, offset: 0.2 },
    { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 30}px) scale(${(s + 1) / 2}) rotate(-3deg)`, offset: 0.6 }, // a little lift on the way
    { transform: "none", opacity: 1 },
  ], { duration: 700, easing: "cubic-bezier(.3,.7,.3,1)" }).finished.then(() => {
    book.busy = false;
    if (opening && dlg.open) turn(two() ? 2 : 1);
  });
}

// ---------------------------------------------------------------- music: the record player toggles it
let audio = null, synth = null, rec = site.records[0];
function stopMusic() { audio?.pause(); if (synth?.on) synth.toggle(); }
function startMusic() {
  if (!rec.url) { synth ??= lofiSynth(); if (!synth.on) synth.toggle(); return; }
  if (!audio?.src.endsWith(rec.url)) audio = Object.assign(new Audio(rec.url), { loop: true, volume: 0.5 });
  audio.play();
}
function toggleMusic(r) {
  musicOn() ? stopMusic() : startMusic();
  showBubble({ title: musicOn() ? `♪ ${rec.name}` : "Music off" }, r, 1400);
}
// the vinyl shelf: pick a record and it goes on the player
function recordMenu(r) {
  showBubble({ title: "Pick a record", body: musicOn() ? `Now playing: ${rec.name}` : "",
    actions: site.records.map((x) => ({ label: `${x === rec && musicOn() ? "♪ " : ""}${x.name}`, run: () => {
      stopMusic(); rec = x; startMusic();
      closeBubble();
      showBubble({ title: `♪ ${x.name}`, body: `by ${x.by}` }, screenRect(recordObj), 1600);
    } })) }, r);
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
  sound.play("huh", { volume: 0.8 }); // a wordless "huh!" hello
}

const headBone = scene.getObjectByName("mixamorigHead");
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _hp = new THREE.Vector3(), _dir = new THREE.Vector3();
const forward = new THREE.Vector3(0, 0, 1); // where his body faces (the street, +Z, until he turns)
const look = new THREE.Quaternion();
const headMixed = headBone.quaternion.clone(); // the clip's own head pose, before our look-at offset
// ---------------------------------------------------------------- dance: while music plays, tap him and pick Dance
// He walks out from behind the counter to the record player, dances there, and walks back when the dance or the
// music stops. Mixamo clips: "walk" (Walking, in place: the page moves him along the route) and "dance" (Wave Hip Hop
// Dance) blend in by weight over the idle.
const walkAction = mixer.clipAction(clip("walk")).play();
const danceAction = mixer.clipAction(clip("dance")).play();
const sitAction = mixer.clipAction(clip("sit")).play(); // Sitting Idle: on the stool across the checkers board
walkAction.weight = danceAction.weight = sitAction.weight = 0;
// seated, his arms hang at his sides as in the standing idle (the clip's rest on the knees reached through the table)
const ARMS = ["Shoulder", "Arm", "ForeArm", "Hand"].flatMap((n) => ["Left", "Right"].map((s) => {
  const bone = scene.getObjectByName(`mixamorig${s}${n}`), v = clip("idle").tracks.find((t) => t.name === `${bone.name}.quaternion`).values;
  return { bone, idle: new THREE.Quaternion(v[0], v[1], v[2], v[3]), mixed: bone.quaternion.clone() };
}));
const me = scene.getObjectByName("HOT_character");
const pickup = scene.getObjectByName("serve").getWorldPosition(new THREE.Vector3()); // the PICKUP tray on the counter
const PICKUP_HEADING = Math.atan2(pickup.x - me.position.x, pickup.z - me.position.z);
{ // a soft contact shadow under his feet: the shop's lamps cast none, and without one he seems to hover
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  const g = cv.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(30,20,10,.5)"); grad.addColorStop(0.6, "rgba(30,20,10,.22)"); grad.addColorStop(1, "rgba(30,20,10,0)");
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
  blob.position.y = 0.004; // just above the floor (he's scaled 1.4: 0.6 x 0.5 m)
  me.add(blob);
}
// back off the staff platform (stepping down to the floor), round the end of the counter, to the open floor by the
// end of the record table: the dance swings ~1.1 m to the sides and 0.7 m forward, and from this spot (measured over
// the whole clip) his joints stay 8 cm clear of the counter, the table and the plant
// For a game of checkers he carries on past the dance spot, behind the stools, and sits on the stool across the board
// from you (SIT: where his feet go, and how far the clip's sitting pose has to drop to rest on the seat).
const SIT = { x: 2.57, z: -3.41, dy: 0.015 }; // measured: puts his hips over the stool's centre, his seat on its top
const ROUTE = [[-1.0, -1.45], [-1.0, -3.2], [-0.1, -3.2], [1.2, -3.7], [SIT.x, -3.7], [SIT.x, SIT.z]].map(([x, z]) => new THREE.Vector3(x, 0, z));
const legLen = ROUTE.slice(1).map((p, i) => p.distanceTo(ROUTE[i]));
const danceLen = legLen[0] + legLen[1], routeLen = legLen.reduce((a, b) => a + b);
const PLATFORM = 0.65, FLOOR = 0.2; // feet height on the platform behind the counter, and on the shop floor
const WALK_SPEED = 1.3; // m/s: the clip's stride (0.64 m a step in 0.68 s, at hips 0.86 m; his are 1.25 m), so his feet don't slide
let walkS = 0, walkAmt = 0, sitAmt = 0;
function routeAt(s) { // point and heading at distance s along the route
  for (let i = 1; i < ROUTE.length; i++) {
    const a = ROUTE[i - 1], b = ROUTE[i], d = a.distanceTo(b);
    if (s <= d || i === ROUTE.length - 1) return { p: a.clone().lerp(b, Math.min(s / d, 1)), dir: b.clone().sub(a).normalize() };
    s -= d;
  }
}
function strollToRecords(dt) {
  const target = game ? routeLen : dancing ? danceLen : 0, step = WALK_SPEED * dt;
  const moving = Math.abs(target - walkS) > 0.001;
  walkS += THREE.MathUtils.clamp(target - walkS, -step, step);
  const { p, dir } = routeAt(walkS);
  // off the platform's back edge (z -2.15) and down to the floor by z -2.45
  p.y = THREE.MathUtils.lerp(PLATFORM, FLOOR, THREE.MathUtils.clamp((-2.15 - p.z) / 0.3, 0, 1));
  me.position.copy(p);
  // face where you're going (backwards along the route on the way home); standing, face the street, or the PICKUP
  // counter once you're through the door, or the board when he's come over to play
  const atBoard = game && walkS > routeLen - 0.01;
  const heading = moving ? Math.atan2(dir.x, dir.z) + (target < walkS ? Math.PI : 0)
    : atBoard ? Math.atan2(CK.centre.x - p.x, CK.centre.z - p.z) : inProgress > 0.45 ? PICKUP_HEADING : 0;
  let turn = heading - me.rotation.y;
  turn = Math.atan2(Math.sin(turn), Math.cos(turn)); // the short way round
  me.rotation.y += turn * Math.min(1, dt * 8);
  walkAmt += ((moving ? 1 : 0) - walkAmt) * Math.min(1, dt * 8);
  sitAmt += ((atBoard ? 1 : 0) - sitAmt) * Math.min(1, dt * 4); // at the board he sits down
  me.position.y += SIT.dy * sitAmt;
}
let dancing = false, danceAmt = 0;
function animateDance(dt) {
  if (dancing && !musicOn()) dancing = false; // the music stopped: so does he
  const there = Math.abs(walkS - danceLen) < 0.01; // dance once he's at the record player
  if (danceAmt < 0.002 && dancing && there) danceAction.time = 0; // each dance starts from the top
  danceAmt += ((dancing && there ? 1 : 0) - danceAmt) * Math.min(1, dt * 4);
}

function animateCharacter(dt) {
  if (progress > 0.85 && !waved) { waved = true; wave(); }
  if (progress < 0.5) waved = false; // walk away and back to get another hello
  strollToRecords(dt);
  animateDance(dt);
  walkAction.weight = walkAmt; // the idle (and a wave) take whatever the walk and dance leave
  danceAction.weight = danceAmt;
  sitAction.weight = sitAmt;
  idleAction.weight = waveAction.weight = Math.max(0, 1 - walkAmt - danceAmt - sitAmt);
  // the mixer only writes a bone when the clip value changes, so put back the clip pose before it runs,
  // otherwise the look-at offset would stack up frame after frame while the clip stands still
  headBone.quaternion.copy(headMixed);
  for (const a of ARMS) a.bone.quaternion.copy(a.mixed);
  mixer.update(dt);
  headMixed.copy(headBone.quaternion);
  for (const a of ARMS) { a.mixed.copy(a.bone.quaternion); a.bone.quaternion.slerp(a.idle, sitAmt); }
  // eye contact: turn the head toward the camera on top of the clip, within a natural neck range, eased
  forward.set(Math.sin(me.rotation.y), 0, Math.cos(me.rotation.y));
  headBone.getWorldPosition(_hp);
  _dir.subVectors(camera.position, _hp).normalize();
  _q.setFromUnitVectors(forward, _dir);
  // turns further once you're inside; walking or dancing, his head follows the move instead
  look.slerp(new THREE.Quaternion().rotateTowards(_q, D(30 + 35 * inProgress) * Math.max(0, 1 - walkAmt - danceAmt)), 0.08);
  headBone.parent.getWorldQuaternion(_pq);
  headBone.quaternion.premultiply(_pq.clone().invert().multiply(look).multiply(_pq));
}

// ---------------------------------------------------------------- order a drink, pick a seat, sit and look around
const drinkTpl = Object.fromEntries(drinks.map((d) => [d.id, scene.getObjectByName(`TPL_drink_${d.id}`)]));
for (const t of Object.values(drinkTpl)) t?.parent?.remove(t);
// every seat in the shop (and the plastic chair outside), with the table its drink goes on
const SEATS = [
  { seat: "mcm_chair_0", table: "mcm_table", face: [3.0, 0.5] }, // facing its table is nose to the wall: face the door
  ...[0, 1, 2, 3].map((i) => ({ seat: `stool_steel_${i}`, table: "center_table" })),
  ...[-0.5, 0.5].map((dx) => ({ seat: "window_bench", table: "window_table", dx })),
  { seat: "monobloc", table: "cart_body" },
].map((s) => {
  const sb = new THREE.Box3().setFromObject(scene.getObjectByName(s.seat));
  const tb = new THREE.Box3().setFromObject(scene.getObjectByName(s.table));
  const p = sb.getCenter(new THREE.Vector3()); p.x += s.dx || 0;
  const floor = sb.min.y;
  const tc = tb.getCenter(new THREE.Vector3());
  // which way you face: the table, or a set direction where the table would put you nose to the wall
  const dir = (s.face ? new THREE.Vector3(s.face[0] - p.x, 0, s.face[1] - p.z) : new THREE.Vector3(tc.x - p.x, 0, tc.z - p.z)).normalize();
  // the drink: on the table where it's nearest the spot just in front of you, a little in from the rim
  const front = p.clone().addScaledVector(dir, 0.4);
  const spot = new THREE.Vector3(THREE.MathUtils.clamp(front.x, tb.min.x, tb.max.x), tb.max.y, THREE.MathUtils.clamp(front.z, tb.min.z, tb.max.z));
  spot.add(new THREE.Vector3(tc.x - spot.x, 0, tc.z - spot.z).setLength(0.15));
  return { p, floor, spot, dir, table: s.table };
});
const pinTex = (() => {
  const cv = document.createElement("canvas"); cv.width = cv.height = 128;
  const x = cv.getContext("2d");
  x.fillStyle = "#ffd23f"; x.strokeStyle = "#fff"; x.lineWidth = 12;
  x.beginPath(); x.arc(64, 64, 50, 0, Math.PI * 2); x.fill(); x.stroke();
  x.fillStyle = "#2b2420"; x.font = "bold 60px sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("↓", 64, 68);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
let pins = [];
let myDrink = null, seated = false, picking = null, mySeat = null;
function drinkMenu(r) {
  closeBubble();
  showBubble({ title: "Menu", body: "What can I get you?",
    actions: drinks.map((d) => ({ label: `${d.emoji} ${d.name}`, run: () => order(d) })) }, r);
}
function order(d) {
  closeBubble();
  wave();
  const me = scene.getObjectByName("HOT_character");
  showBubble({ title: `${d.name}, coming right up!`, body: "Sit anywhere you like." }, screenRect(me), 1800);
  setTimeout(() => pickSeat(d), 1900);
}
// step back so the whole room shows, and float a pin over every seat: tap one to sit there
// from: the seat you're moving from (Cancel takes you back to it); null on a fresh order
function pickSeat(d, from = null) {
  clearPins();
  picking = d;
  seated = false;
  lockScroll(true);
  director = { pos: new THREE.Vector3(3.3, 4.6, 4.4), look: new THREE.Vector3(3.4, 0.2, -1.4), fov: 52 };
  pins = SEATS.map((s, i) => i === from ? null : s).map((s, i) => {
    if (!s) return null;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex, transparent: true, depthTest: false, sizeAttenuation: false }));
    sp.position.set(s.p.x, s.floor + 0.9, s.p.z);
    sp.scale.setScalar(0.055); // a fixed size on screen, easy to tap
    sp.renderOrder = 10;
    sp.userData = { hotspot: "seat", seat: i };
    gltf.scene.add(sp); // inside gltf.scene so taps find it
    return sp;
  }).filter(Boolean);
  showSeatBar("Pick a seat", "Tap a yellow pin", "Cancel", from === null ? standUp : () => sitAt(from));
}
function clearPins() { for (const p of pins) p.parent?.remove(p); pins = []; }
function sitAt(i) {
  const d = picking, s = SEATS[i];
  picking = null;
  mySeat = i;
  clearPins();
  const level = myDrink?.userData.id === d.id ? myDrink.userData.level : 1; // moving seats: your drink comes with you
  myDrink?.parent?.remove(myDrink);
  myDrink = drinkTpl[d.id].clone(true);
  myDrink.position.copy(s.spot);
  Object.assign(myDrink.userData, { hotspot: "sip", id: d.id, level });
  fill(myDrink);
  gltf.scene.add(myDrink);
  seated = true;
  // eyes above the seat, a little back from the table, looking over your drink and on into the room
  const pos = new THREE.Vector3(s.p.x, s.floor + 1.2, s.p.z).addScaledVector(s.dir, -0.12);
  const ahead = pos.clone().addScaledVector(s.dir, 1.6).setY(s.floor + 0.5); // tipped down enough to see your drink
  gaze.yaw = gaze.pitch = 0;
  renderer.domElement.style.touchAction = "none"; // a finger drag turns your head instead of scrolling
  director = { pos, look: ahead, base: ahead.clone().sub(pos), fov: 66 };
  showSeatBar(`${d.emoji} ${d.name}`, "Tap your drink to sip · drag to look around", "Back to the street", standUp, () => pickSeat(d, i));
}
function showSeatBar(title, hint, leave, onLeave, onMove = null) {
  const bar = document.getElementById("seatbar");
  bar.hidden = false;
  document.getElementById("seat-title").textContent = title;
  document.getElementById("seat-hint").textContent = hint;
  const btn = document.getElementById("seat-leave");
  btn.textContent = leave;
  btn.onclick = (e) => { e.stopPropagation(); onLeave(); };
  const move = document.getElementById("seat-move");
  move.hidden = !onMove;
  move.onclick = (e) => { e.stopPropagation(); onMove(); };
}
// drag to look around (mouse or finger), on the street and while seated; a drag doesn't count as a tap.
// On the street a phone keeps vertical swipes for walking (touch-action: pan-y), so a sideways swipe turns your head.
const gaze = { yaw: 0, pitch: 0, drag: null, moved: false };
const _up = new THREE.Vector3(0, 1, 0), _side = new THREE.Vector3();
renderer.domElement.addEventListener("pointerdown", (e) => {
  gaze.moved = false;
  if (!director || seated) gaze.drag = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY }; // not during tour shots or picking a seat
});
renderer.domElement.style.touchAction = "pan-y";
addEventListener("pointermove", (e) => {
  if (!gaze.drag) return;
  if (e.pointerType === "mouse" && !e.buttons) { gaze.drag = null; return; } // the button came up where we didn't hear it
  // a click wobbles a few pixels: only a real drag (6 px from where it started) turns your head, and isn't a tap
  if (!gaze.moved) {
    if (Math.hypot(e.clientX - gaze.drag.x0, e.clientY - gaze.drag.y0) < 6) return;
    closeBubble(); // looking away closes the speech bubble
  }
  gaze.moved = true;
  const dx = e.clientX - gaze.drag.x, dy = e.clientY - gaze.drag.y;
  // how far you can turn: a glance on the street (the shop stays in view), all the way round inside or seated
  // (the plastic chair outside too)
  const street = !seated && inProgress < 0.001;
  const [yaw, up, down] = street ? [0.52, 0.26, 0.26] : [Math.PI, 0.45, 0.5]; // street ±30°, up/down ±15°; else up 26°, down 29°
  gaze.yaw += dx * 0.004;
  gaze.yaw = Math.atan2(Math.sin(gaze.yaw), Math.cos(gaze.yaw)); // keep it within one turn, so walking eases it back the short way
  gaze.yaw = THREE.MathUtils.clamp(gaze.yaw, -yaw, yaw);
  gaze.pitch = THREE.MathUtils.clamp(gaze.pitch + dy * 0.003, -down, up);
  gaze.drag = { x: e.clientX, y: e.clientY };
});
addEventListener("pointerup", () => { gaze.drag = null; });
addEventListener("pointercancel", () => { gaze.drag = null; }); // the browser took the swipe for scrolling
function turned(pos, dir) { // called by placeCamera: where to look from pos once the drag has turned your head
  const d = dir.clone().applyAxisAngle(_up, gaze.yaw);
  _side.crossVectors(d, _up).normalize();
  d.applyAxisAngle(_side, gaze.pitch);
  return pos.clone().add(d);
}
function fill(drink) {
  const lq = drink.getObjectByName(drink.name + "_liquid") || drink.children.find((c) => /_liquid$/.test(c.name));
  if (lq) lq.scale.y = Math.max(0.02, drink.userData.level);
}
function sip() {
  if (!myDrink) return;
  myDrink.userData.level = Math.max(0, myDrink.userData.level - 0.25);
  fill(myDrink);
  sound.slurp(myDrink.userData.level === 0);
  if (myDrink.userData.level === 0) showBubble({ title: "All gone!", body: "Another one?",
    actions: drinks.map((d) => ({ label: `${d.emoji} ${d.name}`, run: () => refill(d) })) }, screenRect(myDrink));
}
// a fresh drink at the same seat, without turning your head
function refill(d) {
  closeBubble();
  const { yaw, pitch } = gaze;
  myDrink.userData.level = 1;
  picking = d;
  sitAt(mySeat);
  Object.assign(gaze, { yaw, pitch });
}
function standUp() {
  seated = false;
  picking = null;
  clearPins();
  renderer.domElement.style.touchAction = "pan-y";
  gaze.yaw = gaze.pitch = 0;
  director = null;
  lockScroll(false);
  document.getElementById("seatbar").hidden = true;
}

// ---------------------------------------------------------------- Thai checkers (หมากฮอส) against him, on the centre table
// An easter egg: sit at the centre table and his bubble offers a game. The board pops onto the free end of the centre table, you
// pick easy or hard, and the camera looks down from the stool by the door. Tap one of your red caps, then a dot to
// move it; the board is put away when you're done. Rules and bot: checkers.js.
const CK = (() => {
  const t = new THREE.Box3().setFromObject(scene.getObjectByName("center_table"));
  const book = new THREE.Box3().setFromObject(scene.getObjectByName("HOT_book"));
  const size = 0.4, sq = size / 8;
  const centre = new THREE.Vector3((book.max.x + t.max.x) / 2, t.max.y, (t.min.z + t.max.z) / 2);
  const board = new THREE.Group();
  board.position.copy(centre);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(size + 0.03, 0.016, size + 0.03), new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.6 }));
  frame.position.y = 0.008;
  const cv = document.createElement("canvas"); cv.width = cv.height = 256;
  const g = cv.getContext("2d"); // the texture runs bottom-up: dark here lands under the caps
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { g.fillStyle = (r + c) % 2 ? "#f4f1ea" : "#1f1d1b"; g.fillRect(c * 32, r * 32, 32, 32); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.0165;
  board.add(frame, top);
  for (const o of [frame, top]) { o.castShadow = false; o.receiveShadow = true; }
  // square (row 0 = his side, far from the door; col 0 = your left) <-> a spot on the board
  const at = (i) => new THREE.Vector3(((i & 7) - 3.5) * sq, 0.0165, ((i >> 3) - 3.5) * sq);
  const capGeo = new THREE.CylinderGeometry(0.019, 0.018, 0.007, 24);
  const capMat = { 1: new THREE.MeshStandardMaterial({ color: 0xd8342c, roughness: 0.35, metalness: 0.3 }),
    [-1]: new THREE.MeshStandardMaterial({ color: 0x2f6fd8, roughness: 0.35, metalness: 0.3 }) };
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }); // where it can go
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe100, depthWrite: false }); // the cap you picked
  const dotGeo = new THREE.CircleGeometry(sq * 0.18, 20).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(sq * 0.46, sq * 0.56, 28).rotateX(-Math.PI / 2);
  return { board, top, at, sq, centre, capGeo, capMat, dotMat, ringMat, dotGeo, ringGeo, caps: new Map(), marks: [] };
})();
function cap(v) { // a bottle cap for a piece; a king (ฮอส) is two caps stacked
  const m = new THREE.Mesh(CK.capGeo, CK.capMat[Math.sign(v)]);
  m.castShadow = true;
  if (Math.abs(v) === 2) { const k = m.clone(); k.position.y = 0.0075; m.add(k); }
  return m;
}
function layoutCaps(b) {
  for (const m of CK.caps.values()) CK.board.remove(m);
  CK.caps.clear();
  b.forEach((v, i) => { if (!v) return; const m = cap(v); m.position.copy(CK.at(i)).y += 0.0035; CK.board.add(m); CK.caps.set(i, m); });
}
layoutCaps(startBoard());

let game = null; // { b, level, sel, moves, busy, quiet }
const SAY = { mine: ["Gotcha!", "Mine now.", "Oops, for you."], yours: ["Nice one!", "Hey!", "Ouch."], think: ["Hmm…", "Let me see…", "Thinking…"] };
const say = (k) => SAY[k][Math.floor(Math.random() * SAY[k].length)];
function checkersMenu(r) {
  showBubble({ title: "Thai checkers", body: "Fancy a game of หมากฮอส? Red caps are yours, and you go first.", actions: [
    { label: "😌 Easy", run: () => startCheckers("easy") }, { label: "🔥 Hard", egg: true, run: () => startCheckers("hard") }] }, r);
}
function startCheckers(level) {
  closeBubble();
  const seat = game ? game.seat : seated ? mySeat : null; // where you sat: quitting takes you back there
  dancing = false; // he comes over to play instead
  game = { b: startBoard(), level, seat, sel: null, moves: [], busy: false, quiet: 0 };
  layoutCaps(game.b);
  if (!CK.board.parent) { // it pops up onto the table
    scene.add(CK.board);
    const t0 = performance.now();
    (function grow(now) {
      const k = Math.min(1, (now - t0) / 450);
      CK.board.scale.setScalar(Math.max(0.001, 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2)); // ease out with a little overshoot
      if (k < 1) requestAnimationFrame(grow);
    })(t0);
  }
  lockScroll(true);
  seated = false;
  // a wide shot while he walks over, then down to the board once he's there
  director = boardShot(false);
  (function settle() { if (!game) return; if (walkS > routeLen - 0.01) director = boardShot(true); else setTimeout(settle, 200); })();
  checkersBar("Your move: tap a red cap");
}
function boardShot(close) { // from your stool: close = the board fills the view; wide = him across the board too
  const c = CK.centre;
  return close ? { pos: new THREE.Vector3(c.x, c.y + 0.62, c.z + 0.42), look: new THREE.Vector3(c.x, c.y, c.z - 0.03), fov: 50 }
    : { pos: new THREE.Vector3(c.x, c.y + 0.95, c.z + 1.05), look: new THREE.Vector3(c.x, c.y + 0.51, c.z - 0.5), fov: 70 };
}
function checkersBar(hint, over = false) {
  const title = `♟ Checkers · ${game.level === "easy" ? "Easy" : "Hard"}`;
  // narrow screens hide the hint: it takes the title's place
  showSeatBar(matchMedia("(max-width: 960px)").matches ? hint : title, hint, over ? "Done" : "Quit", quitCheckers,
    over ? () => startCheckers(game.level) : null);
  document.getElementById("seat-move").textContent = "Play again";
}
function quitCheckers() {
  const seat = game.seat;
  clearMarks();
  game = null;
  scene.remove(CK.board); // put away till next time
  document.getElementById("seat-move").textContent = "Change seat";
  if (seat === null || !myDrink) return standUp();
  picking = drinks.find((d) => d.id === myDrink.userData.id); // back on your stool, drink and all
  sitAt(seat);
}
function clearMarks() { for (const m of CK.marks) CK.board.remove(m); CK.marks = []; }
function mark(i, geo, mat = CK.dotMat) { const m = new THREE.Mesh(geo, mat); m.position.copy(CK.at(i)).y += 0.001; m.renderOrder = 5; CK.board.add(m); CK.marks.push(m); }
function select(i) {
  clearMarks();
  game.sel = i;
  const ms = legalMoves(game.b, 1).filter((m) => m.from === i);
  mark(i, CK.ringGeo, CK.ringMat);
  for (const m of ms) mark(m.to, CK.dotGeo);
}
function boardClick(e) {
  if (!game || game.busy) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const h = ray.intersectObject(CK.top)[0];
  if (!h) return;
  const p = CK.board.worldToLocal(h.point.clone());
  const c = Math.floor(p.x / CK.sq + 4), r = Math.floor(p.z / CK.sq + 4);
  if (c < 0 || c > 7 || r < 0 || r > 7) return;
  const i = r * 8 + c, ms = legalMoves(game.b, 1);
  const go = ms.find((m) => m.from === game.sel && m.to === i);
  if (go) return move(go);
  if (game.b[i] > 0) {
    if (ms.some((m) => m.from === i)) return select(i);
    checkersBar(ms[0].caps.length ? "You must capture" : "That cap can't move");
  }
}
function hop(m, from, to, dur = 260) { // a cap hops from one square to the next
  return new Promise((done) => {
    const a = CK.at(from), b = CK.at(to), t0 = performance.now();
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      m.position.lerpVectors(a, b, e).y += 0.0035 + Math.sin(Math.PI * k) * 0.035;
      if (k < 1) requestAnimationFrame(step); else done();
    })(performance.now());
  });
}
async function move(mv) {
  const side = Math.sign(game.b[mv.from]);
  game.busy = true;
  clearMarks();
  const m = CK.caps.get(mv.from);
  for (let k = 1; k < mv.path.length; k++) {
    await hop(m, mv.path[k - 1], mv.path[k]);
    feedback(m, false); // a clack as it lands
    const gone = mv.caps[k - 1]; // the cap it just jumped (a chain takes one per hop)
    if (gone !== undefined) { const x = CK.caps.get(gone); x.scale.setScalar(0.001); }
  }
  for (const x of mv.caps) { CK.board.remove(CK.caps.get(x)); CK.caps.delete(x); }
  CK.caps.delete(mv.from);
  game.b = play(game.b, mv);
  CK.board.remove(m);
  const n = cap(game.b[mv.to]); // crowned caps come back stacked
  n.position.copy(CK.at(mv.to)).y += 0.0035;
  CK.board.add(n); CK.caps.set(mv.to, n);
  game.quiet = mv.caps.length ? 0 : game.quiet + 1;
  game.sel = null;
  game.busy = false;
  const next = -side;
  if (!legalMoves(game.b, next).length) return endCheckers(next === -1 ? "win" : "lose");
  if (game.quiet >= 60) return endCheckers("draw"); // 30 moves each without a capture
  if (next === -1) {
    checkersBar(mv.caps.length ? `Bankza: ${say("yours")}` : `Bankza: ${say("think")}`);
    game.busy = true;
    setTimeout(() => { if (!game) return; game.busy = false; const bm = botMove(game.b, -1, game.level); move(bm); }, 650);
  } else {
    const must = legalMoves(game.b, 1)[0].caps.length;
    checkersBar(mv.caps.length ? `Bankza: ${say("mine")}` : must ? "You must capture" : "Your move");
  }
}
function endCheckers(result) {
  game.busy = true;
  checkersBar(result === "win" ? "You win! 🎉" : result === "lose" ? "Bankza wins! 😎" : "A draw 🤝", true);
  bigText(result === "win" ? "YOU WIN!" : result === "lose" ? "BANKZA WINS!" : "DRAW", result);
  setTimeout(() => { if (game) director = boardShot(false); }, 900); // look up to see how he takes it
  if (result === "win") { confetti(); tune([523, 659, 784, 1047], 0.11, "triangle"); }
  if (result === "lose") { wave(); victoryHops(); tune([392, 370, 349, 294], 0.32, "sawtooth", true); }
}
function bigText(text, kind) { // pops in with a bounce, holds, and fades away
  const el = document.createElement("div");
  el.id = "gameover"; el.className = kind; el.setAttribute("role", "status");
  el.innerHTML = `<b>${esc(text)}</b>`;
  document.body.append(el);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.firstChild.animate(reduce ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }] : [
    { transform: "scale(.3) rotate(-8deg)", opacity: 0 },
    { transform: "scale(1.12) rotate(2deg)", opacity: 1, offset: 0.12 },
    { transform: "scale(1) rotate(-2deg)", offset: 0.2 },
    { transform: "scale(1) rotate(-2deg)", opacity: 1, offset: 0.8 },
    { transform: "scale(1.05) translateY(-30px) rotate(-2deg)", opacity: 0 },
  ], { duration: 2600, easing: "ease-out" }).finished.then(() => el.remove());
}
// a few notes in a row: the win jingle goes up, the "wah wah wah waaah" for a loss slides down
function tune(freqs, step, type, sad = false) {
  try {
    fx ??= new AudioContext();
    const t0 = fx.currentTime + 0.05, lp = Object.assign(fx.createBiquadFilter(), { type: "lowpass" });
    lp.frequency.value = sad ? 900 : 4000;
    lp.connect(fx.destination);
    freqs.forEach((f, i) => {
      const t = t0 + i * step, len = i === freqs.length - 1 ? step * (sad ? 2.5 : 3) : step * 0.9;
      const osc = fx.createOscillator(), g = fx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f, t);
      if (sad && i === freqs.length - 1) osc.frequency.linearRampToValueAtTime(f * 0.94, t + len); // the last one droops
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(sad ? 0.09 : 0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(g).connect(lp);
      osc.start(t); osc.stop(t + len + 0.05);
    });
  } catch {}
}
// you win: paper confetti bursts up off the board and flutters down onto the table
function confetti() {
  const cols = [0xffe100, 0xff8418, 0xffffff, 0x2f6fd8, 0xff6fa8], geo = new THREE.PlaneGeometry(0.012, 0.018);
  const bits = Array.from({ length: 90 }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cols[Math.floor(Math.random() * cols.length)], side: THREE.DoubleSide }));
    m.position.set((Math.random() - 0.5) * 0.2, 0.03, (Math.random() - 0.5) * 0.2);
    m.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.8, 1.1 + Math.random() * 0.9, (Math.random() - 0.5) * 0.8),
      spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12) };
    CK.board.add(m);
    return m;
  });
  let last = performance.now();
  const t0 = last;
  (function fall(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (const m of bits) {
      const { v, spin } = m.userData;
      v.y -= 3.2 * dt; v.multiplyScalar(1 - 1.8 * dt); // gravity, and air drag so it flutters
      m.position.addScaledVector(v, dt);
      if (m.position.y < 0.018) { m.position.y = 0.018; v.set(0, 0, 0); spin.set(0, 0, 0); m.rotation.x = -Math.PI / 2; } // landed flat
      m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
    }
    if (now - t0 < 4000 && CK.board.parent) return requestAnimationFrame(fall);
    for (const m of bits) { CK.board.remove(m); m.material.dispose(); }
  })(t0);
}
// he wins: his caps hop for joy one after another, twice over
function victoryHops() {
  const his = [...CK.caps].filter(([i]) => game.b[i] < 0).map(([, m]) => m);
  his.forEach((m, k) => {
    const y0 = m.position.y;
    for (const rep of [0, 1]) setTimeout(() => {
      const t0 = performance.now();
      (function up(now) {
        const x = Math.min(1, (now - t0) / 320);
        m.position.y = y0 + Math.sin(Math.PI * x) * 0.03;
        if (x < 1) requestAnimationFrame(up);
      })(t0);
    }, k * 90 + rep * (his.length * 90 + 250));
  });
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
const life = createStreetLife({ scene, camera, sound, night: timeKey === "night" });
const startSound = () => { sound.start(); removeEventListener("pointerdown", startSound); removeEventListener("keydown", startSound); };
addEventListener("pointerdown", startSound);
addEventListener("keydown", startSound);
const muteBtn = document.getElementById("mute");
muteBtn.onclick = (e) => { e.stopPropagation(); sound.start(); muteBtn.textContent = sound.toggleMute() ? "🔇" : "🔊"; };

// ---------------------------------------------------------------- guided tour: the camera visits everything you can tap
const TOUR = [
  { title: "Welcome to NAKANG", body: "A little shop for my work. I'll show you what you can tap — or scroll anytime to walk around on your own.", shot: () => ({ pos: close.clone(), look: shopFront.clone().setY(1.9), fov: rig.cams.CAM_close.fov }) },
  { obj: "HOT_project_iport", title: "Projects", body: "Everything I've built sits in this case. Tap one to read about it and open it." },
  { obj: "HOT_character", frame: { minY: 1.25 }, title: "That's me", body: "Tap to say hi, read about me, or order a drink and sit down for a bit." },
  { obj: "HOT_menu", frame: { minY: 1.35 }, title: "The menu", body: "My skills and tools, listed like a coffee menu." },
  { obj: "HOT_record", title: "Music", body: "Tap the record player to put some lofi on." },
  { obj: "HOT_book", title: "Portfolio", body: "The yellow book on the table is my whole portfolio: about, skills, projects and more." },
  { obj: "HOT_board", title: "Guestbook", body: "Leave a note — draw anything on the blue board.",
    shot: () => ({ pos: new THREE.Vector3(2.4, 1.75, -1.75), look: new THREE.Vector3(4.9, 1.45, -1.75), fov: 40 }) },
  { obj: "HOT_clock", title: "Clock", body: "Shows your time. The shop lights follow it too." },
  { obj: "HOT_lamp_1", title: "Lamps", body: "Tap a lamp to switch it on or off." },
  { obj: "HOT_door", frame: { from: [-0.45, 0.15, 1] }, title: "The door", body: "Tap to open it, then keep scrolling to walk inside." },
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
    closeBubble(); // a card opened on the last stop would be left floating where that object was
    document.getElementById("tour-step").textContent = `${i + 1} / ${TOUR.length}`;
    document.getElementById("tour-icon").textContent = "";
    document.getElementById("tour-title").textContent = s.title;
    document.getElementById("tour-body").textContent = s.body;
    next.textContent = i === TOUR.length - 1 ? "Let's go" : "Next";
    back.hidden = i === 0;
    director = s.shot ? s.shot() : shotOf(scene.getObjectByName(s.obj), s.frame);
    if (s.obj) feedback(scene.getObjectByName(s.obj), false);
    if (s.obj === "HOT_character") wave();
    const b = tour.querySelector(".bubble");
    b.style.animation = "none"; b.offsetWidth; b.style.animation = "";
  };
  const close = () => {
    closeBubble();
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
  life.update(dt, performance.now() / 1000);
  // indoors the street goes quiet: a little with the door open, a lot with it shut
  const indoors = camera.position.z < -0.1 && camera.position.x > -3.2 && camera.position.x < 5;
  sound.muffle(indoors ? 1 - 0.65 * doorAmt : 0);
  animateBounces(performance.now());
  animateCat(performance.now());
  if (bubble?.anchor?.parent) placeBubble(bubble, screenRect(bubble.anchor));
  renderer.render(scene, camera);
});
