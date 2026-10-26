// The three.js renderer. js/game.js runs the game and talks to this through a small "view":
// the world, the alien, the Hat Man figure, thrown balls, and render(rig) to draw a frame.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { makeAlienView } from './alien.js';
import { makeHatmanFigure, ballMaker } from './props.js';

export function createThreeView(container, layout) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  scene.fog = new THREE.FogExp2(0x000000, 0.06);
  scene.add(new THREE.HemisphereLight(0x2a3a4a, 0x000000, 0.12));

  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 90);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  // The flashlight rides on the camera. Only its intensity changes (never visibility).
  const flashlight = new THREE.SpotLight(0xfff0d0, 30, 26, 0.42, 0.45, 1.6);
  flashlight.position.set(0.18, -0.12, 0);
  flashlight.target.position.set(0.12, -0.12, -1);
  camera.add(flashlight, flashlight.target);

  const world = buildWorld(scene, layout);
  const alien = makeAlienView();
  scene.add(alien.object);

  return {
    name: 'three.js',
    canvas: renderer.domElement,
    renderer,
    world,
    alien,
    hatman: makeHatmanFigure(scene),
    makeBall: ballMaker(scene),
    render(rig) {
      camera.position.set(rig.position.x, rig.position.y, rig.position.z);
      camera.rotation.set(rig.pitch, rig.yaw, 0);
      flashlight.intensity = rig.flashlight;
      renderer.render(scene, camera);
    },
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    },
  };
}
