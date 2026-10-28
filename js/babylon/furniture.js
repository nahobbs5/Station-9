// Babylon.js furniture, after the "Research Station Interiors" reference sheet: worn white metal,
// burnt-orange leather, safety yellow and the Station 9 emblem. Every piece is built from simple
// shapes facing +Z, standing on the floor at its origin; js/worldplan.js says where each one goes.
import { furniturePlacement, extraSeats, windowPlacements, signPlacements } from '../worldplan.js';
import {
  housingTexture, leatherTexture, lockerTexture, drawerTexture, crateTexture, medkitTexture,
  signTexture, windowTexture, blanketTexture, leafTexture, mugTexture, teleControlScreen,
} from '../textures.js';
import { pbr, basic, toTexture, bevelBox } from './util.js';

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
    plant(g) {
      cyl(g, 0.34, 0.4, 0, 0.2, 0, M.cream, 14, 0.4);
      cyl(g, 0.36, 0.02, 0, 0.39, 0, M.soil, 14);
      for (let k = 0; k < 9; k++) {
        const leaf = MeshBuilder.CreatePlane('leaf', { width: 0.22, height: 0.6 }, scene);
        leaf.parent = g;
        leaf.material = leafMat;
        const a = (k / 9) * Math.PI * 2 + (k % 2) * 0.3;
        leaf.position.set(Math.sin(a) * 0.12, 0.62 + (k % 3) * 0.06, Math.cos(a) * 0.12);
        leaf.rotation.set(-(0.35 + (k % 3) * 0.2), a, 0);
      }
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
    return g;
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

  return { place, sign, windowOnSpace };
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
