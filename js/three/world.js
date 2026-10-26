// three.js renderer: builds the station's meshes and lights from the layout, and animates doors and lights.
// Textures come from the shared canvas recipes in js/textures.js.
import * as THREE from 'three';
import { TILE, WALL_H, cellCenter, key } from '../layout.js';
import { buildDecor } from './decor.js';
import { toTexture } from './textures.js';
import { wallTexture, floorTextures, ceilingTexture, doorTexture, posterTexture, mapTexture, screenTexture, wallSpot } from '../textures.js';
import {
  wallCells, guideStrips, propPlacement, propHeight, POSTERS, WALL_MAP, EMBLEM, looseItems,
  stepDoor, roomLightLevel, teleporterLevel, roomState, roomBase,
} from '../worldplan.js';

const T = (c) => toTexture(c, 4);

export function buildWorld(scene, layout) {
  const { w, h } = layout;
  const std = (o) => new THREE.MeshStandardMaterial(o);

  // Floor and ceiling ------------------------------------------------------
  const floorTex = floorTextures(layout);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(w * TILE, h * TILE),
    std({ map: T(floorTex.map), roughnessMap: toTexture(floorTex.rough), roughness: 1, metalness: 0.45 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((w * TILE) / 2, 0, (h * TILE) / 2);
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(w * TILE, h * TILE),
    std({ map: T(ceilingTexture(layout)), roughness: 0.95 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set((w * TILE) / 2, WALL_H, (h * TILE) / 2);
  scene.add(ceiling);

  // Walls: a block in every empty cell that touches floor, in three mixed finishes --------
  const m = new THREE.Matrix4();
  const walls = wallCells(layout);
  const wallGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  [0, 1, 2].forEach((v) => {
    const cells = walls.filter((c) => c.variant === v);
    if (!cells.length) return;
    const mesh = new THREE.InstancedMesh(wallGeo, std({ map: T(wallTexture(v)), roughness: 0.85, metalness: 0.25 }), cells.length);
    cells.forEach((c, i) => mesh.setMatrixAt(i, m.makeTranslation(cellCenter(c.x), WALL_H / 2, cellCenter(c.z))));
    scene.add(mesh);
  });

  // Corridor guide strips: emissive only, so they cost no lighting ----------
  const strips = guideStrips(layout);
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
  const doorMat = std({ map: T(doorTexture('#62666b')), roughness: 0.55, metalness: 0.6 });
  const hatchMat = std({ map: T(doorTexture('#2f6e6a')), roughness: 0.45, metalness: 0.65 }); // safe-room hatches
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
    const r = roomState(room);
    const base = r.base;
    const light = new THREE.PointLight(base.color, base.intensity, room.safe ? 7 : 13, 2);
    light.position.set(cellCenter(room.cx), WALL_H - 0.4, cellCenter(room.cz));
    scene.add(light);
    const fixtureMat = new THREE.MeshBasicMaterial({ color: base.color });
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.3), fixtureMat);
    fixture.position.set(light.position.x, WALL_H - 0.03, light.position.z);
    scene.add(fixture);
    return Object.assign(r, { light, fixtureMat });
  });
  let powered = false;
  const setPower = (on) => {
    powered = on;
    for (const r of rooms) {
      if (r.room.safe) continue;
      r.base = roomBase(r.room, on);
      r.light.color.set(r.base.color);
      r.fixtureMat.color.set(r.base.color);
    }
  };

  // Props -------------------------------------------------------------------
  const screenTex = T(screenTexture());
  const props = {};
  const interactables = [];
  for (const p of layout.props) {
    const { x, z, rotY } = propPlacement(layout, p);
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    const status = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }));
    const height = propHeight(p);

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

  // Pipes, patches, broken lights and leaks. Its sounds go to whoever sets world.onDecorEvent.
  let onDecorEvent = null;
  const decor = buildDecor(scene, layout, { onEvent: (type, at) => onDecorEvent?.(type, at) });

  // Loose props: chairs and boxes that don't block anything. The prop trick moves them.
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
  const clutterCells = new Set(decor.plan.clutter.map((c) => key(c.cell[0], c.cell[1])));
  const loose = looseItems(layout, clutterCells).map((it) => {
    const mesh = it.kind === 'chair' ? makeChair() : makeBox();
    mesh.position.set(it.x, 0, it.z);
    mesh.rotation.y = it.rotY;
    scene.add(mesh);
    return { mesh, room: it.room, spots: it.spots };
  });

  // Posters -----------------------------------------------------------------
  const poster = (roomId, side, tex, wM = 1.3, hM = 1.95, y = 1.75) => {
    const s = wallSpot(layout.room(roomId), side);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), std({ map: T(tex), roughness: 0.9 }));
    mesh.position.set(s.x, y, s.z);
    mesh.rotation.y = s.rot;
    scene.add(mesh);
  };
  for (const [room, side, lines, accent, wM, hM] of POSTERS) poster(room, side, posterTexture(lines, accent), wM, hM);
  poster(WALL_MAP.room, WALL_MAP.side, mapTexture(layout), WALL_MAP.w, WALL_MAP.h, WALL_MAP.y);

  // The station emblem on the airlock's back wall, in a dark frame.
  {
    const s = wallSpot(layout.room(EMBLEM.room), EMBLEM.side);
    const tex = new THREE.TextureLoader().load(EMBLEM.src);
    tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(EMBLEM.frame, EMBLEM.frame, 0.06), std({ color: 0x1c1d1f, roughness: 0.5, metalness: 0.7 }));
    frame.position.set(s.x, EMBLEM.y, s.z);
    frame.rotation.y = s.rot;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(EMBLEM.size, EMBLEM.size), std({ map: tex, roughness: 0.6, metalness: 0.2 }));
    sign.position.set(0, 0, 0.032);
    frame.add(sign);
    scene.add(frame);
  }

  // Per-frame animation -----------------------------------------------------
  // alien: { pos, state } so a room's light can stutter as it passes through (the patrol tell).
  function update(dt, time, alien = null, player = null) {
    decor.update(dt, time, player);
    for (const d of doors) d.mesh.position.y = stepDoor(d, dt);
    for (const r of rooms) {
      const k = roomLightLevel(r, dt, time, alien, powered);
      r.light.intensity = r.base.intensity * k;
      r.fixtureMat.color.set(r.base.color).multiplyScalar(Math.max(0.05, k));
    }
    if (props.teleporterLight) {
      props.teleporterLight.intensity = teleporterLevel(time);
      props.teleporterRing.rotation.y += dt * 0.4;
    }
  }

  return {
    doors, rooms, props, interactables, loose, decor, setDoor, setPower, update,
    set onDecorEvent(fn) { onDecorEvent = fn; },
    // A terminal you've read turns green.
    markRead(id) { props[id]?.status.material.color.set(0x2aff7a); },
    // A prop's status light (a finished repair turns green).
    setStatus(id, hex) { props[id]?.status.material.color.set(hex); },
    // The comms screen lights up once the rescue call is out.
    setCommsLit() { props.commsScreen.material.color.set(0x2a8a6a); },
    // Live positions that looping sounds follow.
    anchors: { teleporter: props.teleporter.position, generator: props.generator.group.position },
    doorAt: (x, z) => doorByKey.get(key(x, z)),
    get powered() { return powered; },
    // Dim every room for a moment (the Hat Man's tell).
    dimBeat(seconds) { for (const r of rooms) r.beat = seconds; },
  };
}

