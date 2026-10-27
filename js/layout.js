// Station layout: rooms, corridors, doors and props. The walkable space is a smooth shape
// (js/shape.js: octagon rooms, curved corridors); a 2 m grid derived from it is what the alien
// paths on and what most game logic reads. No engine imports here, so Node tests can load it.
import { buildShape, sampleCorridor } from './shape.js';
import { SUITE_SOLIDS } from './suiteplan.js';
import { POD } from './podplan.js';

export const TILE = 2;      // metres per grid cell
export const WALL_H = 3;    // ceiling height in metres
export const W = 29;
export const H = 25;

export const VOID = 0, ROOM = 1, CORRIDOR = 2, DOOR = 3;

// Eight rooms in a loop, plus two small safe rooms the alien can't enter.
// chamfer: 1 cuts each corner off diagonally (one cell), making the room an octagon.
export const ROOMS = [
  { id: 'control',    name: 'Control Room',    x: 12, y: 1,  w: 5, h: 5, chamfer: 1 },
  { id: 'generator',  name: 'Generator Room',  x: 1,  y: 6,  w: 5, h: 5 },
  { id: 'teleporter', name: 'Teleporter Lab',  x: 23, y: 6,  w: 5, h: 5, chamfer: 1 },
  { id: 'storage',    name: 'Storage',         x: 17, y: 19, w: 5, h: 5 },
  { id: 'comms',      name: 'Comms Room',      x: 23, y: 14, w: 5, h: 5 },
  { id: 'airlock',    name: 'Arrival Airlock', x: 9,  y: 19, w: 5, h: 5 },
  { id: 'pod',        name: 'Escape Pod Bay',  x: 1,  y: 14, w: 5, h: 5 }, // far west: a long run from Comms
  { id: 'crew',       name: 'Crew Quarters',   x: 12, y: 10, w: 5, h: 5, chamfer: 1 },
  { id: 'wellness',   name: 'Wellness Room',   x: 7,  y: 6,  w: 4, h: 4, safe: true }, // Suite A (js/suiteplan.js)
  { id: 'quiet',      name: 'Quiet Room',      x: 19, y: 11, w: 3, h: 3, safe: true }, // Suite B
];

// The three repairs, in the order you have to do them.
export const REPAIRS = ['generator', 'comms', 'pod'];

// The alien's patrol loop, in walking order.
export const ROUTE = ['teleporter', 'control', 'generator', 'pod', 'airlock', 'crew', 'storage', 'comms'];

// Corridors, in cell coordinates. Each is made of straight runs between cell centres (`line`) and
// cubic curves (`curve`: start, two control points, end). An end inside a room gets a door on that
// room's wall (the straight cell just outside it). An end that starts in another corridor is a side
// branch, with no door at the junction. width is the half-width in metres; curves widen to curveWidth.
export const CORRIDORS = [
  // control -> generator: out of the west door, then a long sweep up and round to the generator.
  { id: 'north-west', parts: [{ line: [[12, 3], [10, 3]] }, { curve: [[10, 3], [7, 3], [3, -0.5], [3, 5]] }, { line: [[3, 5], [3, 6]] }], curveWidth: 1.6 },
  // control -> teleporter: the mirror image to the east.
  { id: 'north-east', parts: [{ line: [[16, 3], [18, 3]] }, { curve: [[18, 3], [21, 3], [25, -0.5], [25, 5]] }, { line: [[25, 5], [25, 6]] }], curveWidth: 1.6 },
  { id: 'gen-storage', parts: [{ line: [[3, 10], [3, 14]] }] },
  { id: 'tele-comms', parts: [{ line: [[25, 10], [25, 14]] }] },
  // storage -> airlock: out of the storage door, a dip south-west, then up into the airlock.
  { id: 'storage-airlock', parts: [{ line: [[3, 18], [3, 20]] }, { curve: [[3, 20], [3, 24], [4.5, 21], [7, 21]] }, { line: [[7, 21], [9, 21]] }], curveWidth: 1.6 },
  { id: 'comms-pod', parts: [{ line: [[25, 18], [25, 21], [21, 21]] }] },
  { id: 'airlock-pod', parts: [{ line: [[13, 21], [17, 21]] }] },
  { id: 'control-crew', parts: [{ line: [[14, 5], [14, 10]] }] },
  { id: 'crew-airlock', parts: [{ line: [[13, 14], [13, 19]] }] },
  // Side branches to the safe rooms.
  { id: 'wellness', parts: [{ line: [[8, 2.6], [8, 7]] }] },
  { id: 'quiet', parts: [{ line: [[25, 12], [21, 12]] }] },
];

// Things you can use. Each fills one cell and blocks movement.
export const PROPS = [
  { id: 'generator',      kind: 'repair',  room: 'generator',  cell: [3, 8],   label: 'Repair generator', duration: 4 },
  { id: 'comms',          kind: 'repair',  room: 'comms',      cell: [25, 16], label: 'Send rescue call', duration: 5 },
  { id: 'pod',            kind: 'repair',  room: 'pod',        cell: [3, 16],  label: 'Prep escape pod',  duration: 6 },
  { id: 'crate',          kind: 'crate',   room: 'storage',    cell: [19, 23], label: 'Take noise-makers' },
  { id: 'teleporter',     kind: 'scenery', room: 'teleporter', cell: [25, 8] },
  // Lore terminals: desk consoles that each play an audio log (text in text/lore.txt), a few steps
  // off the direct routes. screen: what the console shows (js/textures.js consoleScreen).
  // note: a sticky note on the bezel. mug: a Skipper mug on the desk.
  ...[
    ['t01', 'airlock',    [9, 23],  'doors',          'Check door\nseals!\n– W.C.'],
    ['t02', 'control',    [13, 1],  'system',         null, true],
    ['t11', 'control',    [15, 1],  'marigold'],
    ['t03', 'teleporter', [27, 7],  'research'],
    ['t07', 'teleporter', [27, 9],  'trial31',        '11 sec\nearly.\nAGAIN.\n– I.O.'],
    ['t04', 'crew',       [12, 11], 'personnel-lena', null, true],
    ['t06', 'crew',       [16, 11], 'personnel-jun'],
    ['t08', 'crew',       [16, 13], 'personnel-sam'],
    ['t05', 'storage',    [21, 19], 'inventory',      'Walk.\nDon\'t run.\n– P.R.'],
    ['t10', 'generator',  [1, 10],  'power',          'Coolant ›\nPumps ›\nValves ›\nRestart'],
    ['t09', 'comms',      [27, 18], 'comms',          'Re-align\nantenna,\nthen retune\n– A.W.'],
    ['t12', 'pod',        [5, 18],  'pod'],
  ].map(([id, room, cell, screen, note = null, mug = false]) => ({ id, kind: 'log', room, cell, label: 'Play tape', screen, note, mug })),
  // More consoles, just for show (solid, but you can't use them).
  ...[
    ['generator', [5, 7],   'reactor'],
    ['comms',     [23, 17], 'signal',      null, true],
    ['control',   [16, 4],  'off'],      // dead: the Hat Man shows in its glass (js/hatman.js)
    ['teleporter', [23, 7], 'off'],
    ['crew',      [12, 13], 'roster',      'Skipper suit\nis by the\nfridge.\n– S.D.', true],
    ['pod',       [1, 18],  'manifest'],
  ].map(([room, cell, screen, note = null, mug = false], i) => ({ id: 'console' + (i + 1), kind: 'console', room, cell, screen, note, mug })),
];

// Furniture (after the "Research Station Interiors" sheet). solid pieces block their cell like props;
// the rest (chairs, plants, the cart) can be walked through. Pieces stand with their back to the
// nearest wall unless `rot` turns them (radians, 0 = facing +z).
export const FURNITURE = [
  // Crew Quarters: bunks, lockers, a mess table with chairs.
  { kind: 'bunk', room: 'crew', cell: [15, 10], solid: true },
  { kind: 'bunk', room: 'crew', cell: [15, 14], solid: true },
  { kind: 'lockers', room: 'crew', cell: [13, 10], solid: true },
  { kind: 'messTable', room: 'crew', cell: [14, 12], solid: true, rot: 0 },
  // Arrival Airlock: a waiting bench, lockers, a plant.
  { kind: 'bench', room: 'airlock', cell: [11, 19], solid: true },
  { kind: 'lockers', room: 'airlock', cell: [9, 20], solid: true }, // the back wall's middle stays clear for the emblem
  { kind: 'plant', room: 'airlock', cell: [9, 19] },
  // Storage: shelving, a big supply crate, the janitor's cart (doors on its west and east walls).
  { kind: 'shelves', room: 'storage', cell: [18, 19], solid: true },
  { kind: 'shelves', room: 'storage', cell: [20, 19], solid: true, medkit: true },
  { kind: 'bigCrate', room: 'storage', cell: [21, 23], solid: true },
  { kind: 'cart', room: 'storage', cell: [17, 23] },
  // Generator Room: a workbench and a tool shelf.
  { kind: 'workbench', room: 'generator', cell: [5, 9], solid: true },
  { kind: 'shelves', room: 'generator', cell: [1, 7], solid: true },
  // Comms Room: an office desk and a filing cabinet.
  { kind: 'desk', room: 'comms', cell: [27, 15], solid: true },
  { kind: 'cabinet', room: 'comms', cell: [23, 15], solid: true },
  // Teleporter Lab.
  { kind: 'cabinet', room: 'teleporter', cell: [23, 9], solid: true },
  { kind: 'plant', room: 'teleporter', cell: [27, 8] },
  // Escape Pod Bay (doors on its north and south walls; the pod lies across the middle).
  { kind: 'bench', room: 'pod', cell: [2, 14], solid: true },
  { kind: 'lockers', room: 'pod', cell: [5, 14], solid: true },
  // The safe rooms (Wellness, Quiet) are furnished separately (js/suiteplan.js).
];
// Windows onto the planet: [room, wall side].
export const WINDOWS = [['pod', 'w']]; // the station's outer wall, out to space
// Wayfinding signs on the corridor wall just outside these doors (cells).
export const SIGN_DOORS = [[8, 21], [13, 18], [14, 6], [3, 11], [22, 21]];

// Doors that start shut. The alien starts behind these.
const START_CLOSED = ['25,5', '25,11'];

export const cellOf = (v) => Math.floor(v / TILE);
export const cellCenter = (c) => c * TILE + TILE / 2;
export const key = (x, z) => x + ',' + z;

export function buildLayout() {
  const type = new Uint8Array(W * H);
  const roomIdx = new Int8Array(W * H).fill(-1);
  const idx = (x, z) => z * W + x;
  const inBounds = (x, z) => x >= 0 && z >= 0 && x < W && z < H;

  const rooms = ROOMS.map((r, i) => {
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) roomIdx[idx(x, z)] = i;
    return { ...r, index: i, cx: r.x + (r.w >> 1), cz: r.y + (r.h >> 1) };
  });

  // The smooth walkable shape, then the grid from it: a cell is open if its centre is well inside.
  const corridors = CORRIDORS.map((c) => ({ ...c, pts: sampleCorridor(c, TILE) }));
  const shape = buildShape({ w: W, h: H, tile: TILE, rooms, corridors });
  const OPEN_MARGIN = 0.1;
  for (let z = 0; z < H; z++) {
    for (let x = 0; x < W; x++) {
      if (shape.distance(cellCenter(x), cellCenter(z)) < OPEN_MARGIN) continue;
      type[idx(x, z)] = roomIdx[idx(x, z)] >= 0 ? ROOM : CORRIDOR;
    }
  }

  // Doors: where a corridor leaves a room, the first open cell outside it.
  const doors = [];
  for (const c of corridors) {
    for (const ends of [c.pts, c.pts.slice().reverse()]) {
      const room = rooms[roomIdx[idx(cellOf(ends[0].x), cellOf(ends[0].z))]];
      if (!room) continue; // a side branch starting in another corridor
      const p = ends.find((q) => roomIdx[idx(cellOf(q.x), cellOf(q.z))] < 0);
      const [x, z] = [cellOf(p.x), cellOf(p.z)];
      if (type[idx(x, z)] === DOOR) continue;
      type[idx(x, z)] = DOOR;
      doors.push({ cx: x, cz: z, safe: !!room.safe });
    }
  }

  const isFloor = (x, z) => inBounds(x, z) && type[idx(x, z)] !== VOID;
  for (const d of doors) {
    // 'x' means you walk through the door along the x axis.
    d.axis = isFloor(d.cx - 1, d.cz) && isFloor(d.cx + 1, d.cz) ? 'x' : 'z';
    d.startClosed = START_CLOSED.includes(key(d.cx, d.cz));
  }

  const solid = new Set([...PROPS, ...FURNITURE.filter((f) => f.solid)].map((p) => key(p.cell[0], p.cell[1])));
  for (const [x, z] of SUITE_SOLIDS) solid.add(key(x, z)); // the suites' gurneys
  for (const [x, z] of POD.solidCells) solid.add(key(x, z)); // the escape pod (4.5 m long)
  // Safe rooms and their hatches: the alien never goes in.
  const safe = new Set();
  for (const r of rooms) {
    if (!r.safe) continue;
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) safe.add(key(x, z));
  }
  for (const d of doors) if (d.safe) safe.add(key(d.cx, d.cz));
  const doorIndex = new Map(doors.map((d, i) => [key(d.cx, d.cz), i]));

  const layout = {
    w: W, h: H, type, rooms, doors, corridors, shape,
    // Distance (m) from a point to the nearest wall: negative inside walls. Ignores doors and props.
    walkDistance: (x, z) => shape.distance(x, z),
    isWalkable: (x, z) => shape.distance(x, z) >= 0,
    props: PROPS.map((p) => ({ ...p })),
    furniture: FURNITURE.map((f) => ({ ...f })),
    inBounds,
    isFloor,
    isDoor: (x, z) => inBounds(x, z) && type[idx(x, z)] === DOOR,
    isCorridor: (x, z) => inBounds(x, z) && type[idx(x, z)] === CORRIDOR,
    isSolid: (x, z) => solid.has(key(x, z)),
    isSafe: (x, z) => safe.has(key(x, z)),
    // Floor you can stand on (doors count, whatever their state).
    isOpen: (x, z) => isFloor(x, z) && !solid.has(key(x, z)),
    doorIndexAt: (x, z) => doorIndex.get(key(x, z)) ?? -1,
    // The room whose rectangle holds this cell (including an octagon's cut-off corners).
    roomAt: (x, z) => (inBounds(x, z) && roomIdx[idx(x, z)] >= 0 ? rooms[roomIdx[idx(x, z)]] : null),
    room: (id) => rooms.find((r) => r.id === id),
    // Closest standable cell (that also passes `ok`, if given), searching outward in rings.
    nearestOpen(x, z, ok = layout.isOpen) {
      x = Math.max(0, Math.min(W - 1, x));
      z = Math.max(0, Math.min(H - 1, z));
      if (ok(x, z)) return [x, z];
      for (let r = 1; r < 6; r++) {
        let best = null, bestD = Infinity;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            if (!ok(x + dx, z + dz)) continue;
            const d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = [x + dx, z + dz]; }
          }
        }
        if (best) return best;
      }
      return [x, z];
    },
  };
  // A standable spot near each room's centre (the centre may hold a prop).
  for (const r of rooms) r.spot = layout.nearestOpen(r.cx, r.cz);
  return layout;
}

// Grid cells crossed by the segment a -> b (world coordinates), in order.
export function traceCells(ax, az, bx, bz) {
  const out = [];
  let cx = Math.floor(ax / TILE), cz = Math.floor(az / TILE);
  const ex = Math.floor(bx / TILE), ez = Math.floor(bz / TILE);
  const dx = bx - ax, dz = bz - az;
  const sx = Math.sign(dx), sz = Math.sign(dz);
  const tdx = sx ? TILE / Math.abs(dx) : Infinity;
  const tdz = sz ? TILE / Math.abs(dz) : Infinity;
  let tmx = sx > 0 ? ((cx + 1) * TILE - ax) / dx : sx < 0 ? (cx * TILE - ax) / dx : Infinity;
  let tmz = sz > 0 ? ((cz + 1) * TILE - az) / dz : sz < 0 ? (cz * TILE - az) / dz : Infinity;
  out.push([cx, cz]);
  let guard = 0;
  while ((cx !== ex || cz !== ez) && guard++ < 256) {
    if (tmx < tmz) { cx += sx; tmx += tdx; } else { cz += sz; tmz += tdz; }
    out.push([cx, cz]);
  }
  return out;
}

// True when nothing solid (walls or closed doors) sits between a and b. Checks the smooth shape
// every 0.2 m, so angled and curved walls block sight exactly.
export function lineClear(layout, a, b, isDoorClosed) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  for (let i = 0; i <= n; i++) {
    const x = a.x + (dx * i) / n, z = a.z + (dz * i) / n;
    if (layout.walkDistance(x, z) < 0) return false;
    const cx = cellOf(x), cz = cellOf(z);
    if (layout.isDoor(cx, cz) && isDoorClosed(cx, cz)) return false;
  }
  return true;
}
