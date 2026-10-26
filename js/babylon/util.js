// Small Babylon.js helpers: colours, materials and canvas textures. Babylon is loaded as a
// global (BABYLON) by babylon.html, so these modules don't import it.
const B = () => window.BABYLON;

// The station has about 18 lights (rooms, teleporter, light pool, flashlight, Hat Man, alien glow).
// Babylon materials only use 4 by default, so every lit material takes more.
export const MAX_LIGHTS = 20;
// Overall brightness. light: rooms, teleporter, flickers, glows. flash: the flashlight.
// (Matched by eye to the earlier three.js build; raise or lower to taste.)
export const TUNING = { light: 1.6, flash: 3.6 };

export const hexString = (hex) => '#' + hex.toString(16).padStart(6, '0');
// A colour as written (sRGB): for unlit materials and the UI.
export const srgb = (hex) => B().Color3.FromHexString(hexString(hex));
// The same colour converted for lighting maths (linear), for lit materials and lights.
export const linear = (hex) => srgb(hex).toLinearSpace();

// Scanned surface detail (CC0, Poly Haven; see assets/LICENSES.md). Each set gives a normal map
// (relief that catches the light) and a packed map: ambient occlusion (red), roughness (green),
// metalness (blue). The colour still comes from the game's own canvas textures.
export const SURFACES = {
  panel: 'metal_plate', rust: 'rusty_painted_metal', floor: 'metal_plate_02', painted: 'blue_metal_plate',
  pipe: 'rusty_metal_02', leather: 'brown_leather', grate: 'metal_grate_rusty', ceiling: 'concrete_floor_worn_001',
};
const surfaceTextures = new Map();
function surfaceTexture(scene, set, map, tile) {
  const k = `${set}/${map}/${tile}`;
  if (!surfaceTextures.has(k)) {
    const t = new (B().Texture)(`assets/textures/${set}/${map}.jpg`, scene);
    t.gammaSpace = false; // data, not colour
    t.uScale = tile[0]; t.vScale = tile[1];
    surfaceTextures.set(k, t);
  }
  return surfaceTextures.get(k);
}

// A lit, metal/rough material (like three's MeshStandardMaterial).
// surface: a SURFACES name for scanned relief and roughness; tile: [u, v] repeats across the mesh's UVs;
// bump: how strong the relief is; rough: false keeps this material's own roughness (just the relief).
export function pbr(scene, { color = 0xffffff, map = null, roughness = 1, metalness = 0, transparent = false, zOffset = 0, twoSided = false,
  surface = null, tile = [1, 1], bump = 1, rough = true } = {}) {
  const BABYLON = B();
  const m = new BABYLON.PBRMaterial('pbr', scene);
  m.albedoColor = linear(color);
  if (map) m.albedoTexture = map;
  m.roughness = roughness;
  m.metallic = metalness;
  m.maxSimultaneousLights = MAX_LIGHTS;
  if (transparent && map) {
    map.hasAlpha = true; m.useAlphaFromAlbedoTexture = true; m.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
    // Where it's see-through, show nothing: no shine or reflection over the clear parts (decals).
    m.useSpecularOverAlpha = false; m.useRadianceOverAlpha = false;
  }
  if (zOffset) m.zOffset = zOffset;
  if (twoSided) m.backFaceCulling = false;
  if (surface) {
    const set = SURFACES[surface] ?? surface;
    m.bumpTexture = surfaceTexture(scene, set, 'nor_gl', tile);
    m.bumpTexture.level = bump;
    if (rough) {
      // Roughness and occlusion from the scan; the material's roughness scales it.
      m.metallicTexture = surfaceTexture(scene, set, 'arm', tile);
      m.useRoughnessFromMetallicTextureGreen = true;
      m.useAmbientOcclusionFromMetallicTextureRed = true;
      m.useMetallnessFromMetallicTextureBlue = false;
      m.roughness = Math.min(1, roughness * 1.15);
    }
  }
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
// flipV: turn it upside down (Babylon's box faces need it for the canvases to stand upright).
// mirror: flip it left to right (wall-facing planes need it, so writing reads the right way round).
export function toTexture(scene, c, { anisotropy = 1, flipV = false, mirror = false } = {}) {
  const BABYLON = B();
  const t = new BABYLON.DynamicTexture('canvas', { width: c.width, height: c.height }, scene, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
  const g = t.getContext();
  g.save();
  if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(c, 0, 0);
  g.restore(); // so a later redraw starts from a clean transform
  t.update((c.flipY !== false) !== flipV);
  t.wrapU = t.wrapV = c.wrap ? BABYLON.Texture.WRAP_ADDRESSMODE : BABYLON.Texture.CLAMP_ADDRESSMODE;
  if (c.repeat) { t.uScale = c.repeat[0]; t.vScale = c.repeat[1]; }
  if (c.linear) t.gammaSpace = false;
  t.anisotropicFilteringLevel = anisotropy;
  return t;
}

// Draw a new canvas onto an existing canvas texture (for screens that change).
export function redraw(t, c, { mirror = false } = {}) {
  const g = t.getContext();
  g.save();
  g.clearRect(0, 0, c.width, c.height);
  if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
  g.drawImage(c, 0, 0);
  g.restore();
  t.update(c.flipY !== false);
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

// A box with its edges chamfered off, so the edges catch the light instead of meeting in a hard
// line. Same size, origin and face UVs as MeshBuilder.CreateBox; each face is pulled in by `bevel`
// and the gaps are filled with 45° strips along the edges and small triangles at the corners.
export function bevelBox(name, { width = 1, height = 1, depth = 1, bevel = 0.02 } = {}, scene) {
  const BABYLON = B();
  const h = [width / 2, height / 2, depth / 2];
  const b = Math.min(bevel, ...h.map((v) => v * 0.45));
  if (b < 0.004) return BABYLON.MeshBuilder.CreateBox(name, { width, height, depth }, scene);
  const tpl = BABYLON.MeshBuilder.CreateBox(name + '-tpl', { width, height, depth }, scene);
  const P = tpl.getVerticesData('position'), N = tpl.getVerticesData('normal'), U = tpl.getVerticesData('uv'), I = tpl.getIndices();
  tpl.dispose();
  const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
  const dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
  const vec = (arr, i) => [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
  // Which way round CreateBox winds its triangles, so the new faces match it.
  const wind = Math.sign(dot(cross(sub(vec(P, I[1]), vec(P, I[0])), sub(vec(P, I[2]), vec(P, I[0]))), vec(N, I[0])));
  const pos = [], nor = [], uv = [], idx = Array.from(I);
  const cornerUV = new Map(); // face axis + corner signs -> that face corner's UV
  const ck = (axis, s) => `${axis}:${s.join(',')}`;
  for (let v = 0; v < P.length / 3; v++) {
    const n = vec(N, v), p = vec(P, v);
    const axis = n.findIndex((c) => Math.abs(c) > 0.5);
    const s = p.map((c) => Math.sign(c));
    cornerUV.set(ck(axis, s), [U[v * 2], U[v * 2 + 1]]);
    for (let k = 0; k < 3; k++) if (k !== axis) p[k] = s[k] * (h[k] - b);
    pos.push(...p); nor.push(...n); uv.push(U[v * 2], U[v * 2 + 1]);
  }
  const poly = (pts, n, uvs) => {
    const base = pos.length / 3;
    pts.forEach((p, i) => { pos.push(...p); nor.push(...n); uv.push(...uvs[i]); });
    const flip = Math.sign(dot(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])), n)) !== wind;
    for (let i = 1; i < pts.length - 1; i++) idx.push(base, base + (flip ? i + 1 : i), base + (flip ? i : i + 1));
  };
  const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  // Where face `axis` meets the edge or corner with signs `s`.
  const facePoint = (axis, s) => s.map((sk, k) => sk * (k === axis ? h[k] : h[k] - b));
  // Edge strips: between faces a and c, running along the third axis m.
  for (const [a, c, m] of [[0, 1, 2], [0, 2, 1], [1, 2, 0]]) {
    for (const sa of [-1, 1]) for (const sc of [-1, 1]) {
      const s = (sm) => { const r = [0, 0, 0]; r[a] = sa; r[c] = sc; r[m] = sm; return r; };
      const n = [0, 0, 0]; n[a] = sa; n[c] = sc;
      poly([facePoint(a, s(-1)), facePoint(a, s(1)), facePoint(c, s(1)), facePoint(c, s(-1))], norm(n),
        [cornerUV.get(ck(a, s(-1))), cornerUV.get(ck(a, s(1))), cornerUV.get(ck(c, s(1))), cornerUV.get(ck(c, s(-1)))]);
    }
  }
  // Corner triangles.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const s = [sx, sy, sz];
    poly([0, 1, 2].map((k) => facePoint(k, s)), norm(s), [0, 1, 2].map((k) => cornerUV.get(ck(k, s))));
  }
  const mesh = new BABYLON.Mesh(name, scene);
  Object.assign(new BABYLON.VertexData(), { positions: pos, normals: nor, uvs: uv, indices: idx }).applyToMesh(mesh);
  return mesh;
}
