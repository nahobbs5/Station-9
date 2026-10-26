// three.js renderer for the station's wear and tear, built from the plan in decorplan.js: leaky pipes, patched walls,
// broken corridor lights that stutter on, steam, drips and sparks. Mostly instanced meshes, so it's cheap.
import * as THREE from 'three';
import { WALL_H } from '../layout.js';
import { planDecor } from '../decorplan.js';
import { toTexture as T } from './textures.js';
import {
  seeded, pipeTexture, plateTexture, tapeTexture, woodTexture, grateTexture, barrelTexture, puffTexture,
} from '../textures.js';

import { DecorSim, FX, TUBE_ON, TUBE_OFF } from '../decorsim.js';

const tubeOn = new THREE.Color(TUBE_ON), tubeOff = new THREE.Color(TUBE_OFF);

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
    copper: new THREE.MeshStandardMaterial({ map: T(pipeTexture('#8a5a36', 3)), roughness: 0.45, metalness: 0.75 }),
    green: new THREE.MeshStandardMaterial({ map: T(pipeTexture('#4d5e52', 4)), roughness: 0.6, metalness: 0.5 }),
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
    map: T(plateTexture()), roughness: 0.55, metalness: 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
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
    map: T(tapeTexture()), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }), plan.tape, (t) => {
    p.set(t.x + Math.cos(t.rot) * t.along, t.y, t.z - Math.sin(t.rot) * t.along);
    wallQuat(t.rot, t.angle);
    s.set(t.len, 0.075, 1);
  });
  const planks = plan.boards.flatMap((b) => Array.from({ length: b.planks }, (_, i) => ({ ...b, dy: (i - (b.planks - 1) / 2) * 0.26, a: b.angle + (i % 2 ? 0.06 : -0.04) })));
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: T(woodTexture()), roughness: 0.9 }), planks, (b) => {
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
    map: T(grateTexture()), roughness: 0.6, metalness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  }), plan.grates, (g) => { p.set(g.x, 0.004, g.z); q.setFromEuler(e.set(-Math.PI / 2, 0, g.axis === 'x' ? Math.PI / 2 : 0)); s.set(1, 1, 1); });
  const barrels = plan.clutter.filter((c) => c.kind === 'barrel');
  instanced(new THREE.CylinderGeometry(0.3, 0.3, 0.88, 14), new THREE.MeshStandardMaterial({ map: T(barrelTexture()), roughness: 0.7, metalness: 0.4 }), barrels, (c) => {
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
    return { hinge, tilt: pn.tilt };
  });

  // Junction boxes where sparks come from, with a scorch mark.
  const sparkFaults = plan.faults.filter((f) => f.kind === 'spark');
  instanced(new THREE.BoxGeometry(0.34, 0.44, 0.14), new THREE.MeshStandardMaterial({ color: 0x4a4f4a, roughness: 0.6, metalness: 0.6 }), sparkFaults, (f) => {
    p.set(f.x, f.y, f.z); q.setFromEuler(e.set(0, f.rot, 0)); s.set(1, 1, 1);
  });
  instanced(new THREE.PlaneGeometry(0.7, 0.9), new THREE.MeshBasicMaterial({
    map: T(puffTexture()), color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
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
  plan.lights.forEach((l, i) => tubes.setColorAt(i, tubeOff));

  // Light pool: a few real lights that follow the nearest active flickers. Intensity only, never added or removed.
  const pool = Array.from({ length: FX.POOL }, () => {
    const l = new THREE.PointLight(0xcfe0ff, 0, 9, 2);
    group.add(l);
    return l;
  });

  // Effects: steam puffs, drips, spark bursts. Their behaviour is in js/decorsim.js; these just mirror it.
  const puffTex = T(puffTexture());
  const puffs = Array.from({ length: FX.PUFFS }, () => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xc4ccd0, transparent: true, opacity: 0, depthWrite: false }));
    sp.visible = false;
    group.add(sp);
    return sp;
  });
  const dropGeo = new THREE.SphereGeometry(0.018, 6, 4);
  const dropMat = new THREE.MeshBasicMaterial({ color: 0x9fb4bd });
  const drops = Array.from({ length: FX.DROPS }, () => {
    const d = new THREE.Mesh(dropGeo, dropMat);
    d.visible = false;
    group.add(d);
    return d;
  });
  const bursts = Array.from({ length: FX.BURSTS }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FX.SPARKS * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.05, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    pts.visible = false;
    pts.frustumCulled = false;
    group.add(pts);
    return pts;
  });

  const sim = new DecorSim(plan, onEvent);
  const tmp = new THREE.Color();

  function update(dt, time, player) {
    sim.update(dt, time, player);
    sim.puffs.forEach((pf, i) => {
      const sp = puffs[i];
      sp.visible = pf.opacity > 0;
      if (!sp.visible) return;
      sp.position.set(pf.x, pf.y, pf.z);
      sp.scale.setScalar(pf.scale);
      sp.material.opacity = pf.opacity;
    });
    sim.drops.forEach((d, i) => { drops[i].visible = d.live; if (d.live) drops[i].position.set(d.x, d.y, d.z); });
    sim.bursts.forEach((b, i) => {
      const pts = bursts[i];
      pts.visible = b.life > 0;
      if (!pts.visible) return;
      pts.geometry.attributes.position.array.set(b.pos);
      pts.geometry.attributes.position.needsUpdate = true;
      pts.material.opacity = b.opacity;
    });
    if (tubes) {
      sim.lights.forEach((l, i) => tubes.setColorAt(i, tmp.copy(tubeOff).lerp(tubeOn, l.level)));
      tubes.instanceColor.needsUpdate = true;
    }
    pool.forEach((light, i) => {
      const em = sim.pool[i];
      if (!em) { light.intensity = 0; return; }
      light.position.set(em.x, em.y, em.z);
      light.color.setHex(em.color);
      light.intensity = em.k;
    });
    panels.forEach((pn, i) => { pn.hinge.rotation.z = -pn.tilt + sim.panelSway(i); });
  }

  return { plan, update, force: (kind, at) => sim.force(kind, at), group, sim };
}
