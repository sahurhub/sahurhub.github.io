# What is real, what is approximated, what is not built yet

Version 0.2. This list is kept honest on purpose: if something is not here as "done", the game
does not do it yet.

## Done and working

- **2026 season data**: all 11 teams and 22 drivers with their real race numbers (FIA entry
  list), 2026 calendar including the cancelled Bahrain and Saudi rounds and the Bahrain GP held
  in Malaysia. Sources are listed in `data/seasons/2026.json`.
- **Monza** is a full 3D circuit (Sketchfab model, see Credits). The physics track is measured
  from that model: centre line and width from its white lines and racing surface, height and
  banking from its road surface (about 12 m of climb and fall around the lap), kerbs, grass,
  gravel and asphalt run-off, and the distance to the real barriers. Lap length in the game:
  5.77 km (real: 5.793 km).
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
- **AI**: same physics as the player, racing line, braking, overtaking with room, giving way on
  the outside, safe following gaps, tyre-grip awareness, mistakes. Uses straight mode and
  overtake mode. 3-lap test races with all 22 cars finish without spins or crashes.
- **Race**: grid, five red lights, lap and sector timing, gaps, positions, track limits,
  fastest lap, chequered flag, results with points. Time Trial and Practice, saved lap records.
- **8 cameras**: Chase, Far Chase, Halo, Halo Offset, Cockpit, Nose, Front Wing, Rear Wing
  (looking back). On-board cameras are placed from each car's own shape.
- **HUD**: TV-style timing tower and driver banner; in the Halo cameras a halo HUD like the
  2026 TV graphics (speed, boost, overtake, brake / throttle, recharge / deploy, active aero,
  gears, rpm, position).
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
- **The halo HUD** is drawn on the screen in the halo shape, not projected onto the 3D halo.
- **In the Halo cameras the player's own roof camera pod is hidden**, as on TV.
- **Drivers** are simple shapes, not detailed models; helmets use team colours, not the real
  helmet designs.
- **Sound** is synthesised in the browser (no recordings).

## Not built yet

Qualifying, practice sessions as part of a weekend, sprint races, pit stops, tyre strategy,
safety car, virtual safety car, flags (yellow/blue), penalties other than track limits,
weather and rain, car setup screen, Career, My Team, Championship and custom championships,
other seasons and eras, other circuits, racing-wheel force feedback, team radio.
