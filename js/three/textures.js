// Turns the shared canvas recipes (js/textures.js) into three.js textures.
import * as THREE from 'three';

export function toTexture(c, anisotropy = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = c.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (c.wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (c.repeat) t.repeat.set(c.repeat[0], c.repeat[1]);
  if (c.flipY === false) t.flipY = false;
  return t;
}
