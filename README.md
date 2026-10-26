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

## Two versions: three.js and Babylon.js

The game runs on two 3D engines so you can compare them:

- `index.html` uses [three.js](https://threejs.org) 0.160.
- `babylon.html` uses [Babylon.js](https://www.babylonjs.com) 9.28. Add `?inspect` to its URL to open Babylon's Inspector for tuning lights and materials.

Each start menu has a link to the other one. Both share the same game: rules, alien, tapes, HUD, minimap, sound and level layout all live in shared files. Only the drawing is engine-specific (`js/three/` and `js/babylon/`). A gameplay change made in the shared files works in both.

The two engines measure light differently. Babylon's brightness is matched to three.js by `TUNING` at the top of `js/babylon/util.js`.

## How it's built

Plain JavaScript modules and canvas-drawn textures, with the engines loaded from a CDN, plus the sounds in `sound_effects/` and the title theme in `music/`. Every audio file is listed on the in-game Credits screen (`js/credits.js`).

**Shared by both versions**

| File | What it does |
| --- | --- |
| `js/game.js` | The game: objectives, alien events, tapes, score, HUD, screens and the main loop |
| `js/layout.js` | The station map: rooms, corridors, doors, props, line-of-sight |
| `js/alien.js` | The alien's patrol / investigate / hunt / lose-track logic |
| `js/noise.js` | The shared noise signal and how doors and walls muffle it |
| `js/pathfind.js` | A* pathfinding on the grid |
| `js/player.js` | Movement, mouse look, stamina, flashlight |
| `js/rig.js` | The camera as plain data, which each engine copies onto its own camera |
| `js/interact.js` | What you're looking at, and thrown noise-makers |
| `js/tricks.js` | Environment tricks (lights, doors, phantom footsteps, props) and the Hat Man |
| `js/audio.js` | Positional sound (plain Web Audio), synthesized effects, heartbeat, music |
| `js/worldplan.js` | Where walls, props, posters and loose chairs go; how doors and room lights behave |
| `js/textures.js` | Every canvas-drawn texture (walls, floor, posters, pipes, ...) |
| `js/alienshape.js` | The alien's shape and how it moves |
| `js/decorplan.js` | Where the wear and tear goes: pipes, leaks, broken lights, patches, clutter. Counts and densities are at the top |
| `js/decorsim.js` | Steam, drips, sparks and stuttering lights over time. Timings are at the top |
| `js/minimap.js` | The explored-only minimap |
| `js/intercom.js` | Marigold's lines (the station voice) |
| `js/tapes.js` | Plays the audio logs: a voice per speaker, captions, taking turns with Marigold |
| `text/lore.txt` | The twelve audio logs. Edit the words, voices, or point one at a recording, without touching code |
| `text/intro.txt` | Marigold's opening announcements, one per line |

**Per engine** (the same files in `js/three/` and `js/babylon/`)

| File | What it does |
| --- | --- |
| `view.js` | Sets up the engine, camera and flashlight, and draws each frame |
| `world.js` | Builds the station: walls, floor, doors, lights, props, posters |
| `decor.js` | Builds the pipes, patches and clutter, and shows the steam, drips and sparks |
| `alien.js` | Builds and animates the alien |
| `props.js` | The Hat Man figure and thrown noise-makers |

`js/main.js` starts the three.js version and `js/babylon/main.js` starts the Babylon.js one. Keep `babylon.html`'s markup in step with `index.html`; a test checks their element ids match.

Add `?debug` to the URL to play without pointer lock (used by automated tests).
