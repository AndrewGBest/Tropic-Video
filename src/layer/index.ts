// Entry point of the page-side layer. Runs in the preload's isolated world:
// it shares the DOM with the site but not its JavaScript, so the site cannot
// tamper with it and it does not modify the site's own scripts.
import type { Action, BridgeMessage, LayerOptions } from '../shared/actions';
import { firstMatch, type SiteAdapter } from './adapter/adapter';
import { buildOutline, sanitizeUrl } from './diagnostics/outline';
import { installPurchaseGuard } from './guard/purchase-guard';
import { startPolling } from './input/gamepad';
import { keyToAction, type Mode } from './input/keys';
import { findMainVideo, isPlayerActive, seekBy, togglePlay } from './player';
import { SpatialNavigator } from './spatial/navigator';
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

  const mode = (): Mode => {
    if (isTextEntry(doc.activeElement)) return 'text';
    return isPlayerActive(doc) ? 'player' : 'browse';
  };

  const back = (): void => {
    const active = doc.activeElement;
    if (isTextEntry(active)) {
      (active as HTMLElement).blur();
      return;
    }
    if (isPlayerActive(doc)) {
      const close = firstMatch(doc, adapter.selectors.playerClose);
      if (close) {
        (close as HTMLElement).click();
        return;
      }
    }
    if (view.history.length > 1) view.history.back();
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
      case 'playPause': {
        const v = findMainVideo(doc);
        if (v) togglePlay(v);
        break;
      }
      case 'seek': {
        const v = findMainVideo(doc);
        if (v) seekBy(v, a.seconds);
        break;
      }
      case 'search': {
        const input = firstMatch(doc, [...adapter.selectors.searchInput, ...GENERIC_SEARCH]);
        if (input) nav.focus(input);
        break;
      }
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
    const action = keyToAction(e, mode());
    if (!action) return;
    e.preventDefault();
    e.stopPropagation();
    dispatch(action);
  };
  view.addEventListener('keydown', onKey, true);

  const onPointer = (): void => doc.documentElement.classList.remove('tropic-no-pointer');
  view.addEventListener('mousemove', onPointer, { passive: true });

  const stopPads = startPolling(view, mode, dispatch);

  // Tell the shell when video is playing so it can hold off the screensaver.
  let lastPlaying = false;
  const playbackTimer = view.setInterval(() => {
    const v = findMainVideo(doc);
    const playing = !!v && !v.paused && !v.ended;
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
      stopPads();
      stopGuard();
      stopSpike();
    },
  };
}
