// The alien's brain: patrol, investigate, hunt, lose track.
// Pure logic with plain {x, z} positions, so it can be tested without a browser.
import { findPath } from './pathfind.js';
import { ROUTE, cellOf, cellCenter } from './layout.js';

export const SPEED = { patrol: 1.6, investigate: 2.4, hunt: 4.6, search: 1.1 };
export const LOSE_TRACK_AFTER = 15; // seconds of quiet before it gives up
export const DOOR_FORCE_TIME = 1.5; // a closed door holds it this long
const PATROL_PAUSE = 4;             // listening stop in each room
const SEARCH_TIME = 6;              // poking around a noise it investigated

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
    this.path = [];
    this.goal = null;
    this.repath = true;
    this.target = null;
    this.lastKnown = null;
    this.lastContact = -Infinity;
    this.searching = false;
    this.searchUntil = 0;
    this.doorTimer = 0;
    this.moving = false;
    this.speed = 0;
    this.events = [];
  }

  get cell() { return [cellOf(this.pos.x), cellOf(this.pos.z)]; }

  emit(type, data = {}) { this.events.push({ type, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }

  // A noise reached it. `heard` is the loudness left after doors and walls.
  hear(noise, heard) {
    if (this.dormant > 0) return false;
    const d = Math.hypot(noise.x - this.pos.x, noise.z - this.pos.z);
    if (heard < d) return false;
    const cell = this.layout.nearestOpen(cellOf(noise.x), cellOf(noise.z));
    if (noise.source !== 'player') {
      // A decoy only pulls it away if it doesn't have eyes on you right now.
      if (this.state === 'hunt' && this.time - this.lastContact < 0.5) return true;
      this.investigate(cell);
      return true;
    }
    if (this.state === 'hunt' || heard >= d * 2) this.hunt(cell);
    else this.investigate(cell);
    return true;
  }

  investigate(cell) {
    if (this.state !== 'investigate') {
      this.emit('click');
      this.pause = 0.8; // it clicks, then moves
    }
    this.state = 'investigate';
    this.target = cell;
    this.searching = false;
    this.repath = true;
  }

  hunt(cell) {
    if (this.state !== 'hunt') {
      this.emit('hunt');
      this.pause = 0.5;
      this.repath = true;
    }
    this.state = 'hunt';
    this.lastContact = this.time;
    if (!this.lastKnown || this.lastKnown[0] !== cell[0] || this.lastKnown[1] !== cell[1]) this.repath = true;
    this.lastKnown = cell;
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
    if (ctx.canSee) this.hunt([cellOf(ctx.player.x), cellOf(ctx.player.z)]);

    if (this.pause > 0) {
      const before = this.pause;
      this.pause -= dt;
      // The tell: a click about a second before it sets off again.
      if (this.state === 'patrol' && before > 1 && this.pause <= 1) this.emit('click');
      return;
    }

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
        const dx = ctx.player.x - this.pos.x, dz = ctx.player.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (ctx.canSee && d < 3) {
          // Close and in sight: lunge straight at you.
          this.step(dx, dz, d, SPEED.hunt * dt);
          this.speed = SPEED.hunt;
          this.path = [];
          this.goal = null;
          break;
        }
        if (this.repath || !this.goal) this.setGoal(this.lastKnown, ctx);
        const arrived = this.follow(dt, SPEED.hunt, ctx);
        if ((arrived && !ctx.canSee) || this.time - this.lastContact > LOSE_TRACK_AFTER) {
          this.state = 'lost';
          this.path = [];
          this.goal = null;
          this.emit('lost');
        }
        break;
      }
      case 'lost': {
        this.wander(dt, SPEED.search, ctx);
        if (this.time - this.lastContact >= LOSE_TRACK_AFTER) this.toPatrol();
        break;
      }
    }
  }

  grid(ctx) {
    const L = this.layout;
    return {
      w: L.w, h: L.h,
      passable: (x, z) => L.isOpen(x, z),
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
        if (this.layout.isOpen(x, z) && (x !== cx || z !== cz)) { this.setGoal([x, z], ctx); break; }
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
      this.speed = speed;
    } else {
      this.step(dx, dz, d, step);
      this.speed = speed;
    }
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
