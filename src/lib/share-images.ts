import { imageSources, vaultOrigin } from './image-paths.mjs';

export { chartImagePath, pieceImagePath } from './image-paths.mjs';

export async function readShareImages(source: keyof typeof imageSources, revision: string) {
  const root = vaultOrigin + imageSources[source].root;
  try {
    const response = await fetch(root + '/manifest.json', {
      redirect: 'error', signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return;
    const manifest = await response.json();
    if (manifest.revision !== revision || !/^[a-f0-9]{64}$/.test(manifest.design) ||
        !Array.isArray(manifest.files)) return;
    const files = new Set<string>(manifest.files);
    return (path: string) => files.has(path)
      ? `${root}/${path}?v=${revision.slice(0, 12)}-${manifest.design.slice(0, 12)}`
      : undefined;
  } catch {
    // An unavailable image set must not prevent playback or live drawing.
  }
}
