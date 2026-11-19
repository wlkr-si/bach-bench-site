import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const site = process.env.BACH_SITE_URL || 'https://bach-bench-site.walkerworlddiscord.workers.dev';
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.BACH_CHROME ?? (existsSync(macChrome) ? macChrome : undefined),
});
try {
  const page = await browser.newPage();
  const response = await page.goto(new URL('/analysis', site).href);
  if (!response?.ok()) throw new Error('Analysis is unavailable.');
  if (!(await page.locator('#bach-data').count())) {
    console.log('No measurements available for chart exports.');
    process.exitCode = 0;
  } else {
    await page.waitForSelector('html[data-ready="1"]');
    const images = await page.evaluate(async () => {
      const files = {};
      for (const [index, view] of window.__bach.views.entries()) {
        for (const format of ['4x5', '16x9']) {
          const filename = `${index + 1}-${view.slug()}-${format}.png`;
          files[filename] = await window.__bach.exportDataURL(view.def.key, format);
        }
      }
      return files;
    });
    await mkdir('dist/charts', { recursive: true });
    await Promise.all(Object.entries(images).map(([name, data]) =>
      writeFile('dist/charts/' + name, Buffer.from(data.split(',')[1], 'base64')),
    ));
  }
} finally {
  await browser.close();
}
