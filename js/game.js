// The game itself: rules, objectives, the alien, tapes, HUD and the main loop. All drawing goes
// through a "view" (js/babylon/view.js) that startGame() builds, so this file knows nothing about the engine.
import { buildLayout, cellOf, cellCenter, lineClear, REPAIRS } from './layout.js';
import { createNoiseBus, heardLoudness, LOUDNESS, REPAIR, forcing, carryHeard } from './noise.js';
import { Alien, inSight } from './alien.js';
import { Player } from './player.js';
import { GameAudio, Music, MENU_MUSIC, END_MUSIC } from './audio.js';
import { renderCredits } from './credits.js';
import { findTarget, Throwables } from './interact.js';
import { Tricks } from './tricks.js';
import { HatMan, cameoSurfaces, corridorEndLamps } from './hatman.js';
import { Apparitions, KIND_IDS } from './apparitions.js';
import { consoleScreens, SCREEN_IDS } from './screenapparitions.js';
import { Intercom, LINES, applyLines } from './intercom.js';
import { Minimap, revealAround } from './minimap.js';
import { parseIntro, parseLore, parseLines } from './textfiles.js';
import { TapePlayer } from './tapes.js';
import { CameraRig } from './rig.js';
import { inSuite, graffitiWall, GRAFFITI_RANGE } from './suiteplan.js';
import { VENT, VentState, grateAt, nearestGrate, clampYaw, lookingOut, ventPoint, grateSpots } from './vents.js';
import { NOISEMAKERS, TYPES, Inventory, ActiveNoise, CRATE_CONTENTS, pickupPlacements, MAX_CARRY } from './noisemakers.js';

const $ = (id) => document.getElementById(id);
const ORDER = REPAIRS;
const OBJECTIVES = {
  generator: 'Restore main power in the Generator Room',
  comms: 'Send a rescue call from the Comms Room',
  pod: 'Prep the escape pod in the Escape Pod Bay',
};
const DORMANT = 30;     // seconds of quiet before the alien wakes
const CATCH_DIST = 1.3;
const SCORE = { lore: 100, repair: 250, escape: 1000, timeBonusFrom: 900 };
// ?debug lets automated tests play without pointer lock.
const DEBUG = new URLSearchParams(location.search).has('debug');

export function startGame(createView) {
  // Scene ---------------------------------------------------------------------
  const layout = buildLayout();
  const view = createView($('game'), layout);
  const rig = new CameraRig();
  const world = view.world;
  const isDoorClosed = (x, z) => world.doorAt(x, z)?.closed ?? false;
  // A circle of radius r at (x, z) is blocked by a wall (the smooth shape), a prop or a closed door.
  const blockedAt = (x, z, r = 0) => layout.walkDistance(x, z) < r ||
    [[-r, -r], [r, -r], [-r, r], [r, r]].some(([ox, oz]) => {
      const cx = cellOf(x + ox), cz = cellOf(z + oz);
      return layout.isSolid(cx, cz) || isDoorClosed(cx, cz);
    });

  const spawn = layout.room('airlock');
  const player = new Player(rig, { x: cellCenter(spawn.cx), z: cellCenter(spawn.cz) }, blockedAt);
  player.update(0, 0);

  const alien = new Alien(layout, { start: 'teleporter', dormant: DORMANT });
  view.alien.update(alien, 0);

  const audio = new GameAudio(rig);
  world.onDecorEvent = (type, at) => { if (state === 'playing') audio.decorSound(type, at); };
  const intercom = new Intercom($('subtitle'));
  intercom.muted = () => suiteNow !== null; // silent inside the suites, except at the door
  const tapes = new TapePlayer({
    audio, intercom,
    el: { box: $('tape'), head: $('tape-head'), speaker: $('tape-speaker'), line: $('tape-line') },
  });
  const throwables = new Throwables(view.makeBall, (x, z) => blockedAt(x, z, 0.05), NOISEMAKERS);
  // The Hat Man (reference files/Hatman.md). Marigold mentions him once, the first time he's out.
  const hatman = new HatMan(view.hatman, layout, {
    rig, world,
    lineClear: (a, b) => lineClear(layout, a, b, isDoorClosed),
    onFirst: () => intercom.say(LINES.hatman),
  });
  view.hatman.addLamps(corridorEndLamps(layout));
  // The other nine from the Apparition Field Guide (js/apparitions.js): one at a time, never in a safe room.
  const phantoms = new Apparitions(view.apparitions, layout, {
    lineClear: (a, b) => lineClear(layout, a, b, isDoorClosed),
    sound: (name, pos, opts) => audio.playAt(name, pos, opts),
    grates: grateSpots(layout),
    surfaces: cameoSurfaces(layout),
    // The computer screen apparitions play on the consoles' monitors (js/screenapparitions.js).
    feed: view.screens,
    consoles: consoleScreens(layout),
  });

  let apparitions = true; // the menu setting (read from storage below)

  const fwd = { x: 0, y: 0, z: 0 };
  function isInView(pos) {
    rig.forward(fwd);
    const dx = pos.x - player.pos.x, dz = pos.z - player.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const facing = (fwd.x * dx + fwd.z * dz) / (d * Math.hypot(fwd.x, fwd.z)) > Math.cos(Math.PI / 3);
    return facing && lineClear(layout, player.pos, pos, isDoorClosed);
  }
  const tricks = new Tricks({
    layout, world, audio, alien, player, isInView, isDoorClosed, hatman, phantoms,
    cameoSurfaces: cameoSurfaces(layout),
    inSuite: () => suiteNow !== null || vent.inside, // no tricks in the suites or the vents
    facing: () => { rig.forward(fwd); return fwd; },
    stage: () => stage,
    busy: () => repairingNow,
    say: (text) => intercom.say(text),
    apparitions: () => apparitions,
  });

  // Game state ------------------------------------------------------------------
  let state = 'title'; // title | loading | playing | paused | caught | won
  let elapsed = 0;
  let stage = 0;
  const progress = { generator: 0, comms: 0, pod: 0 };
  // Noise-makers (js/noisemakers.js): what you carry, what's going off, what's still lying about.
  const inventory = new Inventory();
  const activeNoise = new ActiveNoise();
  const crateLeft = [...CRATE_CONTENTS];
  const pickupsLeft = new Map(pickupPlacements(layout).map((p) => [p.id, p]));
  const typesFound = new Set();
  let noiseLevel = 0;
  let pulseTimer = 0;
  let nagTimer = 0;
  let ePressed = false, eHeld = false;
  const repairTaps = []; // times of recent E presses on a repair
  let forceUntil = -1;   // forcing a repair (rapid taps) until this time
  let repairingNow = false;
  let wasHunting = false;
  let revealTimer = 0;
  let toastTimer = 0;
  // The wellness suites: which one you're in, the exposure fade, and when Marigold last spoke at each door.
  let suiteNow = null, exposureK = 1, saidGraffiti = false;
  const lastDoorLine = { wellness: -Infinity, quiet: -Infinity };
  const DOOR_LINE_GAP = 20; // seconds before she repeats a door line
  const graffiti = graffitiWall(layout);
  const stats = { hunts: 0, decoys: 0 };
  // Vents (js/vents.js): which one you're in, and the E key's tap-or-hold at a grate.
  const vents = world.vents?.vents ?? [];
  const vent = new VentState(vents);
  let eDownAt = -1, eTapped = false, ventHold = 0, ventGrate = null, ventRefused = 0, tapTimer = 30;

  // Lore terminals and the opening announcements come from text/lore.txt and text/intro.txt,
  // loaded when the shift starts.
  let lore = new Map();
  let introLines = LINES.intro;
  const loreRead = new Set();
  const LORE_TOTAL = layout.props.filter((p) => p.kind === 'log').length;
  const inSafeRoom = () => layout.isSafe(cellOf(player.pos.x), cellOf(player.pos.z));

  // Minimap: only what you've seen. M hides it.
  const explored = new Uint8Array(layout.w * layout.h);
  const minimap = new Minimap($('minimap'), layout);
  const terminals = layout.props.filter((p) => p.kind === 'log');
  let exploreTimer = 0, mapTimer = 0, lastCell = '';
  revealAround(layout, explored, player.pos, isDoorClosed);

  // Noise --------------------------------------------------------------------------
  const noise = createNoiseBus();
  noise.on((n) => {
    if (state !== 'playing') return;
    if (n.source === 'player') noiseLevel = Math.max(noiseLevel, n.loudness);
    if (layout.isSafe(cellOf(n.x), cellOf(n.z))) return; // safe rooms are soundproofed
    const heard = heardLoudness(layout, n, alien.pos, isDoorClosed);
    // A clank that carries is heard wherever it is on the station.
    if (alien.hear(n, n.carry ? carryHeard(heard, Math.hypot(n.x - alien.pos.x, n.z - alien.pos.z)) : heard)) n.heard = true;
  });
  // Returns the noise, with heard: true if the alien heard it.
  const makeNoise = (pos, loudness, source = 'player', { carry = false } = {}) => {
    const n = { x: pos.x, z: pos.z, loudness, source, carry, heard: false };
    noise.emit(n);
    return n;
  };

  // Input --------------------------------------------------------------------------
  // Debug keys (?debug only): 1-9 the field-guide nine, 0 the Hat Man, Alt+1...0, Alt+-, Alt+= and
  // Alt+Backspace the thirteen screen ones, ` the alien off and on. Noise-makers move to the mouse wheel.
  const DEBUG_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace'];
  function debugKey(e) {
    if (e.code === 'Backquote') { if (!e.repeat) setAlienOff(!alienOff); return true; }
    if (e.code === 'AltLeft' || e.code === 'AltRight') return true; // keep the browser's menu out of it
    const i = DEBUG_KEYS.indexOf(e.code);
    if (i < 0) return false;
    if (e.repeat) return true;
    if (e.altKey) phantoms.summon(SCREEN_IDS[i]);
    else if (i < KIND_IDS.length) phantoms.summon(KIND_IDS[i]);
    else if (e.code === 'Digit0') hatman.summon();
    else return false;
    return true;
  }
  if (DEBUG) {
    addEventListener('keyup', (e) => { if (e.code === 'AltLeft' || e.code === 'AltRight') e.preventDefault(); });
    addEventListener('wheel', (e) => { if (state === 'playing' && e.deltaY) inventory.cycle(Math.sign(e.deltaY)); }, { passive: true });
    console.info('Debug keys: 1-9 ' + KIND_IDS.join(', ') + ' · 0 Hat Man · Alt+1-0, Alt+-, Alt+=, Alt+Backspace ' +
      SCREEN_IDS.map((id) => id.slice(7)).join(', ') + ' (on a monitor) · ` alien off/on · wheel picks a noise-maker');
  }
  addEventListener('keydown', (e) => {
    if (state !== 'playing') return;
    if (DEBUG && debugKey(e)) { e.preventDefault(); return; }
    if (e.code === 'KeyE') { if (!e.repeat) { ePressed = true; eDownAt = elapsed; } eHeld = true; }
    if (e.code === 'KeyQ' && !e.repeat && !vent.inside) throwDecoy();
    if (!DEBUG && /^Digit[123]$/.test(e.code) && !e.repeat && !vent.inside) inventory.select(+e.code.slice(5));
    if (e.code === 'KeyM' && !e.repeat) $('map').hidden = !$('map').hidden;
    if (e.code === 'KeyT' && !e.repeat) tapes.stop();
  });
  // A click skips to the next line of dialogue (Marigold's, then a tape's).
  addEventListener('mousedown', (e) => {
    if (state === 'playing' && e.button === 0 && document.pointerLockElement) skipDialogue();
  });
  let lastSkip = -1;
  function skipDialogue() {
    if (elapsed - lastSkip < 0.15) return; // a double click shouldn't skip two lines
    lastSkip = elapsed;
    if (!intercom.skip()) tapes.skip();
  }
  addEventListener('keyup', (e) => {
    if (e.code !== 'KeyE') return;
    eHeld = false;
    if (eDownAt >= 0 && elapsed - eDownAt < VENT.tapMax) eTapped = true; // a tap, not a hold
    eDownAt = -1;
  });

  const canvas = view.canvas;
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
      tapes.pause();
    }
    if (locked && 'speechSynthesis' in window) speechSynthesis.resume();
    if (locked) tapes.resume();
  });

  // Splash screen: browsers only allow sound after a click or key, so the first
  // click here starts the title theme and reveals the main menu.
  const music = new Music(MENU_MUSIC);
  const endMusic = new Music(END_MUSIC);
  const leaveSplash = () => {
    if ($('splash').hidden) return;
    $('splash').hidden = true;
    $('title').hidden = false;
    music.play();
  };
  $('splash').addEventListener('click', leaveSplash);
  document.addEventListener('keydown', leaveSplash);

  renderCredits($('credits-list'));
  renderCredits($('win-credits'));
  $('credits-open').addEventListener('click', () => { $('title').hidden = true; $('credits').hidden = false; });
  // Graphics: High (shadows, ambient occlusion, bloom, dust) or Low, remembered between visits.
  const QUALITY_KEY = 'station9.graphics';
  const readQuality = () => { try { return localStorage.getItem(QUALITY_KEY) || 'high'; } catch { return 'high'; } };
  const applyQuality = (q) => {
    view.setQuality?.(q);
    $('graphics').textContent = `Graphics: ${q === 'low' ? 'Low' : 'High'}`;
  };
  applyQuality(readQuality());
  $('graphics').addEventListener('click', () => {
    const q = readQuality() === 'low' ? 'high' : 'low';
    try { localStorage.setItem(QUALITY_KEY, q); } catch { /* private window: just not remembered */ }
    applyQuality(q);
  });
  // Apparitions: On (the Hat Man and anything like him: scarier) or Off, remembered between visits.
  // Every apparition checks this one setting (hatman.enabled, and tricks' apparitions()).
  const APPARITIONS_KEY = 'station9.apparitions';
  const readApparitions = () => { try { return localStorage.getItem(APPARITIONS_KEY) !== 'off'; } catch { return true; } };
  const applyApparitions = () => {
    hatman.enabled = apparitions;
    phantoms.enabled = apparitions;
    $('apparitions').setAttribute('aria-pressed', String(apparitions));
    $('apparitions-label').textContent = apparitions ? 'Apparitions: On (scarier)' : 'Apparitions: Off';
    $('apparitions-note').textContent = apparitions
      ? "Things that shouldn't be there will show themselves."
      : "Turn on for a scarier game: things that shouldn't be there.";
  };
  apparitions = readApparitions();
  applyApparitions();
  $('apparitions').addEventListener('click', () => {
    apparitions = !apparitions;
    try { localStorage.setItem(APPARITIONS_KEY, apparitions ? 'on' : 'off'); } catch { /* private window: just not remembered */ }
    applyApparitions();
  });
  $('credits-back').addEventListener('click', () => { $('credits').hidden = true; $('title').hidden = false; });

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Fetch a text file, giving up after 5 s. Returns null if it can't be loaded.
  async function loadText(url) {
    const res = await Promise.race([fetch(url), wait(5000).then(() => null)]);
    return res?.ok ? res.text() : null;
  }

  async function start() {
    if (state !== 'title') return;
    state = 'loading';
    music.fadeOut(1500);
    intercom.voice = $('voice').checked;
    tapes.voice = intercom.voice;
    $('start').textContent = 'Loading…';
    lock();
    await Promise.race([audio.resume().catch((e) => console.warn('Audio could not start', e)), wait(1000)]);
    // Never let sound loading block the game: give it a few seconds, then go anyway.
    if (await Promise.race([audio.load(), wait(8000).then(() => 'timeout')]) === 'timeout') console.warn('Sound loading timed out; starting anyway.');
    try {
      const [loreText, introText, marigoldText] = await Promise.all(['text/lore.txt', 'text/intro.txt', 'text/marigold.txt'].map(loadText));
      if (marigoldText) applyLines(parseLines(marigoldText));
      if (loreText) lore = new Map(parseLore(loreText).map((e) => [e.id, e]));
      else console.warn('Lore did not load; terminals will show as offline.');
      const intro = introText && parseIntro(introText);
      if (intro?.length) introLines = intro;
    } catch (e) {
      console.warn('Text files did not load', e);
    }
    try {
      audio.startAmbience(world.anchors.teleporter);
      audio.attachAlien(view.alien.anchor);
    } catch (e) {
      console.error('Audio setup failed', e);
      $('start-error').textContent = 'Sound failed to start: ' + e.message;
    }
    player.yaw = 0;
    player.pitch = 0;
    $('title').hidden = true;
    $('hud').hidden = false;
    for (const line of introLines) intercom.say(line);
    state = DEBUG || document.pointerLockElement === canvas ? 'playing' : 'paused';
    $('pause').hidden = state === 'playing';
  }

  // Actions -------------------------------------------------------------------------
  function throwDecoy() {
    const type = inventory.take();
    if (!type) { if (inventory.found) intercom.say(LINES.noDecoys); return; }
    stats.decoys++;
    throwables.spawn(rig, type);
  }

  function gotNoisemaker(type) { if (inventory.add(type)) noteNoisemaker(type); }
  // Marigold explains each kind the first time you pick one up.
  function noteNoisemaker(type) {
    if (typesFound.has(type)) return;
    typesFound.add(type);
    intercom.say(typesFound.size === 1 ? LINES.crate : LINES[`nm_${type}`]);
  }

  function press(target) {
    if (target.kind === 'door') {
      const d = target.door;
      const pc = [cellOf(player.pos.x), cellOf(player.pos.z)];
      const ac = alien.cell;
      if (!d.closed && ((pc[0] === d.cx && pc[1] === d.cz) || (ac[0] === d.cx && ac[1] === d.cz))) return;
      world.setDoor(d, !d.closed);
      d.closedByPlayer = d.closed;
      audio.playAt('door', { x: d.x, z: d.z }, { volume: 0.8, duration: 2.4, rate: 1.15 });
      makeNoise(d, player.mode === 'sprint' ? LOUDNESS.doorSlam : LOUDNESS.door);
    } else if (target.kind === 'crate') {
      // Take what fits; the rest stays in the crate for later.
      if (!crateLeft.length) return;
      if (inventory.full) { intercom.say(LINES.handsFull); return; }
      while (crateLeft.length && !inventory.full) { gotNoisemaker(crateLeft.shift()); world.takeFromCrate(); }
      if (!crateLeft.length) world.setPickupLabel('crate', 'Empty crate');
      audio.playAt('clatter', target.pos, { volume: 0.5 });
    } else if (target.kind === 'pickup') {
      if (!inventory.add(target.type)) { intercom.say(LINES.handsFull); return; }
      noteNoisemaker(target.type);
      pickupsLeft.delete(target.id);
      world.takePickup(target.id);
      audio.playAt('tick', target.pos, { volume: 0.5 });
    } else if (target.kind === 'log') {
      if (tapes.id === target.id) tapes.stop();
      else playTape(target);
    }
  }

  // A terminal's audio log plays in your earpiece, so you can keep moving. Only the button press makes noise.
  function playTape(target) {
    const entry = lore.get(target.id);
    audio.playAt('click', target.pos, { volume: 0.4 });
    makeNoise(target.pos, LOUDNESS.terminal);
    if (!entry) { toast('TAPE DAMAGED'); return; }
    tapes.play(entry);
    if (!loreRead.has(target.id)) {
      loreRead.add(target.id);
      world.markRead(target.id);
      toast(`Lore ${loreRead.size}/${LORE_TOTAL}  +${SCORE.lore}`);
    }
  }

  function toast(text) {
    $('toast').textContent = text;
    $('toast').hidden = false;
    toastTimer = 3;
  }

  function score(won) {
    const repairs = won ? 3 : stage;
    let total = loreRead.size * SCORE.lore + repairs * SCORE.repair;
    if (won) total += SCORE.escape + Math.max(0, Math.floor(SCORE.timeBonusFrom - elapsed));
    return total;
  }

  function canRepair(id) {
    const need = ORDER.indexOf(id);
    return need === stage;
  }

  // A repair's clank. Each one has a chance to carry right across the station (js/noise.js REPAIR);
  // Marigold mentions it the first time one does.
  let carriedOnce = false, saidWasted = false;
  function clank(target, mode) {
    const r = REPAIR[mode];
    audio.playAt('clank', target.pos, { volume: mode === 'tap' ? 0.95 : 0.7, rate: 0.8 + Math.random() * 0.4 });
    const carry = Math.random() < r.carry;
    makeNoise(target.pos, r.loudness, 'player', { carry });
    if (carry && !carriedOnce) { carriedOnce = true; intercom.say(LINES.carried); }
  }

  // mode: 'hold' (careful) or 'tap' (forcing it: faster, louder; its clanks come with each tap).
  function repair(target, dt, mode = 'hold') {
    const id = target.id;
    if (!canRepair(id)) {
      if (nagTimer <= 0 && ORDER.indexOf(id) > stage) {
        intercom.say(stage === 0 ? LINES.needPower : LINES.needComms);
        nagTimer = 8;
      }
      return false;
    }
    progress[id] = Math.min(1, progress[id] + (dt * REPAIR[mode].speed) / target.duration);
    world.setRepairProgress?.(id, progress[id]);
    if (mode === 'hold') {
      pulseTimer -= dt;
      if (pulseTimer <= 0) { pulseTimer = REPAIR.hold.every; clank(target, 'hold'); }
    }
    if (progress[id] >= 1) finishRepair(id, target);
    return true;
  }

  function finishRepair(id, target) {
    stage++;
    world.setStatus(id, 0x2aff7a);
    world.setProgress(stage); // console screens: power online, signal sent, launch window open
    if (id === 'generator') {
      world.setPower(true);
      audio.playAt('flicker', target.pos, { volume: 1.2 });
      audio.startEngine(world.anchors.generator);
      makeNoise(target.pos, LOUDNESS.generator, 'machine', { carry: true }); // it always hears the generator start
      intercom.say(LINES.power, { priority: true });
    } else if (id === 'comms') {
      world.setCommsLit();
      makeNoise(target.pos, LOUDNESS.comms, 'machine', { carry: true }); // ...and the call going out
      intercom.say(LINES.comms, { priority: true });
    } else if (id === 'pod') {
      win();
    }
  }

  function handleAlienEvents() {
    for (const ev of alien.drain()) {
      if (ev.type === 'wake') {
        audio.playOn('teleporter', view.alien.anchor, { volume: 1.4, rate: 0.7, ref: 4 });
      } else if (ev.type === 'click') {
        audio.alienClick(ev.state);
      } else if (ev.type === 'huntWarn') {
        // The fair warning before every hunt: the hum cuts out, the clicking stops, the lights dip.
        stats.hunts++;
        audio.cutHum(true);
        audio.stopAlienClicks();
        world.dimBeat(ev.time + 0.4);
        if (stats.hunts === 1 || Math.random() < 0.3) intercom.say(LINES.hunt);
      } else if (ev.type === 'hunt') {
        audio.screech();
        revealTimer = 1.2; // you see it for about a second
      } else if (ev.type === 'scrape') {
        // At the grate in a chase: it hits the cover first.
        audio.playAt('ventScrape', { x: ev.grate.x, y: 0.4, z: ev.grate.z }, { volume: 1.6, ref: 3, bus: 'alien' });
      } else if (ev.type === 'tearStart') {
        audio.playAt('ventTear', { x: ev.grate.x, y: 0.4, z: ev.grate.z }, { volume: 1.8, ref: 4, bus: 'alien' });
        world.vents?.tear(ev.grate);
      } else if (ev.type === 'tore') {
        // A dead end: caught. A duct: caught only near that end; otherwise it goes round to the other.
        const g = ev.grate;
        if (vent.inside && vent.vent === g.vent) {
          const endS = g.end === 0 ? 0 : g.vent.length;
          if (g.vent.kind === 'dead' || Math.abs(vent.s - endS) <= VENT.tearCatch) { caught(); return; }
          alien.goOtherEnd();
        } else alien.toLost();
      } else if (ev.type === 'doorForce') {
        const d = world.doorAt(ev.cell[0], ev.cell[1]);
        audio.playAt('door', d, { volume: 0.9, rate: 0.6, duration: 1.6, bus: 'alien' });
      } else if (ev.type === 'doorOpen') {
        const d = world.doorAt(ev.cell[0], ev.cell[1]);
        audio.playAt('door', d, { volume: 1.0, rate: 1.0, offset: 1.5, duration: 2, bus: 'alien' });
      }
    }
  }

  function caught() {
    state = 'caught';
    player.lookAt(alien.pos.x, alien.pos.z);
    audio.play2D('teleporter', { volume: 1.5, rate: 1.6, duration: 2.5 });
    audio.play2D('clicks', { volume: 1.5, rate: 1.8, duration: 2 });
    tapes.stop(false);
    intercom.stop();
    intercom.say(LINES.caught, { priority: true });
    intercom.update(0);
    $('flash').hidden = false;
    setTimeout(() => {
      $('hud').hidden = true;
      $('caught').hidden = false;
      $('caught-stats').textContent =
        `You lasted ${fmt(elapsed)} and finished ${stage} of 3 repairs. Lore read: ${loreRead.size}/${LORE_TOTAL}. Score: ${score(false)}`;
      document.exitPointerLock();
    }, 1400);
  }

  function win() {
    state = 'won';
    audio.silenceAlien(); // nothing of it in the ending
    world.launchPod?.(); // the door shuts, the thrusters flare
    const allLore = loreRead.size === LORE_TOTAL;
    tapes.stop(false);
    intercom.stop();
    if (allLore) {
      intercom.say(LINES.winAll[0], { priority: true });
      intercom.say(LINES.winAll[1]);
    } else {
      intercom.say(LINES.win, { priority: true });
    }
    intercom.update(0);
    audio.play2D('rumble', { volume: 1.0 });
    audio.play2D('whoosh', { volume: 1.0 });
    endMusic.play(3000);
    setTimeout(() => {
      $('hud').hidden = true;
      $('win').hidden = false;
      if (allLore) $('win-text').textContent =
        'The pod drops away from Station 9. Marigold is still reading names into the dark. Yours is not one of them.';
      $('win-stats').textContent =
        `Time ${fmt(elapsed)} · Times hunted: ${stats.hunts} · Noise-makers thrown: ${stats.decoys} · Lore read: ${loreRead.size}/${LORE_TOTAL}`;
      $('win-score').textContent = `Score: ${score(true)}`;
      document.exitPointerLock();
    }, allLore ? 9000 : 1800);
  }

  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  // Per-frame update -------------------------------------------------------------
  // Vents ----------------------------------------------------------------------------
  // At a grate: tap E to dive in (or out) fast and loud, hold it to slip through quietly. Inside:
  // crawl with W/S, look about (within limits), and keep still while it listens.
  // Returns the grate you could use right now (for the prompt), or null.
  function updateVent(dt, aimed = null) {
    const acted = ePressed || player.flashClicked;
    const wasInside = vent.inside;
    const grate = vent.inside ? vent.exitGrate() : aimed ? null : grateAt(vents, player.pos, player.crouching);
    ventRefused = Math.max(0, ventRefused - dt);
    if (grate && (vent.mode === 'out' || vent.mode === 'in')) {
      ventHold = eHeld && eDownAt >= 0 ? elapsed - eDownAt : 0;
      let speed = null;
      if (eTapped) speed = 'fast';
      else if (ventHold >= VENT.slowHold) { speed = 'slow'; eDownAt = -1; ventHold = 0; }
      if (speed && vent.mode === 'out') {
        if (vent.canEnter(grate, alien.pos)) ventIn(grate, speed);
        else ventRefused = 2;
      } else if (speed) ventOut(speed);
    } else ventHold = 0;
    eTapped = false;
    if (!vent.inside) {
      if (wasInside) ventDone();
      return grate;
    }
    const k = player.keys;
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    for (const n of vent.update(dt, { fwd, acted })) {
      audio.play2D(Math.random() < 0.15 ? 'ventPop' : 'crawlThud', { volume: 0.45, rate: 0.9 + Math.random() * 0.2 });
      ventNoise(n);
    }
    if (player.flashClicked) {
      player.flashClicked = false;
      ventNoise({ ...ventPoint(vent.vent, vent.s), loudness: LOUDNESS.flashlight });
    }
    // Any movement or sound while it listens at this vent's grate: it tears the cover off.
    if (!vent.still && alien.listenGrate?.vent === vent.vent) alien.ventNoise();
    if (!vent.inside) { ventDone(); return grate; }
    // The camera, low in the duct, looking within limits.
    const v = vent.view();
    player.yaw = clampYaw(player.yaw, v.yaw);
    player.pitch = Math.max(-0.6, Math.min(v.nearGrate?.kind === 'floor' ? 1.35 : 0.6, player.pitch));
    player.pos.x = v.x; player.pos.z = v.z;
    rig.set(v.x, v.y, v.z, player.yaw, player.pitch);
    rig.fovScale = 1 - VENT.fovNarrow / ((70 * Math.PI) / 180);
    $('slats').hidden = !lookingOut(v.nearGrate, rig.forward(fwdVec));
    // Now and then, something taps further along a duct. It's never anything.
    if (vent.vent.kind === 'duct' && (tapTimer -= dt) <= 0) {
      tapTimer = 25 + Math.random() * 35;
      const p = ventPoint(vent.vent, vent.s + vent.facing * (4 + Math.random() * 4));
      audio.playAt('ventTap', { x: p.x, y: p.y + 0.3, z: p.z }, { volume: 0.35, ref: 1.5, bus: 'clear' });
    }
    return grate;
  }
  const fwdVec = { x: 0, y: 0, z: 0 };

  function ventIn(grate, speed) {
    const n = vent.enter(grate, speed);
    player.frozen = true;
    player.yaw = vent.view().yaw; // inside, you face out through the cover (or along the duct)
    player.pitch = 0;
    tapTimer = 20 + Math.random() * 30;
    audio.playAt(n.sound, { x: n.x, y: 0.4, z: n.z }, { volume: speed === 'fast' ? 1.3 : 0.8, ref: 2, bus: 'clear' });
    audio.setInVent(true);
    noiseLevel = Math.max(noiseLevel, n.loudness);
    ventHeard(n, grate);
  }

  function ventOut(speed) {
    const n = vent.leave(speed);
    if (!n) return;
    audio.playAt(n.sound, { x: n.x, y: 0.4, z: n.z }, { volume: speed === 'fast' ? 1.3 : 0.8, ref: 2, bus: 'clear' });
    noiseLevel = Math.max(noiseLevel, n.loudness);
    makeNoise({ x: n.x, z: n.z }, n.loudness); // you're out: an ordinary noise now
  }

  // Back out in the room: stand up by the grate.
  function ventDone() {
    const g = vent.grate;
    player.frozen = false;
    rig.fovScale = 1;
    $('slats').hidden = true;
    audio.setInVent(false);
    if (g.kind === 'wall') {
      player.pos.x = g.x + g.inward[0] * 0.7; player.pos.z = g.z + g.inward[1] * 0.7;
      player.yaw = Math.atan2(-g.inward[0], -g.inward[1]) + Math.PI; // facing into the room
      player.eye = 0.5;
    } else {
      player.pos.x = g.x; player.pos.z = g.z;
      player.eye = 0.2;
    }
  }

  // A noise you made in a vent (crawling, the flashlight): if it hears, it comes to the nearest grate.
  function ventNoise(n) {
    noiseLevel = Math.max(noiseLevel, n.loudness);
    ventHeard(n, nearestGrate(vent.vent, vent.s).grate);
  }
  function ventHeard(n, grate) {
    if (alien.dormant > 0) return;
    const heard = heardLoudness(layout, { x: n.x, z: n.z, loudness: n.loudness }, alien.pos, isDoorClosed);
    if (heard >= Math.hypot(n.x - alien.pos.x, n.z - alien.pos.z)) alien.hearVent(grate);
  }

  // Stepping into a wellness suite: Marigold's line at the door, and your eyes adjusting to the light
  // (exposure from 0.6 to 1.0 of normal over 1.5 s). In Suite B she comments if you get close to the wall.
  function updateSuite(dt) {
    const suite = inSuite(layout, player.pos);
    if (suite !== suiteNow) {
      // Leaving: anything she was about to say about the room no longer makes sense outside it.
      if (suiteNow && !suite) intercom.queue = intercom.queue.filter((l) => !l.suite);
      suiteNow = suite;
      audio.setInSuite(suite !== null); // nothing of the alien in here, and the station muffled
      if (suite) {
        exposureK = 0.6;
        saidGraffiti = false;
        if (elapsed - lastDoorLine[suite] > DOOR_LINE_GAP) {
          lastDoorLine[suite] = elapsed;
          intercom.say(alien.state === 'hunt' ? LINES.suiteHunt : LINES.suiteDoor[suite], { suite: true, priority: true });
        }
      }
    }
    if (exposureK < 1) {
      exposureK = Math.min(1, exposureK + (dt * 0.4) / 1.5);
      view.setExposureScale?.(exposureK);
    }
    if (suite === 'quiet' && !saidGraffiti && Math.abs(player.pos.x - graffiti.x) < GRAFFITI_RANGE) {
      saidGraffiti = true;
      intercom.say(LINES.graffiti, { suite: true });
    }
  }

  function update(dt) {
    elapsed += dt;
    nagTimer -= dt;

    const step = player.update(dt, elapsed);
    if (step) {
      audio.footstep(step.mode);
      makeNoise(player.pos, step.loudness * activeNoise.maskAt(player.pos.x, player.pos.z)); // a Buzz Pod covers them
    }
    // Something you're aiming at (a terminal, door, pickup) beats a grate you happen to be beside:
    // look down at the grating, or at the low vent, to use that instead.
    const aimed = vent.inside ? null : findTarget(rig, world.interactables);
    ventGrate = updateVent(dt, aimed);
    if (state !== 'playing') return; // caught in a vent
    if (player.flashClicked) {
      player.flashClicked = false;
      makeNoise(player.pos, LOUDNESS.flashlight);
    }

    // What you're looking at (nothing while you're in a vent, or at a grate: E is for the grate).
    const target = vent.inside || ventGrate ? null : aimed;
    let repairing = false;
    // E with nothing to use (and no grate) skips to the next line of dialogue.
    if (ePressed && (!target || target.kind === 'console') && !ventGrate && !vent.inside) skipDialogue();
    if (target) {
      if (ePressed && target.kind !== 'repair' && target.kind !== 'console') press(target);
      // Rapid taps force the repair: faster, and a loud clank with every tap.
      if (ePressed && target.kind === 'repair' && progress[target.id] < 1 && canRepair(target.id)) {
        repairTaps.push(elapsed);
        while (repairTaps.length && elapsed - repairTaps[0] > 1) repairTaps.shift();
        if (forcing(repairTaps, elapsed)) { forceUntil = elapsed + REPAIR.tap.window; clank(target, 'tap'); }
      }
      const forced = elapsed < forceUntil;
      if ((eHeld || forced) && target.kind === 'repair' && progress[target.id] < 1) repairing = repair(target, dt, forced ? 'tap' : 'hold');
    }
    ePressed = false;
    repairingNow = repairing;
    if (!repairing) pulseTimer = 0;
    if (state !== 'playing') return; // the pod repair can end the game

    throwables.update(dt, elapsed, (pos, type, item) => {
      audio.playAt(type === 'echo' ? 'clatter' : type === 'shard' ? 'tick' : 'thud', pos, { volume: 0.9 });
      activeNoise.place(type, item.ball.position); // follows it if it rolls
      if (type === 'buzz') audio.playAt('buzz', item.ball.position, { volume: 0.9, loop: true, duration: NOISEMAKERS.buzz.life, ref: 3 });
    });
    // Each landed noise-maker goes off on its own schedule; the alien takes them as lures.
    for (const n of activeNoise.update(dt)) {
      if (makeNoise(n, n.loudness, 'decoy').heard) n.item.heard = true;
      if (n.type === 'echo') audio.playAt('clicks', n, { volume: 0.9, rate: 1.6, duration: 0.9 });
      else if (n.type === 'shard') audio.playAt('ring', n, { volume: 1.1, ref: 4 });
    }

    // The first lure that runs out unheard gets a comment (Buzz Pods mask footsteps; they don't count).
    for (const it of activeNoise.drainEnded()) {
      if (!it.heard && it.type !== 'buzz' && !saidWasted) { saidWasted = true; intercom.say(LINES.wasted); }
    }

    tapes.update(dt);

    // The alien.
    const d = Math.hypot(alien.pos.x - player.pos.x, alien.pos.z - player.pos.z);
    const safe = inSafeRoom();
    const hidden = vent.inside; // in a vent it can't see you or reach you; only tear the cover off
    const canSee = !hidden && alien.dormant <= 0 && !safe &&
      inSight(alien, player.pos, { moving: player.moving, lit: player.flashlightOn }) &&
      lineClear(layout, alien.pos, player.pos, isDoorClosed);
    alien.update(dt, {
      canSee,
      player: player.pos,
      isDoorClosed,
      openDoor: (x, z) => world.setDoor(world.doorAt(x, z), false),
    });
    handleAlienEvents();
    const hunting = alien.state === 'hunt';
    if (hunting !== wasHunting) { audio.cutHum(hunting); wasHunting = hunting; }
    revealTimer = Math.max(0, revealTimer - dt);
    view.alien.setReveal(revealTimer / 1.2);
    view.alien.update(alien, elapsed);
    audio.update(dt, { alienDist: alien.dormant > 0 ? 99 : d, alienMoving: alien.moving, alienState: alien.state });
    if (state !== 'playing') return; // caught at a grate
    if (!hidden && alien.dormant <= 0 && !safe && d < CATCH_DIST) { caught(); return; }
    updateSuite(dt);

    tricks.update(dt);
    hatman.update(dt, {
      stage, elapsed, player: player.pos,
      inSuite: suiteNow !== null || vent.inside,
      blocked: alien.state === 'hunt' || !!tricks.active || phantoms.busy,
    });
    phantoms.update(dt, {
      elapsed, player: player.pos, eye: rig.position, forward: rig.forward(fwd), alien: alien.dormant > 0 ? null : alien.pos,
      inSafe: suiteNow !== null || inSafeRoom() || vent.inside,
      blocked: alien.state === 'hunt' || !!tricks.active || hatman.busy,
      dark: hatman.dark,
    });
    if (hatman.dark) rig.flashlight = 0; // the flashlight dies with the power
    intercom.update(dt);
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').hidden = true;

    drawHud(dt, target, repairing);
  }

  function drawMap(dt) {
    // Reveal a few times a second, and straight away when you step into a new cell.
    const cell = cellOf(player.pos.x) + ',' + cellOf(player.pos.z);
    exploreTimer -= dt;
    if (!vent.inside && (exploreTimer <= 0 || cell !== lastCell)) {
      exploreTimer = 0.25;
      lastCell = cell;
      revealAround(layout, explored, player.pos, isDoorClosed);
    }
    mapTimer -= dt;
    if (mapTimer > 0 || $('map').hidden) return;
    mapTimer = 0.1;
    minimap.draw({
      player, explored, terminals, loreRead, stage, gotCrate: !crateLeft.length, pickups: [...pickupsLeft.values()],
      grates: vents.flatMap((v) => v.grates),
      doors: world.doors,
      time: elapsed,
    });
  }

  function drawHud(dt, target, repairing) {
    drawMap(dt);
    const room = layout.roomAt(cellOf(player.pos.x), cellOf(player.pos.z));
    $('location').textContent = vent.inside ? (vent.vent?.kind === 'duct' ? 'Duct' : 'Vent') + ' · HIDING' : room ? room.name + (room.safe ? ' · SAFE' : '') : layout.isSafe(cellOf(player.pos.x), cellOf(player.pos.z)) ? 'Hatch · SAFE' : 'Corridor';
    $('lore').textContent = `LORE ${loreRead.size}/${LORE_TOTAL}`;
    $('objective').textContent = stage < 3 ? OBJECTIVES[ORDER[stage]] : '';
    $('checklist').innerHTML = ORDER.map((id, i) =>
      `<li class="${i < stage ? 'done' : i === stage ? 'now' : ''}">${['Main power', 'Rescue call', 'Escape pod'][i]}</li>`).join('');

    noiseLevel = Math.max(0, noiseLevel - 12 * dt);
    $('noise-bar').style.width = `${Math.min(100, (noiseLevel / 14) * 100)}%`;
    $('noise-bar').classList.toggle('loud', noiseLevel >= 10);
    $('stamina-bar').style.width = `${player.stamina * 100}%`;
    $('stamina-bar').classList.toggle('tired', player.exhausted);
    // Noise-makers: each kind and how many, the one Q throws in brackets.
    $('decoys').textContent = inventory.found
      ? TYPES.map((t) => { const s = `${NOISEMAKERS[t].short} ×${inventory.counts[t]}`; return t === inventory.selected ? `[${s}]` : s; }).join(' · ') + `   Q throw · ${DEBUG ? 'wheel' : '1-3'} choose · ${inventory.total}/${MAX_CARRY}`
      : '';
    $('mode').textContent = player.mode === 'crouch' ? 'CROUCHED' : player.mode === 'sprint' ? 'SPRINTING' : '';

    let prompt = '';
    if (target) {
      if (target.kind === 'door') prompt = `[E] ${target.door.closed ? 'Open' : 'Close'} door`;
      else if (target.kind === 'repair') {
        if (progress[target.id] >= 1) prompt = 'Done';
        else if (!canRepair(target.id)) prompt = target.id === 'pod' && stage < 2 ? 'Needs main power and a rescue call' : 'Needs main power';
        else prompt = elapsed < forceUntil ? `Forcing it… (loud)` : `[Hold E] ${target.label} · [Tap E fast] Force it (louder)`;
      } else if (target.kind === 'log') {
        prompt = tapes.id === target.id ? '[E] Stop tape' : `[E] Play tape${loreRead.has(target.id) ? ' (heard)' : ''}`;
      } else if (target.kind === 'console') prompt = target.label; // set dressing: nothing to do
      else prompt = `[E] ${target.label}`;
    }
    // Vents: what E does at a grate, and the hold bar for slipping through quietly.
    if (ventRefused > 0) prompt = 'Too close to it';
    else if (ventGrate) prompt = vent.inside ? '[Tap E] Climb out fast · [Hold E] Climb out quietly' : '[Tap E] Dive in · [Hold E] Slip in quietly';
    else if (vent.inside) prompt = vent.vent?.kind === 'duct' ? '[W/S] Crawl · keep still to stay hidden' : 'Keep still';
    else if (grateAt(vents, player.pos, true)?.kind === 'wall') prompt = '[C] Crouch to use the vent';
    $('prompt').textContent = prompt;
    const holding = ventGrate && ventHold > VENT.tapMax;
    const showBar = holding || (target && target.kind === 'repair' && progress[target.id] > 0 && progress[target.id] < 1);
    $('progress').hidden = !showBar;
    if (holding) $('progress-bar').style.width = `${Math.min(1, ventHold / VENT.slowHold) * 100}%`;
    else if (showBar) $('progress-bar').style.width = `${progress[target.id] * 100}%`;
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
    world.update(state === 'playing' || state === 'title' ? dt : 0, performance.now() / 1000, alien.dormant > 0 ? null : alien, player.pos);
    if (state === 'title') {
      // Slow look around the airlock behind the title screen.
      player.yaw = Math.sin(now / 6000) * 0.6;
      rig.yaw = player.yaw;
      rig.pitch = 0;
    }
    audio.tick();
    view.render(rig);
  }
  requestAnimationFrame(frame);

  addEventListener('resize', () => view.resize());

  // Dev switch for exploring: station9.alienOff = true keeps the alien asleep and out of sight
  // (everything that hears, sees or catches already skips a dormant alien). Remembered across
  // reloads; ?noalien in the URL turns it on too. The HUD shows a tag while it's on.
  const ALIEN_OFF_KEY = 'station9.dev.alienOff';
  let alienOff = false;
  function setAlienOff(on, { save = true, quiet = false } = {}) {
    alienOff = on;
    if (on) {
      alien.toPatrol(); // drop any chase it was in
      alien.dormant = Infinity;
      audio.stopAlienClicks();
    } else if (alien.dormant === Infinity) {
      alien.dormant = 0.001; // wakes next frame, with the usual 'wake' sound
    }
    view.alien.setVisible(!on);
    $('dev-tag').hidden = !on;
    if (save) { try { localStorage.setItem(ALIEN_OFF_KEY, on ? 'on' : 'off'); } catch { /* private window */ } }
    if (!quiet) console.info(on ? 'Alien off (dev). station9.alienOff = false to bring it back.' : 'Alien back on.');
  }
  {
    let saved = false;
    try { saved = localStorage.getItem(ALIEN_OFF_KEY) === 'on'; } catch { /* private window */ }
    const fromUrl = new URLSearchParams(location.search).has('noalien');
    if (saved || fromUrl) setAlienOff(true, { save: false, quiet: true });
    if (alienOff) console.info('Alien off (dev). station9.alienOff = false to bring it back.');
  }

  // Handy for debugging in the browser console.
  window.station9 = {
    alien, player, world, layout, hatman, tricks, apparitions: phantoms, screens: view.screens, progress, loreRead, explored, tapes, audio, intercom, vent, vents, decor: world.decor,
    renderer: view.renderer, view, rig, engine: view.name, inventory, activeNoise, throwables,
    get lore() { return lore; }, get state() { return state; }, get stage() { return stage; },
    get alienOff() { return alienOff; }, set alienOff(v) { setAlienOff(!!v); },
  };
}
