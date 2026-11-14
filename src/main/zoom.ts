// TV scaling. The site is laid out for a desk; from a couch everything needs
// to be bigger. This uses the browser's ordinary page zoom (what Ctrl-plus
// does), so the site lays itself out for a smaller viewport and nothing about
// the page is rewritten.

/**
 * The viewport, in CSS pixels, the site should think it has. 960x540 is the
 * usual canvas for couch-distance layouts (a 1080p screen at 2x). On the live
 * site it still shows the full navigation bar and four cards to a row; at 865
 * wide (seen on a 16:10 screen) the site collapses its navigation into a
 * menu, so the width is a floor as well as the height.
 */
export const TARGET_VIEWPORT = { width: 960, height: 540 } as const;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/**
 * Zoom factor for a window whose content area is `content` DIPs.
 * The viewport after zooming is never smaller than the target in either
 * direction, and a small window is never zoomed out (minimum 1).
 * `override` is the user's `--zoom=` value: a positive number, or absent.
 */
export function tvZoom(content: { width: number; height: number }, override?: string): number {
  const forced = override === undefined ? NaN : Number(override);
  const raw =
    Number.isFinite(forced) && forced > 0
      ? forced
      : Math.min(content.width / TARGET_VIEWPORT.width, content.height / TARGET_VIEWPORT.height);
  if (!Number.isFinite(raw)) return MIN_ZOOM;
  // Rounded down to two decimals: never zooms past the target, and avoids
  // relayout churn from tiny changes while a window is resized.
  return Math.floor(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw)) * 100 + 1e-6) / 100;
}

/**
 * Converts a point the page side asked to hover (CSS pixels) into window
 * pixels, or null when the request is not two finite numbers inside the window.
 */
export function hoverPoint(
  request: { x?: unknown; y?: unknown },
  zoom: number,
  content: readonly number[] | undefined,
): { x: number; y: number } | null {
  const [width = 0, height = 0] = content ?? [];
  if (typeof request.x !== 'number' || typeof request.y !== 'number') return null;
  if (!Number.isFinite(request.x) || !Number.isFinite(request.y) || !Number.isFinite(zoom) || zoom <= 0) return null;
  const x = Math.round(request.x * zoom);
  const y = Math.round(request.y * zoom);
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return { x, y };
}
