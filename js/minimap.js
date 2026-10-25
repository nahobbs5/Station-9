// The HUD minimap: only shows the parts of the station you've seen.
// No three.js here, so the reveal logic can be tested in Node.
import { TILE, cellOf, cellCenter, lineClear } from './layout.js';

const CELL = 6; // pixels per grid cell
const COLORS = {
  room: '#4d6a62', corridor: '#3a524c', safe: '#2f8f86', wall: 'rgba(170,205,195,0.55)',
  doorOpen: '#3fc77a', doorClosed: '#d8452f', hatch: '#6fe0d2',
  terminal: '#8fe0cf', terminalRead: '#2aff7a', objective: '#ffb347', player: '#ffffff',
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

export class Minimap {
  constructor(canvas, layout) {
    this.canvas = canvas;
    this.layout = layout;
    canvas.width = layout.w * CELL;
    canvas.height = layout.h * CELL;
    this.g = canvas.getContext('2d');
  }

  // s: { player, explored, doors, terminals: [{ id, cell }], loreRead: Set, objective: [x, z] | null, time }
  draw({ player, explored, doors, terminals, loreRead, objective, time }) {
    const { g, layout: L } = this;
    const seen = (x, z) => L.inBounds(x, z) && explored[z * L.w + x] === 1;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Floor, then wall edges wherever seen floor meets solid wall.
    for (let z = 0; z < L.h; z++) {
      for (let x = 0; x < L.w; x++) {
        if (!seen(x, z)) continue;
        g.fillStyle = L.isSafe(x, z) ? COLORS.safe : L.isCorridor(x, z) || L.isDoor(x, z) ? COLORS.corridor : COLORS.room;
        g.fillRect(x * CELL, z * CELL, CELL, CELL);
      }
    }
    g.fillStyle = COLORS.wall;
    for (let z = 0; z < L.h; z++) {
      for (let x = 0; x < L.w; x++) {
        if (!seen(x, z)) continue;
        if (!L.isFloor(x, z - 1)) g.fillRect(x * CELL, z * CELL, CELL, 1);
        if (!L.isFloor(x, z + 1)) g.fillRect(x * CELL, (z + 1) * CELL - 1, CELL, 1);
        if (!L.isFloor(x - 1, z)) g.fillRect(x * CELL, z * CELL, 1, CELL);
        if (!L.isFloor(x + 1, z)) g.fillRect((x + 1) * CELL - 1, z * CELL, 1, CELL);
      }
    }

    // Doors, as a bar across the doorway.
    for (const d of doors) {
      if (!seen(d.cx, d.cz)) continue;
      g.fillStyle = d.safe ? COLORS.hatch : d.closed ? COLORS.doorClosed : COLORS.doorOpen;
      if (d.axis === 'x') g.fillRect(d.cx * CELL + CELL / 2 - 1, d.cz * CELL, 2, CELL);
      else g.fillRect(d.cx * CELL, d.cz * CELL + CELL / 2 - 1, CELL, 2);
    }

    // Terminals you've seen, then the current repair job (pulsing).
    const dot = (cell, color, r) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc((cell[0] + 0.5) * CELL, (cell[1] + 0.5) * CELL, r, 0, Math.PI * 2);
      g.fill();
    };
    for (const t of terminals) if (seen(t.cell[0], t.cell[1])) dot(t.cell, loreRead.has(t.id) ? COLORS.terminalRead : COLORS.terminal, 1.6);
    if (objective && seen(objective[0], objective[1])) {
      g.globalAlpha = 0.55 + 0.45 * Math.sin(time * 5);
      dot(objective, COLORS.objective, 2.6);
      g.globalAlpha = 1;
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
