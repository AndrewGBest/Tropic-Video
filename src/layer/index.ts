// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
import type { Action, BridgeMessage, Direction, LayerOptions } from '../shared/actions';
import { firstMatch, type SiteAdapter } from './adapter/adapter';
import { buildOutline, sanitizeUrl } from './diagnostics/outline';
import { installPurchaseGuard } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { keyToAction, type Mode } from './input/keys';
import { InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo, type PlayerKey } from '../shared/player-keys';
import { findMainVideo, isPlayerActive, playerScope } from './player';
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

  const playerRoots = adapter.selectors.playerRoot;
  const inPlayer = (): boolean => isPlayerActive(doc, playerRoots);
  /** While the player is open, focus stays among its own controls. */
  const scope = (): Element | null => {
    if (!inPlayer()) return null;
    const v = findMainVideo(doc, playerRoots);
    return v ? playerScope(v, playerRoots) : null;
  };

  const overlay = new Overlay(doc);
  const nav = new SpatialNavigator(doc, {
    extraFocusable: adapter.selectors.extraFocusable,
    ignoreWithin: HOST_TAG,
    onFocusChange: (el) => overlay.track(el),
    scope,
  });

  /**
   * True while the user is on one of the player's own controls (reached with
   * up or down). The controls hide themselves after a while; focus is dropped
   * when that happens, which returns the keys to playback.
   */
  const onPlayerControl = (): boolean => {
    const f = nav.focused;
    if (!f) return false;
    if (scope()?.contains(f) && isVisible(f, view)) return true;
    nav.clear();
    return false;
  };

  const mode = (): Mode => {
    if (isTextEntry(doc.activeElement)) return 'text';
    if (!inPlayer()) return 'browse';
    return onPlayerControl() ? 'browse' : 'player';
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

  // Up or down in the player: show the site's controls (they appear when the
  // pointer moves) and put focus on the nearest one in that direction.
  let ignorePointerUntil = 0;
  let controlsTimer: number | undefined;
  const revealControls = (): void => {
    ignorePointerUntil = Date.now() + 500;
    send({ kind: 'revealControls' });
  };
  const moveInPlayer = (dir: Direction): void => {
    revealControls();
    if (onPlayerControl()) {
      nav.move(dir);
      return;
    }
    // The controls are created and faded in after the pointer moves; wait for them.
    let tries = 0;
    view.clearInterval(controlsTimer);
    controlsTimer = view.setInterval(() => {
      const done = !inPlayer() || (nav.candidates().length > 0 && nav.moveFrom({ x: view.innerWidth / 2, y: view.innerHeight / 2 }, dir));
      if (done || ++tries >= 15) view.clearInterval(controlsTimer);
    }, 100);
  };

  let closeTimer: number | undefined;
  let lastCloseAt = 0;
  const back = (): void => {
    const active = doc.activeElement;
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      return;
    }
    if (inPlayer()) {
      // First Back leaves the controls and returns to the picture.
      if (onPlayerControl()) {
        nav.clear();
        return;
      }
      const close = firstMatch(doc, adapter.selectors.playerClose);
      if (close) {
        (close as HTMLElement).click();
        return;
      }
      // Ask the site's player to close itself. History is the fallback, used
      // only when the picture is plainly still running a while later, or when
      // Back is pressed again: a closing player can linger for a moment, and
      // going back then would leave the title page as well.
      const again = Date.now() - lastCloseAt < 5000;
      lastCloseAt = Date.now();
      view.clearTimeout(closeTimer);
      if (again) {
        if (view.history.length > 1) view.history.back();
        return;
      }
      pressPlayerKey('close');
      closeTimer = view.setTimeout(() => {
        const v = findMainVideo(doc, playerRoots);
        if (v && !v.paused && view.history.length > 1) view.history.back();
      }, 2500);
      return;
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
        if (inPlayer()) moveInPlayer(a.dir);
        else nav.move(a.dir);
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

  const onPointer = (): void => {
    // The shell's own nudge (see revealControls) is not the user reaching for a mouse.
    if (Date.now() < ignorePointerUntil) return;
    doc.documentElement.classList.remove('tropic-no-pointer');
  };
  view.addEventListener('mousemove', onPointer, { passive: true });

  const stopPads = startPolling(view, mode, dispatch);

  // Tell the shell when video is playing so it can hold off the screensaver.
  let lastPlaying = false;
  const playbackTimer = view.setInterval(() => {
    const v = findMainVideo(doc, playerRoots);
    const playing = !!v && !v.paused && !v.ended;
    // Focus left over from the page behind must not carry into the player, and
    // the ring must not sit on the picture unless the user is on a control.
    if (playing && !lastPlaying) nav.clear();
    else if (playing && !onPlayerControl()) overlay.track(null);
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
      view.clearInterval(controlsTimer);
      view.clearTimeout(closeTimer);
      stopPads();
      stopGuard();
      stopSpike();
    },
  };
}
