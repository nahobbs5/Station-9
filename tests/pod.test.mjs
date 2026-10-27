// The escape pod's placement (js/podplan.js): it fits the bay and leaves the way through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, TILE, ROUTE, cellOf } from '../js/layout.js';
import { findPath } from '../js/pathfind.js';
import { POD, podFootprint } from '../js/podplan.js';

const layout = buildLayout();
const grid = { w: layout.w, h: layout.h, passable: (x, z) => layout.isOpen(x, z) && !layout.isSafe(x, z), cost: () => 1 };

test('pod: it fits inside the Escape Pod Bay, ramp and all', () => {
  const r = layout.room('pod'), f = podFootprint();
  assert.ok(f.x0 > r.x * TILE && f.x1 < (r.x + r.w) * TILE, `x ${f.x0}..${f.x1}`);
  assert.ok(f.z0 > r.y * TILE && f.z1 < (r.y + r.h) * TILE, `z ${f.z0}..${f.z1}`);
  assert.ok(Math.abs(f.x1 - f.x0 - POD.length - POD.rampLength) < 1e-9);
});

test('pod: its cells are solid, and none is a doorway', () => {
  for (const [x, z] of POD.solidCells) {
    assert.ok(layout.isSolid(x, z), `${x},${z}`);
    assert.ok(!layout.isDoor(x, z));
    assert.equal(layout.roomAt(x, z)?.id, 'pod');
  }
});

test('pod: you can still get through the bay, from one door to the other, and the alien still patrols it', () => {
  const doors = layout.doors.filter((d) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.roomAt(d.cx + dx, d.cz + dz)?.id === 'pod'));
  assert.ok(doors.length >= 2, 'two doors into the bay');
  const [a, b] = doors;
  assert.ok(findPath(grid, a.cx, a.cz, b.cx, b.cz), 'door to door');
  const [sx, sz] = layout.room(ROUTE[0]).spot, [px, pz] = layout.room('pod').spot;
  assert.ok(findPath(grid, sx, sz, px, pz), 'patrol reaches the bay');
  assert.ok(!POD.solidCells.some(([x, z]) => x === px && z === pz), 'the bay spot is open floor');
});

test('pod: the door control faces open floor you can stand on', () => {
  const p = POD.panel;
  const standX = p.x + p.facing.x * 0.8, standZ = p.z + p.facing.z * 0.8;
  assert.ok(layout.isOpen(cellOf(standX), cellOf(standZ)), 'room to stand in front of it');
  assert.ok(layout.walkDistance(standX, standZ) > 0.3);
  // It's on the pod's south flank, near the nose.
  assert.ok(Math.abs(p.z - (POD.center.z + POD.width / 2)) < 0.1);
  assert.ok(p.x > POD.center.x && p.x < POD.center.x + POD.length / 2);
});
