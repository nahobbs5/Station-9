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
    const keep = (mesh, variant) => {
      for (let n = mesh; n; n = n.parent) {
        if (variant ? n.name.endsWith('_' + variant) : !def.node || n.name === def.node) return true;
      }
      return false;
    };
    // Dying plants: the same textures, browned and dulled (copies of glTF materials are safe;
    // it's canvas textures that don't survive a clone).
    let wilted = null;
    const wiltMat = (m) => {
      wilted ??= new Map();
      if (!wilted.has(m)) {
        const w = m.clone(m.name + '-wilted');
        w.albedoColor = new BABYLON.Color3(0.9, 0.62, 0.3);
        if ('roughness' in w) w.roughness = Math.min(1, (w.roughness ?? 1) * 1.2);
        wilted.set(m, w);
      }
      return wilted.get(m);
    };
    const meshes = [];
    for (const p of list) {
      const holder = new BABYLON.TransformNode('model-' + key, scene);
      holder.position.set(p.x, p.y, p.z);
      holder.rotation.set(0, p.yaw ?? 0, p.roll ?? 0);
      const s = p.scale ?? 1, wilt = p.wilt ?? 0;
      // A wilting plant slumps: shorter, wider, leaning a little.
      holder.scaling.set(s * (1 + wilt * 0.12), s * (1 - wilt * 0.3), s * (1 + wilt * 0.12));
      if (wilt) holder.rotation.x = 0.1 * wilt;
      const inst = container.instantiateModelsToScene((n) => n, false, { doNotInstantiate: wilt > 0 });
      for (const root of inst.rootNodes) {
        root.parent = holder;
        if (p.centre) root.position.y -= p.centre;
        // The chosen variant stands where the holder is, not off to the side as in the file.
        if (p.variant) for (const c of root.getChildren()) if (c.name.endsWith('_' + p.variant)) { c.position.x = 0; c.position.z = 0; }
        for (const m of root.getChildMeshes(false)) {
          if (!keep(m, p.variant)) { m.dispose(); continue; }
          if (wilt && m.material) m.material = wiltMat(m.material);
          if (m.getTotalVertices() > 0) meshes.push(m);
        }
      }
    }
    // They never move: skip recomputing their transforms every frame.
    for (const m of meshes) { m.computeWorldMatrix(true); m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true; }
    for (const m of container.materials) m.freeze?.();
    for (const m of wilted?.values() ?? []) { m.maxSimultaneousLights = MAX_LIGHTS; m.freeze?.(); }
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
