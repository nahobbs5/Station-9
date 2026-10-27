// The Hat Man (reference files/Hatman.md): a tall, silent figure the alien conjures. He hovers at the
// far end of the corridor the alien is about to walk down (always true), a little closer after each
// repair, and now and then shows faintly in dark glass behind you. He never moves while you watch,
// never comes within 3 m, never appears in the wellness suites, and makes no sound: the only tell is
// the lights dipping for a beat. No engine here; js/babylon/props.js draws him.
import { cellOf, cellCenter } from './layout.js';
import { SPEED } from './alien.js';
import { inSuite } from './suiteplan.js';
import { propPlacement, windowPlacements } from './worldplan.js';
import { makeCanvas } from './textures.js';

// Tuning, from the doc's "Start" column.
export const HATMAN = {
  distances: [25, 18, 12, 6], // metres from you, by repairs done
  vary: 1.5,                  // +/- metres, so he's never quite where you expect
  lead: [2, 6],               // seconds before the alien reaches that corridor
  cooldown: 90,               // seconds between warnings
  perRun: 6,                  // warnings per run
  firstAfter: 90,             // the trick rule: nothing in the first 90 s
  lookAway: 2,                // seconds of looking straight at him before he goes
  life: 4,                    // seconds he stays once you've seen him
  linger: 2,                  // unseen, he waits until the alien is due in his corridor, plus this
  dip: 1,                     // seconds the lights dip when he appears (the tell)
  dipLevel: 0.2,              // corridor-end lamps drop to this during the dip
  behindCos: Math.cos((2 * Math.PI) / 3), // more than 120 degrees from where you face is "behind you"
  behindPenalty: 8,           // metres of distance error a spot behind you counts as
  fade: 0.3,                  // seconds to fade out
  cameo: 1.5,                 // seconds the reflection shows
  cameoRange: 3,              // metres from dark glass for a cameo
  minDist: 3,                 // never closer than this
  routeRange: 30,             // the alien's path must end this close to you
  lookCos: Math.cos(Math.PI / 18), // "looking at him": within 10 degrees
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

// Which corridor a cell belongs to: the one whose centreline passes closest.
export function corridorOfCell(layout, cx, cz) {
  if (!layout.isCorridor(cx, cz) || layout.isDoor(cx, cz)) return null;
  const x = cellCenter(cx), z = cellCenter(cz);
  let best = null, bestD = Infinity;
  for (const c of layout.corridors) {
    for (const p of c.pts) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = c.id; }
    }
  }
  return best;
}

// The corridor the alien will be walking down 2-6 s from now, following its current path, or null.
// Only while it patrols or investigates (tricks never run while it hunts).
export function predictCorridor(alien, layout) {
  if (alien.dormant > 0 || (alien.state !== 'patrol' && alien.state !== 'investigate')) return null;
  const speed = SPEED[alien.state];
  let at = { x: alien.pos.x, z: alien.pos.z }, travelled = 0;
  for (const [cx, cz] of alien.path ?? []) {
    const p = { x: cellCenter(cx), z: cellCenter(cz) };
    travelled += dist(at, p);
    at = p;
    const eta = travelled / speed;
    if (eta > HATMAN.lead[1]) break;
    if (eta < HATMAN.lead[0]) continue;
    const corridor = corridorOfCell(layout, cx, cz);
    if (corridor) return { corridor, cell: [cx, cz], eta };
  }
  return null;
}

// Where the alien's current path ends (or where it is, if it has none).
export function pathEnd(alien) {
  const last = alien.path?.[alien.path.length - 1];
  return last ? { x: cellCenter(last[0]), z: cellCenter(last[1]) } : { x: alien.pos.x, z: alien.pos.z };
}

// Pick his spot on that corridor: unused this run, at least 3 m away, out of view right now but in
// clear line of sight (so he's there when you turn), and as close as possible to the target distance.
// With forward (which way you face), a spot behind you scores worse than one a quick turn away.
export function chooseSpot(spots, corridor, { from, stage, used = new Set(), isInView = () => false, lineClear = () => true, rand = Math.random, forward = null }) {
  const target = HATMAN.distances[Math.min(stage, HATMAN.distances.length - 1)] + (rand() * 2 - 1) * HATMAN.vary;
  let best = null, bestErr = Infinity;
  for (const s of spots) {
    if (s.corridor !== corridor || used.has(s.id)) continue;
    const d = dist(s, from);
    if (d < HATMAN.minDist || isInView(s) || !lineClear(from, s)) continue;
    let err = Math.abs(d - target);
    if (forward && behind(forward, from, s, d)) err += HATMAN.behindPenalty;
    if (err < bestErr) { bestErr = err; best = s; }
  }
  return best;
}

// Is spot s (d metres away) more than 120 degrees from the way you face?
function behind(forward, from, s, d) {
  const flen = Math.hypot(forward.x, forward.z);
  if (!flen || !d) return false;
  return ((s.x - from.x) * forward.x + (s.z - from.z) * forward.z) / (d * flen) < HATMAN.behindCos;
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

// The Hat Man himself: when a warning starts, how long he stays, the look-away, and the cameo.
// figure: the renderer's { place(x, z, lightX, lightZ), setBacklight(k), setAlpha(k), hide(), update(time),
//   showCameo(surface), hideCameo(), setLamps(k) (corridor-end lamp brightness), position }
// rig: the camera ({ position, forward() }). lineClear(a, b): nothing solid (or a shut door) between.
// world: { dimBeat(seconds) }. onFirst(): called the first time he's ever placed.
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
    this.warnings = 0;
    this.lastWarning = -Infinity;
    this.visible = false;
    this.cameoLeft = 0;
    this.sightings = 0;
    this.dipLeft = 0;
  }

  get position() { return this.figure.position; }
  get cameoActive() { return this.cameoLeft > 0; }

  // ctx: { alien, stage, elapsed, inSuite, trickActive, isInView(pos), player: { x, z } }
  update(dt, ctx) {
    if (this.dipLeft > 0 && (this.dipLeft -= dt) <= 0) this.figure.setLamps?.(1);
    if (this.cameoLeft > 0 && (this.cameoLeft -= dt) <= 0) this.figure.hideCameo();
    if (this.visible) { this.updateVisible(dt, ctx); return; }
    if (this.canWarn(ctx)) this.tryWarn(ctx);
  }

  canWarn({ alien, elapsed, inSuite, trickActive, player }) {
    return !inSuite && !trickActive && !this.cameoActive &&
      alien.dormant <= 0 && (alien.state === 'patrol' || alien.state === 'investigate') &&
      elapsed >= HATMAN.firstAfter &&
      this.warnings < HATMAN.perRun && elapsed - this.lastWarning >= HATMAN.cooldown &&
      dist(pathEnd(alien), player) <= HATMAN.routeRange;
  }

  tryWarn({ alien, stage, elapsed, isInView, player }) {
    const route = predictCorridor(alien, this.layout);
    if (!route) return false;
    const spot = chooseSpot(this.spots, route.corridor, {
      from: player, stage, used: this.used, isInView, lineClear: (a, b) => this.lineClear(a, b), rand: this.rand,
      forward: this.rig.forward(),
    });
    if (!spot) return false;
    // His backdrop light goes just behind him, away from you down the corridor.
    const d = dist(spot, player) || 1;
    const bx = spot.x + ((spot.x - player.x) / d) * 0.9, bz = spot.z + ((spot.z - player.z) / d) * 0.9;
    this.figure.place(spot.x, spot.z, bx, bz);
    this.figure.setBacklight(1);
    this.figure.setAlpha(1);
    this.used.add(spot.id);
    this.spot = spot;
    this.corridor = route.corridor;
    this.visible = true;
    this.life = HATMAN.life;
    this.wait = route.eta + HATMAN.linger; // unseen, he goes about when the alien gets there
    this.seen = false;
    this.looked = 0;
    this.fading = -1;
    this.warnings++;
    this.lastWarning = elapsed;
    this.dip(); // the tell
    if (this.sightings++ === 0) this.onFirst();
    return true;
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

  updateVisible(dt, ctx) {
    this.figure.update(ctx.elapsed);
    if (this.fading >= 0) {
      this.fading += dt;
      this.figure.setAlpha(Math.max(0, 1 - this.fading / HATMAN.fade));
      if (this.fading >= HATMAN.fade) this.hide();
      return;
    }
    const looking = this.lookingAt();
    if (!this.seen && (looking || ctx.isInView?.(this.position))) this.seen = true;
    if (!this.seen) {
      // Waiting for you to turn round. He goes once the alien is due, or if it stops patrolling.
      this.wait -= dt;
      const { alien } = ctx;
      const patrolling = alien && alien.dormant <= 0 && (alien.state === 'patrol' || alien.state === 'investigate');
      if (this.wait <= 0 || !patrolling || ctx.inSuite) this.fading = 0;
      return;
    }
    this.life -= dt;
    // Looking away resets the count: it takes two steady seconds.
    this.looked = looking ? this.looked + dt : 0;
    if (this.looked >= HATMAN.lookAway || this.life <= 0 || ctx.inSuite) this.fading = 0;
  }

  // The lights dip for a beat, the corridor-end lamps too.
  dip() {
    this.world.dimBeat(HATMAN.dip);
    this.dipLeft = HATMAN.dip;
    this.figure.setLamps?.(HATMAN.dipLevel);
  }

  hide() {
    this.figure.hide();
    this.visible = false;
    this.fading = -1;
  }

  // The reflection cameo: a faint figure behind you in dark glass for 1.5 s.
  showCameo(surface) {
    if (this.visible || this.cameoActive) return false;
    this.figure.showCameo(surface);
    this.cameoLeft = HATMAN.cameo;
    this.dip();
    return true;
  }
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
