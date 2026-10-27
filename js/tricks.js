// Environment tricks the alien plays on you, and the Hat Man.
// Rules from the Alien Behavior doc: one trick at a time, only while it patrols or investigates,
// only on a spot within 25 m that you can't see, never in the first 90 s, and every trick
// has a faint tell first. The cool-down shortens as you finish repairs.
import { cellOf, cellCenter } from './layout.js';
import { LINES } from './intercom.js';
import { HATMAN } from './hatman.js';

const COOLDOWN = 60;
const COOLDOWN_PER_REPAIR = 15;
const COOLDOWN_MIN = 30;
const FIRST_TRICK = 90;
const RANGE = 25;
const IDLE_FOR_SOUND = 4; // seconds standing still before the sound trick may play

export class Tricks {
  // w: { layout, world, audio, alien, player, isInView(pos), isDoorClosed, hatman, phantoms, cameoSurfaces,
  //      inSuite(), facing() (camera forward), stage(), busy(), say(text), apparitions() (menu setting) }
  constructor(w) {
    this.w = w;
    this.cooldown = FIRST_TRICK;
    this.active = null;
    this.visits = new Map(); // room id -> times you've walked in
    this.lastRoom = null;
    this.doorTricks = 0;
  }

  get cooldownLength() {
    return Math.max(COOLDOWN_MIN, COOLDOWN - COOLDOWN_PER_REPAIR * this.w.stage());
  }

  update(dt) {
    const room = this.playerRoom();
    if (room && room !== this.lastRoom) this.visits.set(room.id, (this.visits.get(room.id) ?? 0) + 1);
    this.lastRoom = room;

    if (this.active) {
      this.active.t += dt;
      if (this.active.update(dt, this.active.t)) {
        this.active = null;
        this.cooldown = this.cooldownLength;
      }
      return;
    }
    const { alien } = this.w;
    if (alien.dormant > 0 || (alien.state !== 'patrol' && alien.state !== 'investigate')) return;
    if (this.w.hatman.busy || this.w.phantoms?.busy) return; // one at a time: apparitions count
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const options = [this.lightTrick, this.doorTrick, this.soundTrick, this.propTrick, this.cameoTrick]
      .map((f) => f.call(this))
      .filter(Boolean);
    if (!options.length) { this.cooldown = 5; return; }
    this.active = options[Math.floor(Math.random() * options.length)];
    this.active.t = 0;
  }

  playerRoom() {
    const { layout, player } = this.w;
    return layout.roomAt(cellOf(player.pos.x), cellOf(player.pos.z));
  }

  // Lights: the hum drops, then a repaired room near you flickers and goes dark for 20 s.
  lightTrick() {
    const { world, audio, player, isInView, stage, busy } = this.w;
    if (busy()) return null;
    const repaired = ['generator', 'comms'].slice(0, stage());
    const candidates = world.rooms
      .filter((r) => repaired.includes(r.room.id))
      .map((r) => ({ r, pos: { x: cellCenter(r.room.cx), z: cellCenter(r.room.cz) } }))
      .filter(({ pos }) => dist(pos, player.pos) < RANGE && !isInView(pos))
      .sort((a, b) => dist(a.pos, player.pos) - dist(b.pos, player.pos));
    if (!candidates.length) return null;
    const { r, pos } = candidates[0];
    let started = false;
    return {
      update: (dt, t) => {
        if (t < 0.05) audio.dipHum(true);
        if (t < 1.8) return false; // the tell
        if (!started) { started = true; audio.playAt('flicker', pos, { volume: 1.2, ref: 3, bus: 'alien' }); }
        if (t < 3.8) r.mult = Math.random() < 0.5 ? 1 : 0.05;
        else if (t < 23.8) r.mult = 0.03; // dark for 20 s
        else { r.mult = 1; audio.dipHum(false); return true; }
        return false;
      },
    };
  }

  // Doors: a soft click, then a door you closed behind you is open again.
  doorTrick() {
    const { world, audio, player, isInView, say } = this.w;
    const pc = [cellOf(player.pos.x), cellOf(player.pos.z)];
    const candidates = world.doors.filter((d) =>
      d.closed && d.closedByPlayer && dist(d, player.pos) < RANGE && !(d.cx === pc[0] && d.cz === pc[1]) && !isInView(d));
    if (!candidates.length) return null;
    const door = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      update: (dt, t) => {
        if (t < 0.05) audio.playAt('click', { x: door.x, z: door.z, y: 2 }, { volume: 0.9, ref: 3, bus: 'alien' });
        if (t < 1.6) return false;
        if (door.closed && !isInView(door)) {
          world.setDoor(door, false);
          audio.playAt('door', { x: door.x, z: door.z }, { volume: 0.3, rate: 1.1, duration: 2.5, bus: 'alien' });
          if (this.doorTricks++ === 0 || Math.random() < 1 / 3) say(LINES.door(world.doors.indexOf(door) + 1));
        }
        return true;
      },
    };
  }

  // Sound: footsteps in a room you know is empty, with a slight pitch wobble.
  // Only while you're idle or hiding.
  soundTrick() {
    const { world, audio, player, alien, isInView } = this.w;
    if (player.idle < IDLE_FOR_SOUND && !player.crouching) return null;
    const here = this.playerRoom();
    const candidates = world.rooms.filter((r) => {
      const pos = { x: cellCenter(r.room.cx), z: cellCenter(r.room.cz) };
      return r.room !== here && !r.room.safe && dist(pos, player.pos) < RANGE && dist(pos, alien.pos) > 12 && !isInView(pos);
    });
    if (!candidates.length) return null;
    const r = candidates[Math.floor(Math.random() * candidates.length)];
    const pos = { x: cellCenter(r.room.cx), z: cellCenter(r.room.cz) };
    let s = null;
    return {
      update: (dt, t) => {
        if (!s) s = audio.playAt('footsteps', pos, { volume: 1.4, ref: 3, loop: true, duration: 6, bus: 'alien' });
        if (!s) return true;
        if (t < 1.5) s.setPlaybackRate(1 + Math.sin(t * 20) * 0.08);
        else s.setPlaybackRate(1);
        return t > 6;
      },
    };
  }

  // Props: a scrape from somewhere else, then something in a room you've been in before has moved.
  propTrick() {
    const { world, audio, player, isInView } = this.w;
    const here = this.playerRoom();
    if (!here || (this.visits.get(here.id) ?? 0) < 2) return null;
    const items = world.loose.filter((it) => it.room === here && !isInView(it.mesh.position));
    if (!items.length) return null;
    const item = items[Math.floor(Math.random() * items.length)];
    const elsewhere = world.rooms
      .map((r) => r.room)
      .filter((r) => r !== here && !r.safe && dist({ x: cellCenter(r.cx), z: cellCenter(r.cz) }, player.pos) < RANGE);
    const from = elsewhere[Math.floor(Math.random() * elsewhere.length)];
    return {
      update: (dt, t) => {
        if (t < 0.05 && from) audio.playAt('scrape', { x: cellCenter(from.cx), z: cellCenter(from.cz), y: 0.3 }, { volume: 1.2, ref: 3, bus: 'alien' });
        if (t < 2) return false;
        const p = item.mesh.position;
        if (isInView(p)) return true; // you turned round: leave it be
        const spots = item.spots.filter(([x, z]) => !isInView({ x: cellCenter(x), z: cellCenter(z) }));
        if (spots.length) {
          const [x, z] = spots[Math.floor(Math.random() * spots.length)];
          p.set(cellCenter(x) + (Math.random() - 0.5) * 0.6, 0, cellCenter(z) + (Math.random() - 0.5) * 0.6);
        }
        item.mesh.rotation.y += Math.PI * (0.5 + Math.random());
        return true;
      },
    };
  }

  // The Hat Man's reflection: you're close to dark glass (a dead monitor, the pod bay window) and
  // facing it, and for a moment there's a faint figure behind you in it. Never in the suites.
  cameoTrick() {
    const { hatman, player, inSuite, cameoSurfaces, facing } = this.w;
    if (this.w.apparitions && !this.w.apparitions()) return null;
    if (inSuite() || hatman.visible || hatman.cameoActive) return null;
    const fwd = facing();
    const surface = cameoSurfaces.find((s) => {
      const dx = s.x - player.pos.x, dz = s.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > HATMAN.cameoRange) return false;
      // You're in front of it (it faces you) and looking at it.
      const facesYou = Math.sin(s.rotY) * -dx + Math.cos(s.rotY) * -dz > 0;
      return facesYou && (fwd.x * dx + fwd.z * dz) / (d || 1) > 0.6;
    });
    if (!surface) return null;
    let shown = false;
    return {
      update: (dt, t) => {
        if (!shown) shown = hatman.showCameo(surface);
        return !shown || t >= HATMAN.cameo;
      },
    };
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
