// Canvas textures for the vents (reference files/Vents & Gratings.md). Like js/textures.js, each
// returns a plain <canvas>; js/babylon/vents.js wraps them as textures.
import { makeCanvas, seeded } from './textures.js';

const CREAM = '#EFE6D2';
const DUST_GREY = '#9A9A8E';

// A wall vent's cover: Vantora Cream paint, chipped, four big screws, and slats you can see through
// (transparent gaps), so the room shows in stripes from inside and the dark shows from outside.
export function coverTexture() {
  const rand = seeded(907);
  return makeCanvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = CREAM;
    g.fillRect(0, 0, w, 22); g.fillRect(0, h - 22, w, 22); g.fillRect(0, 0, 22, h); g.fillRect(w - 22, 0, 22, h); // frame
    // Slats: angled louvres with a shadowed underside, gaps between.
    for (let y = 30; y < h - 30; y += 20) {
      g.fillStyle = CREAM; g.fillRect(22, y, w - 44, 10);
      g.fillStyle = 'rgba(90,80,64,0.55)'; g.fillRect(22, y + 10, w - 44, 3);
    }
    // Chipped paint: grey metal showing through.
    for (let i = 0; i < 26; i++) {
      g.fillStyle = `rgba(120,118,110,${0.4 + rand() * 0.5})`;
      const x = rand() * w, y = rand() * h, r = 2 + rand() * 6;
      g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rand()), rand() * 3, 0, Math.PI * 2); g.fill();
    }
    // Grime toward the bottom.
    const grime = g.createLinearGradient(0, h * 0.5, 0, h);
    grime.addColorStop(0, 'rgba(40,32,20,0)'); grime.addColorStop(1, 'rgba(40,32,20,0.35)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = grime; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    // Four big screws.
    for (const [x, y] of [[11, 11], [w - 11, 11], [11, h - 11], [w - 11, h - 11]]) {
      g.fillStyle = '#6b6a63'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a3934'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 4, y - 3); g.lineTo(x + 4, y + 3); g.stroke();
    }
  });
}

// A floor grating: a heavy steel grid with open squares.
export function gratingTexture() {
  return makeCanvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#4d4f4c';
    g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    for (let x = 14; x < w - 14; x += 26) g.fillRect(x, 0, 7, h); // bearing bars
    for (let y = 14; y < h - 14; y += 52) g.fillRect(0, y, w, 5); // cross bars
    g.fillStyle = 'rgba(255,255,255,0.08)';
    for (let x = 14; x < w - 14; x += 26) g.fillRect(x, 0, 2, h);
  });
}

// The inside of a duct: dull Dust Grey sheet metal, with a seam at each end of the tile (one tile is
// 1.5 m along the duct) and a few dents and scuffs.
export function ductTexture() {
  const rand = seeded(1501);
  return makeCanvas(256, 128, (g, w, h) => {
    g.fillStyle = DUST_GREY; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(${rand() < 0.5 ? '60,58,50' : '200,200,190'},${0.05 + rand() * 0.08})`;
      g.fillRect(rand() * w, rand() * h, 4 + rand() * 30, 1 + rand() * 3);
    }
    g.fillStyle = 'rgba(40,40,34,0.6)'; g.fillRect(0, 0, 5, h); // the seam
    g.fillStyle = 'rgba(220,220,210,0.25)'; g.fillRect(5, 0, 2, h);
    for (let y = 10; y < h; y += 28) { g.fillStyle = '#5f5f56'; g.beginPath(); g.arc(14, y, 2.5, 0, Math.PI * 2); g.fill(); } // rivets
  }, { wrap: true });
}

// Wes's card, taped inside V3.
export function wesCardTexture(text) {
  return makeCanvas(256, 160, (g, w, h) => {
    g.fillStyle = '#f3efe2'; g.fillRect(10, 14, w - 20, h - 24);
    g.fillStyle = 'rgba(230,220,170,0.75)'; g.fillRect(w / 2 - 40, 4, 80, 22); // tape
    g.strokeStyle = 'rgba(150,170,190,0.5)'; g.lineWidth = 1;
    for (let y = 52; y < h - 12; y += 22) { g.beginPath(); g.moveTo(16, y); g.lineTo(w - 16, y); g.stroke(); }
    g.fillStyle = '#1f2a3a';
    g.font = '19px Caveat, "Segoe Print", cursive';
    text.split('\n').forEach((line, i) => g.fillText(line, 20, 46 + i * 24));
  });
}
