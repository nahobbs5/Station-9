// The Hat Man (js/hatman.js), to the rules in reference files/Hatman.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, cellOf, cellCenter } from '../js/layout.js';
import { findPath } from '../js/pathfind.js';
import { SPEED } from '../js/alien.js';
import { inSuite } from '../js/suiteplan.js';
import {
  HATMAN, HatMan, corridorSpots, corridorOfCell, predictCorridor, chooseSpot, cameoSurfaces, corridorEndLamps, pathEnd,
} from '../js/hatman.js';

const layout = buildLayout();
const grid = { w: layout.w, h: layout.h, passable: (x, z) => layout.isOpen(x, z) && !layout.isSafe(x, z), cost: () => 1 };
const at = ([x, z]) => ({ x: cellCenter(x), z: cellCenter(z) });

// A patrol from Storage to the Arrival Airlock, which runs down the storage-airlock corridor.
const route = () => {
  const [sx, sz] = layout.room('storage').spot, [gx, gz] = layout.room('airlock').spot;
  return { start: [sx, sz], path: findPath(grid, sx, sz, gx, gz) };
};

test('hat man: marker spots are in corridors only, never in a suite, each with its own id', () => {
  const spots = corridorSpots(layout);
  assert.ok(spots.length >= 30, `only ${spots.length} spots`);
  assert.equal(new Set(spots.map((s) => s.id)).size, spots.length);
  for (const s of spots) {
    const cx = cellOf(s.x), cz = cellOf(s.z);
    assert.ok(layout.isCorridor(cx, cz) && !layout.isDoor(cx, cz), `${s.id} not in a corridor`);
    assert.equal(inSuite(layout, s), null);
    assert.ok(!layout.isSafe(cx, cz));
  }
});

test('hat man: he warns about the corridor the alien reaches in 2 to 6 s, and only then', () => {
  const { start, path } = route();
  const alien = { pos: at(start), path, state: 'patrol', dormant: 0 };
  const hit = predictCorridor(alien, layout);
  assert.ok(hit, 'a corridor on the way');
  assert.ok(hit.eta >= HATMAN.lead[0] && hit.eta <= HATMAN.lead[1], `eta ${hit.eta}`);
  assert.equal(hit.corridor, corridorOfCell(layout, hit.cell[0], hit.cell[1]));
  // It's the first corridor cell the alien reaches at least 2 s out.
  let t = 0, prev = alien.pos;
  for (const c of path) {
    const p = at(c);
    t += Math.hypot(p.x - prev.x, p.z - prev.z) / SPEED.patrol;
    prev = p;
    if (c[0] === hit.cell[0] && c[1] === hit.cell[1]) break;
    if (t >= HATMAN.lead[0]) assert.equal(corridorOfCell(layout, c[0], c[1]), null, `skipped an earlier corridor cell at ${c}`);
  }
  // Hunting, asleep, or the corridor too far ahead: no warning.
  assert.equal(predictCorridor({ ...alien, state: 'hunt' }, layout), null);
  assert.equal(predictCorridor({ ...alien, dormant: 5 }, layout), null);
  const slow = path.filter((c) => !corridorOfCell(layout, c[0], c[1])).slice(0, 2);
  assert.equal(predictCorridor({ ...alien, path: slow }, layout), null);
});

test('hat man: he stands nearer each repair: 25, 18, 12 m', () => {
  const spots = Array.from({ length: 31 }, (_, i) => ({ id: 'c:' + i, corridor: 'c', x: i, z: 0 }));
  const from = { x: 0, z: 0 };
  const pick = (stage) => chooseSpot(spots, 'c', { from, stage, rand: () => 0.5 });
  assert.equal(pick(0).x, 25);
  assert.equal(pick(1).x, 18);
  assert.equal(pick(2).x, 12);
  assert.equal(pick(3).x, 6);
});

test('hat man: never within 3 m, never twice in one spot, never placed where you can see', () => {
  const spots = [1, 2, 4, 9, 10].map((x) => ({ id: 'c:' + x, corridor: 'c', x, z: 0 }));
  const from = { x: 0, z: 0 };
  assert.equal(chooseSpot(spots, 'c', { from, stage: 3, rand: () => 0.5 }).x, 4); // target 6, but 1 and 2 are too close
  assert.equal(chooseSpot(spots, 'c', { from, stage: 3, rand: () => 0.5, used: new Set(['c:4']) }).x, 9);
  assert.equal(chooseSpot(spots, 'c', { from, stage: 3, rand: () => 0.5, isInView: (s) => s.x === 4 }).x, 9);
  assert.equal(chooseSpot(spots, 'c', { from, stage: 3, rand: () => 0.5, lineClear: () => false }), null);
  assert.equal(chooseSpot(spots, 'other', { from, stage: 0 }), null);
});

// A stand-in figure and camera.
function rigs() {
  const calls = [];
  const figure = {
    position: { x: 0, y: 1.5, z: 0 },
    place(x, z) { this.position.x = x; this.position.z = z; calls.push('place'); },
    setBacklight() {}, setAlpha(k) { this.alpha = k; }, hide() { calls.push('hide'); }, update() {},
    showCameo() { calls.push('cameo'); }, hideCameo() { calls.push('hideCameo'); },
  };
  const rig = { position: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 }, forward() { return this.dir; } };
  const world = { beats: 0, dimBeat() { this.beats++; } };
  return { calls, figure, rig, world };
}

test('hat man: a warning lands on the alien\'s next corridor, with the lights dipping', () => {
  const { figure, rig, world } = rigs();
  let first = 0;
  const hm = new HatMan(figure, layout, { rig, world, lineClear: () => true, onFirst: () => first++, rand: () => 0.5 });
  const { start, path } = route();
  const alien = { pos: at(start), path, state: 'patrol', dormant: 0 };
  const hit = predictCorridor(alien, layout);
  // Stand in the airlock, where the alien is headed (its path ends close by).
  const player = at(layout.room('airlock').spot);
  hm.update(0.1, { alien, stage: 0, elapsed: 120, isInView: () => false, player, inSuite: false, trickActive: false });
  assert.ok(hm.visible, 'he appeared');
  assert.equal(hm.corridor, hit.corridor);
  assert.ok(Math.hypot(hm.spot.x - player.x, hm.spot.z - player.z) >= HATMAN.minDist);
  assert.equal(world.beats, 1);
  assert.equal(first, 1);
});

test('hat man: the limits: 90 s first, 90 s apart, 6 a run, not in a suite or during a trick, route within 30 m', () => {
  const { figure, rig, world } = rigs();
  const hm = new HatMan(figure, layout, { rig, world, lineClear: () => true });
  const { start, path } = route();
  const alien = { pos: at(start), path, state: 'patrol', dormant: 0 };
  const player = at(layout.room('airlock').spot);
  const ctx = (o = {}) => ({ alien, stage: 0, elapsed: 200, isInView: () => false, player, inSuite: false, trickActive: false, ...o });
  assert.ok(hm.canWarn(ctx()));
  assert.ok(!hm.canWarn(ctx({ elapsed: 60 })), 'first 90 s');
  assert.ok(!hm.canWarn(ctx({ inSuite: true })), 'in a suite');
  assert.ok(!hm.canWarn(ctx({ trickActive: true })), 'trick running');
  assert.ok(!hm.canWarn(ctx({ alien: { ...alien, state: 'hunt' } })), 'hunting');
  const far = { x: pathEnd(alien).x + 40, z: pathEnd(alien).z };
  assert.ok(!hm.canWarn(ctx({ player: far })), 'route ends too far away');
  hm.lastWarning = 150;
  assert.ok(!hm.canWarn(ctx({ elapsed: 200 })), 'cool-down');
  assert.ok(hm.canWarn(ctx({ elapsed: 240 })), 'cool-down over');
  hm.warnings = HATMAN.perRun;
  assert.ok(!hm.canWarn(ctx({ elapsed: 1000 })), 'six a run');
});

test('hat man: 2 s of looking straight at him and he fades; 4 s and he goes anyway; glancing away resets it', () => {
  const setup = () => {
    const r = rigs();
    const hm = new HatMan(r.figure, layout, { rig: r.rig, world: r.world, lineClear: () => true });
    hm.visible = true; hm.life = HATMAN.life; hm.looked = 0; hm.fading = -1;
    r.figure.position.x = 0; r.figure.position.z = -10; r.figure.position.y = HATMAN.hover + HATMAN.height * 0.6;
    r.rig.position.y = HATMAN.hover + HATMAN.height * 0.6; // eye level with his chest, straight ahead
    return { ...r, hm };
  };
  const ctx = { elapsed: 0, inSuite: false, alien: { dormant: 1 }, player: { x: 0, z: 0 } };
  const run = (hm, secs) => { for (let t = 0; t < secs; t += 0.05) hm.update(0.05, ctx); };

  let { hm, rig, calls } = setup();
  run(hm, 1.9);
  assert.ok(hm.visible && hm.fading < 0, 'still there at 1.9 s');
  run(hm, 0.2 + HATMAN.fade + 0.05);
  assert.ok(!hm.visible && calls.includes('hide'), 'gone after 2 s of looking plus the fade');

  ({ hm, rig, calls } = setup());
  rig.dir = { x: 1, y: 0, z: 0 }; // looking away
  run(hm, 3.9);
  assert.ok(hm.visible);
  run(hm, 0.2 + HATMAN.fade + 0.05);
  assert.ok(!hm.visible, 'gone after 4 s even unseen');

  ({ hm, rig } = setup());
  run(hm, 1.5);
  rig.dir = { x: 1, y: 0, z: 0 }; hm.update(0.05, ctx); // a glance away
  rig.dir = { x: 0, y: 0, z: -1 };
  run(hm, 1.5);
  assert.ok(hm.visible && hm.fading < 0, 'the look timer reset');
});

test('hat man: cameo glass is the pod window and two dead monitors, none in a suite', () => {
  const s = cameoSurfaces(layout);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.kind).sort(), ['screen', 'screen', 'window']);
  for (const x of s) assert.equal(inSuite(layout, x), null);
  // Showing one dips the lights and lasts 1.5 s.
  const { figure, rig, world, calls } = rigs();
  const hm = new HatMan(figure, layout, { rig, world, lineClear: () => true });
  assert.ok(hm.showCameo(s[0]));
  assert.ok(!hm.showCameo(s[1]), 'one at a time');
  assert.equal(world.beats, 1);
  for (let t = 0; t < HATMAN.cameo + 0.1; t += 0.1) hm.update(0.1, { alien: { dormant: 1 }, elapsed: 0, inSuite: false, player: { x: 0, z: 0 } });
  assert.ok(calls.includes('hideCameo') && !hm.cameoActive);
});

test('hat man: a lamp either side of every doorway, on the corridor side', () => {
  const lamps = corridorEndLamps(layout);
  assert.equal(lamps.length, layout.doors.length * 2);
  for (const l of lamps) {
    assert.ok(layout.walkDistance(l.x, l.z) < 0.2, 'against a wall');
    assert.ok(!layout.roomAt(cellOf(l.x), cellOf(l.z)) || layout.isDoor(cellOf(l.x), cellOf(l.z)), 'not in the room');
  }
});
