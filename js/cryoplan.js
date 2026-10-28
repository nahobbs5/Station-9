// The Cryosleep Bay (reference files/Station 9 Cryosleep Bay.png): a secret room south of the
// Wellness Room, reached through a padded panel that slides up. Plain data, no engine, so Node
// tests can check it. Positions in metres; rotY turns a piece about Y (0 = facing +z).
import { TILE } from './layout.js';

// Cells the pods and the desk block. Kept as a literal so layout.js can read it while it loads.
export const CRYO_SOLIDS = [[7, 14], [7, 15], [7, 16], [10, 14], [10, 15], [10, 16], [8, 16], [9, 16]];
// Which pod is yours (the frosted one), by number.
export const YOUR_POD = 5;
export const POD_SIZE = { length: 2.0, width: 0.95, height: 1.05 };

// The six pods: three along each side wall, heads against the wall, feet toward the walkway.
// 01-03 on the west wall (north to south), 04-06 on the east.
export function cryoPods(layout) {
  const r = layout.room('cryo');
  const x0 = r.x * TILE, x1 = (r.x + r.w) * TILE;
  const zs = [r.y * TILE + 2.1, r.y * TILE + 4.5, r.y * TILE + 6.9];
  const half = POD_SIZE.length / 2 + 0.08;
  const pods = [];
  zs.forEach((z, i) => pods.push({ n: i + 1, x: x0 + half, z, rotY: Math.PI / 2, occupied: i + 1 === YOUR_POD }));
  zs.forEach((z, i) => pods.push({ n: i + 4, x: x1 - half, z, rotY: -Math.PI / 2, occupied: i + 4 === YOUR_POD }));
  return pods; // rotY: the foot end (and its screen) faces the walkway
}

// The desk against the south wall, facing north, and the room's painted walls.
export function cryoFixtures(layout) {
  const r = layout.room('cryo');
  const x0 = r.x * TILE, x1 = (r.x + r.w) * TILE, z0 = r.y * TILE, z1 = (r.y + r.h) * TILE, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
  return {
    desk: { x: mx, z: z1 - 0.45, rotY: Math.PI },
    backSign: { x: mx, y: 2.05, z: z1 - 0.02, rot: Math.PI, w: 2.4, h: 1.3 },
    westText: { x: x0 + 0.02, y: 2.35, z: mz + 1.2, rot: Math.PI / 2, w: 1.8, h: 0.9 },
    eastText: { x: x1 - 0.02, y: 2.35, z: mz + 1.2, rot: -Math.PI / 2, w: 1.8, h: 0.9 },
  };
}
