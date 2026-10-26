// Starts the game (js/game.js) with the Babylon.js renderer (js/babylon/).
import { startGame } from './game.js';
import { createBabylonView } from './babylon/view.js';

// The console screens and posters are drawn with the page fonts, so give them a moment to load
// (at most 2 s) before building the station.
const fontsReady = Promise.all(['16px "Share Tech Mono"', '600 16px Oswald'].map((f) => document.fonts.load(f)));
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 2000))])
  .catch(() => {})
  .then(() => startGame(createBabylonView));
