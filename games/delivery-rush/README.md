# DELIVERY RUSH

A 3D delivery simulator for the browser. Start on foot with $150, take jobs from job boards,
collect parcels, deliver them across a city with five districts, earn money and XP, and work your
way up from walking to a Super Delivery Truck.

Plain HTML, CSS and JavaScript ES modules with three.js 0.170. No build step, no installs.

## How to run

The game must be served over http (opening `index.html` as a file will not load the models).

- In Claude Code: the `deliveryrush` preview config serves this folder on http://localhost:8772
- Any static web server works, for example `python -m http.server` in this folder.

URL options (can be combined, e.g. `?mute&fresh`):

| Option | What it does |
|---|---|
| `?mute` | No sound at all (no audio is created) |
| `?fresh` | Start a new game without loading the save (the save is overwritten when the game saves) |
| `?nosave` | Keep saves in memory only, so nothing in the browser is changed |
| `?failassets=vehicles/bmx,props/bench` | Pretend these models failed to load, to test the fallbacks |

## Controls

| Key | Action |
|---|---|
| W A S D | Walk / drive and steer |
| Mouse | Look around (click the game to capture the mouse, Esc to release) |
| Shift | Sprint |
| Space | Jump on foot, handbrake when driving |
| E | Interact: job boards, collect, deliver, ride / get off, garage, dealership, time trials |
| V | Call your equipped vehicle |
| R | Put your vehicle back on the road |
| H | Horn or bell |
| M / J / G / B | Map / Missions / Garage / Shop |
| Mouse wheel | Camera zoom |
| Esc | Pause, or close a menu |

## The game

- **Loop:** job board (or Missions menu) > accept > blue marker: collect > green marker: deliver >
  money + XP > buy and upgrade vehicles > unlock districts > better jobs.
- **Districts:** Downtown (start), Suburbs (level 2, $600), Shopping (level 5, $5,000),
  Industrial (level 9, $25,000), Airport (level 14, $90,000). Locked districts have a red barrier.
- **Vehicles:** Bicycle $500, BMX $1,500, Electric Scooter $4,000, Mountain Bike $7,500,
  Moped $15,000, Motorbike $30,000, Small Delivery Van $60,000, Large Delivery Van $125,000,
  Delivery Truck $300,000, Super Delivery Truck $750,000. Each has its own speed, acceleration,
  handling, braking, capacity, sound and riding pose.
- **Upgrades:** speed, acceleration, handling, braking and cargo, 5 levels each (4-5 need the
  Tuning Lab). Upgrades also change the vehicle visibly (spoiler, exhausts, wider tyres, brake
  callipers, bigger cargo rack). Paint, wheels and accessories in the garage.
- **Jobs:** Standard, Express, Fragile, Multi-stop, Heavy, Long Haul, Premium. Parcel rarities
  Common, Uncommon, Rare, Epic, Legendary (brown, green, blue, purple, gold).
- **Extras:** delivery streaks, daily login reward, 3 daily missions, 27 achievements, 5 time
  trials with medals, 6 special missions, Golden Drop events, cosmetics, equipment, garage upgrades.
- **City life:** pedestrians who dodge you, people on park benches, shop owners and customers,
  traffic that follows lanes, stops at red lights and honks, parked cars, day and night.

Rough pace (from the balance check in `tools/test.js`): the bicycle takes about 6 minutes, the
Super Delivery Truck around 5-6 hours of play.

## Project structure

```
index.html            page + import map
css/style.css         all UI styles
src/main.js           boot: loading screen, assets, world, save, title
src/game.js           game loop, interaction, vehicles, districts, saving, settings
src/config.js         all data: vehicles, prices, districts, jobs, rarities, shop, achievements
src/cityLayout.js     city generation as plain data (roads, plots, buildings, props, colliders)
src/world.js          builds the 3D city, sky, lights, day/night
src/physics.js        collision world (boxes + circles in a spatial hash)
src/player.js         courier on foot
src/character.js      rigged character, animations, colours, cosmetics
src/vehicles.js       vehicle models, customisation and driving physics
src/camera.js         third-person and driving camera
src/delivery.js       job boards, jobs, rewards, events, special missions, time trials
src/economy.js        profile, money, XP, levels, all purchases
src/progression.js    achievements, daily missions, login rewards
src/npc.js            pedestrians, customers, shop owners
src/traffic.js        traffic cars and traffic lights
src/markers.js        world markers, direction arrow, GPS arrows
src/effects.js        particles
src/audio.js          synthesised sound
src/ui.js, map.js     HUD, menus, minimap, full map
src/preview.js        3D preview for garage / dealership / outfits
src/save.js           save layer (adapters)
src/net/protocol.js   session snapshots
assets/models/...     GLB models (vehicles, characters, buildings, props)
assets/animations/    character clips
tools/blender/        Blender scripts that build every model
tools/test.js         developer test helpers
tools/shot-server.ps1 developer helper that saves test screenshots
docs/ASSETS.md        asset list and credits
```

## Saving

Progress saves automatically every 30 seconds, after every delivery or purchase, and when the page
is closed. It is stored in the browser's localStorage (`deliveryrush.profile`). Settings are
saved separately.

The save layer is swappable. `SaveManager` only talks to an adapter with three async methods:
`load(key)`, `save(key, data)` and `remove(key)`. To use a server later, write an adapter that
calls your API and pass it to `new SaveManager(adapter)`.

## Multiplayer readiness (not multiplayer)

This build is single player. It has no networking. What is prepared:

- The simulation reads a plain controls object (`input.js` > `Player.step` / `Vehicle.step`), so
  another player could be driven by network data instead of the keyboard.
- The city is generated from a fixed seed as plain data, so a server builds the same city.
- All money, XP and purchases go through `Economy` methods that validate and return
  `{ok, error}`, which is where a server would take over.
- `src/net/protocol.js` produces JSON snapshots of the player and vehicle. Today they are used to
  restore your position after a reload.

## Performance

Aimed at 60 FPS on a GTX 1650. Models are merged into single meshes with vertex colours and drawn
with instancing (one draw call per model per city area), traffic is fully instanced, each person
is one draw call, props are hidden at a distance, and quality presets (Settings) change shadows,
resolution, view distance and crowd sizes. A normal frame is about 150-200 draw calls.

## Testing

`tools/test.js` drives the game from the browser console (works in a hidden tab):

```
const T = await import('/tools/test.js');
await T.boot();        // press Play
await T.stage1();      // walk, jump, job board, accept, collect, deliver
await T.stage2();      // earn, buy the bicycle in the dealership, upgrades, level up, save
await T.allVehicles(); await T.jobTypes(); await T.extras(); await T.balance();
```

## Known limitations

- The camera can pass through tree tops when walking right next to a tree.
- Traffic does not change lanes or overtake, and pedestrians stay on their block's pavement.
- Vehicles cannot flip or crash dramatically (impacts bounce them and damage fragile parcels).
- There is no music, only sound effects and ambience.

See `docs/ASSETS.md` for the full asset list and credits.
