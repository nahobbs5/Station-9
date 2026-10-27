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

test('apparitions: nothing in the first 35 s, then one; next one 45-90 s after it ends', () => {
  const { a, fig } = make();
  // Turn until something fits.
  const ctx = baseCtx();
  for (const f of dirs) { ctx.forward = f; if (fitsNow(a, ctx)) break; }
  assert.ok(fitsNow(a, ctx));
  run(a, APPARITION.firstAfter - 1, ctx);
  assert.equal(fig.shown, null);
  run(a, 1.5, ctx);
  assert.ok(a.busy && fig.shown, 'one shows after 35 s');
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

// Debug summons (js/game.js ?debug keys) and the computer screen apparitions (js/screenapparitions.js).
import { lineClear } from '../js/layout.js';
import { SCREEN, SCREEN_KINDS, SCREEN_IDS, consoleScreens, pickScreen, screenLook, phaseOf } from '../js/screenapparitions.js';

const clear = (a, b) => lineClear(layout, a, b, () => false);
const consoles = consoleScreens(layout);

function fakeFeed() {
  const f = { on: null, sets: 0, show(key, id) { f.on = { key, id }; }, set() { f.sets++; }, hide() { f.on = null; } };
  return f;
}

test('debug summon: a patient outside Crew Quarters shows ahead of you, in clear sight, 3 m or more away', () => {
  const { a, fig } = make({ lineClear: clear });
  const spot = floor.find((s) => s.room === 'generator');
  const ctx = baseCtx({ player: { x: spot.x, z: spot.z }, eye: { x: spot.x, y: 1.6, z: spot.z } });
  ctx.forward = dirs.find((f) => (ctx.forward = f, a.ahead('patient', ctx))) ?? ctx.forward;
  assert.equal(a.find('patient', ctx), null, 'not where she normally goes');
  a.enabled = false; // the menu setting doesn't stop a debug summon
  a.summon('patient');
  a.update(0.1, ctx);
  assert.equal(fig.shown, 'patient');
  const p = a.active.place, d = Math.hypot(p.x - spot.x, p.z - spot.z);
  assert.ok(d >= APPARITION.minDist - 1e-6 && d <= 5 + 1e-6, `${d} m`);
  assert.ok(clear(ctx.player, p));
});

test('debug summon: ignores the safe room and replaces whatever is showing; the child keeps her one show', () => {
  const { a, fig } = make();
  const ctx = baseCtx({ inSafe: true, blocked: true });
  a.find = (id) => ({ x: crewSpot.x + 6, y: 0, z: crewSpot.z });
  a.summon('gasmask');
  a.update(0.1, ctx);
  assert.equal(fig.shown, 'gasmask');
  a.update(0.1, ctx);
  assert.ok(a.busy, 'stays despite the safe room');
  a.summon('child');
  a.update(0.1, ctx);
  assert.equal(fig.shown, 'child');
  assert.equal(a.shown.child, 0, 'a debug show does not count');
});

test('screen apparitions: twelve kinds, each with art, 0.5-3 s each', async () => {
  const fs = await import('node:fs');
  assert.equal(SCREEN_IDS.length, 12);
  for (const id of SCREEN_IDS) {
    const k = SCREEN_KINDS[id];
    assert.ok(fs.existsSync(new URL(`../assets/screens/${k.art}.png`, import.meta.url)), id);
    assert.ok(k.life >= 0.5 && k.life <= 3, id);
  }
});

test('screen apparitions: every console monitor, none in a safe room or suite', () => {
  assert.ok(consoles.length >= 12, `${consoles.length}`);
  for (const s of consoles) {
    assert.ok(!safeAt(s), s.key);
    assert.ok(layout.walkDistance(s.front.x, s.front.z) >= 0, `${s.key}'s front is open floor`);
  }
});

test('screen apparitions: the nearest monitor facing you, ahead, in clear sight', () => {
  let found = 0;
  for (const s of consoles) {
    // Stand 4 m in front of it, looking at it.
    const fx = Math.sin(s.rotY), fz = Math.cos(s.rotY);
    const player = { x: s.x + fx * 4, z: s.z + fz * 4 };
    if (layout.walkDistance(player.x, player.z) < 0.3 || !clear(player, s.front)) continue;
    const pick = pickScreen(consoles, { player, forward: { x: -fx, y: 0, z: -fz } }, clear);
    assert.ok(pick, s.key);
    found++;
    // Turned around: nothing (unless loose, for a debug summon).
    assert.notEqual(pickScreen(consoles, { player, forward: { x: fx, y: 0, z: fz } }, clear)?.key, s.key);
    assert.ok(pickScreen(consoles, { player, forward: { x: fx, y: 0, z: fz } }, clear, { loose: true }));
    // A wall in the way: nothing.
    assert.equal(pickScreen(consoles, { player, forward: { x: -fx, y: 0, z: -fz } }, () => false), null);
  }
  assert.ok(found >= 6, `${found} consoles checked`);
});

test('screen apparitions: they come up in the normal rotation on a monitor, never while switched off', () => {
  const s = consoles[0], fx = Math.sin(s.rotY), fz = Math.cos(s.rotY);
  const player = { x: s.x + fx * 4, z: s.z + fz * 4 };
  const ctx = baseCtx({ player, eye: { ...player, y: 1.6 }, forward: { x: -fx, y: 0, z: -fz } });
  for (const enabled of [true, false]) {
    const feed = fakeFeed();
    const { a, fig } = make({ feed, consoles, rand: seeded(3) });
    a.enabled = enabled;
    a.find = (id) => (id in SCREEN_KINDS ? { x: s.x, y: s.y, z: s.z, screen: s } : null); // only screens fit
    let seen = null;
    for (let t = 0; t < 400; t += 0.1) { a.update(0.1, ctx); if (feed.on) seen ??= feed.on; }
    assert.equal(fig.shown, null);
    if (enabled) assert.ok(seen && seen.key === s.key && SCREEN_IDS.includes(seen.id), JSON.stringify(seen));
    else assert.equal(seen, null);
  }
});

test('screen apparitions: one plays its life out, then the monitor goes back', () => {
  const feed = fakeFeed();
  const { a } = make({ feed, consoles, lineClear: clear });
  const s = consoles[0], fx = Math.sin(s.rotY), fz = Math.cos(s.rotY);
  const player = { x: s.x + fx * 4, z: s.z + fz * 4 };
  a.summon('screen-crew');
  const ctx = baseCtx({ player, eye: { ...player, y: 1.6 }, forward: { x: -fx, y: 0, z: -fz } });
  a.update(0.1, ctx);
  assert.deepEqual(feed.on, { key: s.key, id: 'screen-crew' });
  run(a, SCREEN_KINDS['screen-crew'].life - 0.3, ctx);
  assert.ok(feed.on && feed.sets > 10);
  run(a, 0.5, ctx);
  assert.equal(feed.on, null);
});

test('screen apparitions: the feed follows the board: normal, interference, glitch, peak, fade', () => {
  assert.deepEqual([0.05, 0.2, 0.4, 0.7, 0.95].map(phaseOf), ['normal', 'interference', 'glitch', 'peak', 'fade']);
  const r = seeded(5);
  for (const id of SCREEN_IDS) {
    assert.equal(screenLook(id, 0.05, r).art, 0, `${id}: starts as a normal feed`);
    let peak = 0;
    for (let k = 0; k < 1; k += 0.01) peak = Math.max(peak, screenLook(id, k, r).art);
    assert.ok(peak >= 0.5, `${id} shows itself`);
  }
  assert.ok(SCREEN.tooClose < SCREEN.near);
});

test('apparitions: every one stays at least 2 s, even looked at or walked up to', () => {
  for (const id of KIND_IDS) {
    assert.ok(KINDS[id].life >= APPARITION.minShow, `${id} lives ${KINDS[id].life} s`);
    const { a, fig } = make();
    const p = { x: crewSpot.x, z: crewSpot.z };
    a.find = () => ({ x: p.x + 1, y: 0, z: p.z, glass: id === 'reflection' ? null : undefined }); // 1 m away: too close
    const ctx = baseCtx({ forward: { x: 1, y: 0, z: 0 } }); // looking straight at it
    a.summon(id);
    a.update(0.05, ctx);
    run(a, APPARITION.minShow - 0.1, { ...ctx }, 0.05);
    assert.equal(fig.shown, id, `${id} still there`);
  }
});

test('apparitions: the child never mirrors or slides, start to finish', () => {
  const { a, fig } = make();
  const poses = [];
  fig.pose = (P) => poses.push({ ...P });
  a.find = (id) => (id === 'child' ? { x: crewSpot.x, y: 0, z: crewSpot.z + 8 } : null);
  a.summon('child');
  run(a, KINDS.child.life + 1, baseCtx(), 0.05);
  assert.ok(poses.length > 20 && !a.busy);
  for (const P of poses) { assert.equal(P.flipX, false); assert.equal(P.jitter, 0); }
  assert.equal(KINDS.child.h, 2.3);
});
