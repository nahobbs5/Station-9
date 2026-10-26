// Parsers for the editable text files in text/. No engine, so tests can use them.
// In both files, lines starting with # are comments.

const lines = (src) => src.replace(/\r\n?/g, '\n').split('\n');

// intro.txt: one spoken line per line of text. Blank lines are ignored.
export function parseIntro(src) {
  return lines(src).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

// lore.txt: each entry starts with "=== t01: Title", then "key: value" lines,
// a blank line, and the body text (which can have several paragraphs).
// Optional keys: "voice: pitch 0.8, rate 0.95" and "audio: tapes/t03.mp3".
export function parseLore(src) {
  const entries = [];
  let cur = null, inBody = false;
  for (const raw of lines(src)) {
    if (raw.startsWith('#')) continue;
    const head = raw.match(/^===\s*(\w+)\s*:\s*(.*)$/);
    if (head) {
      cur = { id: head[1], title: head[2].trim(), body: [] };
      entries.push(cur);
      inBody = false;
      continue;
    }
    if (!cur) continue;
    const field = !inBody && raw.match(/^(room|author|date|voice|audio)\s*:\s*(.*)$/i);
    if (field) cur[field[1].toLowerCase()] = field[2].trim();
    else if (!inBody && raw.trim() === '') inBody = true;
    else if (inBody) cur.body.push(raw);
  }
  return entries.map(({ body, ...e }) => {
    const out = { ...e, text: body.join('\n').trim() };
    if (e.voice) out.voice = parseVoice(e.voice);
    return out;
  });
}

// "pitch 0.8, rate 0.95" -> { pitch: 0.8, rate: 0.95 }
function parseVoice(src) {
  const v = {};
  for (const [, k, n] of src.matchAll(/(pitch|rate)\s*[:=]?\s*([\d.]+)/gi)) v[k.toLowerCase()] = Number(n);
  return v;
}

// Who's talking: "Dr. Imani Okafor, lead physicist" -> "Imani".
export function speakerOf(author = '') {
  return author.split(',')[0].replace(/^Dr\.\s*/, '').trim().split(/\s+/)[0] || 'Unknown';
}

// An entry as a tape: one { speaker, text } per sentence. A paragraph that starts with
// "Name: " (a name from `speakers`) is spoken by that person.
export function tapeScript(entry, speakers = []) {
  const main = speakerOf(entry.author);
  const out = [];
  for (const para of entry.text.split(/\n\s*\n/)) {
    let speaker = main, text = para.replace(/\s+/g, ' ').trim();
    const m = text.match(/^([A-Z][a-z]+):\s+(.*)$/);
    if (m && speakers.includes(m[1])) { speaker = m[1]; text = m[2]; }
    for (const sentence of text.match(/[^.!?]+(?:[.!?]+["\u201d\u2019']?|$)/g) ?? []) {
      if (sentence.trim()) out.push({ speaker, text: sentence.trim() });
    }
  }
  return out;
}
