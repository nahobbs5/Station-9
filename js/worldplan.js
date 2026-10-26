// Where things go in the station and how its doors and lights behave each frame, shared by both
// renderers. Plain data and maths; each renderer builds its own meshes from it.
import { TILE, WALL_H, cellCenter, key } from './layout.js';
import { seeded } from './textures.js';

export const LIGHTS = {
  EMERGENCY: { color: 0xff3a22, intensity: 5 },
  POWERED: { color: 0xd8e2ff, intensity: 16 },
  SAFE: { color: 0xffe2b0, intensity: 5 }, // safe rooms: warm and steady, on their own circuit
};

// Every empty cell that touches floor gets a wall block, in one of three finishes mixed at random
// so it looks patched together over the years.
export function wallCells(layout) {
  const cells = [];
  for (let z = -1; z <= layout.h; z++) {
    for (let x = -1; x <= layout.w; x++) {
      if (layout.isFloor(x, z)) continue;
      let touches = false;
      for (let dz = -1; dz <= 1 && !touches; dz++)
        for (let dx = -1; dx <= 1 && !touches; dx++) touches = layout.isFloor(x + dx, z + dz);
      if (touches) cells.push([x, z]);
    }
  }
  const rand = seeded(41);
  return cells.map(([x, z]) => ({ x, z, variant: rand() < 0.45 ? 0 : rand() < 0.5 ? 1 : 2 }));
}

// Dim red guide strips along both sides of every corridor cell.
export function guideStrips(layout) {
  const strips = [];
  for (let z = 0; z < layout.h; z++) {
    for (let x = 0; x < layout.w; x++) {
      if (!layout.isCorridor(x, z)) continue;
      const alongX = layout.isFloor(x - 1, z) && layout.isFloor(x + 1, z);
      for (const side of [-1, 1]) {
        strips.push(alongX
          ? { x: cellCenter(x), z: cellCenter(z) + side * 0.92, rot: 0 }
          : { x: cellCenter(x) + side * 0.92, z: cellCenter(z), rot: Math.PI / 2 });
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
  ['airlock', 'n', ['CLOSER', 'EVERY', 'DAY.'], '#b3332a'],
  ['crew', 'w', ['YOUR WELLNESS', 'IS OUR', 'WAYPOINT.'], '#2f6e6a'],
  ['wellness', 's', ['BREATHE IN.', 'BREATHE OUT.', 'STAY.'], '#2f6e6a', 1.1, 1.65],
  ['quiet', 'w', ['SHHH.', 'MARIGOLD', 'IS LISTENING.'], '#b3332a', 1.1, 1.65],
  ['storage', 'w', ['SMALL STEPS.', 'BIG', 'POSSIBILITIES.'], '#b3332a'],
  ['generator', 'w', ['POWER IS A', 'PRIVILEGE.', 'EARN IT.'], '#2f6e4a'],
  ['comms', 'e', ["WE'RE", 'ALWAYS', 'LISTENING.'], '#b3332a'],
  ['teleporter', 'w', ['STEP IN.', 'STEP OUT.', 'STEP UP.'], '#2f4f6e'],
  ['pod', 's', ['LEAVING', 'SO SOON?', "WE'LL MISS YOU."], '#b3332a'],
];
// The station map on the control room wall, and the emblem sign in the airlock.
export const WALL_MAP = { room: 'control', side: 'n', w: 2.4, h: 2.1, y: 1.85 };
export const EMBLEM = { room: 'airlock', side: 's', src: 'images/emblem.jpg', frame: 1.9, size: 1.75, y: 1.75 };

// Loose chairs and boxes near room walls, away from doors, props and the decor's clutter.
// The prop trick moves them later, using `spots`.
export function looseItems(layout, clutterCells) {
  const rand = seeded(11);
  const spotsOf = (room) => {
    const spots = [];
    for (let z = room.y; z < room.y + room.h; z++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const edge = x === room.x || z === room.y || x === room.x + room.w - 1 || z === room.y + room.h - 1;
        const nearDoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.isDoor(x + dx, z + dz));
        if (edge && !nearDoor && layout.isOpen(x, z) && !clutterCells.has(key(x, z))) spots.push([x, z]);
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

// A door slides up into the ceiling. d.t is 1 when shut; returns its centre height.
export function stepDoor(d, dt) {
  const target = d.closed ? 1 : 0;
  d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 2.2);
  return WALL_H / 2 + (1 - d.t) * (WALL_H - 0.18);
}

// How bright a room's light is this frame (0..1 times its base), including the Hat Man's dip,
// random stutters, the emergency hum, and the flicker as the alien passes through on patrol.
export function roomLightLevel(r, dt, time, alien, powered) {
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
  return { room, base: { ...base }, mult: 1, beat: 0, haunt: 0, glitch: 0 };
}
// Its base colour and strength with or without main power. The pod bay stays red: its own circuit.
export function roomBase(room, powered) {
  if (room.safe) return { ...LIGHTS.SAFE };
  return powered && room.id !== 'pod' ? { ...LIGHTS.POWERED } : { ...LIGHTS.EMERGENCY };
}
