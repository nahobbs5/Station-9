// The alien's shape and motion, shared by both renderers: a black, wet mass with a crown of long
// stringy tentacles (after the "Colossal Alien" concept art). Pure data and maths, no engine.
import { seeded } from './textures.js';

export const ALIEN = {
  bodyRadius: 0.75,
  bodyScale: [1.35, 0.85, 1.5],
  bodyY: 2.05,
  segments: 7,
  skin: { color: 0x07090c, roughness: 0.2, metalness: 0.65 },
  strand: { color: 0x050607, roughness: 0.35, metalness: 0.5, r0: 0.006, r1: 0.014 },
  eye: { color: 0x9aaab8, opacity: 0.5 },
  reveal: { color: 0xff2a14, distance: 6, pos: [0, 1.6, 1.2], max: 6 },
};

// How much the body bulges at unit direction n. A function of direction, so the sphere's seam stays closed.
export function lump(nx, ny, nz) {
  return 1 + 0.13 * Math.sin(5 * nx + 1.3) * Math.sin(4 * ny + 0.7) * Math.sin(6 * nz + 2.1)
    + 0.06 * Math.sin(11 * nx + 7 * nz) + 0.04 * Math.sin(17 * ny + 3 * nx);
}

// Rotation (x, y, z, w) taking +Y onto unit vector d.
function fromUp([dx, dy, dz]) {
  const r = dy + 1;
  if (r < 1e-6) return [1, 0, 0, 0];
  const q = [dz, 0, -dx, r];
  const len = Math.hypot(...q);
  return q.map((v) => v / len);
}

// Everything needed to build the creature, in the same order every time.
export function alienRig() {
  const rand = seeded(29);
  const eyes = Array.from({ length: 7 }, (_, i) => ({
    r: 0.016 + (i % 3) * 0.007,
    pos: [(i - 3) * 0.11, -0.1 + ((i * 37) % 5) * 0.04, 0.92 - Math.abs(i - 3) * 0.05],
  }));
  // Strands hang from the underside of the body (relative to the body's centre).
  const bodyStrands = Array.from({ length: 40 }, () => {
    const a = rand() * Math.PI * 2, r = 0.2 + rand() * 0.6;
    const pos = [Math.cos(a) * r, -0.35 - rand() * 0.15, Math.sin(a) * r];
    const scaleY = 0.35 + rand() * 0.9;
    const rot = [(rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3];
    return { pos, scaleY, rot };
  });
  const segments = Array.from({ length: ALIEN.segments }, (_, j) => ({
    len: 0.44 - j * 0.03,
    r0: 0.17 * (1 - j / ALIEN.segments) + 0.02,
    r1: 0.17 * (1 - (j + 1) / ALIEN.segments) + 0.015,
  }));
  // [kind, angle around the body]: legs drop to the floor, crowns climb the walls and ceiling,
  // reachers stretch out ahead of it.
  const plan = [
    ['leg', 0.5], ['leg', 1.6], ['leg', 2.7], ['leg', 3.6], ['leg', 4.7], ['leg', 5.7],
    ['crown', 0.9], ['crown', 2.2], ['crown', 3.2], ['crown', 4.2], ['crown', 5.3],
    ['reach', -0.4], ['reach', 0.4], ['reach', 0],
  ];
  const tentacles = plan.map(([kind, a]) => {
    let dir, curl;
    if (kind === 'leg') { dir = [Math.sin(a) * 0.55, -0.85, Math.cos(a) * 0.55]; curl = -0.16; }
    else if (kind === 'crown') { dir = [Math.sin(a) * 0.45, 0.9, Math.cos(a) * 0.45]; curl = 0.2; }
    else { dir = [Math.sin(a) * 0.5, 0.15, 1]; curl = 0.1 * Math.sign(a || 1); }
    const len = Math.hypot(...dir);
    dir = dir.map((v) => v / len);
    const root = [Math.sin(a) * 0.55, 2.0 + dir[1] * 0.25, Math.cos(a) * 0.55 + (kind === 'reach' ? 0.5 : 0)];
    // Each joint: its resting curl and a few stringy bits trailing from the thicker segments.
    const joints = segments.map((seg, j) => ({
      base: curl * (1 + j * 0.15),
      strands: Array.from({ length: j < 5 ? 2 : 0 }, () => {
        const pos = [(rand() - 0.5) * 0.1, seg.len * rand(), (rand() - 0.5) * 0.1];
        return { pos, scaleY: 0.25 + rand() * 0.4 };
      }),
    }));
    return { kind, root, quat: fromUp(dir), joints, phase: rand() * Math.PI * 2 };
  });
  return { eyes, bodyStrands, segments, tentacles };
}

// How each state moves: [wave speed, wave size, lean forward].
export const ALIEN_MOTION = {
  dormant: [0.25, 0.04, 0], patrol: [1.1, 0.12, 0], investigate: [2.4, 0.18, 0.08],
  warn: [0.4, 0.03, 0.05], hunt: [6.5, 0.3, 0.3], lost: [0.8, 0.1, 0],
};

// Advance the animation. `u` keeps state between frames: { yaw, phase, lean, last }.
// Returns the pose the renderer applies; joint(t, j) gives a joint's [x, z] rotation.
export function poseAlien(u, alien, time) {
  const dt = u.last == null ? 0 : Math.min(0.1, Math.max(0, time - u.last));
  u.last = time;
  u.yaw ??= 0; u.phase ??= 0; u.lean ??= 0;
  // Turn smoothly toward its heading.
  const d = Math.atan2(Math.sin(alien.heading - u.yaw), Math.cos(alien.heading - u.yaw));
  u.yaw += d * 0.15;
  const mood = alien.dormant > 0 ? 'dormant' : alien.warning ? 'warn' : alien.state;
  const [speed, amp, lean] = ALIEN_MOTION[mood] ?? ALIEN_MOTION.patrol;
  u.phase += dt * speed; // accumulate, so changing speed never makes the tentacles jump
  u.lean += (lean - u.lean) * Math.min(1, dt * 4);
  const phase = u.phase;
  return {
    x: alien.pos.x, z: alien.pos.z, yaw: u.yaw, lean: u.lean,
    bodyY: ALIEN.bodyY + Math.sin(time * 1.7) * 0.05,
    joint(t, j) {
      const w = amp * (1 + j * 0.2);
      return [t.joints[j].base + Math.sin(phase + t.phase + j * 0.7) * w, Math.cos(phase * 0.7 + t.phase * 1.3 + j * 0.5) * w * 0.6];
    },
  };
}
