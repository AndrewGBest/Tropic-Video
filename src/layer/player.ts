// Drives the page's own <video> element. Nothing here touches the media
// pipeline or DRM; it only uses the standard HTMLMediaElement API.
export function findMainVideo(doc: Document): HTMLVideoElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of doc.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      best = v;
      bestArea = area;
    }
  }
  if (!best) return null;
  const viewport = view.innerWidth * view.innerHeight;
  // A background trailer on a browse page is not "the player".
  return viewport > 0 && bestArea / viewport >= 0.5 ? best : null;
}

export function isPlayerActive(doc: Document): boolean {
  const v = findMainVideo(doc);
  return !!v && (!v.paused || v.currentTime > 0) && v.readyState > 0;
}

export function togglePlay(v: HTMLVideoElement): void {
  if (v.paused) void v.play().catch(() => undefined);
  else v.pause();
}

export function seekBy(v: HTMLVideoElement, seconds: number): void {
  const end = Number.isFinite(v.duration) ? v.duration : Infinity;
  v.currentTime = Math.min(Math.max(0, v.currentTime + seconds), end);
}
