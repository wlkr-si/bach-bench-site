export const vaultOrigin = 'https://vault.bach.wlkr.si';

export const imageSources = {
  live: { index: '/index.json', root: '/derived/images/live' },
  staging: { index: '/staging/site-98/index.json', root: '/derived/images/staging/site-98' },
};

export const pieceImagePath = slug => `cards/${slug}.png`;
export const chartImagePath = (key, format) => `charts/${key}-${format}.png`;

export function imagePathIsValid(path) {
  return /^(?:cards\/[a-z0-9]+(?:[.-][a-z0-9]+)*|charts\/[a-z0-9-]+-(?:4x5|16x9))\.png$/.test(path);
}
