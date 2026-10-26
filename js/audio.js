// Sound: the recorded effects, menu music, a few synthesized ones, positional playback and the heartbeat.
// Plain Web Audio, independent of the 3D engine. Positional sounds follow an "anchor":
// any live {x, y, z} object, such as a mesh's position. The listener follows the camera rig.

const FILES = {
  hum: '01_failing_reactor_hum.wav',
  clicks: '02_alien_chitter_clicks.wav',
  flicker: '03_lights_flicker_power_loss.wav',
  door: '04_bulkhead_door.wav',
  teleporter: '05_teleporter_instability.wav',
  footsteps: 'AlienApproachingSound.wav', // the alien moving nearby (loops)
  engine: 'freesound_community-low-engine-hum-72529.mp3',
  rumble: 'freesound_community-rumble-002-26712.mp3',
  sprint: 'u_3x9ga8wevj-walking-sound-effect-272246.mp3', // running footsteps
  walk: 'freeeverythingxx-walking-on-concrete-ver-2-268513.mp3', // walking footsteps
  whoosh: 'dragon-studio-spaceship-whoosh-video-game-sound-320171.mp3',
};
// Where each footfall starts in the sprint clip (seconds); each is about 0.47s long.
const SPRINT_STEPS = [0.09, 0.56, 1.04, 1.52, 1.99, 2.47, 2.94, 3.42, 3.9];
// Walking and crouching use the concrete clip; its footfalls are found when it loads (findFootfalls).
const STEP_VOLUME = { walk: 0.16, crouch: 0.05 }; // quiet: only sprinting should be loud

// Where each footfall starts in a recording of footsteps: the moments the loudness jumps up from
// quiet, at least minGap seconds apart. samples: one channel; returns [{ t, len }] in seconds.
export function findFootfalls(samples, rate, { minGap = 0.3, maxLen = 0.45 } = {}) {
  const win = Math.max(1, Math.floor(rate * 0.01)); // 10 ms windows
  const env = [];
  for (let i = 0; i + win <= samples.length; i += win) {
    let sum = 0;
    for (let k = i; k < i + win; k++) sum += samples[k] * samples[k];
    env.push(Math.sqrt(sum / win));
  }
  const peak = Math.max(...env, 1e-9);
  const sorted = env.slice().sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length * 0.3)]; // the quiet between steps
  const thr = floor + (peak - floor) * 0.25;
  const starts = [];
  for (let i = 1; i < env.length; i++) {
    const t = (i * win) / rate;
    if (env[i] >= thr && env[i - 1] < thr && (!starts.length || t - starts[starts.length - 1] >= minGap)) starts.push(t);
  }
  return starts.map((t, i) => ({ t: Math.max(0, t - 0.02), len: Math.min(maxLen, (starts[i + 1] ?? samples.length / rate) - t) }));
}
export const SOUND_FILES = Object.values(FILES).map((f) => 'sound_effects/' + f);
export const MENU_MUSIC = 'music/alex-morgan-dark-suspense-thriller-528314.mp3';
export const END_MUSIC = 'music/sub_clair-suspense-tension-622546.mp3';

// A looping music track (title theme, ending theme). A plain <audio> element, since the
// game's audio context is suspended outside play. Browsers only let it play after a click or key.
export class Music {
  constructor(src, { volume = 0.5 } = {}) {
    this.el = new Audio(src);
    this.el.loop = true;
    this.volume = volume;
    this.el.volume = volume;
    this.stopped = false;
  }

  // Start playing, optionally fading in over fadeMs.
  play(fadeMs = 0) {
    if (this.stopped || !this.el.paused) return;
    if (fadeMs > 0) {
      this.el.volume = 0;
      this.ramp(0, this.volume, fadeMs);
    }
    const p = this.el.play();
    if (p?.catch) p.catch(() => {});
  }

  fadeOut(ms) {
    this.stopped = true;
    this.ramp(this.el.volume, 0, ms, () => this.el.pause());
  }

  ramp(from, to, ms, done) {
    const t0 = performance.now();
    const step = (now) => {
      if (this.stopped && to > 0) return; // a fade-out took over
      const k = Math.min(1, (now - t0) / ms);
      this.el.volume = from + (to - from) * k;
      if (k < 1) requestAnimationFrame(step);
      else done?.();
    };
    requestAnimationFrame(step);
  }
}
const HUM_VOLUME = 0.35;
const OPEN_HZ = 20000;          // the world bus's low-pass, wide open
const SUITE_WORLD_HZ = 500;     // ...and through the suites' padding
const SUITE_WORLD_GAIN = 0.35;
const VENT_WORLD_HZ = 1500;      // ...and through a vent's thin metal
const VENT_WORLD_GAIN = 0.7;

// One playing (or playable) sound, with the small API the game uses:
// play / pause / stop, setVolume, setPlaybackRate, onEnded, isPlaying.
class Voice {
  // bus: 'alien' | 'world' | 'clear'. By default, sounds on the alien go to the alien bus, other positional
  // sounds to the world bus, and plain 2D sounds (your own) straight out. See GameAudio.setInSuite.
  constructor(audio, buffer, { volume = 1, rate = 1, ref = 2.5, loop = false, duration, offset = 0, positional = false, anchor = null, bus } = {}) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.buffer = buffer;
    this.loop = loop;
    this.rate = rate;
    this.duration = duration;
    this.offset = offset;
    this.isPlaying = false;
    this.progress = 0;
    this.source = null;
    this.onEnded = () => this.dispose();
    this.gain = this.ctx.createGain();
    this.gain.gain.value = volume;
    if (positional) {
      // Same falloff as before: inverse distance from `ref`, rolloff 1.2.
      this.panner = this.ctx.createPanner();
      this.panner.panningModel = 'HRTF';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = ref;
      this.panner.rolloffFactor = 1.2;
      this.panner.maxDistance = 10000;
      this.gain.connect(this.panner).connect(audio.busFor(bus, positional, anchor));
      this.anchor = anchor;
      audio.voices.add(this);
      this.place();
    } else {
      this.gain.connect(audio.busFor(bus, positional, anchor));
    }
  }

  // Move the panner to the anchor.
  place() {
    const a = this.anchor;
    if (!a || !this.panner) return;
    const y = a.y ?? 1.2;
    const p = this.panner;
    if (p.positionX) { p.positionX.value = a.x; p.positionY.value = y; p.positionZ.value = a.z; }
    else p.setPosition(a.x, y, a.z);
  }

  play() {
    if (this.isPlaying) return this;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.loop = this.loop;
    src.playbackRate.value = this.rate;
    src.connect(this.gain);
    this.startedAt = this.ctx.currentTime;
    src.start(this.startedAt, this.progress + this.offset, this.duration);
    src.onended = () => { if (this.source === src) { this.isPlaying = false; this.onEnded(); } };
    this.source = src;
    this.isPlaying = true;
    return this;
  }

  // Remember where we were, so play() carries on from there.
  pause() {
    if (!this.isPlaying) return;
    this.progress += Math.max(this.ctx.currentTime - this.startedAt, 0) * this.rate;
    if (this.loop) this.progress %= this.duration || this.buffer.duration;
    this.halt();
  }

  stop() { this.progress = 0; this.halt(); }

  halt() {
    const src = this.source;
    this.source = null;
    this.isPlaying = false;
    if (src) { src.onended = null; try { src.stop(); } catch { /* not started */ } }
  }

  setVolume(v) { this.gain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.01); }

  setPlaybackRate(r) {
    this.rate = r;
    if (this.source) this.source.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.01);
  }

  getOutput() { return this.gain; }

  dispose() {
    this.halt();
    this.gain.disconnect();
    if (this.panner) { this.panner.disconnect(); this.audio.voices.delete(this); }
  }
}

export class GameAudio {
  constructor(rig) {
    this.rig = rig;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    // Inside the wellness suites the padding keeps the alien out entirely and dulls the rest of the
    // station: the alien bus goes silent, the world bus quiet and low-passed (setInSuite).
    this.alienBus = this.ctx.createGain();
    this.alienBus.connect(this.master);
    this.worldFilter = this.ctx.createBiquadFilter();
    this.worldFilter.type = 'lowpass';
    this.worldFilter.frequency.value = OPEN_HZ;
    this.worldFilter.connect(this.master);
    this.worldBus = this.ctx.createGain();
    this.worldBus.connect(this.worldFilter);
    this.inSuite = false;
    this.inVent = false;
    this.voices = new Set(); // positional sounds, re-placed each frame
    this.buffers = {};
    this.beatTimer = 0;
    this.humDip = false;
    this.humCut = false;
    this.clicks = new Set(); // alien clicks still playing, so the hunt warning can silence them
  }

  async load() {
    await Promise.all(Object.entries(FILES).map(async ([name, file]) => {
      try {
        const res = await fetch('sound_effects/' + file);
        if (!res.ok) throw new Error(res.status);
        this.buffers[name] = await this.ctx.decodeAudioData(await res.arrayBuffer());
      } catch (e) { console.warn('Could not load sound', file, e); }
    }));
    this.makeSynth();
    if (this.buffers.walk) this.walkSteps = findFootfalls(this.buffers.walk.getChannelData(0), this.buffers.walk.sampleRate);
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
    // A tape deck's clunk, for starting and stopping a tape.
    this.buffers.tapeClick = make(0.12, (t) =>
      (Math.sin(t * 2 * Math.PI * 140) * 0.8 + noise() * 0.5) * Math.exp(-t * 45) + (t > 0.05 ? noise() * 0.4 * Math.exp(-(t - 0.05) * 90) : 0));
    // Tape hiss: soft high noise with a slow wobble. Loops for as long as a tape plays.
    this.buffers.hiss = make(2, (t, st) => {
      const v = noise() - st * 0.6; // tilt it toward the high end
      return { v: v * (0.8 + 0.2 * Math.sin(t * 2 * Math.PI * 1.5)), s: v };
    });
    // Station faults: a steam leak, a drip, an electrical crackle, a dying light's buzz.
    this.buffers.steamHiss = make(1.6, (t, st) => {
      const v = noise() - st * 0.85; // high-passed noise
      const env = Math.min(1, t / 0.05) * Math.exp(-Math.max(0, t - 0.3) * 2.2);
      return { v: v * env * 0.7, s: v };
    });
    this.buffers.drip = make(0.25, (t) => {
      const f = 1400 + 1800 * Math.exp(-t * 40); // a quick downward plink
      return Math.sin(t * 2 * Math.PI * f) * Math.exp(-t * 30) * 0.6;
    });
    {
      const pops = Array.from({ length: 14 }, () => [Math.random() * 0.5, 0.3 + Math.random() * 0.7]);
      this.buffers.spark = make(0.6, (t) => {
        let v = 0;
        for (const [at, a] of pops) if (t >= at && t < at + 0.012) v += noise() * a * Math.exp(-(t - at) * 300);
        return v + noise() * 0.06 * Math.exp(-t * 6);
      });
    }
    this.buffers.tubeBuzz = make(0.9, (t) =>
      (Math.sign(Math.sin(t * 2 * Math.PI * 120)) * 0.25 + Math.sin(t * 2 * Math.PI * 240) * 0.2 + noise() * 0.08) *
      (Math.random() < 0.85 ? 1 : 0.2) * Math.min(1, t * 30) * Math.exp(-t * 2));
    // Vents (js/vents.js). The cover lifting slowly: a long, low metal groan.
    this.buffers.ventGroan = make(1.4, (t, st) => {
      const f = 70 + 25 * Math.sin(t * 2.2) + 12 * Math.sin(t * 7.1);
      const v = st + (noise() - st) * 0.05;
      const env = Math.sin(Math.min(1, t / 1.4) * Math.PI);
      return { v: (Math.sin(t * 2 * Math.PI * f) * 0.5 + Math.sin(t * 2 * Math.PI * f * 2.03) * 0.25 + v * 1.5) * env * 0.7, s: v };
    });
    // The cover opened fast: a sharp, ringing clang.
    this.buffers.ventClang = make(1.6, (t) => {
      let v = 0;
      for (const [f, a] of [[523, 1], [1187, 0.6], [1931, 0.45], [2870, 0.3]]) v += Math.sin(t * 2 * Math.PI * f) * a;
      return (v * 0.45 * Math.exp(-t * 3.2) + noise() * 0.5 * Math.exp(-t * 60));
    });
    // Crawling: a dull thud, now and then with a metal pop.
    this.buffers.crawlThud = make(0.22, (t, st) => {
      const v = st + (noise() - st) * 0.06;
      return { v: (v * 3 + Math.sin(t * 2 * Math.PI * 95) * 0.4) * Math.exp(-t * 22), s: v };
    });
    this.buffers.ventPop = make(0.18, (t) => (Math.sin(t * 2 * Math.PI * 1650) * 0.6 + Math.sin(t * 2 * Math.PI * 2420) * 0.3) * Math.exp(-t * 28));
    // Something tapping, further down the duct.
    this.buffers.ventTap = make(0.6, (t) => {
      let v = 0;
      for (const at of [0, 0.19, 0.31]) if (t >= at) v += (Math.sin((t - at) * 2 * Math.PI * 1300) + noise() * 0.3) * Math.exp(-(t - at) * 70);
      return v * 0.5;
    });
    // It hitting the cover in a chase: rough scrapes on metal, about three seconds.
    this.buffers.ventScrape = make(3, (t, st) => {
      const v = st + (noise() - st) * 0.35;
      const strokes = Math.max(0, Math.sin(t * 2 * Math.PI * 1.4)) ** 0.6;
      return { v: (v + Math.sin(t * 2 * Math.PI * 310) * 0.2) * strokes * 0.9, s: v };
    });
    // The cover torn off: a rip and a crash.
    this.buffers.ventTear = make(1.2, (t, st) => {
      const v = st + (noise() - st) * 0.5;
      const rip = t < 0.6 ? Math.min(1, t / 0.08) * (0.6 + 0.4 * Math.sin(t * 2 * Math.PI * 37)) : 0;
      let crash = 0;
      if (t >= 0.6) { const u = t - 0.6; crash = (noise() * 0.6 + Math.sin(u * 2 * Math.PI * 610) * 0.5) * Math.exp(-u * 6); }
      return { v: v * rip + crash, s: v };
    });
    // Heartbeat: lub-dub.
    this.buffers.beat = make(0.5, (t) => {
      const lub = t < 0.15 ? Math.sin(t * 2 * Math.PI * 55) * Math.sin((t / 0.15) * Math.PI) : 0;
      const u = t - 0.2;
      const dub = u > 0 && u < 0.13 ? Math.sin(u * 2 * Math.PI * 48) * Math.sin((u / 0.13) * Math.PI) * 0.7 : 0;
      return lub + dub;
    });
  }

  // anchor: a live {x, y, z} for a positional sound (y defaults to 1.2), or null for a plain one.
  make(positional, name, opts = {}, anchor = null) {
    const buf = this.buffers[name];
    if (!buf) return null;
    return new Voice(this, buf, { ...opts, positional, anchor });
  }

  // Plays once, then tidies itself up.
  oneShot(s) { return s.play(); }

  // Play at a fixed spot in the world.
  playAt(name, pos, opts) {
    const s = this.make(true, name, opts, { x: pos.x, y: pos.y ?? 1.2, z: pos.z });
    return s ? this.oneShot(s) : null;
  }

  // Play attached to something that moves (its anchor is read every frame).
  playOn(name, anchor, opts) {
    const s = this.make(true, name, opts, anchor);
    return s ? this.oneShot(s) : null;
  }

  // Each frame: put the listener at the camera and move positional sounds to their anchors.
  tick() {
    const c = this.rig.position, f = this.rig.forward(), u = this.rig.up();
    const L = this.ctx.listener;
    if (L.positionX) {
      const t = this.ctx.currentTime;
      L.positionX.setValueAtTime(c.x, t); L.positionY.setValueAtTime(c.y, t); L.positionZ.setValueAtTime(c.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
    } else {
      L.setPosition(c.x, c.y, c.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
    for (const v of this.voices) v.place();
  }

  play2D(name, opts) {
    const s = this.make(false, name, opts);
    return s ? this.oneShot(s) : null;
  }

  startAmbience(teleporterAnchor) {
    this.hum = this.make(false, 'hum', { volume: HUM_VOLUME, loop: true, bus: 'world' }); // muffled in the suites
    this.hum?.play();
    this.make(true, 'teleporter', { volume: 0.5, loop: true, ref: 2 }, teleporterAnchor)?.play();
  }

  // The generator's engine, once it's running again.
  startEngine(anchor) {
    if (this.engine) return;
    this.engine = this.make(true, 'engine', { volume: 0.6, loop: true, ref: 2 }, anchor);
    this.engine?.play();
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

  busFor(bus, positional, anchor) {
    if (bus === 'alien' || (!bus && anchor && anchor === this.alienAnchor)) return this.alienBus;
    if (bus === 'world' || (!bus && positional)) return this.worldBus;
    return this.master;
  }

  // Stepping into (or out of) a wellness suite: nothing of the alien, and the station muffled.
  setInSuite(on) {
    if (on === this.inSuite) return;
    this.inSuite = on;
    const t = this.ctx.currentTime;
    this.alienBus.gain.setTargetAtTime(on ? 0 : 1, t, 0.25);
    this.worldBus.gain.setTargetAtTime(on ? SUITE_WORLD_GAIN : 1, t, 0.25);
    this.worldFilter.frequency.setTargetAtTime(on ? SUITE_WORLD_HZ : OPEN_HZ, t, 0.25);
  }

  // Inside a vent: the station's sounds come through a little muffled (so you can still judge where
  // the alien is), and the alien's own sounds come through clearly. Not as dulled as a suite.
  setInVent(on) {
    if (on === this.inVent) return;
    this.inVent = on;
    if (this.inSuite) return;
    const t = this.ctx.currentTime;
    this.worldBus.gain.setTargetAtTime(on ? VENT_WORLD_GAIN : 1, t, 0.25);
    this.worldFilter.frequency.setTargetAtTime(on ? VENT_WORLD_HZ : OPEN_HZ, t, 0.25);
  }

  // anchor: the alien's live position; its looping sounds follow it.
  attachAlien(anchor) {
    this.alienAnchor = anchor;
    this.alienSteps = this.make(true, 'footsteps', { volume: 1.2, loop: true, ref: 3 }, anchor);
    this.murmur = this.make(true, 'murmur', { volume: 0, loop: true, ref: 2.5 }, anchor);
    this.murmur?.play();
    this.murmurVol = 0;
  }

  // One click burst, pitched by state: slow in patrol, quick in investigate, sparse when it's lost.
  alienClick(state) {
    const opts = {
      patrol: { volume: 0.9, rate: 0.9, duration: 1.0 },
      investigate: { volume: 1.2, rate: 1.35, duration: 0.7 },
      lost: { volume: 0.8, rate: 0.7, duration: 0.6 },
      listen: { volume: 1.1, rate: 0.6, duration: 1.6 }, // at the grate: slowed and stretched
    }[state] ?? { volume: 1, rate: 1, duration: 1 };
    if (!this.alienAnchor) return;
    const s = this.make(true, 'clicks', { ref: 3, offset: Math.random() * 3, ...opts }, this.alienAnchor);
    if (!s) return;
    this.clicks.add(s);
    s.onEnded = () => { this.clicks.delete(s); s.dispose(); };
    s.play();
  }

  // The ending: fade out everything the alien makes, then stop its loops (the game stops updating it).
  silenceAlien(seconds = 1.5) {
    this.alienSilenced = true;
    this.alienBus.gain.setTargetAtTime(0, this.ctx.currentTime, seconds / 4);
    this.stopAlienClicks();
    this.beatTimer = 0;
    setTimeout(() => { this.alienSteps?.pause(); this.murmur?.pause(); }, seconds * 1000);
  }

  stopAlienClicks() {
    for (const s of [...this.clicks]) { s.stop(); s.onEnded(); }
  }

  tapeStart() {
    this.play2D('tapeClick', { volume: 0.5 });
    if (this.hiss) return;
    this.hiss = this.make(false, 'hiss', { volume: 0.035, loop: true });
    this.hiss?.play();
  }

  tapeStop() {
    this.play2D('tapeClick', { volume: 0.4, rate: 0.85 });
    if (this.hiss) { this.hiss.dispose(); this.hiss = null; }
  }

  // Scenery sounds from the decor (not noises the alien hears).
  decorSound(type, at) {
    const pos = { x: at.x, y: at.y ?? 1.5, z: at.z };
    if (type === 'steam') this.playAt('steamHiss', pos, { volume: 0.9, ref: 2, rate: 0.85 + Math.random() * 0.3 });
    else if (type === 'drip') this.playAt('drip', pos, { volume: 0.5, ref: 1.5, rate: 0.8 + Math.random() * 0.4 });
    else if (type === 'spark') this.playAt('spark', pos, { volume: 1.0, ref: 2 });
    else if (type === 'buzz') this.playAt('tubeBuzz', pos, { volume: 0.35, ref: 2 });
    else if (type === 'clank') this.playAt('clank', pos, { volume: 0.8, ref: 2.5, rate: 0.45 + Math.random() * 0.15 });
  }

  screech() {
    if (this.alienAnchor) this.playOn('screech', this.alienAnchor, { volume: 1.8, rate: 0.6, ref: 5, duration: 2.6 });
  }

  footstep(mode) {
    // Sprinting: one real footfall from the clip, picked at random so it never sounds looped.
    if (mode === 'sprint' && this.buffers.sprint) {
      let i;
      do i = Math.floor(Math.random() * SPRINT_STEPS.length); while (i === this.lastSprintStep && SPRINT_STEPS.length > 1);
      this.lastSprintStep = i;
      this.play2D('sprint', { volume: 0.7, rate: 0.95 + Math.random() * 0.1, offset: Math.max(0, SPRINT_STEPS[i] - 0.03), duration: 0.42 });
      return;
    }
    // Walking (and, softer, crouching): one footfall from the concrete clip, never the same twice running.
    const steps = this.walkSteps;
    if (mode !== 'sprint' && steps?.length) {
      let i;
      do i = Math.floor(Math.random() * steps.length); while (i === this.lastWalkStep && steps.length > 1);
      this.lastWalkStep = i;
      this.play2D('walk', { volume: STEP_VOLUME[mode] ?? STEP_VOLUME.walk, rate: (mode === 'crouch' ? 0.9 : 0.97) + Math.random() * 0.08, offset: steps[i].t, duration: steps[i].len });
      return;
    }
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
    // Heartbeat starts within 10 m and speeds up as it gets close. Not in the suites: you're safe there.
    if (alienDist < 10 && !this.inSuite) {
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
