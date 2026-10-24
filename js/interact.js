// What you're looking at, and thrown noise-makers.
import * as THREE from 'three';
import { WALL_H, cellOf } from './layout.js';

const fwd = new THREE.Vector3();
const tmp = new THREE.Vector3();

// The interactable nearest the centre of your view, within reach.
export function findTarget(camera, items) {
  camera.getWorldDirection(fwd);
  let best = null, bestScore = -Infinity;
  for (const it of items) {
    tmp.subVectors(it.pos, camera.position);
    const d = tmp.length();
    if (d > it.range || d < 1e-3) continue;
    tmp.divideScalar(d);
    const dot = tmp.dot(fwd);
    if (dot < 0.8) continue;
    const score = dot - d * 0.08;
    if (score > bestScore) { bestScore = score; best = it; }
  }
  return best;
}

export class Throwables {
  constructor(scene, isBlockedCell) {
    this.scene = scene;
    this.isBlockedCell = isBlockedCell;
    this.items = [];
    this.geo = new THREE.SphereGeometry(0.09, 10, 8);
  }

  spawn(camera) {
    camera.getWorldDirection(fwd);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff6a33 });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.position.copy(camera.position).addScaledVector(fwd, 0.4);
    const vel = fwd.clone().multiplyScalar(10).add(new THREE.Vector3(0, 2.5, 0));
    this.scene.add(mesh);
    this.items.push({ mesh, vel, landed: false, life: 8 });
  }

  update(dt, time, onLand) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const p = it.mesh.position;
      if (it.landed) {
        it.life -= dt;
        it.mesh.material.color.setHSL(0.04, 1, 0.3 + 0.25 * Math.sin(time * 10));
        if (it.life <= 0) { it.mesh.removeFromParent(); this.items.splice(i, 1); }
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
      if (it.landed) onLand(p.clone());
    }
  }
}
