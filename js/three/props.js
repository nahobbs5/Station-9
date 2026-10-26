// three.js meshes for the Hat Man figure and thrown noise-makers. Their behaviour is shared
// (HatMan in js/tricks.js, Throwables in js/interact.js); these are just the visible parts.
import * as THREE from 'three';

export const HATMAN_BACKLIGHT = 7;

// A black silhouette with a hat, and a red light behind it.
export function makeHatmanFigure(scene) {
  const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const g = new THREE.Group();
  const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.42, 1.55, 10), black);
  coat.position.y = 0.78;
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), black);
  shoulders.scale.set(1.3, 0.6, 0.8);
  shoulders.position.y = 1.55;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), black);
  head.position.y = 1.78;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), black);
  brim.position.y = 1.9;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.22, 12), black);
  crown.position.y = 2.02;
  g.add(coat, shoulders, head, brim, crown);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffd9c0 });
  for (const s of [-0.05, 0.05]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), eyeMat);
    eye.position.set(s, 1.8, 0.13);
    g.add(eye);
  }
  // Kept in the scene at zero intensity: adding or removing lights recompiles every shader.
  const backlight = new THREE.PointLight(0xff2010, 0, 7, 2);
  scene.add(backlight);
  g.visible = false;
  scene.add(g);
  return {
    position: g.position,
    place(x, z, faceYaw, lightX, lightZ) {
      g.position.set(x, 0, z);
      g.rotation.y = faceYaw;
      backlight.position.set(lightX, 1.6, lightZ);
      g.visible = true;
    },
    setBacklight(k) { backlight.intensity = HATMAN_BACKLIGHT * k; },
    hide() { g.visible = false; backlight.intensity = 0; },
  };
}

// A thrown noise-maker: orange while flying, pulsing once it lands.
export function ballMaker(scene) {
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  return () => {
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff6a33 }));
    scene.add(mesh);
    return {
      position: mesh.position,
      glow(l) { mesh.material.color.setHSL(0.04, 1, l); },
      remove() { mesh.removeFromParent(); },
    };
  };
}
