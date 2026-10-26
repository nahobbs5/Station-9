// The wellness suites (reference files/wellness rooms.md): the two safe rooms, padded floor to
// ceiling and lit bright and cool. Suite A (the Wellness Room) is the observation suite; Suite B
// (the Quiet Room) is the small rest room with the graffiti. Plain data, no engine, so Node tests
// can check it. Positions are in metres; rotY turns a piece about Y (0 = facing +z).
import { TILE, WALL_H } from './layout.js';

// Marigold's lines for them are in js/intercom.js (LINES.suiteDoor, suiteHunt, graffiti).
export const SUITES = { wellness: { label: 'A' }, quiet: { label: 'B' } };
export const GRAFFITI_RANGE = 2; // metres from the wall before Marigold comments

// Cells the gurneys block (they fill their cell, like other solid props). The tests check these
// match the gurneys in planSuite. Kept as a literal so layout.js can read it while it loads.
export const SUITE_SOLIDS = [[7, 8], [10, 7], [9, 9], [20, 11]];

// Sizes from the doc's equipment table: [width, depth, height].
export const SIZES = {
  gurney: [0.9, 2.0, 0.55],
  iv: [0.5, 0.5, 1.8],
  heartMonitor: [0.4, 0.15, 0.3],
  ring: [1.8, 0.5, 1.8],
  kiosk: [0.5, 0.3, 1.3],
  rack: [0.3, 0.05, 0.4],
  ceilingPanel: [1.2, 0.6, 0.02],
  chair: [0.5, 0.5, 0.85],
  marker: [0.14, 0.02, 0.02],
  note: [0.12, 0.01, 0.12],
};

const FACE = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // facing +z, -z, +x, -x

// A room's bounds in metres.
function bounds(layout, id) {
  const r = layout.room(id);
  return { x0: r.x * TILE, z0: r.y * TILE, x1: (r.x + r.w) * TILE, z1: (r.y + r.h) * TILE };
}

// Which suite a point is in, if any (the doc's "safe box" test, on the room's bounds).
export function inSuite(layout, pos) {
  for (const id of Object.keys(SUITES)) {
    const b = bounds(layout, id);
    if (pos.x > b.x0 && pos.x < b.x1 && pos.z > b.z0 && pos.z < b.z1) return id;
  }
  return null;
}

// A gurney with its IV stand, heart monitor and clipboard rack. The gurney lies with its long
// side against a wall. (x, z): its centre; along: 'x' or 'z' for its length; wall: which wall it's
// against ('n', 's', 'e', 'w'). The kit goes at the head end (toward `head`, -1 or +1 along its length).
function bed(out, { x, z, along, wall, head = -1, cell }) {
  out.push({ kind: 'gurney', x, y: 0, z, rotY: along === 'z' ? 0 : Math.PI / 2, size: SIZES.gurney, solid: true, cell });
  const inward = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] }[wall];
  const t = along === 'z' ? [0, 1] : [1, 0];
  const headX = x + t[0] * head * 1.0, headZ = z + t[1] * head * 1.0;
  // Beds sit 0.6 m (centre) from their wall. Wall-hung things go 8 cm out from the wall.
  const wallX = x - inward[0] * 0.6, wallZ = z - inward[1] * 0.6;
  // IV stand just past the head, a little out from the wall.
  out.push({ kind: 'iv', x: headX + t[0] * head * 0.35 + inward[0] * 0.15, y: 0, z: headZ + t[1] * head * 0.35 + inward[1] * 0.15, rotY: 0, size: SIZES.iv });
  // Heart monitor on the wall above the head; clipboard rack on the wall by the foot.
  const wallAt = (k, y) => ({ x: wallX + t[0] * k + inward[0] * 0.08, y, z: wallZ + t[1] * k + inward[1] * 0.08 });
  out.push({ kind: 'heartMonitor', ...wallAt(head * 0.7, 1.45), rotY: FACE[wall], size: SIZES.heartMonitor });
  out.push({ kind: 'rack', ...wallAt(-head * 0.6, 1.15), rotY: FACE[wall], size: SIZES.rack });
}

// Ceiling panels in a grid, kept clear of the walls.
function ceiling(out, b, cols, rows) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      out.push({ kind: 'ceilingPanel', x: b.x0 + (w * (i + 0.5)) / cols, y: WALL_H - 0.01, z: b.z0 + (d * (j + 0.5)) / rows, rotY: 0, size: SIZES.ceilingPanel });
    }
  }
}

// Everything in one suite, in world space.
export function planSuite(layout, id) {
  const b = bounds(layout, id);
  const out = [];
  if (id === 'wellness') {
    // Suite A, 8 x 8 m, door in the north wall (x 16-18). The scanner ring stands in the middle,
    // upright, so you walk through it heading in from the door. Beds on the west, east and south walls.
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    out.push({ kind: 'ring', x: cx, y: 0, z: cz, rotY: 0, size: SIZES.ring });
    bed(out, { x: b.x0 + 0.6, z: 17, along: 'z', wall: 'w', head: -1, cell: [7, 8] });
    bed(out, { x: b.x1 - 0.6, z: 15, along: 'z', wall: 'e', head: -1, cell: [10, 7] });
    bed(out, { x: 19, z: b.z1 - 0.6, along: 'x', wall: 's', head: 1, cell: [9, 9] });
    // The monitor bank along the north wall, east of the door: three more in perfect sync.
    for (const x of [19.4, 20.2, 21.0]) out.push({ kind: 'heartMonitor', x, y: 1.45, z: b.z0 + 0.08, rotY: FACE.n, size: SIZES.heartMonitor });
    // The feedback kiosk, just west of the door.
    out.push({ kind: 'kiosk', x: 15.0, y: 0, z: b.z0 + 0.2, rotY: FACE.n, size: SIZES.kiosk });
    ceiling(out, b, 3, 4);
  } else if (id === 'quiet') {
    // Suite B, 6 x 6 m, one door in the east wall (z 24-26). The graffiti covers the west wall and
    // the chair faces it, so whoever reads it has their back to the door.
    const gz = (b.z0 + b.z1) / 2;
    // On the padding, which stands 2 cm off the wall itself.
    out.push({ kind: 'graffiti', x: b.x0 + 0.03, y: 1.35, z: gz, rotY: FACE.w, size: [4.2, 0.01, 2.1] });
    out.push({ kind: 'chair', x: b.x0 + 1.5, y: 0, z: gz, rotY: -FACE.w, size: SIZES.chair }); // faces west
    bed(out, { x: 41, z: b.z0 + 0.6, along: 'x', wall: 'n', head: 1, cell: [20, 11] });
    out.push({ kind: 'kiosk', x: b.x1 - 0.2, y: 0, z: 23.2, rotY: FACE.e, size: SIZES.kiosk });
    // Three weak clues to who wrote it (the smear is drawn into the graffiti itself).
    out.push({ kind: 'marker', x: b.x0 + 0.35, y: 0.01, z: gz + 1.6, rotY: 0.7, size: SIZES.marker });
    out.push({ kind: 'note', x: b.x0 + 0.035, y: 1.05, z: gz + 2.35, rotY: FACE.w, size: SIZES.note, text: 'Sorry.\n– J.' });
    ceiling(out, b, 2, 3);
  }
  return out;
}

// Is this wall panel (from worldplan.js wallPanels) part of a suite? Its inside face points into
// the room, so step a little off its middle along the normal and see which suite that lands in.
export function paddedSuite(layout, p) {
  const mx = (p.ax + p.bx) / 2 + p.nx * 0.3, mz = (p.az + p.bz) / 2 + p.nz * 0.3;
  return inSuite(layout, { x: mx, z: mz });
}

// The graffiti wall: where it hangs, for Marigold's comment.
export function graffitiWall(layout) {
  return planSuite(layout, 'quiet').find((p) => p.kind === 'graffiti');
}
