// The three.js build (index.html). The game itself is in js/game.js; this only picks the renderer.
import { startGame } from './game.js';
import { createThreeView } from './three/view.js';

startGame(createThreeView);
