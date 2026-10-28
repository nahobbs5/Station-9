// Canvas textures for the secret Cryosleep Bay (reference files/Station 9 Cryosleep Bay.png).
// Like js/textures.js, each function returns a plain <canvas> that the renderer wraps.
import { makeCanvas, seeded, drawEmblem } from './textures.js';

const HEAD = 'Oswald, "Arial Narrow", sans-serif';
const MONO = '"Share Tech Mono", ui-monospace, monospace';
const PAINT = '#2c2c2a';

// A little wireframe body, for the scan screens.
function wireBody(g, cx, top, hgt, color) {
  const k = hgt / 200;
  g.strokeStyle = color; g.lineWidth = Math.max(1, 2 * k);
  g.beginPath(); g.ellipse(cx, top + 14 * k, 10 * k, 13 * k, 0, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(cx - 20 * k, top + 34 * k); g.lineTo(cx + 20 * k, top + 34 * k); g.lineTo(cx + 14 * k, top + 96 * k); g.lineTo(cx - 14 * k, top + 96 * k); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(cx - 20 * k, top + 36 * k); g.lineTo(cx - 30 * k, top + 100 * k); g.moveTo(cx + 20 * k, top + 36 * k); g.lineTo(cx + 30 * k, top + 100 * k); g.stroke();
  g.beginPath(); g.moveTo(cx - 10 * k, top + 96 * k); g.lineTo(cx - 14 * k, top + 196 * k); g.moveTo(cx + 10 * k, top + 96 * k); g.lineTo(cx + 14 * k, top + 196 * k); g.stroke();
}

// The small screen at a pod's foot. Yours is awake; the rest say VACANT.
export function cryoPodScreen(n, occupied) {
  return makeCanvas(320, 200, (g, w, h) => {
    g.fillStyle = occupied ? '#0b1c1f' : '#090c0d'; g.fillRect(0, 0, w, h);
    g.strokeStyle = occupied ? 'rgba(143,224,207,0.35)' : 'rgba(143,224,207,0.12)'; g.lineWidth = 2; g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    if (!occupied) {
      g.fillStyle = 'rgba(143,224,207,0.35)'; g.font = `600 22px ${HEAD}`; g.fillText(`POD 0${n}`, 20, 44);
      g.fillStyle = 'rgba(143,224,207,0.22)'; g.font = `600 34px ${HEAD}`; g.fillText('VACANT', 20, 120);
      return;
    }
    g.fillStyle = '#d8ece6'; g.font = `600 22px ${HEAD}`; g.fillText('S9-CRY-0427', 18, 36);
    const rows = [['OCCUPANT', 'MAINT. TECHNICIAN'], ['STATUS', 'STASIS'], ['VITALS', 'NOMINAL'], ['TEMP', '-196°C'], ['IN STASIS', '412 DAYS']];
    rows.forEach(([k, v], i) => {
      const y = 66 + i * 26;
      g.fillStyle = '#5d8a82'; g.font = `13px ${MONO}`; g.fillText(k, 18, y);
      if (k === 'STATUS' || k === 'VITALS') { g.fillStyle = 'rgba(95,179,168,0.85)'; g.fillRect(104, y - 15, 96, 20); g.fillStyle = '#062022'; }
      else g.fillStyle = '#cfe9e2';
      g.font = `600 14px ${HEAD}`; g.fillText(v, 108, y);
    });
    wireBody(g, 262, 30, 150, '#8fe0cf');
  });
}

// Frost over your pod's glass: a pale haze, heavier at the edges, with crystal streaks.
// Transparent, so the shape inside shows through it.
export function frostTexture() {
  const rand = seeded(1961);
  return makeCanvas(512, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const haze = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.6);
    haze.addColorStop(0, 'rgba(220,238,255,0.18)'); haze.addColorStop(1, 'rgba(220,238,255,0.75)');
    g.fillStyle = haze; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(240,248,255,${0.1 + rand() * 0.35})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 3); }
    g.strokeStyle = 'rgba(245,250,255,0.35)';
    for (let i = 0; i < 60; i++) {
      const x = rand() * w, y = rand() * h, a = rand() * Math.PI * 2, len = 8 + rand() * 30;
      g.lineWidth = 0.5 + rand();
      for (let k = 0; k < 3; k++) { const b = a + (k * Math.PI) / 3; g.beginPath(); g.moveTo(x - Math.cos(b) * len, y - Math.sin(b) * len); g.lineTo(x + Math.cos(b) * len, y + Math.sin(b) * len); g.stroke(); }
    }
  });
}

// The plate on a pod's foot: a big number, CRYOSLEEP UNIT, and the caution with a snowflake.
export function cryoPodLabel(n) {
  return makeCanvas(256, 200, (g, w, h) => {
    g.fillStyle = '#d6cfbd'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c8641e'; g.fillRect(0, h - 26, w, 10);
    g.fillStyle = PAINT; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.font = `600 84px ${HEAD}`; g.fillText(`0${n}`, 18, 92);
    g.font = `500 17px ${HEAD}`; g.fillText('CRYOSLEEP UNIT', 140, 50); g.fillText(`S9-CRY-01${n}7`, 140, 72);
    // Snowflake and caution.
    const sx = 30, sy = 138;
    g.strokeStyle = PAINT; g.lineWidth = 2.5;
    for (let k = 0; k < 3; k++) { const a = (k * Math.PI) / 3; g.beginPath(); g.moveTo(sx - Math.cos(a) * 13, sy - Math.sin(a) * 13); g.lineTo(sx + Math.cos(a) * 13, sy + Math.sin(a) * 13); g.stroke(); }
    g.font = `600 15px ${HEAD}`; g.fillText('CAUTION', 54, 134); g.font = `500 13px ${HEAD}`; g.fillText('CRYOGENIC TEMPERATURES', 54, 152);
    const rand = seeded(n * 31);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(50,40,28,${0.15 + rand() * 0.3})`; g.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2); }
  });
}

// STATION 9 / CRYOSLEEP / REST TODAY FURTHER TOMORROW, painted on the back wall (transparent).
export function cryoBackSign() {
  return makeCanvas(640, 350, (g, w) => {
    drawEmblem(g, w / 2, 86, 66, { light: PAINT, accent: '#c8641e' });
    g.fillStyle = PAINT; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    g.font = `600 48px ${HEAD}`; g.fillText('S T A T I O N   9', w / 2, 212);
    g.font = `500 38px ${HEAD}`; g.fillText('CRYOSLEEP', w / 2, 260);
    g.font = `500 26px ${HEAD}`; g.fillText('REST TODAY', w / 2, 300); g.fillText('FURTHER TOMORROW', w / 2, 332);
  });
}

// A slogan painted high on a side wall, one word per line (transparent).
export function cryoSlogan(words) {
  return makeCanvas(400, 200, (g) => {
    g.fillStyle = PAINT; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.font = `500 40px ${HEAD}`;
    words.forEach((t, i) => g.fillText(t, 16, 44 + i * 46));
  });
}

// The desk monitor: POD 05's status, with nothing where a heartbeat should be.
export function cryoDeskScreen() {
  return makeCanvas(512, 320, (g, w, h) => {
    g.fillStyle = '#0b1517'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(143,224,207,0.3)'; g.lineWidth = 2; g.strokeRect(8, 8, w - 16, h - 16);
    g.strokeRect(20, 20, 170, 280);
    wireBody(g, 105, 40, 240, '#8fe0cf');
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#d8ece6'; g.font = `600 30px ${HEAD}`; g.fillText('POD 05', 214, 62);
    g.fillStyle = 'rgba(95,179,168,0.85)'; g.fillRect(380, 38, 100, 30); g.fillStyle = '#062022'; g.font = `600 18px ${HEAD}`; g.fillText('STASIS', 398, 60);
    [['HEART RATE', 'N/A'], ['RESPIRATION', 'N/A'], ['BODY TEMP', '-196°C'], ['POD INTEGRITY', 'NOMINAL']].forEach(([k, v], i) => {
      const y = 116 + i * 44;
      g.fillStyle = 'rgba(143,224,207,0.15)'; g.fillRect(214, y + 12, 270, 1);
      g.fillStyle = '#9cc8c0'; g.font = `600 17px ${HEAD}`; g.fillText(k, 214, y);
      g.fillStyle = '#e4f2ee'; g.fillText(v, 410, y);
    });
    drawEmblem(g, 236, 286, 14, { light: '#cfe9e2', accent: '#f08a3c' });
    g.fillStyle = '#cfe9e2'; g.font = `600 16px ${HEAD}`; g.fillText('S T A T I O N   9', 260, 292);
  });
}

// The walkway grating: dark bars on a darker floor, tiled.
export function cryoGrateTexture() {
  return makeCanvas(128, 128, (g, w, h) => {
    g.fillStyle = '#0c0e0f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a4044';
    for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h);
    for (let y = 0; y < h; y += 32) g.fillRect(0, y, w, 4);
  }, { wrap: true });
}

// A small sign plate for a door header (dark, light text, an orange edge).
export function cryoPlateTexture(text) {
  return makeCanvas(512, 72, (g, w, h) => {
    g.fillStyle = '#2b2e30'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#5fb3a8'; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#e4ddc9'; g.font = `600 36px ${HEAD}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}
