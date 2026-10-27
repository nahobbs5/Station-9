// Babylon.js meshes for the field-guide apparitions (behaviour in js/apparitions.js). Each is one
// flat, unlit plane cut from the guide's art (assets/apparitions/<id>.png), turned to face you
// (or flat on its glass, for the twisted reflection), with a glitch that jitters and drops it out.
import { basic, toTexture, linear } from './util.js';
import { makeCanvas } from '../textures.js';
import { KINDS, KIND_IDS } from '../apparitions.js';

export function makeApparitionFigure(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, Mesh, Texture } = BABYLON;
  const parts = {};
  for (const id of KIND_IDS) {
    const k = KINDS[id];
    const tex = new Texture(`assets/apparitions/${id}.png`, scene, false, true, Texture.TRILINEAR_SAMPLINGMODE);
    tex.hasAlpha = true;
    tex.wrapU = tex.wrapV = Texture.CLAMP_ADDRESSMODE;
    let mat;
    if (k.tint === 'art') {
      // The art's own colours, a touch brighter, see-through where the cut-out fades.
      mat = basic(scene, 0, { map: tex, opacity: tex });
      tex.level = k.level ?? 1.5;
      mat.fogEnabled = false; // the black fog would hide the far ones (the child at 20 m)
    } else if (k.tint === 'pale') {
      mat = basic(scene, 0xbfd0cc, { opacity: tex, zOffset: -4 });
    } else {
      mat = basic(scene, 0x020202, { opacity: tex });
    }
    mat.backFaceCulling = false; // mirrored when the child turns
    const plane = MeshBuilder.CreatePlane('apparition-' + id, { width: 1, height: 1 }, scene);
    plane.material = mat;
    plane.isPickable = false;
    plane.setEnabled(false);
    parts[id] = { plane, mat, tex, base: mat.alpha };
  }

  // The haze a dark one stands against (like the Hat Man's), so it reads as a shape in an unlit
  // corridor: a soft white glow, tinted per kind, added on top and drawn first.
  const glowTex = toTexture(scene, makeCanvas(128, 160, (g, w, h) => {
    const grad = g.createRadialGradient(w / 2, h * 0.5, 0, w / 2, h * 0.5, w * 0.5);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.4)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
  }));
  const glowMat = basic(scene, 0xffffff, { opacity: glowTex, additive: true, alpha: 0.7 });
  glowMat.backFaceCulling = false;
  glowMat.fogEnabled = false;
  const glow = MeshBuilder.CreatePlane('apparition-glow', { width: 1, height: 1 }, scene);
  glow.material = glowMat;
  glow.billboardMode = Mesh.BILLBOARDMODE_Y;
  glow.isPickable = false;
  glow.alphaIndex = 0;
  for (const id of KIND_IDS) parts[id].plane.alphaIndex = 1;
  glow.setEnabled(false);

  let cur = null, curKind = null;
  const position = { x: 0, y: 0, z: 0 };
  return {
    position,
    show(id) {
      if (cur) cur.plane.setEnabled(false);
      cur = parts[id];
      curKind = KINDS[id];
      cur.plane.setEnabled(true);
      glow.setEnabled(!!curKind.glow);
      if (curKind.glow) glowMat.emissiveColor = linear(curKind.glow);
    },
    // p: { x, y (bottom), z, w, h, alpha, jitter (0-1 glitch), flipX, rotY (null: face the camera) }
    pose(p) {
      if (!cur) return;
      const { plane, mat, tex } = cur;
      const j = p.jitter ?? 0, r = Math.random;
      // Glitch: the picture slips sideways, stretches, or drops out for a frame.
      const slip = r() < j * 0.5;
      tex.uOffset = slip ? (r() - 0.5) * 0.08 * j : 0;
      const stretch = slip ? 1 + (r() - 0.5) * 0.25 * j : 1;
      const drop = r() < j * 0.12;
      mat.alpha = Math.max(0, Math.min(1, (p.alpha ?? 1) * (drop ? 0.1 : 1)));
      plane.scaling.set(p.w * stretch * (p.flipX ? -1 : 1), p.h, 1);
      if (p.rotY == null) {
        plane.billboardMode = Mesh.BILLBOARDMODE_Y;
        plane.position.set(p.x, p.y + p.h / 2, p.z);
      } else {
        // Flat on glass that faces rotY, just in front of it (Babylon planes face -Z).
        plane.billboardMode = Mesh.BILLBOARDMODE_NONE;
        plane.rotation.y = p.rotY + Math.PI;
        plane.position.set(p.x + Math.sin(p.rotY) * 0.008, p.y + p.h / 2, p.z + Math.cos(p.rotY) * 0.008);
      }
      if (curKind.glow) {
        // Just behind it, away from the camera.
        const cam = scene.activeCamera.position;
        const dx = p.x - cam.x, dz = p.z - cam.z, d = Math.hypot(dx, dz) || 1;
        glow.position.set(p.x + (dx / d) * 0.3, plane.position.y, p.z + (dz / d) * 0.3);
        glow.scaling.set(p.h * 1.3, p.h * 1.4, 1);
        glowMat.alpha = 0.7 * Math.min(1, p.alpha ?? 1);
      }
      position.x = p.x; position.y = p.y; position.z = p.z;
    },
    hide() {
      if (cur) cur.plane.setEnabled(false);
      glow.setEnabled(false);
      cur = null; curKind = null;
    },
  };
}
