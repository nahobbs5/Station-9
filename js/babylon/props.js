// Babylon.js meshes for the Hat Man and thrown noise-makers. Their behaviour is shared
// (HatMan in js/hatman.js, Throwables in js/interact.js); these are just the visible parts.
import { basic, linear, hsl, toTexture, compose, instances, TUNING } from './util.js';
import { HATMAN, hatmanSilhouette, hatmanReflection } from '../hatman.js';

export const HATMAN_BACKLIGHT = 7;

// The Hat Man: a flat black silhouette that always turns to face you (you can't tell at 6 m and
// more), hovering 0.35 m off the floor and drifting slowly up and down, with a red light behind him.
// Also his reflection cameo (a faint shape on dark glass) and the corridor-end lamps he stands against.
export function makeHatmanFigure(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, PointLight, Vector3, Mesh } = BABYLON;

  const tex = toTexture(scene, hatmanSilhouette());
  tex.hasAlpha = true;
  const mat = basic(scene, 0, { map: tex }); // unlit: he reads as a hole in the corridor
  // A solid cut-out (alpha test, not blending), so he blocks what's behind him and writes depth.
  // Lighting is off and the diffuse colour is black, so the diffuse map only supplies the cut-out.
  mat.diffuseTexture = tex;
  mat.transparencyMode = BABYLON.Material.MATERIAL_ALPHATEST;
  mat.alphaCutOff = 0.5;
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane('hatman', { width: 1.0, height: HATMAN.height }, scene);
  plane.material = mat;
  plane.billboardMode = Mesh.BILLBOARDMODE_Y;
  const baseY = HATMAN.hover + HATMAN.height / 2;
  plane.position.y = baseY;
  plane.setEnabled(false);

  // Kept at zero intensity when off: adding or removing lights recompiles shaders.
  const backlight = new PointLight('hatman-light', new Vector3(0, -10, 0), scene);
  backlight.diffuse = linear(0xff2010);
  backlight.specular = backlight.diffuse;
  backlight.range = 7;
  backlight.intensity = 0;

  // The cameo: one faint pale shape, moved onto whichever dark screen or window it's in.
  const refTex = toTexture(scene, hatmanReflection());
  refTex.hasAlpha = true;
  const refMat = basic(scene, 0xbfd0cc, { opacity: refTex, alpha: 0.11, zOffset: -4 });
  const cameo = MeshBuilder.CreatePlane('hatman-cameo', { size: 1 }, scene);
  cameo.material = refMat;
  cameo.setEnabled(false);

  return {
    position: plane.position,
    place(x, z, lightX, lightZ) {
      plane.position.set(x, baseY, z);
      backlight.position.set(lightX, 1.6, lightZ);
      plane.setEnabled(true);
    },
    // Rises and falls a few centimetres over about five seconds, as if held in the air.
    update(time) { plane.position.y = baseY + HATMAN.drift * Math.sin((time * 2 * Math.PI) / HATMAN.driftPeriod); },
    setBacklight(k) { backlight.intensity = HATMAN_BACKLIGHT * k * TUNING.light; },
    setAlpha(k) { mat.alpha = k; backlight.intensity = HATMAN_BACKLIGHT * k * TUNING.light; },
    hide() { plane.setEnabled(false); backlight.intensity = 0; mat.alpha = 1; },
    // Just in front of the glass, a little to one side (as if over your shoulder), most of its height.
    showCameo(s) {
      const fx = Math.sin(s.rotY), fz = Math.cos(s.rotY);
      const side = 0.22 * s.w;
      cameo.position.set(s.x + fx * 0.006 + fz * side, s.y, s.z + fz * 0.006 - fx * side);
      cameo.rotation.y = s.rotY + Math.PI; // Babylon planes face -Z
      const size = s.h * 0.75;
      cameo.scaling.set(size, size, 1);
      cameo.setEnabled(true);
    },
    hideCameo() { cameo.setEnabled(false); },
    // Thin warm strips either side of each doorway, unlit (they cost no lights, and they bloom).
    addLamps(lamps) {
      const strip = MeshBuilder.CreateBox('end-lamp', { width: 0.05, height: 1.1, depth: 0.03 }, scene);
      strip.material = basic(scene, 0xffc890);
      instances(strip, lamps.map((l) => compose([l.x, 1.35, l.z], [0, l.rotY, 0], [1, 1, 1])));
      return strip;
    },
  };
}

// A thrown noise-maker: orange while flying, pulsing once it lands.
export function ballMaker(scene) {
  const BABYLON = window.BABYLON;
  return () => {
    const mesh = BABYLON.MeshBuilder.CreateSphere('ball', { diameter: 0.18, segments: 6 }, scene);
    mesh.material = basic(scene, 0xff6a33);
    return {
      position: mesh.position,
      glow(l) { mesh.material.emissiveColor = hsl(0.04, 1, l); },
      remove() { mesh.material.dispose(); mesh.dispose(); },
    };
  };
}
