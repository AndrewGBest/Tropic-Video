# Architecture

How the code is actually built. For why this approach was chosen, see `DESIGN.md`.

## Processes

```
main process (src/main)                    renderer: the service's web page
┌───────────────────────────┐              ┌────────────────────────────────────┐
│ window, fullscreen        │   loadURL    │ main world: the site's own scripts │
│ navigation allowlist      │ ───────────▶ │   (untouched, cannot see the app)  │
│ permission allowlist      │              ├────────────────────────────────────┤
│ user-origin tv.css        │  insertCSS   │ isolated world: preload + TV layer │
│ sleep inhibit, diagnostics│ ◀──────────  │   shares the DOM, not the JS       │
│ spike report              │  ipc tropic:msg  │                                    │
└───────────────────────────┘              └────────────────────────────────────┘
```

- **The layer runs in the preload's isolated world.** It can read and focus
  DOM elements and listen for input, but the site's JavaScript cannot reach it
  and it does not patch the site's JavaScript.
- **Nothing is exposed to the page.** There is no `contextBridge` API. The
  end-to-end test asserts the page sees no app globals.
- **One IPC channel, `tropic:msg`,** carrying the four message kinds in
  `src/shared/actions.ts`. The main process accepts it only from the top frame.

## Input pipeline

```
keyboard / IR remote / CEC helper ─┐
                                   ├─▶ Action ─▶ dispatch ─▶ navigator | player | bridge
gamepad (polled each frame) ───────┘
```

Every device is reduced to an `Action` (`src/shared/actions.ts`) by a pure
mapping function that takes the current mode:

- `browse`: arrows move focus, select clicks.
- `player`: left/right seek, select toggles play. Active when the player's
  video fills at least half the viewport and has started. The adapter's
  `playerRoot` says where the player lives; without it, the largest unmuted
  video is used. The layer never calls `play()`, `pause()` or sets
  `currentTime`: it asks the shell to press Space, Left or Right, and the
  site's own player acts on the key (see `src/shared/player-keys.ts`).
- `text`: a text field has focus, so only Escape and up/down are intercepted.

## Spatial navigation (`src/layer/spatial`)

- `geometry.ts` is pure. An aligned candidate (sharing at least 25% of the
  smaller element's extent on the cross axis) always beats an unaligned one.
  Left/right never leave the row. Up/down fall back to the nearest row.
- `navigator.ts` gathers visible, enabled controls, drops wrappers that contain
  another candidate, and focuses with a `data-tropic-focus` attribute plus real DOM focus.
- The focus ring is drawn by the overlay over the element's rectangle, so it
  does not depend on the site's styles.

## Site adapter (`adapters/primevideo.json`)

Data only: lists of selectors for extra focusable elements, the search field,
the player close control and purchase controls. Parsed defensively; bad
selectors are dropped. With an empty adapter the generic heuristics run. It is
empty today because no selector has been observed on the live site yet.

## Safety mechanisms

| Mechanism | Where | Tested by |
|---|---|---|
| Navigation allowlist (service + its account domains, https only) | `src/main/hosts.ts` | `test/safety.test.ts` |
| Permission allowlist (fullscreen, protected media only) | `src/main/index.ts` | review |
| Purchase guard in automation mode (clicks, key activation, form submits, URLs) | `src/layer/guard`, `src/main/index.ts` | unit + e2e |
| Diagnostics outline carries no text, labels, links or IDs | `src/layer/diagnostics/outline.ts` | `test/safety.test.ts` |
| Honest user agent | `src/main/hosts.ts` | unit + e2e |
| Hard-rule scan | `scripts/check-rules.mjs` | `npm run check` |

## Flags

| Flag | Effect |
|---|---|
| `--dev` | Windowed; allows `--url=` for `file:` and localhost fixtures |
| `--automation` | Installs the purchase guard and URL block. Required for any scripted or agent-driven run |
| `--spike` | Records Widevine component status and video events to `spike-report.json` in the user data folder |
| `--fullscreen` | Fullscreen even in dev |
| `--remote-debugging-port=N` | Chromium's own flag; how the e2e harness and an agent drive the app |

## Testing

- **Unit (`npm test`):** geometry, input mapping and repeat timing, purchase
  guard, outline sanitiser, adapter parsing, URL allowlist, user agent, and the
  navigator against a jsdom page with supplied rectangles.
- **End to end (`npm run e2e`):** launches the real app on `test/fixtures/home.html`
  and drives it over the DevTools protocol with no extra dependencies. The same
  harness is how an agent on a machine with a signed-in profile inspects the live site.
- **Not testable without the live site:** protected playback, the real page's
  markup, sign-in, the player mode detection against the real player.

## Not built yet

Player HUD, on-screen keyboard, settings screen, remapping, user styles, MPRIS,
CEC helper, adapter auto-update, packaging beyond config. See `ROADMAP.md`.
