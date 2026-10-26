// three.js renderer for the alien, built from the shared rig in js/alienshape.js.
import * as THREE from 'three';
import { ALIEN, alienRig, lump, poseAlien } from '../alienshape.js';

export function makeAlienView() {
  const rig = alienRig();
  const group = new THREE.Group();
  const inner = new THREE.Group(); // leans forward when it hunts
  group.add(inner);
  const skin = new THREE.MeshStandardMaterial({ color: ALIEN.skin.color, roughness: ALIEN.skin.roughness, metalness: ALIEN.skin.metalness });
  const strandMat = new THREE.MeshStandardMaterial({ color: ALIEN.strand.color, roughness: ALIEN.strand.roughness, metalness: ALIEN.strand.metalness });

  // Body: a squashed, lumpy sphere.
  const bodyGeo = new THREE.SphereGeometry(ALIEN.bodyRadius, 24, 18);
  const v = new THREE.Vector3();
  const pos = bodyGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    v.multiplyScalar(lump(n.x, n.y, n.z));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, skin);
  body.scale.set(...ALIEN.bodyScale);
  const bodyHolder = new THREE.Group();
  bodyHolder.position.y = ALIEN.bodyY;
  bodyHolder.add(body);
  inner.add(bodyHolder);

  const eyeMat = new THREE.MeshBasicMaterial({ color: ALIEN.eye.color, transparent: true, opacity: ALIEN.eye.opacity });
  for (const e of rig.eyes) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(e.r, 6, 4), eyeMat);
    eye.position.set(...e.pos);
    bodyHolder.add(eye);
  }

  const strandGeo = new THREE.CylinderGeometry(ALIEN.strand.r0, ALIEN.strand.r1, 1, 4);
  strandGeo.translate(0, -0.5, 0);
  for (const s of rig.bodyStrands) {
    const strand = new THREE.Mesh(strandGeo, strandMat);
    strand.position.set(...s.pos);
    strand.scale.y = s.scaleY;
    strand.rotation.set(...s.rot);
    bodyHolder.add(strand);
  }

  const segGeos = rig.segments.map((s) => {
    const g = new THREE.CylinderGeometry(s.r1, s.r0, s.len, 7);
    g.translate(0, s.len / 2, 0);
    return g;
  });
  const tentacles = rig.tentacles.map((t) => {
    const root = new THREE.Group();
    root.position.set(...t.root);
    root.quaternion.set(...t.quat);
    inner.add(root);
    let parent = root;
    const joints = t.joints.map((jd, j) => {
      const joint = new THREE.Group();
      if (j > 0) joint.position.y = rig.segments[j - 1].len;
      joint.rotation.x = jd.base;
      parent.add(joint);
      joint.add(new THREE.Mesh(segGeos[j], skin));
      for (const s of jd.strands) {
        const strand = new THREE.Mesh(strandGeo, strandMat);
        strand.position.set(...s.pos);
        strand.scale.y = s.scaleY;
        joint.add(strand);
      }
      parent = joint;
      return joint;
    });
    return { t, joints };
  });

  // A dull red glow that shows it for a moment when a hunt starts. Kept in the scene at
  // zero intensity, because adding or removing lights recompiles every shader.
  const reveal = new THREE.PointLight(ALIEN.reveal.color, 0, ALIEN.reveal.distance, 2);
  reveal.position.set(...ALIEN.reveal.pos);
  group.add(reveal);

  const u = {};
  return {
    object: group,
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
    setReveal(k) { reveal.intensity = ALIEN.reveal.max * k; },
  };
}
