// Screenshot capture for SOLMAR: opens each ?shot scene, waits for
// window.__shotReady, saves a JPEG. Usage: node test/shots.mjs [port] [shot...]
// Uses the known-good Chrome + puppeteer-core from the reels workspace.
import puppeteer from '/home/hatch/workspace/reels/anim/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/home/hatch/workspace/reels/anim/chrome/linux-157.0.8103.78/chrome-linux64/chrome';
const port = process.argv[2] || '8080';
const shots = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ['start', 'drive', 'chase', 'mission'];
const names = { start: '1-start.jpg', drive: '2-drive.jpg', chase: '3-chase.jpg', mission: '4-mission.jpg' };

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--window-size=1280,720', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

for (const shot of shots) {
  const url = `http://127.0.0.1:${port}/index.html?shot=${shot}&seed=1`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  try {
    await page.waitForFunction('window.__shotReady === true', { timeout: 30000 });
  } catch {
    console.log(`${shot}: TIMEOUT waiting for __shotReady (title=${await page.title()})`);
  }
  // one extra beat so the HUD/minimap paint
  await new Promise((r) => setTimeout(r, 700));
  const out = `screenshots/${names[shot]}`;
  await page.screenshot({ path: out, type: 'jpeg', quality: 88 });
  const title = await page.title();
  console.log(`${shot} -> ${out} (title: ${title})`);
}
await browser.close();
console.log('done');
