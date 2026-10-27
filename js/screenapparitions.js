// Computer screen apparitions (reference files/Station 9 Computer Apparition Reference Board.png):
// "Brief, unsettling encounters" on the console monitors. One plays on a monitor you're facing,
// a few metres away: the feed is normal, picks up interference, starts to glitch, the figure peaks
// through heavy static, then it breaks up and the screen goes back to what it was.
// They share js/apparitions.js's queue (one at a time, never in a safe room, the menu setting).
// No engine here; js/babylon/screens.js draws them from the art in assets/screens/.
import { cellOf } from './layout.js';
import { inSuite } from './suiteplan.js';
import { propPlacement } from './worldplan.js';

// Keys are 'screen-<art>'. life: seconds (the board says 0.5-3; at least 2, so you can see them). weight: how likely it's picked
// when a monitor is in view (low, so screens stay a minority and some stay rare).
export const SCREEN_KINDS = {
  'screen-hatman':     { art: 'hatman',     life: 2.2, weight: 0.35 },
  'screen-gasmask':    { art: 'gasmask',    life: 2.6, weight: 0.4, sound: 'breath', volume: 0.3 },
  'screen-patient':    { art: 'patient',    life: 2.6, weight: 0.4 },
  'screen-astronaut':  { art: 'astronaut',  life: 2.0, weight: 0.35 },
  'screen-child':      { art: 'child',      life: 2.0, weight: 0.25 },
  'screen-reflection': { art: 'reflection', life: 2.0, weight: 0.3 },
  'screen-shadow':     { art: 'shadow',     life: 2.0, weight: 0.35 },
  'screen-hanging':    { art: 'hanging',    life: 2.0, weight: 0.3 },
  'screen-crew':       { art: 'crew',       life: 3.0, weight: 0.4 },
  'screen-message':    { art: 'message',    life: 2.6, weight: 0.35 },
  'screen-empty':      { art: 'empty',      life: 3.0, weight: 0.3 },
  'screen-alien':      { art: 'alien',      life: 2.0, weight: 0.15 },
  'screen-face':       { art: 'feed-peak',  life: 2.2, weight: 0.25 }, // the board's "Apparition Peak" face
};
export const SCREEN_IDS = Object.keys(SCREEN_KINDS);
// The camera feed the monitor cuts to first, one picture per stage (the board's Static & Flicker Rules row).
export const FEEDS = ['feed-normal', 'feed-interference', 'feed-glitch', 'feed-fade'];
export const SCREEN_ARTS = [...new Set([...SCREEN_IDS.map((id) => SCREEN_KINDS[id].art), ...FEEDS])];

export const SCREEN = {
  near: 2,      // metres: closer than this and it's too obvious
  far: 9,       // metres: further and you'd miss it
  viewCos: Math.cos((35 * Math.PI) / 180), // within 35 degrees of where you look
  tooClose: 1.5, // walk up to it and it's gone ("may vanish when you look closer")
  // The board's Static & Flicker Rules, as fractions of the life.
  phases: [['normal', 0.15], ['interference', 0.3], ['glitch', 0.5], ['peak', 0.85], ['fade', 1]],
};

// The board's "Messages": fragmented text that flickers between phrases.
export const MESSAGES = ['YOUR LABOR IS OUR FREEDOM', 'LABOR IS FREEDOM', 'WE ARE STILL HERE', 'KEEP WORKING'];

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Every console monitor (the 12 tape terminals and the 6 for show, dead ones too), never in a safe
// room or suite. Each: { key (the prop id), x, y, z (the screen's centre), rotY (the way it faces),
// front: { x, z } (a point just clear of the desk, for line-of-sight checks) }.
export function consoleScreens(layout) {
  const out = [];
  for (const p of layout.props) {
    if (p.kind !== 'log' && p.kind !== 'console') continue;
    const { x, z, rotY } = propPlacement(layout, p);
    const fx = Math.sin(rotY), fz = Math.cos(rotY);
    // The screen: 0.045 m in front of the desk's centre, 1.12 m up (js/babylon/world.js makeConsole).
    const s = { key: p.id, x: x + fx * 0.045, y: 1.12, z: z + fz * 0.045, rotY, front: { x: x + fx * 1.05, z: z + fz * 1.05 } };
    if (layout.isSafe(cellOf(s.x), cellOf(s.z)) || inSuite(layout, s) !== null) continue;
    if (layout.room(p.room)?.safe) continue;
    out.push(s);
  }
  return out;
}

// Does this monitor face you? (You're on its screen side.)
const facesYou = (s, p) => Math.sin(s.rotY) * (p.x - s.x) + Math.cos(s.rotY) * (p.z - s.z) > 0;

// The nearest monitor that faces you, near..far away, within viewCos of where you look, in clear sight.
// loose: for a debug summon, any angle and up to 15 m.
export function pickScreen(screens, ctx, lineClear = () => true, { loose = false } = {}) {
  const f = ctx.forward, flen = Math.hypot(f.x, f.z) || 1;
  const far = loose ? 15 : SCREEN.far, near = loose ? 0.5 : SCREEN.near;
  let best = null, bestD = Infinity;
  for (const s of screens) {
    const d = dist(s, ctx.player);
    if (d < near || d > far || d >= bestD || !facesYou(s, ctx.player)) continue;
    if (!loose && ((s.x - ctx.player.x) * f.x + (s.z - ctx.player.z) * f.z) / (d * flen) < SCREEN.viewCos) continue;
    if (!lineClear(ctx.player, s.front)) continue;
    best = s; bestD = d;
  }
  return best;
}

// Which stage of the feed this is, by how far through its life (0-1).
export function phaseOf(k) {
  for (const [name, end] of SCREEN.phases) if (k < end) return name;
  return 'fade';
}

// What the feed looks like right now: the renderer just applies this.
// { art (0-1: how much of the figure shows), artId (which picture), grain, lines (rolling bars),
//   tear (0-1: torn horizontal strips), shift (px: red/green split), flicker (0-1 brightness dips),
//   repeat (show the last frame again), slide (-1..1: the picture's sideways offset), roll (0-1 vertical
//   roll), text (a phrase to scrawl on top, or null), blackout (the screen cuts out),
//   feed (the camera picture underneath, or null for the console's own screen), tint ('red', 'mono' or null) }
export function screenLook(id, k, rand = Math.random) {
  const kind = SCREEN_KINDS[id];
  const phase = phaseOf(k);
  const L = { art: 0, artId: kind.art, grain: 0.05, lines: 0.1, tear: 0, shift: 0, flicker: 0, repeat: false, slide: 0, roll: 0, text: null, blackout: false, feed: null, tint: null };
  // The monitor cuts to a corridor camera, which breaks down stage by stage; the console's own
  // screen shows for a beat before and comes back just before the end.
  if (k >= 0.05 && k < 0.92) L.feed = { normal: 'feed-normal', interference: 'feed-interference', glitch: 'feed-glitch', peak: 'feed-glitch', fade: 'feed-fade' }[phase];
  // Through the board's five stages.
  if (phase === 'interference') { L.grain = 0.18; L.lines = 0.35; L.flicker = 0.15; }
  if (phase === 'glitch') {
    L.grain = 0.3; L.lines = 0.5; L.tear = 0.35; L.flicker = 0.3; L.repeat = rand() < 0.15;
    L.art = rand() < 0.45 ? 0.3 + rand() * 0.4 : 0; // the figure flickers in
  }
  if (phase === 'peak') {
    L.grain = 0.45; L.lines = 0.5; L.tear = 0.45; L.flicker = 0.25; L.shift = 4 + rand() * 6;
    L.art = rand() < 0.1 ? 0.4 : 0.95;
    if (rand() < 0.08) L.tint = rand() < 0.5 ? 'red' : 'mono'; // a flash of colour shift
  }
  if (phase === 'fade') {
    const f = (k - 0.85) / 0.15;
    L.grain = 0.5 * (1 - f) + 0.05; L.tear = 0.6 * (1 - f); L.flicker = 0.5; L.repeat = rand() < 0.2;
    L.art = rand() < 0.35 ? 0.5 * (1 - f) : 0; // fragments and an afterimage
    L.blackout = f > 0.85 && rand() < 0.6;
  }

  switch (kind.art) {
    case 'hatman': // brief and flickering
      if (L.art) L.art = rand() < 0.3 ? 0.15 : L.art;
      break;
    case 'gasmask': // heavy static
      L.grain = Math.min(0.7, L.grain * 1.5);
      break;
    case 'patient': // frames from different times: the picture jumps about
      if (L.art && rand() < 0.3) { L.slide = (rand() - 0.5) * 0.4; L.repeat = true; }
      break;
    case 'astronaut': // only a few frames
      if (L.art) L.art = rand() < 0.5 ? 1 : 0;
      break;
    case 'child': // short, silent, at the end of the feed
      if (k < 0.55) L.art = 0;
      break;
    case 'shadow': // moves quickly across the feed, motion blur and static
      if (k >= 0.3) { L.art = Math.max(L.art, 0.85); L.slide = 1 - 2.4 * ((k - 0.3) / 0.7); L.tear = Math.max(L.tear, 0.4); }
      break;
    case 'hanging': // drips and flickers
      L.roll = L.art ? Math.sin(k * 40) * 0.015 : 0;
      break;
    case 'crew': // looks normal at first, then breaks up into glitches
      if (k >= 0.15 && k < 0.6) { L.art = 1; L.grain = 0.08; L.tear = 0; L.shift = 0; L.flicker = 0.05; }
      if (k >= 0.6 && k < 0.85) { L.tear = 0.8; L.shift = 10; L.art = rand() < 0.7 ? 1 : 0.2; }
      break;
    case 'message': // fragmented text flickering between phrases
      if (L.art || phase === 'peak') {
        L.art = rand() < 0.5 ? 0.9 : 0;
        L.text = L.art ? null : MESSAGES[Math.floor(rand() * MESSAGES.length)];
      }
      break;
    case 'empty': // normal at first, then a figure, then a rewind before it changes
      if (k >= 0.15 && k < 0.85) { L.art = 1; L.tear = Math.min(L.tear, 0.15); L.shift = 0; }
      if (k >= 0.5 && k < 0.62) { L.artId = 'crew'; L.art = 0.6; } // something in the room
      if (k >= 0.62 && k < 0.75) { L.roll = (k - 0.62) * 6; L.tear = 0.7; L.lines = 0.8; } // rewinding
      break;
    case 'feed-peak': // the face: red / green / monochrome colour shift all the way through
      // Its picture is already glitched, so go light on the rest or the face is lost.
      if (L.art) {
        L.art = 1; L.tear = Math.min(L.tear, 0.12); L.grain = Math.min(L.grain, 0.2); L.shift = 8 + rand() * 4;
        const c = rand(); L.tint = c < 0.25 ? 'red' : c < 0.45 ? 'mono' : null;
      }
      break;
    case 'alien': // rare, quick, strong static and tearing
      L.tear = Math.max(L.tear, 0.7); L.grain = Math.max(L.grain, 0.5); L.shift = Math.max(L.shift, 8);
      if (k > 0.2 && k < 0.85) L.art = rand() < 0.6 ? 1 : 0.3;
      break;
  }
  return L;
}
