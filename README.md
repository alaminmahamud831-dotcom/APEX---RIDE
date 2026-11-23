# ALAMIN APEX RIDE — Remastered 3D Edition

A mobile-first, browser-playable 3D motorcycle traffic-racing game built with Three.js.

## Included

- 3D sport-bike model with blue/black fairings, blue alloy-style wheels, gold front forks, lights, brakes, exhaust and ALAMIN livery.
- Articulated rider avatar with black ALAMIN-style jacket, white shirt, dark jeans, white sneakers and swept-up dark hair.
- Real photo portrait and supplied character/bike reference sheet used in the player identity screens.
- Third-person chase camera with steering lean and speed response.
- Highway environment with lane markings, guardrails, roadside lamps, trees and skyline.
- Traffic cars/SUVs with body, cabin glass, wheels, lights and collision detection.
- Coins, near-miss score, best score, distance, brake, nitro and automatic acceleration.
- Three steering modes: touch arrows, virtual steering wheel and phone tilt (where motion sensors are available).
- Garage fairing colours, route selection, player profile, sound toggle and graphics quality settings.
- Desktop keyboard support: A/D or arrow keys, Space/Down for brake, Shift for nitro, Esc to pause.

## Run locally

This is a static project. It does not require npm or a build step. It does require internet access to load the Three.js ES module from jsDelivr and the optional Google Fonts stylesheet.

Recommended local test server:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

Opening `index.html` directly from the file manager may block JavaScript modules in some browsers.

## Publish to GitHub Pages

1. Extract the ZIP.
2. Upload the *contents* of this folder to the root of a GitHub repository (so `index.html` is at the repository root).
3. Open **Settings → Pages**.
4. Choose **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Open the published Pages URL on a current mobile browser with WebGL enabled.

## Important implementation notes

- The game uses custom procedural Three.js meshes rather than the earlier sphere-and-box placeholder scene. The motorcycle, rider, road and traffic are built with detailed geometry and materials in the project source.
- The rider is an articulated procedural 3D avatar, not a professionally scanned or fully skin-weighted photorealistic human asset. The supplied real portrait is used in the profile and identity UI. Exact 3D facial likeness cannot be guaranteed from the supplied photographs alone.
- The supplied images are included as user-provided assets. Do not redistribute them as stock imagery.
- The vehicle and environment models are original procedural geometry for this project; they are not manufacturer CAD or exact Yamaha production models. The bike styling follows the supplied blue/black sport-bike reference and uses ALAMIN branding.
- This is a complete playable prototype / first game release candidate, not a certified commercial game. Test on the target phone and tune graphics quality if needed.

## Performance guidance

- Use **AUTO** first in Settings.
- Choose **LOW / BATTERY SAVE** on older or entry-level phones.
- Close other heavy browser tabs before playing.
- The game renders with a capped pixel ratio and automatically reduces render scale when frame rate is persistently low.

## Project structure

```text
ALAMIN_APEX_RIDE_REMASTER/
├── index.html
├── README.md
├── CREDITS.md
├── .nojekyll
├── src/
│   ├── main.js
│   └── game.css
└── assets/
    └── images/
        ├── alamin-bike-photo.jpg
        ├── alamin-character-bike-reference.jpg
        └── alamin-portrait.jpg
```
