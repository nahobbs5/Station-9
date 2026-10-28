// Where the downloaded models go (CC0 from Poly Haven, in assets/models/; see assets/LICENSES.md).
// Plain data from the layout and the decor plan, so it's testable in Node; js/babylon/models.js
// loads them. Until a model has loaded, the code-built stand-in (if any) shows instead.
import { cellCenter } from './layout.js';
import { furniturePlacement, nearPod } from './worldplan.js';
import { grateSpots } from './vents.js';
import { GRATE_CLEAR } from './decorplan.js';
import { planGarden } from './gardenplan.js';

// key -> folder in assets/models/. node: keep only this part of a file holding several variants.
export const MODELS = {
  barrel: { dir: 'Barrel_01' },
  drum: { dir: 'barrel_03' },
  medbox: { dir: 'medical_box' },
  toolbox: { dir: 'metal_toolbox' },
  powerbox: { dir: 'power_box_01' },
  propane: { dir: 'propane_tank' },
  jerrycan: { dir: 'metal_jerrycan' },
  sconce: { dir: 'industrial_caged_sconce', node: 'industrial_caged_sconce_c', dead: true },
  // Plants (Botanical Haven). Most files hold several plants side by side, picked by a
  // placement's `variant` (the node whose name ends _<variant>), which is moved to the middle.
  anthurium: { dir: 'anthurium_botany_01', plant: true },
  fern: { dir: 'fern_02', plant: true },
  calathea: { dir: 'calathea_orbifolia_01', plant: true },
  deskPlant: { dir: 'potted_plant_04', plant: true },   // a small pot plant, already potted
  seedlings: { dir: 'shrub_sorrel_01', plant: true },   // a little patch of sprouts
};
// The top of a floor pot's soil (js/babylon/furniture.js plant).
export const POT_SOIL = 0.39;
export const modelUrl = (key) => `assets/models/${MODELS[key].dir}/${MODELS[key].dir}_1k.gltf`;
const BARREL_R = { barrel: 0.28, drum: 0.32 }, BARREL_H = { barrel: 0.88, drum: 0.93 };

// A point on top of a piece of furniture, given in its own frame (x across, z out from the wall).
function onFurniture(layout, f, lx, y, lz) {
  const at = furniturePlacement(layout, f);
  const c = Math.cos(at.rotY), s = Math.sin(at.rotY);
  return { x: at.x + lx * c + lz * s, y, z: at.z - lx * s + lz * c, yaw: at.rotY };
}

// Each: { model, x, y, z, yaw, roll?, centre? (shift down its own up axis, so a tipped barrel
// lies centred on its spot), replaces? (the stand-in it takes over from) }.
export function modelPlacements(layout, plan) {
  const out = [];
  const grates = grateSpots(layout);
  const clear = (x, z) => !grates.some((g) => Math.hypot(g.x - x, g.z - z) < GRATE_CLEAR.floor) && !nearPod(x, z, 0.6);
  plan.clutter.filter((c) => c.kind === 'barrel').forEach((c, i) => {
    const model = i % 2 ? 'drum' : 'barrel';
    out.push(c.tipped
      ? { model, x: c.x, y: BARREL_R[model], z: c.z, yaw: c.spin, roll: Math.PI / 2, centre: BARREL_H[model] / 2, replaces: 'barrel' }
      : { model, x: c.x, y: 0, z: c.z, yaw: c.spin, replaces: 'barrel' });
    // A fuel can or gas bottle beside it, along one of the corner's walls.
    const sx = Math.sign(c.x - cellCenter(c.cell[0])), sz = Math.sign(c.z - cellCenter(c.cell[1]));
    for (const [dx, dz] of [[-sx * 0.7, 0], [0, -sz * 0.7]]) {
      const x = c.x + dx, z = c.z + dz;
      if (layout.walkDistance(x, z) < 0.25 || !clear(x, z)) continue;
      out.push({ model: i % 3 === 0 ? 'propane' : 'jerrycan', x, y: 0, z, yaw: c.spin * 1.7 });
      break;
    }
  });
  // The sparking junction boxes become power boxes with their doors hanging open.
  for (const f of plan.faults.filter((q) => q.kind === 'spark')) {
    out.push({ model: 'powerbox', x: f.x - Math.sin(f.rot) * 0.03, y: f.y, z: f.z - Math.cos(f.rot) * 0.03, yaw: f.rot, replaces: 'junction' });
  }
  for (const s of plan.sconces) out.push({ model: 'sconce', x: s.x, y: s.y, z: s.z, yaw: s.rot });
  // A toolbox on the workbench, a medical box on top of the first lockers.
  const bench = layout.furniture.find((f) => f.kind === 'workbench');
  if (bench) out.push({ model: 'toolbox', ...onFurniture(layout, bench, 0.05, 0.93, -0.1) });
  if (bench) { // and a pair of gas bottles at its end
    for (const [lx, lz] of [[1.25, -0.1], [1.25, 0.28]]) {
      const p = onFurniture(layout, bench, lx, 0, lz);
      if (layout.walkDistance(p.x, p.z) > 0.25 && clear(p.x, p.z)) out.push({ model: 'propane', ...p, yaw: p.yaw + lx * lz * 9 });
    }
  }
  const lockers = layout.furniture.find((f) => f.kind === 'lockers');
  if (lockers) out.push({ model: 'medbox', ...onFurniture(layout, lockers, 0.1, 1.9, 0) });

  // Plants. Each pot's plant takes over from the pot's leaf-card stand-ins.
  for (const f of layout.furniture.filter((q) => q.kind === 'plant' && q.model)) {
    const at = furniturePlacement(layout, f);
    out.push({ model: f.model, variant: f.variant, x: at.x, y: POT_SOIL, z: at.z, yaw: at.rotY + 0.6, scale: f.scale ?? 1, wilt: f.wilt ?? 0, replaces: 'plant-' + f.model });
  }
  for (const pl of planGarden(layout, plan).planters) {
    for (const p of pl.plants) out.push({ model: p.model, variant: p.variant, x: p.x, y: p.y, z: p.z, yaw: p.yaw, scale: p.scale, wilt: p.wilt });
  }
  // Small pot plants on the comms desk, the mess table and the seedling bench; sprouts in its trays.
  const on = (kind, lx, y, lz, extra = {}) => {
    const f = layout.furniture.find((q) => q.kind === kind);
    if (f) out.push({ model: 'deskPlant', ...onFurniture(layout, f, lx, y, lz), scale: 1.3, ...extra });
  };
  on('desk', -0.6, 0.765, -0.15);
  on('messTable', 0.55, 0.775, 0.25, { wilt: 0.6 });
  on('pottingBench', -0.1, 0.925, -0.18);
  const seedBench = layout.furniture.find((q) => q.kind === 'pottingBench');
  if (seedBench) {
    for (const [lx, lz, yaw, wilt] of [[-0.48, 0.04, 0.05, 0], [0.0, 0.08, -0.08, 0.7]]) {
      const p = onFurniture(layout, seedBench, lx, 0.975, lz);
      out.push({ model: 'seedlings', ...p, yaw: p.yaw + yaw, scale: 1.25, wilt });
    }
  }
  return out;
}
