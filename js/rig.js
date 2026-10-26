// The camera as plain data, kept apart from the engine: where you stand, where you look, and the
// flashlight. The player and the title screen write to it; each renderer copies it onto its camera.
export class CameraRig {
  constructor() {
    this.position = { x: 0, y: 1.6, z: 0 };
    this.yaw = 0;   // 0 looks toward -z; positive turns left
    this.pitch = 0; // positive looks up
    this.flashlight = 0; // spotlight intensity
  }

  set(x, y, z, yaw, pitch) {
    this.position.x = x; this.position.y = y; this.position.z = z;
    this.yaw = yaw; this.pitch = pitch;
  }

  // Unit vector you're looking along (yaw about Y, then pitch about X, looking down -Z).
  forward(out = { x: 0, y: 0, z: 0 }) {
    const c = Math.cos(this.pitch);
    out.x = -Math.sin(this.yaw) * c;
    out.y = Math.sin(this.pitch);
    out.z = -Math.cos(this.yaw) * c;
    return out;
  }

  // Unit "up" for the camera: at right angles to forward, tilting back as you look up or down.
  up(out = { x: 0, y: 0, z: 0 }) {
    const f = this.forward();
    const rx = -f.z, rz = f.x; // right = forward x world-up
    const ux = -rz * f.y, uy = rz * f.x - rx * f.z, uz = rx * f.y;
    const len = Math.hypot(ux, uy, uz) || 1;
    out.x = ux / len; out.y = uy / len; out.z = uz / len;
    return out;
  }
}
