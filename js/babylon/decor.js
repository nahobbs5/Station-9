// Babylon.js renderer for the station's wear and tear: pipes, patched walls, cables, clutter,
// broken corridor lights, steam, drips and sparks. Placement comes from js/decorplan.js and the
// moving parts mirror js/decorsim.js.
import { WALL_H } from '../layout.js';
import { planDecor, DECOR, STENCILS } from '../decorplan.js';
import { DecorSim, FX, TUBE_ON, TUBE_OFF, mixHex } from '../decorsim.js';
import {
  seeded, pipeTexture, plateTexture, tapeTexture, woodTexture, grateTexture, barrelTexture, puffTexture, ventTexture,
  stencilTexture, floorStripeTexture, streakTexture, stainTexture,
} from '../textures.js';
import { pbr, basic, toTexture, compose, instances, segment, linear, TUNING, bevelBox } from './util.js';

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
    copper: pbr(scene, { map: T(pipeTexture('#8a5a36', 3)), roughness: 0.45, metalness: 0.75, surface: 'pipe', tile: [1, 2] }),
    green: pbr(scene, { map: T(pipeTexture('#4d5e52', 4)), roughness: 0.6, metalness: 0.5, surface: 'pipe', tile: [1, 2] }),
  };
  const darkMetal = pbr(scene, { color: 0x2a2d30, roughness: 0.5, metalness: 0.8, surface: 'panel' });
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

  // Structural ribs across the corridors: a pillar on each wall (half buried in it) and a beam
  // under the ceiling. Bevelled so their edges catch the flashlight.
  const R = DECOR.rib;
  const ribMat = pbr(scene, { color: 0x45494c, roughness: 0.6, metalness: 0.6, surface: 'panel', bump: 0.7 });
  const pillar = bevelBox('rib-pillar', { width: R.width, height: WALL_H, depth: R.inset * 2, bevel: 0.03 }, scene);
  pillar.material = ribMat;
  thin(pillar, plan.ribs.flatMap((r) => [r.a, r.b].map((p) => ({ ...p, yaw: r.yaw }))), (p) => compose([p.x, WALL_H / 2, p.z], [0, p.yaw, 0], [1, 1, 1]));
  // The beam is 1 m long along Z and stretched to fit; its stretched ends are inside the walls.
  const beam = bevelBox('rib-beam', { width: R.width, height: R.beam, depth: 1, bevel: 0.025 }, scene);
  beam.material = ribMat;
  thin(beam, plan.ribs, (r) => compose([(r.a.x + r.b.x) / 2, WALL_H - R.beam / 2, (r.a.z + r.b.z) / 2], [0, r.yaw, 0], [1, 1, Math.hypot(r.a.x - r.b.x, r.a.z - r.b.z) + 0.1]));
  // A bolted foot plate where each pillar meets the floor.
  const foot = bevelBox('rib-foot', { width: R.width + 0.1, height: 0.12, depth: R.inset * 2 + 0.08, bevel: 0.02 }, scene);
  foot.material = darkMetal;
  thin(foot, plan.ribs.flatMap((r) => [r.a, r.b].map((p) => ({ ...p, yaw: r.yaw }))), (p) => compose([p.x, 0.06, p.z], [0, p.yaw, 0], [1, 1, 1]));

  // Decals: flat planes laid on walls and floor, sharing one mesh per texture. They take the
  // light but cast no shadow (metadata.decal; see view.js).
  const decal = (mesh, items, place) => { const m = thin(mesh, items, place); if (m) m.metadata = { decal: true }; return m; };
  const groundPlane = (name) => MeshBuilder.CreateGround(name, { width: 1, height: 1 }, scene);
  // Stencils: one texture per wording. Wall planes face away from their texture, so mirror it back.
  const stencilGroups = new Map();
  for (const st of plan.stencils) {
    const k = st.kind === 'deck' ? 'deck:' + st.text : st.kind;
    if (!stencilGroups.has(k)) stencilGroups.set(k, []);
    stencilGroups.get(k).push(st);
  }
  for (const [k, list] of stencilGroups) {
    const def = STENCILS[list[0].kind];
    const lines = def.lines ?? ['DECK', list[0].text];
    const mesh = MeshBuilder.CreatePlane('stencil', { size: 1 }, scene);
    mesh.material = pbr(scene, { map: toTexture(scene, stencilTexture(lines, { color: def.color, seed: k.length }), { anisotropy: 4, mirror: true }), transparent: true, roughness: 0.75, zOffset: -3 });
    decal(mesh, list, (st) => compose([st.x, st.y, st.z], wallQ(st.rot, 0), [def.w, def.h, 1]));
  }
  // Streaks down the walls.
  for (const kind of ['grime', 'rust']) {
    const mesh = MeshBuilder.CreatePlane('streak', { size: 1 }, scene);
    mesh.material = pbr(scene, { map: T(streakTexture(kind)), transparent: true, roughness: 0.9, zOffset: -1 });
    decal(mesh, plan.streaks.filter((st) => st.kind === kind), (st) => compose([st.x, st.y, st.z], wallQ(st.rot, 0), [st.w, st.h, 1]));
  }
  // Floor: hazard stripes at the doors, oil and water stains.
  const stripeMesh = groundPlane('door-stripe');
  stripeMesh.material = pbr(scene, { map: toTexture(scene, floorStripeTexture(), { anisotropy: 8 }), transparent: true, roughness: 0.7, zOffset: -2 });
  decal(stripeMesh, plan.stripes, (st) => compose([st.x, 0.006, st.z], [0, st.yaw, 0], [st.len, 1, st.depth]));
  for (const kind of ['oil', 'water']) {
    const mesh = groundPlane('stain');
    // Oil stays wet and glossy; dried water is dull.
    mesh.material = pbr(scene, { map: T(stainTexture(kind)), transparent: true, roughness: kind === 'oil' ? 0.18 : 0.8, metalness: 0, zOffset: -1 });
    decal(mesh, plan.stains.filter((st) => st.kind === kind), (st) => compose([st.x, 0.004, st.z], [0, st.rot, 0], [st.r * 2, 1, st.r * 2]));
  }

  // Wall vents: a bevelled frame with a louvred grille set into it.
  const ventFrame = bevelBox('vent-frame', { width: 1, height: 1, depth: 0.05, bevel: 0.012 }, scene);
  ventFrame.material = darkMetal;
  thin(ventFrame, plan.vents, (v) => compose([v.x, v.y, v.z], [0, v.rot, 0], [v.w + 0.08, v.h + 0.08, 1]));
  const ventMesh = MeshBuilder.CreatePlane('vent', { size: 1 }, scene);
  ventMesh.material = pbr(scene, { map: T(ventTexture()), roughness: 0.7, metalness: 0.6 });
  thin(ventMesh, plan.vents, (v) => compose([v.x + Math.sin(v.rot) * 0.027, v.y, v.z + Math.cos(v.rot) * 0.027], wallQ(v.rot, 0), [v.w, v.h, 1]));

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
  grateMesh.material = pbr(scene, { map: T(grateTexture()), roughness: 0.6, metalness: 0.7, zOffset: -1, surface: 'grate', tile: [1.5, 1.5] });
  thin(grateMesh, plan.grates, (g) => compose([g.x, 0.004, g.z], [0, g.yaw + Math.PI / 2, 0], [1, 1, 1]));
  const barrelMesh = MeshBuilder.CreateCylinder('barrel', { diameter: 0.6, height: 0.88, tessellation: 14 }, scene);
  barrelMesh.material = pbr(scene, { map: T(barrelTexture()), roughness: 0.7, metalness: 0.4 });
  barrelMesh.metadata = { standIn: 'barrel' }; // until the barrel models load (js/babylon/models.js)
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
  boxMesh.metadata = { standIn: 'junction' };
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
  const coneFade = (() => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.25)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 8, 128);
    return toTexture(scene, c);
  })();
  const tubes = plan.lights.map((l) => {
    const tube = MeshBuilder.CreateBox('tube', { width: 1.3, height: 0.04, depth: 0.1 }, scene);
    tube.position.set(l.x, l.y - 0.055, l.z);
    tube.rotation.y = l.yaw;
    // A faint haze of light under it, only while it's on.
    const cone = MeshBuilder.CreateCylinder('tube-cone', { diameterTop: 0.5, diameterBottom: 3, height: WALL_H - 0.15, tessellation: 20, cap: BABYLON.Mesh.NO_CAP }, scene);
    cone.position.set(l.x, (WALL_H - 0.15) / 2, l.z);
    cone.material = basic(scene, 0xcfe0ff, { opacity: coneFade, additive: true, alpha: 0 });
    cone.material.backFaceCulling = false;
    cone.material.disableDepthWrite = true;
    tube.cone = cone;
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
    sim.lights.forEach((l, i) => {
      tubes[i].material.emissiveColor = new Color3(...mixHex(TUBE_OFF, TUBE_ON, l.level));
      tubes[i].cone.material.alpha = 0.06 * l.level;
      tubes[i].cone.isVisible = l.level > 0.02;
    });
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
