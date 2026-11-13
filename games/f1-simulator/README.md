# F1 Simulator (browser)

Unofficial fan project. Not affiliated with Formula 1, the FIA or any team. Team, driver,
circuit and sponsor names belong to their owners.

## Run it

It is plain HTML and JavaScript, no build step. Any static web server works. On this PC the
preview config "f1sim" (port 8770) serves this folder. Open `http://localhost:8770/`.

Add `?mute` to the address to run with no sound (used for automated testing).

## Controls (keyboard, can be changed in Controls)

| Action | Keys |
|---|---|
| Accelerate | W / Up |
| Brake, reverse when stopped | S / Down |
| Steer | A D / Left Right |
| Shift up / down (manual gears) | Shift or E / Ctrl or Q |
| Boost (overtake mode when earned) | Space |
| ERS mode: Harvest / Medium / Hotlap | M |
| Straight mode (only if set to "Button") | F |
| Camera | C |
| Look back | B |
| Reset car | R |
| Pause | Esc / P |

Controller: left stick steers, right trigger accelerates, left trigger brakes, bumpers shift.

## Folders

- `data/` season, regulation and circuit files (add a season by adding files here)
- `src/physics` car physics, `src/ai` AI drivers, `src/race` race rules and timing,
  `src/track` circuit model and 3D building, `src/render` graphics and cameras,
  `src/cars` 3D car loading, `src/ui` menus and HUD, `src/audio` sound, `src/core` helpers
- `assets/cars/<year>/` car models (made with `tools/blender/process_car.py`)
- `tools/test.html` physics test bench (runs races without graphics)
- `tools/racecheck.js` race checker for the game page (contacts, offs, resets per race; how
  to use it is at the top of the file)
- `tools/remeasure.html` re-measures the track edges from the circuit model, `tools/trackview.html`
  draws the measured edges, kerbs and racing line over the model from above
- `docs/APPROXIMATIONS.md` what is real, what is estimated, what is not built yet

## Credits

- Car models by Tyler_Dave on Sketchfab, labelled CC Attribution 4.0: 2026 McLaren MCL40,
  Ferrari SF-26, Mercedes W17, Redbull RB22, Williams FW48, Aston Martin AMR26, Audi R26,
  Cadillac MAC-26, Haas VF-26. Simplified and re-exported for this game. Links in
  `assets/cars/2026/index.json`.
- Monza 3D model: "Autodromo Nazionale Monza Circuit 2020 layout" by Tyler_Dave on Sketchfab,
  labelled CC Attribution. Its banners show it comes from the game Assetto Corsa (Kunos
  Simulazioni), so the uploader probably did not have the right to give it away; it may be
  taken down on request. Simplified with `tools/blender` steps; the physics track
  `data/circuits/monza.centerline.v3.json` was measured from it with `tools/remeasure.html`.
- Monza centre line used for alignment: TUMFTM racetrack-database (LGPL-3.0),
  https://github.com/TUMFTM/racetrack-database
- three.js (MIT). Titillium Web font (SIL Open Font Licence).
