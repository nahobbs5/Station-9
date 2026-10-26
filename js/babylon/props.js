// Babylon.js meshes for the Hat Man figure and thrown noise-makers. Their behaviour is shared
// (HatMan in js/tricks.js, Throwables in js/interact.js); these are just the visible parts.
import { basic, linear, hsl, TUNING } from './util.js';

export const HATMAN_BACKLIGHT = 7;

// A black silhouette with a hat, and a red light behind it.
export function makeHatmanFigure(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, PointLight, Vector3 } = BABYLON;
  const black = basic(scene, 0x000000);
  const g = new TransformNode('hatman', scene);
  const part = (mesh, y, scale) => { mesh.parent = g; mesh.position.y = y; mesh.material = black; if (scale) mesh.scaling.set(...scale); return mesh; };
  part(MeshBuilder.CreateCylinder('coat', { diameterTop: 0.36, diameterBottom: 0.84, height: 1.55, tessellation: 10 }, scene), 0.78);
  part(MeshBuilder.CreateSphere('shoulders', { diameter: 0.52, segments: 6 }, scene), 1.55, [1.3, 0.6, 0.8]);
  part(MeshBuilder.CreateSphere('head', { diameter: 0.28, segments: 6 }, scene), 1.78);
  part(MeshBuilder.CreateCylinder('brim', { diameter: 0.68, height: 0.03, tessellation: 16 }, scene), 1.9);
  part(MeshBuilder.CreateCylinder('crown', { diameterTop: 0.3, diameterBottom: 0.34, height: 0.22, tessellation: 12 }, scene), 2.02);
  const eyeMat = basic(scene, 0xffd9c0);
  for (const s of [-0.05, 0.05]) {
    const eye = MeshBuilder.CreateSphere('eye', { diameter: 0.024, segments: 3 }, scene);
    eye.parent = g;
    eye.position.set(s, 1.8, 0.13);
    eye.material = eyeMat;
  }
  // Kept at zero intensity when off: adding or removing lights recompiles shaders.
  const backlight = new PointLight('hatman-light', new Vector3(0, -10, 0), scene);
  backlight.diffuse = linear(0xff2010);
  backlight.specular = backlight.diffuse;
  backlight.range = 7;
  backlight.intensity = 0;
  g.setEnabled(false);
  return {
    position: g.position,
    place(x, z, faceYaw, lightX, lightZ) {
      g.position.set(x, 0, z);
      g.rotation.y = faceYaw;
      backlight.position.set(lightX, 1.6, lightZ);
      g.setEnabled(true);
    },
    setBacklight(k) { backlight.intensity = HATMAN_BACKLIGHT * k * TUNING.light; },
    hide() { g.setEnabled(false); backlight.intensity = 0; },
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
