// The wellness suites (js/suiteplan.js): layout, equipment and padding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, TILE, FURNITURE } from '../js/layout.js';
import { wallPanels } from '../js/worldplan.js';
import { Alien } from '../js/alien.js';
import { SUITES, SUITE_SOLIDS, planSuite, inSuite, paddedSuite, graffitiWall } from '../js/suiteplan.js';

const layout = buildLayout();
const bounds = (id) => {
  const r = layout.room(id);
  return { x0: r.x * TILE, z0: r.y * TILE, x1: (r.x + r.w) * TILE, z1: (r.y + r.h) * TILE };
};
const inside = (b, x, z, pad = 0) => x >= b.x0 + pad && x <= b.x1 - pad && z >= b.z0 + pad && z <= b.z1 - pad;

test('suites: Suite A is 8 x 8 m, Suite B stays 6 x 6 m, both safe', () => {
  const a = layout.room('wellness'), b = layout.room('quiet');
  assert.deepEqual([a.w, a.h], [4, 4]);
  assert.deepEqual([b.w, b.h], [3, 3]);
  assert.ok(a.safe && b.safe);
});

test('suites: every piece of equipment is inside its room', () => {
  for (const id of Object.keys(SUITES)) {
    const b = bounds(id);
    for (const p of planSuite(layout, id)) assert.ok(inside(b, p.x, p.z), `${id} ${p.kind} at ${p.x},${p.z}`);
  }
});

test('suites: Suite A has the ring, three gurneys, and an IV, monitor and rack for each', () => {
  const count = (k) => planSuite(layout, 'wellness').filter((p) => p.kind === k).length;
  assert.equal(count('ring'), 1);
  assert.equal(count('gurney'), 3);
  assert.equal(count('iv'), 3);
  assert.equal(count('rack'), 3);
  assert.ok(count('heartMonitor') >= 3);
  assert.equal(count('kiosk'), 1);
  // The ring stands in the middle of the room.
  const ring = planSuite(layout, 'wellness').find((p) => p.kind === 'ring');
  const b = bounds('wellness');
  assert.equal(ring.x, (b.x0 + b.x1) / 2);
  assert.equal(ring.z, (b.z0 + b.z1) / 2);
});

test('suites: the graffiti covers Suite B west wall from 0.3 to 2.4 m, and the chair faces it', () => {
  const b = bounds('quiet');
  const g = graffitiWall(layout);
  assert.ok(Math.abs(g.x - b.x0) < 0.05, 'on the west wall');
  assert.ok(Math.abs(g.y - g.size[2] / 2 - 0.3) < 1e-9 && Math.abs(g.y + g.size[2] / 2 - 2.4) < 1e-9);
  const chair = planSuite(layout, 'quiet').find((p) => p.kind === 'chair');
  // rotY 0 faces +z; facing west means its forward vector points to -x.
  assert.ok(Math.sin(chair.rotY) < -0.99, 'chair faces west');
  assert.ok(chair.x - b.x0 < 2, 'close enough to read it');
});

test('suites: the gurney cells are the solid cells, and they block movement', () => {
  const cells = Object.keys(SUITES).flatMap((id) => planSuite(layout, id).filter((p) => p.solid).map((p) => p.cell.join(',')));
  assert.deepEqual(cells.sort(), SUITE_SOLIDS.map((c) => c.join(',')).sort());
  for (const [x, z] of SUITE_SOLIDS) assert.ok(layout.isSolid(x, z), `${x},${z} solid`);
});

test('suites: from the door you can reach every open cell (the beds never wall anything off)', () => {
  for (const id of Object.keys(SUITES)) {
    const r = layout.room(id);
    const door = layout.doors.find((d) => d.safe && Math.abs(d.cx - (r.x + r.w / 2)) <= r.w / 2 + 1 && Math.abs(d.cz - (r.y + r.h / 2)) <= r.h / 2 + 1);
    assert.ok(door, `${id} has a door`);
    const open = (x, z) => layout.isFloor(x, z) && !layout.isSolid(x, z);
    const seen = new Set([door.cx + ',' + door.cz]);
    const queue = [[door.cx, door.cz]];
    while (queue.length) {
      const [x, z] = queue.shift();
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (seen.has(k) || !open(nx, nz)) continue;
        if (!layout.roomAt(nx, nz) || layout.roomAt(nx, nz).id !== id) continue;
        seen.add(k);
        queue.push([nx, nz]);
      }
    }
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
      if (open(x, z)) assert.ok(seen.has(x + ',' + z), `${id}: ${x},${z} cut off`);
    }
  }
});

test('suites: the alien can never step into either suite', () => {
  const alien = new Alien(layout, { start: 'teleporter', rand: () => 0.5 });
  for (const id of Object.keys(SUITES)) {
    const r = layout.room(id);
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) assert.equal(alien.passable(x, z), false);
  }
});

test('suites: inSuite knows where you are', () => {
  const a = bounds('wellness'), b = bounds('quiet');
  assert.equal(inSuite(layout, { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 }), 'wellness');
  assert.equal(inSuite(layout, { x: b.x0 + 0.5, z: b.z1 - 0.5 }), 'quiet');
  assert.equal(inSuite(layout, { x: a.x0 - 0.5, z: a.z0 + 1 }), null);
  const crew = layout.room('crew');
  assert.equal(inSuite(layout, { x: (crew.cx + 0.5) * TILE, z: (crew.cz + 0.5) * TILE }), null);
});

test('suites: the padding covers both suites and nowhere else', () => {
  const padded = wallPanels(layout).map((p) => paddedSuite(layout, p)).filter(Boolean);
  assert.ok(padded.includes('wellness') && padded.includes('quiet'));
  // Suite A's outline is about 32 m round (less the doorway); Suite B's about 24 m.
  const len = (id) => wallPanels(layout).filter((p) => paddedSuite(layout, p) === id).reduce((s, p) => s + Math.hypot(p.bx - p.ax, p.bz - p.az), 0);
  assert.ok(len('wellness') > 26 && len('wellness') < 33, `wellness ${len('wellness')}`);
  assert.ok(len('quiet') > 18 && len('quiet') < 25, `quiet ${len('quiet')}`);
});

test('suites: no other furniture in the suites', () => {
  assert.equal(FURNITURE.filter((f) => f.room in SUITES).length, 0);
});

test('suites: Suite B has a notebook on the floor, clear of the beds and chair', () => {
  const b = bounds('quiet');
  const pieces = planSuite(layout, 'quiet');
  const books = pieces.filter((p) => p.kind === 'notebook');
  assert.equal(books.length, 1);
  const [n] = books;
  assert.ok(inside(b, n.x, n.z, 0.2), 'inside the room');
  assert.ok(n.y > 0.012 && n.y < 0.05, 'on the floor, above the padded mats');
  assert.ok(!layout.isSolid(Math.floor(n.x / TILE), Math.floor(n.z / TILE)), 'not on a solid cell');
  const chair = pieces.find((p) => p.kind === 'chair');
  assert.ok(Math.hypot(n.x - chair.x, n.z - chair.z) > 0.6, 'clear of the chair');
});

test('suites: only the Quiet Room bed has the bloody pillow', () => {
  const bloody = Object.keys(SUITES).flatMap((id) => planSuite(layout, id).filter((p) => p.kind === 'gurney' && p.bloody).map(() => id));
  assert.deepEqual(bloody, ['quiet']);
});
