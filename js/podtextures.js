// Canvas textures for the escape pod (js/babylon/pod.js), after the spec sheet: worn off-white
// panels, a broad orange band, the Station 9 logo, "09 ESCAPE", the "PULL" hatch, the door control
// screen and the glowing thruster cores.
import { makeCanvas, seeded } from './textures.js';

const HULL = '#d9d4c8', ORANGE = '#d9772b', DARK = '#26282a';
const PRINT = 'Oswald, "Arial Narrow", sans-serif';

function wear(g, w, h, rand, { chips = 60, scratches = 40, grime = 0.35 } = {}) {
  // Chips: dark metal showing through, bigger near the edges.
  for (let i = 0; i < chips; i++) {
    const edge = rand() < 0.5;
    const x = edge ? (rand() < 0.5 ? rand() * w * 0.12 : w - rand() * w * 0.12) : rand() * w;
    const y = rand() * h, r = 1.5 + rand() * (edge ? 9 : 5);
    g.fillStyle = `rgba(40,38,34,${0.45 + rand() * 0.5})`;
    g.beginPath(); g.ellipse(x, y, r, r * (0.4 + rand() * 0.8), rand() * 3, 0, Math.PI * 2); g.fill();
  }
  g.lineWidth = 1;
  for (let i = 0; i < scratches; i++) {
    g.strokeStyle = `rgba(60,56,50,${0.15 + rand() * 0.3})`;
    const x = rand() * w, y = rand() * h, a = (rand() - 0.5) * 0.9, l = 6 + rand() * 40;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(50,40,28,0)'); grad.addColorStop(1, `rgba(50,40,28,${grime})`);
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
}

// Worn off-white hull panels with seams. Wraps around the body (u: round it, v: along it).
export function podHullTexture() {
  const rand = seeded(4509);
  return makeCanvas(1024, 512, (g, w, h) => {
    g.fillStyle = HULL; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(70,66,58,0.55)'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += w / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } // the 8 faces
    for (const y of [h * 0.33, h * 0.7]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    wear(g, w, h, rand, { chips: 180, scratches: 140 });
  });
}

// The broad orange band.
export function podBandTexture() {
  const rand = seeded(77);
  return makeCanvas(512, 128, (g, w, h) => {
    g.fillStyle = ORANGE; g.fillRect(0, 0, w, h);
    wear(g, w, h, rand, { chips: 50, scratches: 30, grime: 0.25 });
  }, { wrap: true });
}

// The Station 9 logo: a ring crossed by a needle, with a small star.
function logo(g, cx, cy, r, color) {
  g.strokeStyle = color; g.fillStyle = color; g.lineWidth = r * 0.12;
  g.beginPath(); g.arc(cx, cy, r, 0.3, Math.PI * 2 - 0.2); g.stroke();
  g.beginPath(); g.moveTo(cx - r * 1.05, cy + r * 1.05); g.lineTo(cx + r * 0.95, cy - r * 0.95); g.lineWidth = r * 0.1; g.stroke();
  g.beginPath(); g.moveTo(cx + r * 0.95, cy - r * 0.95); g.lineTo(cx + r * 0.55, cy - r * 0.78); g.lineTo(cx + r * 0.78, cy - r * 0.55); g.fill();
  g.fillStyle = ORANGE;
  g.beginPath(); g.arc(cx + r * 0.62, cy - r * 0.15, r * 0.1, 0, Math.PI * 2); g.fill();
}

// The flank markings: logo, STATION 9, then 09 and ESCAPE over a hazard stripe. Transparent around.
export function podMarkingsTexture() {
  return makeCanvas(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    logo(g, w / 2, 120, 70, '#2b2c2e');
    g.fillStyle = '#2b2c2e'; g.textAlign = 'center';
    g.font = `600 40px ${PRINT}`; g.fillText('STATION 9', w / 2, 248);
    g.font = `700 150px ${PRINT}`; g.fillText('09', w / 2, 398);
    g.font = `600 46px ${PRINT}`; g.fillText('ESCAPE', w / 2, 448);
    for (let i = 0; i < 9; i++) { // hazard stripe
      g.fillStyle = i % 2 ? '#2b2c2e' : ORANGE;
      g.beginPath(); g.moveTo(110 + i * 34, 500); g.lineTo(140 + i * 34, 466); g.lineTo(166 + i * 34, 466); g.lineTo(136 + i * 34, 500); g.fill();
    }
  });
}

// The side hatch: PULL with an arrow.
export function podHatchTexture() {
  return makeCanvas(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#2b2c2e'; g.textAlign = 'center';
    g.font = `700 72px ${PRINT}`; g.fillText('PULL', w / 2, 96);
    g.fillStyle = ORANGE;
    g.beginPath(); g.moveTo(w / 2 - 34, 140); g.lineTo(w / 2 + 34, 140); g.lineTo(w / 2, 196); g.fill();
    g.strokeStyle = 'rgba(30,30,30,0.7)'; g.lineWidth = 6; g.strokeRect(20, 18, w - 40, h - 36);
  });
}

// The door ramp's tread: dark steel with anti-slip ribs and an orange edge.
export function podRampTexture() {
  return makeCanvas(256, 256, (g, w, h) => {
    g.fillStyle = '#323436'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#45484a';
    for (let y = 22; y < h - 22; y += 18) g.fillRect(24, y, w - 48, 7);
    g.fillStyle = ORANGE; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
  });
}

// The door control screen. p: prep progress (0..1). Before and during the prep it counts up;
// once ready it asks LAUNCH?
export function podPanelScreen({ p = 0 } = {}) {
  return makeCanvas(384, 256, (g, w, h) => {
    g.fillStyle = '#0d2033'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8eef2'; g.textAlign = 'left';
    g.font = `600 26px ${PRINT}`; g.fillText('▲ ESCAPE POD', 22, 42);
    logo(g, w - 40, 30, 14, '#e8eef2');
    g.fillStyle = 'rgba(232,238,242,0.4)'; g.fillRect(18, 56, w - 36, 2);
    g.textAlign = 'center';
    if (p >= 1) {
      g.fillStyle = '#ffffff'; g.font = `700 72px ${PRINT}`; g.fillText('LAUNCH?', w / 2, 148);
    } else {
      g.fillStyle = '#ffffff'; g.font = `600 34px ${PRINT}`;
      g.fillText(p > 0 ? `PREPARING ${Math.floor(p * 100)}%` : 'STANDBY', w / 2, 128);
      g.strokeStyle = '#e8eef2'; g.lineWidth = 2; g.strokeRect(40, 146, w - 80, 22);
      g.fillStyle = ORANGE; g.fillRect(43, 149, (w - 86) * p, 16);
    }
    for (let i = 0; i < 12; i++) { // hazard stripe
      g.fillStyle = i % 2 ? '#0d2033' : '#f2a42e';
      g.beginPath(); g.moveTo(40 + i * 26, 230); g.lineTo(60 + i * 26, 194); g.lineTo(80 + i * 26, 194); g.lineTo(60 + i * 26, 230); g.fill();
    }
  });
}

// A thruster's core: dark rings round a hot orange centre.
export function thrusterTexture() {
  return makeCanvas(256, 256, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
    grad.addColorStop(0, '#fff2c8'); grad.addColorStop(0.25, '#ffb04a'); grad.addColorStop(0.55, '#c2561c');
    grad.addColorStop(0.75, '#2a1a12'); grad.addColorStop(1, '#141414');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 6;
    for (const r of [0.62, 0.8, 0.95]) { g.beginPath(); g.arc(w / 2, h / 2, (w / 2) * r, 0, Math.PI * 2); g.stroke(); }
  });
}

// The pod's lit interior screen.
export function podConsoleScreen() {
  return makeCanvas(256, 160, (g, w, h) => {
    g.fillStyle = '#071a26'; g.fillRect(0, 0, w, h);
    logo(g, 60, 80, 32, '#7fd3ff');
    g.fillStyle = '#7fd3ff'; g.font = `16px ${PRINT}`; g.textAlign = 'left';
    ['NAV  OK', 'O2   98%', 'SEATS 2/4'].forEach((t, i) => g.fillText(t, 118, 56 + i * 28));
  });
}
