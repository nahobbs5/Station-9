// What you're looking at, and thrown noise-makers. Engine-free: vectors are plain {x, y, z},
// the camera is a CameraRig (js/rig.js), and each ball's mesh comes from the renderer.
import { WALL_H, cellOf } from './layout.js';

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

// makeBall(): the renderer's ball mesh { position: {x, y, z, set()}, glow(l), remove() }.
export class Throwables {
  constructor(makeBall, isBlockedCell) {
    this.makeBall = makeBall;
    this.isBlockedCell = isBlockedCell;
    this.items = [];
  }

  spawn(rig) {
    rig.forward(fwd);
    const c = rig.position;
    const ball = this.makeBall();
    ball.position.set(c.x + fwd.x * 0.4, c.y + fwd.y * 0.4, c.z + fwd.z * 0.4);
    const vel = { x: fwd.x * 10, y: fwd.y * 10 + 2.5, z: fwd.z * 10 };
    this.items.push({ ball, vel, landed: false, life: 8 });
  }

  update(dt, time, onLand) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const p = it.ball.position;
      if (it.landed) {
        it.life -= dt;
        it.ball.glow(0.3 + 0.25 * Math.sin(time * 10)); // pulsing orange
        if (it.life <= 0) { it.ball.remove(); this.items.splice(i, 1); }
        continue;
      }
      it.vel.y -= 9.8 * dt;
      const nx = p.x + it.vel.x * dt, ny = p.y + it.vel.y * dt, nz = p.z + it.vel.z * dt;
      if (this.isBlockedCell(cellOf(nx), cellOf(nz))) {
        it.landed = true;
        p.y = Math.max(0.09, p.y * 0.2);
      } else if (ny <= 0.09) {
        p.set(nx, 0.09, nz);
        it.landed = true;
      } else {
        if (ny > WALL_H - 0.1) it.vel.y = -Math.abs(it.vel.y) * 0.3;
        p.set(nx, Math.min(ny, WALL_H - 0.1), nz);
      }
      if (it.landed) onLand({ x: p.x, y: p.y, z: p.z });
    }
  }
}
