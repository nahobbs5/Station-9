// Builds the station's meshes and lights from the layout, and animates doors and lights.
import * as THREE from 'three';
import { TILE, WALL_H, cellCenter, key } from './layout.js';

const EMERGENCY = { color: 0xff3a22, intensity: 5 };
const POWERED = { color: 0xd8e2ff, intensity: 16 };

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

function wallTexture() {
  const rand = seeded(7);
  return canvasTexture(256, 384, (g, w, h) => {
    g.fillStyle = '#4b5056'; g.fillRect(0, 0, w, h);
    grime(g, w, h, rand, 40, 0.25);
    g.strokeStyle = '#25282c'; g.lineWidth = 6;
    g.strokeRect(3, 3, w - 6, h - 6);
    g.beginPath(); g.moveTo(0, h * 0.62); g.lineTo(w, h * 0.62); g.stroke();
    g.fillStyle = '#2f3237'; g.fillRect(0, h * 0.86, w, h * 0.14); // kick plate
    g.fillStyle = '#6a6f75';
    for (const [x, y] of [[14, 14], [w - 14, 14], [14, h * 0.62 - 12], [w - 14, h * 0.62 - 12]]) {
      g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(90,40,20,0.35)'; // rust drips
    for (let i = 0; i < 5; i++) g.fillRect(rand() * w, h * 0.62, 3, 20 + rand() * 80);
  });
}

function floorTexture(w, h) {
  const rand = seeded(3);
  return canvasTexture(256, 256, (g, cw, ch) => {
    g.fillStyle = '#2a2d30'; g.fillRect(0, 0, cw, ch);
    g.strokeStyle = '#1a1c1e'; g.lineWidth = 3;
    for (let i = 0; i <= cw; i += 32) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, ch); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(cw, i); g.stroke();
    }
    g.strokeStyle = '#3c4044'; g.lineWidth = 8; g.strokeRect(0, 0, cw, ch);
    grime(g, cw, ch, rand, 25, 0.35);
  }, [w, h]);
}

function drawMascot(g, cx, cy, r) {
  g.save();
  g.lineWidth = r * 0.08;
  g.strokeStyle = '#2d2a26';
  g.fillStyle = '#e9e4d4'; // helmet
  g.beginPath(); g.arc(cx, cy, r * 1.25, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#f6d7a8'; // face
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill(); g.stroke();
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
    g.fillText('STATION 9 · BRIGHTWELL DYNAMICS', 34, h - 36);
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
        g.fillStyle = layout.isDoor(x, z) ? '#d8c27a' : layout.isCorridor(x, z) ? '#53716a' : '#355048';
        g.fillRect(ox + x * s, oy + z * s, s - 1, s - 1);
      }
    }
    g.fillStyle = '#cde8dc';
    g.font = 'bold 13px sans-serif';
    for (const r of layout.rooms) {
      g.fillText(r.name.toUpperCase(), ox + (r.cx + 0.5) * s, oy + (r.cz + 0.5) * s + 4);
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
    ['Good evening,', 'operative!', 'Your safety is', 'our priority.'].forEach((t, i) => g.fillText(t, 110, 62 + i * 20));
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
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w * TILE, h * TILE),
    std({ map: floorTexture(w, h), roughness: 0.7, metalness: 0.4 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((w * TILE) / 2, 0, (h * TILE) / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w * TILE, h * TILE),
    std({ color: 0x1b1d20, roughness: 1 }),
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
  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(TILE, WALL_H, TILE),
    std({ map: wallTexture(), roughness: 0.85, metalness: 0.25 }),
    wallCells.length,
  );
  const m = new THREE.Matrix4();
  wallCells.forEach(([x, z], i) => walls.setMatrixAt(i, m.makeTranslation(cellCenter(x), WALL_H / 2, cellCenter(z))));
  scene.add(walls);

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
  const doorMat = std({ color: 0x5d6166, roughness: 0.5, metalness: 0.7 });
  const lampRed = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const lampGreen = new THREE.MeshBasicMaterial({ color: 0x2aff7a });
  const doorGeo = new THREE.BoxGeometry(1, 1, 1);
  const doors = layout.doors.map((d) => {
    const mesh = new THREE.Mesh(doorGeo, doorMat);
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
    const door = { ...d, x, z, mesh, lamps, closed: false, t: 0 };
    return door;
  });
  const doorByKey = new Map(doors.map((d) => [key(d.cx, d.cz), d]));
  const setDoor = (door, closed) => {
    door.closed = closed;
    for (const l of door.lamps) l.material = closed ? lampRed : lampGreen;
  };
  for (const d of doors) if (d.startClosed) { setDoor(d, true); d.t = 1; }

  // Room lights -------------------------------------------------------------
  const rooms = layout.rooms.map((room) => {
    const light = new THREE.PointLight(EMERGENCY.color, EMERGENCY.intensity, 13, 2);
    light.position.set(cellCenter(room.cx), WALL_H - 0.4, cellCenter(room.cz));
    scene.add(light);
    const fixtureMat = new THREE.MeshBasicMaterial({ color: EMERGENCY.color });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), fixtureMat);
    fixture.position.set(light.position.x, WALL_H - 0.03, light.position.z);
    scene.add(fixture);
    return { room, light, fixtureMat, base: { ...EMERGENCY }, mult: 1, beat: 0 };
  });
  let powered = false;
  const setPower = (on) => {
    powered = on;
    for (const r of rooms) {
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

  // Posters -----------------------------------------------------------------
  const poster = (roomId, side, tex, wM = 1.3, hM = 1.95, y = 1.75) => {
    const s = wallSpot(layout.room(roomId), side);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), std({ map: tex, roughness: 0.9 }));
    mesh.position.set(s.x, y, s.z);
    mesh.rotation.y = s.rot;
    scene.add(mesh);
  };
  poster('airlock', 'n', posterTexture(['A BRIGHTER', 'TOMORROW.', 'TOGETHER.'], '#b3332a'));
  poster('storage', 'w', posterTexture(['SMALL STEPS.', 'BIG', 'POSSIBILITIES.'], '#b3332a'));
  poster('generator', 'w', posterTexture(['POWER IS A', 'PRIVILEGE.', 'EARN IT.'], '#2f6e4a'));
  poster('comms', 'e', posterTexture(["WE'RE", 'ALWAYS', 'LISTENING.'], '#b3332a'));
  poster('teleporter', 'w', posterTexture(['STEP IN.', 'STEP OUT.', 'STEP UP.'], '#2f4f6e'));
  poster('pod', 's', posterTexture(['LEAVING', 'SO SOON?', "WE'LL MISS YOU."], '#b3332a'));
  poster('control', 'n', mapTexture(layout), 2.4, 2.1, 1.85);

  // Per-frame animation -----------------------------------------------------
  function update(dt, time) {
    for (const d of doors) {
      const target = d.closed ? 1 : 0;
      d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * 2.2);
      d.mesh.position.y = WALL_H / 2 + (1 - d.t) * (WALL_H - 0.18);
    }
    for (const r of rooms) {
      let k = r.mult;
      if (r.beat > 0) { r.beat -= dt; k *= 0.25; }
      // Emergency lights hum and stutter a little on their own.
      if (!powered || r.room.id === 'pod') k *= 0.85 + 0.15 * Math.sin(time * 3 + r.room.index * 1.7);
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
    doors, rooms, props, interactables, setDoor, setPower, update,
    doorAt: (x, z) => doorByKey.get(key(x, z)),
    get powered() { return powered; },
    // Dim every room for a moment (the Hat Man's tell).
    dimBeat(seconds) { for (const r of rooms) r.beat = seconds; },
  };
}

// The alien: a dark, wet, roughly-there shape. You mostly see it as highlights in your flashlight.
export function makeAlienMesh() {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.22, metalness: 0.85 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 6, 12), skin);
  body.position.set(0, 1.15, -0.1);
  body.rotation.x = 0.55;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), skin);
  head.scale.set(1, 0.8, 1.7);
  head.position.set(0, 1.75, 0.35);
  group.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 6; i++) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018 + (i % 3) * 0.006, 6, 4), eyeMat);
    eye.position.set((i - 2.5) * 0.07, 1.8 + ((i * 37) % 5) * 0.03, 0.82 - Math.abs(i - 2.5) * 0.04);
    group.add(eye);
  }
  const limbs = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(Math.cos(a) * 0.25, 1.2, Math.sin(a) * 0.25 - 0.1);
    const limb = new THREE.Mesh(new THREE.ConeGeometry(0.06, 1.4, 6), skin);
    limb.position.y = -0.7;
    pivot.add(limb);
    pivot.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
    pivot.userData = { a, base: pivot.rotation.clone() };
    group.add(pivot);
    limbs.push(pivot);
  }
  group.userData.limbs = limbs;
  return group;
}

export function animateAlienMesh(mesh, alien, time) {
  mesh.position.set(alien.pos.x, Math.sin(time * 2.3) * 0.04, alien.pos.z);
  // Turn smoothly toward its heading.
  let d = alien.heading - mesh.rotation.y;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  mesh.rotation.y += d * 0.15;
  const speed = alien.moving ? (alien.state === 'hunt' ? 14 : 6) : 1.5;
  for (const p of mesh.userData.limbs) {
    const { a, base } = p.userData;
    p.rotation.x = base.x + Math.sin(time * speed + a * 3) * 0.35;
    p.rotation.z = base.z + Math.cos(time * speed * 0.8 + a * 2) * 0.25;
  }
}
