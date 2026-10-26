// The Babylon.js renderer. js/game.js runs the game and talks to this through a small "view":
// the world, the alien, the Hat Man figure, thrown balls, and render(rig) to draw a frame.
import { buildWorld } from './world.js';
import { makeAlienView } from './alien.js';
import { makeHatmanFigure, ballMaker } from './props.js';
import { linear, TUNING } from './util.js';

export function createBabylonView(container, layout) {
  const BABYLON = window.BABYLON;
  const { Vector3, Color3, Color4 } = BABYLON;
  const canvas = document.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  container.appendChild(canvas);
  const engine = new BABYLON.Engine(canvas, true, { stencil: false, powerPreference: 'high-performance' }, false);
  engine.setHardwareScalingLevel(1 / Math.min(devicePixelRatio, 1.5));
  // Babylon normally gives each light its own uniform block, and graphics drivers only allow
  // about 12-16 of those per shader. The station has about 18 lights, so use plain uniforms instead.
  engine.disableUniformBuffers = true;

  const scene = new BABYLON.Scene(engine);
  scene.useRightHandedSystem = true; // the game's maths assumes right-handed coordinates (-Z is forward)
  scene.clearColor = new Color4(0, 0, 0, 1);
  scene.ambientColor = Color3.Black();
  scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.06;
  scene.fogColor = Color3.Black();
  scene.skipPointerMovePicking = true;
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  ip.exposure = 1.15;
  const baseExposure = ip.exposure;

  // Every light fades out smoothly at its range (Babylon's glTF falloff).
  scene.onNewLightAddedObservable.add((l) => { l.falloffType = BABYLON.Light.FALLOFF_GLTF; });

  const hemi = new BABYLON.HemisphericLight('sky', new Vector3(0, 1, 0), scene);
  hemi.diffuse = linear(0x2a3a4a);
  hemi.groundColor = Color3.Black();
  hemi.specular = Color3.Black();
  hemi.intensity = 0.12;

  const camera = new BABYLON.UniversalCamera('camera', new Vector3(0, 1.6, 0), scene);
  camera.fov = (70 * Math.PI) / 180; // vertical
  camera.minZ = 0.05;
  camera.maxZ = 90;
  camera.inputs.clear(); // the shared Player handles input
  // The flashlight: a little right of and below your eye, pointing where you look.
  const flashlight = new BABYLON.SpotLight('flashlight', Vector3.Zero(), new Vector3(0, 0, -1), 0.84, 1, scene);
  flashlight.innerAngle = 0.84 * (1 - 0.45);
  flashlight.diffuse = linear(0xfff0d0);
  flashlight.specular = flashlight.diffuse;
  flashlight.range = 26;
  flashlight.intensity = 0;

  const world = buildWorld(scene, layout);
  const alien = makeAlienView(scene);
  const hatman = makeHatmanFigure(scene);

  const target = new Vector3(), fwd = { x: 0, y: 0, z: 0 };
  // Babylon's built-in Inspector, for tuning lights and materials: add ?inspect to the URL.
  if (new URLSearchParams(location.search).has('inspect')) {
    scene.executeWhenReady(() => scene.debugLayer.show({ embedMode: true }).catch((e) => console.warn('Inspector did not load', e)));
  }

  return {
    name: 'Babylon.js',
    canvas,
    engine,
    scene,
    world,
    alien,
    hatman,
    makeBall: ballMaker(scene),
    render(rig) {
      const p = rig.position;
      rig.forward(fwd);
      camera.position.set(p.x, p.y, p.z);
      camera.setTarget(target.set(p.x + fwd.x, p.y + fwd.y, p.z + fwd.z));
      // Right of where you look (forward x up), for the flashlight's offset.
      const rx = -fwd.z, rz = fwd.x, rl = Math.hypot(rx, rz) || 1;
      flashlight.position.set(p.x + (rx / rl) * 0.18, p.y - 0.12, p.z + (rz / rl) * 0.18);
      flashlight.direction.set(fwd.x - (rx / rl) * 0.06, fwd.y, fwd.z - (rz / rl) * 0.06);
      flashlight.intensity = rig.flashlight * TUNING.flash;
      scene.render();
    },
    resize() { engine.resize(); },
    // Scale the scene's exposure (1 = normal). Used for the eyes-adjusting fade in the wellness suites.
    setExposureScale(k) { ip.exposure = baseExposure * k; },
    tuning: TUNING,
  };
}
