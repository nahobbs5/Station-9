// Audio logs: each terminal plays its lore entry as a tape you can listen to while you move.
// Voices come from the browser's speech synthesis, one sentence at a time with a caption.
// An entry with an "audio:" file plays that recording instead.
import { tapeScript, speakerOf } from './textfiles.js';

// Starting voice settings per speaker. A "voice:" line in text/lore.txt overrides the tape's speaker.
export const VOICES = {
  Vantora:  { pitch: 1.3,  rate: 1.05 }, // bright corporate
  Tomas:    { pitch: 0.85, rate: 1.05 }, // smooth
  Imani:    { pitch: 1.1,  rate: 0.9 },  // careful
  Lena:     { pitch: 1.0,  rate: 0.88 }, // dry
  Priya:    { pitch: 1.25, rate: 1.15 }, // quick
  Wes:      { pitch: 0.6,  rate: 0.9 },  // low
  Jun:      { pitch: 1.05, rate: 1.12 }, // anxious
  Ada:      { pitch: 1.15, rate: 1.0 },  // firm
  Sam:      { pitch: 0.95, rate: 0.98 }, // warm
  Marigold: { pitch: 0.7,  rate: 0.95 }, // the station voice
};
const SPEAKERS = Object.keys(VOICES);
const GAP = 0.35;  // pause between sentences
const LEAD_IN = 0.6; // after the clunk, before the first word

const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class TapePlayer {
  // el: { box, head, speaker, line } caption elements
  constructor({ audio, intercom, el }) {
    this.audio = audio;
    this.intercom = intercom;
    this.el = el;
    this.voice = true;
    this.entry = null;
    this.lines = [];
    this.i = 0;
    this.state = 'idle'; // idle | gap | speaking | file
    this.wait = 0;
    this.utter = null;
    this.file = null;
    intercom.tape = this;
  }

  get playing() { return this.entry !== null; }
  get id() { return this.entry?.id ?? null; }
  // True while a synthesized sentence (or a recording) is being spoken, so Marigold waits.
  get speaking() { return (this.state === 'speaking' && this.utter !== null) || this.state === 'file'; }

  play(entry) {
    this.stop(false);
    this.entry = entry;
    this.lines = tapeScript(entry, SPEAKERS);
    this.i = 0;
    this.el.head.textContent = `TAPE ${entry.id.slice(1)} · ${entry.title}`;
    this.el.speaker.textContent = '';
    this.el.line.textContent = '…';
    this.el.box.hidden = false;
    this.audio.tapeStart();
    if (entry.audio) this.playFile(entry.audio);
    else { this.state = 'gap'; this.wait = LEAD_IN; }
  }

  stop(click = true) {
    if (!this.entry) return;
    if (this.utter) { this.utter = null; speechSynthesis.cancel(); }
    if (this.file) { this.file.pause(); this.file = null; }
    this.entry = null;
    this.state = 'idle';
    this.el.box.hidden = true;
    if (click) this.audio.tapeStop();
  }

  // The game paused or resumed (speech synthesis is paused separately, for everyone).
  pause() { this.file?.pause(); }
  resume() { if (this.state === 'file') this.file?.play().catch(() => {}); }

  // Jump to the next sentence now (click or E): its caption shows and its voice starts at once.
  // On the last sentence, the tape ends. Returns true if there was a tape to skip.
  skip() {
    if (!this.entry) return false;
    if (this.state === 'file') {
      const f = this.file;
      const i = this.i + 1;
      if (i >= this.lines.length || !f?.duration) { this.stop(); return true; }
      f.currentTime = this.marks[i - 1] * f.duration; // where line i's share of the file begins
      this.i = i;
      this.caption(this.lines[i]);
      return true;
    }
    // While a sentence is being spoken, move past it. Between sentences, this.i already points
    // at the next one, so it's simply said straight away.
    if (this.state === 'speaking') {
      if (this.utter) { this.utter = null; speechSynthesis.cancel(); } // dropped first, so its onend can't advance again
      this.i++;
    }
    if (this.i >= this.lines.length) { this.stop(); return true; }
    this.say();
    return true;
  }

  // Marigold has something urgent: drop the current sentence and say it again afterwards.
  interrupt() {
    if (this.state !== 'speaking') return;
    this.utter = null;
    this.state = 'gap';
    this.wait = 0.5;
  }

  update(dt) {
    if (!this.entry) return;
    if (this.state === 'file') { this.updateFile(); return; }
    if (this.state === 'gap') {
      this.wait -= dt;
      // With voices on, take turns with Marigold.
      if (this.wait <= 0 && !(this.useVoice && this.intercom.busy)) this.say();
    } else if (this.state === 'speaking') {
      this.wait -= dt;
      if (this.wait <= 0) this.next(); // caption timer, or a stalled speech engine
    }
  }

  get useVoice() { return this.voice && canSpeak(); }

  say() {
    const line = this.lines[this.i];
    this.caption(line);
    this.state = 'speaking';
    const timed = Math.max(2.2, line.text.length * 0.065);
    if (!this.useVoice) { this.wait = timed; return; }
    this.wait = timed * 2 + 3; // safety net in case speech never reports back
    const u = new SpeechSynthesisUtterance(line.text);
    const v = { ...VOICES[line.speaker], ...(line.speaker === speakerOf(this.entry.author) ? this.entry.voice : null) };
    u.pitch = v.pitch ?? 1;
    u.rate = v.rate ?? 1;
    u.volume = 0.9;
    const voices = speechSynthesis.getVoices().filter((x) => x.lang?.startsWith('en'));
    if (voices.length && line.speaker !== 'Marigold') u.voice = voices[hash(line.speaker) % voices.length];
    u.onend = () => { if (this.utter === u) this.next(); };
    u.onerror = () => { if (this.utter === u) this.next(); };
    this.utter = u;
    speechSynthesis.speak(u);
  }

  next() {
    this.utter = null;
    this.i++;
    if (this.i >= this.lines.length) { this.stop(); return; }
    this.state = 'gap';
    this.wait = GAP;
  }

  caption(line) {
    this.el.speaker.textContent = line.speaker.toUpperCase() + ':';
    this.el.line.textContent = line.text;
  }

  // A recorded tape: captions move through the script in step with the file.
  playFile(url) {
    this.state = 'file';
    this.file = new Audio(url);
    this.file.volume = 0.9;
    this.file.onended = () => { if (this.state === 'file') this.stop(); };
    this.file.onerror = () => { // no file: fall back to the synthetic voice
      if (this.state !== 'file') return;
      this.file = null;
      this.state = 'gap';
      this.wait = LEAD_IN;
    };
    this.file.play().catch(() => this.file?.onerror());
    const total = this.lines.reduce((n, l) => n + l.text.length, 0);
    let acc = 0;
    this.marks = this.lines.map((l) => (acc += l.text.length) / total);
  }

  updateFile() {
    const f = this.file;
    if (!f || !f.duration) return;
    const t = f.currentTime / f.duration;
    const i = Math.min(this.lines.length - 1, this.marks.findIndex((m) => t <= m));
    if (i >= 0 && i !== this.i) { this.i = i; this.caption(this.lines[i]); }
    if (this.i === 0 && this.el.line.textContent === '…') this.caption(this.lines[0]);
  }
}
