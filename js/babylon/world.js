// Babylon.js renderer: builds the station's meshes and lights from the layout, and animates doors
// and lights. Placement comes from js/worldplan.js and textures from js/textures.js.
import { TILE, WALL_H, cellCenter, key } from '../layout.js';
import {
  wallTexture, floorTextures, ceilingTexture, doorTexture, posterTexture, mapTexture, wallSpot,
  consoleScreen, LIVE_SCREENS, keyboardTexture, stickyNote, mugTexture, housingTexture, hazardTexture, crtTexture,
  commsCallScreen, reactorPlateTexture, switchPanelTexture, SWITCH_GROUPS,
} from '../textures.js';
import {
  wallPanels, guideStrips, propPlacement, propHeight, POSTERS, WALL_MAP, EMBLEM, looseItems,
  stepDoor, roomLightLevel, teleporterLevel, roomState, roomBase, doorFrames, FRAME, kickPlateSpans, generatorFixtures,
} from '../worldplan.js';
import { buildDecor } from './decor.js';
import { furnitureKit, buildFurniture } from './furniture.js';
import { buildSuites } from './suites.js';
import { buildVentMeshes } from './vents.js';
import { cutVentHoles } from '../vents.js';
import { paddedSuite } from '../suiteplan.js';
import { grateSpots } from '../vents.js';
import { pbr, basic, toTexture, redraw, srgb, linear, compose, instances, TUNING, bevelBox } from './util.js';

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
  // Relief from scanned metal plate (2 m tiles); roughness stays from the wet-patch map below.
  const floorMat = pbr(scene, { map: T(floorTex.map), roughness: 1, metalness: 0.45, surface: 'floor', tile: [w, h], bump: 0.8, rough: false });
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
  ceiling.material = pbr(scene, { map: T(ceilingTexture(layout)), roughness: 0.95, surface: 'ceiling', tile: [w, h], bump: 0.6 });

  // Walls: flat panels following the station's outline (angled corners, curves), in three finishes.
  // The wellness suites' walls are padded instead (js/babylon/suites.js).
  // The wall vents' openings are cut out (js/vents.js cutVentHoles), so you can see out from inside.
  const panels = cutVentHoles(wallPanels(layout).filter((p) => !paddedSuite(layout, p)), layout);
  [0, 1, 2].forEach((v) => {
    const list = panels.filter((p) => p.variant === v);
    if (!list.length) return;
    const positions = [], normals = [], uvs = [], indices = [];
    for (const p of list) {
      const i = positions.length / 3;
      const y0 = p.y0 ?? 0, y1 = p.y1 ?? WALL_H; // a piece round a vent opening can be a strip
      positions.push(p.ax, y0, p.az, p.bx, y0, p.bz, p.bx, y1, p.bz, p.ax, y1, p.az);
      for (let k = 0; k < 4; k++) normals.push(p.nx, 0, p.nz);
      uvs.push(p.u0, y0 / WALL_H, p.u1, y0 / WALL_H, p.u1, y1 / WALL_H, p.u0, y1 / WALL_H);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    const mesh = new BABYLON.Mesh('walls' + v, scene);
    Object.assign(new BABYLON.VertexData(), { positions, normals, uvs, indices }).applyToMesh(mesh);
    // Wall UVs run 1 per 2 m along and 1 per 3 m up; the scans tile about every metre.
    const mat = pbr(scene, { map: T(wallTexture(v)), roughness: 0.85, metalness: 0.25, surface: v === 0 ? 'panel' : 'rust', tile: [2, 3] });
    mat.backFaceCulling = false; // single-sided panels; seen only from the walkable side anyway
    mat.twoSidedLighting = true;
    mesh.material = mat;
  });

  // Trims along every wall: a kick plate at the floor and a deeper trim at the ceiling, so walls
  // meet floor and ceiling with an edge instead of a flat seam.
  {
    const positions = [], normals = [], uvs = [], indices = [];
    const quad = (pts, n, uv) => {
      const i = positions.length / 3;
      for (const p of pts) positions.push(...p);
      for (let k = 0; k < 4; k++) normals.push(...n);
      uvs.push(...uv);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    const trim = (p, y0, y1, out, capAt, capUp) => {
      const ox = p.nx * out, oz = p.nz * out;
      const u0 = p.u0 * 2, u1 = p.u1 * 2;
      quad([[p.ax + ox, y0, p.az + oz], [p.bx + ox, y0, p.bz + oz], [p.bx + ox, y1, p.bz + oz], [p.ax + ox, y1, p.az + oz]], [p.nx, 0, p.nz], [u0, 0, u1, 0, u1, 1, u0, 1]);
      quad([[p.ax, capAt, p.az], [p.bx, capAt, p.bz], [p.bx + ox, capAt, p.bz + oz], [p.ax + ox, capAt, p.az + oz]], [0, capUp ? 1 : -1, 0], [u0, 0, u1, 0, u1, 0.1, u0, 0.1]);
    };
    // A piece of panel p from fraction k0 to k1 along it.
    const part = (p, k0, k1) => ({ ...p, ax: p.ax + (p.bx - p.ax) * k0, az: p.az + (p.bz - p.az) * k0, bx: p.ax + (p.bx - p.ax) * k1, bz: p.az + (p.bz - p.az) * k1,
      u0: p.u0 + (p.u1 - p.u0) * k0, u1: p.u0 + (p.u1 - p.u0) * k1 });
    const grates = grateSpots(layout);
    // Whole panels, before any are cut round vent holes, so each wall gets one run of trim.
    for (const p of wallPanels(layout).filter((q) => !paddedSuite(layout, q))) {
      for (const [k0, k1] of kickPlateSpans(p, grates)) trim(part(p, k0, k1), 0, 0.16, 0.035, 0.16, true); // broken round wall vents
      trim(p, WALL_H - 0.14, WALL_H, 0.045, WALL_H - 0.14, false);
    }
    const mesh = new BABYLON.Mesh('wall-trims', scene);
    Object.assign(new BABYLON.VertexData(), { positions, normals, uvs, indices }).applyToMesh(mesh);
    const mat = pbr(scene, { color: 0x34383b, roughness: 0.55, metalness: 0.7, surface: 'panel', tile: [1, 0.2] });
    mat.backFaceCulling = false;
    mat.twoSidedLighting = true;
    mesh.material = mat;
  }

  // Corridor guide strips: unlit, so they cost no lighting ----------
  const stripMesh = MeshBuilder.CreateBox('strips', { width: 0.7, height: 0.04, depth: 0.08 }, scene);
  stripMesh.material = basic(scene, 0x7a2a12);
  instances(stripMesh, guideStrips(layout).map((s) => compose([s.x, 0.03, s.z], [0, s.rot, 0], [1, 1, 1])));

  // Doors -------------------------------------------------------------------
  const doorMat = pbr(scene, { map: TBox(doorTexture('#62666b')), roughness: 0.55, metalness: 0.6, surface: 'painted', tile: [1, 1.5] });
  const hatchMat = pbr(scene, { map: TBox(doorTexture('#2f6e6a')), roughness: 0.45, metalness: 0.65, surface: 'painted', tile: [1, 1.5] }); // safe-room hatches
  const lampRed = basic(scene, 0xff2a1a);
  const lampGreen = basic(scene, 0x2aff7a);
  const doors = layout.doors.map((d) => {
    const along = d.axis === 'x';
    const mesh = bevelBox('door', { width: along ? 0.25 : TILE, height: WALL_H, depth: along ? TILE : 0.25, bevel: 0.04 }, scene);
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
  // Door frames: hazard-striped jambs either side, and a header across the top the door slides into.
  const jambMat = pbr(scene, { map: TBox(hazardTexture()), roughness: 0.6, metalness: 0.4, surface: 'painted', tile: [1, 3] });
  const headerMat = pbr(scene, { color: 0x3a3e41, roughness: 0.55, metalness: 0.7, surface: 'panel' });
  for (const f of doorFrames(layout)) {
    const [ax, az] = f.across;
    const alongX = ax === 0; // the passage runs along x, so the frame's depth is along x
    const size = (acrossW, alongD, height) => (alongX ? { width: alongD, depth: acrossW, height } : { width: acrossW, depth: alongD, height });
    for (const d of [-f.lo, f.hi]) {
      const jamb = bevelBox('jamb', { ...size(FRAME.inset * 2, FRAME.depth, WALL_H), bevel: 0.035 }, scene);
      jamb.position.set(f.x + ax * d, WALL_H / 2, f.z + az * d);
      jamb.material = jambMat;
    }
    const header = bevelBox('door-header', { ...size(f.lo + f.hi, FRAME.depth + 0.04, FRAME.header), bevel: 0.035 }, scene);
    header.position.set(f.x + ax * (f.hi - f.lo) / 2, WALL_H - FRAME.header / 2, f.z + az * (f.hi - f.lo) / 2);
    header.material = headerMat;
  }
  const doorByKey = new Map(doors.map((d) => [key(d.cx, d.cz), d]));
  const setDoor = (door, closed) => {
    door.closed = closed;
    if (!closed) door.closedByPlayer = false;
    for (const l of door.lamps) l.material = closed ? lampRed : lampGreen;
  };
  for (const d of doors) if (d.startClosed) { setDoor(d, true); d.t = 1; }

  // Room lights -------------------------------------------------------------
  // A faint cone of light under each fixture, as if the air were hazy: glows, but lights nothing.
  const coneFade = (() => {
    const c = document.createElement('canvas');
    c.width = 8; c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.6, 'rgba(255,255,255,0.25)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 8, 128);
    return toTexture(scene, c);
  })();
  const lightCone = (x, z, top, bottom, hex) => {
    const cone = MeshBuilder.CreateCylinder('light-cone', { diameterTop: top, diameterBottom: bottom, height: WALL_H - 0.1, tessellation: 24, cap: BABYLON.Mesh.NO_CAP }, scene);
    cone.position.set(x, (WALL_H - 0.1) / 2, z);
    cone.material = basic(scene, hex, { opacity: coneFade, additive: true, alpha: 0.05 });
    cone.material.backFaceCulling = false;
    cone.material.disableDepthWrite = true;
    cone.isPickable = false;
    return cone;
  };
  const fixtureHousingMat = pbr(scene, { color: 0x26292b, roughness: 0.5, metalness: 0.7, surface: 'panel' });
  const rooms = layout.rooms.map((room) => {
    const r = roomState(room);
    // The reactor fills the generator room's middle up to the ceiling, so its light hangs to one side.
    const pos = [cellCenter(room.cx), WALL_H - 0.4, cellCenter(room.cz) - (room.id === 'generator' ? 2.6 : 0)];
    const light = pointLight(r.base.color, r.base.intensity, room.safe ? 7 : 13, pos);
    const fixtureMat = basic(scene, r.base.color);
    // The glowing panel sits in a dark recessed housing.
    const housing = bevelBox('fixture-housing', { width: 1.85, height: 0.12, depth: 0.5, bevel: 0.03 }, scene);
    housing.position.set(pos[0], WALL_H - 0.06, pos[2]);
    housing.material = fixtureHousingMat;
    const fixture = MeshBuilder.CreateBox('fixture', { width: 1.6, height: 0.06, depth: 0.3 }, scene);
    fixture.position.set(pos[0], WALL_H - 0.135, pos[2]);
    fixture.material = fixtureMat;
    const cone = room.safe ? null : lightCone(pos[0], pos[2], 1.4, 5.2, r.base.color);
    return Object.assign(r, { light, fixtureMat, cone });
  });
  let powered = false;
  const setPower = (on) => {
    powered = on;
    props.genSwitches?.(on);
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
  const housingMat = pbr(scene, { map: T(housingTexture()), roughness: 0.6, metalness: 0.25, surface: 'painted', tile: [1, 1], bump: 0.6 });
  const deskMat = pbr(scene, { color: 0x4d5154, roughness: 0.7, metalness: 0.5, surface: 'painted', tile: [1, 1], bump: 0.4 });
  const keysMat = pbr(scene, { map: T(keyboardTexture()), roughness: 0.8 });
  const darkMat = pbr(scene, { color: 0x1d1f21, roughness: 0.6, metalness: 0.3 });
  const badgeMat = basic(scene, 0xf2a92e);
  const mugMat = pbr(scene, { map: TWall(mugTexture()), roughness: 0.5 });
  const consoles = [];
  // Scanlines and darkened edges over every screen, so they read as old curved CRT glass.
  const crtMat = basic(scene, 0x000000, { opacity: T(crtTexture()) });
  crtMat.disableDepthWrite = true;
  function makeConsole(group, p) {
    const part = (mesh, parent, x, y, z, mat) => { mesh.parent = parent; mesh.position.set(x, y, z); mesh.material = mat; return mesh; };
    part(bevelBox('desk', { width: 1.3, height: 0.74, depth: 0.7, bevel: 0.025 }, scene), group, 0, 0.37, -0.1, deskMat);
    const mon = node('monitor', group);
    mon.position.set(0, 0.74, -0.2);
    mon.rotation.x = -0.12; // leans back a little
    part(MeshBuilder.CreateBox('stand', { width: 0.26, height: 0.06, depth: 0.24 }, scene), mon, 0, 0.03, 0, darkMat);
    part(bevelBox('housing', { width: 0.8, height: 0.6, depth: 0.44, bevel: 0.045 }, scene), mon, 0, 0.36, 0, housingMat);
    const screenZ = 0.222;
    const canvas = consoleScreen(p.screen, { stage: 0, layout });
    const tex = TWall(canvas);
    const screen = part(MeshBuilder.CreatePlane('screen', { width: 0.62, height: 0.39 }, scene), mon, 0, 0.38, screenZ, basic(scene, 0, { map: tex }));
    screen.rotation.y = Math.PI; // Babylon planes face -Z; turn it to face out of the monitor
    const crt = part(MeshBuilder.CreatePlane('crt', { width: 0.62, height: 0.39 }, scene), mon, 0, 0.38, screenZ + 0.003, crtMat);
    crt.rotation.y = Math.PI;
    // A soft glow just in front: it reads as light in the dark without lighting anything.
    const glow = part(MeshBuilder.CreatePlane('glow', { width: 0.78, height: 0.54 }, scene), mon, 0, 0.38, screenZ + 0.02,
      basic(scene, 0x5fb3a8, { additive: true, alpha: 0.07 }));
    glow.rotation.y = Math.PI;
    glow.material.disableDepthWrite = true;
    if (p.screen === 'off') glow.setEnabled(false); // a dead monitor doesn't glow
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
      // The primary generator (Main Generator Room sheet): a tall worn reactor on a grated platform
      // with a yellow railing, glowing orange tubes, and red and grey pipes up into the ceiling.
      // It all stays inside its 2 m cell, which is solid.
      const steel = pbr(scene, { color: 0x7a776f, roughness: 0.55, metalness: 0.7, surface: 'rust', tile: [2, 2], bump: 0.6 });
      const dark = pbr(scene, { color: 0x2c2e30, roughness: 0.5, metalness: 0.75, surface: 'painted', bump: 0.4 });
      const yellow = pbr(scene, { color: 0xd9a52a, roughness: 0.5, metalness: 0.4 });
      const cyl = (d, hgt, y, mat, x = 0, z = 0, tess = 24) => { const m = add(MeshBuilder.CreateCylinder('reactor', { diameter: d, height: hgt, tessellation: tess }, scene), x, y, z); m.material = mat; return m; };
      cyl(1.96, 0.14, 0.07, pbr(scene, { color: 0x34373a, roughness: 0.6, metalness: 0.7, surface: 'grate', tile: [2, 2] }), 0, 0, 32);
      cyl(1.3, 0.5, 0.39, dark);                 // base housing
      cyl(1.05, 1.7, 1.49, steel);               // the body
      cyl(1.2, 0.18, 2.43, dark);                // top collar
      cyl(0.62, 0.6, 2.76, steel);               // stack into the ceiling
      for (const y of [0.9, 2.1]) { const band = add(MeshBuilder.CreateTorus('band', { diameter: 1.08, thickness: 0.06, tessellation: 32 }, scene), 0, y, 0); band.material = dark; }
      // The railing round the platform.
      for (const y of [0.58, 1.02]) { const rail = add(MeshBuilder.CreateTorus('rail', { diameter: 1.86, thickness: 0.04, tessellation: 40 }, scene), 0, y, 0); rail.material = yellow; }
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; cyl(0.04, 0.9, 0.59, yellow, Math.sin(a) * 0.93, Math.cos(a) * 0.93, 8); }
      // Four glowing tubes in dark housings, around the body.
      const glowMat = basic(scene, 0xff7a1c);
      for (const a of [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4]) {
        const hx = Math.sin(a) * 0.55, hz = Math.cos(a) * 0.55;
        const housingBox = add(bevelBox('tube-housing', { width: 0.18, height: 1.3, depth: 0.12, bevel: 0.02 }, scene), hx, 1.45, hz);
        housingBox.rotation.y = a; housingBox.material = dark;
        cyl(0.07, 1.1, 1.45, glowMat, Math.sin(a) * 0.62, Math.cos(a) * 0.62, 10);
      }
      // The emblem plate on the front, and pipes rising to the ceiling.
      const plate = add(bevelBox('reactor-plate', { width: 0.5, height: 0.56, depth: 0.04, bevel: 0.01 }, scene), 0, 1.55, 0.53);
      plate.material = pbr(scene, { map: TBox(reactorPlateTexture()), roughness: 0.6, metalness: 0.5 });
      const pipeMats = [pbr(scene, { color: 0x7a2a1e, roughness: 0.5, metalness: 0.6, surface: 'pipe', tile: [1, 2] }), pbr(scene, { color: 0x5d6064, roughness: 0.5, metalness: 0.7, surface: 'pipe', tile: [1, 2] })];
      [[1.2, 0], [-1.2, 1], [2.35, 1], [-2.35, 0]].forEach(([a, k]) => {
        const x = Math.sin(a) * 0.8, z = Math.cos(a) * 0.8;
        cyl(0.14, WALL_H - 0.14, 0.14 + (WALL_H - 0.14) / 2, pipeMats[k], x, z, 12);
        for (const y of [0.5, 2.6]) cyl(0.2, 0.06, y, dark, x, z, 12);
        const elbow = add(MeshBuilder.CreateCylinder('elbow', { diameter: 0.11, height: 0.3, tessellation: 10 }, scene), Math.sin(a) * 0.66, 0.9, Math.cos(a) * 0.66);
        elbow.rotation.set(Math.PI / 2, a, 0); elbow.material = pipeMats[k];
      });
      // Its glow lights the room a little; dim and unsteady until it's repaired.
      const glow = pointLight(0xff8a30, 1, 7, [0, 0, 0]);
      glow.parent = group; glow.position.set(0, 1.5, 0);
      props.genGlow = { light: glow, mat: glowMat };
      statusPos = [0, 0.42, 0.66];
    } else if (p.id === 'comms') {
      // The Outgoing Call console (S9-COM-01): a big screen in a chunky bezel with handles, on a
      // pedestal desk. Its screen is redrawn as the rescue call goes out (setRepairProgress).
      add(bevelBox('desk', { width: 1.5, height: 0.95, depth: 0.9, bevel: 0.03 }, scene), 0, 0.48, 0).material = pbr(scene, { color: 0x3d4042, roughness: 0.6, metalness: 0.5, surface: 'painted', bump: 0.4 });
      const mon = node('comms-monitor', group);
      mon.position.set(0, 1.45, 0.05);
      mon.rotation.x = -0.18;
      const frameMat = pbr(scene, { color: 0x3a3b3c, roughness: 0.55, metalness: 0.75, surface: 'rust', tile: [1, 1], bump: 0.5 });
      const bezel = bevelBox('comms-bezel', { width: 1.34, height: 0.92, depth: 0.12, bevel: 0.04 }, scene);
      bezel.parent = mon; bezel.material = frameMat;
      for (const sx of [-1, 1]) {
        const handle = bevelBox('handle', { width: 0.04, height: 0.42, depth: 0.04, bevel: 0.008 }, scene);
        handle.parent = mon; handle.position.set(sx * 0.73, 0, 0.02); handle.material = frameMat;
        for (const sy of [-1, 1]) { const stub = MeshBuilder.CreateBox('stub', { width: 0.06, height: 0.03, depth: 0.03 }, scene); stub.parent = mon; stub.position.set(sx * 0.7, sy * 0.19, 0.02); stub.material = frameMat; }
      }
      const callTex = TWall(commsCallScreen());
      const screen = MeshBuilder.CreatePlane('screen', { width: 1.18, height: 0.74 }, scene);
      screen.parent = mon; screen.position.set(0, 0, 0.062); screen.rotation.y = Math.PI;
      screen.material = basic(scene, 0, { map: callTex });
      const lamp = MeshBuilder.CreateSphere('lamp', { diameter: 0.035, segments: 6 }, scene);
      lamp.parent = mon; lamp.position.set(-0.6, -0.36, 0.06); lamp.material = basic(scene, 0xffb04a);
      const stand = add(bevelBox('stand', { width: 0.3, height: 0.5, depth: 0.2, bevel: 0.02 }, scene), 0, 1.1, -0.05); stand.material = frameMat;
      statusPos = [-0.6, 1.0, 0.46];
      props.commsScreen = { tex: callTex, last: -1 };
    } else if (p.id === 'pod') {
      const pod = add(MeshBuilder.CreateCapsule('pod', { radius: 0.65, height: 0.8 + 1.3, tessellation: 16 }, scene), 0, 0.85, 0);
      pod.rotation.z = Math.PI / 2;
      pod.material = pbr(scene, { color: 0xcfcbbf, roughness: 0.4, metalness: 0.3 });
      const win = add(MeshBuilder.CreateSphere('window', { diameter: 0.7, segments: 8 }, scene), 0.3, 1.15, 0.45);
      win.scaling.set(1.2, 0.7, 0.5);
      win.material = pbr(scene, { color: 0x0a1418, roughness: 0.1, metalness: 0.9 });
      statusPos = [-0.7, 1.35, 0.5];
    } else if (p.id === 'crate') {
      add(bevelBox('crate', { width: 1.3, height: 0.8, depth: 0.9, bevel: 0.03 }, scene), 0, 0.4, 0).material = pbr(scene, { color: 0x4b5232, roughness: 0.8 });
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

  // The generator room's switch panel: lamps above each toggle go green when power is restored.
  {
    const f = generatorFixtures(layout).panel;
    const panel = node('switch-panel');
    panel.position.set(f.x, f.y, f.z);
    panel.rotation.y = f.rot;
    const back = bevelBox('switch-back', { width: f.w + 0.08, height: f.h + 0.08, depth: 0.08, bevel: 0.02 }, scene);
    back.parent = panel; back.position.z = 0.04; back.material = pbr(scene, { color: 0x3a3a37, roughness: 0.6, metalness: 0.6, surface: 'rust', bump: 0.5 });
    const face = MeshBuilder.CreatePlane('switch-face', { width: f.w, height: f.h }, scene);
    face.parent = panel; face.position.z = 0.081; face.rotation.y = Math.PI;
    face.material = pbr(scene, { map: TWall(switchPanelTexture()), roughness: 0.55, metalness: 0.5 });
    const lampMats = { green: basic(scene, 0x3cff8a), amber: basic(scene, 0xffb02a), red: basic(scene, 0xff2a1a) };
    const lamps = [];
    // Lamp positions match the texture's layout (512 x 280 canvas, groups of n switches 56 px apart).
    let px = 10;
    SWITCH_GROUPS.forEach(([, n], gi) => {
      for (let i = 0; i < n; i++) {
        const cx = px + 40 + i * 56;
        const lamp = MeshBuilder.CreateSphere('switch-lamp', { diameter: 0.045, segments: 6 }, scene);
        lamp.parent = panel;
        lamp.position.set(((cx / 512) - 0.5) * f.w, (0.5 - 93 / 280) * f.h, 0.09);
        lamps.push({ lamp, group: gi });
      }
      px += n * 56 + 24 + 10;
    });
    const setLamps = (on) => {
      for (const { lamp, group } of lamps) lamp.material = on ? lampMats.green : group === 1 ? lampMats.amber : lampMats.red;
    };
    setLamps(false);
    props.genSwitches = setLamps;
  }

  // Pipes, patches, broken lights and leaks. Its sounds go to whoever sets world.onDecorEvent.
  let onDecorEvent = null;
  const decor = buildDecor(scene, layout, { onEvent: (type, at) => onDecorEvent?.(type, at) });

  // Furniture from the interiors sheet, plus the chairs, signs and windows that go with it.
  const kit = furnitureKit(scene);
  buildFurniture(scene, layout, kit);

  // The wellness suites: padded, bright, and their own light.
  const suites = buildSuites(scene, layout);

  // The vents: covers, gratings and the ducts behind them (js/vents.js).
  const vents = buildVentMeshes(scene, layout);

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
    vents.update(dt);
    // The CRT overlay breathes very slightly, like an old tube's refresh.
    crtMat.alpha = 0.88 + Math.random() * 0.12;
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
      if (r.cone) { r.cone.material.emissiveColor = srgb(r.base.color); r.cone.material.alpha = 0.05 * Math.min(1.5, k); }
      r.fixtureMat.emissiveColor = srgb(r.base.color).scale(Math.max(0.05, k));
    }
    if (props.genGlow) {
      // Output low: a weak, wavering glow. Repaired: steady and bright.
      const k = powered ? 1 : 0.3 + 0.12 * Math.sin(time * 7.3) * Math.sin(time * 2.1) + (Math.random() < 0.02 ? -0.2 : 0);
      props.genGlow.light.intensity = 2.4 * k * TUNING.light;
      props.genGlow.mat.emissiveColor = srgb(0xff7a1c).scale(0.35 + 0.65 * k);
    }
    if (props.teleporterLight) {
      props.teleporterLight.intensity = teleporterLevel(time) * TUNING.light;
      props.teleporterRing.rotation.y += dt * 0.4;
    }
  }

  return {
    doors, rooms, props, interactables, loose, decor, vents, setDoor, setPower, update,
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
    setCommsLit() { redraw(props.commsScreen.tex, commsCallScreen({ sent: true }), { mirror: true }); props.commsScreen.last = 2; },
    // While E is held on a repair: the comms screen walks through the call (redrawn in steps).
    setRepairProgress(id, p) {
      const c = props.commsScreen;
      if (id !== 'comms' || !c || c.last >= 2) return;
      if (p < 1 && Math.abs(p - c.last) < 0.04) return;
      c.last = p;
      redraw(c.tex, commsCallScreen({ p }), { mirror: true });
    },
    anchors: { teleporter: props.teleporter.position, generator: props.generator.group.position },
    doorAt: (x, z) => doorByKey.get(key(x, z)),
    get powered() { return powered; },
    dimBeat(seconds) { for (const r of rooms) r.beat = seconds; },
  };
}
