// Babylon.js meshes for the Hat Man and thrown noise-makers. Their behaviour is shared
// (HatMan in js/hatman.js, Throwables in js/interact.js); these are just the visible parts.
import { basic, linear, hsl, toTexture, compose, instances, TUNING, pbr } from './util.js';
import { noisemakerShell } from '../textures.js';
import { HATMAN, hatmanSilhouette, hatmanReflection, hatmanHalo } from '../hatman.js';

export const HATMAN_BACKLIGHT = 10;

// The Hat Man: a flat black silhouette that always turns to face you (you can't tell at 6 m and
// more), hovering 0.35 m off the floor and drifting slowly up and down, against a red haze with a red
// light behind him (so he reads even in an unlit corridor).
// Also his reflection cameo (a faint shape on dark glass) and the corridor-end lamps he stands against.
export function makeHatmanFigure(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, PointLight, Vector3, Mesh } = BABYLON;

  // Near-black, cut out by the silhouette's alpha (blended like the cameo; an alpha-test cut-out
  // drew the whole 1 m x 2.3 m plane as a dark box). Unlit: he reads as a hole in the corridor.
  const tex = toTexture(scene, hatmanSilhouette());
  const mat = basic(scene, 0x030303, { opacity: tex });
  mat.backFaceCulling = false;
  const plane = MeshBuilder.CreatePlane('hatman', { width: 1.0, height: HATMAN.height }, scene);
  plane.material = mat;
  plane.billboardMode = Mesh.BILLBOARDMODE_Y;
  plane.alphaIndex = 1; // drawn after his haze (alphaIndex 0), so he sits in front of it
  const baseY = HATMAN.hover + HATMAN.height / 2;
  plane.position.y = baseY;
  plane.setEnabled(false);

  // Kept at zero intensity when off: adding or removing lights recompiles shaders.
  const backlight = new PointLight('hatman-light', new Vector3(0, -10, 0), scene);
  backlight.diffuse = linear(0xff2010);
  backlight.specular = backlight.diffuse;
  backlight.range = 9;
  backlight.intensity = 0;

  // The red haze behind him: solid red, faded by the canvas's alpha, added on top (like the light
  // cones; alpha below 1 so it's blended, not drawn opaque). Drawn before him, so he's black against it.
  const HALO_ALPHA = 0.95;
  const haloTex = toTexture(scene, hatmanHalo());
  const haloMat = basic(scene, 0xff3a1e, { opacity: haloTex, additive: true, alpha: HALO_ALPHA });
  haloMat.backFaceCulling = false;
  haloMat.fogEnabled = false; // the scene's black fog would swallow it at 20 m and more
  const halo = MeshBuilder.CreatePlane('hatman-halo', { width: 2.4, height: 3.2 }, scene);
  halo.material = haloMat;
  halo.billboardMode = Mesh.BILLBOARDMODE_Y;
  halo.isPickable = false;
  halo.alphaIndex = 0;
  halo.setEnabled(false);

  // The cameo: one faint pale shape, moved onto whichever dark screen or window it's in.
  const refTex = toTexture(scene, hatmanReflection());
  refTex.hasAlpha = true;
  const refMat = basic(scene, 0xbfd0cc, { opacity: refTex, alpha: 0.11, zOffset: -4 });
  const cameo = MeshBuilder.CreatePlane('hatman-cameo', { size: 1 }, scene);
  cameo.material = refMat;
  cameo.setEnabled(false);

  let lampMat = null, lampColor = null; // the corridor-end lamps, once added

  return {
    position: plane.position,
    place(x, z, lightX, lightZ) {
      plane.position.set(x, baseY, z);
      backlight.position.set(lightX, 1.6, lightZ);
      // The haze a little behind him, away from you.
      const dx = lightX - x, dz = lightZ - z, d = Math.hypot(dx, dz) || 1;
      halo.position.set(x + (dx / d) * 0.15, baseY + 0.1, z + (dz / d) * 0.15);
      plane.setEnabled(true);
      halo.setEnabled(true);
      haloMat.alpha = HALO_ALPHA;
      backlight.intensity = HATMAN_BACKLIGHT * TUNING.light;
    },
    // Rises and falls a few centimetres over about five seconds, as if held in the air.
    update(time) { plane.position.y = baseY + HATMAN.drift * Math.sin((time * 2 * Math.PI) / HATMAN.driftPeriod); },
    setBacklight(k) { backlight.intensity = HATMAN_BACKLIGHT * k * TUNING.light; },
    setAlpha(k) { mat.alpha = k; haloMat.alpha = HALO_ALPHA * k; backlight.intensity = HATMAN_BACKLIGHT * k * TUNING.light; },
    hide() { plane.setEnabled(false); halo.setEnabled(false); backlight.intensity = 0; mat.alpha = 1; },
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
      strip.material = lampMat = basic(scene, 0xffc890);
      lampColor = lampMat.emissiveColor.clone();
      instances(strip, lamps.map((l) => compose([l.x, 1.35, l.z], [0, l.rotY, 0], [1, 1, 1])));
      return strip;
    },
    // They dip with the room lights when he appears (k = 1 is full brightness).
    setLamps(k) { if (lampMat) lampColor.scaleToRef(k, lampMat.emissiveColor); },
  };
}

// Noise-makers (Alien Noise Makers sheet), for pickups and thrown ones alike, about 0.2 m across
// and lit only by their own glow. Each: { root, position, glow(l), spin(d), remove() }.
// echo: a holed green-purple husk with orange light inside. shard: a blue-violet crystal in a
// bronze cage. buzz: a holed husk glowing purple, trailing glowing tendrils.
export function noisemakerMaker(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder } = BABYLON;
  // Each one gets its own material (so it can glow on its own), sharing one pair of canvas
  // textures per kind. (Cloning a material would clone its canvas textures blank.)
  const shellTex = {};
  const shell = (type) => {
    if (!shellTex[type]) {
      const t = noisemakerShell(type);
      shellTex[type] = { husk: toTexture(scene, t.husk, { anisotropy: 4 }), glow: toTexture(scene, t.glow) };
    }
    const m = pbr(scene, { map: shellTex[type].husk, roughness: 0.55, metalness: 0.2 });
    m.emissiveTexture = shellTex[type].glow;
    m.emissiveColor = new BABYLON.Color3(1, 1, 1);
    return m;
  };
  const bronze = pbr(scene, { color: 0x8a6a3a, roughness: 0.4, metalness: 0.9 });
  return (type) => {
    const root = new BABYLON.TransformNode('noisemaker-' + type, scene);
    const spinner = new BABYLON.TransformNode('nm-spin', scene);
    spinner.parent = root;
    const parts = [], mats = [];
    const part = (m) => { m.parent = spinner; m.isPickable = false; parts.push(m); return m; };
    let glowMat, base;
    if (type === 'shard') {
      const crystal = part(MeshBuilder.CreatePolyhedron('shard', { type: 1, size: 0.07 }, scene));
      crystal.scaling.set(0.8, 2.2, 0.8);
      glowMat = basic(scene, 0x5a7bff, { alpha: 0.85 });
      crystal.material = glowMat; mats.push(glowMat);
      for (const [y, d] of [[0.07, 0.11], [-0.06, 0.12]]) {
        const band = part(MeshBuilder.CreateTorus('cage', { diameter: d, thickness: 0.012, tessellation: 12 }, scene));
        band.position.y = y; band.rotation.z = 0.3; band.material = bronze;
      }
      const rib = part(MeshBuilder.CreateCylinder('cage', { diameter: 0.012, height: 0.3, tessellation: 5 }, scene));
      rib.position.x = 0.05; rib.rotation.z = 0.15; rib.material = bronze;
      base = [0.35, 0.48, 1];
    } else {
      const husk = part(MeshBuilder.CreateSphere(type, { diameter: 0.2, segments: 10 }, scene));
      if (type === 'echo') husk.scaling.set(1, 0.9, 1.15);
      const mat = shell(type);
      husk.material = mat; mats.push(mat); glowMat = mat;
      base = type === 'echo' ? [1, 0.55, 0.2] : [0.75, 0.35, 1];
      if (type === 'buzz') {
        const tipMat = basic(scene, 0xb05cff); mats.push(tipMat);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const t = part(MeshBuilder.CreateCylinder('tendril', { diameterTop: 0.012, diameterBottom: 0.004, height: 0.16, tessellation: 5 }, scene));
          t.position.set(Math.cos(a) * 0.06, -0.12, Math.sin(a) * 0.06);
          t.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
          t.material = bronze;
          const tip = part(MeshBuilder.CreateSphere('tip', { diameter: 0.022, segments: 4 }, scene));
          tip.position.set(Math.cos(a) * 0.09, -0.2, Math.sin(a) * 0.09);
          tip.material = tipMat;
        }
      }
    }
    const set = (l) => {
      const c = new BABYLON.Color3(base[0] * l * 2, base[1] * l * 2, base[2] * l * 2);
      glowMat.emissiveColor = c;
    };
    set(0.35);
    return {
      root,
      position: root.position,
      glow: set,
      spin(d) { spinner.rotation.z -= d / 0.1; },
      bob(t) { spinner.position.y = 0.02 * Math.sin(t * 1.6); spinner.rotation.y = t * 0.4; },
      remove() { for (const m of mats) m.dispose(); for (const p of parts) p.dispose(); spinner.dispose(); root.dispose(); },
    };
  };
}
// Thrown ones use the same meshes.
export const ballMaker = noisemakerMaker;
