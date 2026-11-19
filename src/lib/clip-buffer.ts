export function vaultMediaAllowsCors(origin: string) {
  return origin === 'https://bach.wlkr.si' ||
    origin === 'https://bach-bench-site.walkerworlddiscord.workers.dev';
}

export function canStreamClip() {
  const connection = (navigator as Navigator & {
    connection?: { downlink: number; saveData?: boolean };
  }).connection;
  return connection && !connection.saveData && connection.downlink >= 5;
}

export async function downloadClip(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Clip unavailable');
  return response.blob();
}

export function allowPlayback(video: HTMLVideoElement) {
  // Register the tap while the Clip finishes loading. The element has no source yet.
  void video.play().catch(() => {});
  video.pause();
}
