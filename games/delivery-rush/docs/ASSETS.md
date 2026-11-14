# DELIVERY RUSH - asset list

Every asset in the game is original. Nothing was downloaded from Sketchfab or any other library.
All models were made in Blender 5.3 from Python scripts in `tools/blender/`, so they can be
rebuilt or changed at any time. I checked Sketchfab as a fallback option, but the scripted models
matched the blocky style well enough that no outside model was needed, which also keeps the
licensing simple.

## How the models were made

Run inside Blender (Scripting tab or the Blender MCP), always `dr_lib.py` first:

```
exec(open(r"...\delivery-rush\tools\blender\dr_lib.py").read())
exec(open(r"...\delivery-rush\tools\blender\build_vehicles.py").read())
pedal_bike("bicycle")    # writes assets/models/vehicles/bicycle.glb
```

- `dr_lib.py` - helpers: bevelled boxes, cylinders, tubes, wheels with the origin on the axle,
  GLB export. Models face -Y in Blender, which becomes +Z (forward) in the game.
- Units are metres. Ground is at height 0. Flat colour materials, no textures.

## Models (GLB, assets/models)

| File | Made with | Triangles | Notes |
|---|---|---|---|
| characters/courier.glb | build_character.py | 780 | Rigged (8 bones). 14 animations: idle, walk, run, jump, drive, ride (pedalling), moto, scoot, wave, cheer, carry_idle, carry_walk, carry_run, sit |
| characters/acc_*.glb | build_character.py | 40-200 each | Cosmetics: cap, beanie, helmet, crown, top hat, headphones, shades, backpack, jetpack. Modelled in character space, attached to the head / torso bone in the game |
| animations/courier_rig_anims.glb | build_character.py | 0 | Skeleton plus all 14 clips, no mesh (for reuse / retargeting) |
| vehicles/bicycle, bmx, mtb .glb | build_vehicles.py `pedal_bike()` | 1,200-1,650 | `steer_F` pivot (tilted along the head tube) holds fork, bars and front wheel |
| vehicles/escooter.glb | `escooter()` | 920 | |
| vehicles/moped.glb | `moped()` | 1,020 | |
| vehicles/motorbike.glb | `motorbike()` | 1,040 | |
| vehicles/van_small, van_large .glb | `van()` | 1,780-1,810 | Roof rack cargo area |
| vehicles/truck.glb, truck_super.glb | `truck()` | 1,660 / 2,250 | Flatbed; super truck has 3 axles |
| vehicles/car_sedan, hatch, pickup, taxi .glb | `car()` | 1,420-1,490 | Traffic and parked cars (tinted per car) |
| vehicles/airplane.glb | `airplane()` | 980 | Airport decoration; one takes off on a loop |
| buildings/house_a, b, c .glb | build_buildings.py | 380-580 | Wall and roof colours are set per house in the game |
| buildings/shop, restaurant .glb | `shop()` | 540-600 | Sign text is drawn on top in the game |
| buildings/warehouse, hangar, control_tower, garage, dealership .glb | build_buildings.py | 230-1,390 | |
| props/*.glb (19 files) | build_props.py | 40-470 | Package box, street light, traffic light, bench, 4 trees, bin, hydrant, mailbox, cone, container, crates, sign post, job board, 2 fences, cafe table |

Node names the game relies on (vehicles): `wheel_F`, `wheel_R`, `wheel_FL/FR/ML/MR/RL/RR`
(origin on the axle, spin about local X), `steer_F`, `seat`, `cargo` (its scale stores the cargo
area size), `headlamp`, `exhaust`. Material names drive behaviour: `paint`, `rim`, `headlight`,
`brakelight`, `window` (glows at night), `wall` / `roof` / `awning` (tinted per instance).

## Made in code at runtime (no files)

- Office towers, apartments, malls, supermarkets, factories, cargo terminals: boxes built in
  `src/world.js`, merged per area, with facade textures.
- Textures (`src/textures.js`): asphalt, road markings, crosswalks, pavement tiles, grass,
  concrete, runway, 4 window facades plus their night-glow maps, the shop sign atlas, map icons.
- Roads, pavements, kerbs, parking bays, ponds, district barriers, the sky.
- Fallback models: if any GLB fails to load, a simple stand-in is generated so the game still runs
  (test with `?failassets=vehicles/bmx,props/bench`).

## Sound

All sound is synthesised live with the Web Audio API in `src/audio.js` (engines, bike freewheel,
electric whine, tyres, wind, horns, bells, pickup / delivery / coin / level-up / purchase / UI
sounds, city ambience, birds). There are no audio files, so `assets/audio` is empty on purpose.

## Third-party code and fonts

- three.js 0.170 (MIT licence), loaded from jsDelivr.
- Fredoka font (SIL Open Font Licence), loaded from Google Fonts.
