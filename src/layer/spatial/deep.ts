// Helpers that see through open shadow roots. A site built from web
// components keeps its controls inside them (seen on Steamboat's service: every
// control of the player), where `querySelectorAll`, `closest` and `contains`
// on the document do not reach. Closed roots stay closed: nothing here pries.

/** The parent in the tree as drawn: the host, when `el` is at the top of a shadow root. */
export function composedParent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** `root.querySelectorAll(selector)`, carried on into every open shadow root below `root`. */
export function deepQueryAll(root: ParentNode, selector: string): Element[] {
  const out: Element[] = [...root.querySelectorAll(selector)];
  // An element that is itself a shadow root's host may also be `root`.
  const own = (root as Element).shadowRoot;
  if (own) out.push(...deepQueryAll(own, selector));
  for (const el of root.querySelectorAll('*')) {
    if (el.shadowRoot) out.push(...deepQueryAll(el.shadowRoot, selector));
  }
  return out;
}

/** `el.closest(selector)`, carried on out through shadow hosts. */
export function deepClosest(el: Element, selector: string): Element | null {
  for (let node: Element | null = el; node; ) {
    const hit = node.closest(selector);
    if (hit) return hit;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return null;
}

/** True when `inner` is `outer` or is drawn inside it, shadow roots included. */
export function deepContains(outer: Element, inner: Element): boolean {
  // One native check per shadow root on the way out, not one per ancestor:
  // this runs for every pair of candidates on every move.
  for (let node: Element | null = inner; node; ) {
    if (outer.contains(node)) return true;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? root.host : null;
  }
  return false;
}

/** The element that really has keyboard focus, however many shadow roots deep. */
export function deepActiveElement(doc: Document): Element | null {
  let active: Element | null = doc.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}
