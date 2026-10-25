// Sound: the recorded effects, menu music, a few synthesized ones, positional playback and the heartbeat.
import * as THREE from 'three';

const FILES = {
  hum: '01_failing_reactor_hum.wav',
  clicks: '02_alien_chitter_clicks.wav',
  flicker: '03_lights_flicker_power_loss.wav',
  door: '04_bulkhead_door.wav',
  teleporter: '05_teleporter_instability.wav',
  footsteps: '06_distant_corridor_footsteps.wav',
  engine: 'freesound_community-low-engine-hum-72529.mp3',
  rumble: 'freesound_community-rumble-002-26712.mp3',
};
export const SOUND_FILES = Object.values(FILES).map((f) => 'sound_effects/' + f);
export const MENU_MUSIC = 'music/alex-morgan-dark-suspense-thriller-528314.mp3';
const MENU_VOLUME = 0.5;

// The title theme. A plain <audio> element, since the game's audio context stays
// suspended until the shift starts. Browsers only let it play after a click or key.
export class MenuMusic {
  constructor() {
    this.el = new Audio(MENU_MUSIC);
    this.el.loop = true;
    this.el.volume = MENU_VOLUME;
    this.stopped = false;
  }

  play() {
    if (this.stopped || !this.el.paused) return;
    const p = this.el.play();
    if (p?.catch) p.catch(() => {});
  }

  fadeOut(ms) {
    this.stopped = true;
    const from = this.el.volume;
    const t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / ms);
      this.el.volume = from * (1 - k);
      if (k < 1) requestAnimationFrame(step);
      else this.el.pause();
    };
    requestAnimationFrame(step);
  }
}
const HUM_VOLUME = 0.35;

export class GameAudio {
  constructor(camera, scene) {
    this.scene = scene;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {};
    this.beatTimer = 0;
    this.humDip = false;
    this.humCut = false;
    this.clicks = new Set(); // alien clicks still playing, so the hunt warning can silence them
  }

  async load() {
    const loader = new THREE.AudioLoader();
    await Promise.all(Object.entries(FILES).map(async ([name, file]) => {
      try { this.buffers[name] = await loader.loadAsync('sound_effects/' + file); }
      catch (e) { console.warn('Could not load sound', file, e); }
    }));
    this.makeSynth();
    // The hunt screech: the teleporter whine played backwards.
    const tele = this.buffers.teleporter;
    if (tele) {
      const rev = this.ctx.createBuffer(tele.numberOfChannels, tele.length, tele.sampleRate);
      for (let c = 0; c < tele.numberOfChannels; c++) rev.getChannelData(c).set(tele.getChannelData(c).slice().reverse());
      this.buffers.screech = rev;
    }
  }

  resume() { return this.ctx.resume(); }
  suspend() { return this.ctx.suspend(); }

  // Short synthesized sounds, so we don't need extra files.
  makeSynth() {
    const sr = this.ctx.sampleRate;
    const make = (seconds, fn) => {
      const b = this.ctx.createBuffer(1, Math.floor(seconds * sr), sr);
      const d = b.getChannelData(0);
      let state = 0;
      for (let i = 0; i < d.length; i++) {
        const out = fn(i / sr, state);
        state = out.s ?? state;
        d[i] = out.v ?? out;
      }
      return b;
    };
    const noise = () => Math.random() * 2 - 1;
    // Your own footstep: low-passed thump.
    this.buffers.step = make(0.14, (t, s) => {
      const v = s + (noise() - s) * 0.08;
      return { v: v * Math.exp(-t * 40) * 2.5, s: v };
    });
    // The soft click that warns a door is about to open by itself.
    this.buffers.click = make(0.05, (t) => (noise() * 0.6 + Math.sin(t * 2 * Math.PI * 1900)) * Math.exp(-t * 160));
    // A noise-maker landing: a metallic rattle.
    this.buffers.clatter = make(0.9, (t) => {
      let v = 0;
      for (const [on, f] of [[0, 1800], [0.11, 2650], [0.24, 3900], [0.4, 2200]]) {
        if (t < on) continue;
        const u = t - on;
        v += (Math.sin(u * 2 * Math.PI * f) * 0.6 + noise() * 0.3) * Math.exp(-u * 18);
      }
      return v * 0.6;
    });
    // A repair clank.
    this.buffers.clank = make(0.35, (t) => {
      const v = Math.sin(t * 2 * Math.PI * 220) + Math.sin(t * 2 * Math.PI * 470) * 0.6 + Math.sin(t * 2 * Math.PI * 910) * 0.3;
      return (v * 0.5 + noise() * 0.2) * Math.exp(-t * 14);
    });
    // The investigate murmur: a low, uneven rumble that loops cleanly.
    {
      const secs = 4, f1 = 41, f2 = 63; // whole cycles in 4 s, so the loop has no seam
      this.buffers.murmur = make(secs, (t, st) => {
        const v = st + (noise() - st) * 0.02;
        const swell = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 0.75) * Math.sin(t * 2 * Math.PI * 0.5);
        return { v: (Math.sin(t * 2 * Math.PI * f1) * 0.5 + Math.sin(t * 2 * Math.PI * f2) * 0.25 + v * 3) * swell * 0.6, s: v };
      });
    }
    // Something heavy dragged across the floor (the prop trick's tell).
    this.buffers.scrape = make(0.9, (t, st) => {
      const v = st + (noise() - st) * 0.3;
      const grind = 0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 23);
      return { v: v * grind * Math.sin(Math.min(1, t / 0.9) * Math.PI) * 0.8, s: v };
    });
    // Heartbeat: lub-dub.
    this.buffers.beat = make(0.5, (t) => {
      const lub = t < 0.15 ? Math.sin(t * 2 * Math.PI * 55) * Math.sin((t / 0.15) * Math.PI) : 0;
      const u = t - 0.2;
      const dub = u > 0 && u < 0.13 ? Math.sin(u * 2 * Math.PI * 48) * Math.sin((u / 0.13) * Math.PI) * 0.7 : 0;
      return lub + dub;
    });
  }

  make(positional, name, { volume = 1, rate = 1, ref = 2.5, loop = false, duration, offset = 0 } = {}) {
    const buf = this.buffers[name];
    if (!buf) return null;
    const s = positional ? new THREE.PositionalAudio(this.listener) : new THREE.Audio(this.listener);
    s.setBuffer(buf);
    s.setVolume(volume);
    s.setPlaybackRate(rate);
    s.setLoop(loop);
    if (duration) s.duration = duration;
    if (offset) s.offset = offset;
    if (positional) { s.setRefDistance(ref); s.setRolloffFactor(1.2); }
    return s;
  }

  oneShot(s, holder) {
    s.onEnded = () => {
      s.isPlaying = false;
      s.getOutput().disconnect();
      s.removeFromParent();
      if (holder) holder.removeFromParent();
    };
    s.play();
    return s;
  }

  // Play at a fixed spot in the world.
  playAt(name, pos, opts) {
    const s = this.make(true, name, opts);
    if (!s) return null;
    const holder = new THREE.Object3D();
    holder.position.set(pos.x, pos.y ?? 1.2, pos.z);
    holder.add(s);
    this.scene.add(holder);
    holder.updateMatrixWorld();
    return this.oneShot(s, holder);
  }

  // Play attached to a moving object.
  playOn(name, obj, opts) {
    const s = this.make(true, name, opts);
    if (!s) return null;
    obj.add(s);
    return this.oneShot(s);
  }

  play2D(name, opts) {
    const s = this.make(false, name, opts);
    return s ? this.oneShot(s) : null;
  }

  startAmbience(teleporterObj) {
    this.hum = this.make(false, 'hum', { volume: HUM_VOLUME, loop: true });
    this.hum?.play();
    const tele = this.make(true, 'teleporter', { volume: 0.5, loop: true, ref: 2 });
    if (tele) { teleporterObj.add(tele); tele.play(); }
  }

  // The generator's engine, once it's running again.
  startEngine(obj) {
    if (this.engine) return;
    this.engine = this.make(true, 'engine', { volume: 0.6, loop: true, ref: 2 });
    if (this.engine) { obj.add(this.engine); this.engine.play(); }
  }

  // The tell before a light trick: the hum drops away.
  dipHum(dipped) { this.humDip = dipped; this.applyHum(0.35); }
  // The tell before a hunt: the hum cuts out completely.
  cutHum(cut) { this.humCut = cut; this.applyHum(cut ? 0.05 : 0.6); }
  applyHum(speed) {
    if (!this.hum) return;
    const v = this.humCut ? 0 : this.humDip ? 0.04 : HUM_VOLUME;
    this.hum.gain.gain.setTargetAtTime(v, this.ctx.currentTime, speed);
  }

  attachAlien(mesh) {
    this.alienMesh = mesh;
    this.alienSteps = this.make(true, 'footsteps', { volume: 1.2, loop: true, ref: 3 });
    if (this.alienSteps) mesh.add(this.alienSteps);
    this.murmur = this.make(true, 'murmur', { volume: 0, loop: true, ref: 2.5 });
    if (this.murmur) { mesh.add(this.murmur); this.murmur.play(); }
    this.murmurVol = 0;
  }

  // One click burst, pitched by state: slow in patrol, quick in investigate, sparse when it's lost.
  alienClick(state) {
    const opts = {
      patrol: { volume: 0.9, rate: 0.9, duration: 1.0 },
      investigate: { volume: 1.2, rate: 1.35, duration: 0.7 },
      lost: { volume: 0.8, rate: 0.7, duration: 0.6 },
    }[state] ?? { volume: 1, rate: 1, duration: 1 };
    if (!this.alienMesh) return;
    const s = this.make(true, 'clicks', { ref: 3, offset: Math.random() * 3, ...opts });
    if (!s) return;
    this.alienMesh.add(s);
    this.clicks.add(s);
    s.onEnded = () => {
      this.clicks.delete(s);
      s.isPlaying = false;
      s.getOutput().disconnect();
      s.removeFromParent();
    };
    s.play();
  }

  stopAlienClicks() {
    for (const s of [...this.clicks]) { s.stop(); s.onEnded(); } // stop() clears the source's own callback
  }

  screech() {
    if (this.alienMesh) this.playOn('screech', this.alienMesh, { volume: 1.8, rate: 0.6, ref: 5, duration: 2.6 });
  }

  footstep(mode) {
    const v = { crouch: 0.015, walk: 0.05, sprint: 0.45 }[mode];
    this.play2D('step', { volume: v, rate: 0.85 + Math.random() * 0.3 });
  }

  update(dt, { alienDist, alienMoving, alienState }) {
    // Each state has its own footsteps: slow and dragging, light, fast and heavy, stop-start.
    const steps = this.alienSteps;
    if (steps) {
      if (alienMoving && !steps.isPlaying) steps.play();
      else if (!alienMoving && steps.isPlaying) steps.pause();
      if (alienMoving) {
        const [rate, vol] = { patrol: [0.75, 1.1], investigate: [1.1, 0.7], hunt: [1.8, 2.2], lost: [0.65, 0.8] }[alienState] ?? [1, 1];
        steps.setPlaybackRate(rate);
        steps.setVolume(vol);
      }
    }
    // A low murmur while it investigates. It's positional, so it grows as it nears.
    if (this.murmur) {
      const want = alienState === 'investigate' ? 1.5 : 0;
      this.murmurVol += (want - this.murmurVol) * Math.min(1, dt * 1.5);
      this.murmur.setVolume(this.murmurVol);
    }
    // Heartbeat starts within 10 m and speeds up as it gets close.
    if (alienDist < 10) {
      const k = 1 - alienDist / 10;
      this.beatTimer -= dt;
      if (this.beatTimer <= 0) {
        this.play2D('beat', { volume: 0.25 + 0.75 * k });
        this.beatTimer = 60 / (55 + 95 * k);
      }
    } else {
      this.beatTimer = 0;
    }
  }
}
