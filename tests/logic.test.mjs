import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLayout, ROOMS, cellCenter, lineClear, traceCells, TILE } from '../js/layout.js';
import { findPath } from '../js/pathfind.js';
import { heardLoudness, STEP_LOUDNESS } from '../js/noise.js';
import {
  Alien, inSight, SPEED, HUNT_TIMEOUT, LOSE_TRACK_AFTER, DOOR_FORCE_TIME, WARN_TIME, WARN_TIME_CLOSE,
} from '../js/alien.js';

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

test('the station has 9 corridors with two doors each, plus one hatch per safe room', () => {
  assert.equal(layout.rooms.length, ROOMS.length);
  assert.ok(layout.room('crew'), 'crew quarters exists');
  assert.equal(layout.doors.length, 9 * 2 + 2);
  assert.equal(layout.doors.filter((d) => d.safe).length, 2);
  for (const d of layout.doors) assert.ok(layout.isDoor(d.cx, d.cz));
});

test('every terminal can be reached and read', () => {
  const [sx, sz] = layout.room('airlock').spot;
  const logs = layout.props.filter((p) => p.kind === 'log');
  assert.equal(logs.length, 12);
  for (const p of logs) {
    assert.equal(layout.roomAt(p.cell[0], p.cell[1])?.id, p.room, `${p.id} is in the wrong room`);
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [p.cell[0] + dx, p.cell[1] + dz])
      .find(([x, z]) => layout.isOpen(x, z));
    assert.ok(n, `${p.id} has no open side`);
    assert.ok(findPath(grid(), sx, sz, n[0], n[1]), `${p.id} is unreachable`);
  }
});

test('lore.json has an entry for every terminal', () => {
  const lore = JSON.parse(readFileSync(new URL('../data/lore.json', import.meta.url), 'utf8'));
  assert.equal(lore.length, 12);
  const ids = layout.props.filter((p) => p.kind === 'log').map((p) => p.id).sort();
  assert.deepEqual(lore.map((e) => e.id).sort(), ids);
  for (const e of lore) {
    assert.equal(layout.props.find((p) => p.id === e.id).room, e.room, `${e.id} is placed in the wrong room`);
    for (const f of ['author', 'date', 'title', 'text']) assert.ok(e[f], `${e.id} is missing ${f}`);
  }
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
  assert.equal(muffled, 5, 'a closed door halves the radius');
});

test('a wall cuts a noise by about two thirds, however thick it is', () => {
  // Crew quarters to the quiet room: two empty cells of wall between them.
  const heard = heardLoudness(layout, { ...at([16, 12]), loudness: 10 }, at([19, 12]), allOpen);
  assert.ok(Math.abs(heard - 3.3) < 1e-9, `heard ${heard}`);
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
const far = () => at(layout.room('pod').spot);
const step = (a, dx, loudness) => ({ x: a.pos.x + dx, z: a.pos.z, loudness, source: 'player' });
// Hear a noise in the open (no doors or walls in between).
const hearOpen = (a, n) => a.hear(n, n.loudness);
// See the player once, from `dist` metres away, then let the warning play out.
function startHunt(a, dist = 3) {
  a.update(0.05, ctx({ x: a.pos.x + dist, z: a.pos.z }, { canSee: true }));
  run(a, WARN_TIME + 0.1, ctx(far()));
}

test('a dormant alien ignores noise', () => {
  const a = makeAlien({ dormant: 10 });
  assert.equal(hearOpen(a, step(a, 1, 30)), false);
  assert.equal(a.state, 'patrol');
});

test('hearing: walking is heard at 5 m but not 7 m; crouching is unheard at 3 m', () => {
  const a = makeAlien();
  assert.equal(hearOpen(a, step(a, 7, STEP_LOUDNESS.walk)), false);
  assert.equal(hearOpen(a, step(a, 3, STEP_LOUDNESS.crouch)), false);
  assert.equal(a.state, 'patrol');
  assert.equal(hearOpen(a, step(a, 5, STEP_LOUDNESS.walk)), true);
  assert.equal(a.state, 'investigate');
});

test('sprinting from 12 m away sends it to investigate, never straight to a hunt', () => {
  const a = makeAlien();
  hearOpen(a, step(a, 12, STEP_LOUDNESS.sprint));
  assert.equal(a.state, 'investigate');
  const b = makeAlien();
  hearOpen(b, step(b, 2, 30)); // even very loud and close
  assert.equal(b.state, 'investigate');
});

test('while investigating, hearing you within 4 m starts a hunt with the short warning', () => {
  const a = makeAlien();
  hearOpen(a, step(a, 5, STEP_LOUDNESS.walk));
  a.drain();
  hearOpen(a, step(a, 3, STEP_LOUDNESS.walk));
  assert.equal(a.state, 'hunt');
  const warn = a.drain().find((e) => e.type === 'huntWarn');
  assert.ok(warn, 'no warning before the hunt');
  assert.equal(warn.time, WARN_TIME_CLOSE);
});

test('two noises at once: it goes to the louder one, whichever came first', () => {
  for (const order of [['quiet', 'loud'], ['loud', 'quiet']]) {
    const a = makeAlien();
    const noises = { quiet: { x: a.pos.x - 4, z: a.pos.z, loudness: 6, source: 'decoy' }, loud: { x: a.pos.x + 6, z: a.pos.z, loudness: 16, source: 'decoy' } };
    for (const k of order) hearOpen(a, noises[k]);
    const want = [Math.floor(noises.loud.x / TILE), Math.floor(noises.loud.z / TILE)];
    assert.deepEqual(a.target, layout.nearestOpen(want[0], want[1]), `order ${order}`);
  }
});

test('every hunt starts with a still warning: 1 s, or 0.5 s within 4 m', () => {
  const a = makeAlien();
  const start = { ...a.pos };
  a.update(0.05, ctx({ x: a.pos.x + 3.5, z: a.pos.z }, { canSee: true }));
  assert.equal(a.state, 'hunt');
  assert.equal(a.drain().find((e) => e.type === 'huntWarn')?.time, WARN_TIME_CLOSE);
  run(a, WARN_TIME_CLOSE - 0.1, ctx(far()));
  assert.deepEqual(a.pos, start, 'it moved during the warning');
  run(a, 0.2, ctx(far()));
  assert.ok(a.drain().some((e) => e.type === 'hunt'));

  const b = makeAlien();
  b.startHunt(b.cell, 10); // e.g. from far away
  assert.equal(b.drain().find((e) => e.type === 'huntWarn')?.time, WARN_TIME);
});

test('seeing you starts a hunt and it closes in fast', () => {
  const a = makeAlien();
  const player = { x: a.pos.x + 2.5, z: a.pos.z };
  run(a, 1.2, ctx(player, { canSee: true }));
  assert.equal(a.state, 'hunt');
  assert.equal(a.speed, SPEED.hunt);
  assert.ok(Math.hypot(player.x - a.pos.x, player.z - a.pos.z) < 1);
});

test('6 s out of sight and silent ends a hunt; 15 s of quiet returns it to patrol', () => {
  const a = makeAlien();
  startHunt(a, 2);
  assert.equal(a.state, 'hunt');
  run(a, HUNT_TIMEOUT - 1.5, ctx(far()));
  assert.equal(a.state, 'hunt');
  run(a, 1.5, ctx(far()));
  assert.equal(a.state, 'lost');
  assert.ok(a.speed <= SPEED.lost);
  run(a, a.lostSince + LOSE_TRACK_AFTER - 0.5 - a.time, ctx(far()));
  assert.equal(a.state, 'lost');
  run(a, 1, ctx(far()));
  assert.equal(a.state, 'patrol');
});

test('your noise during a hunt keeps it on you', () => {
  const a = makeAlien();
  startHunt(a, 2);
  for (let i = 0; i < 4; i++) {
    run(a, 2, ctx(far()));
    hearOpen(a, { ...a.pos, loudness: STEP_LOUDNESS.sprint, source: 'player' });
  }
  assert.equal(a.state, 'hunt');
});

test('any noise while it has lost track sends it to investigate', () => {
  const a = makeAlien();
  startHunt(a, 2);
  run(a, HUNT_TIMEOUT + 0.5, ctx(far()));
  assert.equal(a.state, 'lost');
  hearOpen(a, step(a, 3, 6));
  assert.equal(a.state, 'investigate');
});

test('a decoy pulls a hunting alien away once it has lost sight of you', () => {
  const a = makeAlien();
  startHunt(a, 2);
  run(a, 1, ctx(far()));
  hearOpen(a, { ...at(layout.room('generator').spot), loudness: 50, source: 'decoy' });
  assert.equal(a.state, 'investigate');
});

test('sight: within 4 m, inside its cone, and you are moving or lit', () => {
  const a = makeAlien();
  a.heading = 0; // facing +z
  const ahead = { x: a.pos.x, z: a.pos.z + 3 };
  assert.equal(inSight(a, ahead, { moving: true, lit: false }), true);
  assert.equal(inSight(a, ahead, { moving: false, lit: true }), true);
  assert.equal(inSight(a, ahead, { moving: false, lit: false }), false, 'still in the dark is safe');
  assert.equal(inSight(a, { x: a.pos.x, z: a.pos.z + 5 }, { moving: true, lit: true }), false, 'too far');
  const behind = { x: a.pos.x, z: a.pos.z - 2 };
  assert.equal(inSight(a, behind, { moving: true, lit: true }), false, 'behind it');
  a.state = 'hunt';
  assert.equal(inSight(a, behind, { moving: true, lit: true }), true, 'a hunting alien looks everywhere');
});

test('safe rooms: you can walk in, the alien can never path in', () => {
  const a = makeAlien();
  const c = ctx(far());
  for (const id of ['wellness', 'quiet']) {
    const [x, z] = layout.room(id).spot;
    assert.ok(layout.isSafe(x, z));
    assert.ok(findPath(grid(), ...layout.room('airlock').spot, x, z), `you can't reach ${id}`);
    assert.equal(findPath(a.grid(c), ...a.cell, x, z), null, `the alien can reach ${id}`);
    const [rx, rz] = a.reachableCell(cellCenter(x), cellCenter(z));
    assert.equal(layout.isSafe(rx, rz), false, 'its target moves outside the safe room');
  }
});

test('a closed door holds it for a moment, then it forces it open', () => {
  const door = layout.doors.find((d) => d.cx === 11 && d.cz === 3); // control west door
  let closed = true;
  const a = makeAlien();
  const c = ctx(far(), {
    isDoorClosed: (x, z) => closed && x === door.cx && z === door.cz,
    openDoor: () => { closed = false; },
  });
  a.investigate(layout.nearestOpen(6, 3), 10); // just past that door
  run(a, 0.6 + 3, c); // listening pause, then walk to the door
  assert.equal(closed, true);
  run(a, DOOR_FORCE_TIME + 0.2, c);
  assert.equal(closed, false);
  const events = a.drain().map((e) => e.type);
  assert.ok(events.includes('doorForce') && events.includes('doorOpen'));
});

test('patrol walks the loop slowly and clicks about every 5 s', () => {
  const a = makeAlien();
  const start = { ...a.pos };
  run(a, 20, ctx(far()));
  assert.notDeepEqual(a.pos, start);
  assert.equal(a.state, 'patrol');
  const clicks = a.drain().filter((e) => e.type === 'click');
  assert.ok(clicks.length >= 3 && clicks.length <= 5, `${clicks.length} clicks`);
});

test('every audio file exists and is credited', async () => {
  const { existsSync, readFileSync } = await import('node:fs');
  const { CREDITS } = await import('../js/credits.js');
  const root = new URL('../', import.meta.url);
  for (const c of CREDITS) assert.ok(existsSync(new URL(c.file, root)), `missing ${c.file}`);
  // audio.js imports three from a CDN, so read its file names as text.
  const src = readFileSync(new URL('js/audio.js', root), 'utf8');
  const used = [...src.matchAll(/'([\w-]+\.(?:wav|mp3))'/g)].map((m) => 'sound_effects/' + m[1]);
  used.push(src.match(/MENU_MUSIC = '([^']+)'/)[1]);
  const credited = new Set(CREDITS.map((c) => c.file));
  for (const f of used) assert.ok(credited.has(f), `no credit for ${f}`);
  assert.equal(used.length, CREDITS.length);
});
