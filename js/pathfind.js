// A* on a 4-connected grid.
// grid: { w, h, passable(x, z), cost(x, z) }
// Returns the cells to walk from start (excluded) to goal (included), [] if already there, or null if unreachable.
export function findPath(grid, sx, sz, gx, gz) {
  if (!grid.passable(gx, gz)) return null;
  if (sx === gx && sz === gz) return [];

  const W = grid.w, N = W * grid.h;
  const g = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const open = [];
  const h = (x, z) => Math.abs(x - gx) + Math.abs(z - gz);
  const start = sz * W + sx, goal = gz * W + gx;

  g[start] = 0;
  open.push({ i: start, f: h(sx, sz) });

  while (open.length) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (open[k].f < open[best].f) best = k;
    const { i } = open[best];
    open[best] = open[open.length - 1];
    open.pop();
    if (closed[i]) continue;
    if (i === goal) break;
    closed[i] = 1;

    const x = i % W, z = (i - x) / W;
    for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
      if (nx < 0 || nz < 0 || nx >= W || nz >= grid.h) continue;
      if (!grid.passable(nx, nz)) continue;
      const ni = nz * W + nx;
      if (closed[ni]) continue;
      const ng = g[i] + grid.cost(nx, nz);
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = i;
        open.push({ i: ni, f: ng + h(nx, nz) });
      }
    }
  }

  if (came[goal] < 0) return null;
  const path = [];
  for (let i = goal; i !== start; i = came[i]) path.push([i % W, Math.floor(i / W)]);
  return path.reverse();
}
