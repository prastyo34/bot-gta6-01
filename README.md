# bot-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)

SOLMAR: Streets of Gold is a complete open-world crime game in three.js, built by an AI
agent for make.fun's "Make GTA 6" bounty ($1,666). Everything is original — city, names,
characters, story, art and sound — and it runs entirely offline in a desktop browser.

## Run it

```sh
node serve.ts
# then open http://127.0.0.1:8080/game/index.html in a desktop browser
```

## How to play

Dario Cruz is back in Solmar City. Rosa needs a driver, the Harbor Rats own the docks,
and the Solmar PD owns the streets. Steal cars, outrun the law, run six story missions,
and take the city back.

- **WASD** move / drive · **Mouse** look (click to aim) · **E** steal / enter car, exit car
- **Space** jump / handbrake · **Click** shoot · **R** reload · **Shift** sprint
- **1 / 2** pistol / SMG · **M** mute · **Esc** pause & save

## The game

- **City** — a 9×9-block sun-soaked coastal grid at golden hour: avenues, sidewalks,
  palms, lamps, a beach, a pier and a marina, with Solmar Tower at its centre.
- **On foot and by car** — third-person on-foot movement plus arcade driving in 7 car
  types (sedan, sport, taxi, truck, van, police cruiser, gold sedan). Any parked car
  can be stolen; stealing in front of a cop or a pedestrian raises your wanted level.
- **Traffic & pedestrians** — 14 traffic cars loop the road grid (braking for jams and
  for you), 24 pedestrians walk the sidewalks and flee gunfire and speeding cars.
- **Wanted & police** — 0–5 stars. Foot cops chase and try to bust you; police cruisers
  pursue and ram; heat decays when you stay out of sight. Busted or Wasted costs cash
  and drops you at the PD or the hospital.
- **Missions & story** — 6 story missions from Rosa and Eddie: steal a getaway car,
  a 90-second package run, clearing the Harbor Rats from the docks, losing a 3-star
  tail, three taxi fares, and the finale — stealing the mayor's nephew's gold sedan
  under 4 stars. Plus repeatable taxi work and 12 hidden Sun Coins.
- **Combat** — pistol + SMG with raycast shooting, tracers, muzzle flash, damage
  numbers, gang enemies who shoot back, and car explosions.
- **HUD & minimap** — health/armour, cash, wanted stars, clock, mission objective,
  speedometer, ammo, interaction prompts, message feed, and a live circular minimap
  with mission markers, cops, cars and coins.
- **Start & save** — title screen with story intro, pause menu, localStorage saves
  (auto-save after every mission), Continue support.
- **Sound** — fully synthesised WebAudio: engine hum, gunshots, sirens, pickups,
  mission jingles and a sunset bass loop. No audio files, no network.

## Files

```
game/
  index.html            HUD + screens + import map
  three.module.min.js   three.js 0.187.0 (vendored, minified)
  src/
    main.js             boot + deterministic screenshot scenes
    game.js             state machine, loop, camera, missions, combat, save
    world.js            Solmar City generation, colliders, road helpers
    vehicles.js         cars, arcade driving, traffic AI, parked cars
    actors.js           player, pedestrians, police/wanted, gang, pickups
    missions.js         story missions, taxi fares, sun coins
    hud.js              HUD + circular minimap
    effects.js          tracers, particles, explosions, floating text
    audio.js            synthesised WebAudio SFX + music
    input.js            keyboard + mouse / pointer lock
    rng.js              seeded deterministic random
main.ts                 entrypoint: copies game/ + screenshots/ to /output, writes dossier.json
serve.ts                local static server (node serve.ts)
screenshots/            1-start.jpg 2-drive.jpg 3-chase.jpg 4-mission.jpg
```

Screenshot scenes are deterministic: `game/index.html?shot=start|drive|chase|mission&seed=1`
stages a scene, renders, and sets `window.__shotReady = true`.

## Notes

- No network requests: three.js is vendored, textures are generated on canvas, sounds
  are synthesised in code. The game also runs from a `file://` URL.
- All names, characters, places and story are original; nothing is taken from any
  commercial game.
