// Loads the downloaded glTF models (js/modelplan.js says which and where) and places copies of
// them. Loading happens in the background: the game starts with the code-built stand-ins, and
// each one is swapped out once its model arrives. A model that fails to load just leaves its
// stand-in (or nothing) in place.
import { MODELS, modelUrl } from '../modelplan.js';
import { MAX_LIGHTS } from './util.js';

// onMeshes(meshes, key): called with each model's placed meshes (for shadows and the like).
export function loadModels(scene, placements, { onMeshes = () => {} } = {}) {
  const BABYLON = window.BABYLON;
  const byModel = new Map();
  for (const p of placements) {
    if (!byModel.has(p.model)) byModel.set(p.model, []);
    byModel.get(p.model).push(p);
  }
  const load = (url) => (BABYLON.LoadAssetContainerAsync
    ? BABYLON.LoadAssetContainerAsync(url, scene)
    : BABYLON.SceneLoader.LoadAssetContainerAsync('', url, scene));
  const jobs = [...byModel].map(async ([key, list]) => {
    const def = MODELS[key];
    const container = await load(modelUrl(key));
    for (const m of container.materials) {
      m.maxSimultaneousLights = MAX_LIGHTS; // glTF materials default to 4, too few for the station's lights
      if (def.dead) { m.emissiveTexture = null; m.emissiveColor = BABYLON.Color3.Black(); } // a lamp that's long gone out
    }
    const keep = (mesh) => {
      if (!def.node) return true;
      for (let n = mesh; n; n = n.parent) if (n.name === def.node) return true;
      return false;
    };
    const meshes = [];
    for (const p of list) {
      const holder = new BABYLON.TransformNode('model-' + key, scene);
      holder.position.set(p.x, p.y, p.z);
      holder.rotation.set(0, p.yaw ?? 0, p.roll ?? 0);
      const inst = container.instantiateModelsToScene((n) => n, false);
      for (const root of inst.rootNodes) {
        root.parent = holder;
        if (p.centre) root.position.y -= p.centre;
        for (const m of root.getChildMeshes(false)) {
          if (!keep(m)) { m.dispose(); continue; }
          if (m.getTotalVertices() > 0) meshes.push(m);
        }
      }
    }
    // They never move: skip recomputing their transforms every frame.
    for (const m of meshes) { m.computeWorldMatrix(true); m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true; }
    for (const m of container.materials) m.freeze?.();
    // Retire the stand-ins this model replaces.
    const replaced = new Set(list.map((p) => p.replaces).filter(Boolean));
    for (const m of scene.meshes) if (replaced.has(m.metadata?.standIn)) m.setEnabled(false);
    onMeshes(meshes, key);
    return meshes.length;
  });
  return Promise.allSettled(jobs).then((results) => {
    results.forEach((r, i) => { if (r.status === 'rejected') console.warn(`model ${[...byModel.keys()][i]} failed to load:`, r.reason?.message ?? r.reason); });
    return results;
  });
}
