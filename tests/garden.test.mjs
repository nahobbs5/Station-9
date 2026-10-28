// Plant life (Botanical Haven sheet): pots, grow racks, the tomato chamber, the seedling bench,
// corridor planters and vines (js/gardenplan.js, js/modelplan.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildLayout, cellOf, cellCenter, TILE } from '../js/layout.js';
import { planDecor, GRATE_CLEAR } from '../js/decorplan.js';
import { planGarden, planterBlocker, GARDEN } from '../js/gardenplan.js';
import { modelPlacements, MODELS, modelUrl } from '../js/modelplan.js';
import { furniturePlacement, FURNITURE_DEPTH } from '../js/worldplan.js';
import { grateSpots } from '../js/vents.js';
import { CREDITS } from '../js/credits.js';

const layout = buildLayout();
const plan = planDecor(layout);
const garden = planGarden(layout, plan);
const roomAtPoint = (x, z) => layout.roomAt(cellOf(x), cellOf(z));
const GARDEN_KINDS = ['plant', 'growRack', 'growChamber', 'pottingBench'];

test('garden: nothing grows in the safe rooms, the secret bay or the corridors to them', () => {
  for (const f of layout.furniture.filter((q) => GARDEN_KINDS.includes(q.kind))) {
    assert.ok(!layout.room(f.room).safe, `${f.kind} in ${f.room}`);
  }
  for (const p of [...garden.planters, ...garden.vines]) {
    const room = roomAtPoint(p.x, p.z);
    assert.ok(!room?.safe, `garden piece at ${p.x.toFixed(1)},${p.z.toFixed(1)} in ${room?.id}`);
    for (const id of ['wellness', 'quiet', 'cryo']) {
      const c = layout.corridors.find((q) => q.id === id);
      assert.ok(!c.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r - 0.1), `not in the ${id} corridor`);
    }
  }
  for (const m of modelPlacements(layout, plan).filter((q) => MODELS[q.model].plant)) {
    assert.ok(!roomAtPoint(m.x, m.z)?.safe, `${m.model} not in a safe room`);
  }
});

test('garden: the new furniture has a depth, stands in its room and keeps clear of vent grates', () => {
  const grates = grateSpots(layout);
  for (const f of layout.furniture.filter((q) => GARDEN_KINDS.includes(q.kind))) {
    assert.ok(FURNITURE_DEPTH[f.kind], `${f.kind} has a depth`);
    const at = furniturePlacement(layout, f);
    assert.equal(roomAtPoint(at.x, at.z)?.id, f.room, `${f.kind} inside ${f.room}`);
    for (const g of grates) assert.ok(Math.hypot(g.x - at.x, g.z - at.z) > 1.1, `${f.kind} clear of grate ${g.id}`);
  }
  assert.equal(layout.furniture.filter((f) => f.kind === 'growRack').length, 2);
  assert.equal(layout.furniture.filter((f) => f.kind === 'growChamber').length, 1);
  assert.equal(layout.furniture.filter((f) => f.kind === 'pottingBench').length, 1);
});

test('garden: vines only trail from pipes, and stay above head height', () => {
  assert.ok(garden.vines.length > 40, 'plenty of vines');
  assert.ok(garden.vines.some((v) => v.dry) && garden.vines.some((v) => !v.dry), 'some green, some dying');
  for (const v of garden.vines) {
    assert.equal(v.mode, 'hang', 'no flat ivy on the walls');
    assert.ok(v.top > v.bottom, 'hangs down');
    assert.ok(v.bottom >= GARDEN.vineMinY - 1e-9, `hanging vine ends at ${v.bottom.toFixed(2)} m`);
  }
});

test('garden: roots take over the reclaimed corridors and spill out of the planters', () => {
  const near = (p, list, d) => list.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < d);
  const reclaimed = layout.corridors.filter((c) => GARDEN.reclaimed.includes(c.id));
  assert.equal(reclaimed.length, 2);
  for (const c of reclaimed) {
    const inIt = (p) => c.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r + 0.4);
    for (const kind of ['base', 'climb']) assert.ok(garden.roots.some((r) => r.kind === kind && r.pts.some(inIt)), `${c.id} has ${kind} roots`);
    assert.ok(garden.clumps.some((cl) => cl.corridor === c.id), `${c.id} has leafy clumps`);
  }
  assert.ok(garden.roots.some((r) => r.kind === 'door'), 'roots frame the doors');
  for (const pl of garden.planters) assert.ok(garden.roots.some((r) => r.kind === 'planter' && near(r.pts[0], [pl], 1)), `${pl.id} has roots`);
  assert.ok(garden.leaves.length > 200, 'leaves along the roots');
  const grates = grateSpots(layout);
  const safeCorridors = layout.corridors.filter((c) => ['wellness', 'quiet', 'cryo'].includes(c.id));
  for (const r of garden.roots) {
    assert.ok(r.r0 > 0 && r.r1 > 0 && r.pts.length > 3);
    for (const p of r.pts) {
      assert.ok(layout.walkDistance(p.x, p.z) >= -0.06, `root inside the station (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
      assert.ok(p.y >= 0 && p.y < 3, 'between floor and ceiling');
      assert.ok(!layout.isDoor(cellOf(p.x), cellOf(p.z)) || r.kind === 'door', 'not in a doorway');
      assert.ok(!roomAtPoint(p.x, p.z)?.safe, 'not in a safe room');
      assert.ok(!safeCorridors.some((c) => c.pts.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < q.r - 0.1)), 'not in a safe corridor');
      if (r.kind !== 'door') assert.ok(!near(p, grates, GRATE_CLEAR.floor), 'clear of grates');
    }
    // Out in the walkway (more than half a metre from a wall), a root lies low enough to step over.
    for (const p of r.pts) if (layout.walkDistance(p.x, p.z) > 0.5 && p.y < 2) assert.ok(p.y <= GARDEN.floorRootMaxY, `root at ${p.y.toFixed(2)} m in the walkway`);
  }
});

test('garden: door roots stay on the frame, outside the opening the door slides through', async () => {
  const { doorFrames, FRAME } = await import('../js/worldplan.js');
  for (const r of garden.roots.filter((q) => q.kind === 'door')) {
    for (const p of r.pts) {
      const f = doorFrames(layout).reduce((a, b) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? b : a));
      const across = (p.x - f.x) * f.across[0] + (p.z - f.z) * f.across[1];
      const through = Math.abs((p.x - f.x) * f.across[1] + (p.z - f.z) * f.across[0]);
      assert.ok(through >= FRAME.depth / 2, 'in front of the frame, not inside it');
      if (p.y < 2.5) assert.ok(across >= f.hi - FRAME.jamb - 0.01 || across <= -(f.lo - FRAME.jamb) + 0.01, 'up a jamb, not across the opening');
    }
  }
});

test('garden: planters stand against corridor walls, leave room to pass and keep off grates and doors', () => {
  assert.equal(garden.planters.length, GARDEN.planters);
  assert.ok(new Set(garden.planters.map((p) => p.corridor)).size >= 4, 'spread over several corridors');
  const grates = grateSpots(layout);
  for (const pl of garden.planters) {
    assert.ok(!roomAtPoint(pl.x, pl.z), 'in a corridor');
    // Its back is at the wall; the corridor in front stays open for the passage width.
    assert.ok(layout.walkDistance(pl.x - pl.nx * (pl.depth / 2 + 0.06), pl.z - pl.nz * (pl.depth / 2 + 0.06)) < 0.02, 'backs onto the wall');
    for (const t of [-0.5, 0, 0.5]) {
      const fx = pl.x + pl.tx * t * pl.len + pl.nx * (pl.depth / 2), fz = pl.z + pl.tz * t * pl.len + pl.nz * (pl.depth / 2);
      let open = 0;
      while (layout.walkDistance(fx + pl.nx * (open + 0.01), fz + pl.nz * (open + 0.01)) > 0 && open < 4) open += 0.01;
      assert.ok(open >= GARDEN.minPassage - 0.05, `passage beside ${pl.id}: ${open.toFixed(2)} m`);
    }
    for (const g of grates) assert.ok(Math.hypot(g.x - pl.x, g.z - pl.z) >= GRATE_CLEAR.floor, `${pl.id} off grate ${g.id}`);
    for (const d of layout.doors) assert.ok(Math.hypot(cellCenter(d.cx) - pl.x, cellCenter(d.cz) - pl.z) >= TILE, `${pl.id} clear of doors`);
    assert.ok(pl.plants.length >= 2, 'has plants');
  }
  for (const a of garden.planters) for (const b of garden.planters) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= GARDEN.spacing);
});

test('garden: planters block the player, the corridor beside them does not', () => {
  const blocked = planterBlocker(garden.planters);
  for (const pl of garden.planters) {
    assert.ok(blocked(pl.x, pl.z, 0.3), 'its middle');
    assert.ok(blocked(pl.x + pl.nx * (pl.depth / 2 + 0.2), pl.z + pl.nz * (pl.depth / 2 + 0.2), 0.3), 'brushing its front');
    assert.ok(!blocked(pl.x + pl.nx * (pl.depth / 2 + 0.5), pl.z + pl.nz * (pl.depth / 2 + 0.5), 0.3), 'half a metre out');
  }
});

test('garden: every plant model, variant and credit exists; each pot has its plant', () => {
  const placements = modelPlacements(layout, plan);
  const nodes = (key) => JSON.parse(readFileSync(new URL('../' + modelUrl(key), import.meta.url))).nodes.map((n) => n.name);
  for (const [key, def] of Object.entries(MODELS).filter(([, d]) => d.plant)) {
    assert.ok(existsSync(new URL('../' + modelUrl(key), import.meta.url)), `${key} glTF`);
    assert.ok(CREDITS.some((c) => c.file === modelUrl(key)), `${key} is credited`);
    for (const p of placements.filter((q) => q.model === key && q.variant)) {
      assert.equal(nodes(key).filter((n) => n.endsWith('_' + p.variant)).length, 1, `${key} variant ${p.variant}`);
    }
    assert.ok(def.dir, 'has a folder');
  }
  for (const f of layout.furniture.filter((q) => q.kind === 'plant')) {
    assert.ok(MODELS[f.model]?.plant, `pot in ${f.room} names a plant model`);
    assert.ok(placements.some((p) => p.replaces === 'plant-' + f.model), `pot in ${f.room} gets its plant`);
  }
  const plants = placements.filter((q) => MODELS[q.model].plant);
  assert.ok(plants.some((p) => p.wilt > 0) && plants.filter((p) => !p.wilt).length > plants.length / 2, 'mostly lush, some dying');
});
