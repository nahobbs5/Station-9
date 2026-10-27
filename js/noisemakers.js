// Noise-makers (after the Alien Noise Makers concept sheet): what each kind does, where they're
// found, what you're carrying, and the ones going off on the floor right now. No engine here;
// game.js runs it, js/interact.js throws them, and the renderer draws them.
import { furniturePlacement } from './worldplan.js';

export const MAX_CARRY = 3;

// emits: [seconds after landing, loudness (metres it's heard)]; or every + loudness while it lasts.
// mask: while it runs, your footsteps within radius are multiplied by factor (it covers them).
export const NOISEMAKERS = {
  echo: {
    name: 'Echo Seed', short: 'Echo Seed', key: 1, rolls: true, life: 8,
    emits: [[0, 16], [1.1, 11], [2.3, 9]],
    blurb: 'Rolls and chitters three times.',
  },
  shard: {
    name: 'Resonance Shard', short: 'Shard', key: 2, rolls: false, life: 6,
    emits: [[0, 30]],
    blurb: 'One high ring that carries a long way.',
  },
  buzz: {
    name: 'Buzz Pod', short: 'Buzz Pod', key: 3, rolls: false, life: 12,
    every: 1.5, loudness: 12, mask: { radius: 6, factor: 0.4 },
    blurb: 'Drones for a while and covers your footsteps nearby.',
  },
};
export const TYPES = Object.keys(NOISEMAKERS);

// Where they're found. Single ones sit on top of furniture (`top`: its surface height, `local`:
// x across it and z out from the wall, in its own frame); the Storage crate holds a couple more.
export const PICKUPS = [
  { id: 'nm-crew', type: 'echo', room: 'crew', on: 'messTable', top: 0.775, local: [0.5, -0.2] },
  { id: 'nm-airlock', type: 'echo', room: 'airlock', on: 'bench', top: 0.53, local: [0.56, 0.05] },
  { id: 'nm-comms', type: 'shard', room: 'comms', on: 'cabinet', top: 1.1, local: [0.25, 0] },
  { id: 'nm-teleporter', type: 'buzz', room: 'teleporter', on: 'cabinet', top: 1.1, local: [0.25, 0] },
  { id: 'nm-generator', type: 'echo', room: 'generator', on: 'workbench', top: 0.93, local: [-0.55, 0.2] },
];
export const CRATE_CONTENTS = ['shard', 'buzz'];

// Each single pickup's world spot: { id, type, x, y (surface), z, rotY }.
export function pickupPlacements(layout) {
  return PICKUPS.map((p) => {
    const f = layout.furniture.find((q) => q.room === p.room && q.kind === p.on);
    if (!f) return null;
    const at = furniturePlacement(layout, f);
    const c = Math.cos(at.rotY), s = Math.sin(at.rotY);
    const [lx, lz] = p.local;
    return { id: p.id, type: p.type, x: at.x + lx * c + lz * s, y: p.top, z: at.z - lx * s + lz * c, rotY: at.rotY };
  }).filter(Boolean);
}

// What you're carrying: a count per kind, at most MAX_CARRY in all, and which kind Q throws.
export class Inventory {
  constructor() {
    this.counts = Object.fromEntries(TYPES.map((t) => [t, 0]));
    this.selected = TYPES[0];
    this.found = false; // shown on the HUD once you've picked up the first one
  }
  get total() { return TYPES.reduce((n, t) => n + this.counts[t], 0); }
  get full() { return this.total >= MAX_CARRY; }
  add(type) {
    if (this.full) return false;
    if (!this.found || this.counts[this.selected] === 0) this.selected = type;
    this.counts[type]++;
    this.found = true;
    return true;
  }
  // 1, 2 or 3 picks a kind (even one you have none of, so the HUD shows what you chose).
  select(n) {
    const t = TYPES.find((k) => NOISEMAKERS[k].key === n);
    if (t) this.selected = t;
    return t;
  }
  // The mouse wheel (debug mode, where 1-3 summon apparitions): the next or previous kind.
  cycle(dir) {
    const i = TYPES.indexOf(this.selected);
    this.selected = TYPES[(i + (dir < 0 ? -1 : 1) + TYPES.length) % TYPES.length];
    return this.selected;
  }
  // Take one to throw: the selected kind, or failing that the next one you have. null if none.
  take() {
    const order = [this.selected, ...TYPES.filter((t) => t !== this.selected)];
    const t = order.find((k) => this.counts[k] > 0);
    if (!t) return null;
    this.counts[t]--;
    if (this.counts[t] === 0) this.selected = TYPES.find((k) => this.counts[k] > 0) ?? t;
    return t;
  }
}

// The noise-makers that have landed and are going off: when each makes its noise, and how
// much a running Buzz Pod covers your footsteps.
export class ActiveNoise {
  constructor() { this.items = []; this.ended = []; }
  // pos: where it is, read each time it goes off (a live object, so a rolling Echo Seed's later
  // chitters come from where it rolled to).
  place(type, pos) {
    this.items.push({ type, pos, age: 0, next: 0, step: 0, heard: false });
  }
  // Advance time; returns the noises due now: [{ x, z, loudness, type, first, item }]. The game
  // marks item.heard when the alien hears one.
  update(dt) {
    const out = [];
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], def = NOISEMAKERS[it.type];
      if (def.emits) {
        while (it.step < def.emits.length && def.emits[it.step][0] <= it.age) {
          out.push({ x: it.pos.x, z: it.pos.z, loudness: def.emits[it.step][1], type: it.type, first: it.step === 0, item: it });
          it.step++;
        }
      } else if (it.age >= it.next && it.age < def.life) {
        out.push({ x: it.pos.x, z: it.pos.z, loudness: def.loudness, type: it.type, first: it.next === 0, item: it });
        it.next += def.every;
      }
      it.age += dt;
      if (it.age >= def.life) this.ended.push(...this.items.splice(i, 1));
    }
    return out;
  }
  // Items that ran out since the last call.
  drainEnded() { const e = this.ended; this.ended = []; return e; }
  // Multiplier for your footstep noise at (x, z): lower near a running Buzz Pod.
  maskAt(x, z) {
    let k = 1;
    for (const it of this.items) {
      const m = NOISEMAKERS[it.type].mask;
      if (m && Math.hypot(it.pos.x - x, it.pos.z - z) <= m.radius) k = Math.min(k, m.factor);
    }
    return k;
  }
}
