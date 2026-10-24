// Environment tricks the alien plays on you, and the Hat Man.
// Rules from the design doc: one trick at a time, about a minute apart,
// only where you aren't looking, and every trick has a faint tell first.
import * as THREE from 'three';
import { cellOf, cellCenter, lineClear } from './layout.js';

const COOLDOWN = 60;
const FIRST_TRICK = 50;

export class Tricks {
  // w: { layout, world, audio, alien, player, isInView(pos), isDoorClosed, hatman }
  constructor(w) {
    this.w = w;
    this.cooldown = FIRST_TRICK;
    this.active = null;
  }

  update(dt) {
    if (this.active) {
      this.active.t += dt;
      if (this.active.update(dt, this.active.t)) {
        this.active = null;
        this.cooldown = COOLDOWN * (0.8 + Math.random() * 0.4);
      }
      return;
    }
    const { alien } = this.w;
    if (alien.dormant > 0 || (alien.state !== 'patrol' && alien.state !== 'investigate')) return;
    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    const options = [this.lightTrick, this.doorTrick, this.soundTrick, this.hatmanTrick]
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

  // Lights: the hum drops, then a nearby room flickers and goes dark.
  lightTrick() {
    const { world, audio, player, isInView } = this.w;
    const here = this.playerRoom();
    const candidates = world.rooms
      .filter((r) => r.room !== here)
      .map((r) => ({ r, pos: { x: cellCenter(r.room.cx), z: cellCenter(r.room.cz) } }))
      .filter(({ pos }) => !isInView(pos))
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
        else if (t < 13) r.mult = 0.03;
        else { r.mult = 1; audio.dipHum(false); return true; }
        return false;
      },
    };
  }

  // Doors: a soft click, then a door you closed is open again.
  doorTrick() {
    const { world, audio, player, isInView } = this.w;
    const pc = [cellOf(player.pos.x), cellOf(player.pos.z)];
    const candidates = world.doors.filter((d) =>
      d.closed && !d.startClosed && dist(d, player.pos) < 30 && !(d.cx === pc[0] && d.cz === pc[1]) && !isInView(d));
    if (!candidates.length) return null;
    const door = candidates[Math.floor(Math.random() * candidates.length)];
    return {
      update: (dt, t) => {
        if (t < 0.05) audio.playAt('click', { x: door.x, z: door.z, y: 2 }, { volume: 0.9, ref: 3 });
        if (t < 1.6) return false;
        if (door.closed && !isInView(door)) {
          world.setDoor(door, false);
          audio.playAt('door', { x: door.x, z: door.z }, { volume: 0.3, rate: 1.1, duration: 2.5 });
        }
        return true;
      },
    };
  }

  // Sound: footsteps in a room you know is empty, with a slight pitch wobble.
  soundTrick() {
    const { world, audio, player, alien } = this.w;
    const here = this.playerRoom();
    const candidates = world.rooms.filter((r) => {
      const pos = { x: cellCenter(r.room.cx), z: cellCenter(r.room.cz) };
      return r.room !== here && dist(pos, player.pos) < 26 && dist(pos, alien.pos) > 12;
    });
    if (!candidates.length) return null;
    const r = candidates[Math.floor(Math.random() * candidates.length)];
    const pos = { x: cellCenter(r.room.cx), z: cellCenter(r.room.cz) };
    let s = null;
    return {
      update: (dt, t) => {
        if (!s) s = audio.playAt('footsteps', pos, { volume: 1.4, ref: 3, duration: 6 });
        if (!s) return true;
        if (t < 1.5) s.setPlaybackRate(1 + Math.sin(t * 20) * 0.08);
        else s.setPlaybackRate(1);
        return t > 6;
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
export class HatMan {
  constructor(scene, layout, camera, isDoorClosed, world) {
    this.layout = layout;
    this.camera = camera;
    this.isDoorClosed = isDoorClosed;
    this.world = world;
    this.cooldown = 0;
    this.visible = false;
    this.sightings = 0;

    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const g = new THREE.Group();
    const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 1.55, 10), black);
    coat.position.y = 0.78;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), black);
    shoulders.scale.set(1.3, 0.6, 0.8);
    shoulders.position.y = 1.55;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), black);
    head.position.y = 1.78;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), black);
    brim.position.y = 1.9;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.22, 12), black);
    crown.position.y = 2.02;
    g.add(coat, shoulders, head, brim, crown);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd9c0 });
    for (const s of [-0.05, 0.05]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), eyeMat);
      eye.position.set(s, 1.8, 0.13);
      g.add(eye);
    }
    // A red glow behind it turns it into a silhouette.
    this.backlight = new THREE.PointLight(0xff2010, 0, 7, 2);
    scene.add(this.backlight);
    g.visible = false;
    scene.add(g);
    this.mesh = g;
  }

  ready() { return !this.visible && this.cooldown <= 0; }

  // Find a spot down the corridor you're facing and put it there.
  tryShow() {
    if (!this.ready()) return false;
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
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
      this.mesh.position.set(x, 0, z);
      this.mesh.rotation.y = Math.atan2(from.x - x, from.z - z);
      this.backlight.position.set(x + dx * 0.9, 1.6, z + dz * 0.9);
      this.backlight.intensity = 7;
      this.mesh.visible = true;
      this.visible = true;
      this.life = 14;
      this.looked = 0;
      this.sightings++;
      this.world.dimBeat(0.45); // its tell: the lights dip for a beat
      return true;
    }
    return false;
  }

  hide() {
    this.mesh.visible = false;
    this.visible = false;
    this.backlight.intensity = 0;
    this.cooldown = 40;
  }

  update(dt) {
    if (!this.visible) { this.cooldown -= dt; return; }
    this.life -= dt;
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const to = new THREE.Vector3(this.mesh.position.x - cam.position.x, 1.5 - cam.position.y, this.mesh.position.z - cam.position.z).normalize();
    const looking = dir.dot(to) > Math.cos(0.18) &&
      lineClear(this.layout, cam.position, this.mesh.position, this.isDoorClosed);
    if (looking) this.looked += dt;
    // Slight flicker just before it goes.
    this.backlight.intensity = this.looked > 1.6 ? (Math.random() < 0.5 ? 0 : 7) : 7;
    if (this.looked >= 2 || this.life <= 0) this.hide();
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
