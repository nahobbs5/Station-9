// The station's wear and tear, built from the plan in decorplan.js: leaky pipes, patched walls,
// broken corridor lights that stutter on, steam, drips and sparks. Mostly instanced meshes, so it's cheap.
import * as THREE from 'three';
import { WALL_H } from './layout.js';
import { planDecor } from './decorplan.js';

const ACTIVE_RANGE = 18;  // faults further away than this sit still
const POOL_LIGHTS = 3;    // real lights shared by whichever flickers are nearest you
// Seconds between events: [min, max].
const TIMERS = { steam: [6, 15], drip: [2.5, 7], spark: [10, 30], clank: [9, 24], light: [8, 25], dying: [5, 14] };
const TUBE_ON = new THREE.Color(0xdfe8ff), TUBE_OFF = new THREE.Color(0x14181b);
const between = ([a, b]) => a + Math.random() * (b - a);

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}
function tex(w, h, draw, wrap = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function blotches(g, w, h, rand, n, color, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color(rand());
    g.beginPath();
    g.ellipse(rand() * w, rand() * h, size * (0.3 + rand()), size * (0.2 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

// Textures ------------------------------------------------------------------------
function pipeTexture(base, seed) {
  const rand = seeded(seed);
  return tex(64, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 30, (r) => `rgba(110,52,20,${0.25 + r * 0.4})`, 10); // rust
    blotches(g, w, h, rand, 20, (r) => `rgba(15,12,8,${0.2 + r * 0.3})`, 8);     // grime
    for (let i = 0; i < 3; i++) { // paint bands where sections were joined
      g.fillStyle = `rgba(0,0,0,${0.35 + rand() * 0.2})`;
      g.fillRect(0, rand() * h, w, 3 + rand() * 4);
    }
    g.fillStyle = 'rgba(120,60,25,0.5)'; // rust running down one side
    for (let i = 0; i < 8; i++) g.fillRect(rand() * w, rand() * h, 2, 10 + rand() * 40);
  }, true);
}
function plateTexture() {
  const rand = seeded(21);
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = '#7d8286'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 26, (r) => `rgba(30,22,14,${0.25 + r * 0.4})`, 20);
    blotches(g, w, h, rand, 10, (r) => `rgba(110,50,20,${0.2 + r * 0.35})`, 14); // rust
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { g.beginPath(); const x = rand() * w, y = rand() * h; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 20); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#4a4d50';
    for (let i = 10; i < w; i += 22) for (const [x, y] of [[i, 8], [i, h - 8], [8, i], [w - 8, i]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(110,50,20,0.4)';
    for (let i = 0; i < 4; i++) g.fillRect(rand() * w, h * 0.6, 2, 30 + rand() * 30);
  });
}
function tapeTexture() {
  const rand = seeded(5);
  return tex(256, 32, (g, w, h) => {
    g.fillStyle = '#d8b02a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#161616';
    for (let x = -h; x < w; x += 28) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 14 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    blotches(g, w, h, rand, 16, (r) => `rgba(40,30,15,${0.2 + r * 0.4})`, 10); // dirt
    g.clearRect(w - 10 - rand() * 20, 0, 30, h * rand()); // torn end
  });
}
function woodTexture() {
  const rand = seeded(9);
  return tex(256, 32, (g, w, h) => {
    g.fillStyle = '#5e4630'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,20,10,0.5)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, rand() * h); g.bezierCurveTo(80, rand() * h, 170, rand() * h, w, rand() * h); g.stroke(); }
    g.fillStyle = '#2a2a2a';
    for (const x of [10, w - 10]) { g.beginPath(); g.arc(x, h / 2, 2.5, 0, 7); g.fill(); }
  });
}
function grateTexture() {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4246';
    for (let x = 4; x < w; x += 12) g.fillRect(x, 0, 5, h);
    g.fillStyle = '#2b2f32'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  });
}
function barrelTexture() {
  const rand = seeded(13);
  return tex(256, 128, (g, w, h) => {
    g.fillStyle = '#5b3a22'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a6a2a'; g.fillRect(0, h * 0.38, w, h * 0.24); // faded band
    blotches(g, w, h, rand, 40, (r) => `rgba(120,55,20,${0.3 + r * 0.4})`, 14);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 8, w, 5); g.fillRect(0, h - 13, w, 5);
  });
}
function puffTexture() {
  return tex(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, w);
  });
}

// Build ---------------------------------------------------------------------------
export function buildDecor(scene, layout, { onEvent = () => {} } = {}) {
  const plan = planDecor(layout);
  const group = new THREE.Group();
  scene.add(group);
  const up = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const instanced = (geo, mat, items, place) => {
    if (!items.length) return null;
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => { place(it, i); mesh.setMatrixAt(i, m.compose(p, q, s)); });
    group.add(mesh);
    return mesh;
  };

  // Pipes, in two mismatched finishes.
  const pipeMats = {
    copper: new THREE.MeshStandardMaterial({ map: pipeTexture('#8a5a36', 3), roughness: 0.45, metalness: 0.75 }),
    green: new THREE.MeshStandardMaterial({ map: pipeTexture('#4d5e52', 4), roughness: 0.6, metalness: 0.5 }),
  };
  const darkMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.5, metalness: 0.8 });
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 10);
  const pipeSegs = {};
  for (const kind of Object.keys(pipeMats)) {
    pipeSegs[kind] = instanced(cyl, pipeMats[kind], plan.pipes.filter((pp) => pp.kind === kind), (pp) => {
      const a = new THREE.Vector3(pp.a.x, pp.a.y, pp.a.z), b = new THREE.Vector3(pp.b.x, pp.b.y, pp.b.z);
      const d = b.clone().sub(a);
      const len = Math.max(0.01, d.length());
      p.copy(a).add(b).multiplyScalar(0.5);
      q.setFromUnitVectors(up, d.normalize());
      s.set(pp.r, len, pp.r);
    });
  }
  // Joints where corridor pipe segments meet, then flanges and ceiling brackets.
  const joints = [];
  const seen = new Set();
  for (const pp of plan.pipes) {
    if (pp.room) continue;
    const k = `${pp.a.x.toFixed(2)},${pp.a.y},${pp.a.z.toFixed(2)}`;
    if (!seen.has(k)) { seen.add(k); joints.push(pp); }
  }
  instanced(new THREE.SphereGeometry(1, 8, 5), darkMetal, joints, (pp) => { p.set(pp.a.x, pp.a.y, pp.a.z); q.identity(); s.setScalar(pp.r * 1.25); });
  instanced(new THREE.CylinderGeometry(1, 1, 1, 14), darkMetal, plan.flanges, (f) => {
    p.set(f.x, f.y, f.z);
    e.set(f.axis === 'z' ? Math.PI / 2 : 0, 0, f.axis === 'x' ? Math.PI / 2 : 0);
    q.setFromEuler(e);
    s.set(f.r * 1.75, 0.07, f.r * 1.75);
  });
  instanced(new THREE.BoxGeometry(1, 1, 1), darkMetal, plan.brackets, (b) => { p.set(b.x, b.y + b.len / 2, b.z); q.identity(); s.set(0.04, b.len, 0.07); });

  // Wall patchwork: plates, hazard tape, boarded sections.
  const wallQuat = (rot, tilt) => q.setFromEuler(e.set(0, rot, tilt, 'YXZ'));
  const plates = instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
    map: plateTexture(), roughness: 0.55, metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), plan.plates, (pl) => {
    p.set(pl.x + Math.cos(pl.rot) * pl.along, pl.y, pl.z - Math.sin(pl.rot) * pl.along);
    wallQuat(pl.rot, pl.tilt);
    s.set(pl.w, pl.h, 1);
  });
  if (plates) {
    const tints = [0x7a7e82, 0x5e685c, 0x806e56, 0x50565e].map((c) => new THREE.Color(c));
    plan.plates.forEach((pl, i) => plates.setColorAt(i, tints[pl.variant]));
  }
  instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({
    map: tapeTexture(), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), plan.tape, (t) => {
    p.set(t.x + Math.cos(t.rot) * t.along, t.y, t.z - Math.sin(t.rot) * t.along);
    wallQuat(t.rot, t.angle);
    s.set(t.len, 0.075, 1);
  });
  const planks = plan.boards.flatMap((b) => Array.from({ length: b.planks }, (_, i) => ({ ...b, dy: (i - (b.planks - 1) / 2) * 0.26, a: b.angle + (i % 2 ? 0.06 : -0.04) })));
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9 }), planks, (b) => {
    p.set(b.x, b.y + b.dy, b.z);
    wallQuat(b.rot, b.a);
    s.set(1.7, 0.2, 0.04);
  });

  // Cables sagging between brackets.
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.7 });
  for (const c of plan.cables) {
    for (const [dz, sag] of [[0, c.sag], [0.06, c.sag * 0.7]]) {
      const a = new THREE.Vector3(c.a.x, c.a.y, c.a.z + dz), b = new THREE.Vector3(c.b.x, c.b.y, c.b.z + dz);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y -= sag * 2; // a quadratic curve dips half its control point's depth
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 16, 0.022, 5), cableMat);
      group.add(tube);
    }
  }

  // Floor grates, barrels and debris.
  instanced(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshStandardMaterial({
    map: grateTexture(), roughness: 0.6, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), plan.grates, (g) => { p.set(g.x, 0.004, g.z); q.setFromEuler(e.set(-Math.PI / 2, 0, g.axis === 'x' ? Math.PI / 2 : 0)); s.set(1, 1, 1); });
  const barrels = plan.clutter.filter((c) => c.kind === 'barrel');
  instanced(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14), new THREE.MeshStandardMaterial({ map: barrelTexture(), roughness: 0.7, metalness: 0.4 }), barrels, (c) => {
    if (c.tipped) { p.set(c.x, 0.3, c.z); q.setFromEuler(e.set(Math.PI / 2, 0, c.spin, 'YXZ')); }
    else { p.set(c.x, 0.44, c.z); q.setFromEuler(e.set(0, c.spin, 0)); }
    s.set(1, 1, 1);
  });
  const rand = seeded(77);
  const bits = plan.clutter.filter((c) => c.kind === 'debris').flatMap((c) => Array.from({ length: 5 }, () => ({
    x: c.x + (rand() - 0.5) * 0.9, z: c.z + (rand() - 0.5) * 0.9, w: 0.1 + rand() * 0.4, h: 0.03 + rand() * 0.12, d: 0.1 + rand() * 0.3, spin: rand() * 6,
  })));
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x3b3a36, roughness: 0.8, metalness: 0.3 }), bits, (b) => {
    p.set(b.x, b.h / 2, b.z); q.setFromEuler(e.set(0, b.spin, 0)); s.set(b.w, b.h, b.d);
  });

  // Ceiling panels hanging loose from one edge.
  const panels = plan.panels.map((pn) => {
    const pivot = new THREE.Group();
    pivot.position.set(pn.x, WALL_H - 0.02, pn.z);
    pivot.rotation.y = pn.rot;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(pn.size, 0.03, pn.size), new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.8, metalness: 0.3 }));
    // The hinge is the panel's edge still attached to the ceiling; the rest hangs down from it.
    const hinge = new THREE.Group();
    hinge.position.x = -pn.size / 2;
    mesh.position.x = pn.size / 2;
    hinge.add(mesh);
    hinge.rotation.z = -pn.tilt;
    pivot.add(hinge);
    group.add(pivot);
    return { hinge, tilt: pn.tilt, phase: rand() * 6 };
  });

  // Junction boxes where sparks come from, with a scorch mark.
  const sparkFaults = plan.faults.filter((f) => f.kind === 'spark');
  instanced(new THREE.BoxGeometry(0.34, 0.44, 0.14), new THREE.MeshStandardMaterial({ color: 0x4a4f4a, roughness: 0.6, metalness: 0.6 }), sparkFaults, (f) => {
    p.set(f.x, f.y, f.z); q.setFromEuler(e.set(0, f.rot, 0)); s.set(1, 1, 1);
  });
  instanced(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshBasicMaterial({
    map: puffTexture(), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), sparkFaults, (f) => {
    p.set(f.x - Math.sin(f.rot) * 0.06, f.y + 0.35, f.z - Math.cos(f.rot) * 0.06); q.setFromEuler(e.set(0, f.rot, 0)); s.set(1, 1, 1);
  });

  // Broken corridor lights: a dark housing and a tube whose brightness each light sets itself.
  instanced(new THREE.BoxGeometry(1, 1, 1), darkMetal, plan.lights, (l) => {
    p.set(l.x, l.y, l.z); q.identity(); s.set(l.axis === 'x' ? 1.5 : 0.26, 0.09, l.axis === 'x' ? 0.26 : 1.5);
  });
  const tubes = instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), plan.lights, (l) => {
    p.set(l.x, l.y - 0.055, l.z); q.identity(); s.set(l.axis === 'x' ? 1.3 : 0.1, 0.04, l.axis === 'x' ? 0.1 : 1.3);
  });
  plan.lights.forEach((l, i) => tubes.setColorAt(i, TUBE_OFF));

  // Light pool: a few real lights that follow the nearest active flickers. Intensity only, never added or removed.
  const pool = Array.from({ length: POOL_LIGHTS }, () => {
    const l = new THREE.PointLight(0xcfe0ff, 0, 9, 2);
    group.add(l);
    return l;
  });

  // Effects: steam puffs, drips, spark bursts.
  const puffTex = puffTexture();
  const puffs = Array.from({ length: 18 }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xc4ccd0, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    group.add(sp);
    return { sp, life: 0, max: 1, vel: new THREE.Vector3() };
  });
  const dropGeo = new THREE.SphereGeometry(0.018, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x9fb4bd });
  const drops = Array.from({ length: 6 }, () => {
    const d = new THREE.Mesh(dropGeo, dropMat);
    d.visible = false;
    group.add(d);
    return { d, vy: 0, live: false };
  });
  const SPARKS = 28;
  const sparkBursts = Array.from({ length: 2 }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.visible = false;
    pts.frustumCulled = false;
    group.add(pts);
    return { pts, vel: Array.from({ length: SPARKS }, () => new THREE.Vector3()), life: 0 };
  });

  // State --------------------------------------------------------------------------
  const faults = plan.faults.map((f) => ({ ...f, timer: between(TIMERS[f.kind]) * (0.3 + Math.random()), active: 0, puffT: 0 }));
  const lights = plan.lights.map((l) => ({ ...l, timer: between(l.dying ? TIMERS.dying : TIMERS.light), stutter: 0, step: 0, level: l.dying ? 0.7 : 0 }));
  const flashes = []; // brief spark lights: { x, y, z, life }

  function trigger(f) {
    if (f.kind === 'steam') { f.active = 1.1 + Math.random() * 0.8; onEvent('steam', f); }
    else if (f.kind === 'drip') {
      const free = drops.find((d) => !d.live);
      if (free) { free.live = true; free.vy = 0; free.d.position.set(f.x, f.y, f.z); free.d.visible = true; free.fault = f; }
    } else if (f.kind === 'spark') {
      const b = sparkBursts.find((sb) => sb.life <= 0) ?? sparkBursts[0];
      const pos = b.pts.geometry.attributes.position;
      const nx = Math.sin(f.rot), nz = Math.cos(f.rot); // out of the wall, into the corridor
      for (let i = 0; i < SPARKS; i++) {
        pos.setXYZ(i, f.x, f.y, f.z);
        b.vel[i].set(nx * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.4, Math.random() * 1.8 - 0.2, nz * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.4);
      }
      pos.needsUpdate = true;
      b.life = 0.8;
      b.pts.visible = true;
      flashes.push({ x: f.x + nx * 0.3, y: f.y, z: f.z + nz * 0.3, life: 0.25 });
      onEvent('spark', f);
    } else if (f.kind === 'clank') onEvent('clank', f);
  }

  function update(dt, time, player) {
    if (!player) return;
    const near = (o) => Math.hypot(o.x - player.x, o.z - player.z) < ACTIVE_RANGE;
    for (const f of faults) {
      if (!near(f)) continue;
      f.timer -= dt;
      if (f.timer <= 0) { trigger(f); f.timer = between(TIMERS[f.kind]); }
      if (f.active > 0) {
        f.active -= dt;
        f.puffT -= dt;
        if (f.puffT <= 0) {
          f.puffT = 0.07;
          const pf = puffs.find((x) => x.life <= 0);
          if (pf) {
            pf.life = pf.max = 1.1 + Math.random() * 0.7;
            pf.sp.position.set(f.x, f.y, f.z);
            const a = Math.random() * Math.PI * 2;
            pf.vel.set(Math.cos(a) * 0.9, -0.25 + Math.random() * 0.3, Math.sin(a) * 0.9);
            pf.sp.visible = true;
          }
        }
      }
    }
    for (const pf of puffs) {
      if (pf.life <= 0) continue;
      pf.life -= dt;
      const t = 1 - pf.life / pf.max;
      pf.vel.multiplyScalar(1 - dt * 1.6);
      pf.vel.y += dt * 0.25; // warm steam drifts up as it slows
      pf.sp.position.addScaledVector(pf.vel, dt);
      pf.sp.scale.setScalar(0.4 + t * 1.4);
      pf.sp.material.opacity = 0.5 * Math.sin(Math.min(1, 0.15 + t * 1.25) * Math.PI);
      if (pf.life <= 0) pf.sp.visible = false;
    }
    for (const d of drops) {
      if (!d.live) continue;
      d.vy -= 9.8 * dt;
      d.d.position.y += d.vy * dt;
      if (d.d.position.y <= 0.02) {
        d.live = false;
        d.d.visible = false;
        onEvent('drip', { x: d.d.position.x, y: 0.05, z: d.d.position.z });
      }
    }
    for (const b of sparkBursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      const pos = b.pts.geometry.attributes.position;
      for (let i = 0; i < SPARKS; i++) {
        b.vel[i].y -= 6 * dt;
        pos.setXYZ(i, pos.getX(i) + b.vel[i].x * dt, Math.max(0.01, pos.getY(i) + b.vel[i].y * dt), pos.getZ(i) + b.vel[i].z * dt);
      }
      pos.needsUpdate = true;
      b.pts.material.opacity = Math.min(1, b.life * 2);
      if (b.life <= 0) b.pts.visible = false;
    }

    // Broken lights: dead ones stutter on now and then; dying ones are mostly on with dropouts.
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (!near(l)) { if (!l.dying) l.level = 0; continue; }
      l.timer -= dt;
      if (l.timer <= 0) {
        l.timer = between(l.dying ? TIMERS.dying : TIMERS.light);
        l.stutter = l.dying ? 0.5 + Math.random() * 1.5 : 0.5 + Math.random() * 1.1;
        onEvent('buzz', l);
      }
      l.step -= dt;
      if (l.step <= 0) {
        l.step = 0.04 + Math.random() * 0.06;
        if (l.stutter > 0) l.level = l.dying ? 0 : (Math.random() < 0.5 ? 0.6 + Math.random() * 0.4 : 0);
        else l.level = l.dying ? (Math.random() < 0.08 ? 0.15 : 0.6 + Math.random() * 0.15) : 0;
      }
      if (l.stutter > 0) l.stutter -= dt;
      tubes.setColorAt(i, TUBE_OFF.clone().lerp(TUBE_ON, l.level));
    }
    if (tubes) tubes.instanceColor.needsUpdate = true;

    // Hand the pool lights to the nearest things that are lit right now.
    for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].life -= dt) <= 0) flashes.splice(i, 1);
    const emitters = [
      // A dead tube stuttering on is a harsh flash; a dying one is a steady weak glow.
      ...lights.filter((l) => l.level > 0.05 && near(l)).map((l) => ({ x: l.x, y: l.y - 0.3, z: l.z, k: l.level * (l.dying ? 3.2 : 6), color: 0xcfe0ff })),
      ...flashes.map((f) => ({ x: f.x, y: f.y, z: f.z, k: 6 * (f.life / 0.25), color: 0xffa040 })),
    ].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
    pool.forEach((light, i) => {
      const em = emitters[i];
      if (!em) { light.intensity = 0; return; }
      light.position.set(em.x, em.y, em.z);
      light.color.setHex(em.color);
      light.intensity = em.k;
    });

    for (const pn of panels) pn.hinge.rotation.z = -pn.tilt + Math.sin(time * 0.7 + pn.phase) * 0.03;
  }

  // For testing and screenshots: set something off right now (nearest of that kind to `at`).
  function force(kind, at) {
    const list = kind === 'light' ? lights : faults.filter((f) => f.kind === kind);
    const it = list.slice().sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0];
    if (!it) return null;
    it.timer = 0;
    return it;
  }

  return { plan, update, force, group };
}
