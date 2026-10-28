// Plant life spread through the station (after the "Botanical Haven" and "Botanical Station
// Reclaimed by Nature" sheets): long planters against corridor walls with roots spilling out of
// them, vines trailing from the ceiling pipes, and two corridors taken over by thick roots that
// crawl along the floor, climb the walls, arch over the ceiling beams and frame the doors. Mostly
// green; some of it yellowing and dying. Plain data from the layout and the decor plan
// (js/decorplan.js), so it's testable in Node. js/babylon/garden.js builds it, and js/modelplan.js
// puts the plant models in the planters and along the reclaimed corridors.
import { WALL_H, TILE, cellOf, cellCenter } from './layout.js';
import { corridorRuns, along, GRATE_CLEAR } from './decorplan.js';
import { wallAlong, signPlacements, posterPlacements, doorFrames, FRAME } from './worldplan.js';
import { grateSpots } from './vents.js';
import { seeded } from './textures.js';

export const GARDEN = {
  planters: 5,
  planter: { len: 1.3, depth: 0.34, h: 0.5 },
  spacing: 7,          // metres between planters
  minPassage: 1.45,    // corridor width left beside a planter
  vineMinY: 2.0,       // vines hanging over the walkway stop this high (you walk under them)
  hangClusters: 7,     // extra clumps of trailing vines on pipes away from the planters
  dryShare: 0.25,      // share of planters that are dying
  seg: 0.32,           // vine cards are this tall; a strand is a stack of them
  // The corridors nature has taken back (the two longest straight-ish runs with ceiling beams).
  reclaimed: ['north-west', 'comms-pod'],
  floorRootMaxY: 0.1,  // roots across the walkway lie this low: you step over them
  clumpSpacing: 3,     // metres between the leafy clumps along a reclaimed corridor's walls
};
// Corridors to the safe rooms and the secret bay stay bare.
const NO_GARDEN = new Set(['wellness', 'quiet', 'cryo']);
// What grows in the planters: [model, variant, scale] (models in js/modelplan.js).
const PLANTER_PLANTS = [
  ['fern', 'b', 0.85], ['anthurium', 'c', 1.1], ['fern', 'c', 0.9], ['calathea', 'b', 1.2],
  ['fern', 'a', 1.1], ['anthurium', 'e', 1.5], ['calathea', 'c', 1.2], ['fern', 'd', 1.2], ['anthurium', 'f', 1.5],
];

export function planGarden(L, plan, seed = 77) {
  const rand = seeded(seed);
  const { len, depth, h } = GARDEN.planter;
  const grates = grateSpots(L);
  // Anything already on a corridor wall: the planter and its vines keep clear of it.
  const wallItems = [...plan.boards, ...plan.stencils, ...plan.tape, ...plan.plates, ...plan.sconces, ...plan.vents,
    ...plan.faults.filter((f) => f.kind === 'spark'), ...signPlacements(L), ...posterPlacements(L)];

  // Candidate spots: straight stretches of corridor wall between the ribs.
  const cands = [];
  for (const run of corridorRuns(L)) {
    if (NO_GARDEN.has(run.corridor)) continue;
    for (const p of along(run, 0.25).slice(4, -4)) {
      const lx = -p.tz, lz = p.tx;
      for (const side of [1, -1]) {
        const nx = lx * side, nz = lz * side; // toward this wall
        const d = wallAlong(L, p.x, p.z, nx, nz, p.r + 0.6);
        if (d == null) continue;
        const ends = [-1, 1].map((e) => wallAlong(L, p.x + p.tx * e * len / 2, p.z + p.tz * e * len / 2, nx, nz, p.r + 0.6));
        if (ends.some((e) => e == null || Math.abs(e - d) > 0.03)) continue; // a curve or a corner
        const other = wallAlong(L, p.x, p.z, -nx, -nz, p.r + 0.6);
        if (other == null || d + other - depth - 0.03 < GARDEN.minPassage) continue;
        const wx = p.x + nx * d, wz = p.z + nz * d;
        const x = wx - nx * (depth / 2 + 0.03), z = wz - nz * (depth / 2 + 0.03);
        if (L.doors.some((dr) => Math.hypot(cellCenter(dr.cx) - x, cellCenter(dr.cz) - z) < 2.4)) continue;
        if (plan.ribs.some((r) => [r.a, r.b].some((q) => Math.hypot(q.x - wx, q.z - wz) < len / 2 + 0.22))) continue;
        if (grates.some((g) => Math.hypot(g.x - x, g.z - z) < GRATE_CLEAR.floor + len / 2)) continue;
        if (wallItems.some((o) => Math.hypot(o.x - wx, o.z - wz) < len / 2 + 0.45)) continue;
        if (L.roomAt(cellOf(x), cellOf(z))) continue;
        cands.push({ x, z, wx, wz, nx: -nx, nz: -nz, tx: p.tx, tz: p.tz, yaw: Math.atan2(-nx, -nz), len, depth, h, corridor: run.corridor, cell: [cellOf(x), cellOf(z)] });
      }
    }
  }

  // Spread them out: one per corridor first, then fill up, never closer than `spacing`.
  const shuffled = cands.map((c) => [rand(), c]).sort((a, b) => a[0] - b[0]).map(([, c]) => c);
  const planters = [];
  const fits = (c) => planters.every((q) => Math.hypot(q.x - c.x, q.z - c.z) >= GARDEN.spacing);
  for (const c of shuffled) if (planters.length < GARDEN.planters && !planters.some((q) => q.corridor === c.corridor) && fits(c)) planters.push(c);
  for (const c of shuffled) if (planters.length < GARDEN.planters && !planters.includes(c) && fits(c)) planters.push(c);
  planters.forEach((pl, i) => {
    pl.id = 'planter' + i;
    pl.dry = rand() < GARDEN.dryShare;
    // Two or three plants along it.
    const spots = rand() < 0.5 ? [-0.36, 0.34] : [-0.42, 0.02, 0.43];
    pl.plants = spots.map((t, k) => {
      const [model, variant, scale] = PLANTER_PLANTS[(i * 3 + k) % PLANTER_PLANTS.length];
      return {
        model, variant, scale: scale * (0.9 + rand() * 0.2),
        x: pl.x + pl.tx * t, y: h - 0.03, z: pl.z + pl.tz * t, yaw: rand() * Math.PI * 2,
        wilt: pl.dry ? 0.55 + rand() * 0.4 : 0,
      };
    });
  });

  // Vines. Each strand: { x, z, top, bottom, yaw, mode: 'hang', dry }, trailing from a pipe.
  const vines = [];
  const dryOf = (dying) => rand() < (dying ? 0.6 : 0.15);
  // Trailing from the corridor's copper pipe near each planter, and in a few clumps elsewhere.
  const pipeHangs = plan.pipes.filter((p) => p.kind === 'copper' && p.a.y > 1 && p.b.y > 1 && Math.abs(p.a.y - p.b.y) < 0.01)
    .filter((p) => (p.corridor ? !NO_GARDEN.has(p.corridor) : p.room && !L.room(p.room)?.safe));
  const pointsOn = (pipe) => {
    const out = [], l = Math.hypot(pipe.b.x - pipe.a.x, pipe.b.z - pipe.a.z);
    for (let s = 0; s <= l; s += 0.2) out.push({ x: pipe.a.x + (pipe.b.x - pipe.a.x) * s / l, z: pipe.a.z + (pipe.b.z - pipe.a.z) * s / l, y: pipe.a.y - pipe.r, pipe });
    return out;
  };
  // The mouths of the corridors to the safe rooms stay bare too, where they branch off ours.
  const safeCorridors = L.corridors.filter((c) => NO_GARDEN.has(c.id));
  const inSafe = (p) => safeCorridors.some((c) => c.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.2));
  const pipePts = pipeHangs.flatMap(pointsOn).filter((q) => !inSafe(q) && !L.doors.some((dr) => Math.hypot(cellCenter(dr.cx) - q.x, cellCenter(dr.cz) - q.z) < 1.8));
  const clump = (centre, dying, spread, count) => {
    for (const q of pipePts) {
      if (Math.hypot(q.x - centre.x, q.z - centre.z) > spread || rand() > count / (spread * 10)) continue;
      const drop = 0.18 + rand() * Math.max(0, q.y - GARDEN.vineMinY - 0.18);
      vines.push({ x: q.x, z: q.z, top: q.y, bottom: q.y - drop, yaw: rand() * Math.PI, mode: 'hang', dry: dryOf(dying) });
    }
  };
  for (const pl of planters) clump({ x: pl.x, z: pl.z }, pl.dry, 1.6, 6);
  const centres = pipePts.map((q) => [rand(), q]).sort((a, b) => a[0] - b[0]).map(([, q]) => q);
  const used = planters.map((pl) => ({ x: pl.x, z: pl.z }));
  for (const q of centres) {
    if (used.length >= planters.length + GARDEN.hangClusters) break;
    if (used.some((u) => Math.hypot(u.x - q.x, u.z - q.z) < 6)) continue;
    used.push(q);
    clump(q, rand() < GARDEN.dryShare, 1.2, 5);
  }

  const { roots, leaves, clumps } = planRoots(L, plan, planters, { rand, grates, wallItems, clump, inSafe });
  return { planters, vines, roots, leaves, clumps };
}

// Roots: each { pts: [{ x, y, z }], r0, r1 (radius at the start and end), kind, dry }. Leaves along
// them: { x, y, z, yaw, pitch, s, dry }. Clumps: plant models on the floor of the reclaimed corridors.
function planRoots(L, plan, planters, { rand, grates, wallItems, clump, inSafe }) {
  const roots = [], leaves = [], clumps = [];
  const wave = () => { const a = rand() * 6.28, b = rand() * 6.28, f = 0.8 + rand() * 1.2; return (s) => 0.6 * Math.sin(s * f + a) + 0.4 * Math.sin(s * f * 2.3 + b); };
  const offGrate = (p) => !inSafe(p) && !grates.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < GRATE_CLEAR.floor);
  const inDoor = (p) => L.isDoor(cellOf(p.x), cellOf(p.z));
  // Keep only the stretches of a path that are clear of grates and door cells.
  const add = (pts, r0, r1, kind, dry = false) => {
    let run = [];
    const flush = () => { if (run.length > 3) roots.push({ pts: run, r0: r0, r1: r1, kind, dry }); run = []; };
    for (const p of pts) { if (offGrate(p) && !inDoor(p) && L.walkDistance(p.x, p.z) > -0.05) run.push(p); else flush(); }
    flush();
  };
  const runs = corridorRuns(L).filter((r) => GARDEN.reclaimed.includes(r.corridor));
  for (const run of runs) {
    const pts = along(run, 0.2);
    const trim = pts.filter((p) => p.s - run.pts[0].s > 0.45 && run.pts[run.pts.length - 1].s - p.s > 0.45); // off the door frames
    const wall = (p, side) => wallAlong(L, p.x, p.z, -p.tz * side, p.tx * side, p.r + 0.6) ?? p.r;
    // Thick roots along both wall bases, weaving in and out, half sunk into the floor.
    for (const side of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const w = wave(), r0 = 0.06 + rand() * 0.07, start = Math.floor(rand() * 6), end = trim.length - Math.floor(rand() * 6);
        const path = trim.slice(start, end).map((p) => {
          const off = r0 + 0.03 + k * 0.08 + 0.09 * (w(p.s) + 1);
          const d = wall(p, side) - off;
          return { x: p.x - p.tz * side * d, y: r0 * 0.6, z: p.z + p.tx * side * d };
        });
        add(path, r0, r0 * 0.5, 'base');
      }
    }
    // A couple of roots cut across the floor from wall to wall, low enough to step over.
    for (let n = 0; n < 2 && trim.length > 12; n++) {
      const i0 = Math.floor(rand() * (trim.length - 12)), len = 8 + Math.floor(rand() * 4), w = wave();
      const path = [];
      for (let i = 0; i <= len; i++) {
        const p = trim[i0 + i], t = i / len, side = t * 2 - 1; // -1 wall .. +1 other wall
        const d = side * (Math.min(wall(p, 1), wall(p, -1)) - 0.12) + w(p.s) * 0.05;
        path.push({ x: p.x - p.tz * d, y: 0.035, z: p.z + p.tx * d });
      }
      add(path, 0.045, 0.03, 'cross');
    }
    // Up the wall beside a ceiling beam, over the ceiling, and down the far wall.
    for (const rib of plan.ribs.filter((q) => run.pts.some((t) => Math.hypot(t.x - q.x, t.z - q.z) < 0.3))) {
      if (rand() < 0.2) continue;
      if (wallItems.some((o) => Math.min(Math.hypot(o.x - rib.a.x, o.z - rib.a.z), Math.hypot(o.x - rib.b.x, o.z - rib.b.z)) < 0.6)) continue;
      const tx = Math.cos(rib.yaw), tz = -Math.sin(rib.yaw); // along the corridor
      const side = rand() < 0.5 ? -1 : 1;
      const strands = 2 + Math.floor(rand() * 2), down = rand() < 0.7;
      for (let st = 0; st < strands; st++) {
      const shift = side * (0.26 + st * 0.07);
      const w = wave(), twist = rand() * 6.28;
      const a = { x: rib.a.x + tx * shift, z: rib.a.z + tz * shift }, b = { x: rib.b.x + tx * shift, z: rib.b.z + tz * shift };
      const inA = { x: (b.x - a.x), z: (b.z - a.z) }, span = Math.hypot(inA.x, inA.z);
      inA.x /= span; inA.z /= span;
      const path = [];
      // The strands twist round each other as they climb.
      const up = (base, dir, i, n) => { const t = i / n, tw = Math.sin(t * 14 + twist) * 0.05; const out = 0.07 + 0.3 * (1 - t) ** 3 + 0.03 * w(t * 6) + Math.cos(t * 14 + twist) * 0.025; const y = 0.05 + t * (WALL_H - 0.3); return { x: base.x + dir.x * out + tx * (tw + 0.05 * w(t * 9)), y, z: base.z + dir.z * out + tz * (tw + 0.05 * w(t * 9)) }; };
      for (let i = 0; i <= 20; i++) path.push(up(a, inA, i, 20));
      for (let i = 1; i < 14; i++) { const t = i / 14; path.push({ x: a.x + inA.x * span * t + tx * (0.06 * w(t * 5) + Math.sin(t * 9 + twist) * 0.04), y: WALL_H - 0.12 - 0.1 * Math.sin(t * Math.PI) - 0.03 * Math.cos(t * 9 + twist), z: a.z + inA.z * span * t + tz * (0.06 * w(t * 5) + Math.sin(t * 9 + twist) * 0.04) }); }
      if (down) for (let i = 20; i >= 0; i--) path.push(up(b, { x: -inA.x, z: -inA.z }, i, 20));
      const r0 = st === 0 ? 0.08 + rand() * 0.03 : 0.04 + rand() * 0.03;
      add(path, r0, r0 * 0.6, 'climb');
      // Thin roots dangling from the ceiling run, ending well above your head.
      if (st === 0) {
        for (let d = 0; d < 2; d++) {
          const t = 0.25 + rand() * 0.5, top = WALL_H - 0.2, bottom = GARDEN.vineMinY + 0.1 + rand() * 0.4, dw = wave();
          const cx = a.x + inA.x * span * t, cz = a.z + inA.z * span * t, hang = [];
          for (let i = 0; i <= 6; i++) { const u = i / 6; hang.push({ x: cx + tx * 0.04 * dw(u * 4), y: top - u * (top - bottom), z: cz + tz * 0.04 * dw(u * 4) }); }
          add(hang, 0.025, 0.008, 'dangle');
        }
      }
      // Side tendrils wandering off across the wall.
      for (let k = 0; k < 2; k++) {
        const t0 = 0.15 + rand() * 0.6, i0 = Math.round(t0 * 20), start = path[i0], dir = rand() < 0.5 ? -1 : 1, tdw = wave(), tend = [start];
        for (let i = 1; i <= 12; i++) {
          const u = i / 12, q = { x: start.x + tx * dir * u * 0.8, y: start.y + tdw(u * 1.5) * 0.12 + u * 0.15, z: start.z + tz * dir * u * 0.8 };
          const d = wallAlong(L, q.x, q.z, -inA.x, -inA.z, 1.2); // snapped back onto the wall (corridors curve)
          if (d == null) break;
          tend.push({ x: q.x - inA.x * (d - 0.05), y: q.y, z: q.z - inA.z * (d - 0.05) });
        }
        add(tend, 0.025, 0.008, 'tendril');
      }
      }
    }
  }
  // Doors at the ends of the reclaimed corridors: roots climb the jambs on the corridor side and cross the header.
  for (const f of doorFrames(L)) {
    if (f.safe) continue;
    const [ax, az] = f.across;
    const px = az, pz = ax;
    const toCorridor = L.roomAt(cellOf(f.x + px * TILE), cellOf(f.z + pz * TILE)) ? -1 : 1;
    const cx = f.x + px * toCorridor * TILE, cz = f.z + pz * toCorridor * TILE;
    if (!runs.some((r) => r.pts.some((q) => Math.hypot(q.x - cx, q.z - cz) < 1.2))) continue;
    const face = FRAME.depth / 2 + 0.06; // just proud of the frame on the corridor side
    const at = (off, y) => ({ x: f.x + px * toCorridor * face + ax * off, y, z: f.z + pz * toCorridor * face + az * off });
    for (const sgn of [1, -1]) {
      if (rand() < 0.25) continue;
      const edge = sgn > 0 ? f.hi - FRAME.jamb / 2 : -(f.lo - FRAME.jamb / 2);
      const w = wave();
      const path = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; path.push(at(edge + 0.04 * w(t * 7), 0.05 + t * (WALL_H - FRAME.header / 2 - 0.05))); }
      const reach = 0.4 + rand() * 0.6; // part way along the header
      for (let i = 1; i <= 6; i++) { const t = i / 6; path.push(at(edge - sgn * reach * t * (f.lo + f.hi) / 2, WALL_H - FRAME.header / 2 - 0.05 * Math.sin(t * Math.PI))); }
      roots.push({ pts: path, r0: 0.08, r1: 0.03, kind: 'door', dry: false });
    }
  }
  // Out of every planter: roots spilling over the front onto the floor, and one or two up the wall.
  for (const pl of planters) {
    const { h, depth } = pl;
    for (let k = 0; k < 2 + Math.floor(rand() * 2); k++) {
      const t = (rand() - 0.5) * (pl.len - 0.2), along = (u) => ({ x: pl.x + pl.tx * (t + u * 0.6 * (k % 2 ? 1 : -1)), z: pl.z + pl.tz * (t + u * 0.6 * (k % 2 ? 1 : -1)) });
      const path = [];
      const step = (u, out, y) => { const a = along(u); path.push({ x: a.x + pl.nx * out, y, z: a.z + pl.nz * out }); };
      step(0, depth / 2 - 0.1, h + 0.02);
      step(0.02, depth / 2 + 0.02, h + 0.01);
      step(0.05, depth / 2 + 0.06, h * 0.6);
      step(0.1, depth / 2 + 0.12, 0.08);
      for (let i = 1; i <= 5; i++) step(0.1 + i * 0.18, depth / 2 + 0.2 + i * 0.05, 0.035);
      add(path, 0.045, 0.02, 'planter', pl.dry);
    }
    for (let k = 0; k < 1 + Math.floor(rand() * 2); k++) {
      const t = (rand() - 0.5) * (pl.len - 0.3), top = 2 + rand() * 0.6, w = wave(), path = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10, off = 0.05 + 0.02 * w(u * 5);
        path.push({ x: pl.wx + pl.tx * (t + 0.12 * w(u * 3)) + pl.nx * off, y: h + u * (top - h), z: pl.wz + pl.tz * (t + 0.12 * w(u * 3)) + pl.nz * off });
      }
      add(path, 0.05, 0.012, 'planter', pl.dry);
    }
  }
  // Leaves along every root: thick near the floor, sparse overhead. In a dying planter's roots, mostly brown.
  // Clustered, not strung along evenly: bunches at the base, the odd sprig higher up, none overhead.
  for (const r of roots) {
    if (r.kind === 'dangle' || r.kind === 'cross') continue;
    for (let i = 1; i < r.pts.length; i++) {
      const p = r.pts[i], chance = p.y < 0.5 ? 0.16 : p.y < 1.6 ? 0.05 : p.y < 2.4 ? 0.02 : 0;
      if (rand() > chance) continue;
      const n = p.y < 0.5 ? 3 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        leaves.push({ x: p.x + (rand() - 0.5) * 0.25, y: Math.max(0.01, p.y - 0.03 + (rand() - 0.5) * 0.1), z: p.z + (rand() - 0.5) * 0.25, yaw: rand() * Math.PI * 2,
          pitch: (rand() - 0.5) * 1.6, s: 0.6 + rand() * 1.1, dry: rand() < (r.dry ? 0.6 : 0.18) });
      }
    }
  }
  // Leafy clumps against the walls of the reclaimed corridors, and more vines from their pipes.
  const KINDS = [['fern', 'b', 1.3], ['anthurium', 'c', 1.4], ['fern', 'c', 1.2], ['calathea', 'b', 1.5], ['fern', 'a', 1.5], ['anthurium', 'e', 1.8], ['calathea', 'c', 1.5], ['fern', 'd', 1.6]];
  for (const run of runs) {
    let side = rand() < 0.5 ? 1 : -1;
    for (const p of along(run, GARDEN.clumpSpacing).slice(1, -1)) {
      const d = (wallAlong(L, p.x, p.z, -p.tz * side, p.tx * side, p.r + 0.6) ?? p.r) - 0.32;
      const c = { x: p.x - p.tz * side * d, z: p.z + p.tx * side * d };
      side = -side;
      if (!offGrate(c) || inDoor(c) || planters.some((pl) => Math.hypot(pl.x - c.x, pl.z - c.z) < 1.3)) continue;
      const [model, variant, scale] = KINDS[clumps.length % KINDS.length];
      clumps.push({ model, variant, scale: scale * (0.9 + rand() * 0.25), x: c.x, y: 0, z: c.z, yaw: rand() * Math.PI * 2, wilt: rand() < 0.2 ? 0.6 : 0, corridor: run.corridor });
    }
    for (const p of along(run, 3)) clump(p, false, 1.0, 4);
  }
  return { roots, leaves, clumps };
}

// Planters are solid to the player and thrown things: a box test against each one.
export function planterBlocker(planters) {
  return (x, z, r = 0) => planters.some((pl) => {
    const dx = x - pl.x, dz = z - pl.z;
    const along = Math.abs(dx * pl.tx + dz * pl.tz), across = Math.abs(dx * pl.nx + dz * pl.nz);
    return along < pl.len / 2 + r && across < pl.depth / 2 + r;
  });
}
