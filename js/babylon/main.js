// The Babylon.js build (babylon.html). Same game (js/game.js), different renderer.
import { startGame } from '../game.js';
import { createBabylonView } from './view.js';

startGame(createBabylonView);
