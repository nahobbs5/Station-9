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
| F | Flashlight (it can see you from further away with it on) |
| Q | Throw a noise-maker (pick them up in Storage) |
| Esc | Pause |

Tips: it clicks right before it moves. Closed doors slow it down and muffle your noise. A noise-maker thrown away from you pulls it off your trail.

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

## How it's built

Plain JavaScript modules and [three.js](https://threejs.org) 0.160 from a CDN. Everything is grey-box geometry and canvas-drawn textures, plus the six sounds in `sound_effects/`.

| File | What it does |
| --- | --- |
| `js/layout.js` | The station map: rooms, corridors, doors, props, line-of-sight |
| `js/alien.js` | The alien's patrol / investigate / hunt / lose-track logic |
| `js/noise.js` | The shared noise signal and how doors and walls muffle it |
| `js/pathfind.js` | A* pathfinding on the grid |
| `js/world.js` | Builds the 3D station, lights, doors, posters and the alien's mesh |
| `js/player.js` | Movement, mouse look, stamina, flashlight |
| `js/tricks.js` | Environment tricks (lights, doors, phantom footsteps) and the Hat Man |
| `js/intercom.js` | The station voice's lines and the terminal logs |
| `js/audio.js` | Positional sound, synthesized effects, heartbeat |
| `js/main.js` | Game loop, objectives, HUD, screens |

Add `?debug` to the URL to play without pointer lock (used by automated tests).
