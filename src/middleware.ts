import { defineMiddleware } from 'astro:middleware';
import { readDetail, readIndex } from './lib/vault';
import { readShareImages } from './lib/share-images';

const previewHost = 'bach-bench-site.walkerworlddiscord.workers.dev';
const stagingCookie = 'bach-staging';
const stagingLane = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const onRequest = defineMiddleware(async (context, next) => {
  const { url, cookies, locals } = context;
  const path = url.pathname.replace(/\/$/, '') || '/';
  const pieceRoute = path.match(/^\/p\/([^/]+)(\/analytics)?$/);
  if (!pieceRoute && !['/', '/listen', '/gallery', '/gallery/more', '/analysis'].includes(path)) return next();

  let staging: string | undefined;
  if (url.hostname === previewHost) {
    const selection = url.searchParams.get('vault');
    if (selection === 'staging') {
      const lane = url.searchParams.get('lane');
      if (lane !== null && !stagingLane.test(lane)) return new Response(null, { status: 400 });
      staging = lane ? `workshop/${lane}` : 'site-96';
      cookies.set(stagingCookie, staging, {
        path: '/', maxAge: 1800, httpOnly: true, sameSite: 'lax', secure: true,
      });
    } else if (selection === 'live') {
      cookies.delete(stagingCookie, { path: '/' });
    } else {
      const stored = cookies.get(stagingCookie)?.value;
      if (stored === '1' || stored === 'site-96') staging = 'site-96';
      if (stored?.startsWith('workshop/') && stagingLane.test(stored.slice(9))) staging = stored;
    }
  }

  const imageRender = import.meta.env.PUBLIC_SHARE_IMAGE_RENDER === '1' && url.hostname === 'localhost'
    ? url.searchParams.get('image-render')
    : null;
  const imageStaging = imageRender === 'staging' ||
    (url.hostname === previewHost && url.searchParams.get('vault') === 'staging-images');
  try {
    locals.vault = await readIndex(staging, imageStaging);
    if ((!staging || imageStaging) && !imageRender && (pieceRoute || path === '/' || path === '/analysis')) {
      locals.shareImage = readShareImages(imageStaging ? 'staging' : 'live', locals.vault.revision);
    }
    if (pieceRoute) {
      locals.piece = locals.vault.pieces.find(({ slug }) => slug === pieceRoute[1]);
      if (!locals.piece) locals.vaultProblem = 'missing';
      else if (pieceRoute[2]) locals.detail = await readDetail(locals.piece, locals.vault.revision);
    }
  } catch (error) {
    console.error('Could not read the Bach Vault', error);
    locals.vaultProblem = 'unavailable';
  }

  const response = await (locals.vaultProblem ? context.rewrite('/vault-status') : next());
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex');
  return response;
});
