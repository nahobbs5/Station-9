// Babylon.js plant life from js/gardenplan.js: the corridor planters and the vines. Vines are stacks
// of leaf cards drawn as thin instances, one draw for the green ones and one for the dying ones.
// The plants in the planters are downloaded models (js/modelplan.js, js/babylon/models.js).
import { GARDEN } from '../gardenplan.js';
import { housingTexture } from '../textures.js';
import { vineTexture } from '../gardentextures.js';
import { pbr, toTexture, bevelBox } from './util.js';

export function buildGarden(scene, garden) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, Matrix, Vector3, Quaternion } = BABYLON;
  const cream = pbr(scene, { map: toTexture(scene, housingTexture(), { anisotropy: 4 }), roughness: 0.6, metalness: 0.3, surface: 'painted', bump: 0.4 });
  const soil = pbr(scene, { color: 0x2a2018, roughness: 1 });
  const rim = pbr(scene, { color: 0x8a8d90, roughness: 0.4, metalness: 0.8 });

  for (const pl of garden.planters) {
    const g = new BABYLON.TransformNode('planter', scene);
    g.position.set(pl.x, 0, pl.z);
    g.rotation.y = pl.yaw; // faces into the corridor; its length runs along local x
    const body = bevelBox('planter', { width: pl.len, height: pl.h - 0.06, depth: pl.depth, bevel: 0.02 }, scene);
    body.parent = g; body.position.y = (pl.h - 0.06) / 2 + 0.06; body.material = cream;
    const base = MeshBuilder.CreateBox('planter-foot', { width: pl.len - 0.1, height: 0.06, depth: pl.depth - 0.08 }, scene);
    base.parent = g; base.position.y = 0.03; base.material = rim;
    const lip = MeshBuilder.CreateBox('planter-lip', { width: pl.len + 0.02, height: 0.03, depth: pl.depth + 0.02 }, scene);
    lip.parent = g; lip.position.y = pl.h; lip.material = rim;
    const dirt = MeshBuilder.CreateBox('planter-soil', { width: pl.len - 0.06, height: 0.02, depth: pl.depth - 0.06 }, scene);
    dirt.parent = g; dirt.position.y = pl.h - 0.03; dirt.material = soil;
  }

  // Vine strands: a card per GARDEN.seg of length, hung from its top edge. On a wall it lies flat;
  // from a pipe it's two crossed cards. Each card swings a little, so a strand isn't a ruler line.
  const seg = GARDEN.seg, w = 0.3;
  const mats = [false, true].map((dry) => pbr(scene, { map: toTexture(scene, vineTexture(dry), { anisotropy: 4 }), roughness: 0.75, cutout: true, twoSided: true }));
  const lists = [[], []];
  let n = 0;
  for (const v of garden.vines) {
    const list = lists[v.dry ? 1 : 0];
    const length = v.top - v.bottom;
    const count = Math.max(1, Math.ceil(length / seg - 0.01));
    for (let i = 0; i < count; i++) {
      n++;
      const y = v.top - i * seg;
      const sy = Math.min(1, (length - i * seg) / seg);
      const sway = Math.sin(n * 1.7) * (v.mode === 'wall' ? 0.07 : 0.03);
      const sx = v.mode === 'wall' ? 0.85 + 0.5 * (0.5 + 0.5 * Math.sin(n * 3.1)) : 1; // wall ivy spreads unevenly
      const turns = v.mode === 'wall' ? [0] : [0, Math.PI / 2];
      for (const t of turns) {
        const yaw = v.yaw + t;
        // Side to side along the wall (or round the strand), a touch of roll.
        const ox = Math.cos(yaw) * sway, oz = -Math.sin(yaw) * sway;
        list.push(Matrix.Compose(new Vector3(sx, sy, 1), Quaternion.RotationYawPitchRoll(yaw, 0, Math.sin(n * 2.3) * 0.1), new Vector3(v.x + ox, y, v.z + oz)));
      }
    }
  }
  lists.forEach((list, i) => {
    if (!list.length) return;
    const card = MeshBuilder.CreatePlane('vine', { width: w, height: seg }, scene);
    card.bakeTransformIntoVertices(Matrix.Translation(0, -seg / 2, 0)); // hang from the top edge
    card.material = mats[i];
    const buf = new Float32Array(list.length * 16);
    list.forEach((m, k) => m.copyToArray(buf, k * 16));
    card.thinInstanceSetBuffer('matrix', buf, 16, true);
    card.thinInstanceRefreshBoundingInfo(false);
    card.metadata = { decal: true }; // no shadows from a whole station's worth of cards
  });
}
