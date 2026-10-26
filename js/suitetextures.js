// Canvas textures for the wellness suites (reference files/wellness rooms.md). Like js/textures.js,
// each function returns a plain <canvas> that the renderer wraps as a texture.
import { makeCanvas, seeded, drawMascot } from './textures.js';

export const CLINIC_WHITE = '#F4F8F6';
export const VANTORA_CREAM = '#EFE6D2';
export const SOFT_TEAL = '#5FB3A8';
export const ALARM_RED = '#C8412F';
const SCRAWL = 'Caveat, "Segoe Print", "Bradley Hand", cursive';
const PRINT = 'Oswald, "Arial Narrow", sans-serif';

// Quilted Clinic White padding with fabric buttons. One tile is one 1.2 m panel square.
export function paddedWallTexture() {
  return makeCanvas(512, 512, (g, w, h) => {
    g.fillStyle = CLINIC_WHITE; g.fillRect(0, 0, w, h);
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
    // Buttons where the seams meet.
    for (let i = 0; i <= n; i++) {
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

// A clipboard of daily wellness forms. "Closer" is always circled, in a different hand each time.
export function wellnessFormTexture(seed = 1) {
  const rand = seeded(seed * 97 + 13);
  return makeCanvas(192, 256, (g, w, h) => {
    g.fillStyle = '#8a6a44'; g.fillRect(0, 0, w, h); // the clipboard
    g.fillStyle = '#fbfaf5'; g.fillRect(12, 22, w - 24, h - 34);
    g.fillStyle = '#9aa3a6'; g.fillRect(w / 2 - 30, 8, 60, 22); // the clip
    g.fillStyle = '#1c2a2a'; g.textAlign = 'left';
    g.font = `bold 15px ${PRINT}`; g.fillText('Daily Wellness Check', 22, 52);
    g.font = `12px ${PRINT}`; g.fillText('Today I feel:', 22, 80);
    const opts = ['Fine', 'Good', 'Closer'];
    opts.forEach((o, i) => g.fillText(o, 40, 108 + i * 28));
    g.fillText('Please circle one.', 22, 200);
    // The circle, in someone's hand: a slightly different loop each time.
    g.strokeStyle = ['#1f3a8a', '#2b2620', '#5a2a6a'][Math.floor(rand() * 3)];
    g.lineWidth = 1.5 + rand() * 1.5;
    g.beginPath();
    g.ellipse(58 + rand() * 4, 160 + rand() * 3, 30 + rand() * 6, 12 + rand() * 4, (rand() - 0.5) * 0.3, 0.2, Math.PI * 2.1);
    g.stroke();
    g.font = `16px ${SCRAWL}`; g.fillStyle = g.strokeStyle;
    g.fillText(['M.', 'L.H.', 'Sam', 'P.R.', 'J.'][Math.floor(rand() * 5)], 120, 236);
  });
}

// The graffiti on Suite B's west wall, in Alarm Red marker on a transparent canvas. The canvas maps
// to the wall from 0.3 m (bottom) to 2.4 m (top) and 4.2 m across. It starts calm and neat at the
// bottom and gets worse as it climbs. Draw only after the Caveat font has loaded.
export const GRAFFITI = { w: 2048, h: 1024, bottom: 0.3, top: 2.4, width: 4.2 };
export function graffitiTexture() {
  const rand = seeded(1127);
  const { w, h, bottom, top } = GRAFFITI;
  const yAt = (m) => ((top - m) / (top - bottom)) * h; // height on the wall (m) -> canvas y
  return makeCanvas(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = ALARM_RED;
    g.strokeStyle = ALARM_RED;
    g.textBaseline = 'alphabetic';
    const write = (text, x, y, size, { tilt = 0, weight = '400' } = {}) => {
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      g.font = `${weight} ${size}px ${SCRAWL}`;
      g.fillText(text, 0, 0);
      const width = g.measureText(text).width;
      g.restore();
      return width;
    };
    // Struck through so hard the marker tore the padding: heavy jagged lines with dark gouges.
    const strike = (x, y, len) => {
      g.save();
      g.lineWidth = 9; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let k = 1; k <= 8; k++) g.lineTo(x + (len * k) / 8, y + (rand() - 0.5) * 10);
      g.stroke();
      g.strokeStyle = 'rgba(60,20,16,0.85)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + len * 0.3, y + 2); g.lineTo(x + len * 0.55, y - 3); g.stroke();
      g.restore();
    };

    // Bottom (0.3-0.9 m): neat rows of the slogan, copied again and again. Careful handwriting.
    for (let y = yAt(0.36); y > yAt(0.9); y -= 46) {
      let x = 40 + rand() * 30;
      while (x < w - 300) x += write('Closer every day.', x, y, 44, { tilt: (rand() - 0.5) * 0.02 }) + 40;
    }
    // Middle (0.9-1.6 m): the slogan shortens with each row, and the writing grows.
    const shrinking = ['Closer every day.', 'Closer every', 'Closer every', 'Closer', 'Closer', 'Clo', 'Clo'];
    let row = 0;
    for (let y = yAt(0.98); y > yAt(1.6) && row < shrinking.length; y -= 54 + row * 4, row++) {
      let x = 30 + rand() * 60;
      const size = 50 + row * 7;
      while (x < w - 260) {
        const text = shrinking[row];
        const width = write(text, x, y, size, { tilt: (rand() - 0.5) * (0.05 + row * 0.02) });
        if (rand() < 0.12) strike(x - 6, y - size * 0.3, width + 12);
        x += width + 30 + rand() * 50;
      }
    }
    // Top (1.6-2.4 m): tally marks in groups of eleven, not five. Cramped.
    g.lineCap = 'round';
    for (let y = yAt(1.72); y > yAt(2.32); y -= 70) {
      for (let x = 60 + rand() * 40; x < w * 0.62; x += 210) {
        g.lineWidth = 4;
        for (let k = 0; k < 10; k++) {
          const tx = x + k * 15 + (rand() - 0.5) * 3;
          g.beginPath(); g.moveTo(tx, y); g.lineTo(tx + (rand() - 0.5) * 6, y - 52); g.stroke();
        }
        g.beginPath(); g.moveTo(x - 10, y - 8); g.lineTo(x + 158, y - 44); g.stroke(); // the eleventh, across
      }
    }
    // A tall figure with no face, top right.
    const fx = w * 0.8, fyTop = yAt(2.38), fyBot = yAt(1.62);
    g.lineWidth = 7;
    g.beginPath(); g.ellipse(fx, fyTop + 40, 26, 36, 0, 0, Math.PI * 2); g.stroke(); // the blank head
    g.beginPath(); g.moveTo(fx, fyTop + 76); g.lineTo(fx + 4, fyBot - 60); g.stroke(); // body, too long
    g.beginPath(); g.moveTo(fx, fyTop + 110); g.lineTo(fx - 70, fyTop + 260); g.moveTo(fx, fyTop + 110); g.lineTo(fx + 66, fyTop + 270); g.stroke();
    g.beginPath(); g.moveTo(fx + 4, fyBot - 60); g.lineTo(fx - 34, fyBot); g.moveTo(fx + 4, fyBot - 60); g.lineTo(fx + 40, fyBot); g.stroke();

    // One small line at the seated eye level (about 1.15 m), straight ahead of the chair.
    g.save();
    g.font = `400 34px ${SCRAWL}`;
    g.textAlign = 'center';
    g.fillText("She isn't the only one listening.", w / 2, yAt(1.15));
    g.restore();

    // A smear from a left hand, low on the left: a palm and four dragged fingers.
    g.save();
    g.globalAlpha = 0.45;
    const sx = 240, sy = yAt(1.25);
    g.beginPath(); g.ellipse(sx, sy, 34, 44, -0.3, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 4; k++) {
      g.lineWidth = 14 - k; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx + 20 - k * 16, sy - 36); g.lineTo(sx + 34 - k * 22, sy - 110 - k * 6); g.stroke();
    }
    g.lineWidth = 16;
    g.beginPath(); g.moveTo(sx + 32, sy - 6); g.lineTo(sx + 84, sy - 40); g.stroke(); // the thumb: on the right, so a left hand
    g.globalAlpha = 0.25;
    g.lineWidth = 46;
    g.beginPath(); g.moveTo(sx, sy + 30); g.lineTo(sx - 20, sy + 190); g.stroke(); // dragged down
    g.restore();
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
