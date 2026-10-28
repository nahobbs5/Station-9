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
      if (r.secret) continue; // never on the map
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
export const CONSOLE_SCREENS = ['off', 'doors', 'system', 'marigold', 'research', 'trial31', 'personnel-lena', 'personnel-jun', 'personnel-sam',
  'inventory', 'power', 'comms', 'pod', 'reactor', 'signal', 'security', 'calibration', 'roster', 'manifest'];
// Screens that change as you make progress (redrawn after each repair).
export const LIVE_SCREENS = new Set(['system', 'power', 'comms', 'pod', 'reactor', 'signal']);

// The engineering screens (Main Generator, Power Grid): near-black glass, warm amber bars,
// red warnings and tabs along the bottom, as on the Main Generator Room sheet.
const G = { bg0: '#14171a', bg1: '#0a0c0d', text: '#d8d4c8', dim: '#8a877e', line: 'rgba(216,212,200,0.18)', amber: '#e8a23a', red: '#e0533f', green: '#62d39a', core: '#ff7a1c' };
function gtext(g, t, x, y, { size = 13, color = G.text, font = MONO, align = 'left' } = {}) {
  g.font = `${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(t, x, y);
}
function bar(g, x, y, bw, bh, v, color) {
  g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x, y, bw, bh);
  g.fillStyle = color; g.fillRect(x, y, bw * Math.max(0, Math.min(1, v)), bh);
}
function genScreen(g, w, h, title, tab, body, on) {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, G.bg0); bg.addColorStop(1, G.bg1);
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = G.line; g.lineWidth = 1; g.strokeRect(10, 10, w - 20, h - 20);
  gtext(g, title, 24, 40, { size: 17, font: HEAD });
  drawEmblem(g, w - 112, 32, 9, { light: '#d8d4c8', accent: G.amber });
  gtext(g, 'STATION 9', w - 96, 32, { size: 11, font: HEAD });
  gtext(g, 'RESEARCH', w - 96, 43, { size: 7, color: G.dim });
  g.fillStyle = G.line; g.fillRect(20, 54, w - 40, 1);
  body(on);
  ['OVERVIEW', 'DISTRIBUTION', 'DIAGNOSTICS', 'MANUAL'].forEach((t, i) => {
    const x = 20 + i * 119, sel = t === tab;
    g.fillStyle = sel ? 'rgba(216,212,200,0.16)' : 'rgba(216,212,200,0.04)'; g.fillRect(x, h - 44, 112, 26);
    g.strokeStyle = sel ? G.text : G.line; g.strokeRect(x, h - 44, 112, 26);
    gtext(g, t, x + 56, h - 26, { size: 11, color: sel ? G.text : G.dim, align: 'center' });
  });
}
// The reactor as a blueprint: a wire cylinder with a glowing core.
function drawReactorWire(g, cx, cy, r, on) {
  g.strokeStyle = 'rgba(216,212,200,0.55)'; g.lineWidth = 1;
  const top = cy - r * 1.05, bot = cy + r * 0.9;
  for (const y of [top, cy - r * 0.35, cy + r * 0.3, bot]) { g.beginPath(); g.ellipse(cx, y, r * 0.75, r * 0.18, 0, 0, Math.PI * 2); g.stroke(); }
  for (const dx of [-0.75, -0.4, 0.4, 0.75]) { g.beginPath(); g.moveTo(cx + dx * r, top); g.lineTo(cx + dx * r, bot); g.stroke(); }
  g.beginPath(); g.ellipse(cx, bot + r * 0.12, r * 1.05, r * 0.26, 0, 0, Math.PI * 2); g.stroke(); // the platform
  g.beginPath(); g.moveTo(cx, top - r * 0.5); g.lineTo(cx, top); g.stroke();
  g.strokeStyle = 'rgba(216,212,200,0.12)';
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(cx - r * 1.4, cy + i * r * 0.3); g.lineTo(cx + r * 1.4, cy + i * r * 0.3); g.stroke(); }
  const core = g.createLinearGradient(cx - r * 0.2, 0, cx + r * 0.2, 0);
  const a = on ? 1 : 0.55;
  core.addColorStop(0, `rgba(255,122,28,${0.2 * a})`); core.addColorStop(0.5, `rgba(255,190,110,${a})`); core.addColorStop(1, `rgba(255,122,28,${0.2 * a})`);
  g.fillStyle = core; g.fillRect(cx - r * 0.2, top + r * 0.15, r * 0.4, bot - top - r * 0.3);
}

export function consoleScreen(kind, state = {}) {
  // A dead monitor: near-black glass with a faint sheen. The Hat Man's cameo shows in these.
  if (kind === 'off') {
    return makeCanvas(512, 320, (g, w, h) => {
      g.fillStyle = '#050707'; g.fillRect(0, 0, w, h);
      const sheen = g.createLinearGradient(0, 0, w, h);
      sheen.addColorStop(0, 'rgba(160,190,185,0)'); sheen.addColorStop(0.42, 'rgba(160,190,185,0.07)');
      sheen.addColorStop(0.5, 'rgba(160,190,185,0.02)'); sheen.addColorStop(1, 'rgba(160,190,185,0)');
      g.fillStyle = sheen; g.fillRect(0, 0, w, h);
    });
  }
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
        for (const c of L.corridors.filter((q) => !q.secret)) { g.beginPath(); c.pts.forEach((p, i) => (i ? g.lineTo(sx(p.x), sz(p.z)) : g.moveTo(sx(p.x), sz(p.z)))); g.stroke(); }
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
      genScreen(g, w, h, 'POWER GRID', 'DISTRIBUTION', (on) => {
        // The generator feeding each section of the station.
        const node = [30, 150, 112, 40];
        g.fillStyle = on ? 'rgba(232,162,58,0.12)' : 'rgba(224,83,63,0.16)'; g.fillRect(...node);
        g.strokeStyle = on ? G.amber : G.red; g.lineWidth = 2; g.strokeRect(...node);
        gtext(g, (on ? '' : '⚠ ') + 'GENERATOR', 86, 176, { size: 14, color: on ? G.amber : G.red, align: 'center' });
        const rows = [['HABITATION', on ? 86 : 23], ['LABS', on ? 92 : 12], ['COMMS', on ? 74 : 9], ['LIFE SUPPORT', on ? 98 : 64]];
        g.strokeStyle = G.amber; g.lineWidth = 1.2;
        rows.forEach(([label, v], i) => {
          const y = 104 + i * 40;
          g.beginPath(); g.moveTo(142, 170); g.lineTo(172, 170); g.lineTo(172, y - 5); g.lineTo(196, y - 5); g.stroke();
          g.fillStyle = v > 50 ? G.green : G.amber; g.fillRect(200, y - 11, 8, 10);
          gtext(g, label, 216, y, { size: 13 });
          bar(g, 340, y - 11, 100, 10, v / 100, v < 30 ? G.red : G.amber);
          gtext(g, `${v}%`, 486, y, { size: 13, align: 'right' });
        });
      }, stage >= 1);
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
      genScreen(g, w, h, 'MAIN GENERATOR', 'OVERVIEW', (on) => {
        drawReactorWire(g, 120, 178, 70, on);
        const rows = [['TURBINE', on ? 0.86 : 0.62], ['COOLANT', on ? 0.8 : 0.4], ['OUTPUT', on ? 0.92 : 0.28], ['STABILITY', on ? 0.88 : 0.22]];
        rows.forEach(([label, v], i) => {
          const y = 104 + i * 32;
          gtext(g, label, 262, y, { size: 13 });
          bar(g, 380, y - 10, 110, 9, v, v < 0.3 ? G.red : G.amber);
        });
        const ok = on;
        g.fillStyle = ok ? 'rgba(98,211,154,0.12)' : 'rgba(224,83,63,0.16)'; g.fillRect(262, 232, 228, 30);
        g.strokeStyle = ok ? G.green : G.red; g.lineWidth = 1.5; g.strokeRect(262, 232, 228, 30);
        gtext(g, ok ? 'OUTPUT NOMINAL' : '⚠  OUTPUT LOW', 376, 253, { size: 16, color: ok ? G.green : G.red, align: 'center', font: HEAD });
      }, stage >= 1);
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
      text(`${state.name?.trim() || 'Technician'}: NOT ON LIST`, 30, 210, { size: 15, color: C.red });
      text('Your labor is our freedom.', 30, 292, { size: 13, color: C.marigold });
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
// The strip along the bottom of a tape terminal's screen: amber "AUDIO LOG · PRESS E" with a play
// triangle until it's been played, then teal "AUDIO LOG PLAYED" with a tick. The triangle and tick
// are drawn, since the screen fonts don't have those symbols.
export function tapeBanner(played) {
  return makeCanvas(512, 72, (g, w, h) => {
    const color = played ? '#5fb3a8' : '#f2a92e';
    g.fillStyle = played ? 'rgba(6,22,20,0.92)' : 'rgba(30,18,4,0.92)'; g.fillRect(0, 0, w, h);
    g.fillStyle = color; g.fillRect(0, 0, w, 3);
    g.font = `600 34px ${HEAD}`;
    const label = played ? 'AUDIO LOG PLAYED' : 'AUDIO LOG  \u00b7  PRESS E';
    const tw = g.measureText(label).width, x0 = (w - tw - 44) / 2, cy = h / 2 + 1;
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    if (played) { g.moveTo(x0 + 2, cy); g.lineTo(x0 + 11, cy + 10); g.lineTo(x0 + 30, cy - 11); g.stroke(); }
    else { g.moveTo(x0 + 4, cy - 14); g.lineTo(x0 + 30, cy); g.lineTo(x0 + 4, cy + 14); g.closePath(); g.fill(); }
    g.textBaseline = 'middle'; g.textAlign = 'left';
    g.fillText(label, x0 + 44, cy + 1);
  });
}

// The front of the desk tape deck: a cassette behind a smoked window, two reels, and its buttons.
export function tapeDeckTexture() {
  return makeCanvas(256, 96, (g, w, h) => {
    g.fillStyle = '#26292b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#121415'; g.fillRect(14, 10, 160, 70); // the window
    g.fillStyle = '#d9cfb8'; g.fillRect(22, 18, 144, 54); // the cassette
    g.fillStyle = '#c0392b'; g.fillRect(22, 18, 144, 12); // its label stripe
    g.fillStyle = '#121415'; g.fillRect(52, 38, 84, 26); // the reel window
    for (const cx of [70, 118]) {
      g.fillStyle = '#efe6d2'; g.beginPath(); g.arc(cx, 51, 10, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#121415';
      for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3; g.fillRect(cx + Math.cos(a) * 6 - 1.5, 51 + Math.sin(a) * 6 - 1.5, 3, 3); }
    }
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(14, 10, 160, 22); // glare on the window
    g.fillStyle = '#3a3e41'; // play / stop / rewind keys
    for (let k = 0; k < 3; k++) g.fillRect(188 + k * 20, 56, 16, 22);
    g.fillStyle = '#8a877e'; g.font = `10px ${MONO}`; g.textAlign = 'left'; g.fillText('TAPE', 190, 26);
  });
}

// The Teleporter Chamber (reference files/Station 9 Teleporter Chamber.png) ------------------------
// The platform's grated top: a dark disc of concentric rings and spokes, seen from above.
export function teleporterFloorTexture() {
  return makeCanvas(512, 512, (g, w, h) => {
    const c = w / 2;
    g.fillStyle = '#1a1d1f'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#4a5054'; g.lineWidth = 3;
    for (let r = 30; r < c; r += 22) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    g.lineWidth = 4;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.beginPath(); g.moveTo(c + Math.cos(a) * 30, c + Math.sin(a) * 30); g.lineTo(c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke();
    }
    g.fillStyle = '#2c3134'; g.beginPath(); g.arc(c, c, 30, 0, Math.PI * 2); g.fill(); // the hub
    const shine = g.createRadialGradient(c, c, 0, c, c, c);
    shine.addColorStop(0, 'rgba(200,225,255,0.18)'); shine.addColorStop(1, 'rgba(200,225,255,0)');
    g.fillStyle = shine; g.fillRect(0, 0, w, h);
  });
}

// The floor band round the chamber, 5 x 5 m on a transparent canvas: orange-red, with a white
// edge and STAND WITHIN RINGS written round it twice, each with an arrow.
export function teleporterRingDecal() {
  return makeCanvas(1024, 1024, (g, w) => {
    const c = w / 2, px = w / 5; // pixels per metre
    const r0 = 1.65 * px, r1 = 2.2 * px;
    g.clearRect(0, 0, w, w);
    g.fillStyle = 'rgba(176,58,34,0.85)';
    g.beginPath(); g.arc(c, c, r1, 0, Math.PI * 2); g.arc(c, c, r0, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = 'rgba(230,226,214,0.8)'; g.lineWidth = 6;
    g.beginPath(); g.arc(c, c, r1 + 10, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(c, c, r0 - 8, 0, Math.PI * 2); g.stroke();
    // Worn paint: small chips back to the floor.
    const rand = seeded(907);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 260; i++) {
      const a = rand() * Math.PI * 2, r = r0 + rand() * (r1 - r0);
      g.beginPath(); g.arc(c + Math.cos(a) * r, c + Math.sin(a) * r, 1 + rand() * 4, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // The words, letter by letter round the arc, tops toward the middle so they read from outside,
    // and an arrow after each pointing on round.
    const rm = (r0 + r1) / 2, text = 'STAND WITHIN RINGS';
    g.fillStyle = 'rgba(240,236,224,0.92)'; g.font = `600 44px ${HEAD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const start of [-Math.PI * 0.9, Math.PI * 0.1]) {
      let a = start;
      for (const ch of text) {
        const cw = g.measureText(ch).width + 4;
        a -= cw / 2 / rm;
        g.save(); g.translate(c + Math.cos(a) * rm, c + Math.sin(a) * rm); g.rotate(a - Math.PI / 2); g.fillText(ch, 0, 0); g.restore();
        a -= cw / 2 / rm;
      }
      a -= 0.12;
      g.save(); g.translate(c + Math.cos(a) * rm, c + Math.sin(a) * rm); g.rotate(a - Math.PI / 2);
      g.fillRect(-26, -6, 34, 12);
      g.beginPath(); g.moveTo(8, -18); g.lineTo(30, 0); g.lineTo(8, 18); g.closePath(); g.fill();
      g.restore();
    }
  });
}

// TELEPORTER / STATION 9 with the emblem, painted straight onto the wall (transparent canvas).
export function teleporterSignTexture() {
  return makeCanvas(520, 400, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    drawEmblem(g, w / 2, 120, 92, { light: '#2c2c2a', accent: '#c8641e' });
    g.fillStyle = '#2c2c2a'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `600 74px ${HEAD}`; g.fillText('TELEPORTER', w / 2, 310);
    g.font = `500 40px ${HEAD}`; g.fillText('S T A T I O N   9', w / 2, 368);
  });
}

// The safety protocol panel: a cream plate, five numbered steps, orange hazard stripes along the foot.
export function safetyProtocolTexture() {
  return makeCanvas(440, 400, (g, w, h) => {
    g.fillStyle = '#d9d2c0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(40,40,38,0.5)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#2c2c2a'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `600 36px ${HEAD}`; g.fillText('SAFETY PROTOCOL', 30, 60);
    g.fillRect(30, 72, 300, 3);
    ['CLEAR AREA', 'SCAN', 'CONFIRM', 'STAND WITHIN RINGS', 'AWAIT TRANSFER'].forEach((t, i) => {
      g.font = `600 26px ${HEAD}`; g.fillText(String(i + 1), 32, 118 + i * 40);
      g.font = `500 24px ${HEAD}`; g.fillText(t, 62, 118 + i * 40);
    });
    g.save(); g.beginPath(); g.rect(0, h - 64, w, 64); g.clip();
    g.fillStyle = '#d9d2c0'; g.fillRect(0, h - 64, w, 64);
    g.fillStyle = '#c8641e';
    for (let x = -60; x < w + 60; x += 56) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 28, h); g.lineTo(x + 68, h - 64); g.lineTo(x + 40, h - 64); g.closePath(); g.fill(); }
    g.restore();
    const rand = seeded(311);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(50,40,28,${0.15 + rand() * 0.3})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
  });
}

// A small safety notice plate (worldplan.js SAFETY_NOTICES): a hazard-orange header, then the rules.
export function safetyNoticeTexture(title, lines, seed = 1) {
  return makeCanvas(310, 400, (g, w, h) => {
    g.fillStyle = '#d9d2c0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8641e'; g.fillRect(0, 0, w, 78);
    g.strokeStyle = 'rgba(40,40,38,0.5)'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
    // A warning triangle in the header.
    g.fillStyle = '#1f1f1d'; g.beginPath(); g.moveTo(40, 18); g.lineTo(64, 60); g.lineTo(16, 60); g.closePath(); g.fill();
    g.fillStyle = '#c8641e'; g.font = `700 30px ${HEAD}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText('!', 40, 56);
    g.fillStyle = '#1f1f1d'; g.textAlign = 'left';
    let size = 32;
    do { g.font = `700 ${size}px ${HEAD}`; size -= 2; } while (g.measureText(title).width > w - 96 && size > 16);
    g.fillText(title, 78, 52);
    g.fillStyle = '#2c2c2a';
    lines.forEach((t, i) => {
      g.font = `600 22px ${HEAD}`; g.fillText('\u25B8', 22, 124 + i * 52);
      let fs = 22;
      do { g.font = `500 ${fs}px ${HEAD}`; fs -= 1; } while (g.measureText(t).width > w - 70 && fs > 12);
      g.fillText(t, 46, 124 + i * 52);
    });
    g.font = `500 14px ${HEAD}`; g.fillStyle = 'rgba(44,44,42,0.7)'; g.fillText('VANTORA TRANSIT GROUP · STATION 9', 22, h - 22);
    const rand = seeded(400 + seed);
    for (let i = 0; i < 110; i++) { g.fillStyle = `rgba(50,40,28,${0.15 + rand() * 0.3})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
  });
}

// RESTRICTED ACCESS, on a dark plate for the door headers.
export function restrictedTexture() {
  return makeCanvas(512, 72, (g, w, h) => {
    g.fillStyle = '#2b2e30'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#c8641e'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#e4ddc9'; g.font = `600 40px ${HEAD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('RESTRICTED  ACCESS', w / 2, h / 2 + 2);
  });
}

// The teleporter control stand's screen: a body scan, its checks, and an INITIATE button.
export function teleControlScreen() {
  return makeCanvas(512, 320, (g, w, h) => {
    const teal = '#8fe0cf', dim = '#5d8a82', orange = '#f08a3c';
    g.fillStyle = '#0d1516'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(143,224,207,0.25)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
    drawEmblem(g, 52, 46, 22, { light: '#cfe9e2', accent: orange });
    g.fillStyle = '#d8ece6'; g.font = `600 22px ${HEAD}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('TELEPORTER CONTROL', 96, 54);
    g.fillStyle = 'rgba(143,224,207,0.2)'; g.fillRect(20, 78, w - 40, 1);
    // Checks on the left.
    g.font = `14px ${MONO}`;
    ['VITALS', 'MASS', 'PATTERN', 'CLEARANCE'].forEach((t, i) => {
      g.fillStyle = dim; g.fillText(t, 24, 120 + i * 30);
      g.fillStyle = '#62d39a'; g.fillText('OK', 116, 120 + i * 30);
    });
    // The body scan in the middle: a wire figure in a frame.
    g.strokeStyle = 'rgba(143,224,207,0.35)'; g.strokeRect(160, 90, 130, 210);
    g.strokeStyle = teal; g.lineWidth = 2;
    const bx = 225;
    g.beginPath(); g.ellipse(bx, 116, 11, 14, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(bx - 22, 138); g.lineTo(bx + 22, 138); g.lineTo(bx + 16, 200); g.lineTo(bx - 16, 200); g.closePath(); g.stroke();
    g.beginPath(); g.moveTo(bx - 22, 140); g.lineTo(bx - 34, 205); g.moveTo(bx + 22, 140); g.lineTo(bx + 34, 205); g.stroke();
    g.beginPath(); g.moveTo(bx - 12, 200); g.lineTo(bx - 16, 288); g.moveTo(bx + 12, 200); g.lineTo(bx + 16, 288); g.stroke();
    g.strokeStyle = 'rgba(143,224,207,0.3)'; g.lineWidth = 1;
    for (let y = 150; y < 290; y += 14) { g.beginPath(); g.moveTo(bx - 20, y); g.lineTo(bx + 20, y); g.stroke(); }
    // The steps on the right, and INITIATE.
    const row = (y, label, tick, color) => {
      g.strokeStyle = color; g.lineWidth = 2; g.strokeRect(306, y, 186, 38);
      g.fillStyle = color; g.font = `600 15px ${HEAD}`; g.fillText(label, 340, y + 25);
      g.beginPath();
      if (tick) { g.moveTo(316, y + 20); g.lineTo(322, y + 27); g.lineTo(332, y + 12); }
      else { g.moveTo(468, y + 19); g.lineTo(482, y + 19); g.moveTo(476, y + 12); g.lineTo(483, y + 19); g.lineTo(476, y + 26); }
      g.stroke();
    };
    row(92, 'DESTINATION', false, '#cfe9e2');
    row(140, 'SCAN COMPLETE', true, '#cfe9e2');
    row(188, 'CHAMBER READY', true, orange);
    g.fillStyle = 'rgba(240,138,60,0.18)'; g.fillRect(306, 244, 186, 50);
    g.strokeStyle = orange; g.lineWidth = 3; g.strokeRect(306, 244, 186, 50);
    g.fillStyle = '#ffd9b8'; g.font = `600 24px ${HEAD}`; g.textAlign = 'center'; g.fillText('INITIATE', 399, 278);
  });
}

export function mugTexture() {
  return makeCanvas(256, 128, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    drawMascot(g, 80, 64, 26);
    g.fillStyle = '#0f4c4a'; g.font = `bold 14px ${HEAD}`; g.fillText('YOUR LABOR', 120, 60); g.fillText('IS OUR FREEDOM', 120, 78);
    g.fillStyle = 'rgba(60,40,20,0.35)'; g.fillRect(0, h - 10, w, 10); // coffee stain ring
  });
}

// Worn white enamel, as on the interiors sheet: clean off-white paint, chipped down to grey metal
// and rust at the edges and corners, fine scratches, a little grime low down. No big spots, so it
// still looks right on small parts like chair backs (each box face shows the whole texture).
function wornEnamel(g, w, h, rand, base) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  // The faintest unevenness in the paint.
  const v = g.createLinearGradient(0, 0, w, h);
  v.addColorStop(0, 'rgba(255,255,250,0.06)'); v.addColorStop(1, 'rgba(60,50,40,0.07)');
  g.fillStyle = v; g.fillRect(0, 0, w, h);
  // Darker wear along every edge.
  const edge = Math.max(4, w * 0.035);
  for (const [x, y, ew, eh] of [[0, 0, w, edge], [0, h - edge, w, edge], [0, 0, edge, h], [w - edge, 0, edge, h]]) {
    g.fillStyle = 'rgba(70,62,52,0.22)'; g.fillRect(x, y, ew, eh);
  }
  // Chips: mostly near the edges and corners, a few out in the open.
  const nearEdge = (span) => { const t = rand() ** 3 * span * 0.18; return rand() < 0.5 ? t : span - t; };
  for (let i = 0; i < 160; i++) {
    const onSide = rand() < 0.5;
    const x = i % 7 === 0 ? rand() * w : onSide ? nearEdge(w) : rand() * w;
    const y = i % 7 === 0 ? rand() * h : onSide ? rand() * h : nearEdge(h);
    const r = rand();
    g.fillStyle = r < 0.55 ? `rgba(95,92,86,${0.5 + rand() * 0.4})` : `rgba(115,55,22,${0.45 + rand() * 0.4})`; // bare metal or rust
    g.fillRect(x, y, 1 + rand() * (r < 0.08 ? 7 : 3), 1 + rand() * (r < 0.08 ? 5 : 2.5));
  }
  scratches(g, w, h, rand, 26, 0.16);
  // A little grime toward the bottom.
  const low = g.createLinearGradient(0, h * 0.82, 0, h);
  low.addColorStop(0, 'rgba(45,36,26,0)'); low.addColorStop(1, 'rgba(45,36,26,0.22)');
  g.fillStyle = low; g.fillRect(0, h * 0.82, w, h * 0.18);
}

// The monitor housing and the off-white furniture: worn white enamel.
export function housingTexture() {
  const rand = seeded(83);
  return makeCanvas(256, 256, (g, w, h) => wornEnamel(g, w, h, rand, '#c4bdab'));
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
    // A soft sheen across the middle, darker toward the edges.
    const sheen = g.createLinearGradient(0, 0, 0, h);
    sheen.addColorStop(0, 'rgba(40,18,6,0.25)'); sheen.addColorStop(0.45, 'rgba(200,120,70,0.12)'); sheen.addColorStop(1, 'rgba(40,18,6,0.3)');
    g.fillStyle = sheen; g.fillRect(0, 0, w, h);
    // Two or three faint worn patches where people sit and lean.
    for (let i = 0; i < 3; i++) {
      const x = w * (0.25 + rand() * 0.5), y = h * (0.25 + rand() * 0.5), r = 30 + rand() * 30;
      const wear = g.createRadialGradient(x, y, 0, x, y, r);
      wear.addColorStop(0, 'rgba(185,115,70,0.18)'); wear.addColorStop(1, 'rgba(185,115,70,0)');
      g.fillStyle = wear; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // A few soft creases.
    g.strokeStyle = 'rgba(40,18,6,0.18)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { const y = rand() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 20, w * 0.6, y + (rand() - 0.5) * 20, w, y + (rand() - 0.5) * 14); g.stroke(); }
    // Stitched seams near the edges.
    g.strokeStyle = 'rgba(235,190,140,0.35)'; g.lineWidth = 1; g.setLineDash([4, 4]);
    g.strokeRect(10, 10, w - 20, h - 20);
    g.setLineDash([]);
    g.strokeStyle = 'rgba(30,12,4,0.45)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
  }, { wrap: true });
}

// A locker door: worn white metal, vents, a safety-yellow stripe and the emblem.
export function lockerTexture() {
  const rand = seeded(17);
  return makeCanvas(128, 384, (g, w, h) => {
    wornEnamel(g, w, h, rand, '#cbc6b8');
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
    wornEnamel(g, w, h, rand, '#bdb8aa');
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
    wornEnamel(g, w, h, rand, '#a29f94');
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

// Door jambs: worn yellow and black hazard stripes, chipped and grimy (tall, for a 3 m jamb).
export function hazardTexture() {
  const rand = seeded(23);
  return tex(64, 384, (g, w, h) => {
    g.fillStyle = '#c99a24'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#161616';
    for (let y = -w; y < h + w; y += 48) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w * 0.75); g.lineTo(w, y + w * 0.75 + 24); g.lineTo(0, y + 24); g.fill(); }
    grime(g, w, h, rand, 40, 0.5);
    scratches(g, w, h, rand, 30, 0.3);
    // Paint scuffed off at knee and hand height, down to grey metal.
    for (const y of [h * 0.55, h * 0.8]) {
      for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(95,95,92,${0.4 + rand() * 0.4})`; g.fillRect(rand() * w, y + (rand() - 0.5) * 30, 3 + rand() * 10, 2 + rand() * 6); }
    }
    const grad = g.createLinearGradient(0, h * 0.85, 0, h);
    grad.addColorStop(0, 'rgba(25,18,10,0)'); grad.addColorStop(1, 'rgba(25,18,10,0.75)'); // kicked and dirty at the bottom
    g.fillStyle = grad; g.fillRect(0, h * 0.85, w, h * 0.15);
  });
}

// A wall vent: angled louvres in a dark slot, dust caught on the slats.
export function ventTexture() {
  const rand = seeded(29);
  return tex(256, 128, (g, w, h) => {
    g.fillStyle = '#08090a'; g.fillRect(0, 0, w, h);
    const m = 10;
    for (let y = m; y < h - m; y += 12) {
      const grad = g.createLinearGradient(0, y, 0, y + 9);
      grad.addColorStop(0, '#6c7174'); grad.addColorStop(0.5, '#454a4d'); grad.addColorStop(1, '#1e2123');
      g.fillStyle = grad; g.fillRect(m, y, w - m * 2, 9);
      g.fillStyle = 'rgba(150,140,120,0.25)'; g.fillRect(m, y, w - m * 2, 1.5); // dust on each slat
    }
    g.strokeStyle = '#2c3033'; g.lineWidth = m; g.strokeRect(m / 2, m / 2, w - m, h - m);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,22,12,${0.15 + rand() * 0.3})`; g.fillRect(m + rand() * (w - m * 2), m + rand() * (h - m * 2), 2 + rand() * 18, 2 + rand() * 4); } // dust and grease on the slats
    g.fillStyle = '#16181a';
    for (const [x, y] of [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } // screws
  });
}

// Stage 4 decals --------------------------------------------------------------
// Sprayed stencil lettering on a transparent background: soft overspray, a stencil gap through
// each line, and paint worn away in specks. lines: one or two short lines of capitals.
export function stencilTexture(lines, { color = '#bdb7a6', seed = 3, w = 512, h = 256 } = {}) {
  const rand = seeded(seed);
  return tex(w, h, (g) => {
    const size = Math.floor((h * 0.8) / lines.length / 1.08);
    g.font = `bold ${size}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const gap = size * 0.06; // letter spacing, as stencil sheets have
    for (const [i, t] of lines.entries()) {
      const y = h / 2 + (i - (lines.length - 1) / 2) * size * 1.08;
      const widths = [...t].map((ch) => g.measureText(ch).width + gap);
      const total = widths.reduce((a, b) => a + b, 0) - gap;
      const sx = Math.min(1, (w * 0.94) / total);
      g.save(); g.translate((w - total * sx) / 2, y); g.scale(sx, 1);
      let x = 0;
      for (const [k, ch] of [...t].entries()) {
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = color; g.shadowColor = color; g.shadowBlur = size * 0.04; // a little overspray
        g.fillText(ch, x, 0);
        g.shadowBlur = 0;
        // Stencil bridges: letters with closed loops get thin gaps so their middles don't fall out.
        if ('ABDOPQR0689'.includes(ch)) {
          g.globalCompositeOperation = 'destination-out';
          const cx = x + widths[k] * 0.45, bw = Math.max(2, size * 0.07);
          g.fillRect(cx - bw / 2, -size * 0.5, bw, size * 0.28);
          g.fillRect(cx - bw / 2, size * 0.18, bw, size * 0.3);
        }
        x += widths[k];
      }
      g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + rand() * 0.7})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 5, 1 + rand() * 3); }
    for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + rand() * 0.35})`; g.beginPath(); g.arc(rand() * w, rand() * h, 6 + rand() * 30, 0, 7); g.fill(); } // scuffed patches
    g.globalCompositeOperation = 'source-over';
  });
}

// Worn hazard stripes painted on the floor either side of a door (long along u).
export function floorStripeTexture() {
  const rand = seeded(31);
  return tex(512, 64, (g, w, h) => {
    g.fillStyle = '#c99a24'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#141414';
    for (let x = -h; x < w + h; x += 56) { g.beginPath(); g.moveTo(x, h); g.lineTo(x + 28, h); g.lineTo(x + 28 + h, 0); g.lineTo(x + h, 0); g.fill(); }
    grime(g, w, h, rand, 30, 0.6);
    g.globalCompositeOperation = 'destination-out'; // worn through where feet go
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${0.4 + rand() * 0.6})`; g.fillRect(w * (0.25 + rand() * 0.5) + (rand() - 0.5) * w * 0.3, rand() * h, 1 + rand() * 6, 1 + rand() * 4); }
    g.globalCompositeOperation = 'source-over';
  });
}

// Streaks running down a wall from something above: grime (under vents) or rust (under plates).
export function streakTexture(kind) {
  const rand = seeded(kind === 'rust' ? 37 : 41);
  const rgb = kind === 'rust' ? '110,52,18' : '24,20,14';
  return tex(128, 256, (g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = rand() * w, sw = 2 + rand() * 9, len = h * (0.25 + rand() * 0.75), a = 0.15 + rand() * 0.45;
      const grad = g.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(${rgb},${a})`); grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.fillRect(x, 0, sw, len);
    }
    const top = g.createLinearGradient(0, 0, 0, h * 0.2);
    top.addColorStop(0, `rgba(${rgb},0.45)`); top.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = top; g.fillRect(0, 0, w, h * 0.2);
  });
}

// Dust and grime round a grate that's been opened: a soft dark halo, heaviest just outside the
// cover's edge (where hands and boots go), clear in the middle where the grate itself sits.
function dustRingTexture() {
  const rand = seeded(53);
  return tex(256, 256, (g, w, h) => {
    const ring = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w * 0.5);
    ring.addColorStop(0, 'rgba(14,12,9,0)'); ring.addColorStop(0.3, 'rgba(14,12,9,0.3)'); ring.addColorStop(1, 'rgba(14,12,9,0)');
    g.fillStyle = ring; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { // scuffs
      const a = rand() * Math.PI * 2, r = w * (0.24 + rand() * 0.2);
      g.fillStyle = `rgba(14,12,9,${0.08 + rand() * 0.18})`;
      g.fillRect(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 1 + rand() * 4, 1 + rand() * 3);
    }
  });
}

// A stain on the floor: oil (dark, glossy), dried water (pale tide marks), or dust round a grate.
export function stainTexture(kind) {
  if (kind === 'dust') return dustRingTexture();
  const rand = seeded(kind === 'oil' ? 43 : 47);
  return tex(256, 256, (g, w, h) => {
    const rgb = kind === 'oil' ? '8,7,6' : '40,38,32';
    for (let i = 0; i < 14; i++) {
      const r = 20 + rand() * 70, x = w / 2 + (rand() - 0.5) * (w - r * 2) * 0.7, y = h / 2 + (rand() - 0.5) * (h - r * 2) * 0.7;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(${rgb},${kind === 'oil' ? 0.55 : 0.3})`); grad.addColorStop(0.7, `rgba(${rgb},${kind === 'oil' ? 0.35 : 0.15})`); grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    if (kind === 'water') {
      g.strokeStyle = 'rgba(150,145,130,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(w / 2, h / 2, 50 + i * 22 + rand() * 10, 40 + i * 20 + rand() * 10, rand(), 0, 7); g.stroke(); } // tide marks
    }
  });
}

// Over a console screen: scanlines and darker edges, as if the glass were curved.
export function crtTexture() {
  return tex(256, 160, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0.38)';
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    const v = g.createRadialGradient(w / 2, h / 2, h * 0.35, w / 2, h / 2, w * 0.62);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.75)');
    g.fillStyle = v; g.fillRect(0, 0, w, h);
  });
}

// The comms console's Outgoing Call screen (after the Outgoing Call Console sheet). Redrawn as the
// rescue call goes out: p is how far through the call (0..1), sent once it has gone.
export const CALL_STEPS = [['Antenna Power', 'ONLINE'], ['Gyro Alignment', 'LOCKED'], ['Signal Calibration', 'TUNED'],
  ['Establishing Uplink', 'LINKED'], ['Transmitting Signal', 'SENT'], ['Awaiting Response', 'LISTENING']];
export function commsCallScreen({ p = 0, sent = false, seconds = 5 } = {}) {
  const amber = '#e8b44a', dim = '#7f8a8c', text = '#d9dcd6', line = 'rgba(200,210,205,0.18)', red = '#e0533f', green = '#62d39a';
  const prog = sent ? 1 : p;
  const rand = seeded(61);
  return makeCanvas(1024, 640, (g, w, h) => {
    const t = (s, x, y, { size = 16, color = text, font = MONO, align = 'left' } = {}) => { g.font = `${size}px ${font}`; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); };
    const panel = (x, y, pw, ph) => { g.fillStyle = 'rgba(255,255,255,0.025)'; g.fillRect(x, y, pw, ph); g.strokeStyle = line; g.lineWidth = 1.2; g.strokeRect(x, y, pw, ph); };
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#111619'); bg.addColorStop(1, '#090c0e');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // Header.
    panel(16, 14, w - 32, 70);
    drawEmblem(g, 56, 48, 17, { light: '#d9dcd6', accent: amber });
    t('STATION 9', 88, 50, { size: 26, font: HEAD }); t('R E S E A R C H', 104, 70, { size: 11, color: dim });
    g.fillStyle = line; g.fillRect(250, 26, 1, 46);
    ['COMMUNICATIONS', 'DEEP SPACE RELAY', 'EXTERNAL CONTACT'].forEach((s, i) => t(s, 264, 36 + i * 16, { size: 11, color: dim }));
    t('2091-07-15  03:14', w - 170, 44, { size: 15, align: 'right' }); t('SYS-9-COM-01', w - 170, 64, { size: 11, color: dim, align: 'right' });
    const online = prog > 0;
    g.strokeStyle = online ? green : red; g.strokeRect(w - 156, 28, 92, 24);
    t(online ? 'ONLINE' : 'STANDBY', w - 110, 46, { size: 14, color: online ? green : red, align: 'center' });
    g.fillStyle = online ? amber : '#5a4a2a'; g.beginPath(); g.arc(w - 44, 40, 6, 0, 7); g.fill();
    // The menu down the left.
    const menu = [['Outgoing Call', 'Contact External'], ['Incoming (2)', 'No New Messages'], ['Recorded Logs', '47 Files'],
      ['System Status', `Antenna: ${prog >= 1 / 6 ? 'ONLINE' : 'OFFLINE'}`], ['Settings', 'Audio / Relay / Power'], ['Help', 'Procedures']];
    menu.forEach(([a, b], i) => {
      const y = 98 + i * 72;
      if (i === 0) { g.fillStyle = amber; g.fillRect(16, y, 200, 64); }
      else { g.strokeStyle = line; g.strokeRect(16, y, 200, 64); }
      g.strokeStyle = i === 0 ? '#1a1a14' : dim; g.lineWidth = 1.5; g.strokeRect(28, y + 18, 26, 26); // icon
      t(a, 66, y + 30, { size: 16, color: i === 0 ? '#1a1a14' : text }); t(b, 66, y + 50, { size: 11, color: i === 0 ? '#3a3420' : dim });
    });
    // Centre: the call.
    panel(232, 98, 520, 330);
    t('OUTGOING CALL', 250, 140, { size: 34, font: HEAD }); t('ESTABLISHING CONNECTION TO RESCUE NETWORK', 250, 162, { size: 12, color: dim });
    t('DEEP SPACE RELAY // DSN-77A', 738, 128, { size: 11, color: dim, align: 'right' });
    t(sent ? 'LOCKED ON' : prog > 0 ? 'AUTO-ALIGN IN PROGRESS' : 'AWAITING OPERATOR', 738, 144, { size: 11, color: dim, align: 'right' });
    // A dish against a planet's edge.
    g.save(); g.beginPath(); g.rect(240, 176, 300, 244); g.clip();
    const planet = g.createRadialGradient(560, 640, 150, 560, 640, 330);
    planet.addColorStop(0, '#1d3448'); planet.addColorStop(0.9, '#2c5672'); planet.addColorStop(1, 'rgba(120,180,220,0)');
    g.fillStyle = planet; g.beginPath(); g.arc(560, 640, 330, 0, 7); g.fill();
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.5})`; g.fillRect(240 + rand() * 300, 176 + rand() * 120, 1.5, 1.5); }
    g.translate(360, 280); g.rotate(-0.5 + prog * 0.15);
    g.strokeStyle = '#c9cdc8'; g.lineWidth = 2; g.fillStyle = 'rgba(200,205,200,0.18)';
    g.beginPath(); g.ellipse(0, 0, 80, 34, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * 30, -Math.sqrt(Math.max(0, 1 - (k * 30 / 80) ** 2)) * 34); g.lineTo(k * 30, Math.sqrt(Math.max(0, 1 - (k * 30 / 80) ** 2)) * 34); g.stroke(); }
    g.beginPath(); g.moveTo(-60, 20); g.lineTo(0, -70); g.lineTo(60, 20); g.stroke(); g.fillStyle = '#c9cdc8'; g.fillRect(-4, -76, 8, 8);
    g.restore();
    g.strokeStyle = '#8f9590'; g.lineWidth = 3; g.beginPath(); g.moveTo(360, 300); g.lineTo(350, 410); g.moveTo(330, 410); g.lineTo(390, 410); g.stroke();
    // The checklist: each step ticks off as the call goes through.
    CALL_STEPS.forEach(([name, done], i) => {
      const y = 214 + i * 36, d0 = i / CALL_STEPS.length, d1 = (i + 1) / CALL_STEPS.length;
      const finished = sent ? i < 5 : prog >= d1, active = sent ? i === 5 : prog > d0 && prog < d1;
      g.lineWidth = 2; g.strokeStyle = finished ? green : active ? amber : '#3b4446';
      g.beginPath(); g.arc(566, y - 5, 9, 0, 7); g.stroke();
      if (finished) { g.beginPath(); g.moveTo(561, y - 5); g.lineTo(565, y - 1); g.lineTo(572, y - 10); g.stroke(); }
      t(name, 584, y, { size: 13, color: finished || active ? text : '#5d676a' });
      if (finished) t(done, 744, y, { size: 11, color: green, align: 'right' });
      else if (active) t('…', 744, y, { size: 13, color: amber, align: 'right' });
    });
    // Bottom: dialling line, timer, and the button.
    panel(232, 440, 520, 112);
    const label = sent ? 'SIGNAL SENT · AWAITING RESPONSE' : prog > 0 ? 'D I A L I N G   R E S C U E   N E T W O R K …' : 'READY TO DIAL';
    g.strokeStyle = 'rgba(200,210,205,0.25)'; g.lineWidth = 1; g.beginPath();
    for (let x = 248; x < 560; x += 3) g.lineTo(x, 478 + Math.sin(x * 0.11) * (prog > 0 && !sent ? 10 * rand() : 2));
    g.stroke();
    t(label, 252, 484, { size: 15 });
    const secs = Math.min(seconds, prog * seconds);
    t(`00:00:${String(Math.floor(secs)).padStart(2, '0')}`, 736, 490, { size: 36, color: amber, font: MONO, align: 'right' });
    t(`EST. TIME 00:00:${String(seconds).padStart(2, '0')}`, 736, 512, { size: 11, color: dim, align: 'right' });
    t('TARGET: STATION 9 EMERGENCY BEACON', 250, 524, { size: 12, color: dim });
    t('FREQUENCY: 7.3 GHz (DEEP SPACE RELAY)', 250, 542, { size: 12, color: dim });
    const btn = sent ? ['CALL SENT', green] : prog > 0 ? ['CANCEL CALL', red] : ['HOLD  [E]  TO DIAL', amber];
    g.strokeStyle = btn[1]; g.lineWidth = 2; g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(372, 566, 280, 52); g.strokeRect(372, 566, 280, 52);
    t(btn[0], 512, 600, { size: 22, color: btn[1], font: HEAD, align: 'center' });
    // Right: signal strength, the antenna radar, and who's being called.
    panel(766, 98, 242, 260);
    t('SIGNAL STRENGTH', 780, 122, { size: 12 });
    const pct = Math.round(sent ? 87 : prog * 87 + (prog > 0 ? 4 : 2));
    for (let i = 0; i < 14; i++) {
      const lit = i / 14 < pct / 100, bh = 8 + i * 3.2;
      g.fillStyle = lit ? amber : '#2b3133'; g.fillRect(782 + i * 15, 190 - bh, 10, bh);
    }
    t(`${pct}%`, 994, 214, { size: 18, align: 'right' });
    g.strokeStyle = 'rgba(200,210,205,0.3)'; g.lineWidth = 1;
    for (const r of [56, 36, 16]) { g.beginPath(); g.arc(887, 286, r, 0, 7); g.stroke(); }
    g.beginPath(); g.moveTo(831, 286); g.lineTo(943, 286); g.moveTo(887, 230); g.lineTo(887, 342); g.stroke();
    const sweep = -1 + prog * 4.4;
    g.strokeStyle = amber; g.beginPath(); g.moveTo(887, 286); g.lineTo(887 + Math.cos(sweep) * 54, 286 + Math.sin(sweep) * 54); g.stroke();
    t('ANTENNA AZIMUTH', 780, 352 + 22, { size: 11, color: dim }); t(`${(180 + prog * 34.6).toFixed(1)}°`, 994, 374, { size: 12, align: 'right' });
    panel(766, 392, 242, 230);
    t('CONTACT PROTOCOL', 780, 418, { size: 12 });
    ['Emergency Beacon', 'Station 9 Command', 'Corporate HQ', 'Research Network', 'Manual Frequency'].forEach((s, i) => {
      const y = 432 + i * 36;
      if (i === 0) { g.fillStyle = amber; g.fillRect(778, y, 218, 30); }
      else { g.strokeStyle = line; g.strokeRect(778, y, 218, 30); }
      t(String(i + 1), 792, y + 21, { size: 14, color: i === 0 ? '#1a1a14' : text });
      t(s, 820, y + 21, { size: 14, color: i === 0 ? '#1a1a14' : text });
    });
  });
}

// The plate on the reactor's front: worn metal, the emblem, STATION 9 RESEARCH.
export function reactorPlateTexture() {
  const rand = seeded(67);
  return makeCanvas(256, 288, (g, w, h) => {
    wornEnamel(g, w, h, rand, '#8e8b82');
    drawEmblem(g, w / 2, h * 0.38, 46, { light: '#24272a', accent: '#c8781e' });
    g.fillStyle = '#24272a'; g.textAlign = 'center';
    g.font = `600 34px ${HEAD}`; g.fillText('STATION 9', w / 2, h * 0.8);
    g.font = `12px ${HEAD}`; g.fillText('— R E S E A R C H —', w / 2, h * 0.88);
  });
}

// The generator room's switch panel: COOLANT PUMPS, FUEL FLOW, AUX POWER, with toggles (the
// lamps above each toggle are separate meshes so they can change colour).
export const SWITCH_GROUPS = [['COOLANT PUMPS', 3], ['FUEL FLOW', 3], ['AUX POWER', 1]];
export function switchPanelTexture() {
  const rand = seeded(71);
  return makeCanvas(512, 280, (g, w, h) => {
    g.fillStyle = '#4a4a46'; g.fillRect(0, 0, w, h);
    scratches(g, w, h, rand, 40, 0.2);
    let x = 10;
    for (const [label, n] of SWITCH_GROUPS) {
      const gw = n * 56 + 24;
      g.fillStyle = '#5c5c57'; g.fillRect(x, 10, gw, h - 20);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(x, 10, gw, h - 20);
      g.fillStyle = '#e9e4d6'; g.font = `500 17px ${HEAD}`; g.textAlign = 'center'; g.fillText(label, x + gw / 2, 40);
      for (let i = 0; i < n; i++) {
        const cx = x + 12 + 28 + i * 56;
        g.fillStyle = '#1b1c1c'; g.fillRect(cx - 18, 70, 36, 46); // the lamp's bezel (the lamp itself is a mesh)
        g.fillStyle = '#121313'; g.fillRect(cx - 14, 136, 28, 70); // toggle housing
        g.fillStyle = '#8a8c88'; g.fillRect(cx - 5, 148, 10, 34); // the toggle
        g.fillStyle = '#d8d4c8'; g.fillRect(cx - 12, 222, 24, 12); // label strip
      }
      x += gw + 10;
    }
    for (let i = 0; i < 200; i++) { g.fillStyle = `rgba(110,55,22,${0.3 + rand() * 0.4})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 2); }
  });
}

// Noise-maker shells (Alien Noise Makers sheet): an organic husk pocked with holes. The colour map
// is the husk; the glow map is light showing through the holes (orange for the Echo Seed, purple
// for the Buzz Pod).
export function noisemakerShell(type) {
  const rand = seeded(type === 'echo' ? 73 : 79);
  const holes = Array.from({ length: 16 }, () => [rand() * 256, 20 + rand() * 88, 8 + rand() * 16]);
  const husk = makeCanvas(256, 128, (g, w, h) => {
    const base = g.createLinearGradient(0, 0, w, h);
    if (type === 'echo') { base.addColorStop(0, '#3d4a2a'); base.addColorStop(0.5, '#4a3458'); base.addColorStop(1, '#2f4a33'); }
    else { base.addColorStop(0, '#4a4a2c'); base.addColorStop(0.6, '#3a3a24'); base.addColorStop(1, '#4b3b52'); }
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(${rand() < 0.5 ? '140,170,90' : '120,80,150'},${0.15 + rand() * 0.2})`; g.beginPath(); g.arc(rand() * w, rand() * h, 2 + rand() * 6, 0, 7); g.fill(); }
    for (const [x, y, r] of holes) {
      g.fillStyle = '#0b0a0c'; g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, 7); g.fill();
      g.strokeStyle = 'rgba(160,190,110,0.35)'; g.lineWidth = 2; g.stroke(); // a ridged rim
    }
  }, { wrap: true });
  const glow = makeCanvas(256, 128, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128);
    for (const [x, y, r] of holes) {
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      c.addColorStop(0, type === 'echo' ? 'rgba(255,170,60,1)' : 'rgba(190,90,255,1)'); c.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
  }, { wrap: true });
  return { husk, glow };
}
