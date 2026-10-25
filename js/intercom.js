// Marigold, the station wellness assistant: warm, polite, and always sparing you worry.
// Subtitles always show; speech synthesis reads them when the browser supports it.

export const LINES = {
  intro: [
    'Welcome to Station 9! Your wellness is our waypoint.',
    'Good news, Technician: you are the only member of staff currently on board. That makes you employee of the month.',
    'Your goals: restore power in the Generator Room, call for rescue from Comms, then prepare an escape pod.',
    'Staff terminals are available throughout the station. Reading is quiet, and entirely optional.',
    'And please, walk. Running is loud. Loud is... discouraged.',
  ],
  power: 'Main power restored! The station is now forty percent brighter. So are you.',
  comms: 'Rescue call sent. A shuttle will arrive in approximately... soon. Please proceed to the Escape Pod Bay. Closer every day.',
  hunt: 'Please stay calm. A wellness check is on its way to you.',
  crate: 'Noise-makers! Throw one with Q to redirect unwanted attention. Attention is our most precious resource.',
  hatman: 'Please disregard any colleagues you may see in the corridors. Everyone is fine.',
  safeRoom: 'Welcome to a wellness room, Technician. Nothing can reach you in here. Please stay as long as you like.',
  needPower: 'That system requires main power. Safety first!',
  needComms: 'Pod launch requires a confirmed rescue window. Please contact Comms first.',
  noDecoys: 'You are out of noise-makers. Storage has plenty. Storage has always had plenty.',
  door: (n) => `Door ${n} is open for your convenience.`,
  caught: 'Technician status: reassigned. Thank you for your contribution. Closer every day.',
  win: 'Safe travels, Technician. Closer every day.',
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
  }

  say(text, { priority = false } = {}) {
    if (priority) {
      this.queue = [];
      this.timer = 0;
      if ('speechSynthesis' in window) speechSynthesis.cancel();
    }
    this.queue.push(text);
  }

  update(dt) {
    if (this.timer > 0) {
      this.timer -= dt;
      if (this.timer <= 0) this.el.hidden = true;
      return;
    }
    if (this.queue.length) this.show(this.queue.shift());
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
    speechSynthesis.speak(u);
  }

  stop() {
    this.queue = [];
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}
