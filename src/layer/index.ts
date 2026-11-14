// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
import type { Action, BridgeMessage, Direction, LayerOptions } from '../shared/actions';
import { firstMatch, type SiteAdapter } from './adapter/adapter';
import { buildOutline, sanitizeUrl } from './diagnostics/outline';
import { installPurchaseGuard } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { keyToAction, type Mode } from './input/keys';
import { isSecretField, OSK_ROWS, OskModel } from '../shared/osk';
import { InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo, type PlayerKey } from '../shared/player-keys';
import { findMainVideo, isPlayerActive, playerScope } from './player';
import { edgeControl, isVisible, SpatialNavigator } from './spatial/navigator';
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
    onFocusChange: (el) => {
      overlay.track(el);
      if (el && isTextEntry(el) && !isSecretField(el.getAttribute('type'), el.getAttribute('autocomplete'))) openOsk();
    },
    scope,
    skip: [...adapter.selectors.rowPrev, ...adapter.selectors.rowNext],
  });

  // Some menus open only when the pointer rests on their button. If Enter on
  // a button that says it is collapsed leaves it collapsed, the shell is asked
  // to put the pointer there. The pointer is taken away again on Back, or
  // when focus leaves the button and whatever it opened.
  let hoverHost: Element | null = null;
  let hoverTrigger: Element | null = null;
  let hoverTimer: number | undefined;
  const unhover = (): void => {
    if (!hoverHost) return;
    hoverHost = null;
    ignorePointerUntil = Date.now() + 500;
    send({ kind: 'hover', x: 1, y: 1 });
  };
  const hoverIfStillCollapsed = (target: Element): void => {
    if (target.getAttribute('aria-expanded') !== 'false') return;
    view.clearTimeout(hoverTimer);
    hoverTimer = view.setTimeout(() => {
      if (!target.isConnected || target.getAttribute('aria-expanded') !== 'false') return;
      const r = target.getBoundingClientRect();
      hoverHost = target.parentElement ?? target;
      hoverTrigger = target;
      ignorePointerUntil = Date.now() + 500;
      send({ kind: 'hover', x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
    }, 300);
  };

  // Left or right with nowhere to go: press the strip's own arrow, if the
  // adapter knows it. A carousel that swaps slides leaves focus on something
  // no longer shown, so focus then moves to the new slide.
  let edgeTimer: number | undefined;
  const moveInPage = (dir: Direction): void => {
    const moved = nav.move(dir);
    if (hoverHost && nav.focused && !hoverHost.contains(nav.focused)) unhover();
    if (moved || (dir !== 'left' && dir !== 'right')) return;
    const from = nav.focused;
    if (!from) return;
    const hit = edgeControl(from, dir === 'left' ? adapter.selectors.rowPrev : adapter.selectors.rowNext, view);
    if (!hit) return;
    (hit.control as HTMLElement).click();
    view.clearTimeout(edgeTimer);
    edgeTimer = view.setTimeout(() => {
      const f = nav.focused;
      if (!f || !isVisible(f, view)) nav.focusFirstIn(hit.container);
    }, 700);
  };

  /**
   * True while the user is on one of the player's own controls (reached with
   * up or down). The controls hide themselves after a while; focus is dropped
   * when that happens, which returns the keys to playback.
   */
  const onPlayerControl = (): boolean => {
    const f = nav.focused;
    // Outside the player this must answer without touching focus: it is also
    // asked by timers, and clearing here would drop focus on a browse page.
    if (!f || !inPlayer()) return false;
    if (scope()?.contains(f) && isVisible(f, view)) return true;
    nav.clear();
    return false;
  };

  // On-screen keyboard: shown when layer focus lands on a text field, so a
  // remote can type. It types through the shell, like a real keyboard would.
  const osk = new OskModel();
  let oskOpen = false;
  const drawOsk = (): void => overlay.keyboard(oskOpen ? OSK_ROWS : null, { row: osk.row, index: osk.index });
  const openOsk = (): void => {
    if (!oskOpen) osk.reset();
    oskOpen = true;
    drawOsk();
  };
  const closeOsk = (): void => {
    if (!oskOpen) return;
    oskOpen = false;
    drawOsk();
  };
  const pressOsk = (): void => {
    const key = osk.key;
    if (key.kind === 'char' || key.kind === 'space') {
      send({ kind: 'typeText', text: key.text ?? '' });
      return;
    }
    const name = key.kind === 'backspace' ? 'backspace' : 'enter';
    const info = playerKeyInfo(name);
    if (!info) return;
    injected.expect(info.domKey, Date.now());
    send({ kind: 'playerKey', key: name });
    if (key.kind === 'submit') closeOsk();
  };

  const mode = (): Mode => {
    if (oskOpen) {
      // The keyboard only makes sense while its field still has focus.
      if (isTextEntry(doc.activeElement)) return 'browse';
      closeOsk();
    }
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
  // The site hides its controls soon after the pointer stops (under two
  // seconds on the live site; a movement every second holds them). While the
  // user is on one, keep them up, so focus does not vanish mid-thought; give
  // up after a while without a key so the picture is not covered forever.
  const CONTROLS_LINGER_MS = 20_000;
  let lastControlKeyAt = 0;
  const keepAlive = view.setInterval(() => {
    if (Date.now() - lastControlKeyAt < CONTROLS_LINGER_MS && onPlayerControl()) revealControls();
  }, 1000);
  const moveInPlayer = (dir: Direction): void => {
    lastControlKeyAt = Date.now();
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

  let refocusTimer: number | undefined;
  let lastCloseAt = 0;
  let backStreak = 0;
  const back = (): void => {
    const active = doc.activeElement;
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      return;
    }
    if (hoverHost) {
      // Close the menu and put focus back on the button that opened it.
      unhover();
      if (hoverTrigger?.isConnected) nav.focus(hoverTrigger);
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
      // Ask the site's player with its own Escape key. With a menu open the
      // first Escape closes the menu and the next one the player, so history
      // is only the last resort: the third Back in a row that leaves the
      // player still open. Nothing is done on a timer; a closing player can
      // linger for a moment, and going back then would lose the title page.
      backStreak = Date.now() - lastCloseAt < 4000 ? backStreak + 1 : 1;
      lastCloseAt = Date.now();
      if (backStreak >= 3) {
        backStreak = 0;
        if (view.history.length > 1) view.history.back();
        return;
      }
      pressPlayerKey('close');
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
    if (oskOpen) {
      if (a.type === 'move') {
        // Up from the top row leaves the keyboard for the page.
        if (!osk.move(a.dir) && a.dir === 'up') {
          closeOsk();
          (doc.activeElement as HTMLElement | null)?.blur();
          nav.move('up');
        }
        drawOsk();
        return;
      }
      if (a.type === 'select') {
        pressOsk();
        return;
      }
      if (a.type === 'back') {
        closeOsk();
        return;
      }
      closeOsk();
    }
    switch (a.type) {
      case 'move':
        if (inPlayer()) moveInPlayer(a.dir);
        else moveInPage(a.dir);
        break;
      case 'select': {
        lastControlKeyAt = Date.now();
        const target = nav.focused;
        const box = target?.getBoundingClientRect();
        if (!nav.activate()) {
          nav.move('down');
          break;
        }
        if (target && !inPlayer()) hoverIfStillCollapsed(target);
        // Activating a player control can replace it (a menu opens, a list
        // changes). Pick focus up again next to where it was.
        if (box && inPlayer()) {
          view.clearTimeout(refocusTimer);
          refocusTimer = view.setTimeout(() => {
            if (inPlayer() && !onPlayerControl()) nav.focusNearest({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });
          }, 500);
        }
        break;
      }
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
    // A real keyboard is in use: typing a character puts the on-screen one away.
    if (oskOpen && e.isTrusted && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      closeOsk();
      return;
    }
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
      view.clearInterval(keepAlive);
      view.clearTimeout(refocusTimer);
      view.clearTimeout(hoverTimer);
      view.clearTimeout(edgeTimer);
      stopPads();
      stopGuard();
      stopSpike();
    },
  };
}
