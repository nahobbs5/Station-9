// Builds the station's meshes and lights from the layout, and animates doors and lights.
import * as THREE from 'three';
import { TILE, WALL_H, cellCenter, key } from './layout.js';
import { buildDecor } from './decor.js';

const EMERGENCY = { color: 0xff3a22, intensity: 5 };
const POWERED = { color: 0xd8e2ff, intensity: 16 };
const SAFE_LIGHT = { color: 0xffe2b0, intensity: 5 }; // safe rooms: warm and steady, on their own circuit

// Small seeded random, so the grime looks the same every load.
function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function canvasTexture(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

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
function wallTexture(variant) {
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
function floorTextures(layout) {
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
  const rough = new THREE.CanvasTexture(c);
  rough.colorSpace = THREE.NoColorSpace;
  return { map, rough };
}

// Ceiling: one panel per cell, stained, with a few missing.
function ceilingTexture(layout) {
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
function doorTexture(base) {
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

function drawMascot(g, cx, cy, r) {
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

function posterTexture(lines, accent) {
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

function mapTexture(layout) {
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

function screenTexture() {
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
function wallSpot(room, side, along = 0.5) {
  switch (side) {
    case 'n': return { x: (room.x + room.w * along) * TILE, z: room.y * TILE + 0.02, rot: 0 };
    case 's': return { x: (room.x + room.w * along) * TILE, z: (room.y + room.h) * TILE - 0.02, rot: Math.PI };
    case 'w': return { x: room.x * TILE + 0.02, z: (room.y + room.h * along) * TILE, rot: Math.PI / 2 };
    default:  return { x: (room.x + room.w) * TILE - 0.02, z: (room.y + room.h * along) * TILE, rot: -Math.PI / 2 };
  }
}

export function buildWorld(scene, layout) {
  const { w, h } = layout;
  const std = (o) => new THREE.MeshStandardMaterial(o);

  // Floor and ceiling ------------------------------------------------------
  const floorTex = floorTextures(layout);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w * TILE, h * TILE),
    std({ map: floorTex.map, roughnessMap: floorTex.rough, roughness: 1, metalness: 0.45 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((w * TILE) / 2, 0, (h * TILE) / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w * TILE, h * TILE),
    std({ map: ceilingTexture(layout), roughness: 0.95 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((w * TILE) / 2, WALL_H, (h * TILE) / 2);
  scene.add(ceiling);

  // Walls: a box in every empty cell that touches floor ----------------------
  const wallCells = [];
  for (let z = -1; z <= h; z++) {
    for (let x = -1; x <= w; x++) {
      if (layout.isFloor(x, z)) continue;
      let touches = false;
      for (let dz = -1; dz <= 1 && !touches; dz++)
        for (let dx = -1; dx <= 1 && !touches; dx++) touches = layout.isFloor(x + dx, z + dz);
      if (touches) wallCells.push([x, z]);
    }
  }
  // Three wall finishes, mixed at random so it looks patched together over the years.
  const m = new THREE.Matrix4();
  const wallRand = seeded(41);
  const wallSets = [[], [], []];
  for (const c of wallCells) wallSets[wallRand() < 0.45 ? 0 : wallRand() < 0.5 ? 1 : 2].push(c);
  const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  wallSets.forEach((cells, v) => {
    if (!cells.length) return;
    const walls = new THREE.InstancedMesh(wallGeo, std({ map: wallTexture(v), roughness: 0.85, metalness: 0.25 }), cells.length);
    cells.forEach(([x, z], i) => walls.setMatrixAt(i, m.makeTranslation(cellCenter(x), WALL_H / 2, cellCenter(z))));
    scene.add(walls);
  });

  // Corridor guide strips: emissive only, so they cost no lighting ----------
  const strips = [];
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < w; x++) {
      if (!layout.isCorridor(x, z)) continue;
      const alongX = layout.isFloor(x - 1, z) && layout.isFloor(x + 1, z);
      for (const side of [-1, 1]) {
        strips.push(alongX
          ? { x: cellCenter(x), z: cellCenter(z) + side * 0.92, rot: 0 }
          : { x: cellCenter(x) + side * 0.92, z: cellCenter(z), rot: Math.PI / 2 });
      }
    }
  }
  const stripMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.7, 0.04, 0.08),
    new THREE.MeshBasicMaterial({ color: 0x7a2a12 }),
    strips.length,
  );
  const q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
  strips.forEach((s, i) => {
    q.setFromAxisAngle(up, s.rot);
    stripMesh.setMatrixAt(i, m.compose(new THREE.Vector3(s.x, 0.03, s.z), q, one));
  });
  scene.add(stripMesh);

  // Doors -------------------------------------------------------------------
  const doorMat = std({ map: doorTexture('#62666b'), roughness: 0.55, metalness: 0.6 });
  const hatchMat = std({ map: doorTexture('#2f6e6a'), roughness: 0.45, metalness: 0.65 }); // safe-room hatches
  const lampRed = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const lampGreen = new THREE.MeshBasicMaterial({ color: 0x2aff7a });
  const doorGeo = new THREE.BoxGeometry(1, 1, 1);
  const doors = layout.doors.map((d) => {
    const mesh = new THREE.Mesh(doorGeo, d.safe ? hatchMat : doorMat);
    if (d.axis === 'x') mesh.scale.set(0.25, WALL_H, TILE);
    else mesh.scale.set(TILE, WALL_H, 0.25);
    const x = cellCenter(d.cx), z = cellCenter(d.cz);
    mesh.position.set(x, WALL_H / 2, z);
    scene.add(mesh);
    const lamps = [-1, 1].map((side) => {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08), lampGreen);
      if (d.axis === 'x') { lamp.rotation.y = Math.PI / 2; lamp.position.set(x + side * 0.4, WALL_H - 0.08, z); }
      else lamp.position.set(x, WALL_H - 0.08, z + side * 0.4);
      scene.add(lamp);
      return lamp;
    });
    const door = { ...d, x, z, mesh, lamps, closed: false, closedByPlayer: false, t: 0 };
    return door;
  });
  const doorByKey = new Map(doors.map((d) => [key(d.cx, d.cz), d]));
  const setDoor = (door, closed) => {
    door.closed = closed;
    if (!closed) door.closedByPlayer = false;
    for (const l of door.lamps) l.material = closed ? lampRed : lampGreen;
  };
  for (const d of doors) if (d.startClosed) { setDoor(d, true); d.t = 1; }

  // Room lights -------------------------------------------------------------
  const rooms = layout.rooms.map((room) => {
    const base = room.safe ? SAFE_LIGHT : EMERGENCY;
    const light = new THREE.PointLight(base.color, base.intensity, room.safe ? 7 : 13, 2);
    light.position.set(cellCenter(room.cx), WALL_H - 0.4, cellCenter(room.cz));
    scene.add(light);
    const fixtureMat = new THREE.MeshBasicMaterial({ color: base.color });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), fixtureMat);
    fixture.position.set(light.position.x, WALL_H - 0.03, light.position.z);
    scene.add(fixture);
    return { room, light, fixtureMat, base: { ...base }, mult: 1, beat: 0, haunt: 0, glitch: 0 };
  });
  let powered = false;
  const setPower = (on) => {
    powered = on;
    for (const r of rooms) {
      if (r.room.safe) continue;
      // The pod bay stays red: it runs on its own circuit.
      r.base = on && r.room.id !== 'pod' ? { ...POWERED } : { ...EMERGENCY };
      r.light.color.set(r.base.color);
      r.fixtureMat.color.set(r.base.color);
    }
  };

  // Props -------------------------------------------------------------------
  const screenTex = screenTexture();
  const props = {};
  const interactables = [];
  for (const p of layout.props) {
    const room = layout.room(p.room);
    const x = cellCenter(p.cell[0]), z = cellCenter(p.cell[1]);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = Math.atan2(cellCenter(room.cx) - x, cellCenter(room.cz) - z);
    const status = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    let height = 1;

    if (p.id === 'generator') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 1.3), std({ color: 0x55524a, roughness: 0.6, metalness: 0.6 }));
      base.position.y = 0.65;
      group.add(base);
      for (const side of [-0.45, 0.45]) {
        const coil = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 12), std({ color: 0x8a6a3a, metalness: 0.8, roughness: 0.4 }));
        coil.position.set(side, 1.75, 0);
        group.add(coil);
      }
      status.position.set(0, 1.1, 0.67);
    } else if (p.id === 'comms') {
      const desk = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.95, 0.9), std({ color: 0x3d4a52, roughness: 0.6, metalness: 0.5 }));
      desk.position.y = 0.48;
      group.add(desk);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), new THREE.MeshBasicMaterial({ color: 0x103a33 }));
      screen.position.set(0, 1.3, 0.2);
      screen.rotation.x = -0.25;
      group.add(screen);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2), std({ color: 0x777777, metalness: 0.9 }));
      mast.position.set(0.6, 1.55, -0.3);
      group.add(mast);
      status.position.set(-0.6, 1.0, 0.46);
      props.commsScreen = screen;
    } else if (p.id === 'pod') {
      const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 0.8, 6, 16), std({ color: 0xcfcbbf, roughness: 0.4, metalness: 0.3 }));
      pod.rotation.z = Math.PI / 2;
      pod.position.y = 0.85;
      group.add(pod);
      const win = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), std({ color: 0x0a1418, roughness: 0.1, metalness: 0.9 }));
      win.scale.set(1.2, 0.7, 0.5);
      win.position.set(0.3, 1.15, 0.45);
      group.add(win);
      status.position.set(-0.7, 1.35, 0.5);
    } else if (p.id === 'crate') {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 0.9), std({ color: 0x4b5232, roughness: 0.8 }));
      crate.position.y = 0.4;
      group.add(crate);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 0.92), std({ color: 0xc9a227, roughness: 0.6 }));
      stripe.position.y = 0.62;
      group.add(stripe);
      height = 0.7;
      status.position.set(0, 0.9, 0);
      status.material.color.set(0xffaa33);
    } else if (p.kind === 'log') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.6), std({ color: 0x3a3e43, roughness: 0.7, metalness: 0.4 }));
      box.position.y = 0.62;
      group.add(box);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.52), new THREE.MeshBasicMaterial({ map: screenTex }));
      screen.position.set(0, 0.95, 0.31);
      group.add(screen);
      status.position.set(0.32, 0.45, 0.31);
      status.material.color.set(0x8fe0cf);
      height = 1.0;
    } else if (p.id === 'teleporter') {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.2, 24), std({ color: 0x3a4248, metalness: 0.8, roughness: 0.3 }));
      pad.position.y = 0.1;
      group.add(pad);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 32), std({ color: 0x8aa4b8, metalness: 0.9, roughness: 0.25 }));
      ring.position.y = 1.3;
      group.add(ring);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshBasicMaterial({ color: 0x9fd0ff }));
      core.position.y = 1.3;
      group.add(core);
      const light = new THREE.PointLight(0x5aa0ff, 6, 11, 2);
      light.position.y = 1.4;
      group.add(light);
      props.teleporterLight = light;
      props.teleporterRing = ring;
      props.teleporter = group;
    }
    if (p.kind !== 'scenery') {
      group.add(status);
      props[p.id] = { group, status };
      interactables.push({
        id: p.id, kind: p.kind, label: p.label, duration: p.duration,
        pos: new THREE.Vector3(x, height, z), range: 2.7,
      });
    }
    scene.add(group);
  }
  for (const d of doors) {
    interactables.push({ id: 'door', kind: 'door', door: d, pos: new THREE.Vector3(d.x, 1.4, d.z), range: 2.6 });
  }

  // Loose props: chairs and boxes that don't block anything. The prop trick moves them.
  const loose = [];
  const looseRand = seeded(11);
  const chairGeo = new THREE.BoxGeometry(0.45, 0.06, 0.45);
  const legGeo = new THREE.BoxGeometry(0.04, 0.45, 0.04);
  const backGeo = new THREE.BoxGeometry(0.45, 0.5, 0.05);
  const boxGeo = new THREE.BoxGeometry(0.55, 0.45, 0.45);
  const chairMat = std({ color: 0x8a8578, roughness: 0.7, metalness: 0.3 });
  const boxMat = std({ color: 0x5a4a32, roughness: 0.9 });
  const makeChair = () => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(chairGeo, chairMat); seat.position.y = 0.45; g.add(seat);
    const back = new THREE.Mesh(backGeo, chairMat); back.position.set(0, 0.72, -0.2); g.add(back);
    for (const [lx, lz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) {
      const leg = new THREE.Mesh(legGeo, chairMat); leg.position.set(lx, 0.22, lz); g.add(leg);
    }
    return g;
  };
  const makeBox = () => { const b = new THREE.Mesh(boxGeo, boxMat); b.position.y = 0.22; const g = new THREE.Group(); g.add(b); return g; };
  // Spots near the walls of a room, away from doors and fixed props.
  // Pipes, patches, broken lights and leaks. Its sounds go to whoever sets world.onDecorEvent.
  let onDecorEvent = null;
  const decor = buildDecor(scene, layout, { onEvent: (type, at) => onDecorEvent?.(type, at) });
  const clutterCells = new Set(decor.plan.clutter.map((c) => key(c.cell[0], c.cell[1])));
  const looseSpots = (room) => {
    const spots = [];
    for (let z = room.y; z < room.y + room.h; z++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const edge = x === room.x || z === room.y || x === room.x + room.w - 1 || z === room.y + room.h - 1;
        const nearDoor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => layout.isDoor(x + dx, z + dz));
        if (edge && !nearDoor && layout.isOpen(x, z) && !clutterCells.has(key(x, z))) spots.push([x, z]);
      }
    }
    return spots;
  };
  for (const room of layout.rooms) {
    if (room.safe) continue;
    const spots = looseSpots(room);
    for (let i = 0; i < 2 && spots.length; i++) {
      const [cx, cz] = spots.splice(Math.floor(looseRand() * spots.length), 1)[0];
      const mesh = i === 0 ? makeChair() : makeBox();
      mesh.position.set(cellCenter(cx) + (looseRand() - 0.5) * 0.6, 0, cellCenter(cz) + (looseRand() - 0.5) * 0.6);
      mesh.rotation.y = looseRand() * Math.PI * 2;
      scene.add(mesh);
      loose.push({ mesh, room, spots });
    }
  }

  // Posters -----------------------------------------------------------------
  const poster = (roomId, side, tex, wM = 1.3, hM = 1.95, y = 1.75) => {
    const s = wallSpot(layout.room(roomId), side);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), std({ map: tex, roughness: 0.9 }));
    mesh.position.set(s.x, y, s.z);
    mesh.rotation.y = s.rot;
    scene.add(mesh);
  };
  poster('airlock', 'n', posterTexture(['CLOSER', 'EVERY', 'DAY.'], '#b3332a'));
  poster('crew', 'w', posterTexture(['YOUR WELLNESS', 'IS OUR', 'WAYPOINT.'], '#2f6e6a'));
  poster('wellness', 's', posterTexture(['BREATHE IN.', 'BREATHE OUT.', 'STAY.'], '#2f6e6a'), 1.1, 1.65);
  poster('quiet', 'w', posterTexture(['SHHH.', 'MARIGOLD', 'IS LISTENING.'], '#b3332a'), 1.1, 1.65);
  poster('storage', 'w', posterTexture(['SMALL STEPS.', 'BIG', 'POSSIBILITIES.'], '#b3332a'));
  poster('generator', 'w', posterTexture(['POWER IS A', 'PRIVILEGE.', 'EARN IT.'], '#2f6e4a'));
  poster('comms', 'e', posterTexture(["WE'RE", 'ALWAYS', 'LISTENING.'], '#b3332a'));
  poster('teleporter', 'w', posterTexture(['STEP IN.', 'STEP OUT.', 'STEP UP.'], '#2f4f6e'));
  poster('pod', 's', posterTexture(['LEAVING', 'SO SOON?', "WE'LL MISS YOU."], '#b3332a'));
  poster('control', 'n', mapTexture(layout), 2.4, 2.1, 1.85);

  // Per-frame animation -----------------------------------------------------
  // alien: { pos, state } so a room's light can stutter as it passes through (the patrol tell).
  function update(dt, time, alien = null, player = null) {
    decor.update(dt, time, player);
    for (const d of doors) {
      const target = d.closed ? 1 : 0;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 2.2);
      d.mesh.position.y = WALL_H / 2 + (1 - d.t) * (WALL_H - 0.18);
    }
    for (const r of rooms) {
      let k = r.mult;
      if (r.beat > 0) { r.beat -= dt; k *= 0.25; }
      // Now and then a room's light stutters on its own (about once a minute each).
      if (!r.room.safe && dt > 0 && r.glitch <= 0 && Math.random() < dt / 60) r.glitch = 0.3 + Math.random() * 0.9;
      if (r.glitch > 0) { r.glitch -= dt; if (Math.random() < 0.55) k *= 0.15 + Math.random() * 0.3; }
      // Emergency lights hum and stutter a little on their own.
      if (!r.room.safe && (!powered || r.room.id === 'pod')) k *= 0.85 + 0.15 * Math.sin(time * 3 + r.room.index * 1.7);
      const R = r.room;
      const inside = alien && alien.state === 'patrol' &&
        alien.pos.x > R.x * TILE && alien.pos.x < (R.x + R.w) * TILE && alien.pos.z > R.y * TILE && alien.pos.z < (R.y + R.h) * TILE;
      r.haunt = inside ? Math.min(1, r.haunt + dt * 2) : Math.max(0, r.haunt - dt);
      if (r.haunt > 0 && Math.sin(time * 23 + Math.sin(time * 7) * 4) > 0.6) k *= 1 - 0.75 * r.haunt;
      r.light.intensity = r.base.intensity * k;
      r.fixtureMat.color.set(r.base.color).multiplyScalar(Math.max(0.05, k));
    }
    if (props.teleporterLight) {
      const flick = Math.random() < 0.06 ? 0.2 : 1;
      props.teleporterLight.intensity = (4 + 3 * Math.sin(time * 7) ** 2) * flick;
      props.teleporterRing.rotation.y += dt * 0.4;
    }
  }

  return {
    doors, rooms, props, interactables, loose, decor, setDoor, setPower, update,
    set onDecorEvent(fn) { onDecorEvent = fn; },
    // A terminal you've read turns green.
    markRead(id) { props[id]?.status.material.color.set(0x2aff7a); },
    doorAt: (x, z) => doorByKey.get(key(x, z)),
    get powered() { return powered; },
    // Dim every room for a moment (the Hat Man's tell).
    dimBeat(seconds) { for (const r of rooms) r.beat = seconds; },
  };
}

// The alien: a black, wet mass with a crown of long stringy tentacles that reach along the
// walls and ceiling (after the "Colossal Alien" concept art). You mostly see it as wet highlights
// in your flashlight. It's built from simple shapes: a lumpy body and jointed tentacle chains.
const TENTACLE_SEGMENTS = 7;

export function makeAlienMesh() {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // leans forward when it hunts
  group.add(inner);
  const skin = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.2, metalness: 0.65 });
  const strandMat = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.35, metalness: 0.5 });
  const rand = seeded(29);

  // Body: a squashed sphere with lumps. The lump is a function of position, so the seam stays closed.
  const bodyGeo = new THREE.SphereGeometry(0.75, 24, 18);
  const v = new THREE.Vector3();
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const lump = 1 + 0.13 * Math.sin(5 * n.x + 1.3) * Math.sin(4 * n.y + 0.7) * Math.sin(6 * n.z + 2.1)
      + 0.06 * Math.sin(11 * n.x + 7 * n.z) + 0.04 * Math.sin(17 * n.y + 3 * n.x);
    v.multiplyScalar(lump);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, skin);
  body.scale.set(1.35, 0.85, 1.5);
  const bodyHolder = new THREE.Group();
  bodyHolder.position.y = 2.05;
  bodyHolder.add(body);
  inner.add(bodyHolder);

  // Faint pale eyes, scattered and not quite in a row.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x9aaab8, transparent: true, opacity: 0.5 });
  for (let i = 0; i < 7; i++) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.016 + (i % 3) * 0.007, 6, 4), eyeMat);
    eye.position.set((i - 3) * 0.11, -0.1 + ((i * 37) % 5) * 0.04, 0.92 - Math.abs(i - 3) * 0.05);
    bodyHolder.add(eye);
  }

  // Stringy strands hanging from the underside.
  const strandGeo = new THREE.CylinderGeometry(0.006, 0.014, 1, 4);
  strandGeo.translate(0, -0.5, 0);
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2, r = 0.2 + rand() * 0.6;
    const strand = new THREE.Mesh(strandGeo, strandMat);
    strand.position.set(Math.cos(a) * r, -0.35 - rand() * 0.15, Math.sin(a) * r);
    strand.scale.y = 0.35 + rand() * 0.9;
    strand.rotation.set((rand() - 0.5) * 0.3, 0, (rand() - 0.5) * 0.3);
    bodyHolder.add(strand);
  }

  // Tentacles: [kind, angle around the body]. Legs drop to the floor, crowns climb the
  // walls and ceiling, reachers stretch out ahead of it.
  const plan = [
    ['leg', 0.5], ['leg', 1.6], ['leg', 2.7], ['leg', 3.6], ['leg', 4.7], ['leg', 5.7],
    ['crown', 0.9], ['crown', 2.2], ['crown', 3.2], ['crown', 4.2], ['crown', 5.3],
    ['reach', -0.4], ['reach', 0.4], ['reach', 0],
  ];
  const segGeos = [];
  for (let j = 0; j < TENTACLE_SEGMENTS; j++) {
    const len = 0.44 - j * 0.03;
    const r0 = 0.17 * (1 - j / TENTACLE_SEGMENTS) + 0.02, r1 = 0.17 * (1 - (j + 1) / TENTACLE_SEGMENTS) + 0.015;
    const g = new THREE.CylinderGeometry(r1, r0, len, 7);
    g.translate(0, len / 2, 0);
    segGeos.push({ g, len });
  }
  const up = new THREE.Vector3(0, 1, 0);
  const tentacles = [];
  for (const [kind, a] of plan) {
    let dir, curl;
    if (kind === 'leg') { dir = new THREE.Vector3(Math.sin(a) * 0.55, -0.85, Math.cos(a) * 0.55); curl = -0.16; }
    else if (kind === 'crown') { dir = new THREE.Vector3(Math.sin(a) * 0.45, 0.9, Math.cos(a) * 0.45); curl = 0.2; }
    else { dir = new THREE.Vector3(Math.sin(a) * 0.5, 0.15, 1); curl = 0.1 * Math.sign(a || 1); }
    dir.normalize();
    const root = new THREE.Group();
    root.position.set(Math.sin(a) * 0.55, 2.0 + dir.y * 0.25, Math.cos(a) * 0.55 + (kind === 'reach' ? 0.5 : 0));
    root.quaternion.setFromUnitVectors(up, dir);
    inner.add(root);
    const joints = [];
    let parent = root;
    for (let j = 0; j < TENTACLE_SEGMENTS; j++) {
      const joint = new THREE.Group();
      if (j > 0) joint.position.y = segGeos[j - 1].len;
      joint.rotation.x = curl * (1 + j * 0.15);
      joint.userData.base = joint.rotation.x;
      parent.add(joint);
      joint.add(new THREE.Mesh(segGeos[j].g, skin));
      // A few stringy bits trailing from the thicker segments.
      for (let k = 0; k < (j < 5 ? 2 : 0); k++) {
        const strand = new THREE.Mesh(strandGeo, strandMat);
        strand.position.set((rand() - 0.5) * 0.1, segGeos[j].len * rand(), (rand() - 0.5) * 0.1);
        strand.scale.y = 0.25 + rand() * 0.4;
        joint.add(strand);
      }
      joints.push(joint);
      parent = joint;
    }
    tentacles.push({ kind, joints, phase: rand() * Math.PI * 2 });
  }

  // A dull red glow that shows it for a moment when a hunt starts. Kept in the scene at
  // zero intensity, because adding or removing lights recompiles every shader.
  const reveal = new THREE.PointLight(0xff2a14, 0, 6, 2);
  reveal.position.set(0, 1.6, 1.2);
  group.add(reveal);

  group.userData = { inner, bodyHolder, tentacles, reveal, phase: 0, lean: 0, last: null };
  return group;
}

// How each state moves: [wave speed, wave size, lean forward].
const ALIEN_MOTION = {
  dormant: [0.25, 0.04, 0], patrol: [1.1, 0.12, 0], investigate: [2.4, 0.18, 0.08],
  warn: [0.4, 0.03, 0.05], hunt: [6.5, 0.3, 0.3], lost: [0.8, 0.1, 0],
};

export function animateAlienMesh(mesh, alien, time) {
  const u = mesh.userData;
  const dt = u.last === null ? 0 : Math.min(0.1, Math.max(0, time - u.last));
  u.last = time;
  mesh.position.set(alien.pos.x, 0, alien.pos.z);
  // Turn smoothly toward its heading.
  let d = alien.heading - mesh.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  mesh.rotation.y += d * 0.15;

  const mood = alien.dormant > 0 ? 'dormant' : alien.warning ? 'warn' : alien.state;
  const [speed, amp, lean] = ALIEN_MOTION[mood] ?? ALIEN_MOTION.patrol;
  u.phase += dt * speed; // accumulate, so changing speed never makes the tentacles jump
  u.lean += (lean - u.lean) * Math.min(1, dt * 4);
  u.inner.rotation.x = u.lean;
  u.bodyHolder.position.y = 2.05 + Math.sin(time * 1.7) * 0.05;
  for (const t of u.tentacles) {
    t.joints.forEach((joint, j) => {
      const w = amp * (1 + j * 0.2);
      joint.rotation.x = joint.userData.base + Math.sin(u.phase + t.phase + j * 0.7) * w;
      joint.rotation.z = Math.cos(u.phase * 0.7 + t.phase * 1.3 + j * 0.5) * w * 0.6;
    });
  }
}
