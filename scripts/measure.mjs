import { join } from 'node:path';
import { chromium, devices } from 'playwright';

const [address, selected, recording] = process.argv.slice(2);
if (!address || (selected && !['4g', 'slow'].includes(selected))) {
  console.error('Usage: node scripts/measure.mjs URL [4g|slow] [recording-directory]');
  process.exit(2);
}
const profiles = {
  '4g': { download: 9_000_000, upload: 1_500_000, latency: 170 },
  slow: { download: 1_440_000, upload: 675_000, latency: 562.5 },
};
const origin = new URL(address).origin;
const pages = await Promise.all(['/', '/listen/'].map(async (path) => {
  const response = await fetch(new URL(path, origin));
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return [path, (await response.arrayBuffer()).byteLength];
}));
console.log(JSON.stringify({ origin, documentBytes: Object.fromEntries(pages) }));
const browser = await chromium.launch({ channel: 'chrome' });

try {
  for (const [profile, network] of Object.entries(profiles)) {
    if (selected && selected !== profile) continue;
    const mobile = devices['iPhone 13'];
    const context = await browser.newContext({
      viewport: mobile.viewport,
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: recording ? { dir: recording, size: mobile.viewport } : undefined,
    });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const media = [];
      cdp.on('Network.responseReceived', ({ response }) => {
        if (!response.url.endsWith('.mp4')) return;
        const headers = Object.fromEntries(Object.entries(response.headers).map(([key, value]) =>
          [key.toLowerCase(), value]));
        media.push({ url: response.url, status: response.status, range: headers['content-range'] });
      });
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: network.latency,
        downloadThroughput: network.download / 8,
        uploadThroughput: network.upload / 8,
        connectionType: 'cellular4g',
      });
      await page.addInitScript(() => {
        const readings = [];
        const record = (event, data = {}) => readings.push({ event, ms: performance.now(), ...data });
        window.bachMeasure = { readings, record };
        const first = () => document.querySelector('.st-slide');
        document.addEventListener('click', (event) => {
          if (event.target.closest('[data-play]')) record('tap');
        }, true);
        for (const name of ['playing', 'waiting', 'pause', 'ended']) {
          document.addEventListener(name, ({ target }) => {
            if (!(target instanceof HTMLVideoElement)) return;
            const slide = target.closest('.st-slide');
            if (!slide) return;
            const index = [...slide.parentElement.children].filter((item) => item.matches('.st-slide')).indexOf(slide);
            record(name, { index, time: target.currentTime, source: target.currentSrc });
            if (name === 'playing') {
              target.requestVideoFrameCallback(() => {
                if (!target.paused && target.closest('.st-slide') === slide)
                  record('picture', { index, audio: target.webkitAudioDecodedByteCount, muted: target.muted });
              });
            }
          }, true);
        }
        new MutationObserver(() => {
          const button = first()?.querySelector('.st-word--wait');
          if (!button || getComputedStyle(button).display === 'none' ||
              readings.some(({ event }) => event === 'loading')) return;
          requestAnimationFrame(() => record('loading'));
        }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
      });
      await page.goto(new URL('/listen/', origin).href, { waitUntil: 'commit' });
      const poster = await page.evaluate(async () => {
        const firstPoster = () => document.querySelector('.st-slide img, .st-slide video[poster]');
        while (!firstPoster()) await new Promise(requestAnimationFrame);
        const target = firstPoster();
        const url = target instanceof HTMLImageElement ? target.src : target.poster;
        // Wait for the real request, then decode from the browser's cache for older video posters.
        if (!(target instanceof HTMLImageElement)) {
          while (!performance.getEntriesByName(url).length) await new Promise(requestAnimationFrame);
        }
        const image = target instanceof HTMLImageElement ? target : new Image();
        if (image !== target) image.src = url;
        await image.decode();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now();
      });
      await page.locator('.st-slide').first().locator('[data-play]').tap();
      await page.waitForFunction(() => window.bachMeasure.readings.some(({ event, index, time }) =>
        event === 'playing' && index === 0 && time < 1), null, { timeout: 120_000 });
      await page.waitForFunction(() => document.querySelector('.st-slide video')?.currentTime >= 9,
        null, { timeout: 120_000 });
      const { width, height } = mobile.viewport;
      const point = (y) => ({ x: width / 2, y });
      await page.evaluate(() => window.bachMeasure.record('swipe'));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(height * 0.82)] });
      for (let step = 1; step <= 8; step++) {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [point(height * (0.82 - step * 0.075))],
        });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForFunction(() => window.bachMeasure.readings.some(({ event, index }) =>
        event === 'picture' && index === 1), null, { timeout: 120_000 });
      const bufferedClip = await page.evaluate(async () => {
        const video = document.querySelectorAll('.st-slide')[1].querySelector('video');
        if (!video.currentSrc.startsWith('blob:')) return null;
        const bytes = await (await fetch(video.currentSrc)).arrayBuffer();
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return {
          publishedUrl: video.closest('.st-slide').querySelector('[data-save-clip]').href,
          bytes: bytes.byteLength,
          sha256: [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join(''),
        };
      });
      await page.waitForFunction(() => window.bachMeasure.readings.some(({ event, index }) =>
        event === 'ended' && index === 1), null, { timeout: 120_000 });
      const { readings, connection, posters } = await page.evaluate(() => ({
        readings: window.bachMeasure.readings,
        connection: navigator.connection?.downlink,
        posters: [...new Set(performance.getEntriesByType('resource').filter(({ name }) =>
          /poster.*\.(jpg|webp|png)/.test(name)).map(({ name }) => name))].length,
      }));
      const when = (name, index) => readings.find(({ event, index: slide }) =>
        event === name && (index === undefined || slide === index));
      const rounded = (number) => Number.isFinite(number) ? Math.round(number) : null;
      const stalls = readings.filter(({ event, time, index }) =>
        event === 'waiting' && time > 0.05 && index < 2);
      const clip = when('playing', 0)?.source;
      console.log(JSON.stringify({
        profile, network, connection, firstPosterMs: rounded(poster),
        tapToSoundAndPictureMs: rounded(when('picture', 0)?.ms - when('tap')?.ms),
        swipeToSoundAndPictureMs: rounded(when('picture', 1)?.ms - when('swipe')?.ms),
        tapToLoadingMs: rounded(when('loading')?.ms - when('tap')?.ms),
        stalls: stalls.map(({ index, time, ms }) => ({
          piece: index + 1, atSeconds: time,
          durationMs: rounded(readings.find((entry) =>
            entry.index === index && entry.ms > ms && ['playing', 'pause'].includes(entry.event))?.ms - ms),
        })),
        audioDecodedBytes: [when('picture', 0)?.audio, when('picture', 1)?.audio],
        muted: [when('picture', 0)?.muted, when('picture', 1)?.muted],
        posters, clip, bufferedClip, media,
      }));
    } finally {
      const video = context.pages()[0]?.video();
      await context.close();
      if (recording && video) {
        await video.saveAs(join(recording, `${profile}.webm`));
        await video.delete();
      }
    }
  }
} finally {
  await browser.close();
}
