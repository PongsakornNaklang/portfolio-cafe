// Street life: traffic in both lanes (a dog drives the tuk-tuk and the taxi, a cat rides the motorbike), and mynas
// landing on the power lines; each with its own sound, loud when it's near the camera. Models are the TPL_* templates in storefront.glb.
import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const TAXI = [0xff6fa5, 0x7bc96f, 0xf7d046, 0xf4f2ec, 0x5aa0e6]; // Bangkok taxis: pink, green, yellow-green, ...

// ---------------------------------------------------------------- sound: one AudioContext, buffers loaded once
export function createSound() {
  let ctx = null, master = null, muted = false;
  const buffers = {};
  const files = ["car", "motorbike", "dog", "cat", "cat2", "bird", "street"];
  async function start() {
    if (ctx) return ctx.resume();
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
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
    src.connect(gain).connect(master);
    src.start();
    return { src, gain, stop: () => { try { src.stop(); } catch {} } };
  }
  return {
    start, play,
    get ready() { return !!ctx; },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 1; return muted; },
    get muted() { return muted; },
  };
}

// loudness by distance to the listener (the camera)
const near = (pos, cam, range = 22) => Math.max(0, 1 - pos.distanceTo(cam.position) / range) ** 1.5;

export function createStreetLife({ scene, camera, sound, traffic = true }) {
  const tpl = {};
  for (const n of ["TPL_tuktuk", "TPL_car", "TPL_motorbike", "TPL_dog", "TPL_cat", "TPL_bird"]) { // dog/cat: just taken off-stage
    const o = scene.getObjectByName(n);
    if (!o) continue;
    o.parent.remove(o); // templates live off-stage; we clone them in
    o.position.set(0, 0, 0);
    tpl[n] = o;
  }
  const actors = [];
  const _q = new THREE.Quaternion(), _axis = new THREE.Vector3();

  // rotate a bone about a world axis, on top of its rest pose
  function bend(bone, rest, worldAxis, angle) {
    bone.parent.getWorldQuaternion(_q).invert();
    _axis.copy(worldAxis).applyQuaternion(_q).normalize();
    bone.quaternion.setFromAxisAngle(_axis, angle).multiply(rest);
  }
  const bones = (o, names) => names.map((n) => o.getObjectByName(n)).filter(Boolean).map((b) => ({ b, rest: b.quaternion.clone() }));

  // ---------------------------------------------------------------- vehicles
  const VEH = {
    TPL_tuktuk: { speed: [3.2, 4.2], wheel: 0.24, sound: "motorbike", rate: 1.7, vol: 0.55 },
    TPL_car: { speed: [4.5, 6.5], wheel: 0.33, sound: "car", rate: 1, vol: 0.5 },
  };
  function spawnVehicle() {
    const kind = pick(Object.keys(VEH).filter((k) => tpl[k]));
    if (!kind) return;
    const spec = VEH[kind], o = tpl[kind].clone(true);
    const dir = Math.random() < 0.5 ? 1 : -1; // near lane drives +x, far lane -x (Thai traffic keeps left)
    o.position.set(dir > 0 ? -26 : 26, 0, dir > 0 ? 5.6 : 8.4);
    o.rotation.y = dir > 0 ? 0 : Math.PI;
    if (kind === "TPL_car") { // each taxi its own colour
      const c = new THREE.Color(pick(TAXI));
      o.traverse((m) => { if (m.isMesh && /carpaint/.test(m.material.name)) { m.material = m.material.clone(); m.material.color.copy(c); } });
    }
    scene.add(o);
    const wheels = [];
    o.traverse((m) => { if (/_wheel_\d$/.test(m.name)) wheels.push(m); });
    const loop = sound.play(spec.sound, { loop: true, volume: 0, rate: spec.rate * rand(0.92, 1.08) });
    actors.push({ type: "vehicle", o, dir, v: rand(...spec.speed), spec, wheels, loop });
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
    const o = SkeletonUtils.clone(tpl.TPL_bird);
    o.scale.setScalar(1.6);
    const perch = pick(perches).clone().add(new THREE.Vector3(0, -0.03, 0));
    const from = perch.clone().add(new THREE.Vector3(rand(-10, 10), rand(4, 7), rand(4, 10)));
    o.position.copy(from);
    scene.add(o);
    const wings = bones(o, ["TPL_bird_wing_0", "TPL_bird_wing_1"]);
    actors.push({ type: "bird", o, from, perch, to: null, t: 0, state: "in", stay: rand(6, 16), wings, sang: false });
  }

  // ---------------------------------------------------------------- update
  let tVeh = 2, tBird = 3;
  const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3();
  function update(dt, time, roadOpen = true) {
    // when the camera has walked up onto the road (the window shot), traffic would drive through it: pause new cars
    if ((tVeh -= dt) < 0) { if (roadOpen && traffic) spawnVehicle(); tVeh = rand(3.5, 9); }
    if ((tBird -= dt) < 0) {
      if (actors.filter((a) => a.type === "bird").length < 4) spawnBird();
      tBird = rand(4, 10);
    }
    for (let i = actors.length - 1; i >= 0; i--) {
      const a = actors[i], o = a.o;
      let done = false;
      if (a.type === "vehicle") {
        o.position.x += a.dir * a.v * dt;
        for (const w of a.wheels) w.rotation.z -= (a.v * dt) / a.spec.wheel;
        if (a.loop) a.loop.gain.gain.value = a.spec.vol * near(o.position, camera);
        o.visible = Math.abs(o.position.z - camera.position.z) > 2.2 || camera.position.z > 12; // never through the lens
        done = Math.abs(o.position.x) > 27;
      } else if (a.type === "bird") {
        let flap = 0;
        if (a.state === "in" || a.state === "out") {
          const target = a.state === "in" ? a.perch : a.to;
          const start = a.state === "in" ? a.from : a.perch;
          a.t = Math.min(1, a.t + dt / 2.6);
          const k = a.t * a.t * (3 - 2 * a.t);
          o.position.lerpVectors(start, target, k);
          o.position.y += Math.sin(k * Math.PI) * 0.8;
          const dx = target.x - start.x, dz = target.z - start.z;
          o.rotation.y = Math.atan2(-dz, dx);
          flap = Math.sin(time * 28) * 1.1;
          if (a.t >= 1) {
            if (a.state === "in") { a.state = "perch"; a.t = 0; o.rotation.y = rand(-0.4, 0.4) + (Math.random() < 0.5 ? 0 : Math.PI); }
            else done = true;
          }
        } else {
          a.stay -= dt;
          o.rotation.z = Math.sin(time * 1.3) * 0.04; // a little wobble on the wire
          if (!a.sang && Math.random() < dt * 0.3) { a.sang = true; sound.play("bird", { volume: 0.7 * near(o.position, camera, 16) }); }
          if (a.stay < 0) { a.state = "out"; a.t = 0; a.to = a.perch.clone().add(new THREE.Vector3(rand(-12, 12), rand(5, 8), rand(-4, 8))); }
        }
        const fwd = new THREE.Vector3(1, 0, 0).applyQuaternion(o.quaternion);
        a.wings.forEach(({ b, rest }, k) => bend(b, rest, fwd, (k ? -1 : 1) * (flap ? 0.9 + flap : 0)));
      }
      if (done) {
        a.loop?.stop();
        scene.remove(o);
        actors.splice(i, 1);
      }
    }
  }
  return { update };
}
