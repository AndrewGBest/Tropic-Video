# Status

Update this at the end of every working session.

## As of 2026-11-13 (session 2, Andrew's Fedora VM, live site reachable)

### Changed in session 2

- Spike probe (`src/layer/spike.ts`) now records a `timeupdate` sample every
  ten seconds per video and whether MediaKeys are attached to the element.
- `VM-SETUP.md`: the first, signed-out spike run is hand-driven without
  `--automation`. Two entries added to `DECISIONS.md`.

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

### Still not verified after session 2

- Any resolution above 960x540, and playback on bare metal.
- Everything else in the "NOT verified" list below except the first item and
  the sign-in and user-agent parts of the second.

### Found, not fixed

- A blocked navigation shows nothing: the window just stays black. It should
  show a toast or at least log the blocked URL's path.
- VA-API hardware decode fails to initialise in the VM (virtio GPU); decode is
  in software there.

### Next actions (replaces the list at the bottom)

1. Show something when a navigation is blocked.
2. Capture outlines from the live site and write adapter revision 1.
3. TV scaling and row memory.

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

- No TV scaling yet; the site renders at desktop size.
- `settings` action only shows a toast.
- Back in the player relies on history unless the adapter supplies a close control.
- The spend-word list will over-block in automation (for example "Sign up" links).

### Next actions

1. Andrew: create the GitHub repo and connect a VM (see `VM-SETUP.md`).
2. Agent on the VM: run the checks, then the spike with Andrew signing in.
3. Record the spike result; if playback fails, build the Chromium fallback shell.
4. Capture outlines from the live site and write adapter revision 1.
5. TV scaling and row memory.
