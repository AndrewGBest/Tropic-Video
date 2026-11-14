# Status

Update this at the end of every working session.

## As of 2026-11-13 (session 2, Andrew's Fedora VM, live site reachable)

### Changed in session 2

- Spike probe (`src/layer/spike.ts`) now records a `timeupdate` sample every
  ten seconds per video and whether MediaKeys are attached to the element.
- `VM-SETUP.md`: the first, signed-out spike run is hand-driven without
  `--automation`. Two entries added to `DECISIONS.md`.

- Refused navigations are no longer silent (`src/main/navigation.ts`): the
  terminal logs the reason with host and path only; a toast appears if a page
  is on screen; if nothing has loaded yet, a built-in notice page replaces the
  blank window. Fixed a race in the e2e Ctrl+Q step.

- Player control is now ordinary key presses sent by the shell; the layer no
  longer touches the video element (Hard rule 4; see `DECISIONS.md`).
- Adapter revision 1 with evidence outlines; new adapter keys `searchOpen` and
  `playerRoot`; search opens the site's hidden search field.
- The outline sanitiser masks free text embedded in ids and test ids. A local
  outline from the live site had carried the profile name in a test id; it was
  never committed.
- The focus ring is hidden while video plays.
- In the player, up or down shows the site's own controls and moves focus onto
  them; arrows then move between controls and Enter activates one. Back first
  returns to the picture, then closes the player with the site's own Escape
  handling (history is only the fallback).

- TV scaling: page zoom chosen so the site sees a 720-high viewport
  (`src/main/zoom.ts`); `--zoom=<factor>` overrides, `--zoom=1` turns it off.
- Row memory: entering a sideways-scrolling row goes to where you last were in
  it, or to its first card on screen.

### Verified in session 2, and how

| Claim | Evidence |
|---|---|
| Checks pass on the VM | `npm run check` (50 unit tests, rule check) and `npm run e2e` (14 steps) on the Wayland desktop |
| Widevine component installs | spike log and report: version 4.10.3112.0 |
| **Protected playback works in the shell in this VM (Phase 0)** | spike report from Andrew's hand-driven run: `eme-access` ok, MediaKeys attached, `encrypted` events, `currentTime` 0 to 100 s at 960x540, no `video-error` |
| Picture and sound were fine in that run | Andrew's report (the spike report sees element state, not pixels) |
| The site loads and sign-in completes in the shell | Andrew's report plus the playback above |
| Under `--automation` a signed-out start shows a blank window | DevTools: navigation cancelled; `curl`: home redirects to `/offers/nonprimehomepage`, which the guard's URL pattern blocks |
| With the signed-in profile, an `--automation` run loads the home page | `--dev --automation` run probed over DevTools: document on the service's home URL, `readyState` complete, about 2,300 elements; no redirect to `/offers/` |
| A refused navigation shows a toast and is logged without its query | e2e on the fixture; unit tests |
| A start page refused before anything loads shows the notice page | e2e with a local redirecting server; and a fresh signed-out profile under `--automation` against the live site (text read over DevTools, screenshot looked at) |
| Generic navigation works on the live home page: cards focus, rows scroll sideways, up/down change rows | `--automation` run driven over DevTools, focus position read after each key |
| Search key opens the site's search field and focuses it; Escape closes it | same run |
| On a title page the background trailer no longer puts the layer in player mode | same run: arrows moved focus through the page's buttons |
| The upsell link is blocked under automation | same run: Enter on it left the page unchanged |
| Space and Enter pause and resume; Left/Right seek ten seconds; during an advertisement the site refuses the seek | same run: video element state read before and after each key; screenshot of the site's "Unavailable" message |
| Back closes the player and returns to the title page | later run: Escape handled by the site's player; path stayed on the title page |
| Up/down in the player reveal the site's controls and focus them; arrows walk both control rows; Enter activates (tested on mute) | later run, focus position read after each key, four reveals out of four |
| Row memory on the live home page | run at `--zoom=1.25`: fresh row entered at its first card, earlier rows re-entered at the remembered card |
| Zoom applies and the ring, player controls and Back still line up | same run: viewport 1024x576, screenshot looked at, player controls focused, Back stayed on the title page |

### Still not verified after session 2

- Automatic zoom on a real 1080p or 4K screen (only the override was run, in a
  1280x720 window).

- Any resolution above 960x540, and playback on bare metal.
- Everything else in the "NOT verified" list below except the first item and
  the sign-in and user-agent parts of the second.

### Found, not fixed

- The player's controls hide about five seconds after the last key, and focus
  is then dropped; the next up/down starts again from the middle.
- Up from the player's bottom row lands on the volume slider, not the button.
  The seek bar itself is not reachable (left/right seek instead).
- The home page's top carousel: left/right do not change slide (all slides
  share one position); down leaves it normally.
- Menus opened from player controls (subtitles, audio) have not been walked.
- `sendInputEvent` needs the window to have focus. Fine on a TV; a desktop
  window in the background would ignore gamepad play/pause.
- Gamepad play/pause and seek are untested with a physical controller.

- Toasts for refused navigations are not rate-limited; a page that keeps
  trying to open other sites would keep showing them. Not seen on the live site.
- VA-API hardware decode fails to initialise in the VM (virtio GPU); decode is
  in software there.

### Next actions (replaces the list at the bottom)

1. Walk the player's subtitle and audio menus; next-episode and skip prompts.
2. The home page's top carousel; profile picker and sign-in pages with a remote.
3. Packaging: build and launch an AppImage; let CI run on GitHub.

## As of 2026-11-13 (session 1, cloud workspace, no access to the live site)

### Changed late in session 1

- Renamed from the working name "Couchstream" to **Tropic Video**; internal
  prefixes changed from `cs-` to `tropic-`.
- Licence changed from MIT to GPL-3.0 before anything was published.
- Imported into github.com/AndrewGBest/Tropic-Video on top of its initial commit.
- Andrew confirmed the service plays in Firefox inside his Fedora VM once DRM
  was enabled there, so protected playback works in that VM in a stock
  browser. This is his report, not something checked from this workspace, and
  it says nothing yet about the castLabs Electron shell.

### First VM run (reported by Andrew)

- Running the spike turned the VM's screen black and keys did nothing. Most
  likely cause, not confirmed: the spike opened fullscreen with a black
  background and the page did not render, and Ctrl+Q was handled only by the
  page-side layer, so there was no way out.
- Fixed: the spike now runs windowed, Ctrl+Q is handled in the main process,
  and page-load failures and renderer exits are logged to the terminal.
- Still unknown: why the page was blank. Suspect GPU compositing in the VM;
  try `--disable-gpu`.
- Resolved in session 2: the cause was not the GPU. The automation guard
  cancelled the signed-out home page's redirect to an `/offers/` URL (see the
  session 2 table above and `DECISIONS.md`).

### Built

- Project scaffold: TypeScript, esbuild, vitest, castLabs Electron 44.10.1.
- Main process with navigation allowlist, permission allowlist, sandboxed
  preload, sleep inhibit, diagnostics file writer, spike report.
- TV layer: spatial navigation, keyboard and gamepad input, mode detection,
  basic player control (play/pause, seek), focus ring and toast overlay,
  purchase guard, diagnostics outline, adapter parsing, spike probes.
- Tests: 50 unit tests; 14-step end-to-end run of the real app on a fixture.
- Rule checker (`scripts/check-rules.mjs`), CI and release workflows.
- Docs: design study, architecture, legal guardrails, roadmap, decisions, VM setup.

### Verified, and how

| Claim | Evidence |
|---|---|
| Type-checks, unit tests pass, bundles build | `npm run check` in the cloud workspace |
| The real castLabs Electron binary launches the app, the layer loads in the isolated world, the page sees no app API | `xvfb-run -a npm run e2e` |
| Controller-style navigation works on a card grid; left/right stay in the row | e2e + unit tests |
| Purchase guard blocks a "Rent" button under automation while "Play" goes through | e2e + unit tests |
| Diagnostics outline leaks no text, labels, links or IDs | unit tests with planted secrets |
| User agent contains real Chromium and Linux tokens, no Electron or app token | e2e |

### NOT verified

- **Protected playback.** In the cloud workspace the Widevine component could
  not install (no route to Google's component servers), so nothing about
  playback on the service is known yet. This is Phase 0 and still open.
- Anything about the live site: its markup, whether generic focus heuristics
  find its cards, sign-in flow inside the shell, player mode detection, back
  behaviour, whether the site accepts the shell's user agent.
- Gamepad polling with a physical controller (the mapping and repeat logic are
  unit-tested; the browser wrapper is not exercised).
- `powerSaveBlocker` actually holding off the screensaver on Wayland/gamescope.
- Packaging: `electron-builder --linux dir` produced an unpacked build in the
  cloud workspace, but that build was not launched, and no AppImage, tarball or
  Flatpak bundle has been made. The release workflow has never run.
- The CI workflows have not run on GitHub yet.
- Purchase-guard word list and URL patterns are heuristics, English only.

### Known gaps and rough edges

- (Resolved in session 2: TV scaling.)
- `settings` action only shows a toast.
- Back in the player relies on history unless the adapter supplies a close control.
- The spend-word list will over-block in automation (for example "Sign up" links).

### Next actions

1. Andrew: create the GitHub repo and connect a VM (see `VM-SETUP.md`).
2. Agent on the VM: run the checks, then the spike with Andrew signing in.
3. Record the spike result; if playback fails, build the Chromium fallback shell.
4. Capture outlines from the live site and write adapter revision 1.
5. TV scaling and row memory.
