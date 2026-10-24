// Sound: the six recorded effects, a few synthesized ones, positional playback and the heartbeat.
import * as THREE from 'three';

const FILES = {
  hum: '01_failing_reactor_hum.wav',
  clicks: '02_alien_chitter_clicks.wav',
  flicker: '03_lights_flicker_power_loss.wav',
  door: '04_bulkhead_door.wav',
  teleporter: '05_teleporter_instability.wav',
  footsteps: '06_distant_corridor_footsteps.wav',
};
const HUM_VOLUME = 0.35;

export class GameAudio {
  constructor(camera, scene) {
    this.scene = scene;
    this.listener = new THREE.AudioListener();
    camera.add(this.listener);
    this.ctx = this.listener.context;
    this.buffers = {};
    this.beatTimer = 0;
  }

  async load() {
    const loader = new THREE.AudioLoader();
    await Promise.all(Object.entries(FILES).map(async ([name, file]) => {
      try { this.buffers[name] = await loader.loadAsync('sound_effects/' + file); }
      catch (e) { console.warn('Could not load sound', file, e); }
    }));
    this.makeSynth();
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

  // The tell before a light trick: the hum drops away.
  dipHum(dipped) {
    if (!this.hum) return;
    this.hum.gain.gain.setTargetAtTime(dipped ? 0.04 : HUM_VOLUME, this.ctx.currentTime, 0.35);
  }

  attachAlien(mesh) {
    this.alienSteps = this.make(true, 'footsteps', { volume: 1.6, loop: true, ref: 3 });
    if (this.alienSteps) mesh.add(this.alienSteps);
  }

  footstep(mode) {
    const v = { crouch: 0.06, walk: 0.2, sprint: 0.45 }[mode];
    this.play2D('step', { volume: v, rate: 0.85 + Math.random() * 0.3 });
  }

  update(dt, { alienDist, alienMoving, alienSpeed }) {
    const steps = this.alienSteps;
    if (steps) {
      if (alienMoving && !steps.isPlaying) steps.play();
      else if (!alienMoving && steps.isPlaying) steps.pause();
      if (alienMoving) steps.setPlaybackRate(Math.max(0.8, Math.min(1.9, alienSpeed / 1.8)));
    }
    // Heartbeat speeds up as it gets close.
    if (alienDist < 14) {
      const k = 1 - alienDist / 14;
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
