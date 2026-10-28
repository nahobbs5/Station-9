// Achievements: small one-off feats. Each is earned at most once a game; every one ever earned is
// remembered in localStorage, so the first time you get one it shows as NEW. No engine here.
export const ACHIEVEMENTS = [
  { id: 'rudeAwakening', name: 'Rude Awakening', text: 'Threw a noise-maker in the Cryosleep Bay.' },
  { id: 'scholar', name: 'Scholar', text: 'Listened to every terminal tape.' },
  { id: 'marathoner', name: 'Marathoner', text: 'Spent more than 40 seconds running.' },
  { id: 'coward', name: 'Coward', text: 'Spent more than 30 seconds hiding in a vent.' },
];
// Seconds, added up over a game: sprinting for Marathoner, inside vents and ducts for Coward.
export const MARATHON_TIME = 40;
export const COWARD_TIME = 30;
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
