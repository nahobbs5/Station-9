// The noise system: one shared signal carrying a position and a loudness.
// Loudness is the hearing radius in metres (Alien Behavior doc).
import { cellOf, key } from './layout.js';

// Each footstep, by how you're moving.
export const STEP_LOUDNESS = { walk: 6, sprint: 14, crouch: 2 };

export const LOUDNESS = {
  door: 8,
  doorSlam: 12,   // using a door while sprinting
  repair: 18,     // a careful repair's clank (REPAIR.hold); forcing it is louder
  decoy: 16,
  flashlight: 3,
  terminal: 4,
  stash: 3,       // rattling through a crate for Vantora Marks
  comms: 22,
  generator: 30,
};

// Repairs, two ways. Hold E: steady progress, a clank every `every` seconds. Tap E rapidly (`rate`
// presses within a second): faster, a louder clank on every tap, and each clank's chance (`carry`)
// of being heard right across the station adds up much quicker.
export const REPAIR = {
  hold: { loudness: 18, carry: 0.25, every: 0.8, speed: 1 },
  tap: { loudness: 24, carry: 0.2, speed: 1.8, window: 0.35, rate: 3 },
};
// Are these E presses (times in seconds) fast enough to be forcing the repair?
export const forcing = (taps, now) => taps.filter((t) => now - t <= 1).length >= REPAIR.tap.rate;
// A clank that carries reaches the alien wherever it is, just loud enough to send it over (a finite
// value, so a louder noise or a decoy can still pull it away afterwards).
export const carryHeard = (heard, distance) => Math.max(heard, distance + 4);

const DOOR_DAMP = 0.5;  // each closed door halves it
const WALL_DAMP = 0.33; // each solid wall cuts it by about two thirds
const MAX_WALLS = 2;

export function createNoiseBus() {
  const subs = [];
  return {
    on(fn) { subs.push(fn); },
    // noise: { x, z, loudness, source: 'player' | 'decoy' | 'machine' }
    emit(noise) { for (const fn of subs) fn(noise); },
  };
}

// How loud `noise` is by the time it reaches `to`, after doors and walls muffle it.
// Walks the straight line every 0.2 m through the station's shape.
export function heardLoudness(layout, noise, to, isDoorClosed) {
  let walls = 0, doors = 0, inWall = false;
  const dx = to.x - noise.x, dz = to.z - noise.z;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
  const doorsSeen = new Set();
  for (let i = 0; i <= n; i++) {
    const x = noise.x + (dx * i) / n, z = noise.z + (dz * i) / n;
    const solid = layout.walkDistance(x, z) < 0;
    if (solid && !inWall) walls++; // count each wall once, however thick
    inWall = solid;
    const cx = cellOf(x), cz = cellOf(z), k = key(cx, cz);
    if (!solid && !doorsSeen.has(k) && layout.isDoor(cx, cz) && isDoorClosed(cx, cz)) { doorsSeen.add(k); doors++; }
  }
  return noise.loudness * DOOR_DAMP ** doors * WALL_DAMP ** Math.min(walls, MAX_WALLS);
}
