// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
import type { Action, BridgeMessage, LayerOptions } from '../shared/actions';
import { firstMatch, type SiteAdapter } from './adapter/adapter';
import { buildOutline, sanitizeUrl } from './diagnostics/outline';
import { installPurchaseGuard } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { keyToAction, type Mode } from './input/keys';
import { InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo, type PlayerKey } from '../shared/player-keys';
import { findMainVideo, isPlayerActive } from './player';
import { isVisible, SpatialNavigator } from './spatial/navigator';
import { HOST_TAG, Overlay } from './ui/overlay';
import { installSpikeProbes } from './spike';

export interface LayerDeps {
  doc: Document;
  options: LayerOptions;
  adapter: SiteAdapter;
  send: (msg: BridgeMessage) => void;
}

const GENERIC_SEARCH = ['input[type="search"]', '[role="search"] input', 'input[name*="search" i]', 'input[aria-label*="search" i]'];

function isTextEntry(el: Element | null): boolean {
  if (!el) return false;
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['button', 'submit', 'checkbox', 'radio', 'range', 'reset', 'file', 'image', 'color'].includes(el.type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

export interface Layer {
  dispatch: (a: Action) => void;
  /** Show a short message from the shell, for example that a navigation was refused. */
  notice: (text: string) => void;
  stop: () => void;
}

export function startLayer({ doc, options, adapter, send }: LayerDeps): Layer {
  const view = doc.defaultView;
  if (!view) throw new Error('layer needs a window');

  const overlay = new Overlay(doc);
  const nav = new SpatialNavigator(doc, {
    extraFocusable: adapter.selectors.extraFocusable,
    ignoreWithin: HOST_TAG,
    onFocusChange: (el) => overlay.track(el),
  });

  const playerRoots = adapter.selectors.playerRoot;
  const inPlayer = (): boolean => isPlayerActive(doc, playerRoots);
  const mode = (): Mode => {
    if (isTextEntry(doc.activeElement)) return 'text';
    return inPlayer() ? 'player' : 'browse';
  };

  // Player control is a real key press made by the shell, so the site's own
  // player decides what it does (it may refuse a seek during an advertisement).
  const injected = new InjectedKeys();
  const pressPlayerKey = (key: PlayerKey): void => {
    if (!inPlayer()) return;
    const info = playerKeyInfo(key);
    if (!info) return;
    injected.expect(info.domKey, Date.now());
    send({ kind: 'playerKey', key });
  };

  const back = (): void => {
    const active = doc.activeElement;
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      return;
    }
    if (inPlayer()) {
      const close = firstMatch(doc, adapter.selectors.playerClose);
      if (close) {
        (close as HTMLElement).click();
        return;
      }
    }
    if (view.history.length > 1) view.history.back();
  };

  // Some sites keep the search field hidden until a control is activated.
  // The control is clicked like any other; the field is focused once it shows.
  const visibleMatch = (selectors: readonly string[]): Element | null => {
    for (const sel of selectors) {
      try {
        for (const el of doc.querySelectorAll(sel)) if (isVisible(el, view)) return el;
      } catch {
        // A bad selector must never break navigation.
      }
    }
    return null;
  };
  let searchPoll: number | undefined;
  const openSearch = (): void => {
    const inputs = [...adapter.selectors.searchInput, ...GENERIC_SEARCH];
    const input = visibleMatch(inputs);
    if (input) {
      nav.focus(input);
      return;
    }
    const opener = visibleMatch(adapter.selectors.searchOpen);
    if (!opener) return;
    (opener as HTMLElement).click();
    let tries = 0;
    view.clearInterval(searchPoll);
    searchPoll = view.setInterval(() => {
      const shown = visibleMatch(inputs);
      if (shown) nav.focus(shown);
      if (shown || ++tries >= 15) view.clearInterval(searchPoll);
    }, 100);
  };

  const dispatch = (a: Action): void => {
    doc.documentElement.classList.add('tropic-no-pointer');
    switch (a.type) {
      case 'move':
        nav.move(a.dir);
        break;
      case 'select':
        if (!nav.activate()) nav.move('down');
        break;
      case 'back':
        back();
        break;
      case 'playPause':
      case 'seek': {
        const key = playerKeyFor(a);
        if (key) pressPlayerKey(key);
        break;
      }
      case 'search':
        openSearch();
        break;
      case 'diagnostics':
        send({ kind: 'diagnostics', outline: buildOutline(doc.documentElement), url: sanitizeUrl(view.location.href) });
        overlay.toast('Page outline saved (structure only, no text)');
        break;
      case 'settings':
        overlay.toast('Settings are not built yet');
        break;
      case 'exit':
        send({ kind: 'exit' });
        break;
    }
  };

  const onKey = (e: KeyboardEvent): void => {
    if (!e.isTrusted && !options.automation) return;
    // A key the layer asked the shell to press: it belongs to the site.
    if (e.isTrusted && injected.consume(e.key, Date.now())) return;
    const action = keyToAction(e, mode());
    if (!action) return;
    // In the player, a key that is already the site's own key for the action
    // goes straight to the site, untouched.
    if (isNativePlayerKey(e.key, action) && inPlayer()) return;
    e.preventDefault();
    // Immediate: the site may also listen on the window, and must not see a
    // key the layer has taken.
    e.stopImmediatePropagation();
    dispatch(action);
  };
  view.addEventListener('keydown', onKey, true);

  const onPointer = (): void => doc.documentElement.classList.remove('tropic-no-pointer');
  view.addEventListener('mousemove', onPointer, { passive: true });

  const stopPads = startPolling(view, mode, dispatch);

  // Tell the shell when video is playing so it can hold off the screensaver.
  let lastPlaying = false;
  const playbackTimer = view.setInterval(() => {
    const v = findMainVideo(doc, playerRoots);
    const playing = !!v && !v.paused && !v.ended;
    // The focus ring belongs to browsing; it must not sit on top of the picture.
    if (playing) overlay.track(null);
    if (playing !== lastPlaying) {
      lastPlaying = playing;
      send({ kind: 'playback', playing });
    }
  }, 2000);

  const stopGuard = options.automation
    ? installPurchaseGuard(doc, adapter.selectors.purchaseControls, () =>
        overlay.toast('Blocked: automation mode never activates purchase or sign-up controls'),
      )
    : (): void => undefined;

  const stopSpike = options.spike ? installSpikeProbes(doc, send) : (): void => undefined;

  return {
    dispatch,
    notice: (text) => overlay.toast(text, 6000),
    stop: () => {
      view.removeEventListener('keydown', onKey, true);
      view.removeEventListener('mousemove', onPointer);
      view.clearInterval(playbackTimer);
      view.clearInterval(searchPoll);
      stopPads();
      stopGuard();
      stopSpike();
    },
  };
}
