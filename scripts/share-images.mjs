import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  chartImagePath, imagePathIsValid, imageSources, pieceImagePath, vaultOrigin,
} from '../src/lib/image-paths.mjs';

const designs = [
  '.github/workflows/share-images.yml', 'scripts/share-images.mjs', 'package-lock.json',
  'src/lib/image-paths.mjs', 'src/lib/sleeve.mjs', 'src/lib/charts.mjs', 'src/lib/results.ts',
  'src/lib/vault.ts', 'src/lib/scores.ts', 'src/lib/model-name.mjs',
  'src/components/ResultsCharts.astro', 'src/styles/chart-fonts.css', 'src/styles/charts.css',
  'src/styles/global.css', 'src/styles/analytics.css', 'src/pages/p/[slug]/analytics.astro',
  'astro.config.mjs', 'src/pages/analysis.astro', 'src/pages/index.astro', 'src/layouts/Layout.astro',
];
const design = createHash('sha256').update(execFileSync('git', ['ls-files', '-s', '--', ...designs])).digest('hex');
const revisionPattern = /^[a-f0-9]{64}$/;
const cache = 'public, max-age=60, must-revalidate';
const bucket = 'bach-bench-vault';
const work = process.env.SHARE_IMAGE_WORK;

async function vaultResponse(path) {
  return fetch(vaultOrigin + path, {
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
}

async function plan() {
  const targets = [];
  for (const [source, { index, root }] of Object.entries(imageSources)) {
    const response = await vaultResponse(index);
    if (source === 'staging' && response.status === 404) continue;
    if (!response.ok) throw new Error(`${index} returned ${response.status}`);
    const { revision, schemaVersion, pieces } = await response.json();
    if (schemaVersion !== 1 || !revisionPattern.test(revision) || !Array.isArray(pieces)) {
      throw new Error(`Invalid index at ${index}`);
    }
    const marker = await vaultResponse(root + '/manifest.json');
    if (!marker.ok && marker.status !== 404) throw new Error(`Image manifest returned ${marker.status}`);
    const previous = marker.ok ? await marker.json() : {};
    if (previous.revision === revision && previous.design === design) {
      console.log(`${source}: index and design already published`);
      continue;
    }
    const active = pieces.filter(({ withdrawn }) => withdrawn === false).map(({ slug }) => slug);
    if (new Set(active).size !== active.length ||
        active.some(slug => !imagePathIsValid(pieceImagePath(slug)))) throw new Error('Invalid Piece slug');
    console.log(`${source}: ${previous.revision !== revision ? 'index revision changed' : 'design changed'}; rendering ${active.length} cards for ${revision}`);
    targets.push({ source, revision, pieces: active });
  }
  await mkdir(work, { recursive: true });
  await writeFile(join(work, 'plan.json'), JSON.stringify(targets));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `needed=${targets.length > 0}\n`);
  }
}

async function render(targets) {
  process.env.ASTRO_TELEMETRY_DISABLED = '1';
  const { build, preview } = await import('astro');
  const { chromium } = await import('playwright');
  const config = { server: { host: 'localhost', port: 0 } };
  process.env.PUBLIC_SHARE_IMAGE_RENDER = '1';
  await build(config);
  const server = await preview(config);
  const address = `http://localhost:${server.server.address().port}`;
  try {
    const browser = await chromium.launch({ executablePath: process.env.BACH_CHROME });
    try {
      // The hosted Vault allows the preview origin. Relay only detail reads for
      // the local renderer so it can use the same browser chart code.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
      await context.route(url => url.origin === vaultOrigin && url.pathname.endsWith('/detail.json'), async route => {
        const response = await vaultResponse(new URL(route.request().url()).pathname);
        await route.fulfill({
          status: response.status,
          headers: { 'content-type': 'application/json', 'access-control-allow-origin': address },
          body: await response.text(),
        });
      });
      for (const { source, revision, pieces } of targets) {
        const files = [];
        async function save(path, data) {
          if (!imagePathIsValid(path) || !data.startsWith('data:image/png;base64,')) throw new Error('Invalid image output');
          const destination = join(work, source, path);
          await mkdir(dirname(destination), { recursive: true });
          await writeFile(destination, Buffer.from(data.split(',')[1], 'base64'));
          files.push(path);
        }
        async function visit(path, usePage) {
          const page = await context.newPage();
          try {
            const response = await page.goto(`${address}${path}?image-render=${source}`, { waitUntil: 'domcontentloaded' });
            if (!response?.ok()) throw new Error(`Drawing page failed for ${path}`);
            await usePage(page);
          } finally {
            await page.close();
          }
        }
        for (const route of pieces.length ? ['/', '/analysis'] : []) {
          await visit(route, async page => {
            const data = JSON.parse(await page.locator('#bach-data').textContent());
            if (data.revision !== revision) throw new Error('Index changed during chart generation');
            await page.locator('#charts').scrollIntoViewIfNeeded();
            await page.waitForSelector('html[data-ready="1"]', { state: 'attached', timeout: 60_000 });
            const images = await page.evaluate(async () => {
              const outputs = [];
              for (const view of window.__bach.views) {
                for (const format of ['4x5', '16x9']) {
                  outputs.push([view.def.key, format, await window.__bach.exportDataURL(view.def.key, format)]);
                }
              }
              return outputs;
            });
            if (!images.length) throw new Error(`No charts rendered for ${route}`);
            for (const [key, format, data] of images) await save(chartImagePath(key, format), data);
          });
        }
        for (let start = 0; start < pieces.length; start += 4) {
          const batch = await Promise.allSettled(pieces.slice(start, start + 4).map(slug =>
            visit(`/p/${slug}/analytics`, async page => {
              const card = page.locator('#sleeve');
              if (await card.getAttribute('data-revision') !== revision) throw new Error('Index changed during card generation');
              await page.waitForSelector('#sleeve[src^="data:image/png;"]', { state: 'attached' });
              await save(pieceImagePath(slug), await card.getAttribute('src'));
            })));
          for (const result of batch) if (result.status === 'rejected') throw result.reason;
        }
        await mkdir(join(work, source), { recursive: true });
        await writeFile(join(work, source, 'manifest.json'), JSON.stringify({ revision, design, files: files.sort() }));
      }
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
}

async function publish(targets) {
  const endpoint = new URL(process.env.R2_ENDPOINT);
  if (endpoint.protocol !== 'https:' || !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.host) ||
      endpoint.href !== endpoint.origin + '/' || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    throw new Error('Missing or invalid R2 upload configuration');
  }
  const latest = execFileSync('gh', ['api', 'repos/wlkr-si/bach-bench-site/git/ref/heads/main', '--jq', '.object.sha'], {
    encoding: 'utf8',
  }).trim();
  if (latest !== process.env.GITHUB_SHA) {
    console.log('A newer main commit will be picked up by the next poll');
    return;
  }

  for (const { source, revision } of targets) {
    const { root, index } = imageSources[source];
    if (!root.startsWith('/derived/images/')) throw new Error('Invalid derived image root');
    const current = await vaultResponse(index);
    if (!current.ok || (await current.json()).revision !== revision) {
      console.log(`${source}: index moved; leaving publication for the next poll`);
      continue;
    }
    const manifest = JSON.parse(await readFile(join(work, source, 'manifest.json')));
    if (manifest.revision !== revision || manifest.design !== design) throw new Error('Invalid publication manifest');

    function upload(path, contentType) {
      if (path !== 'manifest.json' && !imagePathIsValid(path)) throw new Error('Invalid image key');
      execFileSync('aws', ['--endpoint-url', endpoint.origin, 's3api', 'put-object',
        '--bucket', bucket, '--key', root.slice(1) + '/' + path, '--body', join(work, source, path),
        '--content-type', contentType, '--cache-control', cache, '--no-cli-pager'],
      { stdio: ['ignore', 'ignore', 'inherit'] });
    }

    for (const file of manifest.files) upload(file, 'image/png');
    upload('manifest.json', 'application/json');
    const cards = manifest.files.filter(file => file.startsWith('cards/')).length;
    console.log(`${source}: published ${cards} cards and ${manifest.files.length - cards} chart images for ${revision}; design ${design}`);
  }
}

if (!work) throw new Error('Set SHARE_IMAGE_WORK to a temporary work directory');
const command = process.argv[2];
if (command === 'plan') await plan();
else if (command === 'render' || command === 'publish') {
  const targets = JSON.parse(await readFile(join(work, 'plan.json')));
  if (command === 'render') await render(targets);
  else await publish(targets);
} else throw new Error('Use plan, render or publish');
