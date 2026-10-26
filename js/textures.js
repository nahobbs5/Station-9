// Canvas-drawn textures for the station, shared by both renderers (three.js and Babylon.js).
// Each function returns a plain <canvas>; the engine wraps it as a texture.
import { TILE } from './layout.js';

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
      // A panel pried open: exposed wiring.
      const ox = 40 + rand() * 120, oy = h * 0.66;
      g.fillStyle = '#0c0d0e'; g.fillRect(ox, oy, 70, 40);
      for (const [c, k] of [['#b33', 0], ['#cc3', 1], ['#36c', 2], ['#2a2', 3]]) {
        g.strokeStyle = c; g.lineWidth = 2;
        g.beginPath(); g.moveTo(ox + 8 + k * 14, oy + 2); g.bezierCurveTo(ox + 20 + k * 6, oy + 30, ox + 50 - k * 4, oy + 10, ox + 62 - k * 8, oy + 38); g.stroke();
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
    const s = 15, ox = (w - layout.w * s) / 2, oy = 60;
    for (let z = 0; z < layout.h; z++) {
      for (let x = 0; x < layout.w; x++) {
        if (!layout.isFloor(x, z)) continue;
        g.fillStyle = layout.isDoor(x, z) ? '#d8c27a' : layout.isSafe(x, z) ? '#2f8f86' : layout.isCorridor(x, z) ? '#53716a' : '#355048';
        g.fillRect(ox + x * s, oy + z * s, s - 1, s - 1);
      }
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

export function screenTexture() {
  return canvasTexture(256, 192, (g, w, h) => {
    g.fillStyle = '#0d2b2a'; g.fillRect(0, 0, w, h);
    drawMascot(g, 60, 90, 34);
    g.fillStyle = '#8fe0cf';
    g.font = '15px monospace';
    ['Welcome,', 'Technician!', 'Closer', 'every day.'].forEach((t, i) => g.fillText(t, 110, 62 + i * 20));
    g.fillStyle = 'rgba(143,224,207,0.08)';
    for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 2);
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

