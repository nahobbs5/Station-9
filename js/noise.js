// The noise system: one shared signal carrying a position and a loudness.
// Loudness is roughly "metres away it can still be heard".
import { traceCells } from './layout.js';

export const LOUDNESS = {
  door: 6,
  repair: 9,
  decoy: 20,
  comms: 22,
  generator: 30,
};

const DOOR_DAMP = 0.45; // each closed door between source and listener
const WALL_DAMP = 0.7;  // each wall cell between them (capped)

export function createNoiseBus() {
  const subs = [];
  return {
    on(fn) { subs.push(fn); },
    // noise: { x, z, loudness, source: 'player' | 'decoy' | 'machine' }
    emit(noise) { for (const fn of subs) fn(noise); },
  };
}

// How loud `noise` is by the time it reaches `to`, after doors and walls muffle it.
export function heardLoudness(layout, noise, to, isDoorClosed) {
  let walls = 0, doors = 0;
  for (const [x, z] of traceCells(noise.x, noise.z, to.x, to.z)) {
    if (!layout.isFloor(x, z)) walls++;
    else if (layout.isDoor(x, z) && isDoorClosed(x, z)) doors++;
  }
  return noise.loudness * DOOR_DAMP ** doors * WALL_DAMP ** Math.min(walls, 4);
}
