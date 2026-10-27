// Vents and gratings (reference files/Vents & Gratings.md): quick, risky hiding places. The alien
// can't come in, but it hears what you do inside, comes to the grate and listens. Stay perfectly
// still and it gives up; move and it tears the cover off. Dead ends (H1-H4) are wall vents into the
// dark behind a room wall; connecting ducts (V1-V3) start at floor gratings and run under the floor.
// Plain data and rules, no engine: js/babylon/vents.js draws them, js/game.js wires them in.
import { TILE, cellCenter } from './layout.js';

// Tuning, from the doc's "Start" column.
export const VENT = {
  listen: 8,          // seconds the alien listens at the grate
  slowHold: 1.5,      // hold E this long to slip in (or out) quietly
  fastTime: 0.6,      // a tap gets you in (or out) this fast...
  tapMax: 0.25,       // ...a press shorter than this counts as a tap
  slowNoise: 3,       // metres: the cover lifting slowly
  fastNoise: 8,       // metres: the cover clanging
  crawlFwd: 1.0,      // m/s
  crawlBack: 0.6,     // m/s
  crawlNoise: 3,      // metres, per thud
  thudEvery: 0.6,     // metres crawled per thud
  otherEndWait: 10,   // seconds before it runs to a duct's other end
  scrape: 3,          // seconds hitting the cover first, in a chase
  tear: 1,            // seconds to tear the cover off
  tearCatch: 3,       // in a duct, caught only within this of the torn end
  noEnter: 1.5,       // can't get in with the alien this close
  eye: 0.35,          // camera height above the duct floor
  lookLimit: (70 * Math.PI) / 180,
  fovNarrow: (10 * Math.PI) / 180,
  ductFloor: -0.75,   // under-floor ducts run from here up to -0.05 m
  ductSize: 0.7,
  wallVentReach: 1.1, // metres from a wall vent you can use it from (crouched)
  gratingReach: 0.6,  // metres from a floor grating's centre
  exitReach: 0.9,     // metres from a duct end to climb out
  slatsReach: 0.8,    // metres from a grate the slats show (looking out)
};

// Where they are. Wall vents: [id, room, cell, wall side]. Ducts: [id, [room, cell] x 2, bends (metres)].
const DEAD_ENDS = [
  ['H1', 'airlock', [9, 22], 'w'],
  ['H2', 'control', [13, 5], 's'],
  ['H3', 'teleporter', [23, 8], 'w'],
  ['H4', 'comms', [23, 16], 'w'],
];
const DUCTS = [
  ['V1', ['storage', [18, 20]], ['crew', [15, 13]], []], // Storage (now beside the airlock) up to Crew Quarters
  ['V2', ['teleporter', [26, 9]], ['comms', [26, 15]], [[48, 22], [48, 28]]],
  ['V3', ['crew', [13, 13]], ['generator', [4, 7]], [[13, 22]]],
];
// Wes's card, taped inside V3, this far along it.
export const WES_CARD = { vent: 'V3', s: 9, text: 'It cannot come in here.\nIt can hear you, though.\nBe still.\n– W.C.' };

const INWARD = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };
const len2 = (a, b) => Math.hypot(b.x - a.x, b.z - a.z);

// Build the vents for a layout. Each: { id, kind, grates: [grate], pts: [{x, y, z, s}], length }.
// A grate: { vent, end (0 or 1: which end of the path), room, kind: 'wall' | 'floor', x, y, z,
//   inward: [x, z] (wall vents: into the room), cell, waypoint: [cx, cz] (where the alien listens) }.
export function buildVents(layout) {
  const vents = [];
  for (const [id, room, cell, side] of DEAD_ENDS) {
    const [ix, iz] = INWARD[side];
    // The cover sits on the wall: the cell's edge on that side, centred along it.
    const x = side === 'w' ? cell[0] * TILE : side === 'e' ? (cell[0] + 1) * TILE : cellCenter(cell[0]);
    const z = side === 'n' ? cell[1] * TILE : side === 's' ? (cell[1] + 1) * TILE : cellCenter(cell[1]);
    const grate = { room, kind: 'wall', x, y: 0.4, z, inward: [ix, iz], cell, waypoint: cell, end: 0 };
    const pts = [{ x, y: 0, z }, { x: x - ix * 3, y: 0, z: z - iz * 3 }];
    vents.push(finish({ id, kind: 'dead', grates: [grate], pts }));
  }
  for (const [id, [r0, c0], [r1, c1], bends] of DUCTS) {
    const a = { x: cellCenter(c0[0]), z: cellCenter(c0[1]) }, b = { x: cellCenter(c1[0]), z: cellCenter(c1[1]) };
    const pts = [a, ...bends.map(([x, z]) => ({ x, z })), b].map((p) => ({ ...p, y: VENT.ductFloor }));
    const grates = [
      { room: r0, kind: 'floor', x: a.x, y: 0, z: a.z, cell: c0, waypoint: c0, end: 0 },
      { room: r1, kind: 'floor', x: b.x, y: 0, z: b.z, cell: c1, waypoint: c1, end: 1 },
    ];
    vents.push(finish({ id, kind: 'duct', grates, pts }));
  }
  for (const v of vents) for (const g of v.grates) g.vent = v;
  return vents;
}

// Every grate's footprint, for the decor to keep clear of (js/decorplan.js): the cover's centre (at
// the wall face for wall vents), the direction out of the wall into the room (0, 0 for floor
// gratings), and the cover's width.
export const COVER = { wall: 0.6, floor: 0.8 };
export function grateSpots(layout) {
  return buildVents(layout).flatMap((v) => v.grates.map((g) => ({
    id: `${v.id}:${g.end}`, kind: g.kind, x: g.x, z: g.z,
    nx: g.inward?.[0] ?? 0, nz: g.inward?.[1] ?? 0, w: COVER[g.kind],
  })));
}

// The wall vents need a real opening in the wall, so you can see out from inside. Takes wall panels
// (js/worldplan.js wallPanels: { ax, az, bx, bz, nx, nz, u0, u1, ... }) and splits any panel a wall
// vent sits on into pieces round a hole: full-height pieces either side, and strips below and above
// (y0 / y1 give a piece's bottom and top; a panel without them runs floor to ceiling).
export const HOLE = { w: 0.6, y0: 0.1, y1: 0.7 };
export function cutVentHoles(panels, layout) {
  const walls = buildVents(layout).flatMap((v) => v.grates).filter((g) => g.kind === 'wall');
  const out = [];
  for (const p of panels) {
    const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
    const g = len > 1e-6 && walls.find((w) => {
      if (p.nx * w.inward[0] + p.nz * w.inward[1] < 0.99) return false; // a different wall
      const t = ((w.x - p.ax) * (p.bx - p.ax) + (w.z - p.az) * (p.bz - p.az)) / (len * len);
      const px = p.ax + (p.bx - p.ax) * t, pz = p.az + (p.bz - p.az) * t;
      return Math.hypot(w.x - px, w.z - pz) < 0.05 && t * len > -HOLE.w / 2 && t * len < len + HOLE.w / 2;
    });
    if (!g) { out.push(p); continue; }
    const t = ((g.x - p.ax) * (p.bx - p.ax) + (g.z - p.az) * (p.bz - p.az)) / (len * len);
    const k0 = Math.max(0, t - HOLE.w / 2 / len), k1 = Math.min(1, t + HOLE.w / 2 / len);
    const piece = (a, b, extra = {}) => ({
      ...p,
      ax: p.ax + (p.bx - p.ax) * a, az: p.az + (p.bz - p.az) * a,
      bx: p.ax + (p.bx - p.ax) * b, bz: p.az + (p.bz - p.az) * b,
      u0: p.u0 + (p.u1 - p.u0) * a, u1: p.u0 + (p.u1 - p.u0) * b,
      ...extra,
    });
    if (k0 > 1e-4) out.push(piece(0, k0));
    out.push(piece(k0, k1, { y0: 0, y1: HOLE.y0 }));
    out.push(piece(k0, k1, { y0: HOLE.y1 }));
    if (k1 < 1 - 1e-4) out.push(piece(k1, 1));
  }
  return out;
}

function finish(v) {
  let s = 0;
  v.pts.forEach((p, i) => { if (i) s += len2(v.pts[i - 1], p); p.s = s; });
  v.length = s;
  return v;
}

// The point (and direction of travel) at distance s along a vent's path.
export function ventPoint(vent, s) {
  const pts = vent.pts;
  s = Math.max(0, Math.min(vent.length, s));
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (s <= b.s || i === pts.length - 1) {
      const seg = b.s - a.s || 1, k = (s - a.s) / seg;
      return { x: a.x + (b.x - a.x) * k, y: a.y, z: a.z + (b.z - a.z) * k, dx: (b.x - a.x) / seg, dz: (b.z - a.z) / seg };
    }
  }
  return { ...pts[0], dx: 0, dz: 1 };
}

// The grate at the end of a vent nearest distance s, and how far away it is.
export function nearestGrate(vent, s) {
  let best = null, bestD = Infinity;
  for (const g of vent.grates) {
    const d = Math.abs(s - (g.end === 0 ? 0 : vent.length));
    if (d < bestD) { bestD = d; best = g; }
  }
  return { grate: best, dist: bestD };
}

// The grate you could use from where you're standing: a wall vent close by and facing you while
// you crouch, or a floor grating you're standing on.
export function grateAt(vents, pos, crouching) {
  let best = null, bestD = Infinity;
  for (const v of vents) {
    for (const g of v.grates) {
      const d = Math.hypot(pos.x - g.x, pos.z - g.z);
      if (g.kind === 'wall') {
        const inFront = (pos.x - g.x) * g.inward[0] + (pos.z - g.z) * g.inward[1] > 0;
        if (!crouching || !inFront || d > VENT.wallVentReach) continue;
      } else if (d > VENT.gratingReach) continue;
      if (d < bestD) { bestD = d; best = g; }
    }
  }
  return best;
}

// Where you are while in a vent, and what you're doing there.
// mode: 'out' | 'entering' | 'in' | 'leaving'.
export class VentState {
  constructor(vents) {
    this.vents = vents;
    this.mode = 'out';
    this.vent = null;
    this.s = 0;
    this.facing = 1;   // +1: looking toward the path's end, -1: toward its start
    this.timer = 0;
    this.crawled = 0;
    this.still = true;
    this.grate = null; // the grate you came in by, or are going out by
  }

  get inside() { return this.mode !== 'out'; }

  // Can you get in here right now? (Not with the alien practically on top of you.)
  canEnter(grate, alienPos) {
    return this.mode === 'out' && !!grate && Math.hypot(alienPos.x - grate.x, alienPos.z - grate.z) > VENT.noEnter;
  }

  // Start getting in. speed: 'slow' (you held E for the full time already) or 'fast' (a tap).
  // Returns the noise it makes: { x, z, loudness, sound }.
  enter(grate, speed) {
    const v = grate.vent;
    this.vent = v;
    this.grate = grate;
    // In at the grate's end, facing along the duct (or, in a dead end, back out toward the cover).
    this.s = grate.end === 0 ? 0.45 : v.length - 0.45;
    this.facing = v.kind === 'dead' ? -1 : grate.end === 0 ? 1 : -1;
    this.mode = speed === 'fast' ? 'entering' : 'in';
    this.timer = speed === 'fast' ? VENT.fastTime : 0;
    this.crawled = 0;
    return this.noiseAt(grate, speed);
  }

  // The grate you could climb out of from here, if any.
  exitGrate() {
    if (this.mode !== 'in') return null;
    const { grate, dist } = nearestGrate(this.vent, this.s);
    if (this.vent.kind === 'dead') return this.s < 1.2 ? grate : null;
    return dist <= VENT.exitReach ? grate : null;
  }

  // Start climbing out. Returns the noise, like enter().
  leave(speed) {
    const grate = this.exitGrate();
    if (!grate) return null;
    this.grate = grate;
    this.mode = speed === 'fast' ? 'leaving' : 'out';
    this.timer = speed === 'fast' ? VENT.fastTime : 0;
    if (this.mode === 'out') this.vent = null;
    return this.noiseAt(grate, speed);
  }

  noiseAt(grate, speed) {
    return { x: grate.x, z: grate.z, loudness: speed === 'fast' ? VENT.fastNoise : VENT.slowNoise, sound: speed === 'fast' ? 'ventClang' : 'ventGroan' };
  }

  // Each frame. input: { fwd: -1 | 0 | 1, acted: bool (pressed E or clicked the flashlight) }.
  // Returns any crawl noises made this frame: [{ x, z, loudness }].
  update(dt, { fwd = 0, acted = false } = {}) {
    const out = [];
    this.still = fwd === 0 && !acted;
    if (this.mode === 'entering' || this.mode === 'leaving') {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.mode === 'leaving') { this.mode = 'out'; this.vent = null; } else this.mode = 'in';
      }
      return out;
    }
    if (this.mode !== 'in' || !fwd) return out;
    const speed = fwd > 0 ? VENT.crawlFwd : VENT.crawlBack;
    const lo = this.vent.kind === 'dead' ? 0.35 : 0.3, hi = this.vent.length - (this.vent.kind === 'dead' ? 0.3 : 0.3);
    const before = this.s;
    this.s = Math.max(lo, Math.min(hi, this.s + fwd * this.facing * speed * dt));
    this.crawled += Math.abs(this.s - before);
    if (this.crawled >= VENT.thudEvery) {
      this.crawled = 0;
      const p = ventPoint(this.vent, this.s);
      out.push({ x: p.x, z: p.z, loudness: VENT.crawlNoise });
    }
    return out;
  }

  // Where the camera goes: { x, y, z, yaw (the direction you face, for clamping), nearGrate, grate }.
  view() {
    const p = ventPoint(this.vent, this.s);
    const dx = p.dx * this.facing, dz = p.dz * this.facing;
    const { grate, dist } = nearestGrate(this.vent, this.s);
    return {
      x: p.x, y: p.y + VENT.eye, z: p.z,
      yaw: Math.atan2(-dx, -dz), // the rig's yaw convention: 0 looks toward -z
      nearGrate: dist <= VENT.slatsReach ? grate : null,
    };
  }
}

// Keep a look direction within the vent's limit around `center` (radians).
export function clampYaw(yaw, center, limit = VENT.lookLimit) {
  const off = Math.atan2(Math.sin(yaw - center), Math.cos(yaw - center));
  return center + Math.max(-limit, Math.min(limit, off));
}

// Is the player looking out through the grate they're next to? (For the slats overlay.)
// fwd: the camera's forward vector.
export function lookingOut(grate, fwd) {
  if (!grate) return false;
  if (grate.kind === 'floor') return fwd.y > 0.45; // looking up through the hatch
  return fwd.x * grate.inward[0] + fwd.z * grate.inward[1] > 0.4; // toward the room
}
