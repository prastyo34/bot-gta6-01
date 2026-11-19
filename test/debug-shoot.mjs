// Focused shooting debug: spawn mission 3, aim at the nearest gang member,
// fire 12 aimed shots and report hits/kills + what the first ray hits.
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
  g.player.health = 500;
  const d = g.world.landmarks.docks;
  g.player.x = d.x - 8; g.player.z = d.z;
  g.player.mesh.position.set(g.player.x, 0, g.player.z);
  g.player.weapons.pistol.reserve = 999;
});
await sleep(1500);
for (let i = 0; i < 12; i++) {
  const r = await page.evaluate(() => {
    const g = window.__game;
    const m = g.gang.alive()[0];
    if (!m) return { done: true };
    const dx = m.x - g.player.x, dz = m.z - g.player.z;
    g.camYaw = Math.atan2(-dx, -dz);
    return { dist: Math.hypot(dx, dz).toFixed(1), mx: m.x.toFixed(1), mz: m.z.toFixed(1), hp: m.hp };
  });
  if (r.done) { console.log('all gang dead'); break; }
  await sleep(700);
  await page.evaluate(() => { const g = window.__game; g.player.shootCooldown = 0; g._shoot(); });
  await sleep(600);
  const s = await page.evaluate(() => ({ kills: window.__game.step.kills, alive: window.__game.gang.alive().length, mag: window.__game.player.weapons.pistol.mag }));
  console.log(`shot ${i + 1}: target ${JSON.stringify(r)} -> ${JSON.stringify(s)}`);
  if (s.kills > 0) { console.log('KILL CONFIRMED'); break; }
}
await browser.close();
