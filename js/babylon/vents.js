// Babylon.js meshes for the vents (js/vents.js): wall vent covers you can see through, floor
// gratings, and the cramped Dust Grey ducts behind them. tear(grate) swings a cover off its hinge.
import { buildVents, ventPoint, WES_CARD, VENT, COVER, HOLE } from '../vents.js';
import { coverTexture, gratingTexture, ductTexture, wesCardTexture } from '../venttextures.js';
import { pbr, toTexture } from './util.js';

export function buildVentMeshes(scene, layout) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, Mesh } = BABYLON;
  const vents = buildVents(layout);

  // See-through covers: alpha-tested (solid slats, open gaps), lit, both sides.
  const cutout = (canvas, opts = {}) => {
    const tex = toTexture(scene, canvas, { anisotropy: 4, ...opts });
    tex.hasAlpha = true;
    const m = pbr(scene, { map: tex, roughness: 0.6, metalness: 0.3 });
    m.useAlphaFromAlbedoTexture = true;
    m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHATEST;
    m.alphaCutOff = 0.5;
    m.backFaceCulling = false;
    return m;
  };
  const coverMat = cutout(coverTexture());
  const gratingMat = cutout(gratingTexture());
  const ductTex = toTexture(scene, ductTexture(), { anisotropy: 4 });
  const ductMat = pbr(scene, { map: ductTex, roughness: 0.75, metalness: 0.55 });

  // A duct: floor, ceiling and two sides along each stretch of the path, all facing in. y0: its floor.
  // UVs run one tile per 1.5 m along, so a seam lands every 1.5 m. openNear(s): leave the ceiling off
  // here (under a floor grating, so you can look up and out).
  function duct(v, y0, { capStart, capEnd, openNear = () => false }) {
    const positions = [], normals = [], uvs = [], indices = [];
    const half = VENT.ductSize / 2, y1 = y0 + VENT.ductSize;
    const quad = (p, n, uv) => {
      const i = positions.length / 3;
      for (const q of p) positions.push(...q);
      for (let k = 0; k < 4; k++) normals.push(...n);
      uvs.push(...uv);
      indices.push(i, i + 1, i + 2, i, i + 2, i + 3);
    };
    const step = 0.5;
    for (let s = 0; s < v.length - 1e-6; s += step) {
      const e = Math.min(v.length, s + step);
      const a = ventPoint(v, s), b = ventPoint(v, e);
      // Stretch each piece a little so bends don't leave cracks.
      const ax = a.x - a.dx * 0.02, az = a.z - a.dz * 0.02, bx = b.x + a.dx * 0.02, bz = b.z + a.dz * 0.02;
      const sx = -a.dz * half, sz = a.dx * half; // sideways
      const u0 = s / 1.5, u1 = e / 1.5;
      const L = [ax + sx, az + sz], R = [ax - sx, az - sz], L2 = [bx + sx, bz + sz], R2 = [bx - sx, bz - sz];
      quad([[L[0], y0, L[1]], [R[0], y0, R[1]], [R2[0], y0, R2[1]], [L2[0], y0, L2[1]]], [0, 1, 0], [u0, 0, u0, 1, u1, 1, u1, 0]); // floor
      if (!openNear((s + e) / 2)) quad([[L[0], y1, L[1]], [L2[0], y1, L2[1]], [R2[0], y1, R2[1]], [R[0], y1, R[1]]], [0, -1, 0], [u0, 0, u1, 0, u1, 1, u0, 1]); // ceiling
      quad([[L[0], y0, L[1]], [L2[0], y0, L2[1]], [L2[0], y1, L2[1]], [L[0], y1, L[1]]], [a.dz, 0, -a.dx], [u0, 0, u1, 0, u1, 1, u0, 1]); // left side
      quad([[R[0], y0, R[1]], [R[0], y1, R[1]], [R2[0], y1, R2[1]], [R2[0], y0, R2[1]]], [-a.dz, 0, a.dx], [u0, 0, u0, 1, u1, 1, u1, 0]); // right side
    }
    const cap = (s, dir) => {
      const p = ventPoint(v, s);
      const sx = -p.dz * half, sz = p.dx * half;
      quad([[p.x + sx, y0, p.z + sz], [p.x - sx, y0, p.z - sz], [p.x - sx, y1, p.z - sz], [p.x + sx, y1, p.z + sz]], [-p.dx * dir, 0, -p.dz * dir], [0, 0, 0.4, 0, 0.4, 1, 0, 1]);
    };
    if (capStart) cap(0, -1);
    if (capEnd) cap(v.length, 1);
    const mesh = new Mesh('duct-' + v.id, scene);
    Object.assign(new BABYLON.VertexData(), { positions, normals, uvs, indices }).applyToMesh(mesh);
    mesh.material = ductMat;
    mesh.material.backFaceCulling = false;
    return mesh;
  }

  const covers = new Map(); // grate -> { pivot, open }
  for (const v of vents) {
    if (v.kind === 'dead') {
      duct(v, 0, { capStart: false, capEnd: true });
    } else {
      const open = (s) => s < 0.55 || s > v.length - 0.55;
      duct(v, VENT.ductFloor, { capStart: true, capEnd: true, openNear: open });
    }
    for (const g of v.grates) {
      if (g.kind === 'wall') {
        // Hinged along its top edge, so tearing it swings it up and off.
        const pivot = new TransformNode('vent-hinge', scene);
        pivot.position.set(g.x + g.inward[0] * 0.012, HOLE.y1, g.z + g.inward[1] * 0.012);
        pivot.rotation.y = Math.atan2(g.inward[0], g.inward[1]);
        const cover = MeshBuilder.CreatePlane('vent-cover', { size: COVER.wall }, scene);
        cover.parent = pivot;
        cover.position.y = -COVER.wall / 2;
        cover.rotation.y = Math.PI; // Babylon planes face -Z
        cover.material = coverMat;
        covers.set(g, { pivot, axis: 'x', open: 0 });
      } else {
        const pivot = new TransformNode('grating-hinge', scene);
        pivot.position.set(g.x - COVER.floor / 2, 0.012, g.z);
        const plate = MeshBuilder.CreatePlane('grating', { size: COVER.floor }, scene);
        plate.parent = pivot;
        plate.position.x = COVER.floor / 2;
        plate.rotation.x = Math.PI / 2;
        plate.material = gratingMat;
        covers.set(g, { pivot, axis: 'z', open: 0 });
      }
    }
    // Wes's card, taped to the duct wall.
    if (v.id === WES_CARD.vent) {
      const p = ventPoint(v, WES_CARD.s);
      const card = MeshBuilder.CreatePlane('wes-card', { width: 0.26, height: 0.16 }, scene);
      const side = VENT.ductSize / 2 - 0.01;
      card.position.set(p.x - p.dz * side, VENT.ductFloor + 0.42, p.z + p.dx * side);
      card.rotation.y = Math.atan2(p.dz, -p.dx) + Math.PI; // facing into the duct
      card.material = pbr(scene, { map: toTexture(scene, wesCardTexture(WES_CARD.text), { mirror: true }), roughness: 0.9 });
    }
  }

  let tearing = [];
  return {
    vents,
    // The alien tears a cover off: it swings away over about half a second, and stays open.
    tear(grate) {
      const c = covers.get(grate);
      if (c && !tearing.includes(c)) tearing.push(c);
    },
    update(dt) {
      for (const c of tearing) {
        c.open = Math.min(1, c.open + dt * 2);
        const a = c.open * (Math.PI * 0.6);
        if (c.axis === 'x') c.pivot.rotation.x = -a; else c.pivot.rotation.z = a;
      }
      tearing = tearing.filter((c) => c.open < 1);
    },
  };
}
