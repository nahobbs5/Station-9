// Babylon.js renderer for the alien, built from the shared rig in js/alienshape.js.
// Tentacle segments and strands are instances of a few base meshes, to keep draw calls down.
import { ALIEN, alienRig, lump, poseAlien } from '../alienshape.js';
import { pbr, basic, linear, TUNING } from './util.js';

export function makeAlienView(scene) {
  const BABYLON = window.BABYLON;
  const { MeshBuilder, TransformNode, PointLight, Vector3, Quaternion } = BABYLON;
  const rig = alienRig();
  const node = (name, parent) => { const n = new TransformNode(name, scene); n.parent = parent; return n; };
  const group = new TransformNode('alien', scene);
  const inner = node('alien-inner', group); // leans forward when it hunts
  const skin = pbr(scene, { color: ALIEN.skin.color, roughness: ALIEN.skin.roughness, metalness: ALIEN.skin.metalness });
  const strandMat = pbr(scene, { color: ALIEN.strand.color, roughness: ALIEN.strand.roughness, metalness: ALIEN.strand.metalness });

  // Body: a squashed, lumpy sphere.
  const body = MeshBuilder.CreateSphere('alien-body', { diameter: ALIEN.bodyRadius * 2, segments: 16, updatable: true }, scene);
  const positions = body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
    const len = Math.hypot(x, y, z) || 1;
    const k = lump(x / len, y / len, z / len);
    positions[i] = x * k; positions[i + 1] = y * k; positions[i + 2] = z * k;
  }
  const normals = [];
  BABYLON.VertexData.ComputeNormals(positions, body.getIndices(), normals);
  body.updateVerticesData(BABYLON.VertexBuffer.PositionKind, positions);
  body.updateVerticesData(BABYLON.VertexBuffer.NormalKind, normals);
  body.material = skin;
  body.scaling.set(...ALIEN.bodyScale);
  const bodyHolder = node('alien-body-holder', inner);
  bodyHolder.position.y = ALIEN.bodyY;
  body.parent = bodyHolder;

  const eyeMat = basic(scene, ALIEN.eye.color, { alpha: ALIEN.eye.opacity });
  for (const e of rig.eyes) {
    const eye = MeshBuilder.CreateSphere('eye', { diameter: e.r * 2, segments: 3 }, scene);
    eye.material = eyeMat;
    eye.parent = bodyHolder;
    eye.position.set(...e.pos);
  }

  // One strand mesh, hanging down from its top; everything else is an instance of it.
  const strand = MeshBuilder.CreateCylinder('strand', { diameterTop: ALIEN.strand.r0 * 2, diameterBottom: ALIEN.strand.r1 * 2, height: 1, tessellation: 4 }, scene);
  strand.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, -0.5, 0));
  strand.material = strandMat;
  strand.isVisible = false;
  const addStrand = (parent, s) => {
    const inst = strand.createInstance('strand');
    inst.parent = parent;
    inst.position.set(...s.pos);
    inst.scaling.y = s.scaleY;
    if (s.rot) inst.rotation.set(...s.rot);
  };
  for (const s of rig.bodyStrands) addStrand(bodyHolder, s);

  // Tentacle segments: one base mesh per size, starting at the joint and reaching up its length.
  const segBase = rig.segments.map((s) => {
    const m = MeshBuilder.CreateCylinder('segment', { diameterTop: s.r1 * 2, diameterBottom: s.r0 * 2, height: s.len, tessellation: 7 }, scene);
    m.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0, s.len / 2, 0));
    m.material = skin;
    m.isVisible = false;
    return m;
  });
  const tentacles = rig.tentacles.map((t) => {
    const root = node('tentacle', inner);
    root.position.set(...t.root);
    root.rotationQuaternion = new Quaternion(...t.quat);
    let parent = root;
    const joints = t.joints.map((jd, j) => {
      const joint = node('joint', parent);
      if (j > 0) joint.position.y = rig.segments[j - 1].len;
      joint.rotation.x = jd.base;
      segBase[j].createInstance('segment').parent = joint;
      for (const s of jd.strands) addStrand(joint, s);
      parent = joint;
      return joint;
    });
    return { t, joints };
  });

  // A dull red glow that shows it for a moment when a hunt starts. Always there, at zero
  // intensity when off, because adding or removing lights recompiles shaders.
  const reveal = new PointLight('alien-reveal', new Vector3(...ALIEN.reveal.pos), scene);
  reveal.parent = group;
  reveal.diffuse = linear(ALIEN.reveal.color);
  reveal.specular = reveal.diffuse;
  reveal.range = ALIEN.reveal.distance;
  reveal.intensity = 0;

  const u = {};
  return {
    anchor: group.position, // looping alien sounds follow this
    update(alien, time) {
      const p = poseAlien(u, alien, time);
      group.position.set(p.x, 0, p.z);
      group.rotation.y = p.yaw;
      inner.rotation.x = p.lean;
      bodyHolder.position.y = p.bodyY;
      for (const { t, joints } of tentacles) {
        joints.forEach((joint, j) => { const [x, z] = p.joint(t, j); joint.rotation.x = x; joint.rotation.z = z; });
      }
    },
    setReveal(k) { reveal.intensity = ALIEN.reveal.max * k * TUNING.light; },
  };
}
