# Station 9

A small first-person horror game that runs in the browser. You repair a failing research station while something that came through a botched teleport hunts you by sound.

**Play:** https://nahobbs5.github.io/Station-9/ (once GitHub Pages is turned on, see below)

## How to play

Restore main power in the Generator Room, send a rescue call from Comms, then prep the escape pod. The alien can barely see, but it hears everything.

| Key | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse | Look |
| Shift | Sprint (loud, uses stamina) |
| C | Crouch (quiet, slow) |
| E | Use, or hold to repair |
| F | Flashlight (it can only see you if you're moving or lit, and the click is a small noise) |
| Q | Throw a noise-maker (pick them up in Storage) |
| M | Show or hide the minimap (it only shows what you've seen) |
| T | Stop the audio log that's playing |
| Esc | Pause |

Tips: every state sounds different. Slow clicks mean it's patrolling, quick clicks and a murmur mean it's investigating, and when the hum cuts out and the clicking stops, it's about to hunt. Closed doors slow it down and muffle your noise. A noise-maker thrown away from you pulls it off your trail. Teal hatches lead to two safe rooms it can never enter.

**Bonus:** twelve staff terminals play audio logs that tell the station's story. They play in your earpiece, so you can keep moving while you listen. Each one you play adds to your score, and hearing all twelve changes the ending.

## Run it locally

No build step. Any static file server works:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Opening `index.html` straight from disk won't work, because browsers block ES modules and audio loading from `file://`.

Run the logic tests (pathfinding, noise, alien states) with Node 18+:

```sh
npm test
```

## Publish on GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages**, set **Source** to "Deploy from a branch", then pick `main` and `/ (root)`.
3. Wait a minute. The game will be at `https://<user>.github.io/Station-9/`.

## Engine

The game is drawn with [Babylon.js](https://www.babylonjs.com) 9.28, loaded from a CDN. Add `?inspect` to the URL to open Babylon's Inspector for tuning lights and materials.

**Graphics: High / Low** (start menu, remembered between visits). High adds reflections from a real industrial room (a CC0 HDRI), flashlight shadows, ambient occlusion, bloom, film grain, a vignette and dust in the air. Low turns the expensive parts off. Add `?fps` to the URL for a frame-rate readout. Third-party assets and their licences are listed in `assets/LICENSES.md`. Overall brightness is set by `TUNING` at the top of `js/babylon/util.js`.

Everything except drawing is engine-free (game rules, alien, tapes, HUD, minimap, sound, level layout), and the engine-specific code lives in `js/babylon/`. An earlier three.js build is in the git history.

## How it's built

Plain JavaScript modules and canvas-drawn textures, with Babylon.js loaded from a CDN, plus the sounds in `sound_effects/` and the title theme in `music/`. Every audio file is listed on the in-game Credits screen (`js/credits.js`).

**Game (engine-free)**

| File | What it does |
| --- | --- |
| `js/game.js` | The game: objectives, alien events, tapes, score, HUD, screens and the main loop |
| `js/layout.js` | The station map: rooms (some octagonal), corridors (some curved), doors, props, consoles, line-of-sight |
| `js/shape.js` | The walkable space as a smooth shape, so walls can be angled or curved; collision, sight and noise read it |
| `js/walls.js` | Traces the wall outlines from that shape |
| `js/alien.js` | The alien's patrol / investigate / hunt / lose-track logic |
| `js/noise.js` | The shared noise signal and how doors and walls muffle it |
| `js/pathfind.js` | A* pathfinding on the grid |
| `js/player.js` | Movement, mouse look, stamina, flashlight |
| `js/rig.js` | The camera as plain data, which the renderer copies onto its camera |
| `js/interact.js` | What you're looking at, and thrown noise-makers |
| `js/tricks.js` | Environment tricks (lights, doors, phantom footsteps, props) and the Hat Man |
| `js/audio.js` | Positional sound (plain Web Audio), synthesized effects, heartbeat, music |
| `js/worldplan.js` | Where walls, props, posters and loose chairs go; how doors and room lights behave |
| `js/textures.js` | Every canvas-drawn texture (walls, floor, posters, pipes, console screens, sticky notes, ...) |
| `js/alienshape.js` | The alien's shape and how it moves |
| `js/decorplan.js` | Where the wear and tear goes: pipes, leaks, broken lights, patches, clutter, corridor ribs, vents, stencilled markings (`STENCILS`) and stains. Counts and densities are at the top |
| `js/modelplan.js` | Which downloaded 3D models (`assets/models/`) go where: barrels, power boxes, extinguishers, lamps, toolbox, medical box |
| `js/decorsim.js` | Steam, drips, sparks and stuttering lights over time. Timings are at the top |
| `js/minimap.js` | The explored-only minimap |
| `js/intercom.js` | Marigold's lines (the station voice) |
| `js/tapes.js` | Plays the audio logs: a voice per speaker, captions, taking turns with Marigold |
| `text/lore.txt` | The twelve audio logs. Edit the words, voices, or point one at a recording, without touching code |
| `text/intro.txt` | Marigold's opening announcements, one per line |

**Renderer** (`js/babylon/`)

| File | What it does |
| --- | --- |
| `view.js` | Sets up the engine, camera and flashlight, and draws each frame |
| `world.js` | Builds the station: walls, floor, doors, lights, props, posters |
| `decor.js` | Builds the pipes, patches and clutter, and shows the steam, drips and sparks |
| `alien.js` | Builds and animates the alien |
| `props.js` | The Hat Man figure and thrown noise-makers |
| `util.js` | Materials, canvas textures, bevelled boxes, and the brightness `TUNING` |
| `models.js` | Loads the 3D models in the background and swaps out their code-built stand-ins |

`js/main.js` starts the game.

Add `?debug` to the URL to play without pointer lock (used by automated tests).
