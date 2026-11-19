import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const html = await readFile('dist/analysis/index.html', 'utf8');
if (!html.includes('id="bach-data"')) {
  console.log('No measurements available for chart exports.');
  process.exit(0);
}
const fragments = ['fontfaces', 'bach-data', 'bach-charts'].map((id) => {
  const fragment = html.match(new RegExp(`<(style|script)[^>]* id="${id}"[^>]*>[\\s\\S]*?</\\1>`));
  if (!fragment) throw new Error(`Missing Analysis chart source: ${id}`);
  return fragment[0];
});
const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  executablePath: process.env.BACH_CHROME ?? (existsSync(macChrome) ? macChrome : undefined),
});
try {
  const page = await browser.newPage();
  await page.setContent('<div id="toolbar"></div><div id="charts"></div>' + fragments.join(''));
  await page.waitForSelector('html[data-ready="1"]');
  const images = await page.evaluate(async () => {
    const images = {};
    for (const [index, view] of window.__bach.views.entries()) {
      for (const format of ['4x5', '16x9']) {
        const filename = `${index + 1}-${view.slug()}-${format}.png`;
        images[filename] = await window.__bach.exportDataURL(view.def.key, format);
      }
    }
    return images;
  });
  await mkdir('dist/charts', { recursive: true });
  await Promise.all(Object.entries(images).map(([name, data]) =>
    writeFile('dist/charts/' + name, Buffer.from(data.split(',')[1], 'base64')),
  ));
} finally {
  await browser.close();
}
