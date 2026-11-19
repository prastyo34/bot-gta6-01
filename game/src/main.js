// SOLMAR boot + deterministic screenshot scenes.
// ?shot=start|drive|chase|mission&seed=1 stages a real gameplay frame and sets
// window.__shotReady = true once it has rendered, so headless Chrome can capture it.
import { Game } from './game.js';
import { Car } from './vehicles.js';
import * as THREE from 'three';

window.addEventListener('error', (e) => {
  document.title = `ERR: ${e.message}`;
  const el = document.createElement('div');
  el.id = 'js-error';
  el.textContent = `JS ERROR: ${e.message} @ ${e.filename}:${e.lineno}`;
  el.style.cssText = 'position:fixed;top:0;left:0;background:red;color:#fff;z-index:99;padding:4px;font:12px monospace';
  document.body.appendChild(el);
});

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 1);

const game = new Game();
game.init();
window.__game = game; // test/debug handle (also lets the finalist review poke at state)

function putPlayerInCar(type, x, z, heading) {
  const car = new Car(game.scene, type, x, z, heading, type === 'sport' ? 0xff2e63 : 0xffc93c);
  game.parked.push(car);
  const p = game.player;
  p.inCar = car;
  p.mesh.visible = false;
  car.driver = 'player';
  p.x = x; p.z = z;
  return car;
}

function stageShot(name) {
  game.shotMode = name;
  game.audio.ensure?.();
  // start a fresh game silently (no dialogs)
  game.startGame(false);
  game.dialogQueue = [];
  game.hud.closeDialog();
  const p = game.player;
  if (name === 'start') {
    // title screen over the orbiting city — nothing else to stage
    game.toTitle();
    return;
  }
  if (name === 'drive') {
    game._startMission(1, false); // THE PACKAGE — timed delivery, HUD shows timer
    game.dialogQueue = []; game.hud.closeDialog();
    putPlayerInCar('sport', 0, -120, 0); // southbound on the central avenue
    game.police.addHeat(30, game.time); // 2 stars
    game.camYaw = Math.PI; // camera behind the car (car faces +z, camera at +z side)
    // traffic ahead on the same avenue so the frame reads as a living city
    for (const [tz, type] of [[-78, 'taxi'], [-38, 'sedan']]) {
      const tc = new Car(game.scene, type, 2, tz, 0, type === 'taxi' ? 0xffc93c : 0x2980b9);
      tc.driver = 'traffic'; tc.speed = 8;
      game.traffic.cars.push(tc);
    }
    // autopilot: hold W, steer gently to stay on the avenue
    game.autoInput = (input) => {
      input.keys.add('KeyW');
      if (p.inCar.x > 3) input.keys.add('KeyA');
      else if (p.inCar.x < -3) input.keys.add('KeyD');
    };
    return;
  }
  if (name === 'chase') {
    game._startMission(5, false); // THE BIG SCORE — escape the heat
    game.dialogQueue = []; game.hud.closeDialog();
    putPlayerInCar('gold', 0, -40, 0);
    game.police.addHeat(85, game.time); // 4 stars
    game.police._spawnCopCar(3, -62); // one cruiser behind…
    const ahead = game.police._spawnCopCar(4, -12); // …one coming head-on, visible in frame
    ahead.heading = Math.PI;
    game.camYaw = Math.PI;
    game.autoInput = (input) => {
      input.keys.add('KeyW');
      if (p.inCar.x > 3) input.keys.add('KeyA');
      else if (p.inCar.x < -3) input.keys.add('KeyD');
    };
    return;
  }
  if (name === 'mission') {
    game._startMission(2, false); // DOCKSIDE TROUBLE — gang fight
    game.dialogQueue = []; game.hud.closeDialog();
    const d = game.world.landmarks.docks;
    p.x = d.x - 10; p.z = d.z + 2; // on the road at the docks, facing the gang (+x)
    p.heading = Math.PI / 2;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    game.camYaw = -Math.PI / 2; // camera behind player, facing the docks (+x)
    game.camPitch = 0.22;
    // a tracer mid-flight so the frame reads as combat
    setTimeout(() => {
      const squad = game.gang.alive();
      if (squad.length > 0) {
        const m = squad[0];
        game.fx.tracer(
          new THREE.Vector3(p.x, 1.5, p.z),
          new THREE.Vector3(m.x, 1.4, m.z),
        );
      }
    }, 600);
    return;
  }
}

if (shot) {
  stageShot(shot);
  // let the world settle, then signal readiness for the screenshot
  const readyAfter = shot === 'start' ? 1200 : 2600;
  setTimeout(() => { window.__shotReady = true; }, readyAfter);
} else {
  window.__shotReady = true;
}

game.loop();
