// Street life: traffic in both lanes (a dog drives the tuk-tuk, a cat drives the pink taxi), and mynas landing on the
// power lines; each with its own sound, loud when it's near the camera. Models are the TPL_* templates in storefront.glb (from Meshy).
import * as THREE from "three";

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// ---------------------------------------------------------------- sound: one AudioContext, buffers loaded once
export function createSound() {
  let ctx = null, master = null, outside = null, muffler = null, muted = false;
  // sounds from the street; they go through `outside`, which muffle() turns down and dulls when you're indoors
  const OUTDOOR = new Set(["car", "motorbike", "dog", "cat", "cat2", "bird", "street"]);
  const buffers = {};
  const files = ["car", "motorbike", "dog", "cat", "cat2", "bird", "street", "huh", "purr"];
  async function start() {
    if (ctx) return ctx.resume();
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    muffler = Object.assign(ctx.createBiquadFilter(), { type: "lowpass" });
    muffler.frequency.value = 20000;
    outside = ctx.createGain();
    outside.connect(muffler).connect(master);
    await Promise.all(files.map(async (f) => {
      try { buffers[f] = await ctx.decodeAudioData(await (await fetch(`sfx/${f}.mp3`)).arrayBuffer()); } catch {}
    }));
    const amb = play("street", { loop: true, volume: 0.12 }); // a quiet city bed under everything
    return amb;
  }
  function play(name, { loop = false, volume = 1, rate = 1 } = {}) {
    if (!ctx || !buffers[name]) return null;
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buffers[name];
    src.loop = loop;
    src.playbackRate.value = rate;
    gain.gain.value = volume;
    src.connect(gain).connect(OUTDOOR.has(name) ? outside : master);
    src.start();
    return { src, gain, stop: () => { try { src.stop(); } catch {} } };
  }
  // a little two-tone "beep beep" (pitch: tuk-tuks squeak higher than cars)
  function honk(pitch = 1, volume = 0.08) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [at, len] of [[0, 0.12], [0.18, 0.24]]) for (const f of [400, 505]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "square";
      o.frequency.value = f * pitch;
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(volume, t + at + 0.01);
      g.gain.setValueAtTime(volume, t + at + len);
      g.gain.linearRampToValueAtTime(0, t + at + len + 0.03);
      o.connect(g).connect(outside); // horns and the 7-Eleven chime are out on the street
      o.start(t + at);
      o.stop(t + at + len + 0.05);
    }
  }
  // the 7-Eleven door chime every Thai knows: a high "ding", a low "dong", each a bell that rings out
  // a car pulling up for you: a short squeal of brakes
  function squeal(volume = 0.035) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const f of [2150, 2230]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * 0.88, t + 0.55); // dropping as it slows
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.05);
      g.gain.linearRampToValueAtTime(0, t + 0.6);
      o.connect(g).connect(outside);
      o.start(t);
      o.stop(t + 0.65);
    }
  }
  // getting in or out: a door shutting, a dull thunk (low noise, quickly gone)
  function thunk(volume = 0.5) {
    if (!ctx) return;
    const t = ctx.currentTime, len = 0.25;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.035));
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    lp.type = "lowpass";
    lp.frequency.value = 220;
    g.gain.value = volume;
    src.connect(lp).connect(g).connect(outside);
    src.start(t);
  }
  // the portfolio book: a page turning over (a swish of high noise that rises and falls) and its cover (a soft papery thud)
  function paper(volume = 0.5, len = 0.38) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    bp.type = "bandpass";
    bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(1400, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + len * 0.45);
    bp.frequency.exponentialRampToValueAtTime(2200, t + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume * 0.35, t + len * 0.25);
    g.gain.linearRampToValueAtTime(volume, t + len * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(master); // indoors, so not through the street muffler
    src.start(t);
  }
  function flap(volume = 0.5) {
    if (!ctx) return;
    const t = ctx.currentTime, len = 0.3;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    const src = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    lp.type = "lowpass";
    lp.frequency.value = 900;
    g.gain.value = volume;
    src.connect(lp).connect(g).connect(master);
    src.start(t);
    paper(volume * 0.4, 0.22); // with a little rustle of the pages
  }
  function chime(volume = 0.12) {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [at, f] of [[0, 659.25], [0.55, 523.25]]) for (const [h, amp] of [[1, 1], [2, 0.35], [3, 0.15], [4.2, 0.08]]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f * h;
      g.gain.setValueAtTime(0, t + at);
      g.gain.linearRampToValueAtTime(volume * amp, t + at + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + 1.6 / h);
      o.connect(g).connect(outside); // horns and the 7-Eleven chime are out on the street
      o.start(t + at);
      o.stop(t + at + 1.7);
    }
  }
  // a sip through the straw: filtered noise with a gurgle; the last sip rattles at the bottom of the cup
  function slurp(last = false) {
    if (!ctx) return;
    const t = ctx.currentTime, len = last ? 0.75 : 0.4;
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf;
    bp.type = "bandpass";
    bp.Q.value = 5;
    bp.frequency.setValueAtTime(450, t);
    bp.frequency.linearRampToValueAtTime(last ? 1500 : 850, t + len);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45, t + 0.04);
    g.gain.setValueAtTime(0.45, t + len - 0.08);
    g.gain.linearRampToValueAtTime(0, t + len);
    const lfo = ctx.createOscillator(), depth = ctx.createGain(); // the gurgle: wobble the volume
    lfo.type = last ? "square" : "sine";
    lfo.frequency.value = last ? 21 : 13;
    depth.gain.value = 0.3;
    lfo.connect(depth).connect(g.gain);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    lfo.start(t);
    lfo.stop(t + len);
  }
  return {
    start, play, honk, slurp, chime, squeal, thunk, paper, flap,
    // k = 0: out on the street; 1: indoors with the door shut (street sounds quiet and dull, like through glass)
    muffle(k) {
      if (!ctx || Math.abs(k - (this.k ?? 0)) < 0.01) return; // called every frame: only schedule real changes
      this.k = k;
      const t = ctx.currentTime;
      outside.gain.setTargetAtTime(1 - 0.7 * k, t, 0.15);
      muffler.frequency.setTargetAtTime(600 * (20000 / 600) ** (1 - k), t, 0.15);
    },
    get ready() { return !!ctx; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 1; return muted; },
    get muted() { return muted; },
  };
}

// loudness by distance to the listener (the camera)
const near = (pos, cam, range = 22) => Math.max(0, 1 - pos.distanceTo(cam.position) / range) ** 1.5;

export function createStreetLife({ scene, camera, sound, night = false }) {
  const tpl = {};
  for (const n of ["TPL_tuktuk", "TPL_car", "TPL_bird"]) {
    const o = scene.getObjectByName(n);
    if (!o) continue;
    o.parent.remove(o); // templates live off-stage; we clone them in
    o.position.set(0, 0, 0);
    tpl[n] = o;
  }
  const actors = [];

  // ---------------------------------------------------------------- vehicles
  const VEH = {
    // lamps: the headlamps painted on each model, in its own frame (x forward, y up), measured in Blender:
    // the tuk-tuk has one in the middle of its nose, the taxi two round ones either side of the grille
    // seat: where your eyes are when you ride in the back, head: the driver's, in the same frame
    TPL_tuktuk: { speed: [3.2, 4.2], sound: "motorbike", rate: 1.7, vol: 0.55, horn: 1.35, driver: ["dog"], lamps: [[1.07, 0.975, 0]], seat: [-1.0, 1.4, -0.3], head: [0.3, 1.45, 0] },
    TPL_car: { speed: [4.5, 6.5], sound: "car", rate: 1, vol: 0.5, horn: 1, driver: ["cat", "cat2"], lamps: [[1.9, 0.955, -0.69], [1.9, 0.955, 0.69]], seat: [-0.7, 1.65, -0.4], head: [0.25, 1.6, -0.06] },
  };
  const LANE = { 1: 5.6, [-1]: 8.4 }; // z of each lane: near lane drives +x, far lane -x (Thai traffic keeps left)
  const TURN = 14, R = 1.4; // with you in it, a car U-turns this far along the street (the road ends at ±20), round a half circle
  // headlights after dark: two glowing lamps on the front, and a beam on the road from a pool of spotlights made once
  // (adding a light per car would recompile every shader as cars come and go)
  const beams = [];
  let glow = null;
  if (night) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,250,230,1)");
    grad.addColorStop(0.25, "rgba(255,240,200,0.7)");
    grad.addColorStop(1, "rgba(255,230,180,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glow = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 4; i++) { // enough for every car on the street at once
      const l = new THREE.SpotLight(0xfff1d6, 0, 22, 0.45, 0.6, 1.2);
      scene.add(l, l.target);
      beams.push(l);
    }
  }
  function headlights(o, spec) {
    for (const [x, y, z] of spec.lamps) {
      const s = new THREE.Sprite(glow);
      s.position.set(x + 0.03, y, z); // just proud of the lamp, so the glow isn't half inside the body
      s.scale.setScalar(0.45);
      o.add(s);
    }
    const beam = beams.find((l) => !l.userData.car);
    if (!beam) return null;
    beam.userData.car = o;
    beam.intensity = 40;
    const [x, y] = spec.lamps[0];
    beam.userData.at = new THREE.Vector3(x, y, 0); // between the lamps; follows the car in update()
    return beam;
  }
  function spawnVehicle() {
    const kind = pick(Object.keys(VEH).filter((k) => tpl[k]));
    if (!kind) return;
    const dir = Math.random() < 0.5 ? 1 : -1;
    const x0 = dir > 0 ? -26 : 26;
    if (actors.some((b) => b.type === "vehicle" && b.dir === dir && Math.abs(b.o.position.x - x0) < 10)) return; // the lane's backed up
    const spec = VEH[kind], o = tpl[kind].clone(true);
    o.position.set(x0, 0, LANE[dir]);
    o.rotation.y = dir > 0 ? 0 : Math.PI;
    o.userData.hotspot = "honk"; // tap it: the horn, then the driver (dog barks, cat meows)
    scene.add(o);
    const wheels = []; // cut out of the Meshy model by prep_meshy.py, origin on the axle
    o.traverse((c) => { if (/^wheel_/.test(c.name)) wheels.push({ c, r: new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3()).y / 2 }); });
    const rate = spec.rate * rand(0.92, 1.08);
    const loop = sound.play(spec.sound, { loop: true, volume: 0, rate });
    const beam = night ? headlights(o, spec) : null;
    const len = new THREE.Box3().setFromObject(tpl[kind]).getSize(new THREE.Vector3()).x / 2; // half its length, nose to tail
    const v = rand(...spec.speed);
    actors.push({ type: "vehicle", o, dir, v, cruise: v, v0: v, rate, len, spec, loop, seed: rand(0, 9), wheels, beam });
  }

  // ---------------------------------------------------------------- mynas: fly in, perch on a power line, fly off
  const perches = [];
  scene.traverse((m) => {
    if (m.isMesh && /^power_pole_cable_\d+/.test(m.name)) {
      m.updateWorldMatrix(true, false);
      const p = m.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i += 7) {
        v.fromBufferAttribute(p, i).applyMatrix4(m.matrixWorld);
        if (v.x > -6 && v.x < 9 && v.y > 4) perches.push(v.clone());
      }
    }
  });
  function spawnBird() {
    if (!tpl.TPL_bird || !perches.length) return;
    const o = tpl.TPL_bird.clone();
    const perch = pick(perches).clone().add(new THREE.Vector3(0, -0.03, 0));
    const from = perch.clone().add(new THREE.Vector3(rand(-10, 10), rand(4, 7), rand(4, 10)));
    o.position.copy(from);
    o.userData.hotspot = "bird"; // tap: it and its neighbours on the wire take off
    scene.add(o);
    actors.push({ type: "bird", o, from, perch, to: null, t: 0, state: "in", stay: rand(6, 16), sang: false });
  }

  // ---------------------------------------------------------------- update
  let tVeh = 2, tBird = 3;
  function update(dt, time) {
    if ((tVeh -= dt) < 0) { spawnVehicle(); tVeh = rand(3.5, 9); }
    if ((tBird -= dt) < 0) {
      if (actors.filter((a) => a.type === "bird").length < 4) spawnBird();
      tBird = rand(4, 10);
    }
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i], o = a.o;
      let done = false;
      if (a.type === "vehicle") {
        drive(a, dt);
        for (const w of a.wheels) w.c.rotation.z -= (a.v * dt) / w.r; // roll: the model drives along its own +X
        o.position.y = Math.abs(Math.sin(time * 9 + a.seed)) * 0.025; // a little road bounce (the Meshy models are one piece: no wheels to spin)
        if (a.wheelie) wheelie(a, dt);
        if (a.loop) { // louder near you; the engine's pitch follows its speed (ticking over when stopped), revving for a wheelie
          a.loop.gain.gain.value = a.spec.vol * near(o.position, camera);
          a.loop.src.playbackRate.value = a.rate * (0.65 + 0.35 * a.v / a.v0) * (1 + 0.4 * (a.rev || 0));
        }
        o.visible = a === ride?.a || Math.abs(o.position.z - camera.position.z) > 2.2 || camera.position.z > 12; // never through the lens
        done = a !== ride?.a && Math.abs(o.position.x) > 27;
        if (a.beam) { // from the lamps, ahead and down onto the road
          a.beam.position.copy(a.beam.userData.at).applyMatrix4(o.matrixWorld);
          a.beam.target.position.set(a.beam.position.x + a.dir * 8, 0, a.beam.position.z);
        }
      } else if (a.type === "bird") {
        if (a.state === "in" || a.state === "out") {
          const target = a.state === "in" ? a.perch : a.to;
          const start = a.state === "in" ? a.from : a.perch;
          a.t = Math.min(1, a.t + dt / 2.6);
          const k = a.t * a.t * (3 - 2 * a.t);
          o.position.lerpVectors(start, target, k);
          o.position.y += Math.sin(k * Math.PI) * 0.8;
          const dx = target.x - start.x, dz = target.z - start.z;
          o.rotation.y = Math.atan2(-dz, dx);
          o.rotation.x = Math.sin(time * 26) * 0.18; // wing-beat wobble (one-piece model, no wing bones)
          if (a.t >= 1) {
            if (a.state === "in") { a.state = "perch"; a.t = 0; o.rotation.x = 0; o.rotation.y = rand(-0.4, 0.4) + (Math.random() < 0.5 ? 0 : Math.PI); }
            else done = true;
          }
        } else {
          a.stay -= dt;
          o.rotation.z = Math.sin(time * 1.3) * 0.04; // a little wobble on the wire
          if (!a.sang && Math.random() < dt * 0.3) { a.sang = true; sound.play("bird", { volume: 0.7 * near(o.position, camera, 16) }); }
          if (a.stay < 0) flyOff(a);
        }
      }
      if (done) {
        a.loop?.stop();
        if (a.beam) { a.beam.intensity = 0; a.beam.userData.car = null; } // back to the pool
        scene.remove(o);
        actors.splice(i, 1);
      }
    }
  }
  // speed: its own, but never closer than a safe gap to the one ahead in its lane (stopping short if need be);
  // with you in it, it also stops to let you on, U-turns at each end of the street and stops at the shop to let you off
  let ride = null; // { a, hold, onStop, dropX, onOut, out }
  function drive(a, dt) {
    const o = a.o, x = o.position.x, mine = a === ride?.a;
    let want = mine && ride.hold ? 0 : a.cruise;
    if (!a.turn) {
      for (const b of actors) {
        if (b === a || b.type !== "vehicle" || !(b.turn || b.dir === a.dir) || (b.o.position.x - x) * a.dir <= 0) continue;
        const gap = Math.abs(b.o.position.x - x) - a.len - b.len;
        want = Math.min(want, Math.max(0, (gap - 1.2) * 1.3)); // 1.2 m bumper to bumper when stopped
      }
      if (mine && ride.dropX != null && a.dir > 0 && x < ride.dropX + 0.05) // pulling up at the shop
        want = Math.min(want, Math.sqrt(6 * Math.max(0, ride.dropX - x)));
      else if (mine) {
        const left = TURN - a.dir * x; // slow for the turn, and wait at it till the other lane's clear
        want = Math.min(want, 2.5 + Math.max(0, left) * 0.8);
        if (left <= 0) {
          const clear = !actors.some((c) => c !== a && c.type === "vehicle" && c.dir === -a.dir && (c.o.position.x - x) * a.dir > -5 && (c.o.position.x - x) * a.dir < 14);
          if (clear) a.turn = { x, from: a.dir, f: 0 };
          else want = 0;
        }
      }
    } else want = Math.min(want, 2.5);
    a.v += THREE.MathUtils.clamp(want - a.v, -8 * dt, 3 * dt);
    if (a.turn) {
      const t = a.turn, d = t.from;
      t.f = Math.min(Math.PI, t.f + (a.v * dt) / R);
      o.position.x = t.x + d * R * Math.sin(t.f);
      o.position.z = 7 - d * R * Math.cos(t.f);
      o.rotation.y = d > 0 ? -t.f : Math.PI - t.f;
      if (t.f >= Math.PI) { a.dir = -d; a.turn = null; o.position.z = LANE[a.dir]; }
    } else o.position.x += a.dir * a.v * dt;
    if (!mine || a.v > 0.02) return;
    if (ride.hold && ride.onStop) { ride.onStop(); ride.onStop = null; } // stopped for you: hop in
    if (ride.dropX != null && Math.abs(x - ride.dropX) < 0.1 && a.dir > 0 && !a.turn && ride.onOut) { // at the shop: out you get
      ride.onOut();
      ride.onOut = null;
      ride.hold = ride.out = true; // waits till main.js steps you out (release)
    }
  }
  // double-tapped: it pulls up for you. Returns who's driving ("cat" or "dog") and their head, or null if it can't stop now
  function hail(o, onStop) {
    const a = actors.find((a) => a.o === o);
    if (!a || a.type !== "vehicle" || ride || a.turn || !o.visible || Math.abs(o.position.x) > 18) return null;
    // an invisible box round the driver's head, for their speech bubble to sit on
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35));
    head.visible = false;
    head.position.set(...a.spec.head);
    o.add(head);
    ride = { a, hold: true, onStop };
    sound.squeal();
    return { kind: a.spec.driver[0] === "dog" ? "dog" : "cat", head };
  }
  function seat() { // where you sit, and which way is ahead (from this frame's position, not last frame's matrix)
    const o = ride.a.o;
    return { pos: new THREE.Vector3(...ride.a.spec.seat).applyEuler(o.rotation).add(o.position), ahead: new THREE.Vector3(1, -0.1, 0).applyEuler(o.rotation) };
  }
  // you asked the driver to go faster or slower: k times its own speed (it still keeps its distance)
  function pace(k) { ride.a.cruise = ride.a.v0 * k; }
  // the tuk-tuk pops a wheelie: nose up on its back axle for a couple of seconds, a wobble at the top, then back down
  function popWheelie() {
    const a = ride.a;
    if (a.wheelie) return;
    const o = a.o, back = Math.min(...a.wheels.map((w) => o.worldToLocal(w.c.getWorldPosition(new THREE.Vector3())).x));
    a.wheelie = { t: 0, back };
  }
  function wheelie(a, dt) {
    const w = a.wheelie, T = 2.4;
    w.t += dt;
    const up = Math.min(1, w.t / 0.35, (T - w.t) / 0.45); // up fast, down a touch slower
    const tilt = Math.max(0, up) * (0.32 + 0.04 * Math.sin(w.t * 9)); // radians, with a wobble while it balances
    a.rev = Math.max(0, up);
    a.o.rotation.z = tilt; // the model faces its own +X: +Z rotation lifts the nose
    a.o.position.y += -w.back * Math.sin(tilt); // pivot on the back wheels, so they stay on the road
    if (w.t >= T) { a.o.rotation.z = 0; a.wheelie = null; a.rev = 0; }
  }
  function go() { if (ride && !ride.out) ride.hold = false; } // (not if you've already been dropped off)
  function release() { ride.a.cruise = ride.a.v0; ride = null; } // its own speed again as it drives off
  function dropOff(x, onOut) { Object.assign(ride, { dropX: x, onOut }); }
  function flyOff(a) {
    a.state = "out"; a.t = 0;
    a.to = a.perch.clone().add(new THREE.Vector3(rand(-12, 12), rand(5, 8), rand(-4, 8)));
  }
  // a tap from the page on a car or a bird
  function poke(o) {
    const a = actors.find((a) => a.o === o);
    if (!a || !o.visible) return;
    if (a.type === "vehicle") {
      sound.honk(a.spec.horn);
      setTimeout(() => sound.play(pick(a.spec.driver), { volume: 0.9 }), 450);
    } else {
      sound.play("bird", { volume: 0.8 });
      for (const b of actors) if (b.type === "bird" && b.state === "perch" && b.o.position.distanceTo(o.position) < 4) flyOff(b);
    }
  }
  return { update, poke, hail, seat, go, dropOff, release, pace, popWheelie };
}
