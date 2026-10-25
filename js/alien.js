// The alien's brain, following the Alien Behavior doc: patrol, investigate, hunt, lose track.
// Pure logic with plain {x, z} positions, so it can be tested without a browser.
import { findPath } from './pathfind.js';
import { ROUTE, cellOf, cellCenter } from './layout.js';

export const SPEED = { patrol: 1.5, investigate: 2.5, search: 1.5, hunt: 5.5, lost: 1.2 };
export const SIGHT_RANGE = 4;       // metres
export const SIGHT_HALF_ANGLE = Math.PI / 3; // a 120 degree cone
export const HEAR_CLOSE = 4;        // hearing you this close while investigating starts a hunt
export const HUNT_TIMEOUT = 6;      // seconds out of sight and silent before a hunt ends
export const LOSE_TRACK_AFTER = 15; // seconds of quiet before it returns to patrol
export const SEARCH_TIME = 10;      // searching around a noise it investigated
export const WARN_TIME = 1;         // the tell before every hunt
export const WARN_TIME_CLOSE = 0.5; // ...shorter if it's already within 4 m
export const DOOR_FORCE_TIME = 1.5; // a closed door holds it this long
const PATROL_PAUSE = 3;             // listening stop in each room
const RECENT = 3;                   // a quieter noise can't retarget it within this many seconds
const CLICK_EVERY = { patrol: 5, investigate: 1.5, lost: 7 };
const LOST_MOVE = 2.5, LOST_STOP = 1.5; // stop-start shuffle while it has lost track

export class Alien {
  constructor(layout, { start = 'teleporter', dormant = 0, rand = Math.random } = {}) {
    this.layout = layout;
    this.rand = rand;
    this.route = ROUTE.map((id) => layout.room(id).spot);
    const s = ROUTE.indexOf(start);
    const [sx, sz] = this.route[s];
    this.pos = { x: cellCenter(sx), z: cellCenter(sz) };
    this.routeIdx = (s + 1) % this.route.length;
    this.heading = 0;
    this.state = 'patrol';
    this.dormant = dormant;
    this.time = 0;
    this.pause = 1;
    this.warn = 0;
    this.path = [];
    this.goal = null;
    this.repath = true;
    this.target = null;
    this.targetHeard = 0;
    this.targetTime = -Infinity;
    this.lastKnown = null;
    this.lastContact = -Infinity;
    this.lastSeen = -Infinity;
    this.lostSince = 0;
    this.searching = false;
    this.searchUntil = 0;
    this.clickTimer = 2;
    this.doorTimer = 0;
    this.moving = false;
    this.speed = 0;
    this.events = [];
  }

  get cell() { return [cellOf(this.pos.x), cellOf(this.pos.z)]; }
  get warning() { return this.state === 'hunt' && this.warn > 0; }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }

  // Cells it can walk on: open floor outside the safe rooms.
  passable(x, z) { return this.layout.isOpen(x, z) && !this.layout.isSafe(x, z); }
  reachableCell(x, z) { return this.layout.nearestOpen(cellOf(x), cellOf(z), (cx, cz) => this.passable(cx, cz)); }

  // A noise reached it. `heard` is the radius left after doors and walls.
  hear(noise, heard) {
    if (this.dormant > 0) return false;
    const d = Math.hypot(noise.x - this.pos.x, noise.z - this.pos.z);
    if (heard < d) return false;
    const cell = this.reachableCell(noise.x, noise.z);
    const fromPlayer = noise.source === 'player';
    switch (this.state) {
      case 'patrol':
      case 'lost':
        this.investigate(cell, heard);
        break;
      case 'investigate':
        if (fromPlayer && d <= HEAR_CLOSE) this.startHunt(cell, d);
        else this.investigate(cell, heard);
        break;
      case 'hunt':
        if (fromPlayer) this.contact(cell);
        // A decoy only pulls it away if it hasn't had eyes on you for a moment.
        else if (this.time - this.lastSeen > 0.5) this.investigate(cell, heard);
        break;
    }
    return true;
  }

  investigate(cell, heard) {
    if (this.state === 'investigate') {
      // Go to the loudest recent noise: a quieter one can't pull it away straight after.
      if (heard < this.targetHeard && this.time - this.targetTime < RECENT) return;
    } else {
      this.state = 'investigate';
      this.warn = 0;
      this.clickTimer = 0; // click straight away: the tell
      this.pause = 0.6;
    }
    this.target = cell;
    this.targetHeard = heard;
    this.targetTime = this.time;
    this.searching = false;
    this.repath = true;
  }

  startHunt(cell, dist) {
    if (this.state !== 'hunt') {
      this.state = 'hunt';
      this.warn = dist <= HEAR_CLOSE ? WARN_TIME_CLOSE : WARN_TIME;
      this.pause = 0;
      this.path = [];
      this.goal = null;
      this.emit('huntWarn', { time: this.warn });
    }
    this.contact(cell);
  }

  contact(cell) {
    this.lastContact = this.time;
    if (!this.lastKnown || this.lastKnown[0] !== cell[0] || this.lastKnown[1] !== cell[1]) this.repath = true;
    this.lastKnown = cell;
  }

  toLost() {
    this.state = 'lost';
    this.lostSince = this.time;
    this.path = [];
    this.goal = null;
    this.clickTimer = 2;
    this.emit('lost');
  }

  toPatrol() {
    this.state = 'patrol';
    let best = 0, bestD = Infinity;
    this.route.forEach(([x, z], i) => {
      const d = Math.hypot(cellCenter(x) - this.pos.x, cellCenter(z) - this.pos.z);
      if (d < bestD) { bestD = d; best = i; }
    });
    this.routeIdx = best;
    this.goal = null;
    this.path = [];
    this.repath = true;
    this.pause = 2;
    this.clickTimer = 2;
  }

  // ctx: { canSee, player: {x, z}, isDoorClosed(x, z), openDoor(x, z) }
  update(dt, ctx) {
    this.time += dt;
    this.moving = false;
    this.speed = 0;
    if (this.dormant > 0) {
      this.dormant -= dt;
      if (this.dormant <= 0) this.emit('wake');
      return;
    }
    const dx = ctx.player.x - this.pos.x, dz = ctx.player.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (ctx.canSee) {
      this.lastSeen = this.time;
      this.startHunt(this.reachableCell(ctx.player.x, ctx.player.z), d);
    }

    // Each state has its own click rhythm; a hunt has none.
    const every = CLICK_EVERY[this.state];
    if (every) {
      this.clickTimer -= dt;
      if (this.clickTimer <= 0) {
        this.emit('click', { state: this.state });
        this.clickTimer = this.state === 'lost' ? every * (0.85 + this.rand() * 0.3) : every;
      }
    }

    if (this.state === 'hunt' && this.warn > 0) {
      // The warning: it goes still and turns toward you, then sets off.
      this.heading = Math.atan2(dx, dz);
      this.warn -= dt;
      if (this.warn <= 0) { this.warn = 0; this.emit('hunt'); }
      return;
    }
    if (this.pause > 0) { this.pause -= dt; return; }

    switch (this.state) {
      case 'patrol': {
        if (this.repath || !this.goal) this.setGoal(this.route[this.routeIdx], ctx);
        if (this.follow(dt, SPEED.patrol, ctx)) {
          this.routeIdx = (this.routeIdx + 1) % this.route.length;
          this.goal = null;
          this.pause = PATROL_PAUSE;
        }
        break;
      }
      case 'investigate': {
        if (this.repath) this.setGoal(this.target, ctx);
        if (!this.searching) {
          if (this.follow(dt, SPEED.investigate, ctx)) {
            this.searching = true;
            this.searchUntil = this.time + SEARCH_TIME;
          }
        } else {
          this.wander(dt, SPEED.search, ctx);
          if (this.time >= this.searchUntil) this.toPatrol();
        }
        break;
      }
      case 'hunt': {
        if (this.time - this.lastContact > HUNT_TIMEOUT) { this.toLost(); break; }
        if (ctx.canSee && d < 3) {
          // Close and in sight: lunge straight at you.
          this.step(dx, dz, d, SPEED.hunt * dt);
          this.speed = SPEED.hunt;
          this.path = [];
          this.goal = null;
          break;
        }
        if (this.repath || !this.goal) this.setGoal(this.lastKnown, ctx);
        // Reached where you were and nothing new: cast around that spot until it gives up.
        if (this.follow(dt, SPEED.hunt, ctx)) this.wander(dt, SPEED.search, ctx);
        break;
      }
      case 'lost': {
        const t = (this.time - this.lostSince) % (LOST_MOVE + LOST_STOP);
        if (t < LOST_MOVE) this.wander(dt, SPEED.lost, ctx);
        if (this.time - this.lostSince >= LOSE_TRACK_AFTER) this.toPatrol();
        break;
      }
    }
  }

  grid(ctx) {
    const L = this.layout;
    return {
      w: L.w, h: L.h,
      passable: (x, z) => this.passable(x, z),
      cost: (x, z) => (L.isDoor(x, z) && ctx.isDoorClosed(x, z) ? 6 : 1),
    };
  }

  setGoal(cell, ctx) {
    this.repath = false;
    this.goal = cell;
    const [sx, sz] = this.cell;
    this.path = findPath(this.grid(ctx), sx, sz, cell[0], cell[1]) || [];
  }

  // Walk to random nearby cells.
  wander(dt, speed, ctx) {
    if (!this.path.length) {
      const [cx, cz] = this.cell;
      for (let i = 0; i < 10; i++) {
        const x = cx + Math.round((this.rand() * 2 - 1) * 3);
        const z = cz + Math.round((this.rand() * 2 - 1) * 3);
        if (this.passable(x, z) && (x !== cx || z !== cz)) { this.setGoal([x, z], ctx); break; }
      }
    }
    this.follow(dt, speed, ctx);
  }

  // Move along the path. Returns true once the path is used up.
  follow(dt, speed, ctx) {
    if (!this.path.length) return true;
    const [nx, nz] = this.path[0];
    if (this.layout.isDoor(nx, nz) && ctx.isDoorClosed(nx, nz)) {
      if (this.doorTimer === 0) this.emit('doorForce', { cell: [nx, nz] });
      this.doorTimer += dt;
      if (this.doorTimer >= DOOR_FORCE_TIME) {
        this.doorTimer = 0;
        ctx.openDoor(nx, nz);
        this.emit('doorOpen', { cell: [nx, nz] });
      }
      return false;
    }
    this.doorTimer = 0;
    const dx = cellCenter(nx) - this.pos.x, dz = cellCenter(nz) - this.pos.z;
    const d = Math.hypot(dx, dz);
    const step = speed * dt;
    if (d <= step) {
      this.pos.x = cellCenter(nx);
      this.pos.z = cellCenter(nz);
      this.path.shift();
      this.moving = true;
    } else {
      this.step(dx, dz, d, step);
    }
    this.speed = speed;
    return this.path.length === 0;
  }

  step(dx, dz, d, step) {
    if (d < 1e-6) return;
    const s = Math.min(step, d);
    this.pos.x += (dx / d) * s;
    this.pos.z += (dz / d) * s;
    this.heading = Math.atan2(dx, dz);
    this.moving = true;
  }
}

// Can it see you? Within 4 m, inside its cone (any direction once hunting),
// you're moving or lit, and nothing solid is in the way (checked by the caller).
export function inSight(alien, player, { moving, lit }) {
  const dx = player.x - alien.pos.x, dz = player.z - alien.pos.z;
  const d = Math.hypot(dx, dz);
  if (d > SIGHT_RANGE || !(moving || lit)) return false;
  if (alien.state === 'hunt') return true;
  const off = Math.atan2(Math.sin(Math.atan2(dx, dz) - alien.heading), Math.cos(Math.atan2(dx, dz) - alien.heading));
  return Math.abs(off) <= SIGHT_HALF_ANGLE;
}
