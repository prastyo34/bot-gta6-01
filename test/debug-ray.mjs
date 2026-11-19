// Raycast probe: aim at the nearest gang member, report camera pose, ray
// direction, and the first 3 hits with their actor kind.
import puppeteer from '/home/hatch/workspace/reels/anim/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/home/hatch/workspace/reels/anim/chrome/linux-157.0.8103.78/chrome-linux64/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://127.0.0.1:8080/index.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForFunction('window.__game !== undefined', { timeout: 30000 });
await sleep(1000);
await page.click('#btnNew');
await sleep(500);
await page.evaluate(() => {
  const g = window.__game;
  g.dialogQueue = []; g.hud.closeDialog();
  g._startMission(2, false);
  g.dialogQueue = []; g.hud.closeDialog();
  const d = g.world.landmarks.docks;
  g.player.x = d.x - 8; g.player.z = d.z;
  g.player.mesh.position.set(g.player.x, 0, g.player.z);
});
await sleep(1500);
await page.evaluate(() => {
  const g = window.__game;
  const m = g.gang.alive()[0];
  const dx = m.x - g.player.x, dz = m.z - g.player.z;
  g.camYaw = Math.atan2(-dx, -dz);
});
await sleep(1500);
const info = await page.evaluate(() => {
  const g = window.__game;
  const m = g.gang.alive()[0];
  const cam = g.camera.position;
  const dir = new (Object.getPrototypeOf(cam).constructor)(0, 0, 0);
  g.camera.getWorldDirection(dir);
  g.raycaster.setFromCamera({ x: 0, y: 0 }, g.camera);
  const targets = [g.world.group, ...g.gang.members.filter((x) => !x.dead).map((x) => x.mesh)];
  const hits = g.raycaster.intersectObjects(targets, true);
  return {
    player: [g.player.x.toFixed(1), g.player.z.toFixed(1)],
    member: [m.x.toFixed(1), m.z.toFixed(1)],
    camPos: [cam.x.toFixed(1), cam.y.toFixed(1), cam.z.toFixed(1)],
    camDir: [dir.x.toFixed(2), dir.y.toFixed(2), dir.z.toFixed(2)],
    camYaw: g.camYaw.toFixed(2),
    hits: hits.slice(0, 4).map((h) => ({
      d: h.distance.toFixed(2),
      actor: g._actorOf(h.object)?.kind || h.object.type,
      point: [h.point.x.toFixed(1), h.point.y.toFixed(1), h.point.z.toFixed(1)],
    })),
  };
});
console.log(JSON.stringify(info, null, 1));
await browser.close();
