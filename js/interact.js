// What you're looking at, and thrown noise-makers. Engine-free: vectors are plain {x, y, z},
// the camera is a CameraRig (js/rig.js), and each ball's mesh comes from the renderer.
import { WALL_H } from './layout.js';

const fwd = { x: 0, y: 0, z: 0 };

// The interactable nearest the centre of your view, within reach.
export function findTarget(rig, items) {
  rig.forward(fwd);
  const c = rig.position;
  let best = null, bestScore = -Infinity;
  for (const it of items) {
    const dx = it.pos.x - c.x, dy = it.pos.y - c.y, dz = it.pos.z - c.z;
    const d = Math.hypot(dx, dy, dz);
    if (d > it.range || d < 1e-3) continue;
    const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
    if (dot < 0.8) continue;
    const score = dot - d * 0.08;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

// makeBall(type): the renderer's mesh for a noise-maker of that kind (js/noisemakers.js):
// { position: {x, y, z, set()}, glow(l), spin?(dt), remove() }.
const REST_Y = 0.09; // how high a noise-maker's centre sits when it's on the floor
export class Throwables {
  // blockedAt(x, z): true where a thrown one would hit a wall, prop or closed door.
  // kinds: { [type]: { rolls, life } } (NOISEMAKERS).
  constructor(makeBall, blockedAt, kinds = {}) {
    this.makeBall = makeBall;
    this.blockedAt = blockedAt;
    this.kinds = kinds;
    this.items = [];
  }

  spawn(rig, type = 'echo') {
    rig.forward(fwd);
    const c = rig.position;
    const ball = this.makeBall(type);
    ball.position.set(c.x + fwd.x * 0.4, c.y + fwd.y * 0.4, c.z + fwd.z * 0.4);
    const vel = { x: fwd.x * 10, y: fwd.y * 10 + 2.5, z: fwd.z * 10 };
    const kind = this.kinds[type] ?? {};
    // A rolling one bounces twice, then rolls to a stop; the rest stay where they land.
    this.items.push({ ball, type, vel, landed: false, life: kind.life ?? 8, bounces: kind.rolls ? 2 : 0, rolling: 0, rolls: !!kind.rolls });
  }

  update(dt, time, onLand) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const p = it.ball.position;
      if (it.landed) {
        it.life -= dt;
        if (it.rolling > 0) { // rolling along the floor, slowing down, turning off walls
          it.rolling -= dt;
          const k = Math.max(0, 1 - dt * 2.2);
          it.vel.x *= k; it.vel.z *= k;
          const nx = p.x + it.vel.x * dt, nz = p.z + it.vel.z * dt;
          if (this.blockedAt(nx, nz)) { it.vel.x *= -0.4; it.vel.z *= -0.4; } else p.set(nx, REST_Y, nz);
          it.ball.spin?.(Math.hypot(it.vel.x, it.vel.z) * dt);
        }
        it.ball.glow(0.3 + 0.25 * Math.sin(time * 10)); // pulsing while it goes off
        if (it.life <= 0) { it.ball.remove(); this.items.splice(i, 1); }
        continue;
      }
      it.vel.y -= 9.8 * dt;
      const nx = p.x + it.vel.x * dt, ny = p.y + it.vel.y * dt, nz = p.z + it.vel.z * dt;
      let landed = false;
      if (this.blockedAt(nx, nz)) {
        if (it.bounces > 0) { it.bounces--; it.vel.x *= -0.45; it.vel.z *= -0.45; } // off the wall
        else { landed = true; p.y = Math.max(REST_Y, p.y * 0.2); }
      } else if (ny <= REST_Y) {
        p.set(nx, REST_Y, nz);
        if (it.bounces > 0 && Math.abs(it.vel.y) > 1.2) { it.bounces--; it.vel.y = -it.vel.y * 0.35; it.vel.x *= 0.7; it.vel.z *= 0.7; }
        else landed = true;
      } else {
        if (ny > WALL_H - 0.1) it.vel.y = -Math.abs(it.vel.y) * 0.3;
        p.set(nx, Math.min(ny, WALL_H - 0.1), nz);
      }
      if (landed) {
        it.landed = true;
        if (it.rolls) it.rolling = 1.2;
        onLand({ x: p.x, y: p.y, z: p.z }, it.type, it);
      }
    }
  }

  // Where each one that's landed is now (a rolling one moves after it lands).
  positionOf(item) { return item.ball.position; }
}
