import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, ROOMS, cellCenter, lineClear, traceCells, TILE } from '../js/layout.js';
import { findPath } from '../js/pathfind.js';
import { heardLoudness } from '../js/noise.js';
import { Alien, LOSE_TRACK_AFTER, DOOR_FORCE_TIME } from '../js/alien.js';

const layout = buildLayout();
const allOpen = () => false;
const at = (cell) => ({ x: cellCenter(cell[0]), z: cellCenter(cell[1]) });
const grid = (closed = allOpen) => ({
  w: layout.w, h: layout.h,
  passable: (x, z) => layout.isOpen(x, z),
  cost: (x, z) => (layout.isDoor(x, z) && closed(x, z) ? 6 : 1),
});

test('every room can reach every other room', () => {
  const [sx, sz] = layout.room('airlock').spot;
  for (const r of layout.rooms) {
    const p = findPath(grid(), sx, sz, r.spot[0], r.spot[1]);
    assert.ok(p, `no path to ${r.id}`);
  }
});

test('the station is a loop with 14 doors, two per corridor', () => {
  assert.equal(layout.rooms.length, ROOMS.length);
  assert.equal(layout.doors.length, 14);
  for (const d of layout.doors) assert.ok(layout.isDoor(d.cx, d.cz));
});

test('props block movement but not standing spots', () => {
  for (const p of layout.props) assert.equal(layout.isOpen(p.cell[0], p.cell[1]), false);
  for (const r of layout.rooms) assert.ok(layout.isOpen(r.spot[0], r.spot[1]));
});

test('pathfinding prefers going around a closed door when the detour is short', () => {
  const g = { w: 3, h: 3, passable: () => true, cost: (x, z) => (x === 1 && z === 0 ? 6 : 1) };
  const p = findPath(g, 0, 0, 2, 0);
  assert.ok(!p.some(([x, z]) => x === 1 && z === 0), 'went through the expensive cell');
  assert.deepEqual(p[p.length - 1], [2, 0]);
});

test('unreachable goals return null', () => {
  const g = { w: 3, h: 1, passable: (x) => x !== 1, cost: () => 1 };
  assert.equal(findPath(g, 0, 0, 2, 0), null);
});

test('traceCells walks from the start cell to the end cell', () => {
  const cells = traceCells(1, 1, 9, 5);
  assert.deepEqual(cells[0], [0, 0]);
  assert.deepEqual(cells[cells.length - 1], [Math.floor(9 / TILE), Math.floor(5 / TILE)]);
});

test('closed doors block sight and muffle sound', () => {
  const door = layout.doors.find((d) => d.cx === 14 && d.cz === 21); // airlock -> pod bay
  const a = at([12, 21]), b = at([18, 21]);
  const shut = (x, z) => x === door.cx && z === door.cz;
  assert.ok(lineClear(layout, a, b, allOpen));
  assert.equal(lineClear(layout, a, b, shut), false);
  const open = heardLoudness(layout, { ...a, loudness: 10 }, b, allOpen);
  const muffled = heardLoudness(layout, { ...a, loudness: 10 }, b, shut);
  assert.equal(open, 10);
  assert.ok(muffled < open * 0.5);
});

// Alien state machine ---------------------------------------------------

function makeAlien(opts = {}) {
  let r = 0.37;
  const rand = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  return new Alien(layout, { start: 'control', rand, ...opts });
}
const ctx = (player, extra = {}) => ({
  canSee: false, player, isDoorClosed: allOpen, openDoor() {}, ...extra,
});
const run = (alien, seconds, c) => { for (let t = 0; t < seconds; t += 0.05) alien.update(0.05, c); };

test('a dormant alien ignores noise', () => {
  const a = makeAlien({ dormant: 10 });
  assert.equal(a.hear({ ...a.pos, loudness: 30, source: 'player' }, 30), false);
  assert.equal(a.state, 'patrol');
});

test('a faint far noise makes it investigate; a loud close one makes it hunt', () => {
  const a = makeAlien();
  const far = { x: a.pos.x + 8, z: a.pos.z, loudness: 10, source: 'player' };
  a.hear(far, 10);
  assert.equal(a.state, 'investigate');
  assert.ok(a.drain().some((e) => e.type === 'click'), 'should click as a tell');

  const b = makeAlien();
  b.hear({ x: b.pos.x + 3, z: b.pos.z, loudness: 13, source: 'player' }, 13);
  assert.equal(b.state, 'hunt');
});

test('noise it cannot hear is ignored', () => {
  const a = makeAlien();
  assert.equal(a.hear({ x: a.pos.x + 12, z: a.pos.z, loudness: 5, source: 'player' }, 5), false);
  assert.equal(a.state, 'patrol');
});

test('when you stay out of sight it loses track, then returns to patrol', () => {
  const a = makeAlien();
  const player = at(layout.room('pod').spot); // far away, never seen
  a.hear({ x: a.pos.x + 2, z: a.pos.z, loudness: 20, source: 'player' }, 20);
  assert.equal(a.state, 'hunt');
  run(a, 8, ctx(player));
  assert.equal(a.state, 'lost');
  run(a, LOSE_TRACK_AFTER, ctx(player));
  assert.equal(a.state, 'patrol');
});

test('a decoy pulls a hunting alien away once it has lost sight of you', () => {
  const a = makeAlien();
  a.hear({ x: a.pos.x + 2, z: a.pos.z, loudness: 20, source: 'player' }, 20);
  run(a, 1, ctx(at(layout.room('pod').spot)));
  const decoy = { ...at(layout.room('generator').spot), loudness: 20, source: 'decoy' };
  a.hear(decoy, 50);
  assert.equal(a.state, 'investigate');
});

test('seeing you switches it straight to hunt and it closes in', () => {
  const a = makeAlien();
  const player = { x: a.pos.x + 2.5, z: a.pos.z };
  const c = ctx(player, { canSee: true });
  run(a, 1.5, c);
  assert.equal(a.state, 'hunt');
  assert.ok(Math.hypot(player.x - a.pos.x, player.z - a.pos.z) < 1);
});

test('a closed door holds it for a moment, then it forces it open', () => {
  const door = layout.doors.find((d) => d.cx === 11 && d.cz === 3); // control west door
  let closed = true;
  const a = makeAlien();
  const c = ctx(at(layout.room('pod').spot), {
    isDoorClosed: (x, z) => closed && x === door.cx && z === door.cz,
    openDoor: () => { closed = false; },
  });
  a.investigate(layout.nearestOpen(6, 3)); // just past that door
  run(a, 0.8 + 3, c); // tell pause, then walk to the door
  assert.equal(closed, true);
  run(a, DOOR_FORCE_TIME + 0.2, c);
  assert.equal(closed, false);
  const events = a.drain().map((e) => e.type);
  assert.ok(events.includes('doorForce') && events.includes('doorOpen'));
});

test('patrol walks the loop and pauses to listen', () => {
  const a = makeAlien();
  const start = { ...a.pos };
  run(a, 20, ctx(at(layout.room('pod').spot)));
  assert.notDeepEqual(a.pos, start);
  assert.equal(a.state, 'patrol');
});
