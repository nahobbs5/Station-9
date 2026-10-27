// Babylon.js renderer for the alien (Alien Behavior Guide), built from the shared rig and poses in
// js/alienshape.js. Limb segments are instances of a few base meshes, to keep draw calls down.
// One glow material (eyes, core, tentacle tips) takes the state's colour, and so does its one light.
import { ALIEN, alienRig, lump, poseAlien } from '../alienshape.js';
import { pbr, basic, linear, TUNING } from './util.js';

export function makeAlienView(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, PointLight, Vector3, Quaternion, Color3 } = BABYLON;
  const rig = alienRig();
  const node = (name, parent) => { const n = new TransformNode(name, scene); n.parent = parent; return n; };
  const group = new TransformNode('alien', scene);
  const inner = node('alien-inner', group); // leans forward as it gets intent
  const headHolder = node('alien-head-holder', inner);
  const skin = pbr(scene, { color: ALIEN.skin.color, roughness: ALIEN.skin.roughness, metalness: ALIEN.skin.metalness });
  // A faint purple sheen on the chitin, as on the guide.
  if (skin.sheen) { skin.sheen.isEnabled = true; skin.sheen.color = new Color3(0.22, 0.16, 0.4); skin.sheen.intensity = 0.12; }
  const glowMat = basic(scene, 0x7a6cff);

  // The head: a long, ridged sphere, face forward (+z).
  const head = MeshBuilder.CreateSphere('alien-head', { diameter: ALIEN.headRadius * 2, segments: 20, updatable: true }, scene);
  const positions = head.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    const len = Math.hypot(x, y, z) || 1;
    const k = lump(x / len, y / len, z / len);
    positions[i] = x * k; positions[i + 1] = y * k; positions[i + 2] = z * k;
  }
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, head.getIndices(), normals);
  head.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
  head.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
  head.material = skin;
  head.parent = headHolder;
  head.scaling.set(...ALIEN.headScale);
  // Eyes and crown sit on the head's surface: rig positions are on the unit head, so scale them
  // here rather than parenting them to the stretched mesh (which would stretch them too).
  const onHead = (pos) => pos.map((v, i) => v * ALIEN.headScale[i]);
  for (const e of rig.eyes) {
    const eye = MeshBuilder.CreateSphere('alien-eye', { diameter: e.r * 2, segments: 6 }, scene);
    eye.material = glowMat; eye.parent = headHolder; eye.position.set(...onHead(e.pos));
  }
  // The glowing core on its underside.
  const core = MeshBuilder.CreateSphere('alien-core', { diameter: 0.16, segments: 8 }, scene);
  core.material = glowMat; core.parent = headHolder; core.position.set(0, -0.36, 0.05); core.scaling.set(1, 0.5, 1);

  // Limb segments: one base mesh per size (and per material), starting at the joint and reaching
  // up its length; every segment is an instance.
  const baseMeshes = (segs, prefix) => segs.map((s, j) => {
    const make = (mat, name) => {
      const m = MeshBuilder.CreateCylinder(name, { diameterTop: s.r1 * 2, diameterBottom: s.r0 * 2, height: s.len, tessellation: 7 }, scene);
      m.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, s.len / 2, 0));
      m.material = mat; m.isVisible = false;
      return m;
    };
    return { skin: make(skin, `${prefix}-${j}`), glow: make(glowMat, `${prefix}-glow-${j}`) };
  });
  const tentacleBase = baseMeshes(rig.segments, 'alien-seg');
  const crownBase = baseMeshes(rig.crownSegments, 'alien-spine');
  const buildLimb = (limb, parent, segs, bases, glowFrom) => {
    const root = node('limb', parent);
    root.position.set(...limb.root);
    root.rotationQuaternion = new Quaternion(...limb.quat);
    let p = root;
    const joints = limb.joints.map((jd, j) => {
      const joint = node('joint', p);
      if (j > 0) joint.position.y = segs[j - 1].len;
      joint.rotation.x = jd.base;
      bases[j][j >= glowFrom ? 'glow' : 'skin'].createInstance('alien-limb').parent = joint;
      p = joint;
      return joint;
    });
    return { limb, joints };
  };
  // The tentacles hang from a holder under the head that turns (the twirl); the crown rides the head.
  const spinner = node('alien-spinner', headHolder);
  const limbs = [
    ...rig.tentacles.map((t) => buildLimb(t, spinner, rig.segments, tentacleBase, rig.segments.length - ALIEN.glowTips)),
    ...rig.crown.map((c) => buildLimb({ ...c, root: onHead(c.root) }, headHolder, rig.crownSegments, crownBase, rig.crownSegments.length)),
  ];

  // Its own faint bioluminescence in the state's colour, which also flares red as a hunt starts.
  // Always there (at low intensity), because adding or removing lights recompiles shaders.
  const light = new PointLight('alien-glow', new Vector3(...ALIEN.light.pos), scene);
  light.parent = group;
  light.range = ALIEN.light.range;
  light.intensity = 0;
  let reveal = 0;
  const revealColor = linear(ALIEN.reveal.color);

  const u = {};
  return {
    anchor: group.position, // looping alien sounds follow this
    update(alien, time) {
      const p = poseAlien(u, alien, time);
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.yaw;
      inner.rotation.x = p.lean;
      headHolder.position.y = p.headY;
      headHolder.rotation.y = p.look;
      spinner.rotation.y = p.spin - p.look; // the pinwheel turns on its own, whatever the head does
      for (const { limb, joints } of limbs) {
        joints.forEach((joint, j) => { const [x, z] = p.joint(limb, j); joint.rotation.x = x; joint.rotation.z = z; });
      }
      const [r, g, b] = p.glow.color;
      const lv = p.glow.level;
      glowMat.emissiveColor.set(r * lv, g * lv, b * lv);
      // The light: the state glow, plus the hunt's red flare.
      const c = new Color3(r, g, b).toLinearSpace();
      light.diffuse = Color3.Lerp(c, revealColor, Math.min(1, reveal));
      light.specular = light.diffuse;
      light.intensity = (ALIEN.light.max * lv * 0.5 + ALIEN.reveal.max * reveal) * TUNING.light;
    },
    setReveal(k) { reveal = Math.max(0, k); },
  };
}
