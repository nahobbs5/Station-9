// Canvas-drawn textures for the station. Each function returns a plain <canvas>;
// the renderer (js/babylon/util.js toTexture) wraps it as a texture.
import { TILE } from './layout.js';
import { floorSamples } from './minimap.js';

// Small seeded random, so the grime looks the same every load.
export function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

// A canvas drawn by `draw`. Hints for the engine wrappers ride along as properties:
// c.wrap (repeat it), c.repeat ([x, y] tiling), c.flipY (false to not flip), c.linear (data, not colour).
export function makeCanvas(w, h, draw, { wrap = false, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  c.wrap = wrap || !!repeat;
  c.repeat = repeat;
  return c;
}
const canvasTexture = (w, h, draw, repeat = null) => makeCanvas(w, h, draw, { repeat });

function grime(g, w, h, rand, n, alpha) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(20,14,8,${alpha * rand()})`;
    g.beginPath();
    g.arc(rand() * w, rand() * h, 4 + rand() * w * 0.12, 0, Math.PI * 2);
    g.fill();
  }
}

// A few scratches: thin light lines.
function scratches(g, w, h, rand, n, alpha = 0.18) {
  g.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    g.strokeStyle = `rgba(220,220,210,${alpha * (0.4 + rand())})`;
    const x = rand() * w, y = rand() * h, a = (rand() - 0.5) * 0.8, len = 8 + rand() * 50;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
}

function rust(g, w, h, rand, n, fromY, alpha = 0.4) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, len = 20 + rand() * 120;
    const grad = g.createLinearGradient(0, fromY, 0, fromY + len);
    grad.addColorStop(0, `rgba(120,55,22,${alpha})`);
    grad.addColorStop(1, 'rgba(120,55,22,0)');
    g.fillStyle = grad;
    g.fillRect(x, fromY, 2 + rand() * 4, len);
  }
}

// Wall panels in three states of decay, so neighbouring walls don't match.
export function wallTexture(variant) {
  const rand = seeded(7 + variant * 31);
  return canvasTexture(256, 384, (g, w, h) => {
    g.fillStyle = ['#4b5056', '#464a4b', '#4e4b47'][variant]; g.fillRect(0, 0, w, h);
    grime(g, w, h, rand, 60, 0.35);
    // Grime gathers toward the floor.
    const low = g.createLinearGradient(0, h * 0.55, 0, h);
    low.addColorStop(0, 'rgba(15,12,8,0)'); low.addColorStop(1, 'rgba(15,12,8,0.55)');
    g.fillStyle = low; g.fillRect(0, h * 0.55, w, h * 0.45);
    scratches(g, w, h, rand, 40);
    g.strokeStyle = '#25282c'; g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w, h * 0.62); g.stroke();
    g.fillStyle = '#2f3237'; g.fillRect(0, h * 0.86, w, h * 0.14); // kick plate
    g.fillStyle = 'rgba(0,0,0,0.35)'; // dents in it
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(rand() * w, h * 0.92, 8 + rand() * 16, 4 + rand() * 6, 0, 0, 7); g.fill(); }
    // Rivets: mismatched, some missing.
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h * 0.62 - 12], [w - 14, h * 0.62 - 12], [w / 2, 14], [w / 2, h * 0.62 - 12]]) {
      if (rand() < 0.2) continue;
      g.fillStyle = rand() < 0.3 ? '#8a6a4a' : '#6a6f75';
      g.beginPath(); g.arc(x, y, 3 + rand() * 2, 0, Math.PI * 2); g.fill();
    }
    rust(g, w, h, rand, 5, h * 0.62, 0.35);
    if (variant === 1) {
      rust(g, w, h, rand, 10, 0, 0.45);
      // A welded-on patch plate in a different metal.
      const px = 40 + rand() * 90, py = 150 + rand() * 60, pw = 55 + rand() * 40, ph = 35 + rand() * 30;
      g.fillStyle = '#3d3b37'; g.fillRect(px, py, pw, ph);
      grime(g, pw, ph, rand, 6, 0.4);
      g.strokeStyle = 'rgba(20,15,10,0.6)'; g.lineWidth = 2; g.strokeRect(px, py, pw, ph);
      g.fillStyle = '#3a3836';
      for (let i = 0; i < 8; i++) { g.beginPath(); g.arc(px + (i % 4) * pw / 3, py + (i < 4 ? 5 : ph - 5), 2.5, 0, 7); g.fill(); }
      rust(g, w, h, rand, 4, py + ph, 0.5);
    } else if (variant === 2) {
      // Scorch mark.
      const sx = 60 + rand() * 140, sy = 80 + rand() * 120;
      const sc = g.createRadialGradient(sx, sy, 4, sx, sy, 90);
      sc.addColorStop(0, 'rgba(5,4,3,0.85)'); sc.addColorStop(1, 'rgba(5,4,3,0)');
      g.fillStyle = sc; g.fillRect(0, 0, w, h);
      // Water stain running down from the top, with tide lines.
      const wx = rand() * (w - 80);
      for (let i = 0; i < 4; i++) {
        g.strokeStyle = `rgba(150,120,80,${0.18 - i * 0.03})`; g.lineWidth = 2;
        g.beginPath(); g.ellipse(wx + 40, 0, 40 + i * 10, 100 + i * 40, 0, 0, Math.PI); g.stroke();
      }
    }
  });
}

// One big floor texture for the whole map, so stains and wet patches don't repeat.
// Returns the colour map and a roughness map (wet patches are smooth and catch the flashlight).
export function floorTextures(layout) {
  const rand = seeded(3);
  const P = 64; // pixels per cell
  const W = layout.w * P, H = layout.h * P;
  const wet = [];
  for (let i = 0; i < 26; i++) wet.push([rand() * W, rand() * H, 20 + rand() * 60, 12 + rand() * 30, rand() * 3]);
  const map = canvasTexture(W, H, (g) => {
    g.fillStyle = '#2a2d30'; g.fillRect(0, 0, W, H);
    for (let z = 0; z < layout.h; z++) {
      for (let x = 0; x < layout.w; x++) {
        // Four plates per cell, each a slightly different shade.
        for (let k = 0; k < 4; k++) {
          const t = 38 + Math.floor(rand() * 14);
          g.fillStyle = `rgb(${t},${t + 3},${t + 6})`;
          g.fillRect(x * P + (k % 2) * 32, z * P + (k >> 1) * 32, 32, 32);
        }
      }
    }
    g.strokeStyle = '#1a1c1e'; g.lineWidth = 3;
    for (let i = 0; i <= W; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, H); g.stroke(); }
    for (let i = 0; i <= H; i += 32) { g.beginPath(); g.moveTo(0, i); g.lineTo(W, i); g.stroke(); }
    grime(g, W, H, rand, 500, 0.4);
    // Oil stains and scuffs.
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(8,6,4,${0.3 + rand() * 0.4})`;
      g.beginPath(); g.ellipse(rand() * W, rand() * H, 6 + rand() * 26, 4 + rand() * 14, rand() * 3, 0, 7); g.fill();
    }
    g.lineWidth = 2;
    for (let i = 0; i < 400; i++) {
      g.strokeStyle = `rgba(150,150,140,${0.05 + rand() * 0.1})`;
      const x = rand() * W, y = rand() * H;
      g.beginPath(); g.arc(x, y, 10 + rand() * 40, rand() * 6, rand() * 6); g.stroke();
    }
    for (const [x, y, rx, ry, a] of wet) {
      g.fillStyle = 'rgba(10,14,16,0.45)';
      g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill();
    }
  });
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#c4c4c4'; g.fillRect(0, 0, W, H);
  g.filter = 'blur(6px)';
  for (const [x, y, rx, ry, a] of wet) {
    g.fillStyle = '#1c1c1c';
    g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, 7); g.fill();
  }
  c.linear = true; // roughness data, not colour
  return { map, rough: c };
}

// Ceiling: one panel per cell, stained, with a few missing.
export function ceilingTexture(layout) {
  const rand = seeded(19);
  const P = 32;
  const t = canvasTexture(layout.w * P, layout.h * P, (g, W, H) => {
    g.fillStyle = '#16181a'; g.fillRect(0, 0, W, H);
    for (let z = 0; z < layout.h; z++) {
      for (let x = 0; x < layout.w; x++) {
        if (rand() < 0.07) { g.fillStyle = '#050505'; g.fillRect(x * P + 2, z * P + 2, P - 4, P - 4); continue; } // missing tile
        const v = 30 + Math.floor(rand() * 14);
        g.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
        g.fillRect(x * P + 1, z * P + 1, P - 2, P - 2);
        if (rand() < 0.25) { g.fillStyle = 'rgba(90,70,40,0.3)'; g.beginPath(); g.arc(x * P + rand() * P, z * P + rand() * P, 4 + rand() * 10, 0, 7); g.fill(); }
        if (rand() < 0.1) { g.fillStyle = '#0d0e0f'; for (let i = 0; i < 4; i++) g.fillRect(x * P + 8, z * P + 8 + i * 5, P - 16, 2); } // vent
      }
    }
  });
  t.flipY = false; // canvas rows line up with world z on the upward-facing plane
  return t;
}

// Doors: scratched paint, grime, and a worn hazard stripe along the bottom.
export function doorTexture(base) {
  const rand = seeded(base.length * 13);
  return canvasTexture(256, 384, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    grime(g, w, h, rand, 40, 0.35);
    scratches(g, w, h, rand, 60, 0.25);
    g.fillStyle = '#1b1b1b'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.fillStyle = '#c9a227';
    for (let x = -60; x < w; x += 40) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 20, h); g.lineTo(x + 20 + h * 0.14, h * 0.86); g.lineTo(x + h * 0.14, h * 0.86); g.fill(); }
    grime(g, w, h * 0.3, rand, 20, 0.5);
    rust(g, w, h, rand, 6, h * 0.2, 0.35);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 5; g.strokeRect(6, 6, w - 12, h - 12);
  });
}

export function drawMascot(g, cx, cy, r) {
  g.save();
  g.lineWidth = r * 0.08;
  g.strokeStyle = '#2d2a26';
  g.lineJoin = 'round';
  g.fillStyle = '#f2c14e';
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.72 : r * 1.45;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#2d2a26'; // eyes
  g.beginPath(); g.ellipse(cx - r * 0.35, cy - r * 0.2, r * 0.1, r * 0.16, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(cx + r * 0.35, cy - r * 0.2, r * 0.1, r * 0.16, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); // the smile, a little too wide
  g.arc(cx, cy + r * 0.05, r * 0.62, Math.PI * 0.12, Math.PI * 0.88);
  g.stroke();
  g.restore();
}

export function posterTexture(lines, accent) {
  const rand = seeded(lines.join('').length);
  return canvasTexture(512, 768, (g, w, h) => {
    g.fillStyle = '#e4d6b0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f4f6e'; // sunburst
    g.beginPath(); g.moveTo(w, h * 0.35); g.lineTo(w * 0.1, h); g.lineTo(w, h); g.fill();
    drawMascot(g, w * 0.62, h * 0.58, 110);
    g.textAlign = 'left';
    g.font = 'bold 74px Oswald, Impact, sans-serif';
    lines.forEach((line, i) => {
      g.fillStyle = i === lines.length - 1 ? accent : '#2b2b2b';
      g.fillText(line, 34, 100 + i * 80);
    });
    g.fillStyle = '#2b2b2b';
    g.font = 'bold 30px Oswald, Impact, sans-serif';
    g.fillText('VANTORA TRANSIT GROUP · CLOSER EVERY DAY.', 34, h - 36);
    grime(g, w, h, rand, 60, 0.3);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(w * 0.7, 0, 40, h * 0.2); // a tear
  });
}

export function mapTexture(layout) {
  return canvasTexture(512, 448, (g, w, h) => {
    g.fillStyle = '#1d2422'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9fc7b6';
    g.font = 'bold 34px Oswald, Impact, sans-serif';
    g.textAlign = 'center';
    g.fillText('STATION 9', w / 2, 40);
    // The real floor shape, so the curved corridors and angled rooms show.
    const s = 15, ox = (w - layout.w * s) / 2, oy = 60;
    const { k, list } = floorSamples(layout, 3);
    const px = s / k;
    const colour = { door: '#d8c27a', safe: '#2f8f86', corridor: '#53716a', room: '#355048' };
    for (const f of list) {
      g.fillStyle = colour[f.kind];
      g.fillRect(ox + f.sx * px, oy + f.sz * px, px + 0.3, px + 0.3);
    }
    g.fillStyle = '#cde8dc';
    g.font = 'bold 13px sans-serif';
    for (const r of layout.rooms) {
      g.fillText((r.safe ? 'SAFE' : r.name).toUpperCase(), ox + (r.cx + 0.5) * s, oy + (r.cz + 0.5) * s + 4);
    }
    g.fillStyle = '#ff6a4a';
    const a = layout.room('airlock');
    g.fillText('YOU ARE HERE?', ox + (a.cx + 0.5) * s, oy + (a.y + a.h) * s + 14);
  });
}

// Where a poster sits on one of a room's walls.
export function wallSpot(room, side, along = 0.5) {
  switch (side) {
    case 'n': return { x: (room.x + room.w * along) * TILE, z: room.y * TILE + 0.02, rot: 0 };
    case 's': return { x: (room.x + room.w * along) * TILE, z: (room.y + room.h) * TILE - 0.02, rot: Math.PI };
    case 'w': return { x: room.x * TILE + 0.02, z: (room.y + room.h * along) * TILE, rot: Math.PI / 2 };
    default:  return { x: (room.x + room.w) * TILE - 0.02, z: (room.y + room.h * along) * TILE, rot: -Math.PI / 2 };
  }
}


const tex = (w, h, draw, wrap = false) => makeCanvas(w, h, draw, { wrap });
function blotches(g, w, h, rand, n, color, size) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = color(rand());
    g.beginPath();
    g.ellipse(rand() * w, rand() * h, size * (0.3 + rand()), size * (0.2 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

// Decor textures ------------------------------------------------------------------------
export function pipeTexture(base, seed) {
  const rand = seeded(seed);
  return tex(64, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 30, (r) => `rgba(110,52,20,${0.25 + r * 0.4})`, 10); // rust
    blotches(g, w, h, rand, 20, (r) => `rgba(15,12,8,${0.2 + r * 0.3})`, 8);     // grime
    for (let i = 0; i < 3; i++) { // paint bands where sections were joined
      g.fillStyle = `rgba(0,0,0,${0.35 + rand() * 0.2})`;
      g.fillRect(0, rand() * h, w, 3 + rand() * 4);
    }
    g.fillStyle = 'rgba(120,60,25,0.5)'; // rust running down one side
    for (let i = 0; i < 8; i++) g.fillRect(rand() * w, rand() * h, 2, 10 + rand() * 40);
  }, true);
}
export function plateTexture() {
  const rand = seeded(21);
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = '#7d8286'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 26, (r) => `rgba(30,22,14,${0.25 + r * 0.4})`, 20);
    blotches(g, w, h, rand, 10, (r) => `rgba(110,50,20,${0.2 + r * 0.35})`, 14); // rust
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 14; i++) { g.beginPath(); const x = rand() * w, y = rand() * h; g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 50, y + (rand() - 0.5) * 20); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = '#4a4d50';
    for (let i = 10; i < w; i += 22) for (const [x, y] of [[i, 8], [i, h - 8], [8, i], [w - 8, i]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(110,50,20,0.4)';
    for (let i = 0; i < 4; i++) g.fillRect(rand() * w, h * 0.6, 2, 30 + rand() * 30);
  });
}
export function tapeTexture() {
  const rand = seeded(5);
  return tex(256, 32, (g, w, h) => {
    g.fillStyle = '#d8b02a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#161616';
    for (let x = -h; x < w; x += 28) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 14, h); g.lineTo(x + 14 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    blotches(g, w, h, rand, 16, (r) => `rgba(40,30,15,${0.2 + r * 0.4})`, 10); // dirt
    g.clearRect(w - 10 - rand() * 20, 0, 30, h * rand()); // torn end
  });
}
export function woodTexture() {
  const rand = seeded(9);
  return tex(256, 32, (g, w, h) => {
    g.fillStyle = '#5e4630'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(30,20,10,0.5)';
    for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(0, rand() * h); g.bezierCurveTo(80, rand() * h, 170, rand() * h, w, rand() * h); g.stroke(); }
    g.fillStyle = '#2a2a2a';
    for (const x of [10, w - 10]) { g.beginPath(); g.arc(x, h / 2, 2.5, 0, 7); g.fill(); }
  });
}
export function grateTexture() {
  return tex(128, 128, (g, w, h) => {
    g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3d4246';
    for (let x = 4; x < w; x += 12) g.fillRect(x, 0, 5, h);
    g.fillStyle = '#2b2f32'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  });
}
export function barrelTexture() {
  const rand = seeded(13);
  return tex(256, 128, (g, w, h) => {
    g.fillStyle = '#5b3a22'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8a6a2a'; g.fillRect(0, h * 0.38, w, h * 0.24); // faded band
    blotches(g, w, h, rand, 40, (r) => `rgba(120,55,20,${0.3 + r * 0.4})`, 14);
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, 8, w, 5); g.fillRect(0, h - 13, w, 5);
  });
}
export function puffTexture() {
  return tex(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, w);
  });
}


// Consoles ------------------------------------------------------------------------------
// Screens in the style of the distress-console reference sheet: dark teal, a "STATION 9" header,
// a menu down the left, and one marigold or red accent. state: { stage, layout } for live screens.
const C = {
  bg0: '#0f2e2c', bg1: '#081a19', text: '#d6efe7', dim: '#6fa79a', teal: '#5fb3a8', marigold: '#f2a92e',
  red: '#e0533f', green: '#62d39a', line: 'rgba(143,224,207,0.35)',
};
const MONO = '"Share Tech Mono", ui-monospace, monospace';
const HEAD = 'Oswald, "Arial Narrow", sans-serif';
const HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive';

// Who's on the personnel screens (from the crew in Lore.md).
const PEOPLE = {
  lena: { name: 'Dr. Lena Ostrowski', role: 'Medical Officer', id: 'S9-1031', seen: 'Crew Quarters', date: '2091-07-03 22:40' },
  jun: { name: 'Jun Park', role: 'Volunteer Coordinator', id: 'S9-1047', seen: 'Teleporter Lab', date: '2091-06-30 09:15' },
  sam: { name: 'Sam Doyle', role: 'Morale Officer', id: 'S9-1052', seen: 'B Corridor', date: '2091-06-26 23:58' },
};
const MENUS = {
  doors: ['Airlock', 'Control', 'Generator', 'Teleporter Lab', 'Comms', 'Storage', 'Escape Pod Bay'],
  system: ['Overview', 'Power', 'Doors', 'Life Support', 'Comms', 'Security', 'Logs'],
  marigold: ['Messages', 'Wellness', 'Schedule', 'Feedback'],
  research: ['Test Logs', 'Trial 19', 'Trial 27', 'Trial 31', 'Anomalies', 'Subject Notes'],
  personnel: ['Staff Directory', 'Access Logs', 'Training', 'Medical', 'Incident Reports', 'Archived'],
  comms: ['Outgoing', 'Incoming (2)', 'Recorded (7)', 'System', 'Emergency', 'Test Signal'],
  security: ['Cameras', 'Doors', 'Alarms', 'Access'],
};
export const CONSOLE_SCREENS = ['doors', 'system', 'marigold', 'research', 'trial31', 'personnel-lena', 'personnel-jun', 'personnel-sam',
  'inventory', 'power', 'comms', 'pod', 'reactor', 'signal', 'security', 'calibration', 'roster', 'manifest'];
// Screens that change as you make progress (redrawn after each repair).
export const LIVE_SCREENS = new Set(['system', 'power', 'comms', 'pod', 'reactor', 'signal']);

export function consoleScreen(kind, state = {}) {
  const stage = state.stage ?? 0;
  const rand = seeded(kind.length * 97 + 13);
  return makeCanvas(512, 320, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, C.bg0); bg.addColorStop(1, C.bg1);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const text = (t, x, y, { size = 14, color = C.text, font = MONO, align = 'left', weight = '' } = {}) => {
      g.font = `${weight} ${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y);
    };
    const box = (x, y, bw, bh, color = C.line) => { g.strokeStyle = color; g.lineWidth = 1.5; g.strokeRect(x, y, bw, bh); };
    const header = (system, menu, selected = 0) => {
      text('STATION 9', 22, 38, { size: 24, font: HEAD, weight: '600' });
      text(system.toUpperCase(), 22, 56, { size: 12, color: C.dim });
      text('2091-07-15  03:12', w - 20, 34, { size: 11, color: C.dim, align: 'right' });
      g.fillStyle = C.line; g.fillRect(20, 64, w - 40, 1);
      if (!menu) return;
      menu.forEach((m, i) => {
        if (i === selected) { g.fillStyle = C.teal; g.fillRect(18, 74 + i * 24, 128, 20); }
        text((i === selected ? '> ' : '  ') + m, 22, 89 + i * 24, { size: 13, color: i === selected ? C.bg1 : C.text });
      });
      g.fillStyle = C.line; g.fillRect(156, 72, 1, h - 92);
    };
    const statusRow = (label, value, y, color) => {
      box(170, y - 18, 160, 26);
      text(label, 180, y, { size: 14 });
      text(value, 320, y, { size: 14, color, align: 'right' });
    };
    const noise = (x, y, nw, nh, dark = 0.6) => {
      for (let i = 0; i < 900; i++) {
        const v = Math.floor(40 + rand() * 120 * dark);
        g.fillStyle = `rgba(${v},${v + 10},${v + 8},0.55)`;
        g.fillRect(x + rand() * nw, y + rand() * nh, 2, 2);
      }
    };
    const silhouette = (cx, cy, s, color = 'rgba(5,10,10,0.85)') => {
      g.fillStyle = color;
      g.beginPath(); g.arc(cx, cy - s * 0.45, s * 0.28, 0, 7); g.fill();
      g.beginPath(); g.ellipse(cx, cy + s * 0.25, s * 0.5, s * 0.4, 0, Math.PI, 0); g.fill();
    };
    const banner = (msg, color, y = 78) => {
      g.fillStyle = color; g.fillRect(170, y, w - 190, 40);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 170; x < w - 20; x += 18) { g.beginPath(); g.moveTo(x, y + 40); g.lineTo(x + 9, y + 40); g.lineTo(x + 19, y); g.lineTo(x + 10, y); g.fill(); }
      text(msg, (170 + w - 20) / 2, y + 28, { size: 22, font: HEAD, weight: '600', color: '#fff', align: 'center' });
    };

    if (kind === 'doors') {
      header('Door Control', MENUS.doors);
      box(176, 80, 310, 150);
      text('AIRLOCK', 331, 102, { size: 14, align: 'center' });
      g.strokeStyle = C.teal; g.lineWidth = 2;
      g.strokeRect(296, 112, 34, 72); g.strokeRect(332, 112, 34, 72);
      text('STATUS: CLOSED', 331, 214, { size: 14, color: C.green, align: 'center' });
      [['OPEN', C.marigold], ['CLOSE', C.dim], ['LOCKDOWN', C.dim]].forEach(([b, col], i) => {
        box(186 + i * 100, 240, 88, 26, col); text(b, 230 + i * 100, 258, { size: 13, color: col, align: 'center' });
      });
      text('WARNING: MANUAL OVERRIDE REQUIRED', 176, 292, { size: 13, color: C.red });
    } else if (kind === 'system') {
      header('System Control', MENUS.system);
      // A schematic of the station: room boxes joined by their corridors.
      const L = state.layout;
      if (L) {
        const sx = (x) => 170 + (x / (L.w * TILE)) * 320, sz = (z) => 74 + (z / (L.h * TILE)) * 196;
        g.strokeStyle = C.teal; g.lineWidth = 1.5;
        for (const c of L.corridors) { g.beginPath(); c.pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sz(p.z)) : g.moveTo(sx(p.x), sz(p.z)))); g.stroke(); }
        const short = { control: 'CONTROL', generator: 'GEN', teleporter: 'LAB', storage: 'STORAGE', comms: 'COMMS', airlock: 'AIRLOCK', pod: 'ESCAPE', crew: 'CREW' };
        for (const r of L.rooms) {
          if (r.safe) continue;
          const x0 = sx(r.x * TILE + 1.5), z0 = sz(r.y * TILE + 2.5), x1 = sx((r.x + r.w) * TILE - 1.5), z1 = sz((r.y + r.h) * TILE - 2.5);
          g.fillStyle = C.bg1; g.fillRect(x0, z0, x1 - x0, z1 - z0); box(x0, z0, x1 - x0, z1 - z0, C.teal);
          text(short[r.id], (x0 + x1) / 2, (z0 + z1) / 2 + 4, { size: 10, align: 'center' });
        }
      }
      text(`SYSTEM STATUS: ${stage >= 1 ? 'FULL POWER' : 'PARTIAL POWER'}`, 22, 300, { size: 13, color: stage >= 1 ? C.green : C.marigold });
    } else if (kind === 'marigold') {
      header('Wellness Assistant', MENUS.marigold);
      drawMascot(g, 240, 160, 40);
      text('Hello! I am MARIGOLD.', 300, 130, { size: 16, color: C.marigold });
      text('Your wellness is', 300, 160, { size: 14 });
      text('our waypoint.', 300, 180, { size: 14 });
      text('Everyone is fine.', 300, 220, { size: 14, color: C.marigold });
      text('Messages queued: 0', 176, 292, { size: 12, color: C.dim });
    } else if (kind === 'research') {
      header('Research Lab', MENUS.research);
      g.fillStyle = '#05100f'; g.fillRect(176, 78, 310, 150);
      noise(176, 78, 310, 150);
      silhouette(331, 170, 90);
      text('● REC', 476, 96, { size: 12, color: C.red, align: 'right' });
      text('Trial 19 – 2091-05-09 14:02', 176, 252, { size: 13 });
      text('Arrival: −11.0 s', 176, 272, { size: 13 });
      text('Status:', 176, 292, { size: 13 }); text('UNKNOWN', 240, 292, { size: 13, color: C.red });
    } else if (kind === 'trial31') {
      header('Teleporter Lab · Trial 31');
      text('Subject mass ......... 71.2 kg', 30, 100, { size: 15 });
      text('Arrival mass ......... 71.2 kg', 30, 126, { size: 15 });
      text('Readings ............. 11', 30, 152, { size: 15, color: C.red });
      box(30, 170, w - 60, 80);
      g.strokeStyle = C.teal; g.lineWidth = 1.5; g.beginPath(); g.moveTo(34, 230);
      for (let x = 34; x < w - 34; x += 4) g.lineTo(x, 230 - (Math.sin(x * 0.9) > 0.92 ? 40 + rand() * 18 : rand() * 6));
      g.stroke();
      text('SENT: 1      RECEIVED: 11', 30, 288, { size: 16, color: C.red });
    } else if (kind.startsWith('personnel-')) {
      const p = PEOPLE[kind.split('-')[1]];
      header('Personnel Records', MENUS.personnel);
      g.fillStyle = '#05100f'; g.fillRect(176, 80, 100, 120);
      noise(176, 80, 100, 120, 0.9);
      silhouette(226, 150, 70, 'rgba(160,190,180,0.45)');
      text(p.name, 290, 100, { size: 15 });
      text(p.role, 290, 122, { size: 13, color: C.dim });
      text(`ID: ${p.id}`, 290, 144, { size: 13, color: C.dim });
      text('Clearance: L3', 290, 166, { size: 13, color: C.dim });
      text('STATUS: MISSING', 290, 196, { size: 15, color: C.red });
      text(`Last seen: ${p.seen}`, 176, 236, { size: 13 });
      text(p.date, 176, 256, { size: 13, color: C.dim });
    } else if (kind === 'inventory') {
      header('Storage · Inventory');
      [['Foam panels', '0', C.red], ['Carpet offcuts', '0', C.red], ['Packing cloth', '0', C.red], ['Noise-makers', '40', C.text], ['Ration packs', '212', C.text], ['Coolant', '3', C.marigold]]
        .forEach(([item, n, col], i) => { text(item, 30, 100 + i * 26, { size: 15 }); text(n, w - 40, 100 + i * 26, { size: 15, color: col, align: 'right' }); });
      text('Removed by: P. RAMAN (B corridor)', 30, 292, { size: 13, color: C.marigold });
    } else if (kind === 'power') {
      header('Power Management');
      const on = stage >= 1;
      banner(on ? 'MAIN POWER ONLINE' : '⚠  MAIN POWER OFFLINE', on ? '#2a7f62' : '#a33528');
      statusRow('Reactors', on ? 'ONLINE' : 'OFFLINE', 152, on ? C.green : C.red);
      statusRow('Auxiliary', on ? 'STANDBY' : 'OFFLINE', 186, on ? C.marigold : C.red);
      statusRow('Battery', on ? '100%' : '14%', 220, on ? C.green : C.red);
      statusRow('Emergency', 'ONLINE', 254, C.green);
      box(344, 134, 148, 130, on ? C.line : C.red);
      if (on) { text('All systems', 354, 160, { size: 13 }); text('nominal.', 354, 180, { size: 13 }); text('Thank you!', 354, 210, { size: 13, color: C.marigold }); }
      else { text('ERROR 0x4A-77', 354, 158, { size: 14, color: C.red }); ['Reactor output', 'lost. Check', 'coolant flow and', 'restart sequence.'].forEach((t, i) => text(t, 354, 182 + i * 18, { size: 12, color: C.red })); }
    } else if (kind === 'comms') {
      header('Communications', MENUS.comms);
      box(176, 78, 310, 100);
      g.strokeStyle = C.green; g.lineWidth = 1; g.beginPath(); g.moveTo(180, 128);
      for (let x = 180; x < 482; x += 2) g.lineTo(x, 128 + (rand() - 0.5) * (stage >= 2 ? 60 : 24) * Math.sin(x * 0.05));
      g.stroke();
      text(stage >= 2 ? 'SIGNAL SENT' : 'SIGNAL WEAK', 476, 170, { size: 11, color: C.dim, align: 'right' });
      if (stage >= 2) {
        box(176, 190, 310, 40, C.marigold); text('MESSAGE QUEUED', 186, 218, { size: 20, font: HEAD, color: C.marigold });
        text('Awaiting reply. Queue: 0', 176, 254, { size: 13 });
      } else {
        box(176, 190, 310, 40, C.red); text('LINK FAILURE', 186, 218, { size: 20, font: HEAD, color: C.red });
        text('No response from orbital relay.', 176, 254, { size: 13 }); text('Check antenna alignment.', 176, 274, { size: 13 });
      }
    } else if (kind === 'pod') {
      header('Escape Pod Bay');
      text('POD 1', 30, 110, { size: 28, font: HEAD });
      const ready = stage >= 2;
      text(ready ? 'LAUNCH WINDOW OPEN' : 'STATUS: NOT READY', 30, 150, { size: 20, color: ready ? C.marigold : C.red });
      text(`Rescue window: ${ready ? 'CONFIRMED' : 'NONE'}`, 30, 186, { size: 14 });
      text(`Main power: ${stage >= 1 ? 'OK' : 'OFFLINE'}`, 30, 210, { size: 14, color: stage >= 1 ? C.green : C.red });
      text('Seats: 4   Passengers: 0', 30, 234, { size: 14, color: C.dim });
      text('Please complete the feedback survey before departure.', 30, 292, { size: 12, color: C.marigold });
    } else if (kind === 'reactor') {
      header('Reactor Diagnostic');
      const flow = stage >= 1 ? 64 : 0;
      ['Coolant A', 'Coolant B', 'Pump 1', 'Pump 2'].forEach((n, i) => {
        const v = stage >= 1 ? 50 + rand() * 40 : i === 3 ? 6 : 0;
        text(n, 30, 102 + i * 34, { size: 14 });
        box(150, 88 + i * 34, 300, 18); g.fillStyle = v > 20 ? C.teal : C.red; g.fillRect(152, 90 + i * 34, 2.96 * v, 14);
      });
      text(`COOLANT FLOW: ${flow}%`, 30, 290, { size: 16, color: flow ? C.green : C.red });
    } else if (kind === 'signal') {
      header('Signal Monitor');
      box(30, 78, w - 60, 150);
      g.strokeStyle = C.green; g.lineWidth = 1;
      for (let row = 0; row < 3; row++) {
        g.beginPath(); g.moveTo(34, 110 + row * 44);
        for (let x = 34; x < w - 34; x += 3) g.lineTo(x, 110 + row * 44 + (rand() - 0.5) * (row === 1 && stage >= 2 ? 34 : 10));
        g.stroke();
      }
      text(stage >= 2 ? 'REPLY: 1 (UNVERIFIED)' : 'NO CARRIER', 30, 270, { size: 18, color: stage >= 2 ? C.marigold : C.red });
    } else if (kind === 'security') {
      header('Security', MENUS.security);
      [[176, 78, 'CAM 1 · B CORRIDOR'], [334, 78, 'CAM 2 · LAB'], [176, 182, 'CAM 3 · STORAGE'], [334, 182, 'CAM 4 · POD BAY']].forEach(([x, y, label], i) => {
        g.fillStyle = '#05100f'; g.fillRect(x, y, 150, 96);
        if (i === 2) text('NO SIGNAL', x + 75, y + 54, { size: 13, color: C.red, align: 'center' });
        else { noise(x, y, 150, 96, 0.5); if (i === 1) silhouette(x + 100, y + 70, 50); }
        text(label, x + 4, y + 92, { size: 10, color: C.dim });
      });
    } else if (kind === 'calibration') {
      header('Relay Calibration');
      g.strokeStyle = C.teal; g.lineWidth = 3;
      g.beginPath(); g.arc(140, 180, 80, 0, 7); g.stroke();
      g.strokeStyle = C.red; g.beginPath(); g.moveTo(140, 180); g.lineTo(140 + Math.cos(-0.6) * 70, 180 + Math.sin(-0.6) * 70); g.stroke();
      text('Time offset', 260, 140, { size: 14, color: C.dim });
      text('−11.0 s', 260, 172, { size: 30, font: HEAD, color: C.red });
      text('Calibration: FAILED', 260, 214, { size: 15, color: C.red });
      text('Repeat count: 3', 260, 240, { size: 13, color: C.dim });
    } else if (kind === 'roster') {
      header('Crew Roster');
      [['Tomas Brandt', 'REASSIGNED'], ['Imani Okafor', 'MISSING'], ['Lena Ostrowski', 'MISSING'], ['Priya Raman', 'MISSING'],
        ['Wes Calder', 'MISSING'], ['Jun Park', 'MISSING'], ['Ada Whitlow', 'MISSING'], ['Sam Doyle', 'MISSING']]
        .forEach(([n, st], i) => { text(n, 30, 92 + i * 22, { size: 14 }); text(st, w - 40, 92 + i * 22, { size: 14, color: st === 'MISSING' ? C.red : C.marigold, align: 'right' }); });
      text('Marigold: All present.', 30, 292, { size: 13, color: C.marigold });
    } else if (kind === 'manifest') {
      header('Pod Manifest');
      text('Seats ................ 4', 30, 104, { size: 15 });
      text('Passengers ........... 0 / 4', 30, 130, { size: 15 });
      text('— none listed —', 30, 170, { size: 15, color: C.dim });
      text('Technician: NOT ON LIST', 30, 210, { size: 15, color: C.red });
      text('Closer every day.', 30, 292, { size: 13, color: C.marigold });
    }
    // Scan lines.
    g.fillStyle = 'rgba(143,224,207,0.05)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1.5);
  });
}

// The keyboard top: dark keys on a worn base.
export function keyboardTexture() {
  const rand = seeded(61);
  return makeCanvas(256, 96, (g, w, h) => {
    g.fillStyle = '#1b1d1e'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 14; k++) {
        const v = 52 + Math.floor(rand() * 18);
        g.fillStyle = `rgb(${v},${v + 2},${v + 3})`;
        g.fillRect(6 + k * 17.6 + (row % 2) * 4, 8 + row * 21, 14, 16);
      }
    }
    g.fillStyle = '#2f3234'; g.fillRect(60, 8 + 4 * 21 - 3, 130, 9); // space bar
    blotches(g, w, h, rand, 10, (r) => `rgba(20,14,8,${0.2 + r * 0.3})`, 10);
  });
}

// A yellow sticky note in handwriting.
export function stickyNote(textLines) {
  const rand = seeded(textLines.length * 31 + 7);
  return makeCanvas(128, 128, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#efd98a'); bg.addColorStop(1, '#d8bf68');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(80,60,20,0.15)'; g.fillRect(0, 0, w, 10);
    g.fillStyle = '#2b2620';
    g.font = `15px ${HAND}`;
    g.textAlign = 'left';
    textLines.split('\n').forEach((t, i) => g.fillText(t, 8 + rand() * 4, 30 + i * 22));
  });
}

// A cream Skipper mug.
export function mugTexture() {
  return makeCanvas(256, 128, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    drawMascot(g, 80, 64, 26);
    g.fillStyle = '#0f4c4a'; g.font = `bold 14px ${HEAD}`; g.fillText('CLOSER EVERY DAY', 120, 70);
    g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, h - 10, w, 10); // coffee stain ring
  });
}

// The monitor housing: worn cream-grey plastic and metal.
export function housingTexture() {
  const rand = seeded(83);
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#b8b09c'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 40, (r) => `rgba(40,30,20,${0.15 + r * 0.3})`, 22);
    blotches(g, w, h, rand, 14, (r) => `rgba(110,60,25,${0.15 + r * 0.25})`, 10);
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1;
    for (let i = 0; i < 40; i++) { const x = rand() * w, y = rand() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 40, y + (rand() - 0.5) * 10); g.stroke(); }
  });
}

// Furniture ------------------------------------------------------------------------------
// The Station 9 emblem, simply drawn: a ring, a split spire, an orange orbit and a star.
export function drawEmblem(g, cx, cy, r, { light = '#e9e2cf', accent = '#e8912a' } = {}) {
  g.save();
  g.lineWidth = r * 0.16;
  g.strokeStyle = light;
  g.beginPath(); g.arc(cx, cy, r, Math.PI * 0.62, Math.PI * 2.38); g.stroke();
  g.fillStyle = light;
  g.beginPath(); g.moveTo(cx - r * 0.05, cy - r * 1.25); g.lineTo(cx - r * 0.55, cy + r * 1.05); g.lineTo(cx - r * 0.1, cy + r * 1.05); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(cx + r * 0.05, cy - r * 1.25); g.lineTo(cx + r * 0.55, cy + r * 1.05); g.lineTo(cx + r * 0.1, cy + r * 1.05); g.closePath(); g.fill();
  g.strokeStyle = accent; g.lineWidth = r * 0.14;
  g.beginPath(); g.ellipse(cx, cy + r * 0.1, r * 1.05, r * 0.32, -0.25, Math.PI * 0.95, Math.PI * 2.15); g.stroke();
  g.fillStyle = accent;
  const sx = cx + r * 0.8, sy = cy - r * 0.85, s = r * 0.32;
  g.beginPath(); g.moveTo(sx, sy - s); g.lineTo(sx + s * 0.25, sy - s * 0.25); g.lineTo(sx + s, sy); g.lineTo(sx + s * 0.25, sy + s * 0.25);
  g.lineTo(sx, sy + s); g.lineTo(sx - s * 0.25, sy + s * 0.25); g.lineTo(sx - s, sy); g.lineTo(sx - s * 0.25, sy - s * 0.25); g.closePath(); g.fill();
  g.restore();
}

// Burnt-orange leather with creases and worn patches.
export function leatherTexture() {
  const rand = seeded(91);
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#8a4a22'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 30, (r) => `rgba(${r > 0.5 ? '170,100,55' : '50,25,10'},${0.15 + r * 0.25})`, 26);
    g.strokeStyle = 'rgba(30,14,5,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 18; i++) { const y = rand() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 30, w * 0.6, y + (rand() - 0.5) * 30, w, y + (rand() - 0.5) * 20); g.stroke(); }
  }, { wrap: true });
}

// A locker door: worn white metal, vents, a safety-yellow stripe and the emblem.
export function lockerTexture() {
  const rand = seeded(17);
  return makeCanvas(128, 384, (g, w, h) => {
    g.fillStyle = '#c9c4b6'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 30, (r) => `rgba(40,30,20,${0.12 + r * 0.25})`, 16);
    g.fillStyle = '#d9a52a'; g.fillRect(0, h * 0.62, w, h * 0.07);
    g.fillStyle = '#2b2b2b';
    for (let i = 0; i < 5; i++) g.fillRect(w * 0.25, 18 + i * 9, w * 0.5, 3);
    drawEmblem(g, w / 2, h * 0.38, 16, { light: '#2c3134', accent: '#c8781e' });
    g.fillStyle = '#6a6c6e'; g.fillRect(w * 0.78, h * 0.47, 6, 24); // handle
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  });
}

// Drawer fronts for desks and filing cabinets.
export function drawerTexture(rows = 3) {
  const rand = seeded(23 + rows);
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#b9b4a6'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 25, (r) => `rgba(40,30,20,${0.12 + r * 0.25})`, 18);
    for (let i = 0; i < rows; i++) {
      const y0 = (i * h) / rows;
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(6, y0 + 4, w - 12, h / rows - 8);
      g.fillStyle = '#4a4c4e'; g.fillRect(w * 0.35, y0 + h / rows * 0.4, w * 0.3, 8);
      g.fillStyle = '#e8e2cf'; g.fillRect(w * 0.42, y0 + h / rows * 0.18, w * 0.16, 10); // label
    }
  });
}

// The big supply crate: grey metal, a yellow band, the emblem and STATION 9.
export function crateTexture() {
  const rand = seeded(29);
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#9b988d'; g.fillRect(0, 0, w, h);
    blotches(g, w, h, rand, 30, (r) => `rgba(40,30,20,${0.15 + r * 0.25})`, 20);
    g.fillStyle = '#d9a52a'; g.fillRect(0, h * 0.62, w, h * 0.1);
    drawEmblem(g, w * 0.5, h * 0.36, 34, { light: '#2c3134', accent: '#c8781e' });
    g.fillStyle = '#2c3134'; g.font = `bold 26px ${HEAD}`; g.textAlign = 'center'; g.fillText('STATION 9', w / 2, h * 0.86);
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
  });
}

export function medkitTexture() {
  return makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#a42a22'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2ece0'; g.fillRect(w * 0.4, h * 0.2, w * 0.2, h * 0.6); g.fillRect(w * 0.2, h * 0.4, w * 0.6, h * 0.2);
  });
}

// A dark wayfinding board: STATION 9, then one room per line with an arrow.
export function signTexture(entries) {
  return makeCanvas(512, 320, (g, w, h) => {
    g.fillStyle = '#16191b'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,200,190,0.35)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#e8e2cf'; g.font = `600 44px ${HEAD}`; g.textAlign = 'left'; g.fillText('STATION 9', 34, 66);
    g.fillStyle = 'rgba(232,226,207,0.3)'; g.fillRect(34, 80, w - 68, 2);
    g.font = `26px ${HEAD}`;
    entries.forEach((e, i) => {
      const y = 122 + i * 42;
      g.fillStyle = '#e8912a';
      if (e.arrow === '←') g.fillText('←', 34, y);
      g.fillStyle = '#e8e2cf'; g.fillText(e.label, 74, y);
      g.fillStyle = '#e8912a'; g.textAlign = 'right';
      if (e.arrow !== '←') g.fillText(e.arrow, w - 34, y);
      g.textAlign = 'left';
    });
  });
}

// The view out of a window: stars and the planet's lit edge.
export function windowTexture() {
  const rand = seeded(41);
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#02040a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const b = 120 + rand() * 135; g.fillStyle = `rgba(${b},${b},${b + 10},${0.4 + rand() * 0.6})`; g.fillRect(rand() * w, rand() * h, rand() < 0.1 ? 2 : 1, rand() < 0.1 ? 2 : 1); }
    const px = w * 0.72, py = h * 0.95, pr = w * 0.55;
    const grad = g.createRadialGradient(px - pr * 0.4, py - pr * 0.5, pr * 0.1, px, py, pr);
    grad.addColorStop(0, '#9fb3c4'); grad.addColorStop(0.55, '#3d4f60'); grad.addColorStop(1, '#0a1018');
    g.fillStyle = grad; g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill();
    blotches(g, w, h, rand, 12, (r) => `rgba(20,30,40,${0.2 + r * 0.3})`, 20);
  });
}

// A dark wool blanket with a stripe.
export function blanketTexture() {
  const rand = seeded(53);
  return makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#34383a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#9a7a3a'; g.fillRect(0, h * 0.18, w, 8);
    blotches(g, w, h, rand, 20, (r) => `rgba(0,0,0,${0.1 + r * 0.2})`, 14);
  }, { wrap: true });
}

// A leaf, cut out of a transparent canvas (for potted plants), drying at the tips.
export function leafTexture() {
  return makeCanvas(64, 128, (g, w, h) => {
    const grad = g.createLinearGradient(0, h, 0, 0);
    grad.addColorStop(0, '#2e5a2a'); grad.addColorStop(0.75, '#3f6b30'); grad.addColorStop(1, '#7a6a35');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(w / 2, h); g.bezierCurveTo(-w * 0.1, h * 0.6, w * 0.2, h * 0.15, w / 2, 0); g.bezierCurveTo(w * 0.8, h * 0.15, w * 1.1, h * 0.6, w / 2, h); g.fill();
    g.strokeStyle = 'rgba(20,40,15,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 6); g.stroke();
  });
}
