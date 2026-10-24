import * as THREE from 'three';
import { buildLayout, cellOf, cellCenter, lineClear } from './layout.js';
import { createNoiseBus, heardLoudness, LOUDNESS } from './noise.js';
import { Alien } from './alien.js';
import { buildWorld, makeAlienMesh, animateAlienMesh } from './world.js';
import { Player } from './player.js';
import { GameAudio } from './audio.js';
import { findTarget, Throwables } from './interact.js';
import { Tricks, HatMan } from './tricks.js';
import { Intercom, LINES, LOGS } from './intercom.js';

const $ = (id) => document.getElementById(id);
const ORDER = ['generator', 'comms', 'pod'];
const OBJECTIVES = {
  generator: 'Restore main power in the Generator Room',
  comms: 'Send a rescue call from the Comms Room',
  pod: 'Prep the escape pod in the Escape Pod Bay',
};
const DORMANT = 30;     // seconds of quiet before the alien wakes
const CATCH_DIST = 1.0;
const DECOYS_MAX = 3;
// ?debug lets automated tests play without pointer lock.
const DEBUG = new URLSearchParams(location.search).has('debug');

// Scene ---------------------------------------------------------------------
const layout = buildLayout();
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.06);
scene.add(new THREE.HemisphereLight(0x2a3a4a, 0x000000, 0.12));

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 90);
scene.add(camera);

const world = buildWorld(scene, layout);
const isDoorClosed = (x, z) => world.doorAt(x, z)?.closed ?? false;
const isBlockedCell = (x, z) => !layout.isOpen(x, z) || isDoorClosed(x, z);

const spawn = layout.room('airlock');
const player = new Player(camera, { x: cellCenter(spawn.cx), z: cellCenter(spawn.cz) }, isBlockedCell);
player.update(0, 0);

const alien = new Alien(layout, { start: 'teleporter', dormant: DORMANT });
const alienMesh = makeAlienMesh();
scene.add(alienMesh);
animateAlienMesh(alienMesh, alien, 0);

const audio = new GameAudio(camera, scene);
const intercom = new Intercom($('subtitle'));
const throwables = new Throwables(scene, isBlockedCell);
const hatman = new HatMan(scene, layout, camera, isDoorClosed, world);

const fwd = new THREE.Vector3();
function isInView(pos) {
  camera.getWorldDirection(fwd);
  const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const facing = (fwd.x * dx + fwd.z * dz) / (d * Math.hypot(fwd.x, fwd.z)) > Math.cos(1.0);
  return facing && lineClear(layout, player.pos, pos, isDoorClosed);
}
const tricks = new Tricks({ layout, world, audio, alien, player, isInView, isDoorClosed, hatman });

// Game state ------------------------------------------------------------------
let state = 'title'; // title | loading | playing | paused | caught | won
let elapsed = 0;
let stage = 0;
const progress = { generator: 0, comms: 0, pod: 0 };
let decoys = 0;
let gotCrate = false;
let noiseLevel = 0;
let pulseTimer = 0;
let nagTimer = 0;
let logTimer = 0;
let ePressed = false, eHeld = false;
const stats = { hunts: 0, decoys: 0 };

// Noise --------------------------------------------------------------------------
const noise = createNoiseBus();
noise.on((n) => {
  if (state !== 'playing') return;
  if (n.source === 'player') noiseLevel = Math.max(noiseLevel, n.loudness);
  alien.hear(n, heardLoudness(layout, n, alien.pos, isDoorClosed));
});
const makeNoise = (pos, loudness, source = 'player') => noise.emit({ x: pos.x, z: pos.z, loudness, source });

// Input --------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (state !== 'playing') return;
  if (e.code === 'KeyE') { if (!e.repeat) ePressed = true; eHeld = true; }
  if (e.code === 'KeyQ' && !e.repeat) throwDecoy();
});
addEventListener('keyup', (e) => { if (e.code === 'KeyE') eHeld = false; });

const canvas = renderer.domElement;
const lock = () => { const p = canvas.requestPointerLock(); if (p?.catch) p.catch(() => {}); };

$('start').addEventListener('click', () => start().catch((e) => {
  console.error(e);
  $('start-error').textContent = 'Something went wrong starting the game: ' + e.message;
}));
$('pause').addEventListener('click', lock);
for (const b of document.querySelectorAll('.restart')) b.addEventListener('click', () => location.reload());
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && state === 'paused') {
    state = 'playing';
    $('pause').hidden = true;
    audio.resume();
  } else if (!locked && state === 'playing') {
    state = 'paused';
    $('pause').hidden = false;
    eHeld = false;
    player.keys.clear();
    audio.suspend();
    if ('speechSynthesis' in window) speechSynthesis.pause();
  }
  if (locked && 'speechSynthesis' in window) speechSynthesis.resume();
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function start() {
  if (state !== 'title') return;
  state = 'loading';
  intercom.voice = $('voice').checked;
  $('start').textContent = 'Loading…';
  lock();
  await Promise.race([audio.resume().catch((e) => console.warn('Audio could not start', e)), wait(1000)]);
  // Never let sound loading block the game: give it a few seconds, then go anyway.
  if (await Promise.race([audio.load(), wait(8000).then(() => 'timeout')]) === 'timeout') console.warn('Sound loading timed out; starting anyway.');
  try {
    audio.startAmbience(world.props.teleporter);
    audio.attachAlien(alienMesh);
  } catch (e) {
    console.error('Audio setup failed', e);
    $('start-error').textContent = 'Sound failed to start: ' + e.message;
  }
  player.yaw = 0;
  player.pitch = 0;
  $('title').hidden = true;
  $('hud').hidden = false;
  for (const line of LINES.intro) intercom.say(line);
  state = DEBUG || document.pointerLockElement === canvas ? 'playing' : 'paused';
  $('pause').hidden = state === 'playing';
}

// Actions -------------------------------------------------------------------------
function throwDecoy() {
  if (decoys <= 0) { if (gotCrate) intercom.say(LINES.noDecoys); return; }
  decoys--;
  stats.decoys++;
  throwables.spawn(camera);
}

function press(target) {
  if (target.kind === 'door') {
    const d = target.door;
    const pc = [cellOf(player.pos.x), cellOf(player.pos.z)];
    const ac = alien.cell;
    if (!d.closed && ((pc[0] === d.cx && pc[1] === d.cz) || (ac[0] === d.cx && ac[1] === d.cz))) return;
    world.setDoor(d, !d.closed);
    audio.playAt('door', { x: d.x, z: d.z }, { volume: 0.8, duration: 2.4, rate: 1.15 });
    makeNoise(d, LOUDNESS.door);
  } else if (target.kind === 'crate') {
    decoys = DECOYS_MAX;
    if (!gotCrate) intercom.say(LINES.crate);
    gotCrate = true;
    audio.playAt('clatter', target.pos, { volume: 0.5 });
  } else if (target.kind === 'log') {
    $('log').textContent = LOGS[target.id];
    $('log').hidden = false;
    logTimer = 14;
  }
}

function canRepair(id) {
  const need = ORDER.indexOf(id);
  return need === stage;
}

function repair(target, dt) {
  const id = target.id;
  if (!canRepair(id)) {
    if (nagTimer <= 0 && ORDER.indexOf(id) > stage) {
      intercom.say(stage === 0 ? LINES.needPower : LINES.needComms);
      nagTimer = 8;
    }
    return false;
  }
  progress[id] = Math.min(1, progress[id] + dt / target.duration);
  pulseTimer -= dt;
  if (pulseTimer <= 0) {
    pulseTimer = 0.8;
    audio.playAt('clank', target.pos, { volume: 0.7, rate: 0.8 + Math.random() * 0.4 });
    makeNoise(target.pos, LOUDNESS.repair);
  }
  if (progress[id] >= 1) finishRepair(id, target);
  return true;
}

function finishRepair(id, target) {
  stage++;
  world.props[id].status.material.color.set(0x2aff7a);
  if (id === 'generator') {
    world.setPower(true);
    audio.playAt('flicker', target.pos, { volume: 1.2 });
    makeNoise(target.pos, LOUDNESS.generator, 'machine');
    intercom.say(LINES.power, { priority: true });
  } else if (id === 'comms') {
    world.props.commsScreen.material.color.set(0x2a8a6a);
    makeNoise(target.pos, LOUDNESS.comms, 'machine');
    intercom.say(LINES.comms, { priority: true });
  } else if (id === 'pod') {
    win();
  }
}

function handleAlienEvents() {
  for (const ev of alien.drain()) {
    if (ev.type === 'wake') {
      audio.playOn('teleporter', alienMesh, { volume: 1.4, rate: 0.7, ref: 4 });
    } else if (ev.type === 'click') {
      audio.playOn('clicks', alienMesh, { volume: 1.2, ref: 3, duration: 2.5, offset: Math.random() * 3 });
    } else if (ev.type === 'hunt') {
      stats.hunts++;
      audio.playOn('teleporter', alienMesh, { volume: 1.6, rate: 1.35, ref: 5, duration: 3 });
      audio.playOn('clicks', alienMesh, { volume: 1.5, rate: 1.4, ref: 4, duration: 2 });
      if (stats.hunts === 1) intercom.say(LINES.firstHunt);
      if (hatman.tryShow() && hatman.sightings === 1) intercom.say(LINES.hatman);
    } else if (ev.type === 'doorForce') {
      const d = world.doorAt(ev.cell[0], ev.cell[1]);
      audio.playAt('door', d, { volume: 0.9, rate: 0.6, duration: 1.6 });
    } else if (ev.type === 'doorOpen') {
      const d = world.doorAt(ev.cell[0], ev.cell[1]);
      audio.playAt('door', d, { volume: 1.0, rate: 1.0, offset: 1.5, duration: 2 });
    }
  }
}

function caught() {
  state = 'caught';
  player.lookAt(alien.pos.x, alien.pos.z);
  audio.play2D('teleporter', { volume: 1.5, rate: 1.6, duration: 2.5 });
  audio.play2D('clicks', { volume: 1.5, rate: 1.8, duration: 2 });
  intercom.stop();
  intercom.say(LINES.caught, { priority: true });
  intercom.update(0);
  $('flash').hidden = false;
  setTimeout(() => {
    $('hud').hidden = true;
    $('caught').hidden = false;
    $('caught-stats').textContent = `You lasted ${fmt(elapsed)} and finished ${stage} of 3 repairs.`;
    document.exitPointerLock();
  }, 1400);
}

function win() {
  state = 'won';
  intercom.stop();
  intercom.say(LINES.win, { priority: true });
  intercom.update(0);
  audio.play2D('teleporter', { volume: 1.0, rate: 0.5 });
  setTimeout(() => {
    $('hud').hidden = true;
    $('win').hidden = false;
    $('win-stats').textContent =
      `Time ${fmt(elapsed)} · Times hunted: ${stats.hunts} · Noise-makers thrown: ${stats.decoys}`;
    document.exitPointerLock();
  }, 1800);
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// Per-frame update -------------------------------------------------------------
function update(dt) {
  elapsed += dt;
  nagTimer -= dt;

  const step = player.update(dt, elapsed);
  if (step) {
    audio.footstep(step.mode);
    makeNoise(player.pos, step.loudness);
  }

  // What you're looking at.
  const target = findTarget(camera, world.interactables);
  let repairing = false;
  if (target) {
    if (ePressed && target.kind !== 'repair') press(target);
    if (eHeld && target.kind === 'repair' && progress[target.id] < 1) repairing = repair(target, dt);
  }
  ePressed = false;
  if (!repairing) pulseTimer = 0;
  if (state !== 'playing') return; // the pod repair can end the game

  throwables.update(dt, elapsed, (pos) => {
    audio.playAt('clatter', pos, { volume: 1.0 });
    makeNoise(pos, LOUDNESS.decoy, 'decoy');
  });

  // The alien.
  const d = Math.hypot(alien.pos.x - player.pos.x, alien.pos.z - player.pos.z);
  let sight = player.flashlightOn ? 7 : 3.5;
  if (player.crouching) sight *= 0.65;
  const canSee = alien.dormant <= 0 && d < sight && lineClear(layout, alien.pos, player.pos, isDoorClosed);
  alien.update(dt, {
    canSee,
    player: player.pos,
    isDoorClosed,
    openDoor: (x, z) => world.setDoor(world.doorAt(x, z), false),
  });
  handleAlienEvents();
  animateAlienMesh(alienMesh, alien, elapsed);
  audio.update(dt, { alienDist: alien.dormant > 0 ? 99 : d, alienMoving: alien.moving, alienSpeed: alien.speed });
  if (alien.dormant <= 0 && d < CATCH_DIST) { caught(); return; }

  tricks.update(dt);
  hatman.update(dt);
  intercom.update(dt);
  if (logTimer > 0 && (logTimer -= dt) <= 0) $('log').hidden = true;

  drawHud(dt, target, repairing);
}

function drawHud(dt, target, repairing) {
  const room = layout.roomAt(cellOf(player.pos.x), cellOf(player.pos.z));
  $('location').textContent = room ? room.name : 'Corridor';
  $('objective').textContent = stage < 3 ? OBJECTIVES[ORDER[stage]] : '';
  $('checklist').innerHTML = ORDER.map((id, i) =>
    `<li class="${i < stage ? 'done' : i === stage ? 'now' : ''}">${['Main power', 'Rescue call', 'Escape pod'][i]}</li>`).join('');

  noiseLevel = Math.max(0, noiseLevel - 12 * dt);
  $('noise-bar').style.width = `${Math.min(100, (noiseLevel / 14) * 100)}%`;
  $('noise-bar').classList.toggle('loud', noiseLevel >= 10);
  $('stamina-bar').style.width = `${player.stamina * 100}%`;
  $('stamina-bar').classList.toggle('tired', player.exhausted);
  $('decoys').textContent = gotCrate ? `Noise-makers: ${decoys}  [Q]` : '';
  $('mode').textContent = player.mode === 'crouch' ? 'CROUCHED' : player.mode === 'sprint' ? 'SPRINTING' : '';

  let prompt = '';
  if (target) {
    if (target.kind === 'door') prompt = `[E] ${target.door.closed ? 'Open' : 'Close'} door`;
    else if (target.kind === 'repair') {
      if (progress[target.id] >= 1) prompt = 'Done';
      else if (!canRepair(target.id)) prompt = target.id === 'pod' && stage < 2 ? 'Needs main power and a rescue call' : 'Needs main power';
      else prompt = `[Hold E] ${target.label}`;
    } else prompt = `[E] ${target.label}`;
  }
  $('prompt').textContent = prompt;
  const showBar = target && target.kind === 'repair' && progress[target.id] > 0 && progress[target.id] < 1;
  $('progress').hidden = !showBar;
  if (showBar) $('progress-bar').style.width = `${progress[target.id] * 100}%`;
  $('progress').classList.toggle('active', repairing);

  $('vignette').className = alien.state === 'hunt' ? 'hunt' : '';
}

// Loop ------------------------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'playing') update(dt);
  else if (state === 'caught' || state === 'won') intercom.update(dt);
  world.update(state === 'playing' || state === 'title' ? dt : 0, performance.now() / 1000);
  if (state === 'title') {
    // Slow look around the airlock behind the title screen.
    player.yaw = Math.sin(now / 6000) * 0.6;
    camera.rotation.set(0, player.yaw, 0);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Handy for debugging in the browser console.
window.station9 = { alien, player, world, layout, hatman, tricks, progress, get state() { return state; }, get stage() { return stage; } };
