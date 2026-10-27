// Draws the computer screen apparitions (js/screenapparitions.js) onto a console's own screen
// texture: its usual picture, then interference, tearing, colour splits and the figure from the
// board's art (assets/screens/<art>.png), as screenLook says. When it's over the screen goes back.
import { redraw } from './util.js';
import { SCREEN_ARTS, screenLook } from '../screenapparitions.js';

const W = 512, H = 320; // every console screen canvas (js/textures.js consoleScreen)
const FPS = 20;         // a CRT feed, not a smooth one
const MARKER = '"Permanent Marker", Impact, sans-serif';

export function makeScreenFeed(world) {
  const art = {};
  for (const id of SCREEN_ARTS) { const img = new Image(); img.src = `assets/screens/${id}.png`; art[id] = img; }
  document.fonts?.load(`48px ${MARKER}`).catch(() => {});

  const work = document.createElement('canvas');
  work.width = W; work.height = H;
  const g = work.getContext('2d');
  // A few frames of grain, drawn once and picked at random.
  const grain = [0, 1, 2].map(() => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 160;
    const n = c.getContext('2d'), d = n.createImageData(256, 160);
    for (let i = 0; i < d.data.length; i += 4) {
      const v = Math.random() * 255;
      d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255;
    }
    n.putImageData(d, 0, 0);
    return c;
  });

  let cur = null; // { feeds: [{ feed, base }], id, last }
  // The frame's randomness (tears, grain, flicker), replayed for every monitor in a room so they
  // all glitch together.
  let seed = 1;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // The picture fills the screen (cropped top and bottom), a little above centre for faces.
  function drawArt(img, alpha, slide, dx = 0) {
    if (!img.complete || !img.naturalWidth) return;
    const s = W / img.naturalWidth, h = img.naturalHeight * s;
    g.globalAlpha = alpha;
    g.drawImage(img, slide * W * 0.6 + dx, (H - h) * 0.4, W, h);
    g.globalAlpha = 1;
  }

  function draw(L, t, base) {
    g.globalCompositeOperation = 'source-over';
    if (L.blackout) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); return; }
    // Underneath: the camera feed, or the usual screen; rolled up the picture when the feed slips.
    const roll = ((L.roll % 1) + 1) % 1 * H;
    const under = L.feed && art[L.feed]?.naturalWidth ? art[L.feed] : base;
    g.drawImage(under, 0, -roll, W, H);
    if (roll) g.drawImage(under, 0, H - roll, W, H);
    // The figure: the feed cuts to a dark camera picture.
    if (L.art > 0) {
      const img = art[L.artId];
      g.fillStyle = `rgba(4,7,7,${Math.min(1, L.art * 1.2)})`;
      g.fillRect(0, 0, W, H);
      drawArt(img, L.art, L.slide);
      if (L.shift) { // red / green split
        g.globalCompositeOperation = 'lighter';
        drawArt(img, 0.22 * L.art, L.slide, L.shift);
        g.fillStyle = 'rgba(255,30,30,0.07)'; g.fillRect(0, 0, W, H);
        drawArt(img, 0.15 * L.art, L.slide, -L.shift);
        g.globalCompositeOperation = 'source-over';
      }
    }
    // Colour shift: a red cast, or drained to grey.
    if (L.tint === 'red') {
      g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgb(255,70,60)'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    } else if (L.tint === 'mono') {
      g.globalCompositeOperation = 'saturation'; g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'source-over';
    }
    if (L.text) {
      g.save();
      g.fillStyle = 'rgba(30,2,2,0.85)'; g.fillRect(0, 0, W, H);
      g.font = `52px ${MARKER}`; g.fillStyle = '#d0201a'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const words = L.text.split(' '), mid = Math.ceil(words.length / 2);
      const lines = words.length > 3 ? [words.slice(0, mid).join(' '), words.slice(mid).join(' ')] : [L.text];
      lines.forEach((line, i) => g.fillText(line, W / 2 + (r() - 0.5) * 8, H / 2 + (i - (lines.length - 1) / 2) * 62, W - 30));
      g.restore();
    }
    // Rolling bars.
    if (L.lines > 0) {
      g.fillStyle = `rgba(200,230,225,${0.08 * L.lines})`;
      for (let i = 0; i < 3; i++) g.fillRect(0, ((t * 90 + i * 113) % (H + 30)) - 15, W, 6 + i * 4);
    }
    // Torn strips: bands of the picture shoved sideways.
    const strips = Math.round(L.tear * 9);
    for (let i = 0; i < strips; i++) {
      const y = Math.floor(r() * H), h = 3 + Math.floor(r() * 26), dx = (r() - 0.5) * 120 * L.tear;
      g.drawImage(work, 0, y, W, h, dx, y, W, h);
    }
    // Grain.
    if (L.grain > 0) {
      g.globalAlpha = L.grain * 0.55;
      g.globalCompositeOperation = 'overlay';
      g.drawImage(grain[Math.floor(r() * grain.length)], -r() * 40, -r() * 30, W + 40, H + 30);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // Brightness dips.
    if (r() < L.flicker * 0.4) { g.fillStyle = `rgba(0,0,0,${0.3 + r() * 0.4})`; g.fillRect(0, 0, W, H); }
  }

  return {
    // Start one on this console, or on several at once (keys: prop ids), all in sync.
    show(keys, id) {
      if (cur) this.hide();
      const feeds = [keys].flat().map((k) => world.consoleFeed(k)).filter(Boolean)
        .map((feed) => ({ feed, base: feed.normal() }));
      if (!feeds.length) return;
      cur = { feeds, id, last: -1 };
      for (const f of feeds) f.feed.lit(true);
    },
    // k: how far through its life (0-1); t: seconds in.
    set(id, k, t) {
      if (!cur || t - cur.last < 1 / FPS) return;
      cur.last = t;
      const L = screenLook(id, k);
      if (L.repeat) return; // the last frame again
      const frameSeed = 1 + Math.floor(Math.random() * 2147483645);
      for (const f of cur.feeds) {
        seed = frameSeed;
        draw(L, t, f.base);
        redraw(f.feed.texture, work, { mirror: true });
      }
    },
    hide() {
      if (!cur) return;
      for (const f of cur.feeds) {
        redraw(f.feed.texture, f.feed.normal(), { mirror: true });
        f.feed.lit(false);
      }
      cur = null;
    },
  };
}
