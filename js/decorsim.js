// What the station's faults are doing right now, kept apart from the renderer: steam puffs, drips,
// spark bursts, broken lights stuttering, and which few real lights go where. No drawing here:
// each renderer reads this state every frame and moves its own meshes to match.

export const ACTIVE_RANGE = 18; // faults further away than this sit still
export const FX = { PUFFS: 18, DROPS: 6, BURSTS: 2, SPARKS: 28, POOL: 3 };
// Seconds between events: [min, max].
const TIMERS = { steam: [6, 15], drip: [2.5, 7], spark: [10, 30], clank: [9, 24], light: [8, 25], dying: [5, 14] };
const between = ([a, b]) => a + Math.random() * (b - a);
export const TUBE_ON = 0xdfe8ff, TUBE_OFF = 0x14181b;
export const LIGHT_COLOR = 0xcfe0ff, FLASH_COLOR = 0xffa040;

export class DecorSim {
  constructor(plan, onEvent = () => {}) {
    this.plan = plan;
    this.onEvent = onEvent;
    this.faults = plan.faults.map((f) => ({ ...f, timer: between(TIMERS[f.kind]) * (0.3 + Math.random()), active: 0, puffT: 0 }));
    this.lights = plan.lights.map((l) => ({ ...l, timer: between(l.dying ? TIMERS.dying : TIMERS.light), stutter: 0, step: 0, level: l.dying ? 0.7 : 0 }));
    this.puffs = Array.from({ length: FX.PUFFS }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, scale: 0, opacity: 0 }));
    this.drops = Array.from({ length: FX.DROPS }, () => ({ live: false, x: 0, y: 0, z: 0, vy: 0 }));
    this.bursts = Array.from({ length: FX.BURSTS }, () => ({ life: 0, opacity: 0, pos: new Float32Array(FX.SPARKS * 3), vel: new Float32Array(FX.SPARKS * 3) }));
    this.flashes = []; // brief spark lights: { x, y, z, life }
    this.pool = Array.from({ length: FX.POOL }, () => null); // { x, y, z, k, color } per real light
    this.panelPhase = plan.panels.map((_, i) => (i * 2.39) % 6.28);
    this.time = 0;
  }

  trigger(f) {
    if (f.kind === 'steam') { f.active = 1.1 + Math.random() * 0.8; this.onEvent('steam', f); }
    else if (f.kind === 'drip') {
      const d = this.drops.find((x) => !x.live);
      if (d) { d.live = true; d.vy = 0; d.x = f.x; d.y = f.y; d.z = f.z; }
    } else if (f.kind === 'spark') {
      const b = this.bursts.find((x) => x.life <= 0) ?? this.bursts[0];
      const nx = Math.sin(f.rot), nz = Math.cos(f.rot); // out of the wall, into the corridor
      for (let i = 0; i < FX.SPARKS; i++) {
        b.pos.set([f.x, f.y, f.z], i * 3);
        b.vel.set([nx * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.4, Math.random() * 1.8 - 0.2, nz * (0.6 + Math.random() * 1.6) + (Math.random() - 0.5) * 1.4], i * 3);
      }
      b.life = 0.8;
      this.flashes.push({ x: f.x + nx * 0.3, y: f.y, z: f.z + nz * 0.3, life: 0.25 });
      this.onEvent('spark', f);
    } else if (f.kind === 'clank') this.onEvent('clank', f);
  }

  update(dt, time, player) {
    this.time = time;
    if (!player) return;
    const near = (o) => Math.hypot(o.x - player.x, o.z - player.z) < ACTIVE_RANGE;
    for (const f of this.faults) {
      if (!near(f)) continue;
      f.timer -= dt;
      if (f.timer <= 0) { this.trigger(f); f.timer = between(TIMERS[f.kind]); }
      if (f.active > 0) {
        f.active -= dt;
        f.puffT -= dt;
        if (f.puffT <= 0) {
          f.puffT = 0.07;
          const pf = this.puffs.find((x) => x.life <= 0);
          if (pf) {
            pf.life = pf.max = 1.1 + Math.random() * 0.7;
            pf.x = f.x; pf.y = f.y; pf.z = f.z;
            const a = Math.random() * Math.PI * 2;
            pf.vx = Math.cos(a) * 0.9; pf.vy = -0.25 + Math.random() * 0.3; pf.vz = Math.sin(a) * 0.9;
          }
        }
      }
    }
    for (const pf of this.puffs) {
      if (pf.life <= 0) { pf.opacity = 0; continue; }
      pf.life -= dt;
      const t = 1 - pf.life / pf.max;
      const damp = 1 - dt * 1.6;
      pf.vx *= damp; pf.vy *= damp; pf.vz *= damp;
      pf.vy += dt * 0.25; // warm steam drifts up as it slows
      pf.x += pf.vx * dt; pf.y += pf.vy * dt; pf.z += pf.vz * dt;
      pf.scale = 0.4 + t * 1.4;
      pf.opacity = pf.life <= 0 ? 0 : 0.5 * Math.sin(Math.min(1, 0.15 + t * 1.25) * Math.PI);
    }
    for (const d of this.drops) {
      if (!d.live) continue;
      d.vy -= 9.8 * dt;
      d.y += d.vy * dt;
      if (d.y <= 0.02) {
        d.live = false;
        this.onEvent('drip', { x: d.x, y: 0.05, z: d.z });
      }
    }
    for (const b of this.bursts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      for (let i = 0; i < FX.SPARKS * 3; i += 3) {
        b.vel[i + 1] -= 6 * dt;
        b.pos[i] += b.vel[i] * dt;
        b.pos[i + 1] = Math.max(0.01, b.pos[i + 1] + b.vel[i + 1] * dt);
        b.pos[i + 2] += b.vel[i + 2] * dt;
      }
      b.opacity = Math.max(0, Math.min(1, b.life * 2));
    }

    // Broken lights: dead ones stutter on now and then; dying ones are mostly on with dropouts.
    for (const l of this.lights) {
      if (!near(l)) { if (!l.dying) l.level = 0; continue; }
      l.timer -= dt;
      if (l.timer <= 0) {
        l.timer = between(l.dying ? TIMERS.dying : TIMERS.light);
        l.stutter = l.dying ? 0.5 + Math.random() * 1.5 : 0.5 + Math.random() * 1.1;
        this.onEvent('buzz', l);
      }
      l.step -= dt;
      if (l.step <= 0) {
        l.step = 0.04 + Math.random() * 0.06;
        if (l.stutter > 0) l.level = l.dying ? 0 : (Math.random() < 0.5 ? 0.6 + Math.random() * 0.4 : 0);
        else l.level = l.dying ? (Math.random() < 0.08 ? 0.15 : 0.6 + Math.random() * 0.15) : 0;
      }
      if (l.stutter > 0) l.stutter -= dt;
    }

    // Hand the real lights to the nearest things that are lit right now.
    for (let i = this.flashes.length - 1; i >= 0; i--) if ((this.flashes[i].life -= dt) <= 0) this.flashes.splice(i, 1);
    const emitters = [
      // A dead tube stuttering on is a harsh flash; a dying one is a steady weak glow.
      ...this.lights.filter((l) => l.level > 0.05 && near(l)).map((l) => ({ x: l.x, y: l.y - 0.3, z: l.z, k: l.level * (l.dying ? 3.2 : 6), color: LIGHT_COLOR })),
      ...this.flashes.map((f) => ({ x: f.x, y: f.y, z: f.z, k: 6 * (f.life / 0.25), color: FLASH_COLOR })),
    ].sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z) - Math.hypot(b.x - player.x, b.z - player.z));
    for (let i = 0; i < FX.POOL; i++) this.pool[i] = emitters[i] ?? null;
  }

  // A loose ceiling panel's gentle sway (radians, added to its tilt).
  panelSway(i) { return Math.sin(this.time * 0.7 + this.panelPhase[i]) * 0.03; }

  // For testing and screenshots: set something off right now (nearest of that kind to `at`).
  force(kind, at) {
    const list = kind === 'light' ? this.lights : this.faults.filter((f) => f.kind === kind);
    const it = list.slice().sort((a, b) => Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))[0];
    if (!it) return null;
    it.timer = 0;
    return it;
  }
}

// Mix two hex colours: a + (b - a) * t, as [r, g, b] in 0..1 (sRGB).
export function mixHex(a, b, t) {
  const ch = (h, s) => ((h >> s) & 255) / 255;
  return [16, 8, 0].map((s) => ch(a, s) + (ch(b, s) - ch(a, s)) * t);
}
