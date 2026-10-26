// Babylon.js renderer: builds the station's meshes and lights from the layout, and animates doors
// and lights. Placement comes from js/worldplan.js and textures from js/textures.js.
import { TILE, WALL_H, cellCenter, key } from '../layout.js';
import {
  wallTexture, floorTextures, ceilingTexture, doorTexture, posterTexture, mapTexture, wallSpot,
  consoleScreen, LIVE_SCREENS, keyboardTexture, stickyNote, mugTexture, housingTexture,
} from '../textures.js';
import {
  wallPanels, guideStrips, propPlacement, propHeight, POSTERS, WALL_MAP, EMBLEM, looseItems,
  stepDoor, roomLightLevel, teleporterLevel, roomState, roomBase,
} from '../worldplan.js';
import { buildDecor } from './decor.js';
import { furnitureKit, buildFurniture } from './furniture.js';
import { buildSuites } from './suites.js';
import { paddedSuite } from '../suiteplan.js';
import { pbr, basic, toTexture, redraw, srgb, linear, compose, instances, TUNING } from './util.js';

// Console status lights: Marigold until you've heard its tape, then Soft Teal (terminals spec).
const UNREAD = 0xf2a92e, READ = 0x5fb3a8;

export function buildWorld(scene, layout) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, Vector3, TransformNode, PointLight } = BABYLON;
  const { w, h } = layout;
  const T = (c) => toTexture(scene, c, { anisotropy: 4 });
  const TBox = (c) => toTexture(scene, c, { anisotropy: 4, flipV: true }); // for box faces
  // Planes on walls are turned to face into the room, which shows their image mirrored; mirror it back.
  const TWall = (c) => toTexture(scene, c, { anisotropy: 4, mirror: true });
  const node = (name, parent = null) => { const n = new TransformNode(name, scene); if (parent) n.parent = parent; return n; };
  const pointLight = (hex, intensity, range, pos) => {
    const l = new PointLight('light', new Vector3(pos[0], pos[1], pos[2]), scene);
    l.diffuse = linear(hex);
    l.specular = linear(hex);
    l.intensity = intensity * TUNING.light;
    l.range = range;
    return l;
  };

  // Floor and ceiling ------------------------------------------------------
  const floorTex = floorTextures(layout);
  const floor = MeshBuilder.CreateGround('floor', { width: w * TILE, height: h * TILE }, scene);
  floor.position.set((w * TILE) / 2, 0, (h * TILE) / 2);
  const floorMat = pbr(scene, { map: T(floorTex.map), roughness: 1, metalness: 0.45 });
  // The wet patches: roughness comes from the map's green channel.
  floorMat.metallicTexture = toTexture(scene, floorTex.rough);
  floorMat.useRoughnessFromMetallicTextureGreen = true;
  floorMat.useMetallnessFromMetallicTextureBlue = false;
  floorMat.useRoughnessFromMetallicTextureAlpha = false;
  floor.material = floorMat;

  // A ground faces up (CreateGround ignores sideOrientation), so turn it over to face down into the rooms.
  const ceiling = MeshBuilder.CreateGround('ceiling', { width: w * TILE, height: h * TILE }, scene);
  ceiling.rotation.x = Math.PI;
  ceiling.position.set((w * TILE) / 2, WALL_H, (h * TILE) / 2);
  ceiling.material = pbr(scene, { map: T(ceilingTexture(layout)), roughness: 0.95 });

  // Walls: flat panels following the station's outline (angled corners, curves), in three finishes.
  // The wellness suites' walls are padded instead (js/babylon/suites.js).
  const panels = wallPanels(layout).filter((p) => !paddedSuite(layout, p));
  [0, 1, 2].forEach((v) => {
    const list = panels.filter((p) => p.variant === v);
    if (!list.length) return;
    const positions = [], normals = [], uvs = [], indices = [];
    for (const p of list) {
      const i = positions.length / 3;
      positions.push(p.ax, 0, p.az, p.bx, 0, p.bz, p.bx, WALL_H, p.bz, p.ax, WALL_H, p.az);
      for (let k = 0; k < 4; k++) normals.push(p.nx, 0, p.nz);
      uvs.push(p.u0, 0, p.u1, 0, p.u1, 1, p.u0, 1);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    const mesh = new BABYLON.Mesh('walls' + v, scene);
    Object.assign(new BABYLON.VertexData(), { positions, normals, uvs, indices }).applyToMesh(mesh);
    const mat = pbr(scene, { map: T(wallTexture(v)), roughness: 0.85, metalness: 0.25 });
    mat.backFaceCulling = false; // single-sided panels; seen only from the walkable side anyway
    mat.twoSidedLighting = true;
    mesh.material = mat;
  });

  // Corridor guide strips: unlit, so they cost no lighting ----------
  const stripMesh = MeshBuilder.CreateBox('strips', { width: 0.7, height: 0.04, depth: 0.08 }, scene);
  stripMesh.material = basic(scene, 0x7a2a12);
  instances(stripMesh, guideStrips(layout).map((s) => compose([s.x, 0.03, s.z], [0, s.rot, 0], [1, 1, 1])));

  // Doors -------------------------------------------------------------------
  const doorMat = pbr(scene, { map: TBox(doorTexture('#62666b')), roughness: 0.55, metalness: 0.6 });
  const hatchMat = pbr(scene, { map: TBox(doorTexture('#2f6e6a')), roughness: 0.45, metalness: 0.65 }); // safe-room hatches
  const lampRed = basic(scene, 0xff2a1a);
  const lampGreen = basic(scene, 0x2aff7a);
  const doors = layout.doors.map((d) => {
    const along = d.axis === 'x';
    const mesh = MeshBuilder.CreateBox('door', { width: along ? 0.25 : TILE, height: WALL_H, depth: along ? TILE : 0.25 }, scene);
    mesh.material = d.safe ? hatchMat : doorMat;
    const x = cellCenter(d.cx), z = cellCenter(d.cz);
    mesh.position.set(x, WALL_H / 2, z);
    const lamps = [-1, 1].map((side) => {
      const lamp = MeshBuilder.CreateBox('lamp', { width: 0.5, height: 0.08, depth: 0.08 }, scene);
      lamp.material = lampGreen;
      if (along) { lamp.rotation.y = Math.PI / 2; lamp.position.set(x + side * 0.4, WALL_H - 0.08, z); }
      else lamp.position.set(x, WALL_H - 0.08, z + side * 0.4);
      return lamp;
    });
    return { ...d, x, z, mesh, lamps, closed: false, closedByPlayer: false, t: 0 };
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
    const pos = [cellCenter(room.cx), WALL_H - 0.4, cellCenter(room.cz)];
    const light = pointLight(r.base.color, r.base.intensity, room.safe ? 7 : 13, pos);
    const fixtureMat = basic(scene, r.base.color);
    const fixture = MeshBuilder.CreateBox('fixture', { width: 1.6, height: 0.06, depth: 0.3 }, scene);
    fixture.position.set(pos[0], WALL_H - 0.03, pos[2]);
    fixture.material = fixtureMat;
    return Object.assign(r, { light, fixtureMat });
  });
  let powered = false;
  const setPower = (on) => {
    powered = on;
    for (const r of rooms) {
      if (r.room.safe) continue;
      r.base = roomBase(r.room, on);
      r.light.diffuse = linear(r.base.color);
      r.light.specular = linear(r.base.color);
    }
  };

  // Consoles ----------------------------------------------------------------
  // A desk with a chunky, slightly tilted monitor (thick worn bezel, star badge, glowing screen),
  // a keyboard, and sometimes a sticky note or a Skipper mug. Built facing +Z inside `group`.
  const housingMat = pbr(scene, { map: T(housingTexture()), roughness: 0.6, metalness: 0.25 });
  const deskMat = pbr(scene, { color: 0x4d5154, roughness: 0.7, metalness: 0.5 });
  const keysMat = pbr(scene, { map: T(keyboardTexture()), roughness: 0.8 });
  const darkMat = pbr(scene, { color: 0x1d1f21, roughness: 0.6, metalness: 0.3 });
  const badgeMat = basic(scene, 0xf2a92e);
  const mugMat = pbr(scene, { map: TWall(mugTexture()), roughness: 0.5 });
  const consoles = [];
  function makeConsole(group, p) {
    const part = (mesh, parent, x, y, z, mat) => { mesh.parent = parent; mesh.position.set(x, y, z); mesh.material = mat; return mesh; };
    part(MeshBuilder.CreateBox('desk', { width: 1.3, height: 0.74, depth: 0.7 }, scene), group, 0, 0.37, -0.1, deskMat);
    const mon = node('monitor', group);
    mon.position.set(0, 0.74, -0.2);
    mon.rotation.x = -0.12; // leans back a little
    part(MeshBuilder.CreateBox('stand', { width: 0.26, height: 0.06, depth: 0.24 }, scene), mon, 0, 0.03, 0, darkMat);
    part(MeshBuilder.CreateBox('housing', { width: 0.8, height: 0.6, depth: 0.44 }, scene), mon, 0, 0.36, 0, housingMat);
    const screenZ = 0.222;
    const canvas = consoleScreen(p.screen, { stage: 0, layout });
    const tex = TWall(canvas);
    const screen = part(MeshBuilder.CreatePlane('screen', { width: 0.62, height: 0.39 }, scene), mon, 0, 0.38, screenZ, basic(scene, 0, { map: tex }));
    screen.rotation.y = Math.PI; // Babylon planes face -Z; turn it to face out of the monitor
    // A soft glow just in front: it reads as light in the dark without lighting anything.
    const glow = part(MeshBuilder.CreatePlane('glow', { width: 0.78, height: 0.54 }, scene), mon, 0, 0.38, screenZ + 0.02,
      basic(scene, 0x5fb3a8, { additive: true, alpha: 0.07 }));
    glow.rotation.y = Math.PI;
    glow.material.disableDepthWrite = true;
    const badge = part(MeshBuilder.CreateCylinder('badge', { diameter: 0.05, height: 0.01, tessellation: 10 }, scene), mon, -0.34, 0.62, screenZ, badgeMat);
    badge.rotation.x = Math.PI / 2;
    part(MeshBuilder.CreateBox('keyboard', { width: 0.56, height: 0.035, depth: 0.2 }, scene), group, 0, 0.758, 0.12, darkMat);
    const keys = part(MeshBuilder.CreateGround('keys', { width: 0.54, height: 0.18 }, scene), group, 0, 0.777, 0.12, keysMat);
    keys.rotation.y = Math.PI;
    if (p.note) {
      const note = part(MeshBuilder.CreatePlane('note', { width: 0.13, height: 0.13 }, scene), mon, -0.32, 0.13, screenZ + 0.004,
        pbr(scene, { map: TWall(stickyNote(p.note)), roughness: 0.9 }));
      note.rotation.set(0, Math.PI, 0.08);
    }
    if (p.mug) {
      const mug = part(MeshBuilder.CreateCylinder('mug', { diameter: 0.085, height: 0.1, tessellation: 14 }, scene), group, 0.5, 0.79, 0.15, mugMat);
      mug.rotation.y = -0.6;
      const handle = part(MeshBuilder.CreateTorus('handle', { diameter: 0.06, thickness: 0.012, tessellation: 12 }, scene), mug, 0.05, 0, 0, mugMat);
      handle.rotation.x = Math.PI / 2;
    }
    consoles.push({ p, tex, screen, live: LIVE_SCREENS.has(p.screen), flicker: 0 });
    // The status light: bottom right of the bezel, in the group's frame (the monitor tilts slightly).
    return { lightPos: [0.33, 0.74 + 0.07, -0.2 + screenZ + 0.01] };
  }

  // Props -------------------------------------------------------------------
  const props = {};
  const interactables = [];
  for (const p of layout.props) {
    const { x, z, rotY } = propPlacement(layout, p);
    const group = node('prop-' + p.id);
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    const add = (mesh, px, py, pz) => { mesh.parent = group; mesh.position.set(px, py, pz); return mesh; };
    const statusMat = basic(scene, 0xff2a1a);
    const status = MeshBuilder.CreateSphere('status', { diameter: 0.14, segments: 6 }, scene);
    status.material = statusMat;
    let statusPos = [0, 1, 0];

    if (p.id === 'generator') {
      add(MeshBuilder.CreateBox('gen', { width: 1.5, height: 1.3, depth: 1.3 }, scene), 0, 0.65, 0).material = pbr(scene, { color: 0x55524a, roughness: 0.6, metalness: 0.6 });
      for (const side of [-0.45, 0.45]) {
        add(MeshBuilder.CreateCylinder('coil', { diameter: 0.44, height: 0.9, tessellation: 12 }, scene), side, 1.75, 0).material = pbr(scene, { color: 0x8a6a3a, metalness: 0.8, roughness: 0.4 });
      }
      statusPos = [0, 1.1, 0.67];
    } else if (p.id === 'comms') {
      add(MeshBuilder.CreateBox('desk', { width: 1.5, height: 0.95, depth: 0.9 }, scene), 0, 0.48, 0).material = pbr(scene, { color: 0x3d4a52, roughness: 0.6, metalness: 0.5 });
      const screen = add(MeshBuilder.CreatePlane('screen', { width: 1.1, height: 0.55, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, scene), 0, 1.3, 0.2);
      screen.rotation.x = -0.25;
      screen.material = basic(scene, 0x103a33);
      add(MeshBuilder.CreateCylinder('mast', { diameter: 0.06, height: 1.2 }, scene), 0.6, 1.55, -0.3).material = pbr(scene, { color: 0x777777, metalness: 0.9, roughness: 1 });
      statusPos = [-0.6, 1.0, 0.46];
      props.commsScreen = screen;
    } else if (p.id === 'pod') {
      const pod = add(MeshBuilder.CreateCapsule('pod', { radius: 0.65, height: 0.8 + 1.3, tessellation: 16 }, scene), 0, 0.85, 0);
      pod.rotation.z = Math.PI / 2;
      pod.material = pbr(scene, { color: 0xcfcbbf, roughness: 0.4, metalness: 0.3 });
      const win = add(MeshBuilder.CreateSphere('window', { diameter: 0.7, segments: 8 }, scene), 0.3, 1.15, 0.45);
      win.scaling.set(1.2, 0.7, 0.5);
      win.material = pbr(scene, { color: 0x0a1418, roughness: 0.1, metalness: 0.9 });
      statusPos = [-0.7, 1.35, 0.5];
    } else if (p.id === 'crate') {
      add(MeshBuilder.CreateBox('crate', { width: 1.3, height: 0.8, depth: 0.9 }, scene), 0, 0.4, 0).material = pbr(scene, { color: 0x4b5232, roughness: 0.8 });
      add(MeshBuilder.CreateBox('stripe', { width: 1.32, height: 0.12, depth: 0.92 }, scene), 0, 0.62, 0).material = pbr(scene, { color: 0xc9a227, roughness: 0.6 });
      statusPos = [0, 0.9, 0];
      statusMat.emissiveColor = srgb(0xffaa33);
    } else if (p.kind === 'log' || p.kind === 'console') {
      // A desk console like the reference sheet; its status light is the one built above.
      const c = makeConsole(group, p);
      statusPos = c.lightPos;
      status.scaling.setAll(0.3); // a small light on the bezel, about 4 cm across
      statusMat.emissiveColor = srgb(p.kind === 'log' ? UNREAD : READ);
    } else if (p.id === 'teleporter') {
      add(MeshBuilder.CreateCylinder('pad', { diameterTop: 2.0, diameterBottom: 2.2, height: 0.2, tessellation: 24 }, scene), 0, 0.1, 0).material = pbr(scene, { color: 0x3a4248, metalness: 0.8, roughness: 0.3 });
      // The ring stands upright like a gate and slowly turns.
      const spin = node('ring-spin', group);
      spin.position.y = 1.3;
      const ring = MeshBuilder.CreateTorus('ring', { diameter: 1.9, thickness: 0.18, tessellation: 32 }, scene);
      ring.parent = spin;
      ring.rotation.x = Math.PI / 2;
      ring.material = pbr(scene, { color: 0x8aa4b8, metalness: 0.9, roughness: 0.25 });
      add(MeshBuilder.CreateSphere('core', { diameter: 0.24, segments: 8 }, scene), 0, 1.3, 0).material = basic(scene, 0x9fd0ff);
      const light = pointLight(0x5aa0ff, 6, 11, [0, 0, 0]);
      light.parent = group;
      light.position.set(0, 1.4, 0);
      props.teleporterLight = light;
      props.teleporterRing = spin;
      props.teleporter = group;
    }
    if (p.kind === 'console') {
      add(status, ...statusPos); // set dressing: a light, but nothing to use
    } else if (p.kind !== 'scenery') {
      add(status, ...statusPos);
      props[p.id] = { group, status: statusMat };
      interactables.push({ id: p.id, kind: p.kind, label: p.label, duration: p.duration, pos: { x, y: propHeight(p), z }, range: 2.7 });
    } else {
      status.dispose();
    }
  }
  for (const d of doors) {
    interactables.push({ id: 'door', kind: 'door', door: d, pos: { x: d.x, y: 1.4, z: d.z }, range: 2.6 });
  }

  // Pipes, patches, broken lights and leaks. Its sounds go to whoever sets world.onDecorEvent.
  let onDecorEvent = null;
  const decor = buildDecor(scene, layout, { onEvent: (type, at) => onDecorEvent?.(type, at) });

  // Furniture from the interiors sheet, plus the chairs, signs and windows that go with it.
  const kit = furnitureKit(scene);
  buildFurniture(scene, layout, kit);

  // The wellness suites: padded, bright, and their own light.
  const suites = buildSuites(scene, layout);

  // Loose props: chairs and boxes that don't block anything. The prop trick moves them.
  const boxMat = pbr(scene, { color: 0x5a4a32, roughness: 0.9 });
  const makeChair = () => kit.place('messChair', 0, 0, 0);
  const makeBox = () => {
    const g = node('box');
    const b = MeshBuilder.CreateBox('box', { width: 0.55, height: 0.45, depth: 0.45 }, scene);
    b.parent = g; b.position.y = 0.22; b.material = boxMat;
    return g;
  };
  const clutterCells = new Set(decor.plan.clutter.map((c) => key(c.cell[0], c.cell[1])));
  const loose = looseItems(layout, clutterCells).map((it) => {
    const mesh = it.kind === 'chair' ? makeChair() : makeBox();
    mesh.position.set(it.x, 0, it.z);
    mesh.rotation.y = it.rotY;
    return { mesh, room: it.room, spots: it.spots };
  });

  // Posters -----------------------------------------------------------------
  const poster = (roomId, side, canvas, wM = 1.3, hM = 1.95, y = 1.75) => {
    const s = wallSpot(layout.room(roomId), side);
    const mesh = MeshBuilder.CreatePlane('poster', { width: wM, height: hM }, scene);
    mesh.position.set(s.x, y, s.z);
    mesh.rotation.y = s.rot + Math.PI;
    mesh.material = pbr(scene, { map: TWall(canvas), roughness: 0.9 });
  };
  for (const [room, side, lines, accent, wM, hM] of POSTERS) poster(room, side, posterTexture(lines, accent), wM, hM);
  poster(WALL_MAP.room, WALL_MAP.side, mapTexture(layout), WALL_MAP.w, WALL_MAP.h, WALL_MAP.y);

  // The station emblem on the airlock's back wall, in a dark frame.
  {
    const s = wallSpot(layout.room(EMBLEM.room), EMBLEM.side);
    const frame = MeshBuilder.CreateBox('emblem-frame', { width: EMBLEM.frame, height: EMBLEM.frame, depth: 0.06 }, scene);
    frame.position.set(s.x, EMBLEM.y, s.z);
    frame.rotation.y = s.rot;
    frame.material = pbr(scene, { color: 0x1c1d1f, roughness: 0.5, metalness: 0.7 });
    const sign = MeshBuilder.CreatePlane('emblem', { width: EMBLEM.size, height: EMBLEM.size }, scene);
    sign.parent = frame;
    sign.position.z = 0.032;
    sign.rotation.y = Math.PI;
    const tex = new BABYLON.Texture(EMBLEM.src, scene);
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = -1; // mirrored back, as for posters
    sign.material = pbr(scene, { map: tex, roughness: 0.6, metalness: 0.2 });
  }

  // Per-frame animation -----------------------------------------------------
  function update(dt, time, alien = null, player = null) {
    decor.update(dt, time, player);
    suites.update(dt, time);
    // A screen that just changed flickers for a moment.
    for (const c of consoles) {
      if (c.flicker <= 0) continue;
      c.flicker -= dt;
      c.screen.isVisible = c.flicker <= 0 || Math.random() < 0.5;
    }
    for (const d of doors) d.mesh.position.y = stepDoor(d, dt);
    for (const r of rooms) {
      const k = roomLightLevel(r, dt, time, alien, powered);
      r.light.intensity = r.base.intensity * k * TUNING.light;
      r.fixtureMat.emissiveColor = srgb(r.base.color).scale(Math.max(0.05, k));
    }
    if (props.teleporterLight) {
      props.teleporterLight.intensity = teleporterLevel(time) * TUNING.light;
      props.teleporterRing.rotation.y += dt * 0.4;
    }
  }

  return {
    doors, rooms, props, interactables, loose, decor, setDoor, setPower, update,
    set onDecorEvent(fn) { onDecorEvent = fn; },
    markRead(id) { if (props[id]) props[id].status.emissiveColor = srgb(READ); },
    // Repairs change what some screens say (power online, signal sent, launch window open).
    setProgress(stage) {
      for (const c of consoles) {
        if (!c.live) continue;
        redraw(c.tex, consoleScreen(c.p.screen, { stage, layout }), { mirror: true });
        c.flicker = 0.6;
      }
    },
    setStatus(id, hex) { if (props[id]) props[id].status.emissiveColor = srgb(hex); },
    setCommsLit() { props.commsScreen.material.emissiveColor = srgb(0x2a8a6a); },
    anchors: { teleporter: props.teleporter.position, generator: props.generator.group.position },
    doorAt: (x, z) => doorByKey.get(key(x, z)),
    get powered() { return powered; },
    dimBeat(seconds) { for (const r of rooms) r.beat = seconds; },
  };
}
