// The HUD minimap: only shows the parts of the station you've seen.
// No engine here, so the reveal logic can be tested in Node.
import { TILE, cellOf, cellCenter, lineClear, REPAIRS } from './layout.js';

const CELL = 6; // pixels per grid cell
const COLORS = {
  room: '#4d6a62', corridor: '#3a524c', safe: '#2f8f86', wall: 'rgba(170,205,195,0.55)',
  doorOpen: '#3fc77a', doorClosed: '#d8452f', hatch: '#6fe0d2',
  terminal: '#8fe0cf', terminalRead: '#2aff7a', objective: '#ffb347', player: '#ffffff',
  done: '#4fa36e', later: '#9bb5ae', label: '#cdeee6',
};

// What symbols the map should show, from what you've explored. Positions are in cells
// (fractional, so a room's centre can fall between cells).
//   safe       S at the centre of a safe room
//   generator  bolt  } on the repair console; state 'now' (current job), 'done' or 'later'
//   comms      waves }
//   pod        pod   }
//   crate      on the noise-maker crate until you take it
//   terminal   on each terminal you've seen; state 'read' or 'unread'
export function mapMarkers(layout, explored, { stage = 0, gotCrate = false, loreRead = new Set(), terminals = [] } = {}) {
  const seenCell = (x, z) => explored[z * layout.w + x] === 1;
  const seenRoom = (r) => {
    for (let z = r.y; z < r.y + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) if (seenCell(x, z)) return true;
    return false;
  };
  const prop = (id) => layout.props.find((p) => p.id === id);
  const out = [];
  for (const r of layout.rooms) {
    if (r.safe && seenRoom(r)) out.push({ kind: 'safe', x: r.x + r.w / 2, z: r.y + r.h / 2 });
  }
  REPAIRS.forEach((id, i) => {
    const p = prop(id);
    if (!seenRoom(layout.room(p.room))) return;
    out.push({ kind: id, x: p.cell[0] + 0.5, z: p.cell[1] + 0.5, state: i < stage ? 'done' : i === stage ? 'now' : 'later' });
  });
  const crate = prop('crate');
  if (crate && !gotCrate && seenRoom(layout.room(crate.room))) out.push({ kind: 'crate', x: crate.cell[0] + 0.5, z: crate.cell[1] + 0.5 });
  for (const t of terminals) {
    if (seenCell(t.cell[0], t.cell[1])) out.push({ kind: 'terminal', x: t.cell[0] + 0.5, z: t.cell[1] + 0.5, state: loreRead.has(t.id) ? 'read' : 'unread' });
  }
  return out;
}

// Icon painters. Each draws centred on (0, 0) in pixels.
const ICONS = {
  safe(g) {
    g.font = 'bold 11px "Share Tech Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('S', 0, 0.5);
  },
  generator(g) { // lightning bolt
    g.beginPath();
    g.moveTo(1.5, -6); g.lineTo(-3.5, 1); g.lineTo(-0.2, 1); g.lineTo(-1.5, 6);
    g.lineTo(3.5, -1); g.lineTo(0.2, -1); g.closePath();
    g.fill();
  },
  comms(g) { // a mast with radio waves either side
    g.fillRect(-0.75, -1, 1.5, 6);
    g.beginPath(); g.arc(0, -2, 1.5, 0, Math.PI * 2); g.fill();
    g.lineWidth = 1.2;
    for (const r of [3.5, 6]) {
      g.beginPath(); g.arc(0, -2, r, -Math.PI * 0.3, Math.PI * 0.3); g.stroke();
      g.beginPath(); g.arc(0, -2, r, Math.PI * 0.7, Math.PI * 1.3); g.stroke();
    }
  },
  pod(g) { // a capsule pointing up, on a short base
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4, 1); g.lineTo(4, 3.5); g.lineTo(-4, 3.5); g.lineTo(-4, 1);
    g.closePath();
    g.fill();
    g.fillRect(-5.5, 4.5, 11, 1.5);
  },
  crate(g) { // a box with an X
    g.lineWidth = 1.2;
    g.strokeRect(-3.5, -3.5, 7, 7);
    g.beginPath(); g.moveTo(-3.5, -3.5); g.lineTo(3.5, 3.5); g.moveTo(3.5, -3.5); g.lineTo(-3.5, 3.5); g.stroke();
  },
  terminal(g) { // a little screen on a stand
    g.fillRect(-3.75, -3.75, 7.5, 5.5);
    g.fillRect(-0.75, 1.75, 1.5, 1.5);
    g.fillRect(-2.25, 3.25, 4.5, 1.2);
  },
};

// Mark the floor cells you can see from `pos`: everything in line of sight within
// `radius` cells, plus the whole room you're standing in.
export function revealAround(layout, explored, pos, isDoorClosed, radius = 4) {
  const px = cellOf(pos.x), pz = cellOf(pos.z);
  const room = layout.roomAt(px, pz);
  if (room) {
    for (let z = room.y; z < room.y + room.h; z++)
      for (let x = room.x; x < room.x + room.w; x++) explored[z * layout.w + x] = 1;
  }
  for (let z = pz - radius; z <= pz + radius; z++) {
    for (let x = px - radius; x <= px + radius; x++) {
      if (!layout.isFloor(x, z) || explored[z * layout.w + x]) continue;
      if ((x - px) ** 2 + (z - pz) ** 2 > radius * radius) continue;
      // A closed door blocks the view past it, but you can still see the door itself.
      const blocks = (cx, cz) => isDoorClosed(cx, cz) && !(cx === x && cz === z);
      if (lineClear(layout, pos, { x: cellCenter(x), z: cellCenter(z) }, blocks)) explored[z * layout.w + x] = 1;
    }
  }
}

// The walkable shape sampled k times per cell side, for drawing maps with curves and angled
// corners. Each sample: its sub-grid spot, the grid cell it's in, what kind of floor it is, and
// which sides border a wall.
export function floorSamples(layout, k = 3) {
  const L = layout;
  const step = TILE / k;
  const walk = (sx, sz) => sx >= 0 && sz >= 0 && sx < L.w * k && sz < L.h * k &&
    L.walkDistance((sx + 0.5) * step, (sz + 0.5) * step) > 0;
  const list = [];
  for (let sz = 0; sz < L.h * k; sz++) {
    for (let sx = 0; sx < L.w * k; sx++) {
      if (!walk(sx, sz)) continue;
      const cx = Math.floor(sx / k), cz = Math.floor(sz / k);
      const room = L.roomAt(cx, cz);
      const kind = L.isSafe(cx, cz) || room?.safe ? 'safe' : L.isDoor(cx, cz) ? 'door' : room ? 'room' : 'corridor';
      list.push({ sx, sz, cx, cz, kind, n: !walk(sx, sz - 1), s: !walk(sx, sz + 1), w: !walk(sx - 1, sz), e: !walk(sx + 1, sz) });
    }
  }
  return { k, list };
}

export class Minimap {
  constructor(canvas, layout) {
    this.canvas = canvas;
    this.layout = layout;
    // Draw at the screen's pixel density so the letters and icons stay sharp.
    this.dpr = Math.min(3, Math.max(1, Math.round(globalThis.devicePixelRatio || 1)));
    this.width = layout.w * CELL;
    this.height = layout.h * CELL;
    canvas.width = this.width * this.dpr;
    canvas.height = this.height * this.dpr;
    canvas.style.width = this.width + 'px';
    canvas.style.height = this.height + 'px';
    this.g = canvas.getContext('2d');
    this.floor = floorSamples(layout, 3);
  }

  // s: { player, explored, doors, terminals: [{ id, cell }], loreRead: Set, stage, gotCrate, time }
  draw({ player, explored, doors, terminals, loreRead, stage, gotCrate, time }) {
    const { g, layout: L } = this;
    const seen = (x, z) => L.inBounds(x, z) && explored[z * L.w + x] === 1;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.width, this.height);

    // Floor (the real shape, so curves and angled corners show), then wall edges. A bit of floor
    // shows once its cell, or for floor outside the grid's cells a neighbouring cell, has been seen.
    const { k, list } = this.floor;
    const sub = CELL / k;
    const shown = (f) => seen(f.cx, f.cz) ||
      (!L.isFloor(f.cx, f.cz) && (seen(f.cx + 1, f.cz) || seen(f.cx - 1, f.cz) || seen(f.cx, f.cz + 1) || seen(f.cx, f.cz - 1)));
    const visible = list.filter(shown);
    for (const f of visible) {
      g.fillStyle = f.kind === 'safe' ? COLORS.safe : f.kind === 'room' ? COLORS.room : COLORS.corridor;
      g.fillRect(f.sx * sub, f.sz * sub, sub + 0.05, sub + 0.05);
    }
    g.fillStyle = COLORS.wall;
    for (const f of visible) {
      if (f.n) g.fillRect(f.sx * sub, f.sz * sub, sub, 0.8);
      if (f.s) g.fillRect(f.sx * sub, (f.sz + 1) * sub - 0.8, sub, 0.8);
      if (f.w) g.fillRect(f.sx * sub, f.sz * sub, 0.8, sub);
      if (f.e) g.fillRect((f.sx + 1) * sub - 0.8, f.sz * sub, 0.8, sub);
    }

    // Doors, as a bar across the doorway.
    for (const d of doors) {
      if (!seen(d.cx, d.cz)) continue;
      g.fillStyle = d.safe ? COLORS.hatch : d.closed ? COLORS.doorClosed : COLORS.doorOpen;
      if (d.axis === 'x') g.fillRect(d.cx * CELL + CELL / 2 - 1, d.cz * CELL, 2, CELL);
      else g.fillRect(d.cx * CELL, d.cz * CELL + CELL / 2 - 1, CELL, 2);
    }

    // Symbols: safe rooms, repair jobs (the current one pulses), the crate, terminals.
    for (const m of mapMarkers(L, explored, { stage, gotCrate, loreRead, terminals })) {
      const color = m.kind === 'safe' ? COLORS.hatch
        : m.kind === 'terminal' ? (m.state === 'read' ? COLORS.terminalRead : COLORS.terminal)
        : m.kind === 'crate' ? COLORS.label
        : m.state === 'now' ? COLORS.objective : m.state === 'done' ? COLORS.done : COLORS.later;
      g.save();
      g.translate(m.x * CELL, m.z * CELL);
      if (m.state === 'now') g.globalAlpha = 0.55 + 0.45 * Math.sin(time * 5);
      g.fillStyle = g.strokeStyle = color;
      // A dark outline so icons read on any floor color.
      g.shadowColor = 'rgba(0,0,0,0.9)';
      g.shadowBlur = 2;
      ICONS[m.kind](g);
      g.restore();
    }

    // You: an arrow pointing where you face (yaw 0 faces -z, which is up on the map).
    const px = (player.pos.x / TILE) * CELL, pz = (player.pos.z / TILE) * CELL;
    g.save();
    g.translate(px, pz);
    g.rotate(-player.yaw);
    g.fillStyle = COLORS.player;
    g.beginPath();
    g.moveTo(0, -5); g.lineTo(3.5, 4); g.lineTo(0, 2); g.lineTo(-3.5, 4);
    g.closePath();
    g.fill();
    g.restore();
  }
}
