// Where things go in the station and how its doors and lights behave each frame, shared by both
// renderers. Plain data and maths; each renderer builds its own meshes from it.
import { TILE, WALL_H, cellCenter, cellOf, key, WINDOWS, SIGN_DOORS } from './layout.js';
import { findPath } from './pathfind.js';
import { wallSpot } from './textures.js';
import { seeded } from './textures.js';
import { wallSegments } from './walls.js';
import { grateSpots } from './vents.js';
import { podFootprint } from './podplan.js';

// Is (x, z) on or within m metres of the escape pod (and its ramp)? Decor and loose items keep off.
export function nearPod(x, z, m = 0) {
  const f = podFootprint();
  return x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m;
}
// Does grid cell (cx, cz) touch the pod's footprint (plus m metres)?
export function podCell(cx, cz, m = 0) {
  const f = podFootprint();
  return cx * TILE < f.x1 + m && (cx + 1) * TILE > f.x0 - m && cz * TILE < f.z1 + m && (cz + 1) * TILE > f.z0 - m;
}

export const LIGHTS = {
  EMERGENCY: { color: 0xff3a22, intensity: 5 },
  POWERED: { color: 0xd8e2ff, intensity: 16 },
  SAFE: { color: 0xeef6ff, intensity: 5 }, // the wellness suites: cool white and steady, on their own circuit
};

// The walls, as flat panels about 2 m wide following the station's outline (js/walls.js), so they
// bend round angled corners and curves. Each 2 m stretch gets one of three finishes, mixed at random
// so it looks patched together over the years. u0/u1: where the panel sits along the wall texture.
export function wallPanels(layout) {
  const rand = seeded(41);
  const panels = [];
  const byLoop = new Map();
  for (const s of wallSegments(layout.shape)) {
    if (!byLoop.has(s.loop)) byLoop.set(s.loop, []);
    byLoop.get(s.loop).push(s);
  }
  for (const segs of byLoop.values()) {
    let u = 0; // metres along this wall
    let variant = 0, nextChange = 0;
    for (const s of segs) {
      let t0 = 0;
      while (t0 < s.len - 1e-6) {
        if (u >= nextChange) { variant = rand() < 0.45 ? 0 : rand() < 0.5 ? 1 : 2; nextChange = Math.floor(u / TILE + 1) * TILE; }
        const step = Math.min(s.len - t0, nextChange - u);
        const k0 = t0 / s.len, k1 = (t0 + step) / s.len;
        panels.push({
          ax: s.ax + (s.bx - s.ax) * k0, az: s.az + (s.bz - s.az) * k0,
          bx: s.ax + (s.bx - s.ax) * k1, bz: s.az + (s.bz - s.az) * k1,
          nx: s.nx, nz: s.nz, u0: u / TILE, u1: (u + step) / TILE, variant,
        });
        t0 += step; u += step;
      }
    }
  }
  return panels;
}

// Dim red guide strips along both sides of every corridor, every metre, turned to follow curves.
// rot: the strip's turn about Y so its length runs along the corridor.
export function guideStrips(layout) {
  const strips = [];
  for (const c of layout.corridors) {
    let next = 0;
    for (const p of c.pts) {
      if (p.s < next) continue;
      next = p.s + 1;
      const cx = cellOf(p.x), cz = cellOf(p.z);
      if (!layout.isCorridor(cx, cz)) continue; // not in rooms or door cells
      for (const side of [-1, 1]) {
        const off = p.r - 0.08;
        const x = p.x - p.tz * side * off, z = p.z + p.tx * side * off;
        // Only along a wall: skip spots that would float in open floor (junctions, wide bends).
        if (layout.walkDistance(x, z) > 0.3) continue;
        strips.push({ x, z, rot: Math.atan2(-p.tz, p.tx) });
      }
    }
  }
  return strips;
}

// A prop stands in its cell, turned to face the middle of its room.
export function propPlacement(layout, p) {
  const room = layout.room(p.room);
  const x = cellCenter(p.cell[0]), z = cellCenter(p.cell[1]);
  return { x, z, rotY: Math.atan2(cellCenter(room.cx) - x, cellCenter(room.cz) - z) };
}

// Where you aim to use a prop (its "pos" for interacting).
export const PROP_HEIGHT = { crate: 0.7, log: 1.0 };
export const propHeight = (p) => PROP_HEIGHT[p.kind] ?? 1;

// Posters: [room, wall side, lines, accent colour, width, height].
export const POSTERS = [
  ['airlock', 'n', ['YOUR LABOR', 'IS OUR', 'FREEDOM.'], '#b3332a'],
  ['crew', 'w', ['YOUR WELLNESS', 'IS OUR', 'WAYPOINT.'], '#2f6e6a'],
  ['storage', 'n', ['SMALL STEPS.', 'BIG', 'POSSIBILITIES.'], '#b3332a'],
  ['generator', 'w', ['POWER', 'KEEPS US', 'TOGETHER.'], '#c8781e'],
  ['comms', 'e', ["WE'RE", 'ALWAYS', 'LISTENING.'], '#b3332a'],
  ['teleporter', 'w', ['STEP IN.', 'STEP OUT.', 'STEP UP.'], '#2f4f6e'],
  ['pod', 'e', ['LEAVING', 'SO SOON?', "WE'LL MISS YOU."], '#b3332a'],
];
// The station map on the control room wall, and the emblem sign in the airlock.
export const WALL_MAP = { room: 'control', side: 'n', w: 2.4, h: 2.1, y: 1.85 };
export const EMBLEM = { room: 'airlock', side: 's', src: 'images/emblem.jpg', frame: 1.9, size: 1.75, y: 1.75 };

// The generator room's wall pieces (after the Main Generator Room sheet): the switch panel in the
// middle of the east wall (between the reactor console and the workbench), and the big G-1 stencil
// on the north wall beside the door. Decor keeps clear of both (js/decorplan.js).
export function generatorFixtures(layout) {
  const room = layout.room('generator');
  return {
    panel: { ...wallSpot(room, 'e'), y: 1.45, w: 1.3, h: 0.72 },
    sign: { ...wallSpot(room, 'n', 0.8), y: 1.75, w: 1.5, h: 0.9 },
  };
}

// Cells kept clear so nothing stands in front of the emblem: the one under it and the one before it.
export function emblemClearCells(layout) {
  const s = wallSpot(layout.room(EMBLEM.room), EMBLEM.side);
  const nx = Math.round(Math.sin(s.rot)), nz = Math.round(Math.cos(s.rot)); // out from the wall
  const cx = cellOf(s.x + nx * 0.5), cz = cellOf(s.z + nz * 0.5);
  return new Set([key(cx, cz), key(cx + nx, cz + nz)]);
}

// Loose chairs and boxes near room walls, away from doors, props and the decor's clutter.
// The prop trick moves them later, using `spots`.
export function looseItems(layout, clutterCells) {
  const rand = seeded(11);
  const keepClear = emblemClearCells(layout);
  const grates = grateSpots(layout); // and nothing parked on or in front of a vent
  const byGrate = (x, z) => grates.some((g) => Math.hypot(g.x - x, g.z - z) < 1.6);
  const spotsOf = (room) => {
    const spots = [];
    for (let z = room.y; z < room.y + room.h; z++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const edge = x === room.x || z === room.y || x === room.x + room.w - 1 || z === room.y + room.h - 1;
        const nearDoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.isDoor(x + dx, z + dz));
        if (edge && !nearDoor && layout.isOpen(x, z) && !clutterCells.has(key(x, z)) && !keepClear.has(key(x, z)) && !byGrate(cellCenter(x), cellCenter(z)) && !podCell(x, z, 0.3)) spots.push([x, z]);
      }
    }
    return spots;
  };
  const items = [];
  for (const room of layout.rooms) {
    if (room.safe) continue;
    const spots = spotsOf(room);
    for (let i = 0; i < 2 && spots.length; i++) {
      const [cx, cz] = spots.splice(Math.floor(rand() * spots.length), 1)[0];
      const x = cellCenter(cx) + (rand() - 0.5) * 0.6, z = cellCenter(cz) + (rand() - 0.5) * 0.6;
      items.push({ kind: i === 0 ? 'chair' : 'box', x, z, rotY: rand() * Math.PI * 2, room, spots });
    }
  }
  return items;
}

// The parts of a wall panel (as fractions 0..1 along it) that keep their kick plate: everything
// except a gap where a wall vent's cover sits (js/vents.js grateSpots), so the cover isn't hidden.
export function kickPlateSpans(p, grates) {
  const dx = p.bx - p.ax, dz = p.bz - p.az, len = Math.hypot(dx, dz) || 1e-6;
  let spans = [[0, 1]];
  for (const g of grates) {
    if (g.kind !== 'wall' || g.nx * p.nx + g.nz * p.nz < 0.7) continue; // other walls
    const t = ((g.x - p.ax) * dx + (g.z - p.az) * dz) / (len * len);
    const off = Math.abs((g.x - p.ax) * dz - (g.z - p.az) * dx) / len;
    const half = (g.w / 2 + 0.05) / len;
    if (off > 0.15 || t + half < 0 || t - half > 1) continue;
    spans = spans.flatMap(([a, b]) => [[a, Math.min(b, t - half)], [Math.max(a, t + half), b]]).filter(([a, b]) => b - a > 1e-4);
  }
  return spans;
}

// How far from (x, z) to the nearest wall heading along (dx, dz), or null if there's none within `max`.
export function wallAlong(layout, x, z, dx, dz, max) {
  if (layout.walkDistance(x + dx * max, z + dz * max) > 0) return null;
  let lo = 0, hi = max;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (layout.walkDistance(x + dx * mid, z + dz * mid) > 0) lo = mid; else hi = mid;
  }
  return lo;
}

// A heavy frame round every door: a jamb on each side where the opening meets the wall, and a
// header across the top that the door slides up into. across: unit direction the door spans.
export const FRAME = { jamb: 0.24, depth: 0.5, header: 0.32, inset: 0.12 }; // inset: how far it stands out from the wall
export function doorFrames(layout) {
  return layout.doors.map((d) => {
    const x = cellCenter(d.cx), z = cellCenter(d.cz);
    const across = d.axis === 'x' ? [0, 1] : [1, 0];
    const max = TILE / 2 + 0.6;
    const lo = wallAlong(layout, x, z, -across[0], -across[1], max) ?? TILE / 2;
    const hi = wallAlong(layout, x, z, across[0], across[1], max) ?? TILE / 2;
    return { x, z, across, lo, hi, axis: d.axis, safe: !!d.safe, yaw: d.axis === 'x' ? Math.PI / 2 : 0 };
  });
}

// A door slides up into the ceiling. d.t is 1 when shut; returns its centre height.
export function stepDoor(d, dt) {
  const target = d.closed ? 1 : 0;
  d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 2.2);
  return WALL_H / 2 + (1 - d.t) * (WALL_H - 0.18);
}

// How bright a room's light is this frame (0..1 times its base), including the Hat Man's blackout and dip,
// random stutters, the emergency hum, and the flicker as the alien passes through on patrol.
export function roomLightLevel(r, dt, time, alien, powered) {
  if (r.blackout) return 0.02; // the Hat Man's power cut
  let k = r.mult;
  if (r.beat > 0) { r.beat -= dt; k *= 0.25; }
  // Now and then a room's light stutters on its own (about once a minute each).
  if (!r.room.safe && dt > 0 && r.glitch <= 0 && Math.random() < dt / 60) r.glitch = 0.3 + Math.random() * 0.9;
  if (r.glitch > 0) { r.glitch -= dt; if (Math.random() < 0.55) k *= 0.15 + Math.random() * 0.3; }
  // Emergency lights hum and stutter a little on their own.
  if (!r.room.safe && (!powered || r.room.id === 'pod')) k *= 0.85 + 0.15 * Math.sin(time * 3 + r.room.index * 1.7);
  const R = r.room;
  const inside = alien && alien.state === 'patrol' &&
    alien.pos.x > R.x * TILE && alien.pos.x < (R.x + R.w) * TILE && alien.pos.z > R.y * TILE && alien.pos.z < (R.y + R.h) * TILE;
  r.haunt = inside ? Math.min(1, r.haunt + dt * 2) : Math.max(0, r.haunt - dt);
  if (r.haunt > 0 && Math.sin(time * 23 + Math.sin(time * 7) * 4) > 0.6) k *= 1 - 0.75 * r.haunt;
  return k;
}

// The teleporter's unsteady blue glow.
export function teleporterLevel(time) {
  const flick = Math.random() < 0.06 ? 0.2 : 1;
  return (4 + 3 * Math.sin(time * 7) ** 2) * flick;
}

// A room's light state, as kept by the renderers.
export function roomState(room) {
  const base = room.safe ? LIGHTS.SAFE : LIGHTS.EMERGENCY;
  return { room, base: { ...base }, mult: 1, beat: 0, haunt: 0, glitch: 0, blackout: false };
}
// Its base colour and strength with or without main power. The pod bay stays red: its own circuit.
export function roomBase(room, powered) {
  if (room.safe) return { ...LIGHTS.SAFE };
  return powered && room.id !== 'pod' ? { ...LIGHTS.POWERED } : { ...LIGHTS.EMERGENCY };
}

// Furniture -------------------------------------------------------------------------------
// How deep each piece is (metres from its back to its front), so it can stand against a wall.
export const FURNITURE_DEPTH = {
  bunk: 0.95, lockers: 0.5, bench: 0.62, shelves: 0.45, bigCrate: 1.0, cart: 0.55, workbench: 0.75,
  desk: 0.75, cabinet: 0.55, sofa: 0.9, plant: 0.45, messTable: 0.9, coffeeTable: 0.6,
};

// Which wall a room-edge cell backs onto: the inward direction (dx, dz) and the turn that faces it.
function wallSide(room, cx, cz) {
  if (cz === room.y) return { dx: 0, dz: 1, rotY: 0 };                 // north wall: face +z
  if (cz === room.y + room.h - 1) return { dx: 0, dz: -1, rotY: Math.PI }; // south wall: face -z
  if (cx === room.x) return { dx: 1, dz: 0, rotY: Math.PI / 2 };       // west wall: face +x
  if (cx === room.x + room.w - 1) return { dx: -1, dz: 0, rotY: -Math.PI / 2 }; // east wall
  return null;
}

// Where a piece stands: x, z and its turn about Y (0 faces +z). Wall pieces back onto the wall.
export function furniturePlacement(layout, f) {
  const room = layout.room(f.room);
  const [cx, cz] = f.cell;
  const side = f.rot === undefined ? wallSide(room, cx, cz) : null;
  if (!side) return { x: cellCenter(cx), z: cellCenter(cz), rotY: f.rot ?? 0 };
  const push = TILE / 2 - (FURNITURE_DEPTH[f.kind] ?? 0.6) / 2 - 0.04; // toward the wall
  return { x: cellCenter(cx) - side.dx * push, z: cellCenter(cz) - side.dz * push, rotY: side.rotY };
}

// Small pieces that go with others: an office chair in front of every console, four chairs
// round the mess table, two stools at the workbench. Each: { kind, x, z, rotY }.
export function extraSeats(layout) {
  const seats = [];
  for (const p of layout.props) {
    if (p.kind !== 'log' && p.kind !== 'console') continue;
    const { x, z, rotY } = propPlacement(layout, p);
    seats.push({ kind: 'officeChair', x: x + Math.sin(rotY) * 0.95, z: z + Math.cos(rotY) * 0.95, rotY: rotY + Math.PI + 0.3 });
  }
  for (const f of layout.furniture) {
    const at = furniturePlacement(layout, f);
    if (f.kind === 'messTable') {
      for (const sx of [-0.45, 0.45]) for (const sz of [-1, 1]) {
        seats.push({ kind: 'messChair', x: at.x + sx, z: at.z + sz * 0.8, rotY: sz > 0 ? Math.PI : 0 });
      }
    } else if (f.kind === 'desk') {
      seats.push({ kind: 'officeChair', x: at.x + Math.sin(at.rotY) * 0.8, z: at.z + Math.cos(at.rotY) * 0.8, rotY: at.rotY + Math.PI - 0.2 });
    } else if (f.kind === 'workbench') {
      for (const s of [-0.4, 0.4]) {
        // Along the bench (its local x), a little out in front of it.
        const c = Math.cos(at.rotY), sn = Math.sin(at.rotY);
        seats.push({ kind: 'stool', x: at.x + c * s + sn * 0.75, z: at.z - sn * s + c * 0.75, rotY: 0 });
      }
    }
  }
  return seats;
}

// Windows onto the planet, on the middle of a room wall.
export function windowPlacements(layout) {
  return WINDOWS.map(([roomId, side]) => ({ ...wallSpot(layout.room(roomId), side), y: 1.6, room: roomId }));
}

// Wayfinding signs on the corridor wall just outside some doors. Each lists rooms with an arrow
// that points along the first step of the real route there. rot: faces into the corridor.
export const SIGN_ROOMS = [['control', 'CONTROL'], ['teleporter', 'RESEARCH LAB'], ['generator', 'GENERATOR'], ['comms', 'COMMS'],
  ['pod', 'ESCAPE POD BAY'], ['storage', 'STORAGE'], ['crew', 'CREW QUARTERS'], ['airlock', 'AIRLOCK']];
export function signPlacements(layout) {
  const grid = { w: layout.w, h: layout.h, passable: (x, z) => layout.isOpen(x, z), cost: () => 1 };
  const signs = [];
  for (const [dcx, dcz] of SIGN_DOORS) {
    // The corridor cell just outside the door, and the room the door belongs to.
    const n4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const out = n4.map(([dx, dz]) => [dcx + dx, dcz + dz]).find(([x, z]) => layout.isCorridor(x, z) && !layout.roomAt(x, z));
    const here = n4.map(([dx, dz]) => layout.roomAt(dcx + dx, dcz + dz)).find((r) => r && layout.isFloor(...[dcx, dcz]));
    if (!out) continue;
    const door = layout.doors.find((d) => d.cx === dcx && d.cz === dcz);
    // The sign hangs on a side wall of the corridor: across the direction you walk through the door.
    const [sx, sz] = door.axis === 'x' ? [0, -1] : [-1, 0];
    const ox = cellCenter(out[0]), oz = cellCenter(out[1]);
    let t = 0;
    while (t < 2.5 && layout.walkDistance(ox + sx * t, oz + sz * t) > 0) t += 0.02;
    const nx = -sx, nz = -sz; // into the corridor, toward you
    // Your right as you face the sign.
    const rx = -(-nz), rz = -nx; // forward is -n; right = (-forward.z, forward.x)
    const entries = [];
    for (const [id, label] of SIGN_ROOMS) {
      if (id === here?.id) continue;
      const room = layout.room(id);
      const path = findPathTo(grid, out, room.spot);
      if (!path || !path.length) continue;
      const [fx, fz] = [path[0][0] - out[0], path[0][1] - out[1]];
      const side = fx * rx + fz * rz;
      const arrow = side > 0.5 ? '→' : side < -0.5 ? '←' : (fx * nx + fz * nz) > 0.5 ? '↓' : '↑';
      entries.push({ id, label, arrow, steps: path.length });
    }
    entries.sort((a, b) => a.steps - b.steps);
    signs.push({ x: ox + sx * (t - 0.03), y: 1.75, z: oz + sz * (t - 0.03), rot: Math.atan2(nx, nz), door: [dcx, dcz], entries: entries.slice(0, 5) });
  }
  return signs;
}

const findPathTo = (grid, [sx, sz], [gx, gz]) => findPath(grid, sx, sz, gx, gz);
