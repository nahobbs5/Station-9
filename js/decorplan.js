// Where the station's wear and tear goes: pipes, faults, broken lights, patches and clutter.
// Plain data from the layout (no three.js), seeded so it's the same every load and testable in Node.
import { TILE, WALL_H, cellCenter } from './layout.js';

// Densities and counts, all in one place for tuning.
export const DECOR = {
  overheadMin: 2.3,          // nothing hangs lower than this (metres)
  pipes: [                    // two lines down every corridor, offset from the centre line
    { offset: 0.55, y: 2.55, r: 0.075, kind: 'copper' },
    { offset: -0.6, y: 2.78, r: 0.05, kind: 'green' },
  ],
  roomPipe: { y: 2.62, r: 0.07, inset: 0.28 },
  brokenLights: 9, dyingLights: 2, lightSpacing: 3,
  faults: { steam: 4, drip: 4, spark: 3, clank: 3 },
  plates: 46, tape: 14, boards: 4, cables: 7, gratesChance: 0.3, panels: 3, clutterChance: 0.6,
};

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const HALF = TILE / 2;

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function planDecor(layout, seed = 1234) {
  const rand = seeded(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const L = layout;
  const corridor = [];
  const floorCells = [];
  for (let z = 0; z < L.h; z++) {
    for (let x = 0; x < L.w; x++) {
      if (L.isCorridor(x, z)) corridor.push([x, z]);
      if (L.isFloor(x, z) && !L.isDoor(x, z)) floorCells.push([x, z]);
    }
  }
  const nextToDoor = (x, z) => DIRS.some(([dx, dz]) => L.isDoor(x + dx, z + dz));
  const solid = (x, z) => !L.isFloor(x, z);
  const axisOf = (x, z) => (L.isFloor(x - 1, z) || L.isFloor(x + 1, z) ? 'x' : 'z');
  // A point on the wall face of cell (x, z) toward (dx, dz), nudged in by `inset`.
  const face = (x, z, dx, dz, y, inset = 0.015) => ({
    x: cellCenter(x) + dx * (HALF - inset), y, z: cellCenter(z) + dz * (HALF - inset),
    rot: Math.atan2(-dx, -dz), cell: [x, z],
  });
  const wallFaces = (cells) => cells.flatMap(([x, z]) => DIRS.filter(([dx, dz]) => solid(x + dx, z + dz)).map(([dx, dz]) => ({ x, z, dx, dz })));

  // Pipes: in each corridor cell, each pipe line meets at a junction point J offset from the
  // centre, with a half-segment from J out to each open side. Toward a door it stops with a flange,
  // because doors slide up into the ceiling.
  const pipes = [], flanges = [], brackets = [];
  for (const line of DECOR.pipes) {
    for (const [x, z] of corridor) {
      const J = { x: cellCenter(x) + line.offset, y: line.y, z: cellCenter(z) + line.offset };
      let bracket = false;
      for (const [dx, dz] of DIRS) {
        const nx = x + dx, nz = z + dz;
        if (!L.isFloor(nx, nz)) continue;
        const toDoor = L.isDoor(nx, nz) || L.roomAt(nx, nz);
        const reach = toDoor ? HALF - 0.08 : HALF;
        const end = {
          x: dx ? cellCenter(x) + dx * reach : J.x,
          y: line.y,
          z: dz ? cellCenter(z) + dz * reach : J.z,
        };
        // On the axis we're travelling, the segment runs from J's coordinate to the cell edge.
        pipes.push({ a: { ...J }, b: end, r: line.r, kind: line.kind, cell: [x, z] });
        if (toDoor) flanges.push({ ...end, axis: dx ? 'x' : 'z', r: line.r });
        bracket = true;
      }
      if (bracket && (x + z) % 2 === 0) brackets.push({ x: J.x, y: line.y, z: J.z, len: WALL_H - line.y });
    }
  }

  // Rooms: one run along a wall with no door, near the ceiling, with a riser in one corner.
  const risers = [];
  for (const room of L.rooms) {
    if (room.safe) continue;
    const sides = shuffle([
      { side: 'n', cells: range(room.x, room.w).map((x) => [x, room.y - 1]) },
      { side: 's', cells: range(room.x, room.w).map((x) => [x, room.y + room.h]) },
      { side: 'w', cells: range(room.y, room.h).map((z) => [room.x - 1, z]) },
      { side: 'e', cells: range(room.y, room.h).map((z) => [room.x + room.w, z]) },
    ]).filter((s) => !s.cells.some(([x, z]) => L.isDoor(x, z) || L.isFloor(x, z)));
    if (!sides.length) continue;
    const runs = room.id === 'generator' ? [DECOR.roomPipe, { ...DECOR.roomPipe, y: 2.42, inset: 0.5, r: 0.1 }] : [DECOR.roomPipe];
    const s = sides[0];
    for (const p of runs) {
      const x0 = room.x * TILE, x1 = (room.x + room.w) * TILE, z0 = room.y * TILE, z1 = (room.y + room.h) * TILE;
      let a, b;
      if (s.side === 'n' || s.side === 's') {
        const z = s.side === 'n' ? z0 + p.inset : z1 - p.inset;
        a = { x: x0 + 0.1, y: p.y, z }; b = { x: x1 - 0.1, y: p.y, z };
      } else {
        const x = s.side === 'w' ? x0 + p.inset : x1 - p.inset;
        a = { x, y: p.y, z: z0 + 0.1 }; b = { x, y: p.y, z: z1 - 0.1 };
      }
      pipes.push({ a, b, r: p.r, kind: p === DECOR.roomPipe ? 'copper' : 'green', room: room.id });
      // The riser comes down into the corner near `a`.
      const rx = s.side === 'e' ? x1 - p.inset : x0 + p.inset, rz = s.side === 's' ? z1 - p.inset : z0 + p.inset;
      if (p === DECOR.roomPipe) {
        risers.push({ a: { x: rx, y: 0, z: rz }, b: { x: rx, y: p.y, z: rz }, r: p.r, kind: 'copper', room: room.id });
        flanges.push({ x: rx, y: 0.04, z: rz, axis: 'y', r: p.r });
      }
      for (let t = 0.2; t < 1; t += 0.3) brackets.push({ x: a.x + (b.x - a.x) * t, y: p.y, z: a.z + (b.z - a.z) * t, len: WALL_H - p.y });
    }
  }

  // Broken ceiling lights in corridors, spread apart. A couple are dying rather than dead.
  const lights = [];
  for (const [x, z] of shuffle(corridor.slice())) {
    if (lights.length >= DECOR.brokenLights) break;
    if (lights.some((l) => Math.abs(l.cell[0] - x) + Math.abs(l.cell[1] - z) < DECOR.lightSpacing)) continue;
    lights.push({ x: cellCenter(x), y: WALL_H - 0.06, z: cellCenter(z), axis: axisOf(x, z), cell: [x, z], dying: lights.length < DECOR.dyingLights });
  }

  // Faults: steam, drips and clanks on the copper line; sparks from junction boxes on corridor walls.
  const faults = [];
  const line = DECOR.pipes[0];
  const pipeCells = shuffle(corridor.slice());
  for (const kind of ['steam', 'drip', 'clank']) {
    for (let i = 0; i < DECOR.faults[kind] && pipeCells.length; i++) {
      const [x, z] = pipeCells.pop();
      faults.push({ kind, x: cellCenter(x) + line.offset, y: line.y - line.r, z: cellCenter(z) + line.offset, cell: [x, z] });
    }
  }
  const corridorFaces = shuffle(wallFaces(corridor));
  for (let i = 0; i < DECOR.faults.spark && corridorFaces.length; i++) {
    const f = corridorFaces.pop();
    faults.push({ kind: 'spark', ...face(f.x, f.z, f.dx, f.dz, 1.75, 0.08), cell: [f.x, f.z] });
  }

  // Patchwork on the walls: plates, hazard tape, boarded-up sections.
  const faces = shuffle(wallFaces(floorCells).filter((f) => {
    const room = L.roomAt(f.x, f.z);
    if (!room) return true;
    // Keep the middle of each room wall clear for posters and the wall map.
    return f.dx ? f.z !== room.y + (room.h >> 1) : f.x !== room.x + (room.w >> 1);
  }));
  const plates = [], tape = [], boards = [];
  for (let i = 0; i < DECOR.plates && faces.length; i++) {
    const f = faces.pop();
    const w = 0.35 + rand() * 0.6, h = 0.3 + rand() * 0.6;
    const p = face(f.x, f.z, f.dx, f.dz, 0.35 + h / 2 + rand() * (1.9 - h), 0.012 + (i % 3) * 0.002);
    plates.push({ ...p, along: (rand() - 0.5) * (TILE - w - 0.2), w, h, variant: i % 4, tilt: (rand() - 0.5) * 0.12 });
  }
  for (let i = 0; i < DECOR.tape && faces.length; i++) {
    const f = faces.pop();
    tape.push({ ...face(f.x, f.z, f.dx, f.dz, 0.8 + rand() * 1.2, 0.01), along: (rand() - 0.5) * 0.8, len: 0.6 + rand() * 0.7, angle: (rand() - 0.5) * 1.2 });
  }
  const corridorFaces2 = corridorFaces.slice();
  for (let i = 0; i < DECOR.boards && corridorFaces2.length; i++) {
    const f = corridorFaces2.pop();
    boards.push({ ...face(f.x, f.z, f.dx, f.dz, 1.1, 0.06), planks: 3 + Math.floor(rand() * 2), angle: (rand() - 0.5) * 0.25 });
  }

  // Cables sagging between the high green pipe's junctions, along straight runs.
  const cables = [];
  const high = DECOR.pipes[1];
  for (const [x, z] of shuffle(corridor.slice())) {
    if (cables.length >= DECOR.cables) break;
    const ax = axisOf(x, z), [dx, dz] = ax === 'x' ? [1, 0] : [0, 1];
    if (![1, 2].every((k) => L.isCorridor(x + dx * k, z + dz * k))) continue;
    if (cables.some((c) => c.cell[0] === x && c.cell[1] === z)) continue;
    const a = { x: cellCenter(x) + high.offset, y: high.y - 0.04, z: cellCenter(z) + high.offset };
    const b = { x: a.x + dx * 2 * TILE, y: a.y, z: a.z + dz * 2 * TILE };
    const sag = 0.2 + rand() * 0.18; // lowest point stays above overheadMin
    cables.push({ a, b, sag, cell: [x, z] });
  }

  // Grates in some corridor cells, hanging ceiling panels in a few rooms.
  const grates = corridor.filter(() => rand() < DECOR.gratesChance).map(([x, z]) => ({ x: cellCenter(x), z: cellCenter(z), cell: [x, z], axis: axisOf(x, z) }));
  const panels = [];
  const roomCells = floorCells.filter(([x, z]) => L.roomAt(x, z) && !L.roomAt(x, z).safe && !L.isSolid(x, z));
  for (const [x, z] of shuffle(roomCells.slice())) {
    if (panels.length >= DECOR.panels) break;
    if (panels.some((p) => L.roomAt(...p.cell) === L.roomAt(x, z))) continue;
    panels.push({ x: cellCenter(x), z: cellCenter(z), cell: [x, z], size: 1.2, tilt: 0.42, rot: Math.floor(rand() * 4) * Math.PI / 2 });
  }

  // Barrels and debris tucked into room corners, away from doors and props.
  const clutter = [];
  for (const room of L.rooms) {
    if (room.safe) continue;
    for (const [x, z] of [[room.x, room.y], [room.x + room.w - 1, room.y], [room.x, room.y + room.h - 1], [room.x + room.w - 1, room.y + room.h - 1]]) {
      if (L.isSolid(x, z) || nextToDoor(x, z) || rand() > DECOR.clutterChance) continue;
      const sx = x === room.x ? -1 : 1, sz = z === room.y ? -1 : 1; // which corner walls
      clutter.push({ kind: rand() < 0.65 ? 'barrel' : 'debris', x: cellCenter(x) + sx * 0.55, z: cellCenter(z) + sz * 0.55, cell: [x, z], spin: rand() * Math.PI * 2, tipped: rand() < 0.2 });
    }
  }

  return { pipes: [...pipes, ...risers], risers, flanges, brackets, lights, faults, plates, tape, boards, cables, grates, panels, clutter };
}

function range(start, n) { return Array.from({ length: n }, (_, i) => start + i); }
