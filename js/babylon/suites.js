// Babylon.js renderer for the wellness suites (js/suiteplan.js): padded walls and floors, bright
// unlit ceiling panels, one cool light per suite that touches only that suite's meshes, the
// equipment as simple shapes, and the graffiti. update(time) keeps every heart monitor in sync.
import { WALL_H, TILE } from '../layout.js';
import { wallPanels } from '../worldplan.js';
import { SUITES, planSuite, paddedSuite } from '../suiteplan.js';
import {
  paddedWallTexture, paddedFloorTexture, suiteCeilingTexture, ceilingPanelTexture, heartMonitorScreen,
  kioskTexture, wellnessFormTexture, graffitiTexture, notebookTexture, bloodyPillowTexture, markerTexture, VANTORA_CREAM, SOFT_TEAL,
} from '../suitetextures.js';
import { stickyNote } from '../textures.js';
import { pbr, basic, toTexture, redraw, linear } from './util.js';

const PAD = 1.2; // metres per padded panel

export function buildSuites(scene, layout) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, Vector3, Mesh } = BABYLON;
  const hex = (s) => parseInt(s.slice(1), 16);
  const T = (c, o = {}) => toTexture(scene, c, { anisotropy: 4, ...o });
  const TWall = (c) => T(c, { mirror: true }); // planes turned to face into the room show mirrored

  // Shared materials.
  const padMat = pbr(scene, { map: T(paddedWallTexture()), roughness: 0.95 });
  padMat.backFaceCulling = false;
  const panelMat = basic(scene, 0, { map: T(ceilingPanelTexture()) });
  const cream = pbr(scene, { color: hex(VANTORA_CREAM), roughness: 0.55, metalness: 0.1 });
  const teal = pbr(scene, { color: hex(SOFT_TEAL), roughness: 0.5, metalness: 0.2 });
  const steel = pbr(scene, { color: 0xc4c9cc, roughness: 0.35, metalness: 0.85 });
  const sheet = pbr(scene, { color: 0xfafcfb, roughness: 0.8 });
  const strap = pbr(scene, { color: 0x2f6e6a, roughness: 0.6 });
  const bloodyPillow = pbr(scene, { map: T(bloodyPillowTexture()), roughness: 0.8 });
  const tubing = pbr(scene, { color: 0xe8f2f0, roughness: 0.3 });
  const ringGlow = basic(scene, 0x8fe0cf);
  // Every monitor shows this one texture, so they all beat together.
  const ecgTex = TWall(heartMonitorScreen(0));
  const ecgMat = basic(scene, 0, { map: ecgTex });
  const kioskMat = basic(scene, 0, { map: TWall(kioskTexture()) });
  const formMats = [1, 2, 3, 4, 5].map((s) => pbr(scene, { map: TWall(wellnessFormTexture(s)), roughness: 0.9 }));

  const suites = {};
  for (const id of Object.keys(SUITES)) {
    const room = layout.room(id);
    const x0 = room.x * TILE, z0 = room.y * TILE, w = room.w * TILE, d = room.h * TILE;
    const meshes = [];
    const keep = (m) => { meshes.push(m); for (const c of m.getChildMeshes?.() ?? []) meshes.push(c); return m; };
    const root = new TransformNode('suite-' + id, scene);

    // Padded walls: the station's wall outline inside this room, quilted floor to ceiling.
    const positions = [], normals = [], uvs = [], indices = [];
    let u = 0;
    for (const p of wallPanels(layout)) {
      if (paddedSuite(layout, p) !== id) continue;
      const len = Math.hypot(p.bx - p.ax, p.bz - p.az);
      const i = positions.length / 3;
      // Pulled 2 cm in from the wall so it sits on top of the station's own wall.
      const ox = p.nx * 0.02, oz = p.nz * 0.02;
      positions.push(p.ax + ox, 0, p.az + oz, p.bx + ox, 0, p.bz + oz, p.bx + ox, WALL_H, p.bz + oz, p.ax + ox, WALL_H, p.az + oz);
      for (let k = 0; k < 4; k++) normals.push(p.nx, 0, p.nz);
      uvs.push(u / PAD, 0, (u + len) / PAD, 0, (u + len) / PAD, WALL_H / PAD, u / PAD, WALL_H / PAD);
      u += len;
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
    if (positions.length) {
      const walls = new Mesh('padded-' + id, scene);
      Object.assign(new BABYLON.VertexData(), { positions, normals, uvs, indices }).applyToMesh(walls);
      walls.material = padMat;
      walls.parent = root;
      keep(walls);
    }

    // Padded floor mats and a Clinic White ceiling over the whole room.
    const floor = MeshBuilder.CreateGround('pad-floor', { width: w, height: d }, scene);
    floor.position.set(x0 + w / 2, 0.012, z0 + d / 2);
    const floorTex = T(paddedFloorTexture());
    floorTex.uScale = w; floorTex.vScale = d; // one mat per square metre
    floor.material = pbr(scene, { map: floorTex, roughness: 0.95, zOffset: -1 });
    floor.parent = root;
    keep(floor);
    // CreateGround ignores sideOrientation (it only ever faces up), so ceilings are flat double-sided planes.
    const ceil = MeshBuilder.CreatePlane('pad-ceiling', { width: w, height: d, sideOrientation: Mesh.DOUBLESIDE }, scene);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(x0 + w / 2, WALL_H - 0.012, z0 + d / 2);
    const ceilTex = T(suiteCeilingTexture());
    ceilTex.uScale = w / 2; ceilTex.vScale = d / 2; // one tile per 2 m
    ceil.material = pbr(scene, { map: ceilTex, roughness: 0.9 });
    ceil.parent = root;
    keep(ceil);

    // The equipment.
    let formIndex = 0;
    let graffiti = null, notebook = null;
    for (const piece of planSuite(layout, id)) {
      const g = new TransformNode(piece.kind, scene);
      g.parent = root;
      g.position.set(piece.x, piece.y, piece.z);
      g.rotation.y = piece.rotY;
      const [pw, pd, ph] = piece.size;
      const part = (mesh, x, y, z, mat) => { mesh.parent = g; mesh.position.set(x, y, z); mesh.material = mat; return keep(mesh); };
      // A plane on the piece's front (+z), facing out.
      const face = (name, fw, fh, y, z, mat) => { const m = part(MeshBuilder.CreatePlane(name, { width: fw, height: fh }, scene), 0, y, z, mat); m.rotation.y = Math.PI; return m; };

      switch (piece.kind) {
        case 'gurney': {
          // Frame, legs, ironed sheet, and three straps done up with no one in them.
          part(MeshBuilder.CreateBox('frame', { width: pw, height: 0.06, depth: pd }, scene), 0, ph - 0.1, 0, steel);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            part(MeshBuilder.CreateCylinder('leg', { diameter: 0.04, height: ph - 0.1, tessellation: 8 }, scene), sx * (pw / 2 - 0.06), (ph - 0.1) / 2, sz * (pd / 2 - 0.08), steel);
          }
          part(MeshBuilder.CreateBox('mattress', { width: pw - 0.06, height: 0.1, depth: pd - 0.06 }, scene), 0, ph - 0.02, 0, sheet);
          part(MeshBuilder.CreateBox('pillow', { width: pw - 0.2, height: 0.08, depth: 0.32 }, scene), 0, ph + 0.07, -pd / 2 + 0.24, piece.bloody ? bloodyPillow : sheet);
          for (const sz of [-0.35, 0.15, 0.6]) {
            part(MeshBuilder.CreateBox('strap', { width: pw + 0.02, height: 0.025, depth: 0.08 }, scene), 0, ph + 0.04, sz, strap);
            part(MeshBuilder.CreateBox('buckle', { width: 0.07, height: 0.03, depth: 0.09 }, scene), pw / 2 - 0.12, ph + 0.05, sz, steel);
          }
          break;
        }
        case 'iv': {
          part(MeshBuilder.CreateCylinder('iv-base', { diameter: pw, height: 0.03, tessellation: 5 }, scene), 0, 0.03, 0, steel);
          part(MeshBuilder.CreateCylinder('iv-pole', { diameter: 0.025, height: ph, tessellation: 8 }, scene), 0, ph / 2, 0, steel);
          part(MeshBuilder.CreateBox('iv-hook', { width: 0.36, height: 0.02, depth: 0.02 }, scene), 0, ph - 0.03, 0, steel);
          // Empty: just the tubing, coiled neatly at the base.
          const coil = part(MeshBuilder.CreateTorus('iv-coil', { diameter: 0.18, thickness: 0.012, tessellation: 18 }, scene), 0.12, 0.05, 0.05, tubing);
          coil.scaling.y = 2.5;
          break;
        }
        case 'heartMonitor': {
          part(MeshBuilder.CreateBox('monitor', { width: pw, height: ph, depth: pd }, scene), 0, 0, 0, cream);
          face('ecg', pw - 0.06, ph - 0.07, 0.01, pd / 2 + 0.003, ecgMat);
          break;
        }
        case 'rack': {
          part(MeshBuilder.CreateBox('rack', { width: pw, height: ph, depth: 0.03 }, scene), 0, 0, 0, teal);
          face('form', pw - 0.04, ph - 0.06, 0.01, 0.02, formMats[formIndex++ % formMats.length]);
          break;
        }
        case 'ring': {
          // A smaller echo of the teleporter: two upright rings, joined, with a glowing inner edge.
          const r = pw / 2;
          for (const z of [-pd / 2 + 0.06, pd / 2 - 0.06]) {
            const ring = part(MeshBuilder.CreateTorus('ring', { diameter: pw - 0.12, thickness: 0.12, tessellation: 40 }, scene), 0, r, z, cream);
            ring.rotation.x = Math.PI / 2;
          }
          const glow = part(MeshBuilder.CreateTorus('ring-glow', { diameter: pw - 0.3, thickness: 0.03, tessellation: 40 }, scene), 0, r, 0, ringGlow);
          glow.rotation.x = Math.PI / 2;
          part(MeshBuilder.CreateBox('ring-base', { width: pw * 0.9, height: 0.06, depth: pd }, scene), 0, 0.03, 0, teal);
          break;
        }
        case 'kiosk': {
          part(MeshBuilder.CreateBox('kiosk', { width: pw, height: ph, depth: pd }, scene), 0, ph / 2, 0, cream);
          face('kiosk-face', pw - 0.08, ph * 0.66, ph * 0.6, pd / 2 + 0.003, kioskMat);
          break;
        }
        case 'ceilingPanel': {
          const p = part(MeshBuilder.CreatePlane('light-panel', { width: pw, height: pd, sideOrientation: Mesh.DOUBLESIDE }, scene), 0, -0.004, 0, panelMat);
          p.rotation.x = Math.PI / 2;
          break;
        }
        case 'chair': {
          // Bolted to the floor, facing the graffiti.
          part(MeshBuilder.CreateCylinder('chair-plate', { diameter: 0.4, height: 0.02, tessellation: 16 }, scene), 0, 0.01, 0, steel);
          part(MeshBuilder.CreateCylinder('chair-post', { diameter: 0.07, height: 0.42, tessellation: 10 }, scene), 0, 0.22, 0, steel);
          part(MeshBuilder.CreateBox('chair-seat', { width: pw, height: 0.07, depth: pd }, scene), 0, 0.46, 0, cream);
          part(MeshBuilder.CreateBox('chair-back', { width: pw, height: 0.4, depth: 0.06 }, scene), 0, ph - 0.2, -pd / 2 + 0.03, cream);
          break;
        }
        case 'graffiti': {
          // Drawn once the handwriting font has loaded (redrawn below), on a transparent plane.
          const tex = TWall(graffitiTexture());
          tex.hasAlpha = true;
          const mat = pbr(scene, { map: tex, roughness: 0.7, transparent: true, zOffset: -2 });
          face('graffiti', pw, ph, 0, 0, mat);
          graffiti = tex;
          break;
        }
        case 'notebook': {
          // Lying open on the floor: a thin cover with the written page on top.
          part(MeshBuilder.CreateBox('notebook', { width: pw, height: ph, depth: pd }, scene), 0, 0, 0, cream);
          notebook = TWall(notebookTexture());
          const page = part(MeshBuilder.CreatePlane('notebook-page', { width: pw - 0.01, height: pd - 0.01 }, scene), 0, ph / 2 + 0.001, 0,
            pbr(scene, { map: notebook, roughness: 0.9, zOffset: -2 }));
          page.rotation.x = Math.PI / 2; // face up
          break;
        }
        case 'marker': {
          const m = part(MeshBuilder.CreateCylinder('marker', { diameter: 0.022, height: pw, tessellation: 10 }, scene), 0, 0.011, 0,
            pbr(scene, { map: T(markerTexture()), roughness: 0.5 }));
          m.rotation.z = Math.PI / 2;
          break;
        }
        case 'note': {
          face('note', pw, ph, 0, 0.002, pbr(scene, { map: TWall(stickyNote(piece.text)), roughness: 0.9, zOffset: -3 }));
          break;
        }
        default:
          break;
      }
    }

    // One bright, cool light for the room, limited to the room's own meshes so the station stays dark.
    const light = new BABYLON.HemisphericLight('suite-light-' + id, new Vector3(0, 1, 0), scene);
    light.diffuse = linear(0xeef6ff);
    light.groundColor = linear(0xb8c4c0);
    light.specular = linear(0x404850);
    light.intensity = 1.1;
    light.includedOnlyMeshes = meshes;

    suites[id] = { root, light, meshes, graffiti, notebook };
  }

  // Redraw the wall writing and notebook once the marker font has loaded, or they stay in the fallback.
  const { graffiti: g, notebook: nb } = suites.quiet ?? {};
  if (g && document.fonts?.load) {
    document.fonts.load('64px "Permanent Marker"').then(() => {
      redraw(g, graffitiTexture(), { mirror: true });
      if (nb) redraw(nb, notebookTexture(), { mirror: true });
    }).catch((e) => console.warn('Graffiti font did not load', e));
  }

  let ecgTimer = 0;
  return {
    suites,
    // Keep the heart monitors ticking (about 12 times a second; they all share one texture).
    update(dt, time) {
      ecgTimer -= dt;
      if (ecgTimer > 0) return;
      ecgTimer = 1 / 12;
      redraw(ecgTex, heartMonitorScreen(time), { mirror: true });
    },
  };
}
