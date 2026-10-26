// Babylon.js renderer for the station's wear and tear: pipes, patched walls, cables, clutter,
// broken corridor lights, steam, drips and sparks. Placement comes from js/decorplan.js and the
// moving parts mirror js/decorsim.js.
import { WALL_H } from '../layout.js';
import { planDecor } from '../decorplan.js';
import { DecorSim, FX, TUBE_ON, TUBE_OFF, mixHex } from '../decorsim.js';
import {
  seeded, pipeTexture, plateTexture, tapeTexture, woodTexture, grateTexture, barrelTexture, puffTexture,
} from '../textures.js';
import { pbr, basic, toTexture, compose, instances, segment, linear, TUNING } from './util.js';

export function buildDecor(scene, layout, { onEvent = () => {} } = {}) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, PointLight, Vector3, Color3 } = BABYLON;
  const plan = planDecor(layout);
  const T = (c) => toTexture(scene, c);
  const thin = (mesh, items, place) => { if (!items.length) { mesh.dispose(); return null; } return instances(mesh, items.map(place)); };
  // Wall spots face into the room for a +Z-facing plane; Babylon planes face -Z, so they get an extra half turn.
  const wallQ = (rot, tilt) => [0, rot + Math.PI, tilt];

  // Pipes, in two mismatched finishes.
  const pipeMats = {
    copper: pbr(scene, { map: T(pipeTexture('#8a5a36', 3)), roughness: 0.45, metalness: 0.75 }),
    green: pbr(scene, { map: T(pipeTexture('#4d5e52', 4)), roughness: 0.6, metalness: 0.5 }),
  };
  const darkMetal = pbr(scene, { color: 0x2a2d30, roughness: 0.5, metalness: 0.8 });
  for (const kind of Object.keys(pipeMats)) {
    const cyl = MeshBuilder.CreateCylinder('pipe-' + kind, { diameter: 2, height: 1, tessellation: 10 }, scene);
    cyl.material = pipeMats[kind];
    thin(cyl, plan.pipes.filter((pp) => pp.kind === kind), (pp) => {
      const { q, len, mid } = segment(pp.a, pp.b);
      return compose(mid, q, [pp.r, Math.max(0.01, len), pp.r]);
    });
  }
  // Joints where pipes bend, flanges where they end (turned along the pipe), and ceiling brackets.
  const jointMesh = MeshBuilder.CreateSphere('joint', { diameter: 2, segments: 4 }, scene);
  jointMesh.material = darkMetal;
  thin(jointMesh, plan.joints, (j) => compose([j.x, j.y, j.z], [0, 0, 0], [j.r * 1.25, j.r * 1.25, j.r * 1.25]));
  const flangeMesh = MeshBuilder.CreateCylinder('flange', { diameter: 2, height: 1, tessellation: 14 }, scene);
  flangeMesh.material = darkMetal;
  thin(flangeMesh, plan.flanges, (f) => compose([f.x, f.y, f.z], segment(f, { x: f.x + f.dir.x, y: f.y + f.dir.y, z: f.z + f.dir.z }).q, [f.r * 1.75, 0.07, f.r * 1.75]));
  const bracketMesh = MeshBuilder.CreateBox('bracket', { size: 1 }, scene);
  bracketMesh.material = darkMetal;
  thin(bracketMesh, plan.brackets, (b) => compose([b.x, b.y + b.len / 2, b.z], [0, 0, 0], [0.04, b.len, 0.07]));

  // Wall patchwork: plates (four tints, one mesh each), hazard tape, boarded sections.
  const plateTex = T(plateTexture());
  [0x7a7e82, 0x5e685c, 0x806e56, 0x50565e].forEach((tint, v) => {
    const mesh = MeshBuilder.CreatePlane('plate', { size: 1 }, scene);
    mesh.material = pbr(scene, { map: plateTex, color: tint, roughness: 0.55, metalness: 0.55, zOffset: -1 });
    thin(mesh, plan.plates.filter((pl) => pl.variant === v), (pl) =>
      compose([pl.x + Math.cos(pl.rot) * pl.along, pl.y, pl.z - Math.sin(pl.rot) * pl.along], wallQ(pl.rot, pl.tilt), [pl.w, pl.h, 1]));
  });
  const tapeMesh = MeshBuilder.CreatePlane('tape', { size: 1 }, scene);
  tapeMesh.material = pbr(scene, { map: T(tapeTexture()), transparent: true, roughness: 0.8, zOffset: -2 });
  thin(tapeMesh, plan.tape, (t) => compose([t.x + Math.cos(t.rot) * t.along, t.y, t.z - Math.sin(t.rot) * t.along], wallQ(t.rot, t.angle), [t.len, 0.075, 1]));
  const planks = plan.boards.flatMap((b) => Array.from({ length: b.planks }, (_, i) => ({ ...b, dy: (i - (b.planks - 1) / 2) * 0.26, a: b.angle + (i % 2 ? 0.06 : -0.04) })));
  const plankMesh = MeshBuilder.CreateBox('plank', { size: 1 }, scene);
  plankMesh.material = pbr(scene, { map: T(woodTexture()), roughness: 0.9 });
  thin(plankMesh, planks, (b) => compose([b.x, b.y + b.dy, b.z], [0, b.rot, b.a], [1.7, 0.2, 0.04]));

  // Cables sagging between brackets.
  const cableMat = pbr(scene, { color: 0x141414, roughness: 0.7 });
  for (const c of plan.cables) {
    for (const [dz, sag] of [[0, c.sag], [0.06, c.sag * 0.7]]) {
      const a = new Vector3(c.a.x, c.a.y, c.a.z + dz), b = new Vector3(c.b.x, c.b.y, c.b.z + dz);
      const mid = a.add(b).scale(0.5);
      mid.y -= sag * 2; // a quadratic curve dips half its control point's depth
      const path = BABYLON.Curve3.CreateQuadraticBezier(a, mid, b, 16).getPoints();
      MeshBuilder.CreateTube('cable', { path, radius: 0.022, tessellation: 5 }, scene).material = cableMat;
    }
  }

  // Floor grates, barrels and debris.
  const grateMesh = MeshBuilder.CreateGround('grate', { width: 1.5, height: 1.5 }, scene);
  grateMesh.material = pbr(scene, { map: T(grateTexture()), roughness: 0.6, metalness: 0.7, zOffset: -1 });
  thin(grateMesh, plan.grates, (g) => compose([g.x, 0.004, g.z], [0, g.yaw + Math.PI / 2, 0], [1, 1, 1]));
  const barrelMesh = MeshBuilder.CreateCylinder('barrel', { diameter: 0.6, height: 0.88, tessellation: 14 }, scene);
  barrelMesh.material = pbr(scene, { map: T(barrelTexture()), roughness: 0.7, metalness: 0.4 });
  thin(barrelMesh, plan.clutter.filter((c) => c.kind === 'barrel'), (c) =>
    c.tipped ? compose([c.x, 0.3, c.z], [Math.PI / 2, c.spin, 0], [1, 1, 1]) : compose([c.x, 0.44, c.z], [0, c.spin, 0], [1, 1, 1]));
  const rand = seeded(77);
  const bits = plan.clutter.filter((c) => c.kind === 'debris').flatMap((c) => Array.from({ length: 5 }, () => ({
    x: c.x + (rand() - 0.5) * 0.9, z: c.z + (rand() - 0.5) * 0.9, w: 0.1 + rand() * 0.4, h: 0.03 + rand() * 0.12, d: 0.1 + rand() * 0.3, spin: rand() * 6,
  })));
  const bitMesh = MeshBuilder.CreateBox('debris', { size: 1 }, scene);
  bitMesh.material = pbr(scene, { color: 0x3b3a36, roughness: 0.8, metalness: 0.3 });
  thin(bitMesh, bits, (b) => compose([b.x, b.h / 2, b.z], [0, b.spin, 0], [b.w, b.h, b.d]));

  // Ceiling panels hanging loose from one edge.
  const panelMat = pbr(scene, { color: 0x3a3d40, roughness: 0.8, metalness: 0.3 });
  const panels = plan.panels.map((pn) => {
    const pivot = new TransformNode('panel', scene);
    pivot.position.set(pn.x, WALL_H - 0.02, pn.z);
    pivot.rotation.y = pn.rot;
    // The hinge is the panel's edge still attached to the ceiling; the rest hangs down from it.
    const hinge = new TransformNode('hinge', scene);
    hinge.parent = pivot;
    hinge.position.x = -pn.size / 2;
    const mesh = MeshBuilder.CreateBox('panel', { width: pn.size, height: 0.03, depth: pn.size }, scene);
    mesh.parent = hinge;
    mesh.position.x = pn.size / 2;
    mesh.material = panelMat;
    hinge.rotation.z = -pn.tilt;
    return { hinge, tilt: pn.tilt };
  });

  // Junction boxes where sparks come from, with a scorch mark.
  const sparkFaults = plan.faults.filter((f) => f.kind === 'spark');
  const boxMesh = MeshBuilder.CreateBox('junction', { width: 0.34, height: 0.44, depth: 0.14 }, scene);
  boxMesh.material = pbr(scene, { color: 0x4a4f4a, roughness: 0.6, metalness: 0.6 });
  thin(boxMesh, sparkFaults, (f) => compose([f.x, f.y, f.z], [0, f.rot, 0], [1, 1, 1]));
  const puffTex = T(puffTexture());
  const scorch = MeshBuilder.CreatePlane('scorch', { width: 0.7, height: 0.9 }, scene);
  scorch.material = basic(scene, 0x000000, { opacity: puffTex, alpha: 0.75, zOffset: -1 });
  thin(scorch, sparkFaults, (f) => compose([f.x - Math.sin(f.rot) * 0.06, f.y + 0.35, f.z - Math.cos(f.rot) * 0.06], [0, f.rot + Math.PI, 0], [1, 1, 1]));

  // Broken corridor lights: a dark housing and a tube whose brightness each light sets itself.
  const housing = MeshBuilder.CreateBox('housing', { size: 1 }, scene);
  housing.material = darkMetal;
  // Each fixture runs along the corridor (yaw turns its length to follow it).
  thin(housing, plan.lights, (l) => compose([l.x, l.y, l.z], [0, l.yaw, 0], [1.5, 0.09, 0.26]));
  const tubes = plan.lights.map((l) => {
    const tube = MeshBuilder.CreateBox('tube', { width: 1.3, height: 0.04, depth: 0.1 }, scene);
    tube.position.set(l.x, l.y - 0.055, l.z);
    tube.rotation.y = l.yaw;
    tube.material = basic(scene, TUBE_OFF);
    return tube;
  });

  // Light pool: a few real lights that follow the nearest active flickers. Intensity only, never added or removed.
  const pool = Array.from({ length: FX.POOL }, () => {
    const l = new PointLight('pool', new Vector3(0, -10, 0), scene);
    l.intensity = 0;
    l.range = 9;
    return l;
  });

  // Effects: steam puffs (camera-facing quads), drips, spark bursts (thin-instanced specks).
  const puffs = Array.from({ length: FX.PUFFS }, () => {
    const sp = MeshBuilder.CreatePlane('puff', { size: 1 }, scene);
    sp.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
    sp.material = basic(scene, 0xc4ccd0, { opacity: puffTex, alpha: 0 });
    sp.material.disableDepthWrite = true;
    sp.isVisible = false;
    return sp;
  });
  const dropMat = basic(scene, 0x9fb4bd);
  const drops = Array.from({ length: FX.DROPS }, () => {
    const d = MeshBuilder.CreateSphere('drop', { diameter: 0.036, segments: 3 }, scene);
    d.material = dropMat;
    d.isVisible = false;
    return d;
  });
  const bursts = Array.from({ length: FX.BURSTS }, () => {
    const speck = MeshBuilder.CreateBox('spark', { size: 0.035 }, scene);
    speck.material = basic(scene, 0xffb347, { additive: true, alpha: 1 });
    speck.material.disableDepthWrite = true;
    speck.thinInstanceSetBuffer('matrix', new Float32Array(FX.SPARKS * 16), 16, false);
    speck.alwaysSelectAsActiveMesh = true;
    speck.isVisible = false;
    return speck;
  });

  const sim = new DecorSim(plan, onEvent);
  const sparkMatrix = BABYLON.Matrix.Identity();

  function update(dt, time, player) {
    sim.update(dt, time, player);
    sim.puffs.forEach((pf, i) => {
      const sp = puffs[i];
      sp.isVisible = pf.opacity > 0;
      if (!sp.isVisible) return;
      sp.position.set(pf.x, pf.y, pf.z);
      sp.scaling.setAll(pf.scale);
      sp.material.alpha = pf.opacity;
    });
    sim.drops.forEach((d, i) => { drops[i].isVisible = d.live; if (d.live) drops[i].position.set(d.x, d.y, d.z); });
    sim.bursts.forEach((b, i) => {
      const speck = bursts[i];
      speck.isVisible = b.life > 0;
      if (!speck.isVisible) return;
      for (let k = 0; k < FX.SPARKS; k++) {
        BABYLON.Matrix.TranslationToRef(b.pos[k * 3], b.pos[k * 3 + 1], b.pos[k * 3 + 2], sparkMatrix);
        speck.thinInstanceSetMatrixAt(k, sparkMatrix, k === FX.SPARKS - 1);
      }
      speck.material.alpha = b.opacity;
    });
    sim.lights.forEach((l, i) => { tubes[i].material.emissiveColor = new Color3(...mixHex(TUBE_OFF, TUBE_ON, l.level)); });
    pool.forEach((light, i) => {
      const em = sim.pool[i];
      if (!em) { light.intensity = 0; return; }
      light.position.set(em.x, em.y, em.z);
      light.diffuse = linear(em.color);
      light.specular = light.diffuse;
      light.intensity = em.k * TUNING.light;
    });
    panels.forEach((pn, i) => { pn.hinge.rotation.z = -pn.tilt + sim.panelSway(i); });
  }

  return { plan, update, force: (kind, at) => sim.force(kind, at), sim };
}
