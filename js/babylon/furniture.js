// Babylon.js furniture, after the "Research Station Interiors" reference sheet: worn white metal,
// burnt-orange leather, safety yellow and the Station 9 emblem. Every piece is built from simple
// shapes facing +Z, standing on the floor at its origin; js/worldplan.js says where each one goes.
import { furniturePlacement, extraSeats, windowPlacements, signPlacements } from '../worldplan.js';
import {
  housingTexture, leatherTexture, lockerTexture, drawerTexture, crateTexture, medkitTexture,
  signTexture, windowTexture, blanketTexture, leafTexture, mugTexture, teleControlScreen,
} from '../textures.js';
import { greensTexture, tomatoLeafTexture, growChamberScreen, leafScanScreen, pegboardTexture } from '../gardentextures.js';
import { pbr, basic, toTexture, bevelBox, linear, srgb } from './util.js';

export function furnitureKit(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode } = BABYLON;
  const T = (c, o = {}) => toTexture(scene, c, { anisotropy: 4, ...o });
  const M = {
    cream: pbr(scene, { map: T(housingTexture()), roughness: 0.6, metalness: 0.3, surface: 'painted', bump: 0.4 }),
    leather: pbr(scene, { map: T(leatherTexture()), roughness: 0.5, metalness: 0.05, surface: 'leather', tile: [2, 2] }),
    fabric: pbr(scene, { color: 0x2a2d2f, roughness: 0.95 }),
    metal: pbr(scene, { color: 0x8a8d90, roughness: 0.4, metalness: 0.8, surface: 'painted', bump: 0.4 }), // smooth, no tread plate
    dark: pbr(scene, { color: 0x1c1e20, roughness: 0.6, metalness: 0.4 }),
    yellow: pbr(scene, { color: 0xd9a52a, roughness: 0.6 }),
    crateGrey: pbr(scene, { color: 0x8f8c82, roughness: 0.7, metalness: 0.3 }),
    paper: pbr(scene, { color: 0xe8e2cf, roughness: 0.9 }),
    blanket: pbr(scene, { map: T(blanketTexture()), roughness: 0.95 }),
    crate: pbr(scene, { map: T(crateTexture()), roughness: 0.6, metalness: 0.3, surface: 'painted', bump: 0.4 }),
    medkit: pbr(scene, { map: T(medkitTexture()), roughness: 0.5 }),
    soil: pbr(scene, { color: 0x2a2018, roughness: 1 }),
    mug: pbr(scene, { map: T(mugTexture(), { mirror: true }), roughness: 0.5 }),
    curtain: pbr(scene, { color: 0x1d2022, roughness: 1, twoSided: true }),
  };
  // Front panels are planes facing +Z; Babylon planes face -Z, so they turn round and mirror back.
  const front = (tex) => pbr(scene, { map: T(tex, { mirror: true }), roughness: 0.6, metalness: 0.3 });
  M.locker = front(lockerTexture());
  M.drawers3 = front(drawerTexture(3));
  M.drawers2 = front(drawerTexture(2));
  const teleScreenMat = basic(scene, 0, { map: T(teleControlScreen(), { mirror: true }) });
  const leafMat = pbr(scene, { map: T(leafTexture()), roughness: 0.8, transparent: true, twoSided: true });

  // Plant life (Botanical Haven sheet). Leaf textures are made once and shared; materials that
  // glow under a grow lamp are made per piece, so each dims with its own room's lights.
  const LEAF = { lettuce: T(greensTexture('lettuce')), red: T(greensTexture('red')), dry: T(greensTexture('dry')), tomato: T(tomatoLeafTexture()) };
  const leafy = (tex, glow = null) => {
    const m = pbr(scene, { map: tex, roughness: 0.75, cutout: true, twoSided: true });
    if (glow) { m.emissiveTexture = tex; m.emissiveColor = linear(glow); }
    return m;
  };
  M.terracotta = pbr(scene, { color: 0xa5583a, roughness: 0.85 });
  M.stake = pbr(scene, { color: 0x9a8455, roughness: 0.8 });
  const pegMat = front(pegboardTexture());
  const scanMat = basic(scene, 0, { map: T(leafScanScreen(), { mirror: true }) });
  const chamberScreenMat = basic(scene, 0, { map: T(growChamberScreen(), { mirror: true }) });
  // Grow lamps and what they light. Each: { mat, color (Color3), room, flicker? }; js/babylon/world.js
  // scales them by the room's light level every frame (dark in a blackout, dim on emergency power).
  const glows = [];
  const glow = (mat, color, room, extra = {}) => { glows.push({ mat, color: color.clone(), room, timer: 3 + Math.random() * 6, stutter: 0, ...extra }); return mat; };

  const node = (parent) => { const n = new TransformNode('furniture', scene); if (parent) n.parent = parent; return n; };
  // Anything chunky enough gets softened edges; thin rails and slats stay plain boxes.
  const box = (p, w, h, d, x, y, z, mat) => {
    const t = Math.min(w, h, d);
    const m = t >= 0.06 ? bevelBox('f', { width: w, height: h, depth: d, bevel: Math.min(0.02, t * 0.12) }, scene) : MeshBuilder.CreateBox('f', { width: w, height: h, depth: d }, scene);
    m.parent = p; m.position.set(x, y, z); m.material = mat; return m;
  };
  const cyl = (p, dia, h, x, y, z, mat, tess = 12, dTop = dia) => { const m = MeshBuilder.CreateCylinder('f', { diameterTop: dTop, diameterBottom: dia, height: h, tessellation: tess }, scene); m.parent = p; m.position.set(x, y, z); m.material = mat; return m; };
  const plane = (p, w, h, x, y, z, mat) => { const m = MeshBuilder.CreatePlane('f', { width: w, height: h }, scene); m.parent = p; m.position.set(x, y, z); m.rotation.y = Math.PI; m.material = mat; return m; };
  const posts = (p, w, d, h, r = 0.045) => { for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(p, r, h, r, sx * (w / 2 - r / 2), h / 2, sz * (d / 2 - r / 2), M.metal); };
  const mugOn = (p, x, y, z) => cyl(p, 0.085, 0.1, x, y + 0.05, z, M.mug, 12);
  // Many copies of one small mesh in a single draw: each { x, y, z, ry?, rx?, rz?, s?, sy? }.
  const many = (p, mesh, mat, list) => {
    const { Matrix, Vector3, Quaternion } = BABYLON;
    mesh.parent = p; mesh.material = mat;
    const buf = new Float32Array(list.length * 16);
    list.forEach((c, i) => Matrix.Compose(new Vector3(c.s ?? 1, c.sy ?? c.s ?? 1, c.s ?? 1), Quaternion.RotationYawPitchRoll(c.ry ?? 0, c.rx ?? 0, c.rz ?? 0), new Vector3(c.x, c.y, c.z)).copyToArray(buf, i * 16));
    mesh.thinInstanceSetBuffer('matrix', buf, 16, true);
    mesh.thinInstanceRefreshBoundingInfo(false);
    return mesh;
  };
  // Leaf cards standing on their bottom edge.
  const cards = (p, mat, w, h, list) => {
    if (!list.length) return null;
    const m = MeshBuilder.CreatePlane('leaves', { width: w, height: h }, scene);
    m.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, h / 2, 0));
    return many(p, m, mat, list);
  };
  const balls = (p, mat, d, list) => list.length ? many(p, MeshBuilder.CreateSphere('fruit', { diameter: d, segments: 6 }, scene), mat, list) : null;
  // A head of greens: two crossed cards and a third at an angle.
  const head = (x, y, z, s, turn = 0) => [0, Math.PI / 2, Math.PI / 4].map((a) => ({ x, y, z, ry: a + turn, s }));

  const build = {
    bunk(g) {
      posts(g, 2.0, 0.95, 1.9);
      for (const y of [0.35, 1.25]) {
        box(g, 2.0, 0.08, 0.95, 0, y, 0, M.metal);
        box(g, 1.9, 0.15, 0.85, 0, y + 0.115, 0, M.paper);                      // mattress
        box(g, 1.25, 0.06, 0.87, 0.3, y + 0.21, 0, M.blanket);                  // blanket toward the foot
        box(g, 0.4, 0.1, 0.55, -0.7, y + 0.24, 0, M.paper);                     // pillow
      }
      for (const x of [-0.48, 0.48]) {
        box(g, 0.9, 0.24, 0.85, x, 0.13, 0, M.cream);
        plane(g, 0.88, 0.22, x, 0.13, 0.43, M.drawers2);
      }
      for (const x of [0.86, 0.68]) box(g, 0.03, 1.1, 0.03, x, 1.2, 0.47, M.metal); // ladder rails
      for (let k = 0; k < 4; k++) box(g, 0.18, 0.03, 0.03, 0.77, 0.75 + k * 0.25, 0.47, M.metal);
      plane(g, 0.9, 0.7, -0.45, 1.6, 0.49, M.curtain); // a curtain half drawn across the top bunk
    },
    lockers(g) {
      for (const x of [-0.4, 0, 0.4]) {
        box(g, 0.39, 1.9, 0.5, x, 0.95, 0, M.cream);
        plane(g, 0.37, 1.86, x, 0.95, 0.252, M.locker);
      }
    },
    bench(g) {
      for (const x of [-0.82, 0.82]) { box(g, 0.05, 0.45, 0.5, x, 0.225, 0, M.metal); box(g, 0.06, 0.06, 0.55, x, 0.62, 0, M.metal); }
      box(g, 1.7, 0.05, 0.12, 0, 0.4, -0.15, M.metal);
      for (const x of [-0.56, 0, 0.56]) {
        box(g, 0.54, 0.12, 0.5, x, 0.47, 0.02, M.leather);
        const back = box(g, 0.54, 0.42, 0.1, x, 0.75, -0.24, M.leather);
        back.rotation.x = -0.12;
      }
    },
    shelves(g, f) {
      posts(g, 1.4, 0.45, 1.9);
      for (const y of [0.1, 0.6, 1.1, 1.6]) box(g, 1.4, 0.03, 0.45, 0, y, 0, M.metal);
      // Crates and boxes on the shelves; one shelf unit keeps the red med kit.
      const items = [[-0.35, 0.6, 0.5, 0.36, 0.35, M.crate], [0.32, 0.6, 0.45, 0.3, 0.35, M.yellow], [-0.3, 1.1, 0.55, 0.32, 0.36, M.crateGrey],
        [0.35, 0.1, 0.5, 0.36, 0.38, M.crateGrey], [-0.35, 0.1, 0.4, 0.3, 0.3, M.dark], [0.3, 1.6, 0.4, 0.26, 0.3, M.crate]];
      if (f.medkit) items.push([0.33, 1.1, 0.42, 0.28, 0.3, M.medkit]);
      for (const [x, y, w, h, d, mat] of items) box(g, w, h, d, x, y + h / 2 + 0.015, 0, mat);
    },
    bigCrate(g) {
      box(g, 1.1, 0.9, 1.0, 0, 0.45, 0, M.crate);
      box(g, 1.14, 0.06, 1.04, 0, 0.88, 0, M.dark);
    },
    cargoCrate(g) { // a small crate: grey body, dark lid and a yellow strap
      box(g, 0.62, 0.46, 0.5, 0, 0.23, 0, M.crate).scaling.y = -1; // box textures come out upside down
      box(g, 0.66, 0.05, 0.54, 0, 0.47, 0, M.dark);
      box(g, 0.08, 0.475, 0.52, 0.18, 0.24, 0, M.yellow);
    },
    cart(g) {
      posts(g, 1.0, 0.5, 0.95, 0.035);
      for (const y of [0.15, 0.55, 0.92]) box(g, 1.0, 0.03, 0.5, 0, y, 0, M.metal);
      box(g, 0.38, 0.62, 0.44, -0.3, 0.5, 0, M.yellow); // the bag
      for (const [x, z] of [[-0.45, -0.2], [0.45, -0.2], [-0.45, 0.2], [0.45, 0.2]]) cyl(g, 0.09, 0.04, x, 0.05, z, M.dark, 10).rotation.z = Math.PI / 2;
      for (const x of [0.15, 0.28, 0.4]) cyl(g, 0.08, 0.22, x, 0.68, 0.05, M.paper, 10);   // bottles
      for (const x of [0.15, 0.36]) cyl(g, 0.13, 0.2, x, 0.27, 0, M.paper, 12);              // paper rolls
      cyl(g, 0.025, 0.7, -0.45, 1.25, 0.1, M.yellow, 6);                                      // a mop handle
    },
    workbench(g) {
      box(g, 1.8, 0.06, 0.75, 0, 0.9, 0, M.cream);
      posts(g, 1.75, 0.7, 0.88);
      box(g, 1.7, 0.03, 0.65, 0, 0.25, 0, M.metal);
      box(g, 0.3, 0.02, 0.22, 0.4, 0.94, 0.1, M.dark);  // a tablet
      box(g, 0.24, 0.015, 0.32, -0.3, 0.94, 0.05, M.paper);
      mugOn(g, 0.65, 0.93, 0.15);
      // The lamp: a post, an arm, a shade.
      cyl(g, 0.03, 0.6, -0.75, 1.23, -0.28, M.metal, 8);
      const arm = cyl(g, 0.025, 0.7, -0.5, 1.5, -0.2, M.metal, 8); arm.rotation.z = Math.PI / 2.4;
      cyl(g, 0.12, 0.08, -0.22, 1.42, -0.15, M.dark, 12, 0.06);
    },
    desk(g) {
      box(g, 1.6, 0.05, 0.75, 0, 0.74, 0, M.cream);
      box(g, 0.45, 0.7, 0.7, -0.55, 0.35, 0, M.cream);
      plane(g, 0.43, 0.68, -0.55, 0.35, 0.352, M.drawers3);
      box(g, 0.45, 0.7, 0.7, 0.55, 0.35, 0, M.cream);
      plane(g, 0.43, 0.68, 0.55, 0.35, 0.352, M.drawers2);
      for (const x of [-0.2, -0.12, -0.04]) box(g, 0.07, 0.3, 0.24, x, 0.92, -0.25, x < -0.1 ? M.dark : M.yellow); // binders
      box(g, 0.3, 0.01, 0.22, 0.2, 0.77, 0.05, M.paper);
      mugOn(g, 0.55, 0.765, 0.1);
    },
    // The teleporter control stand (Teleporter Chamber sheet): a pedestal with an angled screen head.
    teleControl(g) {
      box(g, 0.5, 0.95, 0.42, 0, 0.475, -0.02, M.cream);
      box(g, 0.56, 0.06, 0.48, 0, 0.98, -0.02, M.dark);
      box(g, 0.3, 0.04, 0.08, -0.08, 1.02, 0.14, M.dark); // the button strip
      box(g, 0.06, 0.03, 0.05, 0.14, 1.02, 0.14, M.yellow);
      const head = node(g);
      head.position.set(0, 1.28, -0.06);
      head.rotation.x = -0.42; // leans back toward whoever stands at it
      box(head, 0.74, 0.5, 0.1, 0, 0, 0, M.cream);
      plane(head, 0.64, 0.4, 0, 0, 0.052, teleScreenMat);
    },
    cabinet(g) {
      box(g, 0.9, 1.1, 0.55, 0, 0.55, 0, M.cream);
      plane(g, 0.86, 1.06, 0, 0.55, 0.277, M.drawers3);
      [-0.3, -0.22, -0.14, -0.06].forEach((x, i) => box(g, 0.07, 0.28, 0.24, x, 1.24, 0, i % 2 ? M.yellow : M.dark)); // binders
    },
    sofa(g) {
      box(g, 2.0, 0.42, 0.85, 0, 0.21, 0, M.leather);
      for (const x of [-0.65, 0, 0.65]) {
        box(g, 0.64, 0.14, 0.68, x, 0.49, 0.06, M.leather);
        const back = box(g, 0.64, 0.45, 0.2, x, 0.75, -0.32, M.leather);
        back.rotation.x = -0.1;
      }
      for (const x of [-1.08, 1.08]) box(g, 0.18, 0.62, 0.88, x, 0.31, 0, M.cream); // white metal arms
    },
    coffeeTable(g) {
      box(g, 1.2, 0.05, 0.6, 0, 0.42, 0, M.cream);
      box(g, 1.1, 0.03, 0.5, 0, 0.12, 0, M.cream);
      posts(g, 1.15, 0.55, 0.42, 0.05);
      mugOn(g, 0.3, 0.445, 0.05);
      box(g, 0.28, 0.01, 0.2, -0.2, 0.45, 0, M.paper);
    },
    messTable(g) {
      box(g, 1.6, 0.05, 0.9, 0, 0.75, 0, M.cream);
      posts(g, 1.5, 0.8, 0.73, 0.05);
      for (const [x, z] of [[-0.45, 0.2], [0.35, -0.15], [0.1, 0.25]]) cyl(g, 0.08, 0.1, x, 0.825, z, M.paper, 10);
      cyl(g, 0.1, 0.28, -0.1, 0.915, -0.2, M.dark, 12); // a thermos
    },
    // A pot of soil. The plant itself is a downloaded model (js/modelplan.js); these leaf cards
    // stand in until it loads.
    plant(g, f) {
      cyl(g, 0.34, 0.4, 0, 0.2, 0, M.cream, 14, 0.4);
      cyl(g, 0.42, 0.04, 0, 0.4, 0, M.cream, 14, 0.42); // the rim
      cyl(g, 0.36, 0.02, 0, 0.39, 0, M.soil, 14);
      for (let k = 0; k < 9; k++) {
        const leaf = MeshBuilder.CreatePlane('leaf', { width: 0.22, height: 0.6 }, scene);
        leaf.parent = g;
        leaf.material = leafMat;
        leaf.metadata = { standIn: 'plant-' + (f.model ?? 'none') };
        const a = (k / 9) * Math.PI * 2 + (k % 2) * 0.3;
        leaf.position.set(Math.sin(a) * 0.12, 0.62 + (k % 3) * 0.06, Math.cos(a) * 0.12);
        leaf.rotation.set(-(0.35 + (k % 3) * 0.2), a, 0);
      }
    },
    // A hydroponic grow rack (Botanical Haven sheet): three steel tiers, each with a tray of
    // lettuce and red leaf under a white lamp bar. dry: the bottom lamp is dead and its tray wilted.
    growRack(g, f) {
      const W = 1.6, D = 0.42, tiers = [0.3, 0.92, 1.54], TOP = 1.95;
      posts(g, W, D, TOP, 0.04);
      box(g, W, 0.035, D, 0, TOP, 0, M.metal);
      box(g, W - 0.08, 0.03, 0.03, 0, 1.2, -D / 2 + 0.02, M.metal); // a back rail
      const lamp = glow(basic(scene, 0xeef4ff), srgb(0xeef4ff), f.room, { flicker: !f.dry });
      const lit = (tex) => glow(leafy(tex, 0x4a5a3a), linear(0x4a5a3a), f.room);
      const mats = { lettuce: lit(LEAF.lettuce), red: lit(LEAF.red), dry: leafy(LEAF.dry) };
      const heads = { lettuce: [], red: [], dry: [] };
      let n = 0;
      for (const [i, y] of tiers.entries()) {
        box(g, W, 0.035, D, 0, y, 0, M.metal);
        box(g, W - 0.12, 0.07, D - 0.08, 0, y + 0.05, 0.01, M.dark);
        box(g, W - 0.16, 0.01, D - 0.12, 0, y + 0.085, 0.01, M.soil);
        const dead = f.dry && i === 0;
        box(g, W - 0.2, 0.02, 0.05, 0, (tiers[i + 1] ?? TOP) - 0.035, 0.02, dead ? M.dark : lamp);
        for (let k = 0; k < 8; k++) {
          for (const z of [-0.07, 0.09]) {
            n++;
            if (f.dry && i === 2 && (k === 2 || k === 5) && z > 0) continue; // a couple already pulled
            const kind = dead || (n * 7) % 23 === 0 ? 'dry' : (k + i) % 3 === 0 ? 'red' : 'lettuce';
            heads[kind].push(...head(-0.66 + k * 0.19, y + 0.09, z + ((n * 5) % 3) * 0.01, 1.1 + ((n * 13) % 7) * 0.05, n));
          }
        }
      }
      for (const kind of Object.keys(heads)) cards(g, mats[kind], 0.24, 0.22, heads[kind]);
    },
    // The tomato grow chamber (Botanical Haven sheet): a glass-fronted cabinet lit purple, four
    // staked tomato plants inside, and its status screen on the wall beside it.
    growChamber(g, f) {
      const cx = -0.2, cw = 1.05, D = 0.58, y0 = 0.52, y1 = 1.95;
      const violet = srgb(0xc070ff);
      box(g, cw, y0, D, cx, y0 / 2, 0, M.cream);
      plane(g, cw - 0.06, y0 - 0.06, cx, y0 / 2, D / 2 + 0.002, M.drawers2);
      for (const sx of [-1, 1]) box(g, 0.06, y1 - y0, D, cx + sx * (cw / 2 - 0.03), (y0 + y1) / 2, 0, M.cream);
      box(g, cw, 0.08, D, cx, y1 + 0.04, 0, M.cream);
      plane(g, cw - 0.12, y1 - y0, cx, (y0 + y1) / 2, -D / 2 + 0.03, glow(basic(scene, 0x6a2a9c), srgb(0x6a2a9c), f.room)); // lit back wall
      const strip = glow(basic(scene, 0xc070ff), violet, f.room);
      for (const z of [-0.12, 0.1]) box(g, cw - 0.16, 0.035, 0.05, cx, y1 - 0.05, z, strip);
      for (const sx of [-1, 1]) box(g, 0.035, y1 - y0 - 0.2, 0.05, cx + sx * (cw / 2 - 0.09), (y0 + y1) / 2, -D / 2 + 0.1, strip); // side strips
      box(g, cw - 0.12, 0.03, D - 0.06, cx, y0 + 0.015, 0, M.dark);
      // The glass, and its handle. Unlit, just a faint violet film: a lit pane catches the
      // flashlight and turns milky, hiding the plants.
      const glass = basic(scene, 0x3a1850, { alpha: 0.12 });
      glass.backFaceCulling = false;
      plane(g, cw - 0.1, y1 - y0 - 0.02, cx, (y0 + y1) / 2, D / 2 - 0.02, glass).metadata = { decal: true };
      box(g, 0.03, 0.4, 0.04, cx + cw / 2 - 0.12, 1.25, D / 2 + 0.01, M.metal);
      // Plants: pot, stake, leafy stems, fruit (more red on the lit ones, a dried one at the end).
      const leaves = [], dry = [], red = [], green = [];
      [-0.36, -0.12, 0.12, 0.36].forEach((dx, i) => {
        const x = cx + dx;
        cyl(g, 0.17, 0.15, x, y0 + 0.1, 0, M.terracotta, 12, 0.2);
        cyl(g, 0.012, 1.15, x + 0.05, y0 + 0.7, -0.04, M.stake, 5);
        const list = i === 3 ? dry : leaves;
        for (const a of [0, Math.PI / 2, Math.PI / 4 * 3]) list.push({ x, y: y0 + 0.17, z: 0, ry: a + i, s: i === 3 ? 0.8 : 0.95 + i * 0.04, sy: i === 3 ? 0.75 : 1 });
        if (i === 3) return;
        for (let k = 0; k < 6; k++) {
          const p = { x: x + Math.sin(k * 2.1 + i) * 0.11, y: y0 + 0.55 + ((k * 37 + i * 11) % 60) / 100, z: Math.cos(k * 2.1 + i) * 0.1 };
          (k % 3 === 0 ? green : red).push(p);
        }
      });
      const tomatoLit = glow(leafy(LEAF.tomato, 0x7a3a9a), linear(0x7a3a9a), f.room);
      cards(g, tomatoLit, 0.42, 0.95, leaves);
      const dead = pbr(scene, { map: LEAF.tomato, color: 0xb08a48, roughness: 0.85, cutout: true, twoSided: true }); // browned
      cards(g, dead, 0.42, 0.95, dry);
      balls(g, pbr(scene, { color: 0xc42a1a, roughness: 0.35 }), 0.06, red);
      balls(g, pbr(scene, { color: 0x6f9a2c, roughness: 0.45 }), 0.05, green);
      // The status screen on an arm from the wall to the right, level with the chamber's front.
      box(g, 0.05, 0.05, D - 0.1, 0.55, 1.35, -0.05, M.metal);
      box(g, 0.42, 0.52, 0.05, 0.55, 1.35, D / 2 - 0.1, M.dark);
      plane(g, 0.36, 0.45, 0.55, 1.35, D / 2 - 0.074, chamberScreenMat);
    },
    // A seedling bench (Botanical Haven sheet): a pegboard of hand tools, seedling trays (their
    // sprouts are a model: js/modelplan.js), a tablet with a leaf scan, a trowel and a mug.
    pottingBench(g) {
      const W = 1.6, D = 0.65;
      box(g, W, 0.05, D, 0, 0.9, 0, M.cream);
      posts(g, W - 0.04, D - 0.04, 0.88, 0.05);
      box(g, W - 0.1, 0.03, D - 0.1, 0, 0.2, 0, M.cream);
      box(g, W - 0.08, 0.86, 0.03, 0, 1.4, -D / 2 + 0.02, M.cream);
      plane(g, W - 0.14, 0.8, 0, 1.4, -D / 2 + 0.037, pegMat);
      box(g, 0.6, 0.03, 0.16, 0.42, 1.66, -D / 2 + 0.11, M.metal);
      for (const x of [0.22, 0.4, 0.6]) cyl(g, 0.1, 0.09, x, 1.72, -D / 2 + 0.11, M.terracotta, 10, 0.12);
      // Seedling trays.
      for (const [x, z, r] of [[-0.48, 0.04, 0.05], [0.0, 0.08, -0.08]]) {
        const t = box(g, 0.5, 0.05, 0.32, x, 0.95, z, M.dark); t.rotation.y = r;
        const s = box(g, 0.46, 0.01, 0.28, x, 0.97, z, M.soil); s.rotation.y = r;
      }
      // The tablet, leaning back on its stand.
      const tab = node(g);
      tab.position.set(0.5, 0.93, 0.06); tab.rotation.x = -0.35; tab.rotation.y = -0.25;
      box(tab, 0.36, 0.26, 0.015, 0, 0.13, 0, M.dark);
      plane(tab, 0.33, 0.227, 0, 0.13, 0.009, scanMat);
      // A trowel, spilled soil, a mug.
      const tr = node(g); tr.position.set(0.12, 0.935, 0.24); tr.rotation.y = 0.7;
      box(tr, 0.12, 0.025, 0.028, -0.07, 0, 0, M.leather);
      box(tr, 0.11, 0.008, 0.065, 0.05, -0.008, 0, M.metal);
      box(g, 0.22, 0.004, 0.12, -0.18, 0.927, 0.2, M.soil);
      mugOn(g, 0.72, 0.925, -0.14);
    },
    officeChair(g) {
      box(g, 0.5, 0.1, 0.5, 0, 0.47, 0, M.cream);
      box(g, 0.42, 0.04, 0.42, 0, 0.53, 0.02, M.leather);
      const back = box(g, 0.46, 0.6, 0.08, 0, 0.85, -0.24, M.cream); back.rotation.x = -0.12;
      const pad = box(g, 0.38, 0.45, 0.03, 0, 0.85, -0.2, M.leather); pad.rotation.x = -0.12;
      cyl(g, 0.06, 0.38, 0, 0.23, 0, M.metal, 8);
      for (let k = 0; k < 5; k++) {
        const leg = box(g, 0.3, 0.03, 0.05, 0, 0.05, 0, M.dark);
        const a = (k / 5) * Math.PI * 2;
        leg.rotation.y = a;
        leg.position.set(Math.cos(a) * 0.15, 0.05, -Math.sin(a) * 0.15);
      }
    },
    messChair(g) {
      box(g, 0.46, 0.06, 0.46, 0, 0.46, 0, M.leather);
      const back = box(g, 0.46, 0.4, 0.04, 0, 0.72, -0.22, M.cream); back.rotation.x = -0.1;
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) cyl(g, 0.025, 0.45, x, 0.225, z, M.metal, 6);
    },
    stool(g) {
      cyl(g, 0.36, 0.06, 0, 0.62, 0, M.leather, 16);
      cyl(g, 0.05, 0.6, 0, 0.3, 0, M.metal, 8);
      cyl(g, 0.34, 0.03, 0, 0.015, 0, M.dark, 16);
    },
  };

  // Build one piece at (x, z) turned by rotY; returns its root node (which the prop trick can move).
  function place(kind, x, z, rotY, f = {}) {
    const g = node();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    build[kind](g, f);
    if (MERGE.has(kind)) mergeParts(g);
    return g;
  }

  // The plant pieces are made of many small parts and never move: join the parts that share a
  // material into one mesh each, so a grow rack is a handful of draws instead of dozens.
  const MERGE = new Set(['growRack', 'growChamber', 'pottingBench']);
  function mergeParts(g) {
    g.computeWorldMatrix(true);
    const groups = new Map();
    for (const m of g.getChildMeshes(false)) {
      m.computeWorldMatrix(true);
      if (m.hasThinInstances || m.metadata || !m.material) continue;
      if (!groups.has(m.material)) groups.set(m.material, []);
      groups.get(m.material).push(m);
    }
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const merged = BABYLON.Mesh.MergeMeshes(list, true, true);
      if (merged) { merged.name = 'f'; merged.freezeWorldMatrix(); }
    }
  }

  // A wall sign: a dark board with the room list, lit from within so it reads in the dark.
  function sign(s) {
    const g = node();
    g.position.set(s.x, s.y, s.z);
    g.rotation.y = s.rot;
    box(g, 1.1, 0.72, 0.04, 0, 0, -0.02, M.dark);
    plane(g, 1.04, 0.66, 0, 0, 0.002, basic(scene, 0, { map: T(signTexture(s.entries), { mirror: true }) }));
    return g;
  }

  // A window onto the planet, in a thick frame.
  function windowOnSpace(w) {
    const g = node();
    g.position.set(w.x, w.y, w.z);
    g.rotation.y = w.rot;
    box(g, 1.5, 1.0, 0.1, 0, 0, -0.04, M.dark);
    plane(g, 1.3, 0.8, 0, 0, 0.012, basic(scene, 0, { map: T(windowTexture(), { mirror: true }) }));
    for (const x of [-0.66, 0.66]) box(g, 0.08, 0.86, 0.06, x, 0, 0.03, M.metal);
    return g;
  }

  return { place, sign, windowOnSpace, glows };
}

// Everything from the plan: furniture, chairs and stools that go with it, signs and windows.
export function buildFurniture(scene, layout, kit) {
  for (const f of layout.furniture) {
    const at = furniturePlacement(layout, f);
    kit.place(f.kind, at.x, at.z, at.rotY, f);
  }
  for (const s of extraSeats(layout)) kit.place(s.kind, s.x, s.z, s.rotY);
  for (const s of signPlacements(layout)) kit.sign(s);
  for (const w of windowPlacements(layout)) kit.windowOnSpace(w);
}
