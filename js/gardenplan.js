// Plant life spread through the station (after the "Botanical Haven" sheet): long planters against
// corridor walls, vines climbing the wall behind them, and vines trailing from the ceiling pipes,
// overgrown in places. Mostly green; some of it yellowing and dying. Plain data from the layout and
// the decor plan (js/decorplan.js), so it's testable in Node. js/babylon/garden.js builds it, and
// js/modelplan.js puts the plant models in the planters.
import { WALL_H, cellOf, cellCenter } from './layout.js';
import { corridorRuns, along, GRATE_CLEAR } from './decorplan.js';
import { wallAlong, signPlacements, posterPlacements } from './worldplan.js';
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

  // Vines. Each strand: { x, z, top, bottom, yaw, mode: 'wall' (flat on a wall) | 'hang' (from a pipe), dry }.
  const vines = [];
  const dryOf = (dying) => rand() < (dying ? 0.6 : 0.15);
  for (const pl of planters) {
    // Climbing the wall behind the planter, from the ceiling down, some reaching into the soil.
    const n = 8 + Math.floor(rand() * 4);
    for (let k = 0; k < n; k++) {
      const t = (k / (n - 1) - 0.5) * (len + 0.1) + (rand() - 0.5) * 0.12;
      const off = 0.025 + k * 0.004; // stacked a hair apart so they never flicker into each other
      vines.push({ x: pl.wx + pl.tx * t + pl.nx * off, z: pl.wz + pl.tz * t + pl.nz * off, top: WALL_H - 0.02,
        bottom: rand() < 0.45 ? h - 0.08 : h + 0.3 + rand() * 1.2, yaw: pl.yaw, mode: 'wall', dry: dryOf(pl.dry), planter: pl.id });
    }
  }
  // Trailing from the corridor's copper pipe near each planter, and in a few clumps elsewhere.
  const pipeHangs = plan.pipes.filter((p) => p.kind === 'copper' && p.a.y > 1 && p.b.y > 1 && Math.abs(p.a.y - p.b.y) < 0.01)
    .filter((p) => (p.corridor ? !NO_GARDEN.has(p.corridor) : p.room && !L.room(p.room)?.safe));
  const pointsOn = (pipe) => {
    const out = [], l = Math.hypot(pipe.b.x - pipe.a.x, pipe.b.z - pipe.a.z);
    for (let s = 0; s <= l; s += 0.2) out.push({ x: pipe.a.x + (pipe.b.x - pipe.a.x) * s / l, z: pipe.a.z + (pipe.b.z - pipe.a.z) * s / l, y: pipe.a.y - pipe.r, pipe });
    return out;
  };
  const pipePts = pipeHangs.flatMap(pointsOn).filter((q) => !L.doors.some((dr) => Math.hypot(cellCenter(dr.cx) - q.x, cellCenter(dr.cz) - q.z) < 1.8));
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
  return { planters, vines };
}

// Planters are solid to the player and thrown things: a box test against each one.
export function planterBlocker(planters) {
  return (x, z, r = 0) => planters.some((pl) => {
    const dx = x - pl.x, dz = z - pl.z;
    const along = Math.abs(dx * pl.tx + dz * pl.tz), across = Math.abs(dx * pl.nx + dz * pl.nz);
    return along < pl.len / 2 + r && across < pl.depth / 2 + r;
  });
}
