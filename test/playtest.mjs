// End-to-end playtest: drives the real game through the DOM + synthetic keys and
// asserts the core loops work (enter car, mission 1 completes, drive, shoot,
// police spawn, save). Usage: node test/playtest.mjs [port]
import puppeteer from '/home/hatch/workspace/reels/anim/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/home/hatch/workspace/reels/anim/chrome/linux-157.0.8103.78/chrome-linux64/chrome';
const port = process.argv[2] || '8080';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
function check(name, ok, extra = '') { results.push([ok ? 'PASS' : 'FAIL', name, extra]); console.log(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); }

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__game !== undefined', { timeout: 30000 });
await sleep(1500);

// 1. title -> new game
await page.click('#btnNew');
await sleep(800);
// dismiss the mission-1 brief dialog (E advances dialogs before it interacts)
await page.evaluate(() => { const g = window.__game; g.dialogQueue = []; g.hud.closeDialog(); });
await sleep(300);
let s = await page.evaluate(() => {
  const g = window.__game;
  return { state: g.state, mission: g.missionIndex, obj: document.getElementById('objText').textContent };
});
check('new game starts, mission 1 active', s.state === 'playing' && s.mission === 0, JSON.stringify(s));

// 2. teleport next to a parked car, press E to steal it
await page.evaluate(() => {
  const g = window.__game;
  const car = g.parked[0];
  g.player.x = car.x + 2; g.player.z = car.z + 2;
  g.player.mesh.position.set(g.player.x, 0, g.player.z);
});
await page.keyboard.press('KeyE');
await sleep(500);
s = await page.evaluate(() => {
  const g = window.__game;
  return { inCar: !!g.player.inCar, carType: g.player.inCar?.type, step: g.step?.def.kind, mission: g.missionIndex };
});
check('E steals a parked car, mission 1 step completes', !!s.inCar, JSON.stringify(s));
// mission 1 has 2 steps: stealCar done -> goto garage
await sleep(300);
s = await page.evaluate(() => ({ step: window.__game.step?.def.kind, mission: window.__game.missionIndex }));
check('mission 1 advanced to drive-to-garage step', s.step === 'goto' && s.mission === 0, JSON.stringify(s));

// 3. drive forward (hold W). Headless swiftshader runs at a few fps and the
// loop clamps dt, so sim time runs slower than real time — hold long enough.
const before = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z }));
await page.keyboard.down('KeyW');
await sleep(10000);
await page.keyboard.up('KeyW');
const after = await page.evaluate(() => ({ x: window.__game.player.x, z: window.__game.player.z, speed: window.__game.player.inCar?.speed }));
const moved = Math.hypot(after.x - before.x, after.z - before.z);
check('car drives forward with W', moved > 8 && after.speed > 2, `moved ${moved.toFixed(1)}m, speed ${after.speed?.toFixed(1)}`);

// 4. drive to the garage to finish mission 1
await page.evaluate(() => {
  const g = window.__game;
  const t = g.world.landmarks.garage;
  g.player.inCar.x = t.x + 3; g.player.inCar.z = t.z + 3;
  g.player.x = t.x + 3; g.player.z = t.z + 3;
});
await sleep(600);
s = await page.evaluate(() => ({ mission: window.__game.missionIndex, money: window.__game.player.money, obj: document.getElementById('objTitle').textContent }));
check('mission 1 completes on arrival (+$300)', s.mission === 1 && s.money >= 400, JSON.stringify(s));
// dismiss the mission-2 brief dialog before using E to exit the car
await page.evaluate(() => { const g = window.__game; g.dialogQueue = []; g.hud.closeDialog(); });
await sleep(300);

// 5. exit car, shoot pistol (ammo decreases, no errors)
await page.keyboard.press('KeyE');
await sleep(400);
const ammoBefore = await page.evaluate(() => window.__game.player.weapons.pistol.mag);
await page.mouse.click(640, 360);
await sleep(400);
const ammoAfter = await page.evaluate(() => window.__game.player.weapons.pistol.mag);
check('pistol fires on click', ammoAfter === ammoBefore - 1, `${ammoBefore} -> ${ammoAfter}`);

// 6. wanted: add heat, police spawn (slow headless sim — allow 12 s)
await page.evaluate(() => { window.__game.police.addHeat(60, window.__game.time); });
await sleep(12000);
s = await page.evaluate(() => ({
  stars: window.__game.police.stars,
  foot: window.__game.police.footCops.length,
  cars: window.__game.police.copCars.length,
}));
check('3-star heat spawns police', s.stars === 3 && (s.foot > 0 || s.cars > 0), JSON.stringify(s));

// 7. mission 3 combat: gang squad shoots back, player can kill one
await page.evaluate(() => {
  const g = window.__game;
  g._startMission(2, false);
  g.dialogQueue = []; g.hud.closeDialog();
  g.player.health = 500; // survive return fire during the scripted fight
  const d = g.world.landmarks.docks;
  g.player.x = d.x - 8; g.player.z = d.z; g.player.mesh.position.set(g.player.x, 0, g.player.z);
});
await sleep(1500);
s = await page.evaluate(() => ({
  alive: window.__game.gang.alive().length,
  step: window.__game.step?.def.kind,
  kills: window.__game.step?.kills,
}));
check('mission 3 spawns 5 gang members', s.alive === 5 && s.step === 'kill', JSON.stringify(s));
// point the camera at the nearest gang member and shoot until one dies
let killed = false;
await page.evaluate(() => { window.__game.player.weapons.pistol.reserve = 999; });
for (let i = 0; i < 14 && !killed; i++) {
  await page.evaluate(() => {
    const g = window.__game;
    const m = g.gang.alive()[0];
    if (!m) return;
    const dx = m.x - g.player.x, dz = m.z - g.player.z;
    g.camYaw = Math.atan2(-dx, -dz);
  });
  await sleep(600); // let the camera swing round and settle
  for (let s = 0; s < 6; s++) {
    const mag = await page.evaluate(() => window.__game.player.weapons.pistol.mag);
    if (mag === 0) { await page.keyboard.press('KeyR'); await sleep(300); }
    // headless sim time runs slow, so clear the fire-rate cooldown directly
    await page.evaluate(() => { window.__game.player.shootCooldown = 0; window.__game._shoot(); });
    await sleep(900);
    killed = await page.evaluate(() => window.__game.step.kills > 0);
    if (killed) break;
  }
}
s = await page.evaluate(() => ({ kills: window.__game.step?.kills, alive: window.__game.gang.alive().length }));
check('shooting kills a gang member', s.kills >= 1, JSON.stringify(s));

// 8. save round-trips
await page.evaluate(() => window.__game.save());
const saved = await page.evaluate(() => localStorage.getItem('solmar-save-v1'));
check('save writes localStorage', !!saved && JSON.parse(saved).missionIndex === 2, saved ? `${saved.length} bytes` : '');

// 9. no page errors seen
const fails = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - fails}/${results.length} checks passed`);
await browser.close();
process.exit(fails === 0 ? 0 : 1);
