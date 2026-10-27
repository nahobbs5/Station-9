// The Hat Man (js/hatman.js): the blackout reveal and the reflection cameo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, cellOf } from '../js/layout.js';
import { inSuite } from '../js/suiteplan.js';
import { roomLightLevel, roomState } from '../js/worldplan.js';
import { HATMAN, HatMan, corridorSpots, chooseSpot, cameoSurfaces, corridorEndLamps } from '../js/hatman.js';

const layout = buildLayout();

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

// A row of spots straight down +x from you.
const row = (xs) => xs.map((x) => ({ id: 'c:' + x, corridor: 'c', x, z: 0 }));
const ahead = { x: 1, y: 0, z: 0 };

test('hat man: he stands down the corridor you look at, nearer each repair: 25, 18, 12, 6 m', () => {
  const spots = row(Array.from({ length: 31 }, (_, i) => i));
  const pick = (stage) => chooseSpot(spots, { from: { x: 0, z: 0 }, forward: ahead, stage, rand: () => 0.5 });
  assert.deepEqual([0, 1, 2, 3].map((st) => pick(st).x), [25, 18, 12, 6]);
});

test('hat man: only in view, line clear, never within 3 m, never twice in one spot', () => {
  const from = { x: 0, z: 0 }, o = { from, forward: ahead, stage: 3, rand: () => 0.5 };
  assert.equal(chooseSpot(row([1, 2, 4, 9]), o).x, 4, 'target 6, but 1 and 2 are too close');
  assert.equal(chooseSpot(row([4, 9]), { ...o, used: new Set(['c:4']) }).x, 9);
  assert.equal(chooseSpot(row([4, 9]), { ...o, lineClear: (a, b) => b.x !== 4 }).x, 9);
  assert.equal(chooseSpot(row([-6, -9]), o), null, 'behind you');
  assert.equal(chooseSpot([{ id: 's', corridor: 'c', x: 6, z: 6 }], o), null, '45 degrees off is not "looking down it"');
  assert.ok(chooseSpot([{ id: 's', corridor: 'c', x: 6, z: 2 }], o), 'about 18 degrees off is');
});

// Run a HatMan in a straight corridor of spots ahead of you.
function scene({ spots = row([4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26]) } = {}) {
  const r = rigs();
  r.rig.dir = { ...ahead };
  const hm = new HatMan(r.figure, layout, { rig: r.rig, world: r.world, lineClear: () => true, rand: () => 0.5, onFirst: () => r.calls.push('first') });
  hm.spots = spots;
  const ctx = { stage: 0, elapsed: 0, inSuite: false, blocked: false, player: { x: 0, z: 0 } };
  const run = (secs, step = 0.05) => { for (let t = 0; t < secs - 1e-9; t += step) { ctx.elapsed += step; hm.update(step, ctx); } };
  return { ...r, hm, ctx, run };
}

test('hat man: nothing for 90 s, then a blackout, placed in the dark, shown when the lights return', () => {
  const { hm, run, world, calls, figure } = scene();
  run(HATMAN.firstAfter - 0.1);
  assert.equal(hm.state, 'idle');
  assert.ok(!world.out);
  run(0.15);
  assert.equal(hm.state, 'blackout');
  assert.ok(hm.dark && world.out, 'power out');
  assert.ok(!calls.includes('place'), 'not placed yet');
  run(HATMAN.placeAt + 0.05);
  assert.ok(calls.includes('place') && world.out, 'placed while dark');
  run(HATMAN.blackout - HATMAN.placeAt);
  assert.equal(hm.state, 'shown');
  assert.ok(!hm.dark && !world.out && hm.visible, 'lights back, he is there');
  assert.ok(Math.abs(figure.position.x - 25) <= HATMAN.vary + 1, `at ${figure.position.x} m`);
  assert.ok(calls.includes('first'));
  assert.ok(calls.includes('lamps:0') && calls.at(-1) !== 'lamps:0', 'end lamps out, then back');
});

test('hat man: due but nowhere in view, he waits until you look down a corridor', () => {
  const { hm, run, rig } = scene();
  rig.dir = { x: -1, y: 0, z: 0 }; // facing away from every spot
  run(HATMAN.firstAfter + 20);
  assert.equal(hm.state, 'idle');
  rig.dir = { ...ahead };
  run(HATMAN.retry + 0.1);
  assert.equal(hm.state, 'blackout');
});

const showIt = (s) => { s.hm.force(); s.run(HATMAN.blackout + 0.15); assert.equal(s.hm.state, 'shown'); };

test('hat man: he goes in a flicker: after his life, after 2 s of looking, or when you walk up', () => {
  // Not looked at straight (you face a little up): his life runs out.
  let s = scene();
  s.rig.dir = { x: 1, y: 0.4, z: 0 };
  showIt(s);
  s.run(HATMAN.life - 0.2);
  assert.equal(s.hm.state, 'shown');
  s.run(0.3);
  assert.equal(s.hm.state, 'flicker');
  assert.ok(s.calls.at(-1) === 'lamps:0' && s.calls.includes('hide') && s.world.out, 'hidden while dark');
  s.run(HATMAN.flicker + 0.05);
  assert.ok(s.hm.state === 'idle' && !s.world.out, 'lights back, he is gone');

  // Looking straight at him (eye level with his chest).
  s = scene();
  showIt(s);
  s.rig.position.y = HATMAN.hover + HATMAN.height * 0.6;
  s.rig.dir = { x: 1, y: 0, z: 0 };
  s.run(HATMAN.lookAway - 0.2);
  assert.equal(s.hm.state, 'shown');
  s.run(0.3);
  assert.equal(s.hm.state, 'flicker');

  // Walking up to him.
  s = scene();
  s.rig.dir = { x: 1, y: 0.4, z: 0 };
  showIt(s);
  s.ctx.player = { x: s.figure.position.x - HATMAN.tooClose + 0.5, z: 0 };
  s.run(0.1);
  assert.equal(s.hm.state, 'flicker');
});

test('hat man: not in a suite, not while the alien hunts or a trick runs, six a run, a new spot each time', () => {
  let s = scene();
  s.ctx.inSuite = true;
  s.run(HATMAN.firstAfter + 5);
  assert.equal(s.hm.state, 'idle');
  s = scene();
  s.ctx.blocked = true;
  s.run(HATMAN.firstAfter + 5);
  assert.equal(s.hm.state, 'idle');
  // Shown, then the alien starts hunting: he goes.
  s.ctx.blocked = false;
  s.rig.dir = { x: 1, y: 0.4, z: 0 };
  s.run(0.1);
  s.run(HATMAN.blackout + 0.1);
  assert.equal(s.hm.state, 'shown');
  s.ctx.blocked = true;
  s.run(0.1);
  assert.equal(s.hm.state, 'flicker');

  s = scene();
  s.rig.dir = { x: 1, y: 0.4, z: 0 };
  const placed = [];
  const place = s.figure.place.bind(s.figure);
  s.figure.place = (x, z, ...rest) => { placed.push(x); place(x, z, ...rest); };
  s.run(HATMAN.firstAfter + HATMAN.gap[1] * 8 + 60, 0.1);
  assert.equal(placed.length, HATMAN.perRun);
  assert.equal(new Set(placed).size, placed.length);
  assert.equal(s.hm.sightings, HATMAN.perRun);
});

test('hat man: a blackout puts every room light out', () => {
  const r = roomState({ id: 'storage', safe: false, x: 0, y: 0, w: 1, h: 1, index: 0 });
  r.blackout = true;
  assert.ok(roomLightLevel(r, 0.016, 1, null, true) < 0.05);
  r.blackout = false;
  assert.ok(roomLightLevel(r, 0, 1, null, true) > 0.5);
});

// A stand-in figure and camera.
function rigs() {
  const calls = [];
  const figure = {
    position: { x: 0, y: 1.5, z: 0 },
    place(x, z) { this.position.x = x; this.position.z = z; calls.push('place'); },
    setAlpha(k) { this.alpha = k; }, hide() { calls.push('hide'); }, update() {},
    showCameo() { calls.push('cameo'); }, hideCameo() { calls.push('hideCameo'); },
    setLamps(k) { calls.push('lamps:' + k); },
  };
  const rig = { position: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: -1 }, forward() { return this.dir; } };
  const world = { beats: 0, out: false, dimBeat() { this.beats++; }, setBlackout(on) { this.out = on; } };
  return { calls, figure, rig, world };
}

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
