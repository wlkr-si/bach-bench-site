import astro from '@astrojs/cloudflare/entrypoints/server';

const productionHost = 'bach.wlkr.si';
const legacyAssets = /^\/(?:_astro|analytics|charts)\//;
const pagePaths = /^\/(?:listen|gallery|analysis|method|results|p\/[^/]+(?:\/analytics)?)$/;

export default {
  fetch(...args: Parameters<typeof astro.fetch>) {
    const [request] = args;
    const url = new URL(request.url);
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (url.hostname === productionHost) {
        // Cloudflare serves our own static assets first. Fall through to the
        // original custom-domain Worker for historical URLs absent from this build.
        if (legacyAssets.test(url.pathname) || url.pathname === '/results/') {
          return fetch(new Request(request, { redirect: 'manual' }));
        }
        const page = url.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
        if ((pagePaths.test(page) || url.pathname === '/index.html') && url.pathname !== page + '/') {
          return new Response(null, { status: 307, headers: { location: page + '/' + url.search } });
        }
      } else if (url.pathname === '/results' || url.pathname === '/results/') {
        return new Response(null, { status: 301, headers: { location: '/analysis' + url.search } });
      }
    }
    return astro.fetch(...args);
  },
};
