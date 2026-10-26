// Environment tricks the alien plays on you, and the Hat Man.
// Rules from the Alien Behavior doc: one trick at a time, only while it patrols or investigates,
// only on a spot within 25 m that you can't see, never in the first 90 s, and every trick
// has a faint tell first. The cool-down shortens as you finish repairs.
import { cellOf, cellCenter, lineClear } from './layout.js';
import { LINES } from './intercom.js';

const COOLDOWN = 60;
const COOLDOWN_PER_REPAIR = 15;
const COOLDOWN_MIN = 30;
const FIRST_TRICK = 90;
const RANGE = 25;
const IDLE_FOR_SOUND = 4; // seconds standing still before the sound trick may play

export class Tricks {
  // w: { layout, world, audio, alien, player, isInView(pos), isDoorClosed, hatman,
  //      stage(), busy(), say(text) }
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
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const options = [this.lightTrick, this.doorTrick, this.soundTrick, this.propTrick, this.hatmanTrick]
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
        if (!started) { started = true; audio.playAt('flicker', pos, { volume: 1.2, ref: 3 }); }
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
        if (t < 0.05) audio.playAt('click', { x: door.x, z: door.z, y: 2 }, { volume: 0.9, ref: 3 });
        if (t < 1.6) return false;
        if (door.closed && !isInView(door)) {
          world.setDoor(door, false);
          audio.playAt('door', { x: door.x, z: door.z }, { volume: 0.3, rate: 1.1, duration: 2.5 });
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
        if (!s) s = audio.playAt('footsteps', pos, { volume: 1.4, ref: 3, loop: true, duration: 6 });
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
        if (t < 0.05 && from) audio.playAt('scrape', { x: cellCenter(from.cx), z: cellCenter(from.cz), y: 0.3 }, { volume: 1.2, ref: 3 });
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

  hatmanTrick() {
    const { hatman } = this.w;
    if (!hatman.ready()) return null;
    return {
      update: (dt, t) => {
        hatman.tryShow();
        return true;
      },
    };
  }
}

// A still silhouette down the corridor. Gone once you've looked straight at it for a couple of seconds.
// figure: the renderer's mesh { place(x, z, faceYaw, lightX, lightZ), setBacklight(k), hide(), position }
// rig: the camera (js/rig.js).
export class HatMan {
  constructor(figure, layout, rig, isDoorClosed, world) {
    this.figure = figure;
    this.layout = layout;
    this.camera = rig;
    this.isDoorClosed = isDoorClosed;
    this.world = world;
    this.cooldown = 0;
    this.visible = false;
    this.sightings = 0;
  }

  get position() { return this.figure.position; }

  ready() { return !this.visible && this.cooldown <= 0; }

  // Find a spot down the corridor you're facing and put it there.
  tryShow() {
    if (!this.ready()) return false;
    const cam = this.camera;
    const dir = cam.forward();
    const base = Math.atan2(dir.x, dir.z);
    const from = { x: cam.position.x, z: cam.position.z };
    for (const off of [0, 0.3, -0.3, 0.6, -0.6]) {
      const a = base + off;
      const dx = Math.sin(a), dz = Math.cos(a);
      let d = 0.5;
      while (d < 14) {
        const x = from.x + dx * d, z = from.z + dz * d;
        const cx = cellOf(x), cz = cellOf(z);
        if (!this.layout.isOpen(cx, cz) || (this.layout.isDoor(cx, cz) && this.isDoorClosed(cx, cz))) break;
        d += 0.5;
      }
      d -= 0.9;
      if (d < 5) continue;
      const x = from.x + dx * d, z = from.z + dz * d;
      // A red glow behind it turns it into a silhouette.
      this.figure.place(x, z, Math.atan2(from.x - x, from.z - z), x + dx * 0.9, z + dz * 0.9);
      this.figure.setBacklight(1);
      this.visible = true;
      this.life = 4;
      this.looked = 0;
      this.sightings++;
      this.world.dimBeat(0.45); // its tell: the lights dip for a beat
      return true;
    }
    return false;
  }

  hide() {
    this.figure.hide();
    this.visible = false;
    this.cooldown = 40;
  }

  update(dt) {
    if (!this.visible) { this.cooldown -= dt; return; }
    this.life -= dt;
    const cam = this.camera;
    const dir = cam.forward();
    const p = this.figure.position;
    const tx = p.x - cam.position.x, ty = 1.5 - cam.position.y, tz = p.z - cam.position.z;
    const len = Math.hypot(tx, ty, tz) || 1;
    const looking = (dir.x * tx + dir.y * ty + dir.z * tz) / len > Math.cos(0.18) &&
      lineClear(this.layout, cam.position, p, this.isDoorClosed);
    if (looking) this.looked += dt;
    // Slight flicker just before it goes.
    this.figure.setBacklight(this.looked > 1.6 ? (Math.random() < 0.5 ? 0 : 1) : 1);
    if (this.looked >= 2 || this.life <= 0) this.hide();
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
