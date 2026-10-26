// Station layout: a tile grid plus room, door and prop data.
// No three.js imports here, so Node tests can load it.

export const TILE = 2;      // metres per grid cell
export const WALL_H = 3;    // ceiling height in metres
export const W = 29;
export const H = 25;

export const VOID = 0, ROOM = 1, CORRIDOR = 2, DOOR = 3;

// Eight rooms in a loop, plus two small safe rooms the alien can't enter.
export const ROOMS = [
  { id: 'control',    name: 'Control Room',    x: 12, y: 1,  w: 5, h: 5 },
  { id: 'generator',  name: 'Generator Room',  x: 1,  y: 6,  w: 5, h: 5 },
  { id: 'teleporter', name: 'Teleporter Lab',  x: 23, y: 6,  w: 5, h: 5 },
  { id: 'storage',    name: 'Storage',         x: 1,  y: 14, w: 5, h: 5 },
  { id: 'comms',      name: 'Comms Room',      x: 23, y: 14, w: 5, h: 5 },
  { id: 'airlock',    name: 'Arrival Airlock', x: 9,  y: 19, w: 5, h: 5 },
  { id: 'pod',        name: 'Escape Pod Bay',  x: 17, y: 19, w: 5, h: 5 },
  { id: 'crew',       name: 'Crew Quarters',   x: 12, y: 10, w: 5, h: 5 },
  { id: 'wellness',   name: 'Wellness Room',   x: 7,  y: 6,  w: 3, h: 3, safe: true },
  { id: 'quiet',      name: 'Quiet Room',      x: 19, y: 11, w: 3, h: 3, safe: true },
];

// The three repairs, in the order you have to do them.
export const REPAIRS = ['generator', 'comms', 'pod'];

// The alien's patrol loop, in walking order.
export const ROUTE = ['teleporter', 'control', 'generator', 'storage', 'airlock', 'crew', 'pod', 'comms'];

// Each corridor is a polyline of cells. An end inside a room gets a door on that room's wall.
// An end that starts in an existing corridor is a side branch, with no door at the junction.
const CORRIDOR_PATHS = [
  [[12, 3], [3, 3], [3, 6]],      // control -> generator
  [[16, 3], [25, 3], [25, 6]],    // control -> teleporter
  [[3, 10], [3, 14]],             // generator -> storage
  [[25, 10], [25, 14]],           // teleporter -> comms
  [[3, 18], [3, 21], [9, 21]],    // storage -> airlock
  [[25, 18], [25, 21], [21, 21]], // comms -> pod bay
  [[13, 21], [17, 21]],           // airlock -> pod bay
  [[14, 5], [14, 10]],            // control -> crew quarters
  [[13, 14], [13, 19]],           // crew quarters -> airlock
  [[8, 3], [8, 7]],               // north corridor -> wellness room (safe)
  [[25, 12], [21, 12]],           // east corridor -> quiet room (safe)
];

// Things you can use. Each fills one cell and blocks movement.
export const PROPS = [
  { id: 'generator',      kind: 'repair',  room: 'generator',  cell: [3, 8],   label: 'Repair generator', duration: 4 },
  { id: 'comms',          kind: 'repair',  room: 'comms',      cell: [25, 16], label: 'Send rescue call', duration: 5 },
  { id: 'pod',            kind: 'repair',  room: 'pod',        cell: [19, 20], label: 'Prep escape pod',  duration: 6 },
  { id: 'crate',          kind: 'crate',   room: 'storage',    cell: [1, 16],  label: 'Take noise-makers' },
  { id: 'teleporter',     kind: 'scenery', room: 'teleporter', cell: [25, 8] },
  // Lore terminals: each plays an audio log (text in text/lore.txt). A few steps off the direct routes.
  ...[
    ['t01', 'airlock',    [9, 23]],
    ['t02', 'control',    [12, 1]],
    ['t11', 'control',    [16, 1]],
    ['t03', 'teleporter', [27, 6]],
    ['t07', 'teleporter', [27, 10]],
    ['t04', 'crew',       [12, 10]],
    ['t06', 'crew',       [16, 10]],
    ['t08', 'crew',       [16, 14]],
    ['t05', 'storage',    [1, 18]],
    ['t10', 'generator',  [1, 10]],
    ['t09', 'comms',      [27, 18]],
    ['t12', 'pod',        [21, 23]],
  ].map(([id, room, cell]) => ({ id, kind: 'log', room, cell, label: 'Play tape' })),
];

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
    for (let z = r.y; z < r.y + r.h; z++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        type[idx(x, z)] = ROOM;
        roomIdx[idx(x, z)] = i;
      }
    }
    return { ...r, index: i, cx: r.x + (r.w >> 1), cz: r.y + (r.h >> 1) };
  });

  const doors = [];
  for (const path of CORRIDOR_PATHS) {
    const cells = [];
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i];
      const [bx, bz] = path[i + 1];
      const dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
      let x = ax, z = az;
      for (;;) {
        const last = cells[cells.length - 1];
        if (!last || last[0] !== x || last[1] !== z) cells.push([x, z]);
        if (x === bx && z === bz) break;
        x += dx; z += dz;
      }
    }
    const outside = cells.filter(([x, z]) => roomIdx[idx(x, z)] < 0 && type[idx(x, z)] !== DOOR);
    for (const [x, z] of outside) if (type[idx(x, z)] === VOID) type[idx(x, z)] = CORRIDOR;
    // [end of the polyline, corridor cell next to it]
    for (const [end, [x, z]] of [[path[0], outside[0]], [path[path.length - 1], outside[outside.length - 1]]]) {
      const room = rooms[roomIdx[idx(end[0], end[1])]];
      if (!room) continue;
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

  const solid = new Set(PROPS.map((p) => key(p.cell[0], p.cell[1])));
  // Safe rooms and their hatches: the alien never goes in.
  const safe = new Set();
  for (const r of rooms) {
    if (!r.safe) continue;
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) safe.add(key(x, z));
  }
  for (const d of doors) if (d.safe) safe.add(key(d.cx, d.cz));
  const doorIndex = new Map(doors.map((d, i) => [key(d.cx, d.cz), i]));

  const layout = {
    w: W, h: H, type, rooms, doors,
    props: PROPS.map((p) => ({ ...p })),
    inBounds,
    isFloor,
    isDoor: (x, z) => inBounds(x, z) && type[idx(x, z)] === DOOR,
    isCorridor: (x, z) => inBounds(x, z) && type[idx(x, z)] === CORRIDOR,
    isSolid: (x, z) => solid.has(key(x, z)),
    isSafe: (x, z) => safe.has(key(x, z)),
    // Floor you can stand on (doors count, whatever their state).
    isOpen: (x, z) => isFloor(x, z) && !solid.has(key(x, z)),
    doorIndexAt: (x, z) => doorIndex.get(key(x, z)) ?? -1,
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

// True when nothing solid (walls or closed doors) sits between a and b.
export function lineClear(layout, a, b, isDoorClosed) {
  for (const [x, z] of traceCells(a.x, a.z, b.x, b.z)) {
    if (!layout.isFloor(x, z)) return false;
    if (layout.isDoor(x, z) && isDoorClosed(x, z)) return false;
  }
  return true;
}
