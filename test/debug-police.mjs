// Debug probe: police spawning + driving. Starts a game, adds 3-star heat,
// samples police counts and car speed every second.
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
await page.evaluate(() => { const g = window.__game; g.dialogQueue = []; g.hud.closeDialog(); });
// steal nearest parked car and drive
await page.evaluate(() => {
  const g = window.__game;
  const car = g.parked[0];
  console.log('parked0', car.type, car.x.toFixed(1), car.z.toFixed(1), 'heading', car.heading.toFixed(2));
  g.player.x = car.x + 2; g.player.z = car.z + 2;
  g.player.mesh.position.set(g.player.x, 0, g.player.z);
});
await page.keyboard.press('KeyE');
await sleep(400);
await page.keyboard.down('KeyW');
for (let i = 0; i < 4; i++) {
  await sleep(1000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    return { x: g.player.x.toFixed(1), z: g.player.z.toFixed(1), speed: g.player.inCar?.speed.toFixed(1), inCar: !!g.player.inCar };
  });
  console.log('drive t+' + (i + 1) + 's', JSON.stringify(s));
}
await page.keyboard.up('KeyW');
await page.keyboard.press('KeyE');
await sleep(400);
// heat + police
await page.evaluate(() => { const g = window.__game; g.police.addHeat(60, g.time); console.log('heat set, stars', g.police.stars); });
for (let i = 0; i < 8; i++) {
  await sleep(1000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    return { state: g.state, stars: g.police.stars, heat: g.police.heat.toFixed(0), foot: g.police.footCops.length, cars: g.police.copCars.length, px: g.player.x.toFixed(0), pz: g.player.z.toFixed(0) };
  });
  console.log('police t+' + (i + 1) + 's', JSON.stringify(s));
}
await browser.close();
