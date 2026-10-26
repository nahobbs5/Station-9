// Where the downloaded models go (CC0 from Poly Haven, in assets/models/; see assets/LICENSES.md).
// Plain data from the layout and the decor plan, so it's testable in Node; js/babylon/models.js
// loads them. Until a model has loaded, the code-built stand-in (if any) shows instead.
import { cellCenter } from './layout.js';
import { furniturePlacement } from './worldplan.js';
import { grateSpots } from './vents.js';
import { GRATE_CLEAR } from './decorplan.js';

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
};
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
  const clear = (x, z) => !grates.some((g) => Math.hypot(g.x - x, g.z - z) < GRATE_CLEAR.floor);
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
  return out;
}
