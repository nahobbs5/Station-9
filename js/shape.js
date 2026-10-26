// The station's walkable space as a smooth shape rather than square cells, so rooms can have
// angled corners and corridors can curve. Rooms are polygons (rectangles, or octagons with their
// corners cut off), corridors are centrelines with a half-width. Everything is combined into a
// signed-distance field: positive = walkable (how far to the nearest wall), negative = inside a wall.
// No engine here; layout.js, walls.js, decor and the maps all read it.

export const RES = 0.25; // metres between distance-field samples

// A room's outline in metres. chamfer (metres) cuts each corner diagonally, making an octagon.
export function roomPolygon(r, tile) {
  const x0 = r.x * tile, z0 = r.y * tile, x1 = (r.x + r.w) * tile, z1 = (r.y + r.h) * tile;
  const c = (r.chamfer ?? 0) * tile;
  if (!c) return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  return [[x0 + c, z0], [x1 - c, z0], [x1, z0 + c], [x1, z1 - c], [x1 - c, z1], [x0 + c, z1], [x0, z1 - c], [x0, z0 + c]];
}

function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1e-12;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return { d: Math.hypot(px - (ax + dx * t), pz - (az + dz * t)), t };
}

// Signed distance to a convex polygon: positive inside.
function polygonSDF(poly, x, z) {
  let d = Infinity, inside = true;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    d = Math.min(d, segDist(x, z, ax, az, bx, bz).d);
    // The polygons wind clockwise in screen terms (x right, z down), so inside is to the right.
    if ((bx - ax) * (z - az) - (bz - az) * (x - ax) < 0) inside = false;
  }
  return inside ? d : -d;
}

// Signed distance to a corridor band: a centreline whose points carry a half-width r.
function bandSDF(pts, x, z, bbox) {
  if (x < bbox[0] || x > bbox[2] || z < bbox[1] || z > bbox[3]) return -Infinity;
  let best = -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const { d, t } = segDist(x, z, a.x, a.z, b.x, b.z);
    const v = a.r + (b.r - a.r) * t - d;
    if (v > best) best = v;
  }
  return best;
}

// Points along a cubic curve (cell coordinates in, metres out), roughly `step` metres apart.
export function cubic(p0, p1, p2, p3, toWorld, step = 0.25) {
  const at = (t) => {
    const u = 1 - t;
    return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
  };
  // Measure it first, then sample evenly.
  let len = 0, prev = at(0);
  for (let i = 1; i <= 200; i++) { const p = at(i / 200); len += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  const n = Math.max(2, Math.ceil((len * 2) / step));
  return Array.from({ length: n + 1 }, (_, i) => at(i / n)).map(toWorld);
}

// Densely sample a corridor: straight runs between cell centres plus any curves, with a half-width
// that eases from `r0` at the ends to `r1` in the middle of curved sections.
export function sampleCorridor(def, tile, step = 0.25) {
  const toWorld = ([cx, cz]) => ({ x: cx * tile + tile / 2, z: cz * tile + tile / 2 });
  const pts = [];
  const push = (p, curve) => {
    const last = pts[pts.length - 1];
    if (last && Math.hypot(last.x - p.x, last.z - p.z) < 1e-6) return;
    pts.push({ ...p, curve });
  };
  for (const part of def.parts) {
    if (part.line) {
      for (let i = 0; i < part.line.length - 1; i++) {
        const a = toWorld(part.line[i]), b = toWorld(part.line[i + 1]);
        const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / step));
        for (let k = 0; k <= n; k++) push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n }, false);
      }
    } else if (part.curve) {
      for (const p of cubic(...part.curve, toWorld, step)) push(p, true);
    }
  }
  // Distance along the corridor, and half-width: wider through curves, easing in over `ease` metres.
  let s = 0;
  pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = s; });
  const r0 = def.width ?? 1, r1 = def.curveWidth ?? r0, ease = 3;
  const curveS = pts.filter((p) => p.curve).map((p) => p.s);
  const c0 = curveS.length ? Math.min(...curveS) : 0, c1 = curveS.length ? Math.max(...curveS) : 0;
  const smooth = (t) => t * t * (3 - 2 * t);
  for (const p of pts) {
    const inCurve = curveS.length ? Math.min(Math.max(0, (p.s - c0) / ease), Math.max(0, (c1 - p.s) / ease), 1) : 0;
    p.r = r0 + (r1 - r0) * smooth(inCurve);
  }
  // Unit direction along the corridor at each point.
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    p.tx = (b.x - a.x) / len; p.tz = (b.z - a.z) / len;
  });
  return pts;
}

// The combined distance field over the whole station, sampled every RES metres.
export function buildShape({ w, h, tile, rooms, corridors }) {
  const W = w * tile, H = h * tile;
  const nx = Math.round(W / RES) + 1, nz = Math.round(H / RES) + 1;
  const field = new Float32Array(nx * nz);
  const polys = rooms.map((r) => roomPolygon(r, tile));
  const bands = corridors.map((c) => {
    const rmax = Math.max(...c.pts.map((p) => p.r));
    const xs = c.pts.map((p) => p.x), zs = c.pts.map((p) => p.z);
    return { pts: c.pts, bbox: [Math.min(...xs) - rmax - 1, Math.min(...zs) - rmax - 1, Math.max(...xs) + rmax + 1, Math.max(...zs) + rmax + 1] };
  });
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = i * RES, z = j * RES;
      let v = -Infinity;
      for (const p of polys) v = Math.max(v, polygonSDF(p, x, z));
      for (const b of bands) v = Math.max(v, bandSDF(b.pts, x, z, b.bbox));
      field[j * nx + i] = v;
    }
  }
  // Bilinear lookup; outside the map counts as solid.
  const at = (i, j) => field[Math.min(nz - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  function distance(x, z) {
    if (x < 0 || z < 0 || x > W || z > H) return -1;
    const fx = x / RES, fz = z / RES;
    const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(nz - 2, Math.floor(fz));
    const tx = fx - i, tz = fz - j;
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * tx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * tx;
    return a + (b - a) * tz;
  }
  return { field, nx, nz, res: RES, width: W, depth: H, polys, distance };
}
