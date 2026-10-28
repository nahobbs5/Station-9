// Achievements: small one-off feats. Each is earned at most once a game; every one ever earned is
// remembered in localStorage, so the first time you get one it shows as NEW. No engine here.
export const ACHIEVEMENTS = [
  { id: 'rudeAwakening', name: 'Rude Awakening', text: 'Threw a noise-maker in the Cryosleep Bay.' },
  { id: 'scholar', name: 'Scholar', text: 'Listened to every terminal tape.' },
  { id: 'marathoner', name: 'Marathoner', text: 'Spent more than 40 seconds running.' },
  { id: 'coward', name: 'Coward', text: 'Spent more than 30 seconds hiding in a vent.' },
  { id: 'overHere', name: 'Over Here!', text: 'Distract the alien with a noise-making device.' },
  { id: 'notToday', name: 'Not Today', text: 'Escape the alien when it is within striking distance.' },
  { id: 'closeEnough', name: 'Close Enough', text: 'Remain within a dangerously short distance of the alien without being detected.' },
  { id: 'predatorPrey', name: 'Predator and Prey', text: 'Survive five consecutive hunts.' },
  { id: 'untouchable', name: 'Untouchable', text: 'Complete the game without being caught by the alien.' },
  { id: 'notAlone', name: "You're Not Alone", text: 'Discover a figure watching you through a window.' },
  { id: 'unreliableWitness', name: 'Unreliable Witness', text: 'Experience five different hallucinations.' },
  { id: 'collectiveDelusion', name: 'Collective Delusion', text: 'Encounter every type of apparition.' },
  { id: 'dontBlink', name: "Don't Blink", text: 'Maintain eye contact with an apparition until it disappears.' },
  { id: 'employeeWellness', name: 'Employee Wellness', text: 'Explore the psychiatric treatment room.' },
  { id: 'corporateCulture', name: 'Corporate Culture', text: 'Inspect ten pieces of corporate propaganda.' },
  { id: 'nothingToSee', name: 'Nothing to See Here', text: 'Find a concealed or restricted room.' },
  { id: 'safetyFirst', name: 'Safety First!', text: 'Die immediately after reading a safety notice.' },
  { id: 'meetingEmail', name: 'This Meeting Could Have Been an Email', text: 'Listen to an unnecessarily long corporate recording.' },
  { id: 'ignoranceBliss', name: 'Ignorance Is Bliss', text: 'Complete the game without reading a single optional terminal entry.' },
];
// Seconds, added up over a game: sprinting for Marathoner, inside vents and ducts for Coward.
export const MARATHON_TIME = 40;
export const COWARD_TIME = 30;
// Tuning for the newer ones (metres and seconds).
export const STRIKE_DIST = 2.2;   // Not Today: it was this close during a hunt, and you still got away
export const CLOSE_DIST = 3;      // Close Enough: this near it, unnoticed...
export const CLOSE_TIME = 5;      // ...for this long in a row
export const HUNT_STREAK = 5;     // Predator and Prey: hunts survived
export const WITNESS_KINDS = 5;   // Unreliable Witness: different apparitions in one game
export const POSTERS_NEEDED = 10; // Corporate Culture: propaganda posters inspected
export const SAFETY_WINDOW = 20;  // Safety First!: caught within this long of reading a notice
export const WELLNESS_TIME = 8;   // Employee Wellness: time spent inside the Quiet Room
export const STARE_TIME = 1;      // Don't Blink: still looking straight at it this long as it goes

// Collective Delusion: every type of apparition, counted across games. Screen versions and the
// Hat Man's reflection count as the figure they show.
export const APPARITION_TYPES = ['gasmask', 'patient', 'astronaut', 'child', 'shadow', 'crew', 'reflection', 'static', 'hanging', 'watcher', 'hatman'];
export function apparitionType(id) {
  if (id === 'hatman-cameo') return 'hatman';
  const base = id.startsWith('screen-') ? id.slice(7) : id;
  return APPARITION_TYPES.includes(base) ? base : null;
}
const SEEN_KEY = 'station9.apparitionsSeen';

// What you've seen: this game (any kind, screen ones separately) and ever (the types above).
export class ApparitionLog {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.run = new Set();
    this.ever = new Set();
    try { for (const id of JSON.parse(storage?.getItem(SEEN_KEY) ?? '[]')) this.ever.add(id); } catch { /* private window */ }
  }

  see(id) {
    this.run.add(id);
    const type = apparitionType(id);
    if (type && !this.ever.has(type)) {
      this.ever.add(type);
      try { this.storage?.setItem(SEEN_KEY, JSON.stringify([...this.ever])); } catch { /* private window */ }
    }
  }

  get allTypes() { return APPARITION_TYPES.every((t) => this.ever.has(t)); }
}
const KEY = 'station9.achievements';

export class Achievements {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.run = []; // earned this game, in order
    this.ever = new Set();
    try { for (const id of JSON.parse(storage?.getItem(KEY) ?? '[]')) this.ever.add(id); } catch { /* private window */ }
  }

  // Earn one. Returns { ...achievement, isNew } the first time this game, or null after that.
  earn(id) {
    const a = ACHIEVEMENTS.find((q) => q.id === id);
    if (!a) throw new Error(`Unknown achievement: ${id}`);
    if (this.run.includes(id)) return null;
    this.run.push(id);
    const isNew = !this.ever.has(id);
    this.ever.add(id);
    try { this.storage?.setItem(KEY, JSON.stringify([...this.ever])); } catch { /* private window */ }
    return { ...a, isNew };
  }

  // Names earned this game, for the end screens.
  get names() { return this.run.map((id) => ACHIEVEMENTS.find((q) => q.id === id).name); }
}
