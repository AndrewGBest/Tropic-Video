// Finds the site's player. Observation only: nothing here controls the video
// element or touches the media pipeline or DRM. Control is sent as ordinary
// key presses (see shared/player-keys.ts).

function largestVideo(scope: ParentNode, skipMuted: boolean): { video: HTMLVideoElement; area: number } | null {
  let best: HTMLVideoElement | null = null;
  let bestArea = 0;
  for (const v of scope.querySelectorAll('video')) {
    // Background trailers on browse and title pages start muted; the player does not.
    if (skipMuted && v.muted) continue;
    const r = v.getBoundingClientRect();
    const area = r.width * r.height;
    if (area > bestArea) {
      best = v;
      bestArea = area;
    }
  }
  return best ? { video: best, area: bestArea } : null;
}

/**
 * The video the user is watching, or null on a browse page.
 *
 * `playerRoots` are adapter selectors for the element the site's player lives
 * in. When any of them matches, only videos inside it count, which keeps a
 * full-width background trailer from being mistaken for the player. When none
 * matches (empty or stale adapter) the generic rule applies: the largest
 * unmuted video, if it covers at least half the viewport.
 */
export function findMainVideo(doc: Document, playerRoots: readonly string[] = []): HTMLVideoElement | null {
  const view = doc.defaultView;
  if (!view) return null;
  const viewport = view.innerWidth * view.innerHeight;
  if (viewport <= 0) return null;

  const roots: Element[] = [];
  for (const sel of playerRoots) {
    try {
      roots.push(...doc.querySelectorAll(sel));
    } catch {
      // A bad selector must never break playback detection.
    }
  }

  let found: { video: HTMLVideoElement; area: number } | null = null;
  if (roots.length > 0) {
    for (const root of roots) {
      const hit = largestVideo(root, false);
      if (hit && (!found || hit.area > found.area)) found = hit;
    }
  } else {
    found = largestVideo(doc, true);
  }
  return found && found.area / viewport >= 0.5 ? found.video : null;
}

export function isPlayerActive(doc: Document, playerRoots: readonly string[] = []): boolean {
  const v = findMainVideo(doc, playerRoots);
  return !!v && (!v.paused || v.currentTime > 0) && v.readyState > 0;
}

/**
 * The element holding the player and its controls: the adapter's root when it
 * contains the video, otherwise the highest ancestor that is no bigger than
 * the viewport (the page behind a full-window player is taller or absent).
 */
export function playerScope(video: HTMLVideoElement, playerRoots: readonly string[] = []): Element {
  for (const sel of playerRoots) {
    try {
      const root = video.closest(sel);
      if (root) return root;
    } catch {
      // ignore a bad selector
    }
  }
  const view = video.ownerDocument.defaultView;
  const maxW = (view?.innerWidth ?? 0) + 2;
  const maxH = (view?.innerHeight ?? 0) + 2;
  let scope: Element = video.parentElement ?? video;
  for (let el = scope.parentElement; el && el !== video.ownerDocument.body; el = el.parentElement) {
    const r = el.getBoundingClientRect();
    if (r.width > maxW || r.height > maxH) break;
    scope = el;
  }
  return scope;
}
