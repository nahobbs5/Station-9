// The station's walls, traced from the walkable shape (js/shape.js) with marching squares.
// Gives smooth outlines that follow angled corners and curved corridors. No engine here:
// the renderer extrudes them into wall meshes, and the decor places patches along them.

// Outline polylines ([[x, z], ...], closed loops) where the distance field crosses zero.
export function wallOutlines(shape) {
  const { field, nx, nz, res } = shape;
  const v = (i, j) => field[j * nx + i];
  // Crossing points sit on grid edges; each edge has one id, so neighbouring squares agree exactly.
  const pointOf = new Map();
  const edgePoint = (id) => {
    if (pointOf.has(id)) return id;
    const [kind, i, j] = id.split(':').map((s, k) => (k ? +s : s));
    let a, b, x, z;
    if (kind === 'h') { a = v(i, j); b = v(i + 1, j); const t = a / (a - b); x = (i + t) * res; z = j * res; }
    else { a = v(i, j); b = v(i, j + 1); const t = a / (a - b); x = i * res; z = (j + t) * res; }
    pointOf.set(id, [x, z]);
    return id;
  };
  const links = new Map(); // edge id -> linked edge ids
  const link = (a, b) => {
    edgePoint(a); edgePoint(b);
    if (!links.has(a)) links.set(a, []);
    if (!links.has(b)) links.set(b, []);
    links.get(a).push(b); links.get(b).push(a);
  };
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const c = (v(i, j) > 0 ? 1 : 0) | (v(i + 1, j) > 0 ? 2 : 0) | (v(i + 1, j + 1) > 0 ? 4 : 0) | (v(i, j + 1) > 0 ? 8 : 0);
      if (c === 0 || c === 15) continue;
      const e0 = `h:${i}:${j}`, e1 = `v:${i + 1}:${j}`, e2 = `h:${i}:${j + 1}`, e3 = `v:${i}:${j}`;
      const centre = (v(i, j) + v(i + 1, j) + v(i + 1, j + 1) + v(i, j + 1)) / 4 > 0;
      switch (c) {
        case 1: case 14: link(e3, e0); break;
        case 2: case 13: link(e0, e1); break;
        case 3: case 12: link(e3, e1); break;
        case 4: case 11: link(e1, e2); break;
        case 6: case 9: link(e0, e2); break;
        case 7: case 8: link(e3, e2); break;
        case 5: if (centre) { link(e0, e1); link(e2, e3); } else { link(e3, e0); link(e1, e2); } break;
        case 10: if (centre) { link(e3, e0); link(e1, e2); } else { link(e0, e1); link(e2, e3); } break;
      }
    }
  }
  // Walk the links into loops.
  const used = new Set();
  const loops = [];
  for (const start of links.keys()) {
    if (used.has(start)) continue;
    const ids = [start];
    used.add(start);
    let prev = null, cur = start;
    for (;;) {
      const next = links.get(cur).find((n) => n !== prev && !used.has(n));
      if (!next) break;
      used.add(next);
      ids.push(next);
      prev = cur; cur = next;
    }
    loops.push(simplify(ids.map((id) => pointOf.get(id)), 0.03));
  }
  return loops;
}

// Douglas-Peucker: drop points that stay within `tol` of a straight line.
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, az] = pts[a], [bx, bz] = pts[b];
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz) || 1e-9;
    let worst = -1, wi = -1;
    for (let k = a + 1; k < b; k++) {
      const d = Math.abs((pts[k][0] - ax) * dz - (pts[k][1] - az) * dx) / len;
      if (d > worst) { worst = d; wi = k; }
    }
    if (worst > tol) { keep[wi] = 1; stack.push([a, wi], [wi, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}

// Every wall segment with its outward-facing normal (pointing into walkable space) and length.
export function wallSegments(shape) {
  const segs = [];
  wallOutlines(shape).forEach((loop, li) => {
    const n = loop.length;
    for (let k = 0; k < n; k++) {
      const [ax, az] = loop[k], [bx, bz] = loop[(k + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 1e-4) continue;
      let nx = -(bz - az) / len, nz = (bx - ax) / len;
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (shape.distance(mx + nx * 0.15, mz + nz * 0.15) < shape.distance(mx - nx * 0.15, mz - nz * 0.15)) { nx = -nx; nz = -nz; }
      segs.push({ ax, az, bx, bz, nx, nz, len, loop: li });
    }
  });
  return segs;
}
