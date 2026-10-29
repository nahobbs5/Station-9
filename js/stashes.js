// Side Hustle: Vantora Marks, the company's own money, stashed in crates and boxes around the
// station. Five stashes of 100 each; find all 500 for the achievement. No engine here: game.js
// counts them and js/babylon/world.js makes each one something you can search with E.
import { furniturePlacement } from './worldplan.js';

export const CURRENCY = { name: 'Vantora Marks', short: 'VM' };
export const STASH_VALUE = 100;

// Each sits on a piece of furniture: `top` is how high the prompt sits, `local` is x across it
// and z out from the wall, in its own frame. The toolbox and medical box are the models
// js/modelplan.js puts on the workbench and the crew lockers (same offsets).
export const STASHES = [
  { id: 'vm-storage', room: 'storage', on: 'bigCrate', top: 0.95, local: [0, 0], label: 'Search supply crate' },
  { id: 'vm-generator', room: 'generator', on: 'workbench', top: 1.05, local: [0.05, -0.1], label: 'Search toolbox' },
  { id: 'vm-crew', room: 'crew', on: 'lockers', top: 2.0, local: [0.1, 0], label: 'Search medical box' },
  { id: 'vm-pod', room: 'pod', on: 'cargoCrate', top: 0.55, local: [0, 0], label: 'Search cargo crate' },
  { id: 'vm-control', room: 'control', on: 'cargoCrate', top: 0.55, local: [0, 0], label: 'Search cargo crate' },
];
export const STASH_TOTAL = STASHES.length * STASH_VALUE;

export const formatMarks = (n) => `${n} ${CURRENCY.short}`;

// Each stash's world spot: { id, room, label, x, y, z }.
export function stashPlacements(layout) {
  return STASHES.map((s) => {
    const f = layout.furniture.find((q) => q.room === s.room && q.kind === s.on);
    if (!f) return null;
    const at = furniturePlacement(layout, f);
    const c = Math.cos(at.rotY), sn = Math.sin(at.rotY);
    const [lx, lz] = s.local;
    return { id: s.id, room: s.room, label: s.label, x: at.x + lx * c + lz * sn, y: s.top, z: at.z - lx * sn + lz * c };
  }).filter(Boolean);
}
