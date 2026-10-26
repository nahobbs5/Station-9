// Where the station's wear and tear goes: pipes, faults, broken lights, patches and clutter.
// Plain data from the layout (no engine), seeded so it's the same every load and testable in Node.
// Corridor decor follows the corridor centrelines (so it bends with curves); wall decor sits on the
// traced wall outline (js/walls.js), so it hangs flat on angled and curved walls too.
import { TILE, WALL_H, cellCenter, cellOf } from './layout.js';
import { wallSegments } from './walls.js';
import { furniturePlacement, signPlacements, windowPlacements, EMBLEM } from './worldplan.js';

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

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// Corridor stretches to decorate: runs of centreline points that are in corridor cells (not rooms
// or doors), with side branches trimmed where they overlap the corridor they join.
function corridorRuns(L) {
  const runs = [];
  for (const c of L.corridors) {
    const others = L.corridors.filter((o) => o !== c);
    const inOther = (p) => others.some((o) => o.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.3));
    const branch = !L.roomAt(cellOf(c.pts[0].x), cellOf(c.pts[0].z)) || !L.roomAt(cellOf(c.pts[c.pts.length - 1].x), cellOf(c.pts[c.pts.length - 1].z));
    let run = [];
    for (const p of c.pts) {
      const ok = L.isCorridor(cellOf(p.x), cellOf(p.z)) && !(branch && inOther(p));
      if (ok) run.push(p);
      else if (run.length) { runs.push({ corridor: c.id, pts: run }); run = []; }
    }
    if (run.length) runs.push({ corridor: c.id, pts: run });
  }
  return runs.filter((r) => r.pts[r.pts.length - 1].s - r.pts[0].s > 0.5);
}

// Points every `step` metres along a run, pushed sideways by `offset` (left of travel).
function along(run, step, offset = 0) {
  const out = [];
  let next = run.pts[0].s;
  for (const p of run.pts) {
    if (p.s + 1e-6 < next) continue;
    next = p.s + step;
    out.push({ x: p.x - p.tz * offset, z: p.z + p.tx * offset, tx: p.tx, tz: p.tz, s: p.s, r: p.r });
  }
  const last = run.pts[run.pts.length - 1];
  if (out.length && last.s - out[out.length - 1].s > step * 0.4) out.push({ x: last.x - last.tz * offset, z: last.z + last.tx * offset, tx: last.tx, tz: last.tz, s: last.s, r: last.r });
  return out;
}

export function planDecor(layout, seed = 1234) {
  const rand = seeded(seed);
  const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const L = layout;
  const runs = corridorRuns(L);
  const yawOf = (p) => Math.atan2(-p.tz, p.tx); // turn about Y so a part's length runs along the corridor
  const cellAt = (p) => [cellOf(p.x), cellOf(p.z)];
  const nextToDoor = (x, z) => DIRS.some(([dx, dz]) => L.isDoor(x + dx, z + dz));

  // Pipes: two lines following every corridor, near the ceiling. They stop short of doors (which
  // slide up into the ceiling) with a flange, and get a joint wherever they bend.
  const pipes = [], flanges = [], brackets = [], joints = [];
  const pipePoints = { copper: [], green: [] };
  for (const run of runs) {
    for (const line of DECOR.pipes) {
      const pts = along(run, 0.5, line.offset);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = { x: pts[i].x, y: line.y, z: pts[i].z }, b = { x: pts[i + 1].x, y: line.y, z: pts[i + 1].z };
        pipes.push({ a, b, r: line.r, kind: line.kind, cell: cellAt(a), corridor: run.corridor });
        if (i > 0) {
          const turn = Math.abs(Math.atan2(pts[i].tx * pts[i - 1].tz - pts[i].tz * pts[i - 1].tx, pts[i].tx * pts[i - 1].tx + pts[i].tz * pts[i - 1].tz));
          if (turn > 0.12) joints.push({ ...a, r: line.r });
        }
      }
      for (const [p, sign] of [[pts[0], -1], [pts[pts.length - 1], 1]]) {
        flanges.push({ x: p.x, y: line.y, z: p.z, dir: { x: p.tx * sign, y: 0, z: p.tz * sign }, r: line.r });
      }
      for (const p of along(run, 2, line.offset).slice(1, -1)) brackets.push({ x: p.x, y: line.y, z: p.z, len: WALL_H - line.y });
      pipePoints[line.kind].push(...pts.map((p) => ({ ...p, run })));
    }
  }

  // Rooms: one run along a wall with no door, near the ceiling, between any cut-off corners,
  // with a riser coming up from the floor at its start.
  const risers = [];
  for (const room of L.rooms) {
    if (room.safe) continue;
    const sides = shuffle([
      { side: 'n', cells: range(room.x, room.w).map((x) => [x, room.y - 1]) },
      { side: 's', cells: range(room.x, room.w).map((x) => [x, room.y + room.h]) },
      { side: 'w', cells: range(room.y, room.h).map((z) => [room.x - 1, z]) },
      { side: 'e', cells: range(room.y, room.h).map((z) => [room.x + room.w, z]) },
    ]).filter((s) => !s.cells.some(([x, z]) => L.isDoor(x, z) || L.isFloor(x, z)))
      .filter((s) => !(room.id === EMBLEM.room && s.side === EMBLEM.side)); // keep the emblem's wall bare
    if (!sides.length) continue;
    const runsHere = room.id === 'generator' ? [DECOR.roomPipe, { ...DECOR.roomPipe, y: 2.42, inset: 0.5, r: 0.1 }] : [DECOR.roomPipe];
    const s = sides[0];
    const end = (room.chamfer ?? 0) * TILE + (room.chamfer ? 0.35 : 0.1); // keep clear of an octagon's angled corners
    for (const p of runsHere) {
      const x0 = room.x * TILE, x1 = (room.x + room.w) * TILE, z0 = room.y * TILE, z1 = (room.y + room.h) * TILE;
      let a, b;
      if (s.side === 'n' || s.side === 's') {
        const z = s.side === 'n' ? z0 + p.inset : z1 - p.inset;
        a = { x: x0 + end, y: p.y, z }; b = { x: x1 - end, y: p.y, z };
      } else {
        const x = s.side === 'w' ? x0 + p.inset : x1 - p.inset;
        a = { x, y: p.y, z: z0 + end }; b = { x, y: p.y, z: z1 - end };
      }
      pipes.push({ a, b, r: p.r, kind: p === DECOR.roomPipe ? 'copper' : 'green', room: room.id, cell: cellAt(a) });
      if (p === DECOR.roomPipe) {
        risers.push({ a: { x: a.x, y: 0, z: a.z }, b: { x: a.x, y: p.y, z: a.z }, r: p.r, kind: 'copper', room: room.id, cell: cellAt(a) });
        flanges.push({ x: a.x, y: 0.04, z: a.z, dir: { x: 0, y: 1, z: 0 }, r: p.r });
        joints.push({ ...a, r: p.r });
      }
      for (let t = 0.2; t < 1; t += 0.3) brackets.push({ x: a.x + (b.x - a.x) * t, y: p.y, z: a.z + (b.z - a.z) * t, len: WALL_H - p.y });
    }
  }

  // Broken ceiling lights along corridors, spread apart. A couple are dying rather than dead.
  const lights = [];
  const lightSpots = shuffle(runs.flatMap((run) => along(run, 1).slice(1, -1)));
  for (const p of lightSpots) {
    if (lights.length >= DECOR.brokenLights) break;
    if (lights.some((l) => Math.hypot(l.x - p.x, l.z - p.z) < DECOR.lightSpacing * TILE)) continue;
    lights.push({ x: p.x, y: WALL_H - 0.06, z: p.z, yaw: yawOf(p), cell: cellAt(p), dying: lights.length < DECOR.dyingLights });
  }

  // Faults: steam, drips and clanks on the copper line; sparks from junction boxes on corridor walls.
  const faults = [];
  const line = DECOR.pipes[0];
  const faultSpots = shuffle(pipePoints.copper.filter((p) => p.s - p.run.pts[0].s > 1 && p.run.pts[p.run.pts.length - 1].s - p.s > 1));
  const usedFault = [];
  for (const kind of ['steam', 'drip', 'clank']) {
    for (let i = 0; i < DECOR.faults[kind] && faultSpots.length; ) {
      const p = faultSpots.pop();
      if (usedFault.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 4)) continue;
      usedFault.push(p);
      faults.push({ kind, x: p.x, y: line.y - line.r, z: p.z, cell: cellAt(p) });
      i++;
    }
  }

  // Spots on the walls (from the traced outline), every metre, clear of doors and of the middle of
  // each room wall (posters, the wall map and the emblem hang there).
  const wallMids = L.rooms.flatMap((r) => [
    [(r.x + r.w / 2) * TILE, r.y * TILE], [(r.x + r.w / 2) * TILE, (r.y + r.h) * TILE],
    [r.x * TILE, (r.y + r.h / 2) * TILE], [(r.x + r.w) * TILE, (r.y + r.h / 2) * TILE],
  ]);
  // Also keep clear of anything standing against or hung on a wall.
  const occupied = [
    ...L.furniture.filter((f) => f.solid).map((f) => furniturePlacement(L, f)),
    ...signPlacements(L), ...windowPlacements(L),
  ];
  const spots = [];
  for (const seg of wallSegments(L.shape)) {
    if (seg.len < 1) continue;
    const n = Math.floor((seg.len - 0.7) / 1) + 1;
    for (let k = 0; k < n; k++) {
      const t = (0.35 + k + (seg.len - 0.7 - (n - 1)) / 2) / seg.len;
      const x = seg.ax + (seg.bx - seg.ax) * t, z = seg.az + (seg.bz - seg.az) * t;
      const inside = cellAt({ x: x + seg.nx * 0.5, z: z + seg.nz * 0.5 });
      if (!L.isFloor(...inside) || L.isDoor(...inside) || nextToDoor(...inside)) continue;
      if (wallMids.some(([mx, mz]) => Math.hypot(mx - x, mz - z) < 1.2)) continue;
      if (occupied.some((o) => Math.hypot(o.x - x, o.z - z) < 1.3)) continue;
      const room = L.roomAt(...inside);
      spots.push({ x, z, nx: seg.nx, nz: seg.nz, rot: Math.atan2(seg.nx, seg.nz), cell: inside, corridor: L.isCorridor(...inside) && !room });
    }
  }
  // Each spot is used once: `take` hands out the next free one from a shuffled list.
  const at = (sp, y, inset) => ({ x: sp.x + sp.nx * inset, y, z: sp.z + sp.nz * inset, rot: sp.rot, cell: sp.cell, along: 0 });
  const taken = new Set();
  const take = (list) => { while (list.length) { const sp = list.pop(); if (!taken.has(sp)) { taken.add(sp); return sp; } } return null; };
  const corridorSpots = shuffle(spots.filter((sp) => sp.corridor));
  for (let i = 0; i < DECOR.faults.spark; i++) {
    const sp = take(corridorSpots);
    if (sp) faults.push({ kind: 'spark', ...at(sp, 1.75, 0.08) });
  }
  // Boarded-up sections go on corridor walls.
  const boards = [];
  for (let i = 0; i < DECOR.boards; i++) {
    const sp = take(corridorSpots);
    if (sp) boards.push({ ...at(sp, 1.1, 0.06), planks: 3 + Math.floor(rand() * 2), angle: (rand() - 0.5) * 0.25 });
  }

  // Patchwork on any wall: plates and hazard tape.
  const wallSpots = shuffle(spots.slice());
  const plates = [], tape = [];
  for (let i = 0; i < DECOR.plates; i++) {
    const sp = take(wallSpots);
    if (!sp) break;
    const w = 0.35 + rand() * 0.55, h = 0.3 + rand() * 0.6;
    plates.push({ ...at(sp, 0.35 + h / 2 + rand() * (1.9 - h), 0.012 + (i % 3) * 0.002), w, h, variant: i % 4, tilt: (rand() - 0.5) * 0.12 });
  }
  for (let i = 0; i < DECOR.tape; i++) {
    const sp = take(wallSpots);
    if (!sp) break;
    tape.push({ ...at(sp, 0.8 + rand() * 1.2, 0.01), len: 0.6 + rand() * 0.6, angle: (rand() - 0.5) * 1.2 });
  }

  // Cables sagging below the high green pipe, on fairly straight 4 m stretches.
  const cables = [];
  const high = DECOR.pipes[1];
  for (const p of shuffle(pipePoints.green.slice())) {
    if (cables.length >= DECOR.cables) break;
    const q = pipePoints.green.find((o) => o.run === p.run && Math.abs(o.s - p.s - 4) < 0.3);
    if (!q || p.tx * q.tx + p.tz * q.tz < 0.97) continue;
    if (cables.some((c) => Math.hypot(c.a.x - p.x, c.a.z - p.z) < 4)) continue;
    const sag = 0.2 + rand() * 0.18; // lowest point stays above overheadMin
    cables.push({ a: { x: p.x, y: high.y - 0.04, z: p.z }, b: { x: q.x, y: high.y - 0.04, z: q.z }, sag, cell: cellAt(p) });
  }

  // Grates every couple of metres along some corridors, hanging ceiling panels in a few rooms.
  const grates = runs.flatMap((run) => along(run, 2).slice(1, -1))
    .filter(() => rand() < DECOR.gratesChance)
    .map((p) => ({ x: p.x, z: p.z, yaw: yawOf(p), cell: cellAt(p) }));
  const panels = [];
  const roomCells = [];
  for (let z = 0; z < L.h; z++) for (let x = 0; x < L.w; x++) if (L.isOpen(x, z) && L.roomAt(x, z) && !L.roomAt(x, z).safe && !L.isDoor(x, z)) roomCells.push([x, z]);
  for (const [x, z] of shuffle(roomCells.slice())) {
    if (panels.length >= DECOR.panels) break;
    if (panels.some((p) => L.roomAt(...p.cell) === L.roomAt(x, z))) continue;
    panels.push({ x: cellCenter(x), z: cellCenter(z), cell: [x, z], size: 1.2, tilt: 0.42, rot: Math.floor(rand() * 4) * Math.PI / 2 });
  }

  // Barrels and debris tucked into room corners, away from doors and props (octagons have no corners).
  const clutter = [];
  for (const room of L.rooms) {
    if (room.safe) continue;
    for (const [x, z] of [[room.x, room.y], [room.x + room.w - 1, room.y], [room.x, room.y + room.h - 1], [room.x + room.w - 1, room.y + room.h - 1]]) {
      if (!L.isOpen(x, z) || nextToDoor(x, z) || rand() > DECOR.clutterChance) continue;
      const sx = x === room.x ? -1 : 1, sz = z === room.y ? -1 : 1; // which corner walls
      clutter.push({ kind: rand() < 0.65 ? 'barrel' : 'debris', x: cellCenter(x) + sx * 0.55, z: cellCenter(z) + sz * 0.55, cell: [x, z], spin: rand() * Math.PI * 2, tipped: rand() < 0.2 });
    }
  }

  return { pipes: [...pipes, ...risers], risers, joints, flanges, brackets, lights, faults, plates, tape, boards, cables, grates, panels, clutter };
}

function range(start, n) { return Array.from({ length: n }, (_, i) => start + i); }
