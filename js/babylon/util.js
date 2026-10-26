// Small Babylon.js helpers: colours, materials and canvas textures. Babylon is loaded as a
// global (BABYLON) by babylon.html, so these modules don't import it.
const B = () => window.BABYLON;

// The station has about 18 lights (rooms, teleporter, light pool, flashlight, Hat Man, alien glow).
// Babylon materials only use 4 by default, so every lit material takes more.
export const MAX_LIGHTS = 20;
// Babylon and three.js measure light differently; these even them out (tuned against three.js screenshots).
// light: rooms, teleporter, flickers, glows. flash: the flashlight.
export const TUNING = { light: 1.6, flash: 3.6 };

export const hexString = (hex) => '#' + hex.toString(16).padStart(6, '0');
// A colour as written (sRGB): for unlit materials and the UI.
export const srgb = (hex) => B().Color3.FromHexString(hexString(hex));
// The same colour converted for lighting maths (linear), as three.js does for lit materials and lights.
export const linear = (hex) => srgb(hex).toLinearSpace();

// A lit, metal/rough material (like three's MeshStandardMaterial).
export function pbr(scene, { color = 0xffffff, map = null, roughness = 1, metalness = 0, transparent = false, zOffset = 0, twoSided = false } = {}) {
  const BABYLON = B();
  const m = new BABYLON.PBRMaterial('pbr', scene);
  m.albedoColor = linear(color);
  if (map) m.albedoTexture = map;
  m.roughness = roughness;
  m.metallic = metalness;
  m.maxSimultaneousLights = MAX_LIGHTS;
  if (transparent && map) { map.hasAlpha = true; m.useAlphaFromAlbedoTexture = true; m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND; }
  if (zOffset) m.zOffset = zOffset;
  if (twoSided) m.backFaceCulling = false;
  return m;
}

// An unlit material (like three's MeshBasicMaterial). Still fogged and tone-mapped.
// map: show the texture's own colours. opacity: a flat `hex` colour shaped by the texture's alpha.
export function basic(scene, hex, { map = null, opacity = null, alpha = 1, additive = false, zOffset = 0 } = {}) {
  const BABYLON = B();
  const m = new BABYLON.StandardMaterial('basic', scene);
  m.disableLighting = true;
  m.diffuseColor = BABYLON.Color3.Black();
  m.specularColor = BABYLON.Color3.Black();
  // Babylon adds an emissive texture to the emissive colour, so a textured one starts from black.
  m.emissiveColor = map ? BABYLON.Color3.Black() : srgb(hex);
  if (map) m.emissiveTexture = map;
  if (opacity) { opacity.hasAlpha = true; m.opacityTexture = opacity; }
  m.alpha = alpha;
  if (additive) m.alphaMode = BABYLON.Engine.ALPHA_ADD;
  if (zOffset) m.zOffset = zOffset;
  return m;
}

// A shared canvas recipe (js/textures.js) as a Babylon texture. Hints on the canvas:
// wrap / repeat (tiling), flipY === false (don't flip), linear (data rather than colour).
// flipV: turn it upside down (Babylon's box faces map textures the other way up from three.js).
// mirror: flip it left to right (wall-facing planes need it, so writing reads the right way round).
export function toTexture(scene, c, { anisotropy = 1, flipV = false, mirror = false } = {}) {
  const BABYLON = B();
  const t = new BABYLON.DynamicTexture('canvas', { width: c.width, height: c.height }, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  const g = t.getContext();
  if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(c, 0, 0);
  t.update((c.flipY !== false) !== flipV);
  t.wrapU = t.wrapV = c.wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
  if (c.repeat) { t.uScale = c.repeat[0]; t.vScale = c.repeat[1]; }
  if (c.linear) t.gammaSpace = false;
  t.anisotropicFilteringLevel = anisotropy;
  return t;
}

// Position + rotation (quaternion [x, y, z, w] or Euler in Y-X-Z order) + scale, as a Babylon matrix.
export function compose(p, q, s) {
  const BABYLON = B();
  const quat = q.length === 4 ? new BABYLON.Quaternion(q[0], q[1], q[2], q[3]) : BABYLON.Quaternion.RotationYawPitchRoll(q[1], q[0], q[2]);
  return BABYLON.Matrix.Compose(new BABYLON.Vector3(s[0], s[1], s[2]), quat, new BABYLON.Vector3(p[0], p[1], p[2]));
}

// Turn `mesh` into a set of thin instances, one per matrix. Cheap: one draw call for all of them.
export function instances(mesh, matrices) {
  const buf = new Float32Array(matrices.length * 16);
  matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
  mesh.thinInstanceSetBuffer('matrix', buf, 16);
  mesh.thinInstanceRefreshBoundingInfo(false);
  return mesh;
}

// Rotation (x, y, z, w) taking +Y onto the direction a -> b, and the distance between them.
export function segment(a, b) {
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const len = Math.hypot(...d) || 1e-3;
  const [dx, dy, dz] = d.map((v) => v / len);
  const r = dy + 1;
  let q = r < 1e-6 ? [1, 0, 0, 0] : [dz, 0, -dx, r];
  const ql = Math.hypot(...q);
  q = q.map((v) => v / ql);
  return { q, len, mid: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2] };
}

// HSL (0..1 each) to a Babylon colour.
export function hsl(h, s, l) {
  const k = (n) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return new (B().Color3)(f(0), f(8), f(4));
}
