// The field-guide apparitions (js/apparitions.js): where each one shows, the shared queue, and the
// rule that nothing ever appears in a safe room.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, cellOf, cellCenter } from '../js/layout.js';
import { inSuite } from '../js/suiteplan.js';
import { grateSpots } from '../js/vents.js';
import { cameoSurfaces } from '../js/hatman.js';
import { APPARITION, KINDS, KIND_IDS, Apparitions, floorSpots, pickSpot } from '../js/apparitions.js';

const layout = buildLayout();
const grates = grateSpots(layout);
const surfaces = cameoSurfaces(layout);

// A seeded random, so failures repeat.
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function fakeFigure() {
  const f = { shown: null, poses: 0, show(id) { f.shown = id; }, pose() { f.poses++; }, hide() { f.shown = null; } };
  return f;
}

const make = (opts = {}) => {
  const fig = fakeFigure();
  const a = new Apparitions(fig, layout, { grates, surfaces, rand: seeded(7), ...opts });
  return { a, fig };
};

const safeAt = (p) => layout.isSafe(cellOf(p.x), cellOf(p.z)) || inSuite(layout, p) !== null;
const floor = floorSpots(layout);
const dirs = [{ x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 }, { x: 0.7, y: 0, z: 0.7 }, { x: -0.7, y: 0, z: 0.7 }, { x: 0.7, y: 0, z: -0.7 }, { x: -0.7, y: 0, z: -0.7 }];

// Every standing spot x every direction: what each kind would pick.
function* everywhere() {
  for (const s of floor) for (const f of dirs) yield { player: { x: s.x, z: s.z }, forward: f, room: s.room };
}

test('apparitions: nine kinds, each with art', async () => {
  const fs = await import('node:fs');
  assert.equal(KIND_IDS.length, 9);
  for (const id of KIND_IDS) assert.ok(fs.existsSync(new URL(`../assets/apparitions/${id}.png`, import.meta.url)), id);
});

test('apparitions: standing spots are open floor, never in a safe room or its doorway', () => {
  assert.ok(floor.length > 100);
  for (const s of floor) {
    assert.ok(!safeAt(s), `${s.x},${s.z} is in a safe room`);
    assert.ok(layout.isOpen(cellOf(s.x), cellOf(s.z)));
  }
});

test('apparitions: nothing is ever placed in the Wellness or Quiet Room', () => {
  const { a } = make();
  let found = 0;
  for (const ctx of everywhere()) for (const id of KIND_IDS) {
    const p = a.find(id, ctx);
    if (!p) continue;
    found++;
    assert.ok(!safeAt(p), `${id} at ${p.x.toFixed(1)},${p.z.toFixed(1)} is in a safe room`);
  }
  assert.ok(found > 500, `only ${found} placements`);
});

test('apparitions: each kind only where it belongs, and never within 3 m', () => {
  const { a } = make();
  const seen = Object.fromEntries(KIND_IDS.map((k) => [k, 0]));
  for (const ctx of everywhere()) for (const id of KIND_IDS) {
    const p = a.find(id, ctx);
    if (!p) continue;
    seen[id]++;
    const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
    if (id !== 'reflection') assert.ok(d >= APPARITION.minDist, `${id} ${d.toFixed(1)} m away`);
    const room = layout.roomAt(cellOf(p.x), cellOf(p.z))?.id;
    if (id === 'patient') assert.equal(room, 'crew');
    if (id === 'astronaut') assert.ok(room === 'airlock' || room === 'pod', room);
    if (id === 'gasmask') assert.ok(room === 'generator' || grates.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 4), `${room}`);
    if (id === 'child') assert.ok(layout.isCorridor(cellOf(p.x), cellOf(p.z)));
  }
  for (const id of KIND_IDS) assert.ok(seen[id] > 0, `${id} never fits anywhere`);
});

test('apparitions: the shadow is at the edge of your vision, 35-48 degrees off', () => {
  const { a } = make();
  let n = 0;
  for (const ctx of everywhere()) {
    const p = a.find('shadow', ctx);
    if (!p) continue;
    n++;
    const dx = p.x - ctx.player.x, dz = p.z - ctx.player.z;
    const ang = Math.acos((dx * ctx.forward.x + dz * ctx.forward.z) / (Math.hypot(dx, dz) * Math.hypot(ctx.forward.x, ctx.forward.z))) * 180 / Math.PI;
    assert.ok(ang >= 35 - 1e-6 && ang <= 48 + 1e-6, `${ang}`);
  }
  assert.ok(n > 0);
});

test('apparitions: pickSpot skips spots without a clear line of sight, and near the alien', () => {
  const spots = [{ x: 6, z: 0 }, { x: 8, z: 0 }];
  const ctx = { player: { x: 0, z: 0 }, forward: { x: 1, y: 0, z: 0 } };
  assert.equal(pickSpot(spots, ctx, { near: 4, far: 10 }, (a, b) => b.x === 8, seeded()).x, 8);
  assert.equal(pickSpot(spots, { ...ctx, alien: { x: 7, z: 0 } }, { near: 4, far: 10 }, () => true, seeded()), null);
});

// A standing spot in Crew Quarters looking across it, so something always fits.
const crewSpot = floor.find((s) => s.room === 'crew');
const baseCtx = (over = {}) => ({
  elapsed: 0, player: { x: crewSpot.x, z: crewSpot.z }, eye: { x: crewSpot.x, y: 1.6, z: crewSpot.z },
  forward: { x: 0, y: 0, z: 1 }, alien: null, inSafe: false, blocked: false, dark: false, ...over,
});
function run(a, seconds, ctx, dt = 0.1) { for (let t = 0; t < seconds; t += dt) a.update(dt, ctx); }
function fitsNow(a, ctx) { return KIND_IDS.some((k) => a.find(k, ctx)); }

test('apparitions: nothing in the first 90 s, then one; next one 45-90 s after it ends', () => {
  const { a, fig } = make();
  // Turn until something fits.
  const ctx = baseCtx();
  for (const f of dirs) { ctx.forward = f; if (fitsNow(a, ctx)) break; }
  assert.ok(fitsNow(a, ctx));
  run(a, APPARITION.firstAfter - 1, ctx);
  assert.equal(fig.shown, null);
  run(a, 1.5, ctx);
  assert.ok(a.busy && fig.shown, 'one shows after 90 s');
  run(a, 10, ctx);
  assert.ok(!a.busy, 'it ends');
  assert.ok(a.next >= APPARITION.gap[0] - 10 && a.next <= APPARITION.gap[1], `${a.next}`);
});

test('apparitions: none while switched off, in a safe room, hunted, or the Hat Man is busy', () => {
  for (const over of [{ inSafe: true }, { blocked: true }, { dark: true }, { off: true }]) {
    const { a, fig } = make();
    if (over.off) a.enabled = false;
    const ctx = baseCtx(over);
    for (const f of dirs) { ctx.forward = f; if (fitsNow(a, ctx)) break; }
    run(a, 200, ctx);
    assert.equal(fig.shown, null, JSON.stringify(over));
  }
});

test('apparitions: stepping into a safe room sends a showing one away at once', () => {
  const { a, fig } = make();
  const ctx = baseCtx();
  for (const f of dirs) { ctx.forward = f; if (fitsNow(a, ctx)) break; }
  a.force();
  a.update(0.1, ctx);
  assert.ok(a.busy);
  a.update(0.1, { ...ctx, inSafe: true });
  assert.ok(!a.busy);
  assert.equal(fig.shown, null);
});

test('apparitions: the child shows at most once a run; force() still shows her', () => {
  const { a, fig } = make();
  a.find = (id) => (id === 'child' ? { x: 0, y: 0, z: 20 } : null); // only she fits
  const ctx = baseCtx({ player: { x: 0, z: 0 }, eye: { x: 0, y: 1.6, z: 0 } });
  run(a, APPARITION.firstAfter + 1, ctx);
  assert.equal(a.shown.child, 1);
  run(a, 200, ctx);
  assert.equal(a.shown.child, 1, 'not a second time');
  assert.equal(fig.shown, null);
  a.force('child');
  a.update(0.1, ctx);
  assert.equal(fig.shown, 'child');
});

test('apparitions: sounds stop when one goes early', () => {
  let stopped = 0;
  const { a } = make({ sound: () => ({ stop() { stopped++; }, dispose() {} }) });
  const ctx = baseCtx();
  // Find a spot where the gas mask fits.
  let gctx = null;
  for (const c of everywhere()) if (a.find('gasmask', c)) { gctx = { ...baseCtx(), ...c, eye: { ...c.player, y: 1.6 } }; break; }
  assert.ok(gctx, ctx);
  a.force('gasmask');
  a.update(0.1, gctx);
  assert.equal(a.active?.id, 'gasmask');
  a.update(0.1, { ...gctx, blocked: true });
  assert.equal(stopped, 1);
});
