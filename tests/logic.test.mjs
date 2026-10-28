import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLayout, ROOMS, cellCenter, lineClear, traceCells, TILE } from '../js/layout.js';
import { findPath } from '../js/pathfind.js';
import { heardLoudness, STEP_LOUDNESS } from '../js/noise.js';
import { revealAround, mapMarkers } from '../js/minimap.js';
import { parseIntro, parseLore, tapeScript, speakerOf } from '../js/textfiles.js';
import { VOICES } from '../js/tapes.js';
import { planDecor, DECOR } from '../js/decorplan.js';
import { CameraRig } from '../js/rig.js';
import { wallOutlines, wallSegments } from '../js/walls.js';
import { CONSOLE_SCREENS, LIVE_SCREENS } from '../js/textures.js';
import { alienRig } from '../js/alienshape.js';
import { wallPanels, looseItems, furniturePlacement, signPlacements, emblemClearCells, doorFrames, FRAME } from '../js/worldplan.js';
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

test('the station has 9 corridors with two doors each, a hatch per suite, and the secret passage', () => {
  assert.equal(layout.rooms.length, ROOMS.length);
  assert.ok(layout.room('crew'), 'crew quarters exists');
  assert.equal(layout.doors.length, 9 * 2 + 2 + 2);
  assert.equal(layout.doors.filter((d) => d.safe && !d.hidden).length, 2, 'one hatch per suite');
  assert.equal(layout.doors.filter((d) => d.hidden).length, 2, 'the secret passage has two doors');
  assert.equal(layout.doors.filter((d) => d.secret).length, 1, 'one of them is the hidden panel');
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

const readText = (name) => readFileSync(new URL(`../text/${name}`, import.meta.url), 'utf8');

test('intro.txt has the opening announcements, without comments or blank lines', () => {
  const intro = parseIntro(readText('intro.txt'));
  assert.ok(intro.length >= 1);
  for (const line of intro) assert.ok(line && !line.startsWith('#'));
  assert.deepEqual(parseIntro('# note\n\nOne.\r\n  Two.  \n'), ['One.', 'Two.']);
});

test('lore.txt has an entry for every terminal', () => {
  const lore = parseLore(readText('lore.txt'));
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
  used.push(...[...src.matchAll(/'(music\/[\w-]+\.mp3)'/g)].map((m) => m[1]));
  const credited = new Set(CREDITS.map((c) => c.file));
  for (const f of used) assert.ok(credited.has(f), `no credit for ${f}`);
  // Every audio credit is used (art credits, like the HDRI, are checked for existence above).
  assert.equal(used.length, CREDITS.filter((c) => /\.(wav|mp3)$/.test(c.file)).length);
});

// Minimap -----------------------------------------------------------------

const seenRoom = (explored, id) => {
  const r = layout.room(id);
  for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (!explored[z * layout.w + x]) return false;
  return true;
};
const anySeen = (explored, id) => {
  const r = layout.room(id);
  for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (explored[z * layout.w + x]) return true;
  return false;
};

test('minimap: at the start you only know the airlock', () => {
  const explored = new Uint8Array(layout.w * layout.h);
  const a = layout.room('airlock');
  revealAround(layout, explored, at([a.cx, a.cz]), allOpen);
  assert.ok(seenRoom(explored, 'airlock'));
  for (const id of ['generator', 'control', 'pod', 'crew']) assert.equal(anySeen(explored, id), false, id);
});

test('minimap: a closed door hides what is past it, but the door itself shows', () => {
  const door = layout.doors.find((d) => d.cx === 14 && d.cz === 21); // airlock -> pod corridor
  const shut = (x, z) => x === door.cx && z === door.cz;
  const from = at([13, 21]);
  const closed = new Uint8Array(layout.w * layout.h);
  revealAround(layout, closed, from, shut);
  assert.equal(closed[door.cz * layout.w + door.cx], 1, 'door cell revealed');
  assert.equal(closed[21 * layout.w + 15], 0, 'corridor past the door hidden');
  const open = new Uint8Array(layout.w * layout.h);
  revealAround(layout, open, from, allOpen);
  assert.equal(open[21 * layout.w + 15], 1, 'corridor visible with the door open');
});

test('minimap: walking to crew quarters maps the way, not the rest', () => {
  const explored = new Uint8Array(layout.w * layout.h);
  const [sx, sz] = layout.room('airlock').spot;
  const [gx, gz] = layout.room('crew').spot;
  for (const cell of [[sx, sz], ...findPath(grid(), sx, sz, gx, gz)]) revealAround(layout, explored, at(cell), allOpen);
  assert.ok(seenRoom(explored, 'crew'));
  for (const id of ['pod', 'generator', 'teleporter']) assert.equal(anySeen(explored, id), false, id);
});

const exploreRooms = (...ids) => {
  const explored = new Uint8Array(layout.w * layout.h);
  for (const id of ids) {
    const r = layout.room(id);
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) explored[z * layout.w + x] = 1;
  }
  return explored;
};
const mapTerminals = layout.props.filter((p) => p.kind === 'log');

test('minimap symbols: nothing but the airlock terminal at the start', () => {
  const explored = new Uint8Array(layout.w * layout.h);
  const a = layout.room('airlock');
  revealAround(layout, explored, at([a.cx, a.cz]), allOpen);
  const kinds = mapMarkers(layout, explored, { terminals: mapTerminals }).map((m) => m.kind);
  assert.deepEqual(kinds, ['terminal']);
});

test('minimap symbols: S marks a safe room once you have seen it', () => {
  const m = mapMarkers(layout, exploreRooms('wellness')).filter((x) => x.kind === 'safe');
  const r = layout.room('wellness');
  assert.deepEqual(m, [{ kind: 'safe', x: r.x + r.w / 2, z: r.y + r.h / 2 }]);
});

test('minimap symbols: each repair room has its own symbol, marked by progress', () => {
  const m = mapMarkers(layout, exploreRooms('generator', 'comms', 'pod'), { stage: 1 });
  const state = Object.fromEntries(m.map((x) => [x.kind, x.state]));
  assert.deepEqual(state, { generator: 'done', comms: 'now', pod: 'later' });
});

test('minimap symbols: the crate shows until you take the noise-makers', () => {
  const explored = exploreRooms('storage');
  assert.ok(mapMarkers(layout, explored, { gotCrate: false }).some((x) => x.kind === 'crate'));
  assert.ok(!mapMarkers(layout, explored, { gotCrate: true }).some((x) => x.kind === 'crate'));
});

test('minimap symbols: a terminal appears once seen, and turns read once heard', () => {
  const t = mapTerminals.find((x) => x.id === 't04');
  const none = mapMarkers(layout, new Uint8Array(layout.w * layout.h), { terminals: mapTerminals });
  assert.equal(none.length, 0);
  const explored = exploreRooms('crew');
  const find = (read) => mapMarkers(layout, explored, { terminals: mapTerminals, loreRead: new Set(read) })
    .find((x) => x.kind === 'terminal' && x.x === t.cell[0] + 0.5 && x.z === t.cell[1] + 0.5);
  assert.equal(find([]).state, 'unread');
  assert.equal(find(['t04']).state, 'read');
});

// Audio logs ------------------------------------------------------------------

test('tapes: one line per sentence, and a "Name:" paragraph switches speaker', () => {
  const lore = parseLore(readText('lore.txt'));
  const script = tapeScript(lore.find((e) => e.id === 't11'), Object.keys(VOICES));
  assert.equal(script[0].speaker, 'Tomas');
  assert.equal(script[script.length - 1].speaker, 'Marigold');
  assert.equal(script[script.length - 1].text, 'Everyone is fine.');
  for (const l of script) assert.ok(/^[^.!?]+[.!?]+["”']?$/.test(l.text), `not one sentence: ${l.text}`);
  // A colon that isn't a known speaker stays part of the line.
  assert.equal(tapeScript({ author: 'Wes', text: 'Note: be quiet.' }, ['Marigold'])[0].text, 'Note: be quiet.');
});

test('tapes: every speaker in every log has a voice', () => {
  for (const e of parseLore(readText('lore.txt'))) {
    for (const l of tapeScript(e, Object.keys(VOICES))) assert.ok(VOICES[l.speaker], `${e.id}: no voice for ${l.speaker}`);
  }
  assert.equal(speakerOf('Dr. Imani Okafor, lead physicist'), 'Imani');
});

test('lore.txt reads the optional voice and audio lines', () => {
  const [e] = parseLore('=== t99: Test\nroom: crew\nauthor: Sam Doyle\ndate: 2091-01-01\nvoice: pitch 0.8, rate 1.1\naudio: tapes/t99.mp3\n\nHello. Bye.\n');
  assert.deepEqual(e.voice, { pitch: 0.8, rate: 1.1 });
  assert.equal(e.audio, 'tapes/t99.mp3');
  assert.equal(e.text, 'Hello. Bye.');
});

// Wear and tear -----------------------------------------------------------------

const cellAt = (pt) => [Math.floor(pt.x / TILE), Math.floor(pt.z / TILE)];

test('decor: the same plan every load', () => {
  assert.deepEqual(planDecor(layout), planDecor(layout));
});

test('decor: nothing overhead hangs below head height, and no pipe passes through a door', () => {
  const plan = planDecor(layout);
  for (const p of plan.pipes) {
    if (plan.risers.includes(p)) continue;
    assert.ok(Math.min(p.a.y, p.b.y) - p.r >= DECOR.overheadMin, `pipe too low at ${cellAt(p.a)}`);
    for (const pt of [p.a, p.b]) assert.equal(layout.isDoor(...cellAt(pt)), false, `pipe in a door at ${cellAt(pt)}`);
  }
  for (const c of plan.cables) assert.ok(c.a.y - c.sag - 0.03 >= DECOR.overheadMin, 'cable sags too low');
  for (const pn of plan.panels) assert.ok(3 - pn.size * Math.sin(pn.tilt) >= DECOR.overheadMin, 'ceiling panel hangs too low');
  for (const l of plan.lights) assert.equal(layout.isDoor(...l.cell), false);
});

test('decor: every corridor cell has pipes, and faults and lights sit on floor cells', () => {
  const plan = planDecor(layout);
  const piped = new Set(plan.pipes.filter((p) => p.cell).map((p) => p.cell.join(',')));
  for (let z = 0; z < layout.h; z++) for (let x = 0; x < layout.w; x++) {
    if (layout.isCorridor(x, z)) assert.ok(piped.has(`${x},${z}`), `no pipe in corridor ${x},${z}`);
  }
  for (const f of [...plan.faults, ...plan.lights]) {
    assert.ok(layout.isFloor(...f.cell) && !layout.isDoor(...f.cell), `${f.kind ?? 'light'} at ${f.cell}`);
  }
  assert.equal(plan.lights.length, DECOR.brokenLights);
});

test('decor: clutter stays in room corners, clear of doors and props', () => {
  for (const c of planDecor(layout).clutter) {
    const [x, z] = c.cell;
    assert.ok(layout.roomAt(x, z), 'clutter outside a room');
    assert.equal(layout.isSolid(x, z), false, 'clutter on a prop');
    assert.ok(![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.isDoor(x + dx, z + dz)), 'clutter by a door');
  }
});

// Camera, shared plans --------------------------------------------------------------

test('camera rig: forward and up point the right way', () => {
  const r = new CameraRig();
  const close = (a, b) => ['x', 'y', 'z'].forEach((k) => assert.ok(Math.abs(a[k] - b[k]) < 1e-9, `${k}: ${a[k]} vs ${b[k]}`));
  close(r.forward(), { x: 0, y: 0, z: -1 });           // yaw 0 looks down -z
  close(r.up(), { x: 0, y: 1, z: 0 });
  r.yaw = Math.PI / 2;
  close(r.forward(), { x: -1, y: 0, z: 0 });           // turning left faces -x
  r.yaw = 0; r.pitch = Math.PI / 4;
  const f = r.forward(), u = r.up();
  assert.ok(f.y > 0.7 && u.y > 0.7 && u.z > 0.7, 'looking up tips "up" backwards');
  assert.ok(Math.abs(f.x * u.x + f.y * u.y + f.z * u.z) < 1e-9, 'up is at right angles to forward');
});

test('shared plans are the same every load (both engines build the same station)', () => {
  assert.deepEqual(wallPanels(layout), wallPanels(layout));
  const rigA = alienRig(), rigB = alienRig();
  assert.deepEqual(rigA, rigB);
  assert.equal(rigA.tentacles.length, 12);
  assert.equal(rigA.crown.length, 6);
  for (const t of [...rigA.tentacles, ...rigA.crown]) assert.ok(Math.abs(Math.hypot(...t.quat) - 1) < 1e-9, 'tentacle rotation is a unit quaternion');
  const clutter = new Set(planDecor(layout).clutter.map((c) => c.cell.join(',')));
  const items = looseItems(layout, clutter);
  assert.ok(items.length > 0);
  for (const it of items) assert.equal(layout.isSafe(Math.floor(it.x / TILE), Math.floor(it.z / TILE)), false);
});

// Shapes: octagon rooms, curved corridors, traced walls, consoles ------------------------

test('octagon rooms: corners are cut off, the middle is open', () => {
  for (const id of ['control', 'teleporter', 'crew']) {
    const r = layout.room(id);
    const x0 = r.x * TILE, z0 = r.y * TILE;
    assert.ok(layout.walkDistance(x0 + 0.3, z0 + 0.3) < 0, `${id}: outer corner should be wall`);
    assert.ok(layout.walkDistance(cellCenter(r.cx), cellCenter(r.cz)) > 3, `${id}: middle should be open`);
    assert.equal(layout.isOpen(r.x, r.y), false, `${id}: corner cell isn't standable`);
  }
  // A square room keeps its corners.
  const g = layout.room('generator');
  assert.ok(layout.walkDistance(g.x * TILE + 0.3, g.y * TILE + 0.3) > 0);
});

test('curved corridors: the whole centreline has clearance, and open cells are truly open', () => {
  for (const c of layout.corridors.filter((c) => c.parts.some((p) => p.curve))) {
    for (const p of c.pts) assert.ok(layout.walkDistance(p.x, p.z) >= 0.9, `${c.id} pinches at ${p.x.toFixed(1)},${p.z.toFixed(1)}`);
  }
  for (let z = 0; z < layout.h; z++) for (let x = 0; x < layout.w; x++) {
    if (layout.isFloor(x, z)) assert.ok(layout.walkDistance(cellCenter(x), cellCenter(z)) > 0, `cell ${x},${z} centre is in a wall`);
  }
});

test('the alien can reach every room, terminal and console through the curves', () => {
  const [sx, sz] = layout.room('airlock').spot;
  for (const r of layout.rooms) assert.ok(findPath(grid(), sx, sz, r.spot[0], r.spot[1]), `no path to ${r.id}`);
  for (const p of layout.props.filter((p) => p.kind === 'log' || p.kind === 'console')) {
    const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [p.cell[0] + dx, p.cell[1] + dz]).find(([x, z]) => layout.isOpen(x, z));
    assert.ok(n, `${p.id} has no open side`);
    assert.ok(findPath(grid(), sx, sz, n[0], n[1]), `${p.id} is unreachable`);
  }
});

test('sight is blocked across the inside of a curve', () => {
  // From the control room's west door to the generator door: the curve bends round, so no straight view.
  assert.equal(lineClear(layout, at([10, 3]), at([3, 6]), allOpen), false);
  // Along a straight corridor it's clear.
  assert.ok(lineClear(layout, at([3, 11]), at([3, 13]), allOpen));
});

test('traced walls: closed outlines, every segment has open floor on exactly one side', () => {
  const loops = wallOutlines(layout.shape);
  assert.ok(loops.length >= 1);
  for (const loop of loops) {
    const [a, b] = [loop[0], loop[loop.length - 1]];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.4, 'outline is closed');
  }
  for (const s of wallSegments(layout.shape)) {
    const mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2;
    assert.ok(layout.walkDistance(mx + s.nx * 0.2, mz + s.nz * 0.2) > 0 && layout.walkDistance(mx - s.nx * 0.2, mz - s.nz * 0.2) < 0);
  }
});

test('consoles: every screen recipe exists, live ones change with progress', () => {
  const used = new Set(layout.props.filter((p) => p.screen).map((p) => p.screen));
  for (const s of used) assert.ok(CONSOLE_SCREENS.includes(s), `no screen recipe for ${s}`);
  assert.equal(layout.props.filter((p) => p.kind === 'console').length, 6);
  for (const s of LIVE_SCREENS) assert.ok(CONSOLE_SCREENS.includes(s));
});

// Furniture and signs --------------------------------------------------------------------

test('furniture never blocks a door, and every door is still reachable', () => {
  const [sx, sz] = layout.room('airlock').spot;
  for (const d of layout.doors) {
    if (d.safe) continue; // the alien's grid isn't relevant; safe hatches are checked below with the player's
    assert.ok(findPath(grid(), sx, sz, d.cx, d.cz), `door ${d.cx},${d.cz} unreachable`);
  }
  const seen = new Set(layout.props.map((p) => p.cell.join(',')));
  for (const f of layout.furniture) {
    const [x, z] = f.cell;
    assert.equal(layout.roomAt(x, z)?.id, f.room, `${f.kind} at ${f.cell} is not in ${f.room}`);
    assert.ok(layout.isFloor(x, z) && !layout.isDoor(x, z), `${f.kind} on a non-floor or door cell`);
    assert.ok(![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.isDoor(x + dx, z + dz)), `${f.kind} at ${f.cell} is next to a door`);
    if (f.solid) {
      assert.ok(!seen.has(f.cell.join(',')), `two solid things share ${f.cell}`);
      seen.add(f.cell.join(','));
      assert.equal(layout.isOpen(x, z), false, 'solid furniture blocks its cell');
    }
  }
});

test('wall furniture stands inside its room, against a wall', () => {
  for (const f of layout.furniture) {
    const at = furniturePlacement(layout, f);
    assert.ok(layout.walkDistance(at.x, at.z) > 0, `${f.kind} at ${f.cell} is inside a wall`);
  }
});

test('wayfinding signs point along the real route', () => {
  const signs = signPlacements(layout);
  assert.equal(signs.length, 5);
  const outside = signs.find((s) => s.door[0] === 8 && s.door[1] === 21); // the airlock's west door
  assert.ok(!outside.entries.some((e) => e.id === 'airlock'), "a sign outside the airlock doesn't list the airlock");
  assert.equal(outside.entries.find((e) => e.id === 'pod').arrow, '←', 'the pod bay is back round the curve, to the left');
  assert.equal(outside.entries.find((e) => e.id === 'storage').arrow, '→', 'storage is through the airlock, to the right');
  for (const s of signs) assert.ok(layout.walkDistance(s.x, s.z) > -0.05 && layout.walkDistance(s.x, s.z) < 0.2, 'sign hangs on a wall');
});

test('nothing stands in front of the Station 9 emblem in the airlock', () => {
  const clear = emblemClearCells(layout);
  assert.equal(clear.size, 2);
  const taken = [
    ...layout.props.map((p) => p.cell), ...layout.furniture.map((f) => f.cell),
    ...planDecor(layout).clutter.map((c) => c.cell),
  ].map((c) => c.join(','));
  for (const k of clear) assert.ok(!taken.includes(k), `something is in front of the emblem at ${k}`);
  const clutter = new Set(planDecor(layout).clutter.map((c) => c.cell.join(',')));
  for (const it of looseItems(layout, clutter)) {
    assert.ok(!clear.has(`${Math.floor(it.x / TILE)},${Math.floor(it.z / TILE)}`), 'a loose chair or box in front of the emblem');
    for (const [x, z] of it.spots) assert.ok(!clear.has(`${x},${z}`), 'the prop trick could move something in front of the emblem');
  }
});

test('corridor ribs stand against both walls, clear of doors, and stay shallow', () => {
  const plan = planDecor(layout);
  assert.ok(plan.ribs.length >= 12, `only ${plan.ribs.length} ribs`);
  for (const r of plan.ribs) {
    for (const p of [r.a, r.b]) {
      // On the wall itself: just inside is walkable, just beyond is solid.
      const ix = r.x - p.x, iz = r.z - p.z, l = Math.hypot(ix, iz);
      assert.ok(layout.walkDistance(p.x + (ix / l) * 0.05, p.z + (iz / l) * 0.05) > 0);
      assert.ok(layout.walkDistance(p.x - (ix / l) * 0.05, p.z - (iz / l) * 0.05) <= 0.02);
      for (const d of layout.doors) assert.ok(Math.hypot(cellCenter(d.cx) - p.x, cellCenter(d.cz) - p.z) > 1.2);
    }
    // Sticks out no further than a pillar's depth: walkways stay wide.
    assert.ok(DECOR.rib.inset <= 0.12);
    assert.ok(Math.hypot(r.a.x - r.b.x, r.a.z - r.b.z) < 3.4);
  }
  for (const v of plan.vents) {
    assert.ok(v.y > 1.5, 'a low decorative vent would look enterable');
    assert.ok(!layout.roomAt(...v.cell)?.safe, 'vent in a safe room');
    for (const r of plan.ribs) for (const p of [r.a, r.b]) assert.ok(Math.hypot(v.x - p.x, v.z - p.z) > 0.5, 'vent under a rib');
  }
});

test('door frames span the doorway from wall to wall', () => {
  const frames = doorFrames(layout);
  assert.equal(frames.length, layout.doors.length);
  for (const f of frames) {
    assert.ok(f.lo > 0.8 && f.hi > 0.8 && f.lo + f.hi < 2.6, `door at ${f.x},${f.z}: ${f.lo}+${f.hi}`);
    // The jambs stand out no more than FRAME.inset, so walking through stays easy.
    assert.ok(f.lo + f.hi - 2 * FRAME.inset > 1.6);
  }
});

test('stencils sit flat on walls, door stripes flank every door, stains lie on open floor', () => {
  const plan = planDecor(layout);
  assert.ok(plan.stencils.filter((s) => s.kind === 'pressure').length >= 10);
  for (const s of plan.stencils) {
    const nx = Math.sin(s.rot), nz = Math.cos(s.rot); // out of the wall
    assert.ok(layout.walkDistance(s.x + nx * 0.06, s.z + nz * 0.06) > 0, `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)} floats`);
    assert.ok(layout.walkDistance(s.x - nx * 0.06, s.z - nz * 0.06) < 0.03, `${s.kind} at ${s.x.toFixed(1)},${s.z.toFixed(1)} is off the wall`);
  }
  assert.equal(plan.stripes.length, layout.doors.length * 2);
  for (const s of plan.stains) assert.ok(layout.walkDistance(s.x, s.z) > 0);
  for (const s of plan.streaks) assert.ok(s.y - s.h / 2 >= 0.15, 'streak runs into the kick plate');
});

test('every model placement has its file, stands on open floor or hangs on a wall, and avoids safe rooms', async () => {
  const { modelPlacements, MODELS, modelUrl } = await import('../js/modelplan.js');
  const { existsSync } = await import('node:fs');
  const list = modelPlacements(layout, planDecor(layout));
  assert.ok(list.length >= 15);
  for (const p of list) {
    assert.ok(MODELS[p.model], p.model);
    assert.ok(existsSync(new URL('../' + modelUrl(p.model), import.meta.url)), modelUrl(p.model));
    assert.ok(layout.walkDistance(p.x, p.z) > 0, `${p.model} at ${p.x.toFixed(2)},${p.z.toFixed(2)} is inside a wall`);
    const room = layout.roomAt(Math.floor(p.x / TILE), Math.floor(p.z / TILE));
    assert.ok(!room?.safe, `${p.model} in a safe room`);
  }
});

test('decor and models keep clear of the hideable grates, each grate has its smear, kick plates gap at wall vents', async () => {
  const { grateSpots } = await import('../js/vents.js');
  const { modelPlacements } = await import('../js/modelplan.js');
  const { kickPlateSpans } = await import('../js/worldplan.js');
  const grates = grateSpots(layout);
  if (!grates.length) return;
  const plan = planDecor(layout);
  const near = (o, d) => grates.find((g) => Math.hypot(g.x - o.x, g.z - o.z) < d);
  for (const list of ['plates', 'tape', 'boards', 'vents', 'stencils', 'sconces']) {
    for (const o of plan[list]) assert.ok(!near(o, 0.9), `${list} item by grate ${near(o, 0.9)?.id}`);
  }
  for (const o of plan.streaks.filter((s) => !s.grate)) assert.ok(!near(o, 0.9), 'streak by a grate');
  for (const o of plan.stains.filter((s) => !s.grate)) assert.ok(!near(o, 1.1), 'stain on a grate');
  for (const o of [...plan.clutter, ...plan.grates]) assert.ok(!near(o, 1.1), 'clutter or floor plate on a grate');
  for (const m of modelPlacements(layout, plan)) assert.ok(!near(m, 1.1), `${m.model} by grate ${near(m, 1.1)?.id}`);
  const { looseItems, extraSeats } = await import('../js/worldplan.js');
  for (const o of looseItems(layout, new Set())) assert.ok(!near(o, 1.1), `loose ${o.kind} by grate ${near(o, 1.1)?.id}`);
  for (const o of [...layout.furniture.map((f) => furniturePlacement(layout, f)), ...extraSeats(layout)]) assert.ok(!near(o, 1.1), `furniture by grate ${near(o, 1.1)?.id}`);
  for (const g of grates) assert.equal(plan.stains.filter((s) => s.grate === g.id).length, 1, `smear for ${g.id}`);
  // The kick plate breaks round every wall vent, and only there.
  for (const g of grates.filter((q) => q.kind === 'wall')) {
    const panel = wallPanels(layout).find((p) => {
      const dx = p.bx - p.ax, dz = p.bz - p.az, len = Math.hypot(dx, dz);
      const t = ((g.x - p.ax) * dx + (g.z - p.az) * dz) / (len * len);
      return t > 0 && t < 1 && Math.abs((g.x - p.ax) * dz - (g.z - p.az) * dx) / len < 0.15 && g.nx * p.nx + g.nz * p.nz > 0.7;
    });
    assert.ok(panel, `no wall panel behind ${g.id}`);
    const spans = kickPlateSpans(panel, grates);
    const len = Math.hypot(panel.bx - panel.ax, panel.bz - panel.az);
    const t = ((g.x - panel.ax) * (panel.bx - panel.ax) + (g.z - panel.az) * (panel.bz - panel.az)) / (len * len);
    assert.ok(!spans.some(([a, b]) => t > a && t < b), `kick plate runs across ${g.id}`);
  }
});

test('generator room fixtures hang on clear walls', async () => {
  const { generatorFixtures, furniturePlacement: fp } = await import('../js/worldplan.js');
  const { panel, sign } = generatorFixtures(layout);
  const plan = planDecor(layout);
  for (const f of [panel, sign]) {
    const nx = Math.sin(f.rot), nz = Math.cos(f.rot);
    assert.ok(layout.walkDistance(f.x + nx * 0.1, f.z + nz * 0.1) > 0, 'faces into the room');
    assert.ok(layout.walkDistance(f.x - nx * 0.1, f.z - nz * 0.1) <= 0.02, 'on a wall');
    for (const d of layout.doors) assert.ok(Math.hypot(cellCenter(d.cx) - f.x, cellCenter(d.cz) - f.z) > f.w / 2 + 0.9, 'clear of the door');
    for (const fu of layout.furniture.filter((q) => q.room === 'generator')) {
      const a = fp(layout, fu);
      assert.ok(Math.hypot(a.x - f.x, a.z - f.z) > 1.2, `${fu.kind} under a generator fixture`);
    }
    for (const list of ['plates', 'tape', 'vents', 'boards']) for (const o of plan[list]) assert.ok(Math.hypot(o.x - f.x, o.z - f.z) > 1.0, `${list} on a generator fixture`);
  }
  assert.ok(plan.stencils.some((s) => s.kind === 'g1'));
});

test('findFootfalls picks out each step in a footsteps recording', async () => {
  const { findFootfalls } = await import('../js/audio.js');
  const rate = 8000, steps = [0.2, 0.75, 1.3, 1.9];
  const samples = new Float32Array(rate * 2.4);
  for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() - 0.5) * 0.004; // room tone
  for (const t of steps) for (let k = 0; k < rate * 0.12; k++) samples[Math.floor(t * rate) + k] += Math.sin(k * 0.3) * Math.exp(-k / (rate * 0.04));
  const found = findFootfalls(samples, rate);
  assert.equal(found.length, steps.length);
  found.forEach((f, i) => { assert.ok(Math.abs(f.t - steps[i]) < 0.04, `step ${i} at ${f.t}`); assert.ok(f.len > 0.2 && f.len <= 0.45); });
});

test('decor, models and loose items keep off the escape pod and its ramp', async () => {
  const { nearPod, podCell, looseItems, extraSeats } = await import('../js/worldplan.js');
  const { modelPlacements } = await import('../js/modelplan.js');
  const plan = planDecor(layout);
  const floorItems = [...plan.stains, ...plan.clutter, ...plan.grates, ...plan.stripes, ...modelPlacements(layout, plan), ...extraSeats(layout)];
  for (const o of floorItems) assert.ok(!nearPod(o.x, o.z, 0.3), `${o.kind ?? o.model ?? 'item'} at ${o.x.toFixed(1)},${o.z.toFixed(1)} is on the pod`);
  for (const p of plan.panels) assert.ok(!podCell(...p.cell), 'a ceiling panel hangs over the pod');
  const items = looseItems(layout, new Set());
  for (const it of items) {
    assert.ok(!nearPod(it.x, it.z, 0.3), 'a loose item on the pod');
    for (const [cx, cz] of it.spots) assert.ok(!podCell(cx, cz), `loose items could be moved to ${cx},${cz} under the pod`);
  }
});

test('noise-makers: a small carry limit, fallback when the chosen kind runs out', async () => {
  const { Inventory, MAX_CARRY } = await import('../js/noisemakers.js');
  const inv = new Inventory();
  assert.equal(inv.take(), null);
  assert.ok(inv.add('echo') && inv.add('shard') && inv.add('buzz'));
  assert.equal(inv.total, MAX_CARRY);
  assert.equal(inv.add('echo'), false, 'hands full');
  inv.select(3);
  assert.equal(inv.take(), 'buzz');
  inv.select(3);
  assert.notEqual(inv.take(), null, 'falls back to another kind');
  assert.equal(inv.total, 1);
});

test('noise-makers go off on schedule, and a Buzz Pod covers footsteps only while it runs', async () => {
  const { ActiveNoise, NOISEMAKERS } = await import('../js/noisemakers.js');
  const run = (type, seconds) => {
    const a = new ActiveNoise(); a.place(type, { x: 10, z: 10 });
    const out = [];
    for (let t = 0; t < seconds; t += 0.05) out.push(...a.update(0.05));
    return { a, out };
  };
  assert.deepEqual(run('echo', 4).out.map((n) => n.loudness), [16, 11, 9]);
  assert.deepEqual(run('shard', 4).out.map((n) => n.loudness), [30]);
  const b = run('buzz', 15).out;
  assert.equal(b.length, Math.ceil(NOISEMAKERS.buzz.life / NOISEMAKERS.buzz.every));
  const a = new ActiveNoise(); a.place('buzz', { x: 10, z: 10 });
  a.update(1);
  assert.equal(a.maskAt(12, 10), NOISEMAKERS.buzz.mask.factor);
  assert.equal(a.maskAt(20, 10), 1);
  for (let t = 0; t < 13; t += 0.5) a.update(0.5);
  assert.equal(a.maskAt(12, 10), 1, 'stops covering once it has run down');
});

test('noise-maker pickups: seven in all, in rooms, off grates and the pod, none in the pod bay', async () => {
  const { pickupPlacements, PICKUPS, CRATE_CONTENTS } = await import('../js/noisemakers.js');
  const { grateSpots } = await import('../js/vents.js');
  const { nearPod } = await import('../js/worldplan.js');
  const spots = pickupPlacements(layout);
  assert.equal(spots.length, PICKUPS.length);
  assert.equal(spots.length + CRATE_CONTENTS.length, 7);
  for (const p of spots) {
    const room = layout.roomAt(Math.floor(p.x / TILE), Math.floor(p.z / TILE));
    assert.ok(room && !room.safe && room.id !== 'pod', `${p.id} in ${room?.id}`);
    assert.equal(room.id, PICKUPS.find((q) => q.id === p.id).room);
    assert.ok(!nearPod(p.x, p.z, 1));
    for (const g of grateSpots(layout)) assert.ok(Math.hypot(g.x - p.x, g.z - p.z) > 1, `${p.id} by grate ${g.id}`);
  }
});

test('click / E skips to the next line: Marigold first, then a tape', async () => {
  const { Intercom } = await import('../js/intercom.js');
  const { TapePlayer } = await import('../js/tapes.js');
  const el = () => ({ hidden: true, textContent: '' });
  const ic = new Intercom(el());
  ic.voice = false;
  for (const t of ['one', 'two', 'three']) ic.say(t);
  ic.update(0.016);
  assert.equal(ic.el.textContent, 'one');
  assert.ok(ic.skip());
  ic.update(0.016);
  assert.equal(ic.el.textContent, 'two');
  ic.skip(); ic.update(0.016); ic.skip(); ic.update(0.016);
  assert.equal(ic.skip(), false, 'nothing left to skip');

  const audio = { tapeStart() {}, tapeStop() {} };
  const tape = new TapePlayer({ audio, intercom: ic, el: { box: el(), head: el(), speaker: el(), line: el() } });
  tape.voice = false;
  tape.play({ id: 'L01', title: 'Test', author: 'Wes', text: 'First sentence here. Second sentence here. Third sentence here.' });
  tape.update(1); // past the lead-in: the first sentence shows
  const first = tape.el.line.textContent;
  assert.ok(tape.skip());
  assert.notEqual(tape.el.line.textContent, first);
  assert.equal(tape.i, 1);
  while (tape.playing) tape.skip();
  assert.equal(tape.playing, false, 'skipping the last sentence ends the tape');
  assert.equal(tape.skip(), false);
});

test('the alien looks and moves differently in each state (Alien Behavior Guide)', async () => {
  const { alienMood, ALIEN_LOOK, poseAlien, alienRig, limbPoints } = await import('../js/alienshape.js');
  for (const state of ['patrol', 'investigate', 'hunt', 'lost', 'listen', 'tear', 'torn', 'waitOther']) {
    assert.ok(ALIEN_LOOK[alienMood({ state, dormant: 0 })], state);
  }
  assert.equal(alienMood({ state: 'hunt', dormant: 5 }), 'dormant');
  assert.equal(alienMood({ state: 'hunt', dormant: 0, warning: true }), 'warn');
  assert.equal(alienMood({ state: 'listen', dormant: 0, rushing: true }), 'hunt');
  // Glow blends: still purple straight after a hunt starts, red a second later.
  const u = {}, al = { pos: { x: 0, z: 0 }, heading: 0, state: 'patrol', dormant: 0 };
  for (let t = 0; t < 2; t += 0.05) poseAlien(u, al, t);
  al.state = 'hunt';
  const red = (p) => p.glow.color[0] > p.glow.color[2];
  assert.ok(!red(poseAlien(u, al, 2.05)), 'no jump on the first frame');
  let p; for (let t = 2.1; t < 3.2; t += 0.05) p = poseAlien(u, al, t);
  assert.ok(red(p), 'red once it has blended');
  assert.ok(p.glow.level > ALIEN_LOOK.patrol.glow);
  // It floats: tentacle tips clear the floor but hang low, in every mood.
  const rig = alienRig();
  for (const mood of ['patrol', 'investigate', 'hunt', 'lost']) {
    const uu = {}, a = { pos: { x: 0, z: 0 }, heading: 0, state: mood, dormant: 0 };
    let q; for (let t = 0; t < 3; t += 0.05) q = poseAlien(uu, a, t);
    const lows = rig.tentacles.map((t) => Math.min(...limbPoints(t, rig.segments, (l, j) => q.joint(l, j)).map((pt) => pt[1])));
    assert.ok(Math.min(...lows) > 0.05 && Math.min(...lows) < 0.6, `${mood}: lowest tip ${Math.min(...lows).toFixed(2)}`);
  }
});

test('a terminal you face beats a nearby grate, and looking at a grate aims at nothing else', async () => {
  const { findTarget } = await import('../js/interact.js');
  const { grateSpots } = await import('../js/vents.js');
  const { propPlacement, propHeight } = await import('../js/worldplan.js');
  // What you can aim at, as world.js builds it: doors and props.
  const items = [
    ...layout.doors.map((d) => ({ id: 'door', kind: 'door', pos: { x: cellCenter(d.cx), y: 1.4, z: cellCenter(d.cz) }, range: 2.6 })),
    ...layout.props.filter((p) => p.kind !== 'scenery').map((p) => { const a = propPlacement(layout, p); return { id: p.id, kind: p.kind, pos: { x: a.x, y: propHeight(p), z: a.z }, range: 2.7 }; }),
  ];
  const rig = new CameraRig();
  const look = (x, y, z, tx, ty, tz) => rig.set(x, y, z, Math.atan2(-(tx - x), -(tz - z)), Math.atan2(ty - y, Math.hypot(tx - x, tz - z)));
  for (const p of layout.props.filter((q) => q.kind === 'log')) {
    const a = propPlacement(layout, p);
    look(a.x + Math.sin(a.rotY) * 1.2, 1.6, a.z + Math.cos(a.rotY) * 1.2, a.x, propHeight(p), a.z);
    assert.equal(findTarget(rig, items)?.id, p.id, `facing terminal ${p.id}`);
  }
  for (const g of grateSpots(layout)) {
    if (g.kind === 'wall') look(g.x + g.nx * 0.7, 0.95, g.z + g.nz * 0.7, g.x, 0.4, g.z); // crouched, looking at the cover
    else rig.set(g.x, 1.6, g.z, 0, -1.35); // standing on it, looking down
    assert.equal(findTarget(rig, items), null, `looking at grate ${g.id}, aimed at ${findTarget(rig, items)?.kind}`);
  }
});

test('the escape pod is a long run from the comms console', () => {
  const [cx, cz] = layout.props.find((p) => p.id === 'comms').cell, [px, pz] = layout.room('pod').spot;
  const path = findPath(grid(), cx, cz + 1, px, pz); // from where you stand at the console
  assert.ok(path && path.length * TILE > 40, `only ${(path?.length ?? 0) * TILE} m`);
});

test('repairs: forcing it (rapid taps) is faster and draws the alien more often than holding', async () => {
  const { REPAIR, forcing } = await import('../js/noise.js');
  assert.ok(forcing([0.2, 0.45, 0.7, 0.95], 1.0));
  assert.ok(!forcing([0.9], 1.0));
  assert.ok(!forcing([0.0, 0.1, 0.2], 1.5), "old taps don't count");
  // Simulate a 4 s generator repair many times with seeded rolls.
  const { seeded } = await import('../js/textures.js');
  const rand = seeded(1234);
  const trial = (mode) => {
    const R = REPAIR[mode], secs = 4 / R.speed;
    const clanks = mode === 'hold' ? Math.ceil(secs / R.every) : Math.round(secs * 4.5); // about 4-5 taps a second
    for (let i = 0; i < clanks; i++) if (rand() < R.carry) return true;
    return false;
  };
  const rate = (mode) => { let n = 0; for (let i = 0; i < 2000; i++) n += trial(mode); return n / 2000; };
  const hold = rate('hold'), tap = rate('tap');
  assert.ok(hold > 0.65 && hold < 0.85, `holding draws it ${hold}`);
  assert.ok(tap > hold + 0.05, `tapping ${tap} vs holding ${hold}`);
  assert.ok(REPAIR.tap.speed > REPAIR.hold.speed && REPAIR.tap.loudness > REPAIR.hold.loudness);
});

test('a repair clank that carries reaches the alien across the station; an ordinary one does not', async () => {
  const { carryHeard, REPAIR } = await import('../js/noise.js');
  const gen = at(layout.props.find((p) => p.id === 'generator').cell);
  const send = (carry) => {
    const a = makeAlien({ start: 'comms' });
    a.dormant = 0;
    const n = { x: gen.x, z: gen.z, loudness: REPAIR.hold.loudness, source: 'player', carry };
    const heard = heardLoudness(layout, n, a.pos, allOpen);
    a.hear(n, carry ? carryHeard(heard, Math.hypot(n.x - a.pos.x, n.z - a.pos.z)) : heard);
    return a.state;
  };
  assert.equal(send(false), 'patrol');
  assert.equal(send(true), 'investigate');
});

test('marigold.txt: parses, covers every line, and fills LINES', async () => {
  const { readFileSync } = await import('node:fs');
  const { parseLines } = await import('../js/textfiles.js');
  const { LINES, applyLines } = await import('../js/intercom.js');
  const sample = parseLines('# note\n\npower: Hi: there\nwinAll: one\nwinAll: two\nblank:\n');
  assert.deepEqual(sample, { power: 'Hi: there', winAll: ['one', 'two'] });
  const map = parseLines(readFileSync(new URL('../text/marigold.txt', import.meta.url), 'utf8'));
  const want = Object.entries(LINES).filter(([k]) => k !== 'intro')
    .flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).map((s) => `${k}.${s}`) : [k]));
  assert.deepEqual(Object.keys(map).sort(), want.sort());
  applyLines(map);
  assert.equal(LINES.door(3), 'Door 3 is open for your convenience.');
  assert.equal(LINES.suiteDoor.quiet, map['suiteDoor.quiet']);
  assert.deepEqual(LINES.winAll, map.winAll);
});

test('noise-makers: each noise names its item, and a spent item is reported once', async () => {
  const { ActiveNoise, NOISEMAKERS } = await import('../js/noisemakers.js');
  const a = new ActiveNoise(); a.place('echo', { x: 10, z: 10 });
  const out = [];
  for (let t = 0; t < NOISEMAKERS.echo.life - 1; t += 0.1) out.push(...a.update(0.1));
  const [item] = a.items;
  assert.ok(out.length && out.every((n) => n.item === item), 'every noise points back to its item');
  assert.equal(item.heard, false);
  assert.deepEqual(a.drainEnded(), [], 'still running');
  for (let t = 0; t < 2; t += 0.1) a.update(0.1);
  assert.deepEqual(a.drainEnded(), [item]);
  assert.deepEqual(a.drainEnded(), [], 'only once');
});

test('posters: every one has its art, hangs in a normal room, clear of doors and of each other', async () => {
  const { existsSync } = await import('node:fs');
  const { posterPlacements, POSTER_ART } = await import('../js/worldplan.js');
  const layout = buildLayout();
  const all = posterPlacements(layout);
  assert.equal(all.length, 24);
  for (const p of all) {
    assert.ok(POSTER_ART[p.id], `${p.id} has an aspect`);
    assert.ok(existsSync(new URL(`../assets/posters/${p.id}.jpg`, import.meta.url)), `${p.id}.jpg exists`);
    const room = layout.room(p.room);
    assert.ok(!room.safe || room.secret, `${p.id} not in a padded suite`);
    // Its whole width stays on this room's wall, and not by a door.
    const along = [Math.cos(p.rot), -Math.sin(p.rot)];
    for (const k of [-p.w / 2, 0, p.w / 2]) {
      const x = p.x + along[0] * k + Math.sin(p.rot) * 0.5, z = p.z + along[1] * k + Math.cos(p.rot) * 0.5;
      const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
      assert.ok(layout.isFloor(cx, cz), `${p.id} edge over floor`);
      assert.ok(!layout.doors.some((d) => Math.abs(d.cx - cx) + Math.abs(d.cz - cz) <= 1), `${p.id} clear of doors`);
    }
  }
  for (const a of all) for (const b of all) {
    if (a === b || a.rot !== b.rot) continue;
    assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= (a.w + b.w) / 2, `${a.id} and ${b.id} don't overlap`);
  }
});

test('teleporter lab: wall pieces clear of the doors, and the room still walkable round the control stand', async () => {
  const { teleporterFixtures } = await import('../js/worldplan.js');
  const layout = buildLayout();
  const room = layout.room('teleporter');
  const f = teleporterFixtures(layout);
  // The sign and protocol hang on the north wall, either side of the door, clear of its frame.
  for (const p of [f.sign, f.protocol]) {
    assert.ok(Math.abs(p.z - room.y * TILE) < 0.05, 'on the north wall');
    assert.ok(Math.abs(p.x - (room.x + room.w / 2) * TILE) - p.w / 2 >= 1.1, 'clear of the door');
    assert.ok(layout.isFloor(Math.floor(p.x / TILE), room.y), 'on the straight part of the wall');
  }
  // The control stand blocks its cell; every open cell is still reachable from the north door.
  assert.ok(layout.isSolid(24, 9));
  assert.ok(!layout.isSolid(...room.spot), "the alien's spot stays open");
  const open = (x, z) => layout.isFloor(x, z) && !layout.isSolid(x, z);
  const seen = new Set(['25,6']), queue = [[25, 6]];
  while (queue.length) {
    const [x, z] = queue.shift();
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
      if (!seen.has(k) && open(nx, nz) && layout.roomAt(nx, nz)?.id === 'teleporter') { seen.add(k); queue.push([nx, nz]); }
    }
  }
  for (let x = room.x; x < room.x + room.w; x++) for (let z = room.y; z < room.y + room.h; z++) {
    if (open(x, z)) assert.ok(seen.has(x + ',' + z), `${x},${z} reachable`);
  }
});

test('cryosleep bay: only through the hidden panel, safe from the alien, and off the maps', async () => {
  const { floorSamples, mapMarkers } = await import('../js/minimap.js');
  const { cryoPods, CRYO_SOLIDS } = await import('../js/cryoplan.js');
  const layout = buildLayout();
  const cryo = layout.room('cryo');
  assert.ok(cryo.secret && cryo.safe);
  // It doesn't touch any other room (a gap of at least one cell all round).
  for (const r of layout.rooms) {
    if (r === cryo) continue;
    const apart = r.x >= cryo.x + cryo.w + 1 || cryo.x >= r.x + r.w + 1 || r.y >= cryo.y + cryo.h + 1 || cryo.y >= r.y + r.h + 1;
    assert.ok(apart, `cryo touches ${r.id}`);
  }
  const panel = layout.doors.find((d) => d.secret);
  assert.ok(panel && panel.startClosed);
  assert.equal(layout.roomAt(panel.cx, panel.cz - 1)?.id, 'wellness', 'the panel is on the Wellness Room wall');
  // Flood from the airlock: with the panel shut the bay can't be reached; open, all of it can.
  const reach = (panelOpen) => {
    const start = layout.room('airlock').spot, seen = new Set([start.join(',')]), queue = [start];
    while (queue.length) {
      const [x, z] = queue.shift();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (seen.has(k) || !layout.isOpen(nx, nz)) continue;
        if (!panelOpen && nx === panel.cx && nz === panel.cz) continue;
        seen.add(k); queue.push([nx, nz]);
      }
    }
    return seen;
  };
  const shut = reach(false), open = reach(true);
  for (let z = cryo.y; z < cryo.y + cryo.h; z++) for (let x = cryo.x; x < cryo.x + cryo.w; x++) {
    if (!layout.isOpen(x, z)) continue;
    assert.ok(!shut.has(x + ',' + z), `${x},${z} reachable without the panel`);
    assert.ok(open.has(x + ',' + z), `${x},${z} unreachable with the panel open`);
    assert.ok(layout.isSafe(x, z) && layout.isSecret(x, z));
  }
  for (const d of layout.doors.filter((q) => q.hidden)) assert.ok(layout.isSafe(d.cx, d.cz) && layout.isSecret(d.cx, d.cz));
  // Pods and desk block their cells; your pod is one of the six.
  for (const [x, z] of CRYO_SOLIDS) assert.ok(layout.isSolid(x, z));
  const pods = cryoPods(layout);
  assert.equal(pods.length, 6);
  assert.equal(pods.filter((p) => p.occupied).length, 1);
  // Maps: hidden floor never includes the bay; no SAFE marker for it even once seen.
  assert.ok(!floorSamples(layout, 3).list.some((f) => layout.isSecret(f.cx, f.cz)));
  assert.ok(floorSamples(layout, 3, { showSecret: true }).list.some((f) => layout.isSecret(f.cx, f.cz)));
  const explored = new Uint8Array(layout.w * layout.h).fill(1);
  assert.ok(!mapMarkers(layout, explored).some((m) => m.kind === 'safe' && Math.floor(m.x) >= cryo.x && Math.floor(m.x) < cryo.x + cryo.w && Math.floor(m.z) >= cryo.y && Math.floor(m.z) < cryo.y + cryo.h));
});

test('achievements: earned once a game, NEW only the first time ever, unknown ids rejected', async () => {
  const { Achievements } = await import('../js/achievements.js');
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const a = new Achievements(storage);
  const first = a.earn('rudeAwakening');
  assert.ok(first && first.isNew && first.name === 'Rude Awakening');
  assert.equal(a.earn('rudeAwakening'), null, 'only once a game');
  assert.deepEqual(a.names, ['Rude Awakening']);
  const next = new Achievements(storage).earn('rudeAwakening');
  assert.ok(next && !next.isNew, 'remembered from before');
  assert.throws(() => a.earn('nope'));
  assert.ok(new Achievements(undefined).earn('rudeAwakening'), 'works with no storage');
  for (const id of ['scholar', 'marathoner', 'coward']) {
    assert.ok(a.earn(id), id);
    assert.equal(a.earn(id), null, `${id} only once a game`);
  }
  assert.deepEqual(a.names, ['Rude Awakening', 'Scholar', 'Marathoner', 'Coward']);
});

test('personalize swaps "Technician" for the player name', async () => {
  const { personalize } = await import('../js/intercom.js');
  assert.equal(personalize('Safe travels, Technician. Technician status: ok.', 'Nathan'), 'Safe travels, Nathan. Nathan status: ok.');
  assert.equal(personalize('Good news, Technician:', '  '), 'Good news, Technician:');
  assert.equal(personalize('Good news, Technician:', ''), 'Good news, Technician:');
  assert.equal(personalize('a maintenance technician', 'Nathan'), 'a maintenance technician');
});
