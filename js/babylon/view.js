// The Babylon.js renderer. js/game.js runs the game and talks to this through a small "view":
// the world, the alien, the Hat Man figure, thrown balls, and render(rig) to draw a frame.
import { buildWorld } from './world.js';
import { makeAlienView } from './alien.js';
import { makeHatmanFigure, ballMaker } from './props.js';
import { makeApparitionFigure } from './apparitions.js';
import { makeScreenFeed } from './screens.js';
import { linear, TUNING } from './util.js';
import { loadModels } from './models.js';
import { modelPlacements } from '../modelplan.js';
import { planDecor } from '../decorplan.js';

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
  const baseFov = camera.fov;
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
  const apparitions = makeApparitionFigure(scene);
  const screens = makeScreenFeed(world); // the computer screen apparitions, on the consoles

  // Realism (Stage 1 of "Improving Visuals"): reflections, shadows, ambient occlusion,
  // post effects and dust. All of it can be switched off with setQuality('low').
  // Faint reflections and bounce light from a real industrial room (Poly Haven "Boiler Room",
  // CC0), so metal reads as metal. Kept very low so the dark stays dark; the background stays black.
  const env = new BABYLON.HDRCubeTexture('assets/env/boiler_room_1k.hdr', scene, 128, false, true, false, true);
  scene.environmentTexture = env;
  const ENV_INTENSITY = 0.07;
  scene.environmentIntensity = ENV_INTENSITY;

  // Only the flashlight casts shadows (the room lights don't, to keep it fast). It sits a little
  // off your eye, so the shadows it throws are visible and move as you do.
  const shadows = new BABYLON.ShadowGenerator(1024, flashlight);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = BABYLON.ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.0008;
  shadows.normalBias = 0.03;
  flashlight.shadowMinZ = 0.1;
  flashlight.shadowMaxZ = 24;
  const unlit = (m) => !m.material || (m.material.disableLighting === true);
  for (const m of scene.meshes) {
    if (unlit(m)) continue;
    m.receiveShadows = true;
    if (m.name !== 'floor' && m.name !== 'ceiling' && !m.metadata?.decal) shadows.addShadowCaster(m, false);
  }
  // Props from downloaded models arrive a moment later; they light and shadow like everything else.
  const modelsReady = loadModels(scene, modelPlacements(layout, planDecor(layout)), {
    onMeshes: (meshes) => { for (const m of meshes) { m.receiveShadows = true; shadows.addShadowCaster(m, false); } },
  });

  // Ambient occlusion: soft darkening where things meet (corners, under furniture, along pipes).
  const ssao = new BABYLON.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: 0.5, blurRatio: 0.5 }, [camera]);
  ssao.radius = 1.2;
  ssao.totalStrength = 1.2;
  ssao.samples = 12;
  ssao.maxZ = 30;
  ssao.expensiveBlur = false;

  // Post effects: bloom on screens and lights, film grain, a little lens fringing, a vignette and
  // more contrast. Tone mapping moves here from the materials.
  const post = new BABYLON.DefaultRenderingPipeline('post', true, scene, [camera]);
  post.fxaaEnabled = true;
  post.bloomEnabled = true;
  post.bloomThreshold = 0.9;
  post.bloomWeight = 0.25;
  post.bloomKernel = 48;
  post.bloomScale = 0.5;
  post.grainEnabled = true;
  post.grain.intensity = 7;
  post.grain.animated = true;
  post.chromaticAberrationEnabled = true;
  post.chromaticAberration.aberrationAmount = 6;
  post.chromaticAberration.radialIntensity = 0.8;
  post.imageProcessingEnabled = true;
  ip.contrast = 1.25;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = 1.6;
  ip.vignetteColor = new Color4(0, 0, 0, 0);
  ip.vignetteCameraFov = camera.fov;

  // Dust drifting in the air ahead of you, where the flashlight catches it.
  const dust = new BABYLON.ParticleSystem('dust', 500, scene);
  {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
    dust.particleTexture = new BABYLON.Texture(c.toDataURL(), scene);
  }
  dust.emitter = new Vector3(0, 1.5, 0);
  dust.createBoxEmitter(new Vector3(-0.05, -0.03, -0.05), new Vector3(0.05, 0.03, 0.05), new Vector3(-2.2, -1.1, -2.2), new Vector3(2.2, 1.1, 2.2));
  dust.minSize = 0.008; dust.maxSize = 0.022;
  dust.minLifeTime = 4; dust.maxLifeTime = 8;
  dust.emitRate = 70;
  dust.minEmitPower = 0.02; dust.maxEmitPower = 0.07;
  dust.gravity = new Vector3(0, -0.01, 0);
  dust.color1 = new Color4(1, 0.95, 0.85, 0.22);
  dust.color2 = new Color4(0.9, 0.9, 0.9, 0.12);
  dust.colorDead = new Color4(0, 0, 0, 0);
  dust.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  dust.start();

  // High / Low graphics. Low turns off everything above that costs real time.
  let quality = 'high';
  let ssaoOn = true; // the SSAO pipeline attaches itself when it's created
  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    const high = quality === 'high';
    flashlight.shadowEnabled = high;
    post.bloomEnabled = high;
    post.grainEnabled = high;
    post.chromaticAberrationEnabled = high;
    scene.environmentIntensity = high ? ENV_INTENSITY : 0;
    // Attach or detach ambient occlusion only when it changes (attaching twice is an error).
    const mgr = scene.postProcessRenderPipelineManager;
    if (high && !ssaoOn) mgr.attachCamerasToRenderPipeline('ssao', camera);
    if (!high && ssaoOn) mgr.detachCamerasFromRenderPipeline('ssao', camera);
    ssaoOn = high;
    if (high) dust.start(); else dust.stop();
    world.setQuality?.(quality);
  }

  // ?fps: a small frame-rate readout, for comparing settings.
  let fpsEl = null;
  if (new URLSearchParams(location.search).has('fps')) {
    fpsEl = document.createElement('div');
    fpsEl.style.cssText = 'position:fixed;top:6px;right:8px;z-index:20;font:12px monospace;color:#8fe0cf;pointer-events:none';
    document.body.appendChild(fpsEl);
    setInterval(() => { fpsEl.textContent = `${engine.getFps().toFixed(0)} fps · ${quality}`; }, 500);
  }

  const target = new Vector3(), fwd = { x: 0, y: 0, z: 0 };
  // Babylon's built-in Inspector, for tuning lights and materials: add ?inspect to the URL.
  if (new URLSearchParams(location.search).has('inspect')) {
    scene.executeWhenReady(() => scene.debugLayer.show({ embedMode: true }).catch((e) => console.warn('Inspector did not load', e)));
  }

  return {
    name: 'Babylon.js',
    modelsReady, // resolves once every model has loaded (or failed)
    canvas,
    engine,
    scene,
    world,
    alien,
    hatman,
    apparitions,
    screens,
    makeBall: ballMaker(scene),
    render(rig) {
      const p = rig.position;
      camera.fov = baseFov * (rig.fovScale ?? 1); // narrower in a vent
      rig.forward(fwd);
      camera.position.set(p.x, p.y, p.z);
      camera.setTarget(target.set(p.x + fwd.x, p.y + fwd.y, p.z + fwd.z));
      // Right of where you look (forward x up), for the flashlight's offset.
      const rx = -fwd.z, rz = fwd.x, rl = Math.hypot(rx, rz) || 1;
      flashlight.position.set(p.x + (rx / rl) * 0.18, p.y - 0.12, p.z + (rz / rl) * 0.18);
      flashlight.direction.set(fwd.x - (rx / rl) * 0.06, fwd.y, fwd.z - (rz / rl) * 0.06);
      flashlight.intensity = rig.flashlight * TUNING.flash;
      dust.emitter.set(p.x + fwd.x * 2.6, p.y - 0.1, p.z + fwd.z * 2.6);
      scene.render();
    },
    resize() { engine.resize(); },
    // Scale the scene's exposure (1 = normal). Used for the eyes-adjusting fade in the wellness suites.
    setExposureScale(k) { ip.exposure = baseExposure * k; },
    tuning: TUNING,
    setQuality,
    get quality() { return quality; },
  };
}
