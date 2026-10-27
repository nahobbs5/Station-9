// Apparitions from the field guide (reference files/Station 9_ Apparition Field Guide.png):
// "Glitches. Memories. Something else. Brief encounters. Not real. But they feel real."
// The Hat Man has his own module (js/hatman.js). These are the other nine. They share one queue:
// one at a time, every 45-90 s after the first 35 s, each only where it fits. Nothing ever appears
// in the safe rooms (Wellness and Quiet), and stepping into one sends a showing apparition away.
// Everything here honours the menu's Apparitions setting (Apparitions.enabled).
// The computer screen apparitions (js/screenapparitions.js) join the same queue when there's a feed.
// No engine here; js/babylon/apparitions.js draws them from the art in assets/apparitions/.
import { cellOf, cellCenter, WALL_H } from './layout.js';
import { inSuite } from './suiteplan.js';
import { corridorSpots } from './hatman.js';
import { SCREEN, SCREEN_KINDS, SCREEN_IDS, ROOM_EVENT, pickScreen, roomScreens } from './screenapparitions.js';

export const APPARITION = {
  firstAfter: 35,   // nothing in the first 35 s
  gap: [75, 130],   // seconds between apparitions (random in this range)
  screenFirst: 120, // no terminal apparitions in the first 2 minutes...
  screenGap: 180,   // ...or within 3 minutes of the last one, so they stay a surprise
  retry: 2,         // due, but nothing fits where you are: look again this often
  minDist: 3,       // never closer than this
  alienClear: 10,   // never within this of the alien
  lookCos: Math.cos((10 * Math.PI) / 180), // "looking straight at it"
  glitchOut: 0.25,  // seconds of glitching as one vanishes
  minShow: 2,       // every one stays at least this long before it can go (looked at, walked up to)
};

const deg = (d) => (d * Math.PI) / 180;

// The nine. tint: 'art' (the guide's colours, faintly see-through), 'black' (a dark shape) or
// 'pale' (a faint pale shape, for glass). glow: the haze a dark one stands against, so it reads. h: plane height in metres (the figure fills ~85% of it);
// aspect: plane width / height (the crop's). level: art brightness (default 1.5). weight: how likely it's picked when it fits.
export const KINDS = {
  gasmask:    { tint: 'art',   h: 2.1,  aspect: 0.92, weight: 1,   life: 3,   sound: 'breath', volume: 0.35 },
  patient:    { tint: 'art',   h: 2.0,  aspect: 0.91, weight: 1.2, life: 4,   level: 2.4 },
  astronaut:  { tint: 'art',   h: 2.1,  aspect: 0.9,  weight: 1.2, life: 5 },
  child:      { tint: 'art',   h: 2.3,  aspect: 0.82, weight: 0.5, life: 2.5, maxPerRun: 1, level: 1.6, glow: 0xd8b49a },
  shadow:     { tint: 'black', h: 2.5,  aspect: 0.86, weight: 1,   life: 4,   glow: 0x7f95b0 },
  crew:       { tint: 'art',   h: 2.1,  aspect: 0.88, weight: 1,   life: 6 },
  reflection: { tint: 'pale',  h: 0.8,  aspect: 0.88, weight: 1,   life: 2.5 },
  static:     { tint: 'art',   h: 2.1,  aspect: 0.89, weight: 1,   life: 3,   sound: 'radio' },
  hanging:    { tint: 'black', h: 2.2,  aspect: 0.84, weight: 0.8, life: 2.5, glow: 0xff2a18 },
};
export const KIND_IDS = Object.keys(KINDS);

// A field-guide kind or a computer screen one (js/screenapparitions.js).
// 'screen-room' is the rare one where every terminal in the room goes off at once.
const kindOf = (id) => KINDS[id] ?? SCREEN_KINDS[id] ?? (id === ROOM_EVENT.id ? ROOM_EVENT : undefined);
const isScreen = (id) => id in SCREEN_KINDS || id === ROOM_EVENT.id;

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isSafeAt = (layout, p) => layout.isSafe(cellOf(p.x), cellOf(p.z)) || inSuite(layout, p) !== null;

// Where they can stand: the middle of every open floor cell, rooms and corridors alike, clear of the
// walls, never in a safe room or its doorway. Each: { x, z, room (id or null), corridor (bool) }.
export function floorSpots(layout) {
  const out = [];
  for (let cz = 0; cz < layout.h; cz++) for (let cx = 0; cx < layout.w; cx++) {
    if (!layout.isOpen(cx, cz) || layout.isSafe(cx, cz)) continue;
    const p = { x: cellCenter(cx), z: cellCenter(cz) };
    if (layout.walkDistance(p.x, p.z) < 0.5 || inSuite(layout, p)) continue;
    const room = layout.roomAt(cx, cz);
    if (room?.safe) continue;
    // A doorway into a safe room counts as the safe room.
    if (layout.isDoor(cx, cz) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.isSafe(cx + dx, cz + dz))) continue;
    out.push({ x: p.x, z: p.z, room: room?.id ?? null, corridor: layout.isCorridor(cx, cz) });
  }
  return out;
}

// The angle (degrees) between where you face and a spot, flat on the floor.
function offAxis(from, forward, s) {
  const dx = s.x - from.x, dz = s.z - from.z, d = Math.hypot(dx, dz) || 1;
  const flen = Math.hypot(forward.x, forward.z) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, (dx * forward.x + dz * forward.z) / (d * flen)))) * 180) / Math.PI;
}

// Pick a spot: within [near, far] metres, between minAngle and maxAngle degrees off where you face,
// in clear sight, away from the alien and the safe rooms. Random among those that fit.
export function pickSpot(spots, ctx, { near, far, minAngle = 0, maxAngle = 30, where = () => true }, lineClear, rand) {
  const ok = spots.filter((s) => {
    const d = dist(s, ctx.player);
    if (d < Math.max(near, APPARITION.minDist) || d > far || !where(s)) return false;
    if (ctx.alien && dist(s, ctx.alien) < APPARITION.alienClear) return false;
    const a = offAxis(ctx.player, ctx.forward, s);
    return a >= minAngle && a <= maxAngle;
  });
  // Shuffle-pick until one is in clear sight (lineClear is the costly check).
  while (ok.length) {
    const i = Math.floor(rand() * ok.length);
    const s = ok[i];
    if (lineClear(ctx.player, s)) return s;
    ok.splice(i, 1);
  }
  return null;
}

export class Apparitions {
  // figure: the renderer's { show(kind), pose({ x, y, z, alpha, jitter, flipX, rotY, w, h }), hide() }
  // deps: { lineClear(a, b), sound(name, pos, opts) -> handle with stop() or null,
  //         grates (js/vents.js grateSpots), surfaces (js/hatman.js cameoSurfaces), rand,
  //         feed: the screen renderer's { show(key, id), set(id, k, t), hide() } (js/babylon/screens.js),
  //         consoles: js/screenapparitions.js consoleScreens }. No feed: no screen apparitions.
  constructor(figure, layout, { lineClear = () => true, sound = () => null, grates = [], surfaces = [], rand = Math.random, feed = null, consoles = [] } = {}) {
    this.figure = figure;
    this.layout = layout;
    this.lineClear = lineClear;
    this.sound = sound;
    this.grates = grates;
    this.surfaces = surfaces.filter((s) => !isSafeAt(layout, s));
    this.rand = rand;
    this.floor = floorSpots(layout);
    this.corridor = corridorSpots(layout).filter((s) => !isSafeAt(layout, s));
    this.feed = feed;
    this.consoles = feed ? consoles : [];
    this.next = APPARITION.firstAfter;
    this.active = null;
    this.ids = this.consoles.length ? [...KIND_IDS, ...SCREEN_IDS, ROOM_EVENT.id] : KIND_IDS;
    this.sinceScreen = Infinity; // seconds since the last terminal apparition ended
    this.shown = Object.fromEntries(this.ids.map((k) => [k, 0]));
    this.forced = null;
    this.pending = null; // a debug summon, shown next update whatever the rules
    this.enabled = true; // the menu's Apparitions setting
  }

  get busy() { return this.active !== null; }

  // For testing from the console: station9.apparitions.force('patient') (or no id for any).
  force(id = null) { this.next = 0; this.forced = id; }

  // Debug keys (js/game.js, ?debug): show this one now. It goes where it would normally go if it
  // can, otherwise a few metres ahead of you; the setting, safe rooms and the rest don't stop it.
  summon(id) { if (kindOf(id)) this.pending = id; }

  // ctx: { elapsed, player: { x, z }, eye: { x, y, z }, forward: { x, y, z }, alien: { x, z },
  //        inSafe (in a safe room or a vent), blocked (alien hunting, Hat Man or a trick), dark (power out) }
  update(dt, ctx) {
    if (!this.active?.screen) this.sinceScreen += dt;
    if (this.pending) {
      const id = this.pending;
      this.pending = null;
      const place = this.find(id, ctx) ?? this.ahead(id, ctx);
      if (place) {
        if (this.active) this.end();
        this.start(id, place, ctx, { debug: true });
        return;
      }
      console.info(`No room for ${id} here${isScreen(id) ? ': no monitor in view' : ''}.`);
    }
    if (this.active) { this.step(dt, ctx); return; }
    if (!this.enabled || ctx.inSafe || ctx.blocked || ctx.dark) return;
    this.next -= dt;
    if (this.next > 0) return;
    const screensOk = this.sinceScreen >= APPARITION.screenGap && (ctx.elapsed ?? 0) >= APPARITION.screenFirst;
    const ids = (this.forced ? [this.forced] : this.ids).filter((k) => this.forced ||
      (this.shown[k] < (kindOf(k).maxPerRun ?? Infinity) && (!isScreen(k) || screensOk) &&
       (ctx.elapsed ?? 0) >= (kindOf(k).firstAfter ?? 0)));
    const fits = [];
    for (const id of ids) {
      const place = this.find(id, ctx);
      if (place) fits.push({ id, place });
    }
    if (!fits.length) { this.next = APPARITION.retry; return; }
    let r = this.rand() * fits.reduce((s, f) => s + kindOf(f.id).weight, 0);
    const pick = fits.find((f) => (r -= kindOf(f.id).weight) <= 0) ?? fits[fits.length - 1];
    this.start(pick.id, pick.place, ctx);
  }

  // Where this kind could show right now, or null. Returns { x, y, z, ... }.
  find(id, ctx) {
    const L = this.layout, lc = (a, b) => this.lineClear(a, b), rand = this.rand;
    const floorY = (s) => ({ ...s, y: 0 }); // the plane's bottom on the floor
    if (id === ROOM_EVENT.id) {
      // Every terminal in the room you're in (two or more, at least one in clear sight), all
      // playing the same one. Its sound comes from the middle of them.
      const list = this.feed ? roomScreens(this.consoles, L, ctx.player) : [];
      if (list.length < 2 || !list.some((s) => lc(ctx.player, s.front))) return null;
      const n = list.length;
      return { x: list.reduce((a, s) => a + s.x, 0) / n, y: 1.12, z: list.reduce((a, s) => a + s.z, 0) / n,
        screens: list, as: SCREEN_IDS[Math.floor(rand() * SCREEN_IDS.length)] };
    }
    if (isScreen(id)) {
      // On a console monitor you're facing, a few metres off.
      const s = this.feed && pickScreen(this.consoles, ctx, lc);
      return s && { x: s.x, y: s.y, z: s.z, screen: s };
    }
    switch (id) {
      case 'gasmask': {
        // Damaged areas or ventilation: the Generator Room, or near a vent grate.
        const nearGrate = (s) => this.grates.some((g) => dist(g, s) < 4);
        const s = pickSpot(this.floor, ctx, { near: 5, far: 12, where: (s) => s.room === 'generator' || nearGrate(s) }, lc, rand);
        return s && floorY(s);
      }
      case 'patient': {
        // No medical bay: Crew Quarters, where Dr. Ostrowski wrote about the Trial 27 volunteer.
        const s = pickSpot(this.floor, ctx, { near: 4, far: 10, maxAngle: 35, where: (s) => s.room === 'crew' }, lc, rand);
        return s && floorY(s);
      }
      case 'astronaut': {
        // By the airlocks: the Arrival Airlock and the Escape Pod Bay. Floats off the floor.
        const s = pickSpot(this.floor, ctx, { near: 4, far: 12, maxAngle: 35, where: (s) => s.room === 'airlock' || s.room === 'pod' }, lc, rand);
        return s && { ...s, y: 0.5 };
      }
      case 'child': {
        // Down the corridor you're looking along, near enough to make out.
        const s = pickSpot(this.corridor, ctx, { near: 5, far: 9, maxAngle: 20 }, lc, rand);
        return s && floorY(s);
      }
      case 'shadow': {
        // At the edge of your vision: 35-48 degrees off where you face (the screen's edge is ~51).
        const s = pickSpot(this.floor, ctx, { near: 4, far: 8, minAngle: 35, maxAngle: 48 }, lc, rand);
        return s && floorY(s);
      }
      case 'crew': {
        const s = pickSpot(this.floor, ctx, { near: 8, far: 15, maxAngle: 30 }, lc, rand);
        return s && floorY(s);
      }
      case 'static': {
        const s = pickSpot(this.floor, ctx, { near: 6, far: 14, maxAngle: 30 }, lc, rand);
        return s && floorY(s);
      }
      case 'hanging': {
        // From the ceiling, down a corridor ahead or over a vent grate.
        const grates = this.grates.filter((g) => !isSafeAt(L, g));
        const s = pickSpot([...this.corridor, ...grates], ctx, { near: 6, far: 12, maxAngle: 25 }, lc, rand);
        return s && { ...s, y: WALL_H - KINDS.hanging.h };
      }
      case 'reflection': {
        // Dark glass you're close to and facing (like the Hat Man's cameo).
        const f = ctx.forward;
        const s = this.surfaces.find((s) => {
          const dx = s.x - ctx.player.x, dz = s.z - ctx.player.z, d = Math.hypot(dx, dz);
          if (d > 3 || d < 0.3) return false;
          const facesYou = Math.sin(s.rotY) * -dx + Math.cos(s.rotY) * -dz > 0;
          return facesYou && (f.x * dx + f.z * dz) / (d * (Math.hypot(f.x, f.z) || 1)) > 0.75;
        });
        return s && { x: s.x, y: s.y - s.h * 0.45, z: s.z, rotY: s.rotY, glass: s };
      }
    }
    return null;
  }

  // A debug summon that found no usual spot: straight ahead of you, 5 m off (4 or 3 if a wall is
  // nearer), in clear sight. Screens: the nearest monitor in clear sight, any angle, up to 15 m.
  ahead(id, ctx) {
    if (id === ROOM_EVENT.id) return null; // only in a room with terminals
    if (isScreen(id)) {
      const s = this.feed && pickScreen(this.consoles, ctx, (a, b) => this.lineClear(a, b), { loose: true });
      return s && { x: s.x, y: s.y, z: s.z, screen: s };
    }
    const f = ctx.forward, flen = Math.hypot(f.x, f.z) || 1;
    for (const d of [5, 4, APPARITION.minDist]) {
      const p = { x: ctx.player.x + (f.x / flen) * d, z: ctx.player.z + (f.z / flen) * d };
      if (this.layout.walkDistance(p.x, p.z) < 0.4 || !this.lineClear(ctx.player, p)) continue;
      const y = id === 'astronaut' ? 0.5 : id === 'hanging' ? WALL_H - KINDS.hanging.h : 0;
      return { ...p, y };
    }
    return null;
  }

  start(id, place, ctx, { debug = false } = {}) {
    const k = kindOf(id);
    this.forced = null;
    if (!debug) this.shown[id]++; // a debug show doesn't use up the child's one appearance
    if (isScreen(id)) {
      // The whole room plays one kind (place.as); otherwise it's this kind on one monitor.
      const as = place.as ?? id, room = !!place.screens;
      this.active = { id, as, t: 0, leaving: -1, place, debug, screen: true, room };
      this.feed.show(room ? place.screens.map((s) => s.key) : place.screen.key, as);
      // A breath for the gas mask, otherwise a hiss of static from the monitor (louder for a room).
      const look = SCREEN_KINDS[as];
      this.active.snd = this.sound(look.sound ?? 'radio', { x: place.x, y: place.y, z: place.z },
        { volume: room ? 0.5 : look.volume ?? 0.35, ref: room ? 4 : 2, loop: true, duration: k.life + 0.2, bus: 'alien' });
      return;
    }
    // A reflection placed ahead (no glass near) stands like the others.
    const h = id === 'reflection' ? (place.glass ? place.glass.h * 0.9 : 1.8) : k.h;
    const a = this.active = {
      id, t: 0, leaving: -1, looked: 0, place, debug,
      pose: { x: place.x, y: place.y, z: place.z, alpha: 1, jitter: 0, flipX: false, rotY: place.rotY ?? null, h },
      jumpIn: 0, home: { x: place.x, z: place.z }, startPlayer: { x: ctx.player.x, z: ctx.player.z },
    };
    a.pose.w = a.pose.h * k.aspect;
    this.figure.show(id);
    if (k.sound) a.snd = this.sound(k.sound, { x: place.x, y: 1.6, z: place.z }, { volume: k.volume ?? 1, ref: 3, loop: true, duration: k.life + 0.5, bus: 'alien' });
    this.figure.pose(a.pose);
  }

  // Start going (a short glitch-out), unless already on the way or it hasn't had its couple of seconds.
  leave() { const a = this.active; if (a.leaving < 0 && a.t >= APPARITION.minShow) a.leaving = 0; }

  end() {
    if (this.active.screen) { this.feed.hide(); this.sinceScreen = 0; }
    else this.figure.hide();
    const s = this.active.snd;
    if (s) { s.stop(); s.dispose?.(); }
    this.active = null;
    this.next = APPARITION.gap[0] + this.rand() * (APPARITION.gap[1] - APPARITION.gap[0]);
  }

  // Is the camera pointed straight at a point (within 10 degrees), with nothing in the way?
  lookingAt(ctx, p, cos = APPARITION.lookCos) {
    const e = ctx.eye ?? { ...ctx.player, y: 1.6 }, f = ctx.forward;
    const tx = p.x - e.x, ty = p.y - e.y, tz = p.z - e.z;
    const len = Math.hypot(tx, ty, tz) || 1, flen = Math.hypot(f.x, f.y, f.z) || 1;
    return (f.x * tx + f.y * ty + f.z * tz) / (len * flen) > cos && this.lineClear(ctx.player, p);
  }

  step(dt, ctx) {
    const a = this.active, k = kindOf(a.id), P = a.pose;
    a.t += dt;
    // Safe rooms stay clean, and a hunt or a blackout ends it at once (not a debug summon).
    if (!a.debug && (ctx.inSafe || ctx.dark || ctx.blocked)) { this.end(); return; }
    if (a.screen) {
      // It plays out on the monitor, unless you walk right up to it.
      const near = !a.room && !a.debug && a.t >= APPARITION.minShow && dist(a.place, ctx.player) < SCREEN.tooClose;
      if (a.t >= k.life || near) { this.end(); return; }
      this.feed.set(a.as, a.t / k.life, a.t);
      return;
    }
    if (a.leaving >= 0) {
      a.leaving += dt;
      const fades = a.id === 'shadow' || a.id === 'child';
      if (a.leaving >= (fades ? 0.4 : APPARITION.glitchOut)) { this.end(); return; }
      if (a.id === 'child') { // fades where she stands
        P.alpha = 1 - a.leaving / 0.4; P.jitter = 0;
      } else if (a.id === 'shadow') { // melts: fades and sinks
        P.alpha = 1 - a.leaving / 0.4; P.y = a.place.y - a.leaving * 1.2; P.jitter = 0.2;
      } else {
        P.jitter = 1; P.alpha = this.rand() < 0.5 ? 0.15 : 0.9;
      }
      this.figure.pose(P);
      return;
    }
    if (a.t >= k.life) { this.leave(); this.figure.pose(P); return; }
    const d = dist(P, ctx.player);
    const centre = { x: P.x, y: P.y + P.h * 0.55, z: P.z };
    const looked = this.lookingAt(ctx, centre);
    a.looked = looked ? a.looked + dt : 0;
    if (d < APPARITION.minDist) this.leave();
    this.behave(a, dt, ctx, d, looked);
    this.figure.pose(P);
  }

  behave(a, dt, ctx, d, looked) {
    const P = a.pose, t = a.t, rand = this.rand;
    switch (a.id) {
      case 'gasmask': // flickers in and out of view; goes after a second of being stared at
        P.alpha = Math.sin(t * 9) + Math.sin(t * 23) > 0.4 ? 0.15 : 0.95;
        P.jitter = 0.4;
        if (a.looked >= 1) this.leave();
        break;
      case 'patient': // moves erratically: a jerk to a nearby spot every 0.3-0.6 s
        if ((a.jumpIn -= dt) <= 0) {
          a.jumpIn = 0.3 + rand() * 0.3;
          const ang = rand() * Math.PI * 2, r = 0.2 + rand() * 0.5;
          const nx = a.home.x + Math.cos(ang) * r, nz = a.home.z + Math.sin(ang) * r;
          if (this.layout.walkDistance(nx, nz) > 0.4) { P.x = nx; P.z = nz; }
          P.jitter = 0.8;
        } else P.jitter = 0.1;
        if (d < 4) this.leave();
        break;
      case 'astronaut': { // drifts silently, rising slowly and reaching toward you
        P.y = a.place.y + t * 0.08 + Math.sin(t * 1.3) * 0.05;
        const dx = ctx.player.x - a.home.x, dz = ctx.player.z - a.home.z, dd = Math.hypot(dx, dz) || 1;
        const reach = Math.min(1, t * 0.2);
        P.x = a.home.x + (dx / dd) * reach; P.z = a.home.z + (dz / dd) * reach;
        P.jitter = 0.05;
        if (a.looked >= 2) this.leave();
        break;
      }
      case 'child': // stands and stares, then she's gone
        P.jitter = 0;
        break;
      case 'shadow': // melts away the moment you look at it
        P.jitter = 0.15;
        if (this.lookingAt(ctx, { x: P.x, y: 1.2, z: P.z }, Math.cos(deg(20)))) this.leave();
        break;
      case 'crew': // a normal crew member at first; glitches and vanishes when you get close
        P.jitter = d < 9 ? 0.3 : 0;
        if (d < 6) this.leave();
        break;
      case 'reflection': { // a figure in the glass that moves against you
        if (!a.place.glass) { P.alpha = Math.min(1, t / 0.3) * 0.85; P.jitter = 0.1; break; } // debug: no glass
        const g = a.place.glass, rx = Math.cos(g.rotY), rz = -Math.sin(g.rotY); // the glass's sideways
        const side = (ctx.player.x - a.startPlayer.x) * rx + (ctx.player.z - a.startPlayer.z) * rz;
        const off = Math.max(-0.35, Math.min(0.35, -side * 0.8 + Math.sin(t * 2.2) * 0.06)) * g.w * 0.5;
        P.x = a.place.x + rx * (off + g.w * 0.15); P.z = a.place.z + rz * (off + g.w * 0.15);
        P.alpha = Math.min(1, t / 0.3) * 0.85;
        P.jitter = 0.1;
        break;
      }
      case 'static': // flickers like a bad transmission, with radio fragments
        P.alpha = rand() < 0.2 ? 0.1 : 0.6 + rand() * 0.4;
        P.jitter = 0.9;
        break;
      case 'hanging':
        P.jitter = 0.1;
        P.y = a.place.y + Math.sin(t * 3) * 0.03;
        break;
    }
  }
}
