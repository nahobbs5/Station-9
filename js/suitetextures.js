// Canvas textures for the wellness suites (reference files/wellness rooms.md). Like js/textures.js,
// each function returns a plain <canvas> that the renderer wraps as a texture.
import { makeCanvas, seeded, drawMascot } from './textures.js';

export const CLINIC_WHITE = '#F4F8F6';
export const VANTORA_CREAM = '#EFE6D2';
export const SOFT_TEAL = '#5FB3A8';
export const ALARM_RED = '#C8412F';
const SCRAWL = 'Caveat, "Segoe Print", "Bradley Hand", cursive';
const MARKER = '"Permanent Marker", "Marker Felt", Impact, sans-serif';
const PRINT = 'Oswald, "Arial Narrow", sans-serif';

// Quilted Clinic White padding with fabric buttons. One tile is one 1.2 m panel square.
// odd: the secret panel in the Wellness Room. A hair greyer and warmer, no buttons, and a darker
// seam round its edge: there if you look, easy to miss.
export function paddedWallTexture({ odd = false } = {}) {
  return makeCanvas(512, 512, (g, w, h) => {
    g.fillStyle = odd ? '#E9EBE6' : CLINIC_WHITE; g.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    // Each quilted diamond is a soft cushion: lighter in the middle, shaded toward the seams.
    for (let i = -1; i <= n; i++) {
      for (let j = -1; j <= n; j++) {
        const cx = (i + 0.5) * s + (j % 2 ? s / 2 : 0), cy = (j + 0.5) * s;
        const grad = g.createRadialGradient(cx, cy, 4, cx, cy, s * 0.75);
        grad.addColorStop(0, 'rgba(255,255,255,0.9)');
        grad.addColorStop(1, 'rgba(170,190,182,0.55)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(cx, cy - s / 2); g.lineTo(cx + s / 2, cy); g.lineTo(cx, cy + s / 2); g.lineTo(cx - s / 2, cy);
        g.closePath(); g.fill();
      }
    }
    // Buttons where the seams meet (the odd panel has none).
    for (let i = 0; i <= (odd ? -1 : n); i++) {
      for (let j = 0; j <= n * 2; j++) {
        const x = i * s + (j % 2 ? s / 2 : 0), y = (j * s) / 2;
        g.fillStyle = 'rgba(120,140,134,0.6)';
        g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(235,242,239,1)';
        g.beginPath(); g.arc(x - 1, y - 1, 4, 0, Math.PI * 2); g.fill();
      }
    }
    // The panel's edge seam.
    g.strokeStyle = 'rgba(140,160,152,0.7)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    if (odd) { g.fillStyle = 'rgba(214,206,190,0.12)'; g.fillRect(0, 0, w, h); }
  }, { wrap: true });
}

// Padded floor mats: 1 m squares with soft seams.
export function paddedFloorTexture() {
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#e4ebe8'; g.fillRect(0, 0, w, h);
    const grad = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
    grad.addColorStop(0, 'rgba(255,255,255,0.5)'); grad.addColorStop(1, 'rgba(150,170,162,0.35)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,140,134,0.55)'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
  }, { wrap: true });
}

// The suite ceiling between the light panels: plain Clinic White with a faint grid.
export function suiteCeilingTexture() {
  return makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = CLINIC_WHITE; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(150,165,160,0.4)'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  }, { wrap: true });
}

// A ceiling light panel: the brightest thing on the station. Cool white, never flickers.
export function ceilingPanelTexture() {
  return makeCanvas(256, 128, (g, w, h) => {
    g.fillStyle = '#c9d3d6'; g.fillRect(0, 0, w, h); // frame
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.5, '#f2faff'); grad.addColorStop(1, '#ffffff');
    g.fillStyle = grad; g.fillRect(8, 8, w - 16, h - 16);
  });
}

// The heart monitors. Every monitor in both suites shares one canvas, so they all show the same
// beat at the same instant. t: seconds. Returns the same canvas, redrawn.
const ECG_W = 256, ECG_H = 192;
let ecgCanvas = null;
function ecgAt(phase) {
  // One beat per second: flat, a small P bump, the sharp QRS spike, a T wave.
  const p = phase % 1;
  if (p > 0.1 && p < 0.18) return Math.sin(((p - 0.1) / 0.08) * Math.PI) * 0.12;
  if (p > 0.24 && p < 0.27) return -0.15;
  if (p >= 0.27 && p < 0.3) return 1;
  if (p >= 0.3 && p < 0.33) return -0.3;
  if (p > 0.45 && p < 0.6) return Math.sin(((p - 0.45) / 0.15) * Math.PI) * 0.25;
  return 0;
}
export function heartMonitorScreen(t) {
  if (!ecgCanvas) ecgCanvas = makeCanvas(ECG_W, ECG_H, () => {});
  const g = ecgCanvas.getContext('2d'), w = ECG_W, h = ECG_H;
  g.fillStyle = '#04120f'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(95,179,168,0.15)'; g.lineWidth = 1;
  for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  // The trace sweeps left to right over 2 seconds; the newest part is brightest.
  const sweep = 2, mid = h * 0.45, amp = h * 0.28;
  const head = ((t % sweep) / sweep) * w;
  g.lineWidth = 2.5;
  for (let x = 1; x < w; x++) {
    const age = (head - x + w) % w;
    if (age > w * 0.85) continue; // the gap ahead of the sweep
    const secs = t - (age / w) * sweep;
    const secsPrev = secs - sweep / w;
    g.strokeStyle = `rgba(110,255,170,${1 - age / w})`;
    g.beginPath();
    g.moveTo(x - 1, mid - ecgAt(secsPrev) * amp);
    g.lineTo(x, mid - ecgAt(secs) * amp);
    g.stroke();
  }
  g.fillStyle = '#6effaa';
  g.font = `bold 20px ${PRINT}`;
  g.textAlign = 'right';
  g.fillText('60', w - 10, 26);
  g.font = `11px ${PRINT}`;
  g.fillText('BPM', w - 10, 40);
  g.textAlign = 'center';
  g.fillStyle = '#bff5dc';
  g.font = `14px ${PRINT}`;
  g.fillText('Your vitals look perfect.', w / 2, h - 14);
  return ecgCanvas;
}

// The feedback kiosk's face: five smiley buttons, all with exactly the same smile.
export function kioskTexture() {
  return makeCanvas(256, 512, (g, w, h) => {
    g.fillStyle = VANTORA_CREAM; g.fillRect(0, 0, w, h);
    g.fillStyle = '#0f4c4a'; g.fillRect(0, 0, w, 70);
    g.fillStyle = VANTORA_CREAM;
    g.font = `bold 20px ${PRINT}`; g.textAlign = 'center';
    g.fillText('HOW ARE YOU', w / 2, 32);
    g.fillText('FEELING TODAY?', w / 2, 58);
    for (let i = 0; i < 5; i++) {
      const cy = 120 + i * 72, cx = w / 2;
      g.fillStyle = SOFT_TEAL;
      g.beginPath(); g.arc(cx, cy, 28, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0f2e2b';
      g.beginPath(); g.arc(cx - 9, cy - 6, 3.5, 0, Math.PI * 2); g.arc(cx + 9, cy - 6, 3.5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#0f2e2b'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy + 2, 13, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }
    drawMascot(g, w / 2, h - 30, 14);
  });
}

// A clipboard of daily wellness forms. "Free" is always circled, in a different hand each time.
export function wellnessFormTexture(seed = 1) {
  const rand = seeded(seed * 97 + 13);
  return makeCanvas(192, 256, (g, w, h) => {
    g.fillStyle = '#8a6a44'; g.fillRect(0, 0, w, h); // the clipboard
    g.fillStyle = '#fbfaf5'; g.fillRect(12, 22, w - 24, h - 34);
    g.fillStyle = '#9aa3a6'; g.fillRect(w / 2 - 30, 8, 60, 22); // the clip
    g.fillStyle = '#1c2a2a'; g.textAlign = 'left';
    g.font = `bold 15px ${PRINT}`; g.fillText('Daily Wellness Check', 22, 52);
    g.font = `12px ${PRINT}`; g.fillText('Today I feel:', 22, 80);
    const opts = ['Fine', 'Good', 'Free'];
    opts.forEach((o, i) => g.fillText(o, 40, 108 + i * 28));
    g.fillText('Please circle one.', 22, 200);
    // The circle, in someone's hand: a slightly different loop each time.
    g.strokeStyle = ['#1f3a8a', '#2b2620', '#5a2a6a'][Math.floor(rand() * 3)];
    g.lineWidth = 1.5 + rand() * 1.5;
    g.beginPath();
    g.ellipse(52 + rand() * 4, 160 + rand() * 3, 22 + rand() * 5, 12 + rand() * 4, (rand() - 0.5) * 0.3, 0.2, Math.PI * 2.1);
    g.stroke();
    g.font = `16px ${SCRAWL}`; g.fillStyle = g.strokeStyle;
    g.fillText(['M.', 'L.H.', 'Sam', 'P.R.', 'J.'][Math.floor(rand() * 5)], 120, 236);
  });
}

// The writing on Suite B's west wall, after 'reference files/Station 9_ Labor Is Freedom.png': dark
// red ALL CAPS on a transparent canvas. The canvas maps to the wall from 0.3 m (bottom) to 2.4 m
// (top) and 4.2 m across. Neat rows of the slogan at the top fall apart on the way down, ending in
// one huge FREEDOM... Drips, splatter and scratches all over. Draw after the marker font has loaded.
export const GRAFFITI = { w: 2048, h: 1024, bottom: 0.3, top: 2.4, width: 4.2 };
const INKS = ['#7e1a14', '#8a1f17', '#6e1510', '#93241a'];

// Shared by the wall and the notebook. Writes `text` at (x, y) and returns its width; drips run
// down from random points under the letters when `drips` > 0 (a chance per 100 px of text).
function scrawl(g, rand, text, x, y, size, { tilt = 0, ink = INKS[0], alpha = 1, drips = 0, dripLen = 60 } = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.globalAlpha = alpha;
  g.font = `400 ${size}px ${MARKER}`;
  g.fillStyle = ink; g.strokeStyle = ink;
  g.fillText(text, 0, 0);
  g.globalAlpha = alpha * 0.35;
  g.fillText(text, size * 0.03, size * 0.04);
  g.globalAlpha = alpha;
  const width = g.measureText(text).width;
  g.lineCap = 'round';
  for (let k = 0; k < (width / 100) * drips; k++) {
    if (rand() > 0.6) continue;
    const dx = rand() * width, dy = -rand() * size * 0.25, len = 8 + rand() * dripLen;
    g.lineWidth = 1.5 + rand() * 2.5;
    g.beginPath(); g.moveTo(dx, dy); g.lineTo(dx + (rand() - 0.5) * 3, dy + len); g.stroke();
    g.beginPath(); g.arc(dx, dy + len, g.lineWidth * 0.9, 0, Math.PI * 2); g.fill();
  }
  g.restore();
  return width;
}

// Thin scratches and flecks of spatter across an area.
function scratches(g, rand, n, { x0, y0, x1, y1 }, ink = INKS[0]) {
  g.save();
  g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
    const a = -0.4 - rand() * 1.2 + (rand() < 0.3 ? Math.PI / 2 : 0), len = 30 + rand() * 260;
    g.globalAlpha = 0.25 + rand() * 0.45;
    g.lineWidth = 0.8 + rand() * 2;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 20, y + Math.sin(a) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  for (let k = 0; k < n * 1.5; k++) { // spatter: small flecks in loose clusters
    const cx = x0 + rand() * (x1 - x0), cy = y0 + rand() * (y1 - y0);
    for (let j = 0; j < 3 + rand() * 6; j++) {
      g.globalAlpha = 0.4 + rand() * 0.5;
      g.beginPath(); g.arc(cx + (rand() - 0.5) * 40, cy + (rand() - 0.5) * 40, 0.8 + rand() * 2.6, 0, Math.PI * 2); g.fill();
    }
  }
  g.restore();
}

export function graffitiTexture() {
  const rand = seeded(1127);
  const { w, h, bottom, top } = GRAFFITI;
  const yAt = (m) => ((top - m) / (top - bottom)) * h; // height on the wall (m) -> canvas y
  const ink = () => INKS[Math.floor(rand() * INKS.length)];
  return makeCanvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textBaseline = 'alphabetic';
    // Struck through so hard the marker tore the padding: heavy jagged lines with dark gouges.
    const strike = (x, y, len) => {
      g.save();
      g.strokeStyle = INKS[2]; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 1; k <= 8; k++) g.lineTo(x + (len * k) / 8, y + (rand() - 0.5) * 10);
      g.stroke();
      g.strokeStyle = 'rgba(40,12,10,0.85)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + len * 0.3, y + 2); g.lineTo(x + len * 0.55, y - 3); g.stroke();
      g.restore();
    };
    const left = w * 0.12; // the block sits left of centre; the small line goes to its right

    // Scratches first, so the writing sits on top of them.
    scratches(g, rand, 150, { x0: 0, y0: yAt(2.38), x1: w, y1: yAt(0.32) });

    // Top (2.3-1.54 m): YOUR LABOR IS OUR FREEDOM, one per row, steady at first, then less so.
    for (let row = 0; row < 9; row++) {
      const y = yAt(2.3 - row * 0.095);
      scrawl(g, rand, 'YOUR LABOR IS OUR FREEDOM', left + (rand() - 0.5) * 30 + row * 10, y, 46 + row * 1.5,
        { tilt: -0.03 + (rand() - 0.5) * (0.005 + row * 0.004), ink: ink(), drips: 0.6 + row * 0.15, dripLen: 40 + row * 10 });
    }
    // Middle (1.45-1.15 m): the slogan loses words; each row a little further in, some crossed out.
    for (let row = 0; row < 3; row++) {
      const x = left + 260 + row * 110, y = yAt(1.43 - row * 0.12), size = 70 + row * 6;
      const width = scrawl(g, rand, 'LABOR IS FREEDOM.', x, y, size, { tilt: -0.03 + (rand() - 0.5) * 0.05, ink: ink(), drips: 1.4, dripLen: 90 });
      if (row !== 1) strike(x - 8, y - size * 0.32, width + 16);
    }
    // Bottom (1.05-0.35 m): FREEDOM, smeared over itself, then one huge FREEDOM...
    scrawl(g, rand, 'FREEDOM.', left + 600, yAt(1.02), 96, { tilt: -0.02, ink: INKS[0], drips: 1.8, dripLen: 110 });
    scrawl(g, rand, 'FREEDOM', left + 680, yAt(0.86), 62, { tilt: 0.03, ink: INKS[2], alpha: 0.45, drips: 1, dripLen: 50 });
    scrawl(g, rand, 'FREEDOM', left + 662, yAt(0.84), 60, { tilt: 0.01, ink: INKS[1], alpha: 0.35 });
    scrawl(g, rand, 'FREEDOM...', left + 640, yAt(0.48), 150, { tilt: -0.04, ink: INKS[0], drips: 2, dripLen: 130 });

    // One small line at the seated eye level (about 1.15 m), off to the right of the block.
    scrawl(g, rand, "SHE ISN'T THE ONLY ONE LISTENING.", w * 0.7, yAt(1.15), 30, { tilt: 0.01, ink: INKS[2], drips: 0.4, dripLen: 25 });

    // A smear from a left hand, low on the left: a palm and four dragged fingers.
    g.save();
    g.fillStyle = INKS[1]; g.strokeStyle = INKS[1];
    g.globalAlpha = 0.6;
    const sx = 240, sy = yAt(1.25);
    g.beginPath(); g.ellipse(sx, sy, 34, 44, -0.3, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 4; k++) {
      g.lineWidth = 14 - k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx + 20 - k * 16, sy - 36); g.lineTo(sx + 34 - k * 22, sy - 110 - k * 6); g.stroke();
    }
    g.lineWidth = 16;
    g.beginPath(); g.moveTo(sx + 32, sy - 6); g.lineTo(sx + 84, sy - 40); g.stroke(); // the thumb: on the right, so a left hand
    g.globalAlpha = 0.35;
    g.lineWidth = 46;
    g.beginPath(); g.moveTo(sx, sy + 30); g.lineTo(sx - 20, sy + 190); g.stroke(); // dragged down
    g.restore();
  });
}

// The notebook left on the floor: lined paper, spiral holes, the same breakdown in smaller writing.
// 0.21 x 0.28 m, seen from above. Draw after the marker font has loaded.
export function notebookTexture() {
  const rand = seeded(733);
  return makeCanvas(384, 512, (g, w, h) => {
    g.fillStyle = '#ece4d0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(90,120,150,0.35)'; g.lineWidth = 1;
    for (let y = 70; y < h - 10; y += 30) { g.beginPath(); g.moveTo(40, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(190,80,80,0.5)'; g.beginPath(); g.moveTo(58, 0); g.lineTo(58, h); g.stroke();
    g.fillStyle = '#2a2826'; // spiral holes
    for (let y = 18; y < h; y += 26) { g.beginPath(); g.arc(18, y, 5, 0, Math.PI * 2); g.fill(); }
    const lines = ['YOUR LABOR IS OUR FREEDOM', 'YOUR LABOR IS OUR FREEDOM', 'YOUR LABOR IS OUR FREEDOM', 'YOUR LABOR IS OUR FREEDOM',
      'YOUR LABOR IS OUR FREEDOM', 'YOUR LABOR IS OUR FREEDM', 'YOUR LABOR IS FREEDOM', 'LABOR IS FREEDOM.', 'LA IS FREEDOM.', 'FREEDOM.', 'FREEDOM...'];
    lines.forEach((text, i) => {
      const size = i < 7 ? 21 : 23 + (i - 7) * 3;
      scrawl(g, rand, text, 64 + Math.max(0, i - 6) * 16 + (rand() - 0.5) * 6, 66 + i * 30, size,
        { tilt: -0.02 + (rand() - 0.5) * (0.02 + i * 0.006), ink: INKS[i % 2 ? 0 : 2], drips: i > 6 ? 0.8 : 0.15, dripLen: 14 });
    });
    scratches(g, rand, 10, { x0: 60, y0: 40, x1: w, y1: h });
  });
}

// The Quiet Room's pillow: Clinic White with a few dark red smears, kept small.
export function bloodyPillowTexture() {
  const rand = seeded(419);
  return makeCanvas(256, 128, (g, w, h) => {
    g.fillStyle = '#f3f4f1'; g.fillRect(0, 0, w, h);
    g.fillStyle = INKS[0]; g.strokeStyle = INKS[0]; g.lineCap = 'round';
    for (let k = 0; k < 6; k++) { // smears, mostly toward one side
      const x = w * (0.45 + rand() * 0.35), y = h * (0.25 + rand() * 0.5);
      g.globalAlpha = 0.5 + rand() * 0.35;
      g.lineWidth = 6 + rand() * 9;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rand() - 0.5) * 60, y + (rand() - 0.5) * 34); g.stroke();
    }
    for (let k = 0; k < 30; k++) { // flecks
      g.globalAlpha = 0.4 + rand() * 0.5;
      g.beginPath(); g.arc(w * (0.35 + rand() * 0.5), h * (0.15 + rand() * 0.7), 0.6 + rand() * 1.8, 0, Math.PI * 2); g.fill();
    }
  });
}

// The marker with a star badge, left on the floor by the wall.
export function markerTexture() {
  return makeCanvas(128, 32, (g, w, h) => {
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, w, h);
    g.fillStyle = ALARM_RED; g.fillRect(w - 26, 0, 26, h);
    g.fillStyle = '#f2a92e';
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 5 : 11;
      g.lineTo(44 + Math.cos(a) * r, h / 2 + Math.sin(a) * r);
    }
    g.closePath(); g.fill();
  });
}
