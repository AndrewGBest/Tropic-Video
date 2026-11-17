// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
import type { Action, BridgeMessage, Direction, LayerOptions } from '../shared/actions';
import { adapterReport, firstMatch, type SiteAdapter } from './adapter/adapter';
import { buildOutline, sanitizeUrl } from './diagnostics/outline';
import { installPurchaseGuard } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { keyToAction, type Mode } from './input/keys';
import { aboutTitle, HELP, NOTICE } from '../shared/about';
import { isSecretField, oskDock, OskModel } from '../shared/osk';
import { deepActiveElement, deepContains } from './spatial/deep';
import { InjectedKeys, isNativePlayerKey, playerKeyFor, playerKeyInfo, type PlayerKey } from '../shared/player-keys';
import { findMainVideo, isPlayerActive, isSeekBar, playerIsOwnPage, playerScope } from './player';
import { coveredByScreen, edgeControl, isVisible, MENU_ENTRY, openDialog, SpatialNavigator } from './spatial/navigator';
import { HOST_TAG, Overlay } from './ui/overlay';
import { installSpikeProbes } from './spike';

export interface LayerDeps {
  doc: Document;
  options: LayerOptions;
  adapter: SiteAdapter;
  send: (msg: BridgeMessage) => void;
}

/**
 * Controls that lead to search when the adapter names none, or names one the
 * site has since renamed: a link whose address says search. Only a link, so
 * nothing is pressed whose effect is not written on it.
 */
const GENERIC_SEARCH_OPEN = ['a[href$="/search" i]', 'a[href*="/search?" i]'];
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
  /** The app's window stopped being the one in front: pause what is playing. */
  away: () => void;
  stop: () => void;
}

export function startLayer({ doc, options, adapter, send }: LayerDeps): Layer {
  const view = doc.defaultView;
  if (!view) throw new Error('layer needs a window');

  const playerRoots = adapter.selectors.playerRoot;
  const inPlayer = (): boolean => isPlayerActive(doc, playerRoots);
  /** While the player is open, focus stays among its own controls. */
  const scope = (): Element | null => {
    // An open hover menu lies over the page; what is underneath is not reachable until it is closed.
    if (hoverHost?.isConnected) return hoverHost;
    // A pop-up the page opened in front of everything: only it can be reached.
    const dialog = openDialog(doc);
    if (dialog) return dialog;
    if (!inPlayer()) return null;
    const v = findMainVideo(doc, playerRoots);
    return v ? playerScope(v, playerRoots) : null;
  };

  const overlay = new Overlay(doc);
  /** A scripted run never types a password or a one-time code (Hard rule 9). A person may. */
  const keyboardBarred = (el: Element): boolean =>
    options.automation && isSecretField(el.getAttribute('type'), el.getAttribute('autocomplete'));
  const nav = new SpatialNavigator(doc, {
    extraFocusable: adapter.selectors.extraFocusable,
    ignoreWithin: HOST_TAG,
    onFocusChange: (el) => {
      overlay.track(el);
      if (!el || !isTextEntry(el)) return;
      if (keyboardBarred(el)) return;
      openOsk(el);
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
  const hoverOn = (target: Element): void => {
    const r = target.getBoundingClientRect();
    hoverHost = target.parentElement ?? target;
    hoverTrigger = target;
    ignorePointerUntil = Date.now() + 500;
    send({ kind: 'hover', x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
  };
  const hoverIfStillCollapsed = (target: Element): void => {
    if (target.getAttribute('aria-expanded') !== 'false') return;
    const page = view.location.href;
    view.clearTimeout(hoverTimer);
    hoverTimer = view.setTimeout(() => {
      // Not if the click went somewhere: the menu belongs to the page that was left.
      if (view.location.href !== page) return;
      if (target.isConnected && target.getAttribute('aria-expanded') === 'false') hoverOn(target);
    }, 300);
  };
  /**
   * A link that is also the button of a collapsed menu: Enter opens the menu
   * instead of following the link, so the menu's entries can be reached. The
   * menu is open after that, and Enter on the link follows it as usual.
   */
  const opensMenuFirst = (target: Element): boolean =>
    target instanceof HTMLAnchorElement && target.getAttribute('aria-expanded') === 'false' && hoverHost === null;

  // Left or right with nowhere to go: press the strip's own arrow, if the
  // adapter knows it. A carousel that swaps slides leaves focus on something
  // no longer shown, so focus then moves to the new slide.
  let edgeTimer: number | undefined;
  const moveInPage = (dir: Direction): void => {
    let moved = nav.move(dir);
    // Sideways out of an open menu: close it and carry on along the bar.
    if (!moved && hoverHost && (dir === 'left' || dir === 'right')) {
      const trigger = hoverTrigger;
      unhover();
      if (trigger?.isConnected) nav.focus(trigger);
      moved = nav.move(dir);
    }
    if (moved) return;
    const from = nav.focused;
    if (!from) return;
    const hit =
      dir === 'left' || dir === 'right'
        ? edgeControl(from, dir === 'left' ? adapter.selectors.rowPrev : adapter.selectors.rowNext, view)
        : null;
    if (!hit) {
      // Nowhere to go: say so, rather than seeming not to have heard the key.
      overlay.feedback(dir);
      return;
    }
    (hit.control as HTMLElement).click();
    view.clearTimeout(edgeTimer);
    // Twice: the new slide can still be sliding in at the first look, and
    // what was picked then may itself be put away when it settles.
    const settle = (again: boolean): void => {
      edgeTimer = view.setTimeout(() => {
        const f = nav.focused;
        if (!f || !isVisible(f, view)) nav.focusFirstIn(hit.container);
        if (again) settle(false);
      }, 700);
    };
    settle(true);
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
    const within = scope();
    if (within && deepContains(within, f) && isVisible(f, view)) return true;
    nav.clear();
    return false;
  };

  // On-screen keyboard: shown when layer focus lands on a text field, so a
  // remote can type. It types through the shell, like a real keyboard would.
  const osk = new OskModel();
  let oskOpen = false;
  let aboutOpen = false;
  let oskSubmit = 'enter';
  let oskSide: 'top' | 'bottom' = 'bottom';
  const drawOsk = (): void => overlay.keyboard(oskOpen ? osk.rows : null, { row: osk.row, index: osk.index }, oskSubmit, oskSide);
  const isSearchField = (el: Element): boolean => {
    try {
      return el.matches([...adapter.selectors.searchInput, ...GENERIC_SEARCH].join(','));
    } catch {
      return false;
    }
  };
  const openOsk = (field: Element): void => {
    if (!oskOpen) osk.reset();
    // The key says what it does: it only searches in a search field.
    oskSubmit = isSearchField(field) ? 'search' : 'enter';
    // Keep the keyboard off the field, so what is typed can be seen.
    const box = field.getBoundingClientRect();
    oskSide = oskDock({ top: box.top, bottom: box.bottom }, doc.defaultView?.innerHeight ?? 0);
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
    if (osk.switchPage()) {
      drawOsk();
      return;
    }
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
      if (isTextEntry(deepActiveElement(doc))) return 'browse';
      closeOsk();
    }
    if (isTextEntry(deepActiveElement(doc))) return 'text';
    if (!inPlayer()) return 'browse';
    return onPlayerControl() ? 'browse' : 'player';
  };

  // Player control is a real key press made by the shell, so the site's own
  // player decides what it does (it may refuse a seek during an advertisement).
  const injected = new InjectedKeys();
  const pressKey = (key: PlayerKey): void => {
    const info = playerKeyInfo(key);
    if (!info) return;
    injected.expect(info.domKey, Date.now());
    send({ kind: 'playerKey', key });
  };
  const pressPlayerKey = (key: PlayerKey): void => {
    if (inPlayer()) pressKey(key);
  };

  /** Moves focus into a pop-up that has opened, if it is not there already. */
  let openToggle: { label: HTMLLabelElement; input: HTMLInputElement } | null = null;
  let beforeDialog: Element | null = null;
  let dialogTimer: number | undefined;
  const enterDialog = (): boolean => {
    const dialog = openDialog(doc);
    if (!dialog) return false;
    const f = nav.focused;
    if (!f || !deepContains(dialog, f)) {
      beforeDialog = f;
      nav.focusFirstIn(dialog);
    }
    return true;
  };
  /** After asking a pop-up to close: once it has gone, focus returns to what opened it. */
  const leaveDialog = (): void => {
    view.clearTimeout(dialogTimer);
    dialogTimer = view.setTimeout(() => {
      if (openDialog(doc)) return;
      const back = beforeDialog;
      beforeDialog = null;
      if (back?.isConnected && isVisible(back, view)) nav.focus(back);
    }, 600);
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
    if (doc.hidden) return;
    if (Date.now() - lastControlKeyAt < CONTROLS_LINGER_MS && onPlayerControl()) revealControls();
  }, 1000);
  const moveInPlayer = (dir: Direction): void => {
    lastControlKeyAt = Date.now();
    revealControls();
    if (onPlayerControl()) {
      // On the progress bar, left and right are sent to the site as its seek
      // keys: nothing lies beside a bar that spans the screen. (On Steamboat's
      // site the focused bar answers them with its own small steps.)
      const f = nav.focused;
      if (f && (dir === 'left' || dir === 'right') && isSeekBar(f, view)) {
        pressPlayerKey(dir === 'left' ? 'seekBack' : 'seekForward');
        return;
      }
      if (!nav.move(dir)) overlay.feedback(dir);
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
  let followTimer: number | undefined;
  let coverTimer: number | undefined;
  let lastCloseAt = 0;
  let backStreak = 0;
  /** A menu was seen to open in the player and no Escape has been sent for it yet. */
  let playerMenuSeen = false;
  /** The address the user was last browsing at, outside the player. */
  let browseUrl: string | null = null;
  const back = (): void => {
    const active = deepActiveElement(doc);
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      return;
    }
    if (openToggle) {
      const { label, input } = openToggle;
      openToggle = null;
      if (label.isConnected && input.checked) {
        label.click();
        nav.focus(label);
        return;
      }
    }
    if (openDialog(doc)) {
      // The site closes its own pop-ups on Escape.
      pressKey('close');
      leaveDialog();
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
      // A player that is a page of its own is left like any page, once any
      // menu it has open is closed with the site's own Escape key.
      // A menu's entry can open a view with no entries of its own (a slider,
      // on Steamboat's service), so having seen the menu open counts until one
      // Escape has been sent for it.
      const menuOpen = playerMenuSeen || nav.candidates().some((el) => el.matches(MENU_ENTRY));
      playerMenuSeen = false;
      if (!menuOpen && playerIsOwnPage(browseUrl, view.location.href) && view.history.length > 1) {
        view.history.back();
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
    goBack();
  };
  // Going back a page. Some pages add a second history entry for themselves
  // as they load (seen on the title pages of Steamboat's service), and the first step
  // back then changes nothing the user can see. One more step is taken when
  // the address has not changed and no other key has come in.
  let backTimer: number | undefined;
  const goBack = (): void => {
    if (view.history.length <= 1) return;
    const before = view.location.pathname + view.location.search;
    view.history.back();
    view.clearTimeout(backTimer);
    backTimer = view.setTimeout(() => {
      if (view.location.pathname + view.location.search === before && !inPlayer() && !openDialog(doc)) view.history.back();
    }, 600);
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
    const opener = visibleMatch([...adapter.selectors.searchOpen, ...GENERIC_SEARCH_OPEN]);
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
    if (!inPlayer()) {
      browseUrl = view.location.href;
      playerMenuSeen = false;
    }
    doc.documentElement.classList.add('tropic-no-pointer');
    // A pending "pick focus up again" belongs to the previous key; a new key
    // overrides it (Back right after Enter must not have focus put back).
    view.clearTimeout(refocusTimer);
    view.clearTimeout(followTimer);
    view.clearTimeout(backTimer);
    view.clearInterval(coverTimer);
    if (aboutOpen) {
      // The panel only needs closing; every other key waits until it is gone.
      if (a.type === 'back' || a.type === 'select' || a.type === 'settings') {
        aboutOpen = false;
        overlay.about(null);
      }
      if (a.type !== 'exit') return;
    }
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
        if (target && !inPlayer() && opensMenuFirst(target)) {
          hoverOn(target);
          break;
        }
        if (!nav.activate()) {
          nav.move('down');
          break;
        }
        overlay.feedback('press');
        // A label that opens a list by ticking a hidden checkbox: remember it, so Back can close the list.
        if (target instanceof HTMLLabelElement && target.control instanceof HTMLInputElement && target.control.type === 'checkbox') {
          openToggle = target.control.checked ? { label: target, input: target.control } : null;
        }
        if (target && !inPlayer()) {
          hoverIfStillCollapsed(target);
          // Some controls scroll the page to another section (tabs that are
          // really jump links). Focus follows to what is now on screen.
          // What was selected may open something over the whole screen (the
          // player, while its video is still loading). The ring goes as soon
          // as that is in front, not when the video finally starts.
          let looks = 0;
          view.clearInterval(coverTimer);
          coverTimer = view.setInterval(() => {
            if (++looks > 60 || nav.focused !== target || openDialog(doc)) view.clearInterval(coverTimer);
            else if (coveredByScreen(target, view)) {
              view.clearInterval(coverTimer);
              nav.clear();
            }
          }, 150);
          view.clearTimeout(followTimer);
          followTimer = view.setTimeout(() => {
            if (enterDialog()) return;
            if (!inPlayer() && nav.focused === target && nav.focusIsOffScreen()) nav.focusFirstOnScreen();
          }, 900);
        }
        // Activating a player control can replace it (a menu opens, a list
        // changes). Pick focus up again next to where it was.
        if (box && inPlayer()) {
          const before = new Set(nav.candidates());
          view.clearTimeout(refocusTimer);
          refocusTimer = view.setTimeout(() => {
            if (!inPlayer()) return;
            const point = { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
            // A menu opened: go into it, rather than leave the user to find it.
            const opened = nav.candidates().filter((el) => !before.has(el) && el.matches(MENU_ENTRY));
            if (opened.length > 0) playerMenuSeen = true;
            if (opened.length > 0 && nav.focused === target) nav.focusNearest(point, opened);
            else if (!onPlayerControl()) nav.focusNearest(point);
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
        // The first line says how much of the adapter still matches this page:
        // a zero where there used to be matches is the site having changed.
        send({ kind: 'diagnostics', outline: `# ${adapterReport(adapter, doc)}\n${buildOutline(doc.documentElement)}`, url: sanitizeUrl(view.location.href) });
        overlay.toast('Page outline saved (structure only, no text)');
        break;
      case 'settings':
        closeOsk();
        aboutOpen = true;
        overlay.about({ title: aboutTitle(options.version), notice: NOTICE, help: HELP });
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
    // Not Space: on some remotes that is the OK button, and it must press the highlighted key.
    if (oskOpen && e.isTrusted && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      closeOsk();
      return;
    }
    const action = keyToAction(e, mode(), options.keys);
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

  // A text field the page focused by itself (a sign-in page puts the cursor
  // in its first field): take it as the remote's focus too, so the ring is on
  // it and the on-screen keyboard is up without a key press.
  const adoptField = (el: Element | null): void => {
    if (!el || !isTextEntry(el) || el.closest(HOST_TAG)) return;
    if (nav.focused !== el) nav.focus(el);
    // Already the remote's focus from before (the field was left and the page came back to it).
    else if (!oskOpen && !keyboardBarred(el)) openOsk(el);
  };
  const onFocusIn = (e: FocusEvent): void => adoptField(e.target instanceof Element ? e.target : null);
  doc.addEventListener('focusin', onFocusIn, true);
  adoptField(deepActiveElement(doc));

  const onPointer = (): void => {
    // The shell's own nudge (see revealControls) is not the user reaching for a mouse.
    if (Date.now() < ignorePointerUntil) return;
    doc.documentElement.classList.remove('tropic-no-pointer');
  };
  view.addEventListener('mousemove', onPointer, { passive: true });

  const stopPads = startPolling(view, mode, dispatch, options.buttons);

  // Tell the shell when video is playing so it can hold off the screensaver.
  let lastPlaying = false;
  let lastAwayAt = 0;
  const playbackTimer = view.setInterval(() => {
    // Minimised or behind another window: nothing to look after. Playback
    // was paused on the way out, and the shell must hear that it stopped.
    if (doc.hidden) {
      if (lastPlaying) {
        lastPlaying = false;
        send({ kind: 'playback', playing: false });
      }
      return;
    }
    const v = findMainVideo(doc, playerRoots);
    const playing = !!v && !v.paused && !v.ended;
    // Mark the player so the stylesheet can hide controls the site has disabled.
    if (v && inPlayer()) playerScope(v, playerRoots).setAttribute('data-tropic-player', '');
    // Focus left over from the page behind must not carry into the player, and
    // the ring must not sit on the picture unless the user is on a control.
    // (onPlayerControl drops focus that is outside the player. Focus on a
    // control is kept: pausing and resuming from the control bar must not lose it.)
    if (playing && !onPlayerControl()) overlay.track(null);
    // A pop-up that opened on its own takes focus too.
    if (!playing) enterDialog();
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
    away: () => {
      // The window is no longer in front. Pause through the site's own key,
      // and only if something is playing: the key is a toggle.
      // The shell may say it more than once for one departure (focus lost,
      // then minimised); a second key would start playback again.
      if (Date.now() - lastAwayAt < 3000) return;
      const v = findMainVideo(doc, playerRoots);
      if (v && inPlayer() && !v.paused && !v.ended) {
        lastAwayAt = Date.now();
        pressKey('playPause');
      }
    },
    stop: () => {
      view.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('focusin', onFocusIn, true);
      view.removeEventListener('mousemove', onPointer);
      view.clearInterval(playbackTimer);
      view.clearInterval(searchPoll);
      view.clearInterval(controlsTimer);
      view.clearInterval(keepAlive);
      view.clearTimeout(refocusTimer);
      view.clearInterval(coverTimer);
      view.clearTimeout(dialogTimer);
      view.clearTimeout(hoverTimer);
      view.clearTimeout(edgeTimer);
      view.clearTimeout(backTimer);
      stopPads();
      stopGuard();
      stopSpike();
    },
  };
}
