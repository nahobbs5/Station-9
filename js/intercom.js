// Marigold, the station wellness assistant: warm, polite, and always sparing you worry.
// Subtitles always show; speech synthesis reads them when the browser supports it.

export const LINES = {
  // The opening announcements are read from text/intro.txt; these are used only if it fails to load.
  intro: [
    'Welcome to Station 9! Your wellness is our waypoint.',
    'Good news, Technician: you are the only member of staff currently on board. That makes you employee of the month.',
    'Your goals: restore power in the Generator Room, call for rescue from Comms, then prepare an escape pod.',
    'Staff terminals are available throughout the station. Reading is quiet, and entirely optional.',
    'And please, walk. Running is loud. Loud is... discouraged.',
  ],
  power: 'Main power restored! The station is now forty percent brighter. So are you.',
  comms: 'Rescue call sent. A shuttle will arrive in approximately... soon. Please proceed to the Escape Pod Bay. Your labor is our freedom.',
  hunt: 'Please stay calm. A wellness check is on its way to you.',
  crate: 'A noise-maker! Throw it with Q to redirect unwanted attention. Attention is our most precious resource. Please do not waste it.',
  nm_echo: 'Echo Seed. It rolls, and then it chatters. It sounds like someone you used to know.',
  nm_shard: 'Resonance Shard. One clear note that carries a very long way. Use it far from yourself.',
  nm_buzz: 'Buzz Pod. It hums for a while and covers your footsteps nearby. Like a good colleague.',
  handsFull: 'Your hands are full. Three noise-makers is the safe limit. We checked.',
  hatman: 'Please disregard any colleagues you may see in the corridors. Everyone is fine.',
  // The wellness suites (reference files/wellness rooms.md). Inside, Marigold speaks only at the door.
  suiteDoor: {
    wellness: 'Welcome to your wellness suite. Please take a seat.',
    quiet: 'You seem tired. Rest is available.',
  },
  suiteHunt: 'Please stay where you are. This is the safest place in the station.',
  graffiti: 'That wall will be cleaned soon.',
  needPower: 'That system requires main power. Safety first!',
  needComms: 'Pod launch requires a confirmed rescue window. Please contact Comms first.',
  noDecoys: 'You are out of noise-makers. Supplies are limited. Supplies have always been limited.',
  door: (n) => `Door ${n} is open for your convenience.`,
  caught: 'Technician status: reassigned. Thank you for your contribution. Your labor is our freedom.',
  win: 'Safe travels, Technician. Your labor is our freedom.',
  // Read all twelve terminals and Marigold reads a roll call instead.
  winAll: [
    'Tomas. Imani. Lena. Priya. Wes. Jun. Ada. Sam. All present.',
    'Technician. You are not on the list. Please stay.',
  ],
};

export class Intercom {
  constructor(el) {
    this.el = el;
    this.queue = [];
    this.timer = 0;
    this.voice = true;
    this.talking = false; // speech for the current line hasn't finished yet
    this.tape = null;     // the tape player, so we take turns speaking
    this.muted = () => false; // true while you're in a wellness suite: only { suite: true } lines get through
  }

  // Marigold has a line queued or is still saying one.
  get busy() { return this.queue.length > 0 || this.talking; }

  say(text, { priority = false, suite = false } = {}) {
    if (this.muted() && !suite) return;
    if (priority) {
      this.queue = [];
      this.timer = 0;
      this.tape?.interrupt(); // the tape repeats its sentence afterwards
      this.talking = false;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
    this.queue.push({ text, suite });
  }

  update(dt) {
    // Some browsers never report the end of speech; don't let that block tapes for good.
    if (this.talking && (this.talkLimit -= dt) <= 0) this.talking = false;
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.el.hidden = true;
      return;
    }
    // Let a tape finish its sentence before speaking over it.
    // Lines queued before you stepped into a suite are dropped there, unless they're the suite's own.
    if (this.muted()) this.queue = this.queue.filter((l) => l.suite);
    if (this.queue.length && !(this.voice && this.tape?.speaking)) this.show(this.queue.shift().text);
  }

  show(text) {
    this.el.textContent = text;
    this.el.hidden = false;
    this.timer = Math.max(3.5, text.length * 0.07) + 0.5;
    if (!this.voice || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.pitch = 0.6 + Math.random() * 0.2; // never quite the same voice twice
    u.rate = 0.95;
    u.volume = 0.8;
    this.talking = true;
    this.talkLimit = this.timer + 4;
    u.onend = u.onerror = () => { this.talking = false; };
    speechSynthesis.speak(u);
  }

  // Skip the line showing now: it stops, and the next queued line (if any) comes straight up.
  skip() {
    if (this.timer <= 0) return false;
    this.timer = 0;
    this.el.hidden = true;
    this.talking = false;
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    return true;
  }

  stop() {
    this.queue = [];
    this.talking = false;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}
