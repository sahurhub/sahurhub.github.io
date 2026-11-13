# What is real, what is approximated, what is not built yet

Version 0.3. This list is kept honest on purpose: if something is not here as "done", the game
does not do it yet.

## Done and working

- **2026 season data**: all 11 teams and 22 drivers with their real race numbers (FIA entry
  list), 2026 calendar including the cancelled Bahrain and Saudi rounds and the Bahrain GP held
  in Malaysia. Sources are listed in `data/seasons/2026.json`.
- **Monza** is a full 3D circuit (Sketchfab model, see Credits). The physics track is measured
  from that model every 2 m: edges from its white lines (or the kerb / grass where there is no
  line), height and banking from its road surface (about 12 m of climb and fall around the
  lap), kerbs, grass, gravel and asphalt run-off, and the distance to the real barriers. The
  chicanes were re-measured so the track limits match the white lines you see. Lap length in
  the game: 5.73 km (real: 5.793 km, about 1% shorter).
- **Cars**: real 3D models for all teams except Alpine and Racing Bulls (no 2026 model exists
  on Sketchfab; they use a repainted Mercedes and Red Bull). Wheels spin about their real
  cambered axles. Rear wing flap and front wing flaps move with straight mode.
- **Drivers**: every car has a driver (helmet in team colours with the car number, visor,
  collar, arms and gloves on the wheel).
- **2026 active aero** as in the FIA rules: straight mode only in the circuit's zones (Monza:
  start line to Turn 1, Curva Grande exit to Roggia, Lesmo 2 to Ascari, Ascari to Parabolica).
  It opens automatically at the zone start, or with the F key if you choose "Button" in the
  assists. It closes when you brake or leave the zone.
- **Overtake mode**: within 1 second of the car ahead at the detection point before the
  Parabolica earns it for the next lap, from the Parabolica exit. While you boost, full
  electric power then lasts to 337 km/h instead of 290 km/h.
- **Vehicle physics**: four independently simulated tyres (load, slip, temperature, wear,
  grip), load transfer, downforce and drag, hills and banking, 400 kW engine + 350 kW
  electric motor with the official speed taper, battery harvesting, 8-speed gearbox,
  differential, brakes, kerbs, grass, gravel, walls, car-to-car contact. 480 steps per second.
- **ERS modes** (M key): Harvest (no electric power, charges the battery), Medium (the
  default, 80% electric power, saves energy at high speed so it lasts the lap) and Hotlap (full
  power to a higher speed, empties the battery faster). Boost (Space) still gives full power.
- **AI**: same physics as the player, racing line, braking, overtaking with room, giving way on
  the outside, safe following gaps, tyre-grip awareness, mistakes. Uses straight mode and
  overtake mode. Each driver has a fixed personality from their ratings (how hard they attack
  and defend, how close they follow): the same drivers are always the aggressive ones. Most
  drivers move off the line on a straight to let a clearly faster car by (always when being
  lapped); stubborn defenders make one move to the inside instead, and give in after a while.
  At the start the cars keep to their grid column for the first 160 m. No AI car steers
  across into a car beside it (allowing for where that car is heading and how angled both
  cars are); a car squeezed towards the edge backs out instead of going off; a stopped car is
  driven round instead of waited behind. There is still some light contact in the first
  chicane on lap 1. `tools/racecheck.js` counts contacts, offs and resets over whole races.
- **Race**: grid, five red lights, lap and sector timing, gaps, positions, track limits,
  fastest lap, chequered flag, results with points. Time Trial and Practice, saved lap records.
- **8 cameras**: Chase, Far Chase, Halo, Halo Offset (left of centre, like TV), Cockpit, Nose,
  Front Wing, Rear Wing (looking back). On-board cameras are placed from each car's own shape;
  the Halo views were checked on every car for parts blocking the view.
- **HUD**: TV-style timing tower and driver banner. In both Halo cameras the 2026 TV halo
  graphics are drawn in 3D on the car's halo itself (speed dial with battery ring, boost,
  overtake, brake / throttle, recharge / deploy, ERS mode, active aero, gears, rpm, position and
  the car ahead), not as a flat screen overlay.
- **Assists**: traction control, stability control, ABS, steering help, automatic gears,
  automatic straight mode.

## Approximations (the game does it, but not exactly like the real thing)

- **Lap time**: AI best lap is about 1:26.2 at 100% difficulty. The 2026 pole at Monza was
  1:21.786, so the cars are about 5% slow. Tyre grip, downforce and drag are tuned estimates.
- **Straight mode zone metres** are placed from corner exit to the braking area as the FIA
  describes the zones; the exact metres are not published.
- **Car performance per team** and **driver ratings** are this game's own estimates.
- **Tyres** use a simplified "magic formula" curve. No pressures, no graining or blistering.
- **Suspension** is not simulated spring by spring: body pitch, roll and ride height are
  worked out from the forces. Crests and dips do not change tyre load yet.
- **Battery**: 5 MJ usable, more than the real 2026 cars (about 4 MJ), so electric power does
  not run out as quickly. Tyre grip was raised a little to keep lap times after the track was
  re-measured narrower.
- **In the Halo cameras the player's own roof camera pod is hidden**, as on TV.
- **Drivers** are simple shapes, not detailed models; helmets use team colours, not the real
  helmet designs.
- **Sound** is synthesised in the browser (no recordings).

## Not built yet

Qualifying, practice sessions as part of a weekend, sprint races, pit stops, tyre strategy,
safety car, virtual safety car, flags (yellow/blue), penalties other than track limits,
weather and rain, car setup screen, Career, My Team, Championship and custom championships,
other seasons and eras, other circuits, racing-wheel force feedback, team radio.
