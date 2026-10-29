// Side Hustle: the Vantora Marks stashes (js/stashes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, cellOf } from '../js/layout.js';
import { STASHES, STASH_TOTAL, STASH_VALUE, stashPlacements } from '../js/stashes.js';
import { ACHIEVEMENTS } from '../js/achievements.js';
import { grateSpots } from '../js/vents.js';

const layout = buildLayout();

test('five stashes of 100 make 500, one per room, none in safe or secret rooms', () => {
  assert.equal(STASHES.length, 5);
  assert.equal(STASH_VALUE, 100);
  assert.equal(STASH_TOTAL, 500);
  const rooms = new Set(STASHES.map((s) => s.room));
  assert.equal(rooms.size, STASHES.length);
  for (const id of rooms) {
    const r = layout.room(id);
    assert.ok(r, id);
    assert.ok(!r.safe && !r.secret, `${id} is a safe room`);
  }
});

// Can you stand here? Inside the walls and clear of solid cells by the player's 0.3 m radius.
const R = 0.3, EYE = 1.6, REACH = 2.7; // js/babylon/world.js stash range
function standable(x, z) {
  if (layout.walkDistance(x, z) < R) return false;
  for (const [dx, dz] of [[0, 0], [R, 0], [-R, 0], [0, R], [0, -R]]) if (!layout.isOpen(cellOf(x + dx), cellOf(z + dz))) return false;
  return true;
}

test('every stash sits on its furniture, in its room, within reach from somewhere you can stand', () => {
  const spots = stashPlacements(layout);
  assert.equal(spots.length, STASHES.length, 'a stash is missing its furniture');
  for (const s of spots) {
    assert.equal(layout.roomAt(cellOf(s.x), cellOf(s.z))?.id, s.room, s.id);
    let best = Infinity;
    for (let a = 0; a < 48; a++) for (let r = 0.4; r <= 2.4; r += 0.1) {
      const x = s.x + Math.cos(a * Math.PI / 24) * r, z = s.z + Math.sin(a * Math.PI / 24) * r;
      if (standable(x, z)) best = Math.min(best, Math.hypot(r, EYE - s.y));
    }
    assert.ok(best <= REACH - 0.2, `${s.id} is out of reach (${best.toFixed(2)} m)`);
  }
});

test('the new cargo crates are in open room cells, clear of doors and grates', () => {
  const grates = grateSpots(layout);
  for (const f of layout.furniture.filter((q) => q.kind === 'cargoCrate')) {
    const [x, z] = f.cell;
    assert.ok(!layout.isOpen(x, z) && !layout.isDoor(x, z), `${f.room} crate cell should be solid floor`); // solid furniture blocks its cell
    assert.equal(layout.roomAt(x, z)?.id, f.room);
    assert.ok(!layout.props.some((p) => p.cell[0] === x && p.cell[1] === z), 'shares a cell with a prop');
    assert.equal(layout.furniture.filter((q) => q.cell[0] === x && q.cell[1] === z).length, 1, 'shares a cell with furniture');
    assert.ok(!grates.some((g) => cellOf(g.x) === x && cellOf(g.z) === z), 'on a grate');
  }
});

test('Side Hustle is an achievement', () => {
  assert.ok(ACHIEVEMENTS.some((a) => a.id === 'sideHustle' && a.name === 'Side Hustle'));
});
