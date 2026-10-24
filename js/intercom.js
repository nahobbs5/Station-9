// The station voice: a cheerful wellness assistant that is always slightly off.
// Subtitles always show; speech synthesis reads them when the browser supports it.

export const LINES = {
  intro: [
    'Good evening, operative! Welcome aboard Station 9, where tomorrow is brighter. Together.',
    'Wonderful news: you are the only living member of staff on board. That makes you employee of the month.',
    'Your goals: restore power in the Generator Room, call for rescue from Comms, then prepare an escape pod.',
    'And please, walk. Running is loud. Loud is... discouraged.',
  ],
  power: 'Main power restored! The station is now forty percent brighter. So are you.',
  comms: 'Rescue signal sent. A shuttle will arrive in approximately... soon. Please proceed to the Escape Pod Bay. Do not dawdle. Dawdling is how we lost the night shift.',
  firstHunt: 'Reminder: if you hear clicking, please remain calm. That is what we told the others, too.',
  crate: 'Noise-makers! Throw one with Q to redirect unwanted attention. Attention is our most precious resource.',
  hatman: 'Please disregard any colleagues you may see in the corridors. All staff are accounted for.',
  needPower: 'That system requires main power. Safety first!',
  needComms: 'Pod launch requires a confirmed rescue window. Please contact Comms first.',
  noDecoys: 'You are out of noise-makers. Storage has plenty. Storage has always had plenty.',
  caught: 'Operative status: discontinued. Thank you for your contribution to a brighter tomorrow.',
  win: 'Pod launched. Station 9 thanks you for your service. Your departure has been logged, and our guest has been informed.',
};

export const LOGS = {
  'log-control':
    'SHIFT LOG - DR. A. OYELARAN\n\nDemo day! The board is watching remotely. HR approved the volunteer list overnight, ' +
    'which is fast even for HR. Everyone smiled for the camera. Sunny the mascot did a little dance. ' +
    'We are going to make history.',
  'log-teleporter':
    'INCIDENT NOTE (UNSIGNED)\n\nSubject 4 arrived on the receiving pad. Correct mass. Correct shape, mostly. ' +
    'It said "good evening" in her voice. She was still standing on the sending pad when it said it.',
  'log-comms':
    'OUTBOX - 1 UNSENT MESSAGE\n\nIt does not see well. It LISTENS. Keep the doors shut and your feet soft. ' +
    'If you hear it click, it is about to move. If the station tells you something is safe, check anyway.',
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
