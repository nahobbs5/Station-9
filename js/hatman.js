// The Hat Man (reference files/Hatman.md, reworked 2026-10-27): a tall, silent figure the alien
// conjures. Every few minutes the power cuts out for a beat; when the lights come back he's standing
// at the far end of the corridor you're looking down, black against a red glow, a little closer after
// each repair. He never moves while lit: he arrives in one blackout and leaves in the next flicker.
// He never comes within 3 m, never appears in the wellness suites, and makes no sound. Now and then he
// also shows faintly in dark glass behind you (the cameo trick, js/tricks.js).
// No engine here; js/babylon/props.js draws him.
import { cellOf, cellCenter } from './layout.js';
import { inSuite } from './suiteplan.js';
import { propPlacement, windowPlacements } from './worldplan.js';
import { makeCanvas } from './textures.js';

// He's an apparition: the menu's Apparitions setting turns him off (HatMan.enabled). The other
// field-guide apparitions (js/apparitions.js) honour the same setting.
export const HATMAN = {
  distances: [25, 18, 12, 6], // metres from you, by repairs done
  vary: 1.5,                  // +/- metres, so he's never quite where you expect
  firstAfter: 90,             // nothing in the first 90 s
  gap: [120, 180],            // seconds between reveals (random in this range)
  retry: 0.5,                 // due but nowhere in view to put him: look again this often
  perRun: 6,                  // reveals per run
  blackout: 0.7,              // seconds the lights are out when he arrives...
  placeAt: 0.35,              // ...and he's put in place this far into it, in the dark
  flicker: 0.3,               // seconds the lights cut out when he leaves
  life: 6,                    // seconds he stays at most
  lookAway: 2,                // seconds of looking straight at him before he goes
  tooClose: 4,                // walk within this and he goes
  minDist: 3,                 // never placed closer than this
  viewCos: Math.cos((25 * Math.PI) / 180), // "down the corridor you're looking at": within 25 degrees
  lookCos: Math.cos(Math.PI / 18), // "looking straight at him": within 10 degrees
  fade: 0.3,                  // seconds the cameo fades (kept for the figure)
  cameo: 1.5,                 // seconds the reflection shows
  cameoRange: 3,              // metres from dark glass for a cameo
  dip: 0.45,                  // seconds the lights dip for a cameo
  spotStep: 2,                // metres between marker spots along a corridor
  height: 2.3, hover: 0.35, drift: 0.04, driftPeriod: 5,
};

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Marker spots every couple of metres down each corridor (not in rooms, doorways or the suites).
export function corridorSpots(layout) {
  const spots = [];
  for (const c of layout.corridors) {
    let next = 0, i = 0;
    for (const p of c.pts) {
      if (p.s < next) continue;
      next = p.s + HATMAN.spotStep;
      const cx = cellOf(p.x), cz = cellOf(p.z);
      if (!layout.isCorridor(cx, cz) || layout.isDoor(cx, cz) || layout.isSafe(cx, cz) || inSuite(layout, p)) continue;
      spots.push({ id: `${c.id}:${i++}`, corridor: c.id, x: p.x, z: p.z });
    }
  }
  return spots;
}

// Pick his spot: a corridor spot straight ahead of you (within 25 degrees of where you face) in clear
// line of sight, at least 3 m away, unused this run, as close as possible to the target distance.
export function chooseSpot(spots, { from, forward, stage, used = new Set(), lineClear = () => true, rand = Math.random }) {
  const target = HATMAN.distances[Math.min(stage, HATMAN.distances.length - 1)] + (rand() * 2 - 1) * HATMAN.vary;
  const flen = Math.hypot(forward.x, forward.z);
  if (!flen) return null;
  let best = null, bestErr = Infinity;
  for (const s of spots) {
    if (used.has(s.id)) continue;
    const d = dist(s, from);
    if (d < HATMAN.minDist) continue;
    if (((s.x - from.x) * forward.x + (s.z - from.z) * forward.z) / (d * flen) < HATMAN.viewCos) continue;
    const err = Math.abs(d - target);
    if (err >= bestErr || !lineClear(from, s)) continue;
    bestErr = err; best = s;
  }
  return best;
}

// Dark glass for the reflection cameo: switched-off monitors and windows, never in a suite.
// Each: { kind, x, y, z, rotY (the way it faces), w, h }.
export function cameoSurfaces(layout) {
  const out = [];
  for (const p of layout.props) {
    if (p.screen !== 'off') continue;
    const { x, z, rotY } = propPlacement(layout, p);
    // The monitor's screen: 0.02 m in front of the desk's centre, 1.12 m up (js/babylon/world.js makeConsole).
    const fx = Math.sin(rotY), fz = Math.cos(rotY);
    out.push({ kind: 'screen', x: x + fx * 0.045, y: 1.12, z: z + fz * 0.045, rotY, w: 0.62, h: 0.39 });
  }
  for (const w of windowPlacements(layout)) {
    out.push({ kind: 'window', x: w.x + Math.sin(w.rot) * 0.02, y: w.y, z: w.z + Math.cos(w.rot) * 0.02, rotY: w.rot, w: 1.3, h: 0.8 });
  }
  return out.filter((s) => !inSuite(layout, s));
}

// Thin glowing strips either side of each doorway, on the corridor side: a lit backdrop at every
// corridor's end, so he reads as a black shape against light. Each: { x, z, rotY } (facing down the corridor).
export function corridorEndLamps(layout) {
  const out = [];
  for (const d of layout.doors) {
    // Which way is the corridor? Step across the doorway both ways and see which side isn't a room.
    const steps = d.axis === 'x' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
    const out1 = steps.find(([dx, dz]) => !layout.roomAt(d.cx + dx, d.cz + dz) && layout.isFloor(d.cx + dx, d.cz + dz));
    if (!out1) continue;
    const [dx, dz] = out1;
    const cx = cellCenter(d.cx), cz = cellCenter(d.cz);
    // Sideways to the corridor walls: as far as the floor goes, less a hair.
    const sx = -dz, sz = dx;
    for (const side of [-1, 1]) {
      let k = 0.2;
      while (k < 1.6 && layout.walkDistance(cx + sx * side * (k + 0.05), cz + sz * side * (k + 0.05)) > 0.02) k += 0.05;
      out.push({ x: cx + dx * 0.2 + sx * side * (k - 0.03), z: cz + dz * 0.2 + sz * side * (k - 0.03), rotY: Math.atan2(dx, dz) });
    }
  }
  return out;
}

// The Hat Man himself: idle -> blackout (he's placed in the dark) -> shown -> flicker (he's gone) -> idle.
// figure: the renderer's { place(x, z, lightX, lightZ), setAlpha(k), hide(), update(time),
//   showCameo(surface), hideCameo(), setLamps(k) (corridor-end lamp brightness), position }
// rig: the camera ({ position, forward() }). lineClear(a, b): nothing solid (or a shut door) between.
// world: { setBlackout(on), dimBeat(seconds) }. onFirst(): called the first time he's ever shown.
export class HatMan {
  constructor(figure, layout, { rig, lineClear, world, onFirst = () => {}, rand = Math.random }) {
    this.figure = figure;
    this.layout = layout;
    this.rig = rig;
    this.lineClear = lineClear;
    this.world = world;
    this.onFirst = onFirst;
    this.rand = rand;
    this.spots = corridorSpots(layout);
    this.used = new Set();
    this.state = 'idle';
    this.next = HATMAN.firstAfter; // seconds until the next reveal is due
    this.t = 0;                    // seconds into the current state
    this.reveals = 0;
    this.sightings = 0;
    this.cameoLeft = 0;
    this.dipLeft = 0;
    this.enabled = true; // the menu's Apparitions setting
  }

  get position() { return this.figure.position; }
  get cameoActive() { return this.cameoLeft > 0; }
  get visible() { return this.state === 'shown'; }
  get busy() { return this.state !== 'idle'; }
  // The power is out (the flashlight dies with it).
  get dark() { return this.state === 'blackout' || this.state === 'flicker'; }

  // For testing from the console: station9.hatman.force()
  force() { this.next = 0; if (this.reveals >= HATMAN.perRun) this.reveals = HATMAN.perRun - 1; }

  // ctx: { stage, elapsed, inSuite, blocked (the alien hunts, or a trick is running), player: { x, z } }
  update(dt, ctx) {
    if (this.dipLeft > 0 && (this.dipLeft -= dt) <= 0 && this.state === 'idle') this.figure.setLamps?.(1);
    if (this.cameoLeft > 0 && (this.cameoLeft -= dt) <= 0) this.figure.hideCameo();
    this.t += dt;
    // Switched off: nothing new (a reveal already under way still finishes, so the lights come back).
    if (this.state === 'idle' && !this.enabled) return;
    if (this.state === 'idle') this.idle(dt, ctx);
    else if (this.state === 'blackout') this.duringBlackout(ctx);
    else if (this.state === 'shown') this.whileShown(dt, ctx);
    else if (this.state === 'flicker' && this.t >= HATMAN.flicker) this.lights(true, 'idle');
  }

  idle(dt, ctx) {
    if (this.reveals >= HATMAN.perRun) return;
    this.next -= dt;
    if (this.next > 0 || ctx.inSuite || ctx.blocked || this.cameoActive) return;
    const spot = chooseSpot(this.spots, {
      from: ctx.player, forward: this.rig.forward(), stage: ctx.stage, used: this.used,
      lineClear: (a, b) => this.lineClear(a, b), rand: this.rand,
    });
    if (!spot) { this.next = HATMAN.retry; return; }
    this.spot = spot;
    this.used.add(spot.id);
    this.reveals++;
    this.placed = false;
    this.lights(false, 'blackout');
  }

  duringBlackout(ctx) {
    if (!this.placed && this.t >= HATMAN.placeAt) {
      this.placed = true;
      const s = this.spot, p = ctx.player;
      // Walked right up to it in the dark: skip this one.
      if (dist(s, p) < HATMAN.minDist || ctx.inSuite) { this.spot = null; return; }
      // His red backdrop light goes just behind him, away from you down the corridor.
      const d = dist(s, p) || 1;
      this.figure.place(s.x, s.z, s.x + ((s.x - p.x) / d) * 0.9, s.z + ((s.z - p.z) / d) * 0.9);
      this.figure.setAlpha(1);
    }
    if (this.t < HATMAN.blackout) return;
    if (!this.spot) { this.lights(true, 'idle'); return; }
    this.lights(true, 'shown');
    this.looked = 0;
    if (this.sightings++ === 0) this.onFirst();
  }

  whileShown(dt, ctx) {
    this.figure.update(ctx.elapsed);
    // Looking away resets the count: it takes two steady seconds.
    this.looked = this.lookingAt() ? this.looked + dt : 0;
    if (this.looked >= HATMAN.lookAway || this.t >= HATMAN.life || ctx.inSuite || ctx.blocked ||
        dist(this.figure.position, ctx.player) < HATMAN.tooClose) {
      this.figure.hide();
      this.lights(false, 'flicker');
    }
  }

  // Power off or on, and move to the next state.
  lights(on, state) {
    this.world.setBlackout(!on);
    this.figure.setLamps?.(on ? 1 : 0);
    this.state = state;
    this.t = 0;
    if (state === 'idle') this.next = HATMAN.gap[0] + this.rand() * (HATMAN.gap[1] - HATMAN.gap[0]);
  }

  // Are you looking straight at him (within 10 degrees, with nothing in the way)?
  lookingAt() {
    const cam = this.rig.position, f = this.rig.forward();
    const p = this.figure.position;
    const tx = p.x - cam.x, ty = HATMAN.hover + HATMAN.height * 0.6 - cam.y, tz = p.z - cam.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    const flen = Math.hypot(f.x, f.y, f.z) || 1;
    return (f.x * tx + f.y * ty + f.z * tz) / (len * flen) > HATMAN.lookCos && this.lineClear(cam, p);
  }

  // The reflection cameo: a faint figure behind you in dark glass for 1.5 s.
  showCameo(surface) {
    if (!this.enabled || this.busy || this.cameoActive) return false;
    this.figure.showCameo(surface);
    this.cameoLeft = HATMAN.cameo;
    this.world.dimBeat(HATMAN.dip);
    this.dipLeft = HATMAN.dip;
    this.figure.setLamps?.(0.2);
    return true;
  }
}

// The red haze behind him: a soft glow, brightest at his shoulders, so he reads as a black shape
// even in an unlit corridor. Drawn on a 2.4 m x 3.2 m plane.
export function hatmanHalo() {
  return makeCanvas(192, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, w * 0.55);
    grad.addColorStop(0, 'rgba(255,60,30,1)');
    grad.addColorStop(0.35, 'rgba(200,30,14,0.55)');
    grad.addColorStop(0.7, 'rgba(120,12,6,0.18)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  });
}

// His silhouette: a wide-brimmed hat, narrow shoulders and a long coat flaring to the hem, near black
// on transparent, with the faintest red edge. The canvas is 1 m x 2.3 m (the plane he's drawn on).
export function hatmanSilhouette() {
  const W = 256, H = Math.round(256 * HATMAN.height);
  const m = W; // pixels per metre
  return makeCanvas(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const y = (metresFromTop) => metresFromTop * m;
    const shape = () => {
      g.beginPath();
      // Crown, brim, head, shoulders, coat to the hem.
      g.moveTo(cx - 0.15 * m, y(0.02)); g.lineTo(cx + 0.15 * m, y(0.02));
      g.lineTo(cx + 0.16 * m, y(0.27));
      g.lineTo(cx + 0.33 * m, y(0.29)); g.lineTo(cx + 0.33 * m, y(0.33)); // brim, right
      g.lineTo(cx + 0.12 * m, y(0.34));
      g.lineTo(cx + 0.1 * m, y(0.5)); // neck
      g.quadraticCurveTo(cx + 0.29 * m, y(0.52), cx + 0.3 * m, y(0.66)); // shoulder
      g.lineTo(cx + 0.33 * m, y(1.2));
      g.lineTo(cx + 0.42 * m, y(2.27)); // hem, right
      g.lineTo(cx + 0.06 * m, y(2.3));
      g.lineTo(cx, y(2.15)); // a dark split in the coat
      g.lineTo(cx - 0.06 * m, y(2.3));
      g.lineTo(cx - 0.42 * m, y(2.27));
      g.lineTo(cx - 0.33 * m, y(1.2));
      g.lineTo(cx - 0.3 * m, y(0.66));
      g.quadraticCurveTo(cx - 0.29 * m, y(0.52), cx - 0.1 * m, y(0.5));
      g.lineTo(cx - 0.12 * m, y(0.34));
      g.lineTo(cx - 0.33 * m, y(0.33)); g.lineTo(cx - 0.33 * m, y(0.29)); // brim, left
      g.lineTo(cx - 0.16 * m, y(0.27));
      g.closePath();
    };
    // A faint red rim first (a little wider), then the black over it.
    g.save();
    g.shadowColor = 'rgba(110,18,10,0.6)'; // only a faint edge
    g.shadowBlur = 6;
    g.fillStyle = 'rgba(40,6,4,1)';
    shape(); g.fill();
    g.restore();
    g.fillStyle = '#030303';
    shape(); g.fill();
  });
}

// The cameo: a faint, pale upper body (hat and shoulders), as if seen in dark glass behind you.
export function hatmanReflection() {
  return makeCanvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const cx = w * 0.5, m = 230;
    g.fillStyle = 'rgba(190,205,205,1)';
    g.beginPath();
    g.moveTo(cx - 0.15 * m, 0.04 * m); g.lineTo(cx + 0.15 * m, 0.04 * m);
    g.lineTo(cx + 0.16 * m, 0.28 * m); g.lineTo(cx + 0.33 * m, 0.3 * m); g.lineTo(cx + 0.33 * m, 0.34 * m);
    g.lineTo(cx + 0.12 * m, 0.35 * m); g.lineTo(cx + 0.1 * m, 0.5 * m);
    g.quadraticCurveTo(cx + 0.3 * m, 0.52 * m, cx + 0.34 * m, 0.7 * m); g.lineTo(cx + 0.4 * m, h);
    g.lineTo(cx - 0.4 * m, h); g.lineTo(cx - 0.34 * m, 0.7 * m);
    g.quadraticCurveTo(cx - 0.3 * m, 0.52 * m, cx - 0.1 * m, 0.5 * m);
    g.lineTo(cx - 0.12 * m, 0.35 * m); g.lineTo(cx - 0.33 * m, 0.34 * m); g.lineTo(cx - 0.33 * m, 0.3 * m);
    g.lineTo(cx - 0.16 * m, 0.28 * m);
    g.closePath();
    g.fill();
    // Fade it out toward the bottom, like a reflection that doesn't quite reach.
    g.globalCompositeOperation = 'destination-in';
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.75, 'rgba(0,0,0,0.6)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  });
}
