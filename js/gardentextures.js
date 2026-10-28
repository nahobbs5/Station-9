// Canvas textures for the plant life (after the "Botanical Haven" sheet): leaf cards cut out of
// transparent canvases, the tomato chamber's status screen, the seedling bench's tablet and pegboard.
// Each function returns a plain <canvas>; js/babylon/util.js toTexture wraps it.
import { makeCanvas, seeded, drawEmblem } from './textures.js';

const MONO = '"Share Tech Mono", ui-monospace, monospace';
const HEAD = 'Oswald, "Arial Narrow", sans-serif';

// Leaf colours: [base, tip, vein]. dry: yellowing and brown, for the dying plants.
const GREENS = {
  lettuce: ['#3f7a2c', '#8fc251', 'rgba(220,240,180,0.55)'],
  red: ['#4a1a22', '#a8333f', 'rgba(240,170,170,0.4)'],
  dry: ['#6a5a24', '#a88a3a', 'rgba(60,40,10,0.45)'],
  vine: ['#3f7a2e', '#7cb84a', 'rgba(210,240,170,0.45)'],
  vineDry: ['#5c5222', '#a58c3c', 'rgba(60,40,10,0.45)'],
  tomato: ['#2e5a24', '#5a8f34', 'rgba(200,230,160,0.45)'],
};

// One leaf from (x, y), pointing along `angle` (0 = up), with a midrib.
function leaf(g, x, y, len, wid, angle, [base, tip, vein], frill = 0) {
  g.save();
  g.translate(x, y); g.rotate(angle);
  const grad = g.createLinearGradient(0, 0, 0, -len);
  grad.addColorStop(0, base); grad.addColorStop(1, tip);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, 0);
  if (frill) {
    // A ruffled edge (lettuce): small bumps up each side.
    const n = 7;
    for (let i = 1; i <= n; i++) { const t = i / n; const w = wid * Math.sin(t * Math.PI) * (1 + (i % 2) * frill); g.lineTo(-w, -len * t); }
    for (let i = n; i >= 0; i--) { const t = i / n; const w = wid * Math.sin(t * Math.PI) * (1 + ((i + 1) % 2) * frill); g.lineTo(w, -len * t); }
  } else {
    g.bezierCurveTo(-wid * 1.2, -len * 0.35, -wid * 0.5, -len * 0.85, 0, -len);
    g.bezierCurveTo(wid * 0.5, -len * 0.85, wid * 1.2, -len * 0.35, 0, 0);
  }
  g.fill();
  g.strokeStyle = vein; g.lineWidth = Math.max(1, wid * 0.08);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.9); g.stroke();
  g.restore();
}

// A head of leafy greens seen from the side, fanning up from the bottom middle.
// kind: 'lettuce', 'red' or 'dry' (wilted: leaves flop outward and brown).
export function greensTexture(kind = 'lettuce') {
  const rand = seeded(kind === 'red' ? 41 : kind === 'dry' ? 43 : 47);
  const droop = kind === 'dry' ? 0.6 : 0;
  return makeCanvas(128, 128, (g, w, h) => {
    for (let i = 0; i < 14; i++) {
      const a = (rand() - 0.5) * (2.2 + droop * 1.4);
      const colors = kind === 'dry' && rand() < 0.3 ? GREENS.lettuce : GREENS[kind];
      leaf(g, w / 2 + (rand() - 0.5) * 18, h - 2, 52 + rand() * 50 - droop * 25, 16 + rand() * 10, a, colors, kind === 'red' ? 0.12 : 0.22);
    }
  });
}

// A tomato plant's leafy stem: a stalk up the middle with compound leaves either side.
export function tomatoLeafTexture() {
  const rand = seeded(59);
  return makeCanvas(128, 256, (g, w, h) => {
    g.strokeStyle = '#4c6e2a'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(w / 2, h); g.bezierCurveTo(w * 0.45, h * 0.6, w * 0.56, h * 0.3, w / 2, 4); g.stroke();
    for (let y = h - 30; y > 20; y -= 34) {
      for (const side of [-1, 1]) {
        const a = side * (0.9 + rand() * 0.4);
        const sx = w / 2, sy = y + side * 8;
        // A leaflet stalk with three leaflets.
        g.save(); g.translate(sx, sy); g.rotate(a);
        g.strokeStyle = '#4c6e2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -44); g.stroke();
        leaf(g, 0, -40, 22, 9, 0, GREENS.tomato);
        leaf(g, 0, -24, 18, 7, -0.9, GREENS.tomato);
        leaf(g, 0, -24, 18, 7, 0.9, GREENS.tomato);
        g.restore();
      }
    }
  });
}

// A trailing vine that tiles top to bottom: a wavy stem with leaves either side. dry: yellowing.
export function vineTexture(dry = false) {
  const rand = seeded(dry ? 67 : 61);
  return makeCanvas(64, 128, (g, w, h) => {
    const x = (t) => w / 2 + Math.sin(t * Math.PI * 2) * 7; // same at the top and bottom, so it tiles
    g.strokeStyle = dry ? '#5a4a22' : '#3a5a24'; g.lineWidth = 2.5;
    g.beginPath();
    for (let i = 0; i <= 20; i++) { const t = i / 20; i ? g.lineTo(x(t), t * h) : g.moveTo(x(t), 0); }
    g.stroke();
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9, side = i % 2 ? 1 : -1;
      const colors = dry ? (rand() < 0.3 ? GREENS.vine : GREENS.vineDry) : (rand() < 0.06 ? GREENS.vineDry : GREENS.vine);
      leaf(g, x(t), t * h, 19 + rand() * 8, 8 + rand() * 3, side * (1.5 + rand() * 0.6), colors);
    }
  });
}

// The tomato chamber's status screen (from the sheet): readings and a line drawing of the plant.
// Nutrition is running low: the station's dying, and the plants with it.
export function growChamberScreen() {
  return makeCanvas(320, 400, (g, w, h) => {
    const teal = '#bfe8dc', dim = '#6f9890', amber = '#f0a040';
    g.fillStyle = '#0c1314'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(191,232,220,0.25)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = teal; g.font = `600 26px ${HEAD}`; g.textBaseline = 'alphabetic';
    g.fillText('CHAMBER 3', 24, 46);
    g.font = `600 20px ${HEAD}`; g.fillStyle = '#e6f4ef'; g.fillText('TOMATO', 24, 74);
    g.fillStyle = 'rgba(191,232,220,0.2)'; g.fillRect(20, 88, w - 40, 1);
    const rows = [['TEMP', '22.1°C', teal], ['HUMIDITY', '68%', teal], ['CO₂', '850 ppm', teal], ['LIGHT', '100%', teal], ['NUTRITION', 'LOW', amber]];
    g.font = `15px ${MONO}`;
    rows.forEach(([k, v, c], i) => {
      const y = 120 + i * 30;
      g.fillStyle = dim; g.fillText(k, 24, y);
      g.fillStyle = c; g.fillText(v, 112, y);
      g.fillStyle = 'rgba(191,232,220,0.12)'; g.fillRect(20, y + 9, 168, 1);
    });
    // The plant drawing on the right.
    g.strokeStyle = 'rgba(191,232,220,0.35)'; g.strokeRect(200, 100, 100, 160);
    g.strokeStyle = teal; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(250, 252); g.lineTo(250, 112); g.stroke();
    for (let y = 230; y > 120; y -= 26) {
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(250, y); g.quadraticCurveTo(250 + s * 16, y - 10, 250 + s * 34, y - 4); g.stroke();
        g.beginPath(); g.ellipse(250 + s * 30, y - 6, 9, 4, s * 0.3, 0, Math.PI * 2); g.stroke();
      }
    }
    g.beginPath(); g.moveTo(232, 252); g.lineTo(268, 252); g.stroke();
    // A warning bar along the bottom.
    g.fillStyle = 'rgba(240,160,64,0.16)'; g.fillRect(20, 300, w - 40, 64);
    g.strokeStyle = amber; g.lineWidth = 2; g.strokeRect(20, 300, w - 40, 64);
    g.fillStyle = amber; g.font = `600 17px ${HEAD}`; g.fillText('NUTRIENT FEED LOW', 36, 328);
    g.font = `13px ${MONO}`; g.fillText('REFILL RESERVOIR B', 36, 350);
  });
}

// The seedling bench's tablet: a leaf scan, two specimens side by side.
export function leafScanScreen() {
  return makeCanvas(256, 176, (g, w, h) => {
    const teal = '#9fe4d6';
    g.fillStyle = '#0d1617'; g.fillRect(0, 0, w, h);
    g.fillStyle = teal; g.font = `12px ${MONO}`; g.fillText('SPECIMEN SCAN · PROPAGATION', 12, 20);
    g.fillStyle = 'rgba(159,228,214,0.2)'; g.fillRect(10, 28, w - 20, 1);
    for (const [cx, n] of [[70, 5], [180, 7]]) {
      g.strokeStyle = 'rgba(159,228,214,0.3)'; g.strokeRect(cx - 50, 38, 100, 112);
      g.strokeStyle = teal; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(cx, 146); g.lineTo(cx, 60); g.stroke();
      for (let i = 0; i < n; i++) {
        const a = -1.2 + (i / (n - 1)) * 2.4;
        g.save(); g.translate(cx, 120); g.rotate(a);
        g.beginPath(); g.ellipse(0, -34, 9, 30, 0, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -62); g.stroke();
        g.restore();
      }
    }
    g.fillStyle = '#6f9890'; g.font = `11px ${MONO}`; g.fillText('GROWTH  +2.4%     HEALTH  71%', 14, h - 10);
  });
}

// The pegboard behind the seedling bench: cream board, a grid of holes, a few hand tools.
export function pegboardTexture() {
  const rand = seeded(71);
  return makeCanvas(256, 128, (g, w, h) => {
    g.fillStyle = '#d9d0bc'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(30,24,16,0.55)';
    for (let y = 8; y < h; y += 12) for (let x = 8; x < w; x += 12) { g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(60,45,25,${0.04 + rand() * 0.08})`; g.beginPath(); g.arc(rand() * w, rand() * h, 6 + rand() * 18, 0, Math.PI * 2); g.fill(); }
    // Tools as dark silhouettes with a little shine: trowel, fork, shears, a coil of twine.
    const tool = (x, draw) => { g.save(); g.translate(x, 18); g.fillStyle = '#3b3a37'; draw(); g.restore(); };
    tool(36, () => { g.fillRect(-3, 0, 6, 34); g.beginPath(); g.moveTo(-12, 34); g.lineTo(12, 34); g.lineTo(0, 82); g.closePath(); g.fill(); });
    tool(84, () => { g.fillRect(-3, 0, 6, 46); for (const dx of [-9, -3, 3, 9]) g.fillRect(dx - 1.5, 46, 3, 36); g.fillRect(-10, 44, 20, 4); });
    tool(132, () => { g.save(); g.rotate(0.15); g.fillRect(-2, 0, 4, 80); g.restore(); g.save(); g.rotate(-0.15); g.fillRect(-2, 0, 4, 80); g.restore(); g.fillStyle = '#b04a2a'; g.fillRect(-12, 50, 8, 30); g.fillRect(4, 50, 8, 30); });
    tool(190, () => { g.strokeStyle = '#a88a52'; g.lineWidth = 5; g.beginPath(); g.arc(0, 30, 18, 0, Math.PI * 2); g.stroke(); g.fillRect(-1.5, -6, 3, 18); });
    drawEmblem(g, 232, 104, 12, { light: '#3b3a37', accent: '#e8912a' });
  });
}

// Root bark: dark brown with long fibres running the length of the root (along u), a little
// moss green in the cracks. Tiles both ways.
export function barkTexture() {
  const rand = seeded(83);
  return makeCanvas(256, 64, (g, w, h) => {
    g.fillStyle = '#3a2618'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const y = rand() * h, x = rand() * w, len = 40 + rand() * 160;
      g.strokeStyle = rand() < 0.5 ? `rgba(110,78,48,${0.3 + rand() * 0.4})` : `rgba(15,9,5,${0.4 + rand() * 0.4})`;
      g.lineWidth = 1 + rand() * 2.5;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + len * 0.3, y + (rand() - 0.5) * 6, x + len * 0.7, y + (rand() - 0.5) * 6, x + len, y + (rand() - 0.5) * 4);
      g.stroke();
      // Wrap round so it tiles along the root.
      if (x + len > w) { g.save(); g.translate(-w, 0); g.stroke(); g.restore(); }
    }
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(70,90,40,${0.15 + rand() * 0.2})`; g.beginPath(); g.ellipse(rand() * w, rand() * h, 6 + rand() * 14, 2 + rand() * 3, 0, 0, Math.PI * 2); g.fill(); }
  }, { wrap: true });
}

// One broad leaf on its stalk (anthurium / philodendron), base at the bottom middle. dry: brown, curled edges.
export function bigLeafTexture(dry = false) {
  const rand = seeded(dry ? 89 : 97);
  return makeCanvas(128, 160, (g, w, h) => {
    const colors = dry ? ['#5e4a1e', '#9a7a36', 'rgba(50,30,8,0.5)'] : ['#18321a', '#3a6a2a', 'rgba(170,205,130,0.4)'];
    g.strokeStyle = dry ? '#5a4420' : '#3c5a22'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, h * 0.72); g.stroke(); // the stalk
    g.save(); g.translate(w / 2, h * 0.74);
    const grad = g.createLinearGradient(0, 0, 0, -h * 0.72);
    grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1]);
    g.fillStyle = grad;
    const L = h * 0.7, W = w * 0.42 * (dry ? 0.8 : 1);
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-W * 1.15, -L * 0.05, -W * 1.0, -L * 0.75, 0, -L);
    g.bezierCurveTo(W * 1.0, -L * 0.75, W * 1.15, -L * 0.05, 0, 0);
    g.fill();
    // Veins: a midrib and curving side veins.
    g.strokeStyle = colors[2]; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -L * 0.95); g.stroke();
    g.lineWidth = 1.2;
    for (let i = 1; i < 7; i++) {
      const y = -L * i / 7.5;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(0, y); g.quadraticCurveTo(s * W * 0.5, y - L * 0.04, s * W * 0.85 * Math.sin((i / 7) * Math.PI), y - L * 0.12); g.stroke(); }
    }
    if (dry) for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(40,25,8,0.5)'; g.beginPath(); g.arc((rand() - 0.5) * W * 1.4, -rand() * L, 3 + rand() * 6, 0, Math.PI * 2); g.fill(); }
    g.restore();
  });
}
