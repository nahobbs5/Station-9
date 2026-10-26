// Babylon.js mesh for the escape pod (js/podplan.js; the spec sheet in reference files/): an
// eight-sided capsule in worn white with an orange band, its nose door down as a ramp onto a small
// interior, a door control reading LAUNCH?, and three thrusters that warm up as you prep it.
// Built in the pod's own frame: x along it (nose at +x), y up, z across; centred on the floor.
import { POD } from '../podplan.js';
import {
  podHullTexture, podBandTexture, podMarkingsTexture, podHatchTexture, podRampTexture, podPanelScreen,
  thrusterTexture, podConsoleScreen,
} from '../podtextures.js';
import { pbr, basic, toTexture, redraw } from './util.js';

const OCT = Math.cos(Math.PI / 8); // an octagon's flat-to-flat over its corner-to-corner

export function buildPod(scene, parent) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, Mesh } = BABYLON;
  const T = (c, o = {}) => toTexture(scene, c, { anisotropy: 4, ...o });
  const root = new TransformNode('pod', scene);
  root.parent = parent;
  const L = POD.length, W = POD.width, H = POD.height;
  const cy = H / 2 + 0.06; // on short skids
  const yScale = H / W;

  // An eight-sided section along x, from x0 to x1, flats on top, bottom and sides.
  // d0 / d1: flat-to-flat width at each end. cap: Mesh.CAP_START (x0 end), CAP_END, CAP_ALL or NO_CAP.
  function section(name, x0, x1, d0, d1, mat, cap = Mesh.NO_CAP) {
    const turn = new TransformNode(name + '-axis', scene);
    turn.parent = root;
    turn.position.set((x0 + x1) / 2, cy, 0);
    turn.rotation.z = -Math.PI / 2; // the cylinder's +y becomes +x (toward the nose)
    turn.scaling.set(yScale, 1, 1); // y (before the turn: x) squashed to the pod's height
    const m = MeshBuilder.CreateCylinder(name, {
      height: x1 - x0, diameterBottom: d0 / OCT, diameterTop: d1 / OCT, tessellation: 8, cap,
    }, scene);
    m.parent = turn;
    m.rotation.y = Math.PI / 8; // flats, not corners, on top and at the sides
    m.material = mat;
    return m;
  }

  const hullMat = pbr(scene, { map: T(podHullTexture()), roughness: 0.55, metalness: 0.25 });
  const darkMat = pbr(scene, { color: 0x2a2c2e, roughness: 0.5, metalness: 0.7 });
  const bandMat = pbr(scene, { map: T(podBandTexture()), roughness: 0.5, metalness: 0.2 });
  const glow = basic(scene, 0xff8a2a);
  const glass = pbr(scene, { color: 0x0b1620, roughness: 0.08, metalness: 0.9 });

  // Hull: dark tail, the main body, the band, dark trim rings, and the tapered nose (left open:
  // the door is its front).
  const xTail = -L / 2, xBody = -L / 2 + 0.6, xNose = L / 2 - 0.95, xFront = L / 2;
  const noseW = 1.5;
  section('pod-tail', xTail, xBody, W * 0.86, W * 0.97, darkMat, Mesh.CAP_START);
  section('pod-body', xBody, xNose, W, W, hullMat);
  section('pod-band', -0.55, -0.05, W + 0.04, W + 0.04, bandMat);
  section('pod-trim-a', xBody - 0.05, xBody + 0.07, W + 0.06, W + 0.06, darkMat);
  section('pod-trim-b', xNose - 0.06, xNose + 0.06, W + 0.06, W + 0.06, darkMat);
  const nose = section('pod-nose', xNose, xFront, W, noseW, hullMat);
  section('pod-nose-rim', xFront - 0.08, xFront, noseW + 0.08, noseW + 0.06, darkMat);
  nose.material.backFaceCulling = false;

  // Skids underneath.
  for (const z of [-0.7, 0.7]) {
    const skid = MeshBuilder.CreateBox('pod-skid', { width: L - 0.6, height: 0.08, depth: 0.16 }, scene);
    skid.parent = root; skid.position.set(0, 0.04, z); skid.material = darkMat;
  }

  // Inside: a small dark cabin you can see through the open nose, two seats with orange harnesses,
  // a console, and ceiling light strips (unlit glow: no real light needed).
  const cabin = new TransformNode('pod-cabin', scene);
  cabin.parent = root;
  const inMat = pbr(scene, { color: 0x3a3c3e, roughness: 0.7, metalness: 0.5 });
  const inW = W * 0.82, inH = H * 0.8, inX0 = xBody + 0.1, inX1 = xFront - 0.05;
  const wall = (w, h, x, y, z, ry, rx = 0) => {
    const m = MeshBuilder.CreatePlane('pod-in', { width: w, height: h, sideOrientation: Mesh.DOUBLESIDE }, scene);
    m.parent = cabin; m.position.set(x, y, z); m.rotation.set(rx, ry, 0); m.material = inMat;
    return m;
  };
  const midX = (inX0 + inX1) / 2, inLen = inX1 - inX0;
  wall(inLen, inW, midX, cy - inH / 2, 0, 0, Math.PI / 2);       // floor
  wall(inLen, inW, midX, cy + inH / 2, 0, 0, Math.PI / 2);       // ceiling
  wall(inW, inH, inX0, cy, 0, Math.PI / 2);                       // back
  wall(inLen, inH, midX, cy, -inW / 2, 0);                         // sides
  wall(inLen, inH, midX, cy, inW / 2, 0);
  const seatMat = pbr(scene, { color: 0x2e2a28, roughness: 0.65 });
  const strapMat = pbr(scene, { color: 0xd9772b, roughness: 0.6 });
  for (const z of [-0.42, 0.42]) {
    const sx = inX0 + 0.45, base = cy - inH / 2;
    const box = (w, h, d, x, y, zz, mat) => { const m = MeshBuilder.CreateBox('pod-seat', { width: w, height: h, depth: d }, scene); m.parent = cabin; m.position.set(x, y, zz); m.material = mat; return m; };
    box(0.55, 0.12, 0.55, sx + 0.1, base + 0.48, z, seatMat);       // seat
    box(0.12, 0.85, 0.55, sx - 0.18, base + 0.9, z, seatMat);       // back, facing the door
    box(0.08, 0.06, 0.6, sx - 0.18, base + 1.38, z, seatMat);       // headrest
    for (const dz of [-0.14, 0.14]) box(0.03, 0.75, 0.06, sx - 0.11, base + 0.9, z + dz, strapMat); // harness
    box(0.3, 0.42, 0.42, sx + 0.1, base + 0.21, z, darkMat);        // pedestal
  }
  const consoleScreen = MeshBuilder.CreatePlane('pod-console', { width: 0.42, height: 0.26 }, scene);
  consoleScreen.parent = cabin;
  consoleScreen.position.set(inX1 - 0.55, cy - 0.05, -inW / 2 + 0.03);
  consoleScreen.material = basic(scene, 0, { map: T(podConsoleScreen()) });
  for (const z of [-0.3, 0.3]) {
    const strip = MeshBuilder.CreateBox('pod-ceiling-light', { width: inLen * 0.6, height: 0.03, depth: 0.08 }, scene);
    strip.parent = cabin; strip.position.set(midX + 0.2, cy + inH / 2 - 0.03, z); strip.material = basic(scene, 0xfff1d6);
  }

  // The door: the nose's front, hinged at its bottom edge. Open, it lies as a ramp to the floor.
  const hingeY = cy - (noseW * yScale) / 2;
  const doorLen = noseW * yScale;
  const hinge = new TransformNode('pod-door-hinge', scene);
  hinge.parent = root;
  hinge.position.set(xFront + 0.03, hingeY, 0);
  const door = MeshBuilder.CreateBox('pod-door', { width: 0.06, height: doorLen, depth: noseW * 0.9 }, scene);
  door.parent = hinge;
  door.position.y = doorLen / 2;
  door.material = pbr(scene, { map: T(podRampTexture()), roughness: 0.6, metalness: 0.6 });
  // Swung down (toward +x) until its far edge touches the floor.
  const openAngle = -Math.acos(-hingeY / doorLen);
  hinge.rotation.z = openAngle;

  // Orange light strips: low along both flanks, and at the nose corners.
  const strip = (w, x, y, z, ry = 0) => {
    const m = MeshBuilder.CreateBox('pod-light', { width: w, height: 0.05, depth: 0.04 }, scene);
    m.parent = root; m.position.set(x, y, z); m.rotation.y = ry; m.material = glow;
  };
  for (const s of [-1, 1]) {
    strip(1.2, -1.0, 0.42, s * (W / 2 + 0.01));
    strip(0.45, xNose + 0.35, cy - 0.35, s * (W / 2 - 0.12), -s * 0.32);
    strip(0.45, xNose + 0.35, cy + 0.42, s * (W / 2 - 0.14), -s * 0.32);
  }

  // Side windows near the nose, and the markings: logo, 09 ESCAPE, and the PULL hatch.
  const decal = (canvas, w, h, x, y, side, mat = null) => {
    const m = MeshBuilder.CreatePlane('pod-decal', { width: w, height: h }, scene);
    m.parent = root;
    m.position.set(x, y, side * (W / 2 + 0.012));
    m.rotation.y = side > 0 ? Math.PI : 0; // face out of that flank
    if (mat) { m.material = mat; return m; }
    const tex = T(canvas, { mirror: side > 0 });
    tex.hasAlpha = true;
    const pm = pbr(scene, { map: tex, roughness: 0.6, transparent: true, zOffset: -2 });
    m.material = pm;
    return m;
  };
  for (const s of [-1, 1]) {
    decal(null, 0.46, 0.17, 0.55, cy + 0.68, s, glass); // a slit window up by the roofline
    decal(podMarkingsTexture(), 0.9, 0.9, 0.52, cy - 0.06, s);
    decal(podHatchTexture(), 0.42, 0.42, -1.25, cy + 0.15, s);
  }

  // The door control on the south flank: a screen and a big orange button.
  const panelLocal = { x: POD.panel.x - POD.center.x, y: POD.panel.y, z: POD.panel.z - POD.center.z };
  const housing = MeshBuilder.CreateBox('pod-panel', { width: 0.5, height: 0.62, depth: 0.04 }, scene);
  housing.parent = root; housing.position.set(panelLocal.x, panelLocal.y, W / 2 + 0.02); housing.material = darkMat;
  const panelTex = T(podPanelScreen({ p: 0 }), { mirror: true });
  const screen = MeshBuilder.CreatePlane('pod-panel-screen', { width: 0.42, height: 0.28 }, scene);
  screen.parent = root; screen.position.set(panelLocal.x, panelLocal.y + 0.1, W / 2 + 0.045); screen.rotation.y = Math.PI;
  screen.material = basic(scene, 0, { map: panelTex });
  const button = MeshBuilder.CreateCylinder('pod-button', { diameter: 0.11, height: 0.04, tessellation: 16 }, scene);
  button.parent = root; button.position.set(panelLocal.x + 0.1, panelLocal.y - 0.19, W / 2 + 0.05); button.rotation.x = Math.PI / 2;
  button.material = glow;

  // Three thrusters at the tail, their cores glowing as the pod warms up.
  const coreTex = T(thrusterTexture());
  const coreMat = basic(scene, 0, { map: coreTex });
  coreTex.level = 0.25;
  for (const [y, z] of [[cy + 0.4, 0], [cy - 0.3, -0.4], [cy - 0.3, 0.4]]) {
    const bell = MeshBuilder.CreateCylinder('pod-thruster', { diameterTop: 0.5, diameterBottom: 0.62, height: 0.32, tessellation: 20, cap: Mesh.NO_CAP }, scene);
    bell.parent = root; bell.position.set(xTail - 0.12, y, z); bell.rotation.z = Math.PI / 2; bell.material = darkMat;
    bell.material.backFaceCulling = false;
    const core = MeshBuilder.CreatePlane('pod-core', { size: 0.5 }, scene);
    core.parent = root; core.position.set(xTail - 0.03, y, z); core.rotation.y = Math.PI / 2; core.material = coreMat;
  }

  let shownAt = -1, launchT = -1;
  return {
    root,
    // Where the status light goes, in the pod's frame (above the door control).
    statusPos: [panelLocal.x + 0.17, panelLocal.y + 0.37, W / 2 + 0.03],
    // Prep progress 0..1: the door control counts up and the thrusters warm.
    setProgress(p) {
      coreTex.level = 0.25 + 1.5 * p;
      if (p < 1 && Math.abs(p - shownAt) < 0.02) return;
      shownAt = p;
      redraw(panelTex, podPanelScreen({ p }), { mirror: true });
    },
    // Launch: the door swings shut, the thrusters flare, the pod shudders.
    launch() { if (launchT < 0) launchT = 0; },
    update(dt) {
      if (launchT < 0) return;
      launchT += dt;
      const k = Math.min(1, launchT / 0.8);
      hinge.rotation.z = openAngle * (1 - k * k * (3 - 2 * k));
      coreTex.level = 1.75 + Math.min(1.5, launchT * 2) + Math.random() * 0.4;
      const shake = Math.min(1, launchT) * 0.012;
      root.position.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    },
  };
}
