// Babylon.js renderer for the secret Cryosleep Bay (js/cryoplan.js; reference files/Station 9
// Cryosleep Bay.png): six cryopods, five empty and dark and one frosted over with someone inside,
// a grated walkway, painted walls and a monitor desk. update(time) keeps your pod's glow breathing.
import { TILE, WALL_H } from '../layout.js';
import { cryoPods, cryoFixtures, POD_SIZE } from '../cryoplan.js';
import { cryoPodScreen, frostTexture, cryoPodLabel, cryoBackSign, cryoSlogan, cryoDeskScreen, cryoGrateTexture, cryoPlateTexture } from '../cryotextures.js';
import { pbr, basic, toTexture, bevelBox } from './util.js';

export function buildCryo(scene, layout, kit) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, Vector3, Mesh } = BABYLON;
  const T = (c, o = {}) => toTexture(scene, c, { anisotropy: 4, ...o });
  const TWall = (c) => T(c, { mirror: true });
  const node = (name, parent) => { const n = new TransformNode(name, scene); if (parent) n.parent = parent; return n; };
  const put = (mesh, parent, x, y, z, mat) => { mesh.parent = parent; mesh.position.set(x, y, z); mesh.material = mat; return mesh; };

  const firstMesh = scene.meshes.length; // everything built from here on is the bay's
  const cream = pbr(scene, { color: 0xd8d1bf, roughness: 0.55, metalness: 0.25, surface: 'painted', bump: 0.4 });
  const dark = pbr(scene, { color: 0x24282b, roughness: 0.5, metalness: 0.7 });
  const orange = pbr(scene, { color: 0xc8641e, roughness: 0.55, metalness: 0.2 });
  const rubber = pbr(scene, { color: 0x141516, roughness: 0.8 });
  const amber = basic(scene, 0xffa040);
  const emptyGlass = basic(scene, 0x1c2a30, { alpha: 0.35 });
  emptyGlass.backFaceCulling = false;
  const frostMap = T(frostTexture()); frostMap.hasAlpha = true;
  const frostGlass = new BABYLON.StandardMaterial('frost', scene);
  frostGlass.diffuseTexture = frostMap; frostGlass.useAlphaFromDiffuseTexture = true;
  frostGlass.emissiveColor = new BABYLON.Color3(0.25, 0.42, 0.6);
  frostGlass.specularColor = new BABYLON.Color3(0.6, 0.7, 0.8);
  frostGlass.backFaceCulling = false;
  const iceBody = pbr(scene, { color: 0xbcd6ea, roughness: 0.3, metalness: 0.1 });
  iceBody.emissiveColor = new BABYLON.Color3(0.1, 0.2, 0.3);
  const innerGlow = basic(scene, 0x5aa8ff);

  const { length: L, width: W } = POD_SIZE;
  let glowMat = null;
  for (const pod of cryoPods(layout)) {
    // Local frame: the pod's length runs along +z, head at -z (against the wall), foot at +z.
    const g = node('cryopod', null);
    g.position.set(pod.x, 0, pod.z);
    g.rotation.y = pod.rotY;
    put(MeshBuilder.CreateBox('pod-plinth', { width: W - 0.08, height: 0.22, depth: L - 0.1 }, scene), g, 0, 0.11, 0, dark);
    put(bevelBox('pod-body', { width: W, height: 0.56, depth: L - 0.5, bevel: 0.05 }, scene), g, 0, 0.5, 0.02, cream);
    put(bevelBox('pod-head', { width: W + 0.06, height: 1.02, depth: 0.32, bevel: 0.05 }, scene), g, 0, 0.62, -L / 2 + 0.16, cream);
    put(bevelBox('pod-foot', { width: W + 0.06, height: 0.86, depth: 0.3, bevel: 0.05 }, scene), g, 0, 0.55, L / 2 - 0.15, cream);
    for (const sx of [-1, 1]) {
      put(MeshBuilder.CreateBox('pod-stripe', { width: 0.012, height: 0.07, depth: L - 0.8 }, scene), g, sx * (W / 2 + 0.006), 0.56, 0.02, orange);
      put(MeshBuilder.CreateBox('pod-amber', { width: 0.02, height: 0.025, depth: L - 0.3 }, scene), g, sx * (W / 2 - 0.03), 0.03, 0, amber);
    }
    // The number and caution plate on the foot, facing the walkway.
    const label = put(MeshBuilder.CreatePlane('pod-label', { width: 0.82, height: 0.64 }, scene), g, 0, 0.55, L / 2 + 0.002, pbr(scene, { map: TWall(cryoPodLabel(pod.n)), roughness: 0.7 }));
    label.rotation.y = Math.PI;
    // The screen, angled up on top of the foot cap.
    const scr = node('pod-screen', g);
    scr.position.set(0, 1.04, L / 2 - 0.16);
    scr.rotation.x = -0.65;
    put(bevelBox('pod-screen-box', { width: 0.42, height: 0.3, depth: 0.06, bevel: 0.015 }, scene), scr, 0, 0, 0, dark);
    const face = put(MeshBuilder.CreatePlane('pod-screen-face', { width: 0.36, height: 0.225 }, scene), scr, 0, 0, 0.032, basic(scene, 0, { map: TWall(cryoPodScreen(pod.n, pod.occupied)) }));
    face.rotation.y = Math.PI;
    // The tray inside, and the curved glass lid over it.
    put(MeshBuilder.CreateBox('pod-tray', { width: W - 0.2, height: 0.04, depth: L - 0.72 }, scene), g, 0, 0.8, 0.02, pod.occupied ? innerGlow : dark);
    const lid = MeshBuilder.CreateCylinder('pod-lid', { diameter: W - 0.12, height: L - 0.64, tessellation: 28, arc: 0.5, enclose: false, sideOrientation: Mesh.DOUBLESIDE }, scene);
    put(lid, g, 0, 0.8, 0.02, pod.occupied ? frostGlass : emptyGlass);
    lid.rotation.set(Math.PI / 2, 0, -Math.PI / 2); // axis along z, the half-round on top
    if (pod.occupied) {
      // Someone lying under the frost: head toward the wall.
      const body = node('frozen', g);
      body.position.set(0, 0.9, 0);
      put(MeshBuilder.CreateSphere('f-head', { diameter: 0.2, segments: 10 }, scene), body, 0, 0.02, -0.6, iceBody);
      const torso = put(MeshBuilder.CreateCapsule('f-torso', { radius: 0.13, height: 0.6, tessellation: 10 }, scene), body, 0, 0, -0.22, iceBody);
      torso.rotation.x = Math.PI / 2; torso.scaling.x = 1.25;
      for (const sx of [-1, 1]) {
        const leg = put(MeshBuilder.CreateCapsule('f-leg', { radius: 0.06, height: 0.78, tessellation: 8 }, scene), body, sx * 0.08, -0.02, 0.38, iceBody);
        leg.rotation.x = Math.PI / 2;
        const arm = put(MeshBuilder.CreateCapsule('f-arm', { radius: 0.045, height: 0.55, tessellation: 8 }, scene), body, sx * 0.2, -0.01, -0.18, iceBody);
        arm.rotation.x = Math.PI / 2;
      }
      glowMat = innerGlow;
      const light = new BABYLON.PointLight('cryo-pod-glow', new Vector3(0, 1.1, 0), scene);
      light.parent = g; light.diffuse = new BABYLON.Color3(0.45, 0.7, 1); light.intensity = 0.9; light.range = 3.2;
    }
    // Two hoses from the head up the wall into the ceiling.
    for (const sx of [-0.26, 0.26]) {
      const path = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        path.push(new Vector3(sx + Math.sin(t * Math.PI) * 0.06 * Math.sign(sx), 1.1 + (WALL_H - 1.1) * t, -L / 2 + 0.12 - Math.sin(t * Math.PI) * 0.12 - t * 0.02));
      }
      put(MeshBuilder.CreateTube('pod-hose', { path, radius: 0.04, tessellation: 8 }, scene), g, 0, 0, 0, rubber);
    }
  }

  // The walkway grating down the middle.
  const r = layout.room('cryo');
  const x0 = r.x * TILE, x1 = (r.x + r.w) * TILE, z0 = r.y * TILE, z1 = (r.y + r.h) * TILE;
  const grate = MeshBuilder.CreateGround('cryo-grate', { width: 3.2, height: z1 - z0 - 0.2 }, scene);
  grate.position.set((x0 + x1) / 2, 0.013, (z0 + z1) / 2);
  const grateTex = T(cryoGrateTexture()); grateTex.uScale = 3.2 / 0.6; grateTex.vScale = (z1 - z0) / 0.6;
  grate.material = pbr(scene, { map: grateTex, roughness: 0.5, metalness: 0.7, zOffset: -1 });
  grate.metadata = { decal: true };

  // Painted walls: the back-wall sign and the two slogans.
  const f = cryoFixtures(layout);
  const painted = (spot, canvas, name) => {
    const n = node(name);
    n.position.set(spot.x, spot.y, spot.z); n.rotation.y = spot.rot;
    const tex = TWall(canvas); tex.hasAlpha = true;
    const m = put(MeshBuilder.CreatePlane(name, { width: spot.w, height: spot.h }, scene), n, 0, 0, 0.006, pbr(scene, { map: tex, roughness: 0.8, transparent: true, zOffset: -2 }));
    m.rotation.y = Math.PI; m.metadata = { decal: true };
  };
  painted(f.backSign, cryoBackSign(), 'cryo-sign');
  painted(f.westText, cryoSlogan(['PRESERVE', 'PROTECT', 'PROGRESS', 'TOGETHER']), 'cryo-west');
  painted(f.eastText, cryoSlogan(['LONGER', 'JOURNEYS', 'BRIGHTER', 'TOMORROWS']), 'cryo-east');

  // The desk at the back, with its two monitors (one shows POD 05) and a chair.
  const desk = kit.place('desk', f.desk.x, f.desk.z, f.desk.rotY);
  const deskScreen = basic(scene, 0, { map: TWall(cryoDeskScreen()) });
  const offScreen = basic(scene, 0x0b1517);
  [[-0.32, 0.5, deskScreen], [0.42, 0.36, offScreen]].forEach(([x, wM, mat]) => {
    const mon = node('cryo-monitor', desk);
    mon.position.set(x, 0.765, -0.12);
    put(MeshBuilder.CreateBox('cryo-stand', { width: 0.12, height: 0.18, depth: 0.08 }, scene), mon, 0, 0.09, 0, dark);
    put(bevelBox('cryo-mon', { width: wM + 0.06, height: wM * 0.66 + 0.06, depth: 0.05, bevel: 0.012 }, scene), mon, 0, 0.18 + wM * 0.33 + 0.03, 0, dark);
    const s = put(MeshBuilder.CreatePlane('cryo-mon-face', { width: wM, height: wM * 0.62 }, scene), mon, 0, 0.18 + wM * 0.33 + 0.03, 0.027, mat);
    s.rotation.y = Math.PI;
  });
  kit.place('officeChair', f.desk.x - 0.1, f.desk.z - 0.9, 0.2);

  // CRYOSLEEP BAY on the inner door's header, facing the passage.
  const inner = layout.doors.find((d) => d.hidden && !d.secret);
  if (inner) {
    const n = node('cryo-plate');
    n.position.set((inner.cx + 0.5) * TILE, WALL_H - 0.16, (inner.cz + 0.5) * TILE - 0.275);
    n.rotation.y = Math.PI;
    const m = put(MeshBuilder.CreatePlane('cryo-plate', { width: 1.6, height: 0.24 }, scene), n, 0, 0, 0.004, pbr(scene, { map: TWall(cryoPlateTexture('CRYOSLEEP BAY  ·  A')), roughness: 0.6, metalness: 0.3 }));
    m.rotation.y = Math.PI;
  }

  // A soft cold fill for the bay's own pieces (like the suites' room lights), so the pods read in
  // the dark. The scene has more lights than a material's default share, so these get room for all.
  const bayMeshes = scene.meshes.slice(firstMesh);
  const fill = new BABYLON.HemisphericLight('cryo-fill', new Vector3(0, 1, 0), scene);
  fill.diffuse = new BABYLON.Color3(0.55, 0.75, 1);
  fill.groundColor = new BABYLON.Color3(0.08, 0.1, 0.14);
  fill.specular = new BABYLON.Color3(0.2, 0.25, 0.3);
  fill.intensity = 0.6;
  fill.includedOnlyMeshes = bayMeshes;
  for (const m of bayMeshes) if (m.material && 'maxSimultaneousLights' in m.material) m.material.maxSimultaneousLights = 28;

  return {
    // Your pod's inner light breathes, very slowly.
    update(time) { if (glowMat) glowMat.emissiveColor.set(0.2 + 0.06 * Math.sin(time * 0.7), 0.45 + 0.08 * Math.sin(time * 0.7), 0.9); },
  };
}
