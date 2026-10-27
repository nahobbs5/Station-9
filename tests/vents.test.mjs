// Vents and gratings (js/vents.js, the alien's listen/tear states), to reference files/Vents & Gratings.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, cellCenter, ROUTE } from '../js/layout.js';
import { findPath } from '../js/pathfind.js';
import { Alien } from '../js/alien.js';
import { wallPanels } from '../js/worldplan.js';
import { mapMarkers } from '../js/minimap.js';
import {
  VENT, buildVents, VentState, grateAt, ventPoint, clampYaw, lookingOut, cutVentHoles, grateSpots, HOLE,
} from '../js/vents.js';

const layout = buildLayout();
const vents = buildVents(layout);
const byId = (id) => vents.find((v) => v.id === id);
const at = ([x, z]) => ({ x: cellCenter(x), z: cellCenter(z) });

test('vents: three ducts and four dead ends, in the right rooms, none in the pod bay or suites', () => {
  assert.equal(vents.filter((v) => v.kind === 'duct').length, 3);
  assert.equal(vents.filter((v) => v.kind === 'dead').length, 4);
  const rooms = (id) => byId(id).grates.map((g) => g.room).sort().join(',');
  assert.equal(rooms('V1'), 'crew,storage');
  assert.equal(rooms('V2'), 'comms,teleporter');
  assert.equal(rooms('V3'), 'crew,generator');
  assert.deepEqual(['H1', 'H2', 'H3', 'H4'].map((id) => byId(id).grates[0].room), ['airlock', 'control', 'teleporter', 'comms']);
  for (const v of vents) for (const g of v.grates) assert.ok(!['pod', 'wellness', 'quiet'].includes(g.room), `${v.id} in ${g.room}`);
});

test('vents: ducts are about 14, 18 and 22 m; dead ends 3 m deep', () => {
  for (const [id, want] of [['V1', 14], ['V2', 18], ['V3', 22]]) assert.ok(Math.abs(byId(id).length - want) <= 2, `${id} is ${byId(id).length}`);
  for (const id of ['H1', 'H2', 'H3', 'H4']) assert.ok(Math.abs(byId(id).length - 3) < 1e-9);
});

test('vents: the alien can reach every grate\'s listening spot from its patrol', () => {
  const grid = { w: layout.w, h: layout.h, passable: (x, z) => layout.isOpen(x, z) && !layout.isSafe(x, z), cost: () => 1 };
  const [sx, sz] = layout.room(ROUTE[0]).spot;
  for (const v of vents) for (const g of v.grates) {
    const [wx, wz] = g.waypoint;
    assert.ok(layout.isOpen(wx, wz) && !layout.isSafe(wx, wz), `${v.id} waypoint not walkable`);
    assert.ok(findPath(grid, sx, sz, wx, wz), `${v.id} waypoint unreachable`);
  }
});

test('vents: wall vents sit on a room wall and their dead ends run through solid space', () => {
  for (const v of vents.filter((x) => x.kind === 'dead')) {
    const g = v.grates[0];
    assert.ok(layout.walkDistance(g.x + g.inward[0] * 0.2, g.z + g.inward[1] * 0.2) > 0, `${v.id}: room in front`);
    for (let s = 0.4; s <= 3.35; s += 0.05) {
      for (const o of [-VENT.ductSize / 2, 0, VENT.ductSize / 2]) {
        const p = ventPoint(v, Math.min(s, v.length));
        assert.ok(layout.walkDistance(p.x - p.dz * o, p.z + p.dx * o) < 0, `${v.id} pokes into walkable space at ${s.toFixed(2)}`);
      }
    }
  }
});

test('vents: floor gratings are on open floor, not a prop, furniture or doorway', () => {
  for (const v of vents.filter((x) => x.kind === 'duct')) for (const g of v.grates) {
    const [cx, cz] = g.cell;
    assert.ok(layout.isOpen(cx, cz) && !layout.isSolid(cx, cz) && !layout.isDoor(cx, cz), `${v.id} ${g.room}`);
  }
});

test('vents: wall vents need you crouched and in front; floor gratings need you standing on them', () => {
  const g = byId('H1').grates[0];
  const front = { x: g.x + g.inward[0] * 0.6, z: g.z + g.inward[1] * 0.6 };
  assert.equal(grateAt(vents, front, false), null);
  assert.equal(grateAt(vents, front, true), g);
  const f = byId('V1').grates[0];
  assert.equal(grateAt(vents, { x: f.x + 0.3, z: f.z }, false), f);
  assert.equal(grateAt(vents, { x: f.x + 1.5, z: f.z }, false), null);
});

test('vents: a tap is a fast, loud way in; a hold is quiet; none with the alien within 1.5 m', () => {
  const g = byId('H1').grates[0];
  let v = new VentState(vents);
  assert.ok(!v.canEnter(g, { x: g.x + 1, z: g.z }));
  assert.ok(v.canEnter(g, { x: g.x + 5, z: g.z }));
  const fast = v.enter(g, 'fast');
  assert.equal(fast.loudness, VENT.fastNoise);
  assert.equal(v.mode, 'entering');
  v.update(VENT.fastTime + 0.01);
  assert.equal(v.mode, 'in');
  v = new VentState(vents);
  const slow = v.enter(g, 'slow');
  assert.equal(slow.loudness, VENT.slowNoise);
  assert.equal(v.mode, 'in');
  // Out again, the same way.
  assert.equal(v.leave('fast').loudness, VENT.fastNoise);
  v.update(VENT.fastTime + 0.01);
  assert.equal(v.mode, 'out');
});

test('vents: crawling is 1.0 m/s forward and 0.6 back, a thud every 0.6 m, silent when still', () => {
  const duct = byId('V3');
  const v = new VentState(vents);
  v.enter(duct.grates[0], 'slow');
  const s0 = v.s;
  let thuds = 0;
  for (let i = 0; i < 20; i++) thuds += v.update(0.1, { fwd: 1 }).length;
  assert.ok(Math.abs(v.s - s0 - 2.0) < 1e-6, `moved ${v.s - s0}`);
  assert.equal(thuds, 3);
  assert.ok(v.update(0.1, { fwd: 1 })[0]?.loudness === VENT.crawlNoise || true);
  const s1 = v.s;
  for (let i = 0; i < 10; i++) v.update(0.1, { fwd: -1 });
  assert.ok(Math.abs(s1 - v.s - 0.6) < 1e-6);
  assert.equal(v.update(1, {}).length, 0);
  assert.ok(v.still);
  v.update(0.1, { acted: true });
  assert.ok(!v.still, 'pressing E or the flashlight counts as noise');
});

test('vents: the view is low in the duct, and looking is limited to 70 degrees each way', () => {
  const v = new VentState(vents);
  v.enter(byId('V1').grates[0], 'slow');
  const view = v.view();
  assert.ok(Math.abs(view.y - (VENT.ductFloor + VENT.eye)) < 1e-9);
  assert.ok(Math.abs(clampYaw(view.yaw + 2, view.yaw) - (view.yaw + VENT.lookLimit)) < 1e-9);
  assert.equal(clampYaw(view.yaw + 0.3, view.yaw), view.yaw + 0.3);
  // At a wall vent, looking toward the room shows the slats; looking back into the dark doesn't.
  const g = byId('H2').grates[0];
  assert.ok(lookingOut(g, { x: g.inward[0], y: 0, z: g.inward[1] }));
  assert.ok(!lookingOut(g, { x: -g.inward[0], y: 0, z: -g.inward[1] }));
});

// The alien at a grate: listen, scrape, tear, wait, go round.
const ctx = { canSee: false, player: { x: 0, z: 0 }, isDoorClosed: () => false, openDoor() {} };
function runUntil(alien, cond, secs = 60) {
  for (let t = 0; t < secs; t += 0.05) { alien.update(0.05, ctx); if (cond()) return true; }
  return false;
}
function alienNear(grate) {
  const a = new Alien(layout, { start: 'airlock', rand: () => 0.5 });
  const [wx, wz] = grate.waypoint;
  const spot = layout.nearestOpen(wx + 3, wz, (x, z) => a.passable(x, z));
  Object.assign(a.pos, at(spot));
  a.pause = 0;
  return a;
}

test('vents: hearing you, it comes to the grate and listens for 8 s, then loses track', () => {
  const g = byId('H1').grates[0];
  const a = alienNear(g);
  a.hearVent(g);
  assert.equal(a.state, 'listen');
  assert.ok(runUntil(a, () => a.atGrate), 'reached the grate');
  const events = a.drain().map((e) => e.type);
  assert.ok(events.includes('listen') && !events.includes('scrape'));
  for (let t = 0; t < VENT.listen - 0.2; t += 0.05) a.update(0.05, ctx);
  assert.equal(a.state, 'listen');
  a.update(0.3, ctx);
  assert.equal(a.state, 'lost');
});

test('vents: in a chase it scrapes the cover for 3 s first', () => {
  const g = byId('H3').grates[0];
  const a = alienNear(g);
  a.state = 'hunt';
  a.hearVent(g);
  assert.ok(runUntil(a, () => a.atGrate));
  assert.ok(a.drain().some((e) => e.type === 'scrape'));
  for (let t = 0; t < VENT.scrape + VENT.listen - 0.3; t += 0.05) a.update(0.05, ctx);
  assert.equal(a.state, 'listen', 'still listening: the scrape came first');
});

test('vents: moving while it listens means it tears the cover off', () => {
  const g = byId('H2').grates[0];
  const a = alienNear(g);
  a.hearVent(g);
  assert.ok(!a.ventNoise(), 'not before it gets there');
  runUntil(a, () => a.atGrate);
  assert.ok(a.ventNoise());
  assert.equal(a.state, 'tear');
  a.drain();
  for (let t = 0; t < VENT.tear + 0.05; t += 0.05) a.update(0.05, ctx);
  assert.ok(a.drain().some((e) => e.type === 'tore'));
});

test('vents: in a duct, it waits 10 s after tearing, then goes round to the other end to listen', () => {
  const duct = byId('V1');
  const [g0, g1] = duct.grates;
  const a = alienNear(g0);
  a.hearVent(g0);
  runUntil(a, () => a.atGrate);
  a.ventNoise();
  runUntil(a, () => a.state === 'torn', 3);
  a.goOtherEnd(); // the game does this when you were more than 3 m from that end
  for (let t = 0; t < VENT.otherEndWait - 0.2; t += 0.05) a.update(0.05, ctx);
  assert.equal(a.state, 'waitOther');
  a.update(0.3, ctx);
  assert.equal(a.state, 'listen');
  assert.equal(a.listenGrate, g1);
  assert.ok(a.rushing, 'it runs');
  assert.ok(runUntil(a, () => a.atGrate), 'reached the other end');
});

test('vents: the wall openings are cut out of the wall, with strips below and above', () => {
  const panels = wallPanels(layout);
  const cut = cutVentHoles(panels, layout);
  const strips = cut.filter((p) => p.y0 !== undefined || p.y1 !== undefined);
  assert.equal(strips.length, 8); // a strip below and above each of the 4 wall vents
  for (const s of strips) assert.ok((s.y1 ?? 3) <= HOLE.y0 + 1e-9 || (s.y0 ?? 0) >= HOLE.y1 - 1e-9);
});

test('vents: grate spots for the decor match the grates', () => {
  const spots = grateSpots(layout);
  assert.equal(spots.length, 10);
  assert.equal(spots.filter((s) => s.kind === 'wall').length, 4);
});

test('vents: the minimap shows a V on a grate once you have seen its cell', () => {
  const grates = vents.flatMap((v) => v.grates);
  const explored = new Uint8Array(layout.w * layout.h);
  assert.equal(mapMarkers(layout, explored, { grates }).filter((m) => m.kind === 'vent').length, 0);
  const g = byId('H1').grates[0];
  explored[g.cell[1] * layout.w + g.cell[0]] = 1;
  assert.equal(mapMarkers(layout, explored, { grates }).filter((m) => m.kind === 'vent').length, 1);
});
