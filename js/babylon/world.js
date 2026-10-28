// Babylon.js renderer: builds the station's meshes and lights from the layout, and animates doors
// and lights. Placement comes from js/worldplan.js and textures from js/textures.js.
import { TILE, WALL_H, cellCenter, key } from '../layout.js';
import {
  wallTexture, floorTextures, ceilingTexture, doorTexture, mapTexture, wallSpot,
  consoleScreen, LIVE_SCREENS, keyboardTexture, stickyNote, mugTexture, housingTexture, hazardTexture, crtTexture,
  tapeBanner, tapeDeckTexture, teleporterFloorTexture, teleporterRingDecal, teleporterSignTexture,
  safetyProtocolTexture, restrictedTexture,
  commsCallScreen, reactorPlateTexture, switchPanelTexture, SWITCH_GROUPS,
} from '../textures.js';
import {
  wallPanels, guideStrips, propPlacement, propHeight, posterPlacements, WALL_MAP, EMBLEM, looseItems,
  stepDoor, roomLightLevel, teleporterLevel, roomState, roomBase, doorFrames, FRAME, kickPlateSpans, generatorFixtures, teleporterFixtures,
} from '../worldplan.js';
import { buildDecor } from './decor.js';
import { furnitureKit, buildFurniture } from './furniture.js';
import { buildSuites } from './suites.js';
import { buildCryo } from './cryo.js';
import { paddedWallTexture } from '../suitetextures.js';
import { buildVentMeshes } from './vents.js';
import { cutVentHoles } from '../vents.js';
import { paddedSuite } from '../suiteplan.js';
import { grateSpots } from '../vents.js';
import { buildPod } from './pod.js';
import { POD } from '../podplan.js';
import { pbr, basic, toTexture, redraw, srgb, linear, compose, instances, TUNING, bevelBox } from './util.js';
import { noisemakerMaker } from './props.js';
import { pickupPlacements, NOISEMAKERS, CRATE_CONTENTS } from '../noisemakers.js';

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
  // The secret panel: quilted padding like the Wellness Room's, but subtly off (js/suitetextures.js).
  const oddPad = toTexture(scene, paddedWallTexture({ odd: true }), { anisotropy: 4, flipV: true });
  oddPad.uScale = 2.3 / 1.2; oddPad.vScale = WALL_H / 1.2;
  const oddMat = pbr(scene, { map: oddPad, roughness: 0.95 });
  const doors = layout.doors.map((d) => {
    const along = d.axis === 'x';
    const x = cellCenter(d.cx), z = cellCenter(d.cz);
    if (d.secret) {
      // Flush with the room's padding (which stands 2 cm off the wall), not a metre back in the
      // doorway; a closed door blocks its whole cell, so this is where you stop anyway.
      const room = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dz]) => layout.roomAt(d.cx + dx, d.cz + dz)).find(Boolean);
      const mesh = MeshBuilder.CreateBox('secret-panel', { width: along ? 0.25 : 2.3, height: WALL_H, depth: along ? 2.3 : 0.25 }, scene);
      mesh.material = oddMat;
      const wallZ = room.y + room.h === d.cz ? d.cz * TILE : (d.cz + 1) * TILE; // the room's wall line on this side
      const toward = room.y + room.h === d.cz ? -1 : 1;
      mesh.position.set(x, WALL_H / 2, wallZ + (toward < 0 ? 0.135 : -0.135) + toward * 0.01);
      return { ...d, x, z, mesh, lamps: [], closed: false, closedByPlayer: false, t: 0 };
    }
    const mesh = bevelBox('door', { width: along ? 0.25 : TILE, height: WALL_H, depth: along ? TILE : 0.25, bevel: 0.04 }, scene);
    mesh.material = d.safe ? hatchMat : doorMat;
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
  let screenStage = 0; // repairs done, for redrawing the live screens
  // Scanlines and darkened edges over every screen, so they read as old curved CRT glass.
  const crtMat = basic(scene, 0x000000, { opacity: T(crtTexture()) });
  crtMat.disableDepthWrite = true;
  // Tape terminals only: a strip on the screen (unplayed / played) and a tape deck on the desk.
  const bannerMats = [false, true].map((played) => basic(scene, 0, { map: TWall(tapeBanner(played)) }));
  const deckFaceMat = pbr(scene, { map: TWall(tapeDeckTexture()), roughness: 0.6 });
  const BANNER_H = 0.39 * 72 / 320; // the strip's share of the screen's height
  const tapeTerminals = []; // { id, statusMat, banner, played }, so unplayed ones can pulse
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
    let banner = null;
    if (p.kind === 'log') {
      // Across the top of the screen (clear of the use prompt and of chairs in front), on its own
      // plane in front of the screen and under the scanlines, so screen redraws leave it be.
      banner = part(MeshBuilder.CreatePlane('tape-banner', { width: 0.62, height: BANNER_H }, scene), mon, 0, 0.38 + 0.39 / 2 - BANNER_H / 2, screenZ + 0.0015, bannerMats[0]);
      banner.rotation.y = Math.PI;
      // The tape deck, left of the keyboard: a cassette behind a window, its light on top.
      part(bevelBox('tape-deck', { width: 0.22, height: 0.07, depth: 0.16, bevel: 0.01 }, scene), group, -0.45, 0.775, 0.1, housingMat);
      const face = part(MeshBuilder.CreatePlane('tape-deck-face', { width: 0.21, height: 0.065 }, scene), group, -0.45, 0.775, 0.1 + 0.081, deckFaceMat);
      face.rotation.y = Math.PI;
    }
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
    consoles.push({ p, tex, screen, glow, live: LIVE_SCREENS.has(p.screen), flicker: 0 });
    // A tape terminal's status light sits on top of its tape deck.
    return { banner, lightPos: [-0.38, 0.815, 0.12] };
  }

  // Props -------------------------------------------------------------------
  const props = {};
  let cratePos = null;
  let podView = null; // the escape pod's moving parts (door, thrusters, door control)
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
      // The escape pod (js/babylon/pod.js, js/podplan.js): it lies along the bay, nose east, so it
      // doesn't turn to face the room like other props. You use it at its door control.
      group.position.set(POD.center.x, 0, POD.center.z);
      group.rotation.y = 0;
      podView = buildPod(scene, group);
      statusPos = podView.statusPos;
    } else if (p.id === 'crate') {
      add(bevelBox('crate', { width: 1.3, height: 0.8, depth: 0.9, bevel: 0.03 }, scene), 0, 0.4, 0).material = pbr(scene, { color: 0x4b5232, roughness: 0.8 });
      add(MeshBuilder.CreateBox('stripe', { width: 1.32, height: 0.12, depth: 0.92 }, scene), 0, 0.62, 0).material = pbr(scene, { color: 0xc9a227, roughness: 0.6 });
      // No marker light: what's inside sits on the lid (see the noise-maker block below).
      statusPos = [0, 0.9, 0];
      cratePos = { x, z, rotY };
    } else if (p.kind === 'log' || p.kind === 'console') {
      // A desk console like the reference sheet; its status light is the one built above.
      const c = makeConsole(group, p);
      statusPos = c.lightPos;
      status.scaling.setAll(0.3); // a small light on the tape deck, about 4 cm across
      statusMat.emissiveColor = srgb(UNREAD);
      if (p.kind === 'log') tapeTerminals.push({ id: p.id, statusMat, banner: c.banner, played: false });
    } else if (p.id === 'teleporter') {
      // The chamber (Teleporter Chamber sheet): a grated platform with glowing rings, four pillars
      // with orange bands and light strips, an overhead housing with a slowly turning inner ring,
      // and cables up into the ceiling. North and south stay open, toward the doors.
      const steel = pbr(scene, { color: 0x7d8286, roughness: 0.35, metalness: 0.85, surface: 'painted', bump: 0.4 });
      const darkSteel = pbr(scene, { color: 0x2a2e31, roughness: 0.45, metalness: 0.8 });
      const orange = pbr(scene, { color: 0xc8641e, roughness: 0.55, metalness: 0.2 });
      const glowWhite = basic(scene, 0xeef6ff);
      const warmStrip = basic(scene, 0xffe2b8);
      const rubber = pbr(scene, { color: 0x151617, roughness: 0.8 });
      add(MeshBuilder.CreateCylinder('tp-base', { diameter: 2.7, height: 0.16, tessellation: 48 }, scene), 0, 0.08, 0).material = darkSteel;
      add(MeshBuilder.CreateTorus('tp-step', { diameter: 2.72, thickness: 0.06, tessellation: 48 }, scene), 0, 0.16, 0).material = steel;
      const deck = add(MeshBuilder.CreateDisc('tp-deck', { radius: 1.3, tessellation: 48 }, scene), 0, 0.162, 0);
      deck.rotation.x = Math.PI / 2;
      deck.material = pbr(scene, { map: T(teleporterFloorTexture()), roughness: 0.4, metalness: 0.7 });
      for (const d of [2.45, 1.5]) add(MeshBuilder.CreateTorus('tp-ring-light', { diameter: d, thickness: 0.035, tessellation: 64 }, scene), 0, 0.17, 0).material = glowWhite;
      // Pillars at +-30 degrees off east-west, each with orange bands and a light strip facing in.
      for (const deg of [30, 150, 210, 330]) {
        const a = (deg * Math.PI) / 180, r = 1.15;
        const pillar = node('tp-pillar', group);
        pillar.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
        pillar.rotation.y = Math.atan2(-Math.cos(a), -Math.sin(a)); // its +z faces the middle
        const col = bevelBox('tp-column', { width: 0.22, height: 2.5, depth: 0.22, bevel: 0.03 }, scene);
        col.parent = pillar; col.position.y = 0.16 + 1.25; col.material = steel;
        for (const y of [0.9, 2.2]) { const b = MeshBuilder.CreateBox('tp-band', { width: 0.235, height: 0.12, depth: 0.235 }, scene); b.parent = pillar; b.position.y = y; b.material = orange; }
        const strip = MeshBuilder.CreateBox('tp-strip', { width: 0.05, height: 1.6, depth: 0.02 }, scene);
        strip.parent = pillar; strip.position.set(0, 1.45, 0.115); strip.material = warmStrip;
      }
      // Overhead: the housing, a glowing ring under it, and the inner ring that turns.
      add(MeshBuilder.CreateCylinder('tp-housing', { diameter: 2.9, height: 0.24, tessellation: 48 }, scene), 0, 2.78, 0).material = darkSteel;
      add(MeshBuilder.CreateTorus('tp-collar', { diameter: 2.6, thickness: 0.16, tessellation: 48 }, scene), 0, 2.66, 0).material = steel;
      add(MeshBuilder.CreateTorus('tp-top-light', { diameter: 2.25, thickness: 0.04, tessellation: 64 }, scene), 0, 2.6, 0).material = glowWhite;
      const spin = node('ring-spin', group);
      spin.position.y = 2.5;
      const inner = MeshBuilder.CreateTorus('tp-inner', { diameter: 1.7, thickness: 0.07, tessellation: 48 }, scene);
      inner.parent = spin; inner.material = steel;
      for (let k = 0; k < 6; k++) { // little clamps, so you can see it turning
        const c = MeshBuilder.CreateBox('tp-clamp', { width: 0.12, height: 0.1, depth: 0.08 }, scene);
        c.parent = spin; const a = (k / 6) * Math.PI * 2; c.position.set(Math.cos(a) * 0.85, 0, Math.sin(a) * 0.85); c.rotation.y = -a; c.material = orange;
      }
      // Cables sagging from the housing's edge up into the ceiling.
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.3, r0 = 1.25, r1 = 1.75 + (k % 2) * 0.3;
        const path = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, r = r0 + (r1 - r0) * t;
          path.push(new Vector3(Math.cos(a + t * 0.25) * r, 2.86 + (WALL_H - 2.86) * t - Math.sin(t * Math.PI) * 0.3, Math.sin(a + t * 0.25) * r));
        }
        add(MeshBuilder.CreateTube('tp-cable', { path, radius: 0.035, tessellation: 8 }, scene), 0, 0, 0).material = rubber;
      }
      // A faint column of light inside the pillars; it wavers with the glow.
      const column = add(MeshBuilder.CreateCylinder('tp-column-glow', { diameter: 1.9, height: 2.3, tessellation: 32, cap: BABYLON.Mesh.NO_CAP }, scene), 0, 1.35, 0);
      column.material = basic(scene, 0xcfe6ff, { additive: true, alpha: 0.05 });
      column.material.backFaceCulling = false;
      column.material.disableDepthWrite = true;
      // STAND WITHIN RINGS, painted on the floor round it.
      const band = add(MeshBuilder.CreateGround('tp-floor-band', { width: 5, height: 5 }, scene), 0, 0.014, 0);
      // Mirrored: a ground plane seen from above shows its canvas flipped, which would reverse the words.
      const bandTex = toTexture(scene, teleporterRingDecal(), { anisotropy: 4, mirror: true }); bandTex.hasAlpha = true;
      band.material = pbr(scene, { map: bandTex, roughness: 0.7, transparent: true, zOffset: -2 });
      band.metadata = { decal: true };
      const light = pointLight(0xd8ecff, 6, 11, [0, 0, 0]);
      light.parent = group;
      light.position.set(0, 1.4, 0);
      props.teleporterLight = light;
      props.teleporterRing = spin;
      props.teleporterGlow = column.material;
      props.teleporter = group;
    }
    if (p.kind === 'console') {
      // Set dressing: no light, and aiming at it just says it's locked (js/game.js).
      status.dispose();
      interactables.push({ id: p.id, kind: 'console', label: p.screen === 'off' ? 'Dead terminal' : 'Terminal locked', pos: { x, y: propHeight(p), z }, range: 2.7 });
    } else if (p.kind !== 'scenery') {
      if (p.kind === 'crate') status.dispose(); // no marker light: its noise-makers sit on the lid
      else add(status, ...statusPos);
      props[p.id] = { group, status: statusMat };
      const at = p.id === 'pod' ? { x: POD.panel.x, y: POD.panel.y, z: POD.panel.z } : { x, y: propHeight(p), z };
      interactables.push({ id: p.id, kind: p.kind, label: p.label, duration: p.duration, pos: at, range: 2.7 });
    } else {
      status.dispose();
    }
  }
  for (const d of doors) {
    // The secret panel is used where it is, flush with the wall, not at the doorway's middle.
    const at = d.secret ? { x: d.mesh.position.x, y: 1.4, z: d.mesh.position.z } : { x: d.x, y: 1.4, z: d.z };
    interactables.push({ id: 'door', kind: 'door', door: d, pos: at, range: 2.6 });
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

  // Noise-makers lying about (js/noisemakers.js): each glows faintly and bobs; take it with E.
  const makeNoisemaker = noisemakerMaker(scene);
  const pickups = new Map();
  // The Storage crate's noise-makers, lying on its lid until you take them.
  const crateItems = cratePos ? CRATE_CONTENTS.map((type, i) => {
    const m = makeNoisemaker(type);
    const lx = (i - (CRATE_CONTENTS.length - 1) / 2) * 0.45, c = Math.cos(cratePos.rotY), s = Math.sin(cratePos.rotY);
    m.position.set(cratePos.x + lx * c, 0.8 + 0.12, cratePos.z - lx * s);
    pickups.set('crate-' + i, m);
    return 'crate-' + i;
  }) : [];
  for (const pk of pickupPlacements(layout)) {
    const m = makeNoisemaker(pk.type);
    m.position.set(pk.x, pk.y + 0.12, pk.z);
    pickups.set(pk.id, m);
    interactables.push({ id: pk.id, kind: 'pickup', type: pk.type, label: `Take ${NOISEMAKERS[pk.type].name}`, pos: { x: pk.x, y: pk.y + 0.12, z: pk.z }, range: 2.2 });
  }

  // Pipes, patches, broken lights and leaks. Its sounds go to whoever sets world.onDecorEvent.
  let onDecorEvent = null;
  const decor = buildDecor(scene, layout, { onEvent: (type, at) => onDecorEvent?.(type, at) });

  // Furniture from the interiors sheet, plus the chairs, signs and windows that go with it.
  const kit = furnitureKit(scene);
  buildFurniture(scene, layout, kit);

  // The wellness suites: padded, bright, and their own light.
  const suites = buildSuites(scene, layout);
  const cryo = buildCryo(scene, layout, kit);

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
  // The poster art (assets/posters/, placed by posterPlacements), each in a thin dark frame.
  const posterFrameMat = pbr(scene, { color: 0x2a2b2d, roughness: 0.5, metalness: 0.6 });
  for (const pp of posterPlacements(layout)) {
    const frame = MeshBuilder.CreateBox('poster-frame', { width: pp.w + 0.05, height: pp.h + 0.05, depth: 0.025 }, scene);
    frame.position.set(pp.x, pp.y, pp.z);
    frame.rotation.y = pp.rot;
    frame.material = posterFrameMat;
    const art = MeshBuilder.CreatePlane('poster', { width: pp.w, height: pp.h }, scene);
    art.parent = frame;
    art.position.z = 0.014;
    art.rotation.y = Math.PI;
    const tex = new BABYLON.Texture(`assets/posters/${pp.id}.jpg`, scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
    tex.wrapU = BABYLON.Texture.WRAP_ADDRESSMODE;
    tex.uScale = -1; // mirrored back, as for the emblem
    tex.anisotropicFilteringLevel = 4;
    art.material = pbr(scene, { map: tex, roughness: 0.85 });
  }
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

  // The Teleporter Lab's wall pieces (worldplan.js teleporterFixtures): the painted TELEPORTER sign,
  // the safety protocol panel, and RESTRICTED ACCESS on both door headers.
  {
    const tf = teleporterFixtures(layout);
    const wallPiece = (f, mat, name) => {
      const n = node(name);
      n.position.set(f.x, f.y, f.z);
      n.rotation.y = f.rot;
      const m = MeshBuilder.CreatePlane(name, { width: f.w, height: f.h }, scene);
      m.parent = n; m.position.z = 0.006; m.rotation.y = Math.PI; m.material = mat;
      m.metadata = { decal: true };
      return m;
    };
    const signTex = TWall(teleporterSignTexture()); signTex.hasAlpha = true;
    wallPiece(tf.sign, pbr(scene, { map: signTex, roughness: 0.8, transparent: true, zOffset: -2 }), 'tp-sign');
    wallPiece(tf.protocol, pbr(scene, { map: TWall(safetyProtocolTexture()), roughness: 0.7 }), 'tp-protocol');
    const restricted = pbr(scene, { map: TWall(restrictedTexture()), roughness: 0.6, metalness: 0.3 });
    wallPiece(tf.restrictedN, restricted, 'tp-restricted');
    wallPiece(tf.restrictedS, restricted, 'tp-restricted');
  }

  // Per-frame animation -----------------------------------------------------
  function update(dt, time, alien = null, player = null) {
    decor.update(dt, time, player);
    suites.update(dt, time);
    cryo.update(time);
    vents.update(dt);
    for (const m of pickups.values()) { m.bob(time); m.glow(0.28 + 0.08 * Math.sin(time * 2.3)); }
    podView?.update(dt);
    // Unplayed tape terminals pulse together: the deck light and the AUDIO LOG strip.
    const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(time * 5.2));
    bannerMats[0].emissiveTexture.level = 0.55 + 0.45 * pulse;
    const unread = srgb(UNREAD).scale(pulse);
    for (const t of tapeTerminals) if (!t.played) t.statusMat.emissiveColor = unread;
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
      const tl = teleporterLevel(time);
      props.teleporterLight.intensity = tl * TUNING.light;
      props.teleporterRing.rotation.y += dt * 0.4;
      props.teleporterGlow.alpha = 0.005 * tl; // the light column wavers with it
    }
  }

  return {
    doors, rooms, props, interactables, loose, decor, vents, setDoor, setPower, update,
    // The pod launches: door shut, thrusters flaring (js/babylon/pod.js).
    launchPod() { podView?.launch(); },
    set onDecorEvent(fn) { onDecorEvent = fn; },
    markRead(id) {
      if (props[id]) props[id].status.emissiveColor = srgb(READ);
      const t = tapeTerminals.find((q) => q.id === id);
      if (t) { t.played = true; t.banner.material = bannerMats[1]; }
    },
    // Repairs change what some screens say (power online, signal sent, launch window open).
    setProgress(stage) {
      screenStage = stage;
      for (const c of consoles) {
        if (!c.live) continue;
        redraw(c.tex, consoleScreen(c.p.screen, { stage, layout }), { mirror: true });
        c.flicker = 0.6;
      }
    },
    // A console's screen, for the screen apparitions (js/babylon/screens.js), by prop id.
    // texture: its DynamicTexture; normal(): a fresh canvas of what it usually shows;
    // lit(on): its glow on (a dead monitor lights up while something plays on it) or back as it was.
    consoleFeed(id) {
      const c = consoles.find((q) => q.p.id === id);
      return c && {
        texture: c.tex,
        normal: () => consoleScreen(c.p.screen, { stage: c.live ? screenStage : 0, layout }),
        lit: (on) => c.glow.setEnabled(on || c.p.screen !== 'off'),
      };
    },
    // A noise-maker has been taken: it goes, and so does the prompt to take it.
    takePickup(id) {
      pickups.get(id)?.remove();
      pickups.delete(id);
      const i = interactables.findIndex((it) => it.id === id);
      if (i >= 0) interactables.splice(i, 1);
    },
    takeFromCrate() { const id = crateItems.shift(); if (id) { pickups.get(id)?.remove(); pickups.delete(id); } },
    setPickupLabel(id, text) { const it = interactables.find((q) => q.id === id); if (it) it.label = text; },
    setStatus(id, hex) { if (props[id]) props[id].status.emissiveColor = srgb(hex); },
    setCommsLit() { redraw(props.commsScreen.tex, commsCallScreen({ sent: true }), { mirror: true }); props.commsScreen.last = 2; },
    // While E is held on a repair: the comms screen walks through the call (redrawn in steps).
    setRepairProgress(id, p) {
      if (id === 'pod') { podView?.setProgress(p); return; }
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
    // The Hat Man's power cut: every room light out (not the generator or teleporter glow).
    setBlackout(on) { for (const r of rooms) r.blackout = on; },
  };
}
