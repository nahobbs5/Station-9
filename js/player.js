// First-person movement, mouse look, sprint/crouch, stamina and the flashlight.
// Engine-free: it writes the camera pose and flashlight strength to a CameraRig (js/rig.js),
// and the renderer copies that onto its own camera and spotlight.
import { cellOf } from './layout.js';
import { STEP_LOUDNESS } from './noise.js';

// Sprint is the only way to outpace a hunting alien (5.5 m/s), and it is loud.
export const SPEED = { walk: 3.0, sprint: 6.0, crouch: 1.5 };
const STRIDE = { walk: 1.7, sprint: 2.2, crouch: 1.1 };
const SPRINT_TIME = 4;  // seconds of running on a full bar
const RECOVER_TIME = 6; // seconds to refill it
const EYE = { stand: 1.6, crouch: 0.95 };
const RADIUS = 0.3;
const LOOK = 0.0022;

export class Player {
  constructor(rig, spawn, isBlockedCell) {
    this.camera = rig;
    this.pos = { x: spawn.x, z: spawn.z };
    this.isBlockedCell = isBlockedCell;
    this.yaw = 0;
    this.pitch = 0;
    this.eye = EYE.stand;
    this.mode = 'walk';
    this.stride = 0;
    this.bob = 0;
    this.stamina = 1;
    this.exhausted = false;
    this.keys = new Set();
    this.flashlightOn = true;
    this.flashClicked = false; // set on toggle; main turns it into a small noise
    this.moving = false;
    this.idle = 0; // seconds since you last moved

    addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (e.code === 'KeyF' && !e.repeat && document.pointerLockElement) {
        this.flashlightOn = !this.flashlightOn;
        this.flashClicked = true;
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!document.pointerLockElement) return;
      // Some browsers send one huge jump right after locking; skip it.
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.yaw -= e.movementX * LOOK;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * LOOK));
    });
  }

  get crouching() { return this.mode === 'crouch'; }

  blocked(x, z) {
    for (const [ox, oz] of [[-RADIUS, -RADIUS], [RADIUS, -RADIUS], [-RADIUS, RADIUS], [RADIUS, RADIUS]]) {
      if (this.isBlockedCell(cellOf(x + ox), cellOf(z + oz))) return true;
    }
    return false;
  }

  // Returns { loudness, mode } on the frame a footstep lands, otherwise null.
  update(dt, time) {
    const k = this.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const side = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const moving = fwd !== 0 || side !== 0;
    const wantsSprint = k.has('ShiftLeft') || k.has('ShiftRight');

    if (k.has('KeyC')) this.mode = 'crouch';
    else if (wantsSprint && moving && fwd > 0 && !this.exhausted) this.mode = 'sprint';
    else this.mode = 'walk';

    if (this.mode === 'sprint') {
      this.stamina -= dt / SPRINT_TIME;
      if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; }
    } else {
      this.stamina = Math.min(1, this.stamina + dt / RECOVER_TIME);
      if (this.exhausted && this.stamina >= 1) this.exhausted = false;
    }

    let step = null;
    this.moving = false;
    if (moving) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let vx = fx * fwd + rx * side, vz = fz * fwd + rz * side;
      const len = Math.hypot(vx, vz);
      const dist = SPEED[this.mode] * dt;
      vx = (vx / len) * dist; vz = (vz / len) * dist;
      const ox = this.pos.x, oz = this.pos.z;
      if (!this.blocked(this.pos.x + vx, this.pos.z)) this.pos.x += vx;
      if (!this.blocked(this.pos.x, this.pos.z + vz)) this.pos.z += vz;
      const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
      this.moving = moved > 1e-4;
      this.stride += moved;
      this.bob += moved * (Math.PI / STRIDE[this.mode]);
      if (this.stride >= STRIDE[this.mode]) {
        this.stride = 0;
        step = { loudness: STEP_LOUDNESS[this.mode], mode: this.mode };
      }
    }

    this.idle = this.moving ? 0 : this.idle + dt;

    const eyeTarget = this.crouching ? EYE.crouch : EYE.stand;
    this.eye += (eyeTarget - this.eye) * Math.min(1, dt * 10);
    const bobAmt = moving ? (this.mode === 'sprint' ? 0.06 : 0.035) : 0;
    this.camera.set(this.pos.x, this.eye + Math.abs(Math.sin(this.bob)) * bobAmt, this.pos.z, this.yaw, this.pitch);

    // Flashlight: change intensity, never visibility (that would recompile every shader).
    const flicker = Math.sin(time * 37) > 0.995 ? 0.4 : 1;
    this.camera.flashlight = this.flashlightOn ? 30 * flicker : 0;
    return step;
  }

  lookAt(x, z) {
    this.yaw = Math.atan2(-(x - this.pos.x), -(z - this.pos.z));
    this.pitch = 0.05;
    this.camera.yaw = this.yaw;
    this.camera.pitch = this.pitch;
  }
}
