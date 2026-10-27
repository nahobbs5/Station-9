// The alien's shape and motion, kept apart from the renderer (after the Station 9 Alien Behavior
// Guide): a floating, chitinous head with a glowing face, a crown of swept-back spines, and twelve
// long segmented tentacles in a pinwheel beneath it, tips glowing. It twirls as it drifts, and how
// it looks and moves depends on its state (ALIEN_LOOK). Pure data and maths, no engine.
import { seeded } from './textures.js';

export const ALIEN = {
  headY: 1.75,                 // centre of the head, metres off the floor
  headRadius: 0.5,
  headScale: [0.85, 0.8, 1.15], // a long head, face forward (+z)
  tentacles: 12, segments: 9,
  crown: 6, crownSegments: 4,
  ringY: -0.32, ringR: 0.3,     // where the tentacles grow from, under the head (head-relative)
  skin: { color: 0x0b0a10, roughness: 0.25, metalness: 0.7 },
  glowTips: 2,                  // how many end segments of each tentacle glow
  light: { pos: [0, 1.2, 0.3], range: 5, max: 2.2 },
  reveal: { color: 0xff2a14, max: 6 },
};

// How much the head bulges at unit direction n: ridged chitin. A function of direction, so the
// sphere's seam stays closed.
export function lump(nx, ny, nz) {
  return 1 + 0.08 * Math.sin(9 * nx + 1.3) * Math.sin(3 * ny + 0.7)
    + 0.07 * Math.max(0, Math.sin(14 * nz + 6 * ny)) // ridges running along it
    + 0.04 * Math.sin(17 * ny + 3 * nx);
}

// Rotation taking local axes onto columns [X, Y, Z], as a quaternion (x, y, z, w).
function quatFromBasis(X, Y, Z) {
  const [m00, m10, m20] = X, [m01, m11, m21] = Y, [m02, m12, m22] = Z;
  const tr = m00 + m11 + m22;
  let q;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, s / 4]; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [s / 4, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s]; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(m01 + m10) / s, s / 4, (m12 + m21) / s, (m02 - m20) / s]; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(m02 + m20) / s, (m12 + m21) / s, s / 4, (m10 - m01) / s]; }
  const len = Math.hypot(...q);
  return q.map((v) => v / len);
}
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((c) => c / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// A limb's rest orientation: local +Y along dir, and local +Z the "up-ish" side, so a positive
// bend about local X always curls it upward (tentacle tips curl up, away from the floor).
function limbQuat(dir) {
  const Y = norm(dir);
  let X = cross(Y, [0, 1, 0]);
  if (Math.hypot(...X) < 1e-6) X = [1, 0, 0];
  X = norm(X);
  const Z = cross(X, Y);
  return quatFromBasis(X, Y, Z);
}

// Everything needed to build the creature, in the same order every time.
export function alienRig() {
  const rand = seeded(29);
  // The face: two big eyes, four small ones (head-relative, before the head's scaling).
  const eyes = [
    { r: 0.075, pos: [-0.17, 0.08, 0.52] }, { r: 0.075, pos: [0.17, 0.08, 0.52] },
    { r: 0.03, pos: [-0.3, 0.17, 0.4] }, { r: 0.03, pos: [0.3, 0.17, 0.4] },
    { r: 0.025, pos: [-0.12, -0.08, 0.56] }, { r: 0.025, pos: [0.12, -0.08, 0.56] },
  ];
  const segments = Array.from({ length: ALIEN.segments }, (_, j) => ({
    len: 0.21 - j * 0.011,
    r0: 0.075 * (1 - j / ALIEN.segments) + 0.012,
    r1: 0.075 * (1 - (j + 1) / ALIEN.segments) + 0.01,
  }));
  const crownSegments = Array.from({ length: ALIEN.crownSegments }, (_, j) => ({
    len: 0.2 - j * 0.03, r0: 0.05 * (1 - j / ALIEN.crownSegments) + 0.008, r1: 0.05 * (1 - (j + 1) / ALIEN.crownSegments) + 0.006,
  }));
  // Tentacles in a pinwheel under the head: out, down, and a little round (the swirl).
  const tentacles = Array.from({ length: ALIEN.tentacles }, (_, i) => {
    const a = (i / ALIEN.tentacles) * Math.PI * 2 + rand() * 0.2;
    const out = [Math.sin(a), 0, Math.cos(a)], round = [Math.cos(a), 0, -Math.sin(a)];
    const dir = norm(out.map((o, k) => o * 0.2 + round[k] * 0.14 + (k === 1 ? -0.97 : 0)));
    const root = [out[0] * ALIEN.ringR, ALIEN.ringY, out[2] * ALIEN.ringR];
    const curl = 0.09 + rand() * 0.04;
    const joints = segments.map((_, j) => ({ base: curl * (0.4 + j * 0.16) }));
    return { kind: 'tentacle', root, quat: limbQuat(dir), joints, phase: rand() * Math.PI * 2 };
  });
  // The crown: spines sweeping back over the top of the head and curling down.
  const crown = Array.from({ length: ALIEN.crown }, (_, i) => {
    const s = (i / (ALIEN.crown - 1)) * 2 - 1; // -1..1 across the head
    const root = [s * 0.28, 0.3 - Math.abs(s) * 0.08, 0.1 - Math.abs(s) * 0.15];
    const dir = norm([s * 0.5, 0.75, -0.85]);
    const joints = crownSegments.map((_, j) => ({ base: -0.28 - j * 0.08 })); // bend over, backward and down
    return { kind: 'crown', root, quat: limbQuat(dir), joints, phase: rand() * Math.PI * 2 };
  });
  return { eyes, segments, crownSegments, tentacles, crown };
}

// How it looks and moves in each mood (Alien Behavior Guide). color: glow [r, g, b] 0..1 (sRGB);
// glow: how bright its eyes, core and tips are; twirl: rad/s of the tentacle pinwheel; wave: speed
// and size of the tentacles' ripple; spread: >1 extends and probes, <1 retracts; lean: tips its
// head forward; scan: how far it looks side to side; jitter: erratic lashing.
const rgb = (hex) => [(hex >> 16 & 255) / 255, (hex >> 8 & 255) / 255, (hex & 255) / 255];
export const ALIEN_LOOK = {
  dormant:     { color: rgb(0x5a46a0), glow: 0.08, twirl: 0.05, wave: [0.25, 0.04], spread: 0.85, lean: 0, scan: 0, jitter: 0, reverse: false },
  patrol:      { color: rgb(0x7a6cff), glow: 0.45, twirl: 0.25, wave: [1.0, 0.12], spread: 1.0, lean: 0, scan: 0.25, jitter: 0, reverse: false },
  investigate: { color: rgb(0xb066ff), glow: 0.9, twirl: 0.5, wave: [1.8, 0.16], spread: 1.25, lean: 0.15, scan: 0, jitter: 0, reverse: false },
  listen:      { color: rgb(0xb066ff), glow: 0.7, twirl: 0.08, wave: [0.5, 0.05], spread: 1.15, lean: 0.2, scan: 0, jitter: 0, reverse: false },
  warn:        { color: rgb(0xc8281e), glow: 0.5, twirl: 0.1, wave: [0.4, 0.04], spread: 1.1, lean: 0.1, scan: 0, jitter: 0, reverse: false },
  hunt:        { color: rgb(0xff3a24), glow: 1.2, twirl: 1.1, wave: [5.5, 0.3], spread: 1.5, lean: 0.3, scan: 0, jitter: 0.12, reverse: false },
  lost:        { color: rgb(0x6a58c8), glow: 0.25, twirl: 0.3, wave: [0.7, 0.1], spread: 0.8, lean: 0, scan: 0.6, jitter: 0.03, reverse: true },
};

// Which look goes with which state of js/alien.js (the vent states borrow the guide's four).
// listen: going to a grate, or still at it listening (rushing to it in a chase looks like a hunt);
// tear and torn: ripping the cover off; waitOther: waiting, wound up, by a torn duct end.
const MOOD_OF = { patrol: 'patrol', investigate: 'investigate', hunt: 'hunt', lost: 'lost',
  listen: 'listen', tear: 'hunt', torn: 'hunt', waitOther: 'warn' };
export function alienMood(alien) {
  if (alien.dormant > 0) return 'dormant';
  if (alien.warning) return 'warn';
  if (alien.state === 'listen' && alien.rushing) return 'hunt';
  return MOOD_OF[alien.state] ?? 'patrol';
}

const BLEND = 3; // how quickly the look follows a change of mood (per second): about half a second

// Advance the animation. `u` keeps state between frames. Returns the pose the renderer applies;
// joint(limb, j) gives a joint's [x, z] rotation.
export function poseAlien(u, alien, time) {
  const dt = u.last == null ? 0 : Math.min(0.1, Math.max(0, time - u.last));
  u.last = time;
  const target = ALIEN_LOOK[alienMood(alien)];
  if (!u.look) u.look = { ...target, color: [...target.color], wave: [...target.wave] };
  const L = u.look, k = Math.min(1, dt * BLEND);
  for (const key of ['glow', 'twirl', 'spread', 'lean', 'scan', 'jitter']) L[key] += (target[key] - L[key]) * k;
  for (let i = 0; i < 3; i++) L.color[i] += (target.color[i] - L.color[i]) * k;
  for (let i = 0; i < 2; i++) L.wave[i] += (target.wave[i] - L.wave[i]) * k;
  L.reverse = target.reverse;
  u.yaw ??= alien.heading ?? 0; u.phase ??= 0; u.spin ??= 0;
  // Turn smoothly toward its heading.
  const d = Math.atan2(Math.sin(alien.heading - u.yaw), Math.cos(alien.heading - u.yaw));
  u.yaw += d * 0.15;
  u.phase += dt * L.wave[0]; // accumulate, so changing speed never makes the tentacles jump
  // The pinwheel turns; when it's lost, it falters and turns back the other way now and then.
  u.spin += dt * L.twirl * (L.reverse ? Math.sin(time * 0.7) * 1.4 : 1);
  const phase = u.phase, amp = L.wave[1], spread = L.spread, jitter = L.jitter;
  const shake = (seed) => jitter * (Math.sin(time * 23 + seed) + Math.sin(time * 37 + seed * 1.7)) * 0.5;
  return {
    x: alien.pos.x, z: alien.pos.z, yaw: u.yaw, lean: L.lean,
    headY: ALIEN.headY + Math.sin(time * 1.3) * 0.06, // it floats, bobbing gently
    spin: u.spin,
    look: Math.sin(time * (L.reverse ? 0.9 : 0.4)) * L.scan, // the head looks side to side
    glow: { color: [...L.color], level: L.glow },
    joint(limb, j) {
      if (limb.kind === 'crown') return [limb.joints[j].base * (0.9 + 0.1 * spread) + Math.sin(phase * 0.6 + limb.phase + j) * amp * 0.25, 0];
      // Spread opens the whole tentacle out at its root and straightens its curl; retracting does the opposite.
      const base = limb.joints[j].base * (1.6 - 0.6 * spread) + (j === 0 ? (spread - 1) * 0.4 : 0);
      const w = amp * (1 + j * 0.2);
      return [base + Math.sin(phase + limb.phase + j * 0.7) * w + shake(limb.phase + j),
        Math.cos(phase * 0.7 + limb.phase * 1.3 + j * 0.5) * w * 0.6 + shake(limb.phase * 2 + j)];
    },
  };
}

// Where each joint of a limb ends up (for tests): position in the alien's own frame, with the head
// at ALIEN.headY, no twirl or lean. `pose` gives the joint angles (defaults to the rest curl).
export function limbPoints(limb, segs, pose = (l, j) => [l.joints[j].base, 0]) {
  const qm = ([x, y, z, w]) => [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
  const mul = (a, b) => a.map((row) => [0, 1, 2].map((c) => row[0] * b[0][c] + row[1] * b[1][c] + row[2] * b[2][c]));
  const app = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
  const rx = (t) => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]];
  const rz = (t) => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]];
  let R = qm(limb.quat);
  let p = [limb.root[0], ALIEN.headY + limb.root[1], limb.root[2]];
  const pts = [];
  segs.forEach((seg, j) => {
    const [ax, az] = pose(limb, j);
    R = mul(R, mul(rx(ax), rz(az)));
    const d = app(R, [0, seg.len, 0]);
    p = [p[0] + d[0], p[1] + d[1], p[2] + d[2]];
    pts.push(p);
  });
  return pts;
}
