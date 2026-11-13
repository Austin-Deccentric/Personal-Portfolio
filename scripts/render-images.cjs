// Renders the social card and touch icon from their HTML sources, so they use
// the brand fonts (sharp can't load web fonts). Run after editing the HTML:
//   node scripts/render-images.cjs
// Uses Playwright from the project or the global install.
const path = require('node:path');
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(require('node:child_process').execSync('npm root -g').toString().trim(), 'playwright'));
}

const root = path.join(__dirname, '..');
const jobs = [
  { src: 'scripts/og.html', out: 'public/og-image.png', width: 1200, height: 630 },
  { src: 'scripts/icon.html', out: 'public/apple-touch-icon.png', width: 180, height: 180 },
];

(async () => {
  const browser = await playwright.chromium.launch();
  for (const job of jobs) {
    const page = await browser.newPage({ viewport: { width: job.width, height: job.height } });
    await page.goto('file://' + path.join(root, job.src), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(root, job.out) });
    await page.close();
    console.log('wrote', job.out);
  }
  await browser.close();
})();
