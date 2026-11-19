// Debug probe: load the game, log every console message + failed request,
// report WebGL support and window.__shotReady over 15 s.
import puppeteer from '/home/hatch/workspace/reels/anim/node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CHROME = '/home/hatch/workspace/reels/anim/chrome/linux-157.0.8103.78/chrome-linux64/chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,720'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('requestfailed', (r) => console.log('[reqfail]', r.url(), r.failure()?.errorText));
page.on('response', (r) => { if (r.status() >= 400) console.log('[http' + r.status() + ']', r.url()); });
await page.goto('http://127.0.0.1:8080/index.html?shot=drive&seed=1', { waitUntil: 'domcontentloaded', timeout: 30000 });
for (let i = 0; i < 5; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const s = await page.evaluate(() => ({
    ready: window.__shotReady,
    title: document.title,
    jsError: document.getElementById('js-error')?.textContent || null,
    canvases: document.querySelectorAll('canvas').length,
    hudOn: document.getElementById('hud')?.classList.contains('on'),
    webgl: (() => { try { const c = document.createElement('canvas'); return !!c.getContext('webgl2'); } catch (e) { return 'throw:' + e.message; } })(),
  }));
  console.log(`t=${(i + 1) * 3}s`, JSON.stringify(s));
}
await browser.close();
