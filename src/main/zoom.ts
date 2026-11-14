// TV scaling. The site is laid out for a desk; from a couch everything needs
// to be bigger. This uses the browser's ordinary page zoom (what Ctrl-plus
// does), so the site lays itself out for a smaller viewport and nothing about
// the page is rewritten.

/** The viewport height, in CSS pixels, the site should think it has. At this size it shows about four cards a row. */
export const TARGET_VIEWPORT_HEIGHT = 720;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3;

/**
 * Zoom factor for a window whose content area is `contentHeight` DIPs tall.
 * `override` is the user's `--zoom=` value: a positive number, or absent.
 * Never below 1: a small window is not made smaller still.
 */
export function tvZoom(contentHeight: number, override?: string): number {
  const forced = override === undefined ? NaN : Number(override);
  const raw = Number.isFinite(forced) && forced > 0 ? forced : contentHeight / TARGET_VIEWPORT_HEIGHT;
  if (!Number.isFinite(raw)) return MIN_ZOOM;
  // Two decimals: avoids relayout churn from tiny changes while a window is resized.
  return Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, raw)) * 100) / 100;
}
