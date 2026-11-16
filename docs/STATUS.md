# Status

Update this at the end of every working session.

## 2026-11-16: first release, v0.1.0

Andrew asked for the first release after trying the builds on his TV box.
Tagged `v0.1.0`; the release workflow builds the packages and makes a draft,
which the agent then published as a pre-release at his request. The
packaged build of exactly this commit was **not run by anyone before
release**; the build Andrew tried was one commit of documentation earlier.

## 2026-11-16: second release, v0.1.1

Andrew asked for a release of everything since v0.1.0: the window opening
before the playback component is ready, the OK-button keys, pausing and
minimising when the app is left, and the new tagline. Published as a
pre-release, like v0.1.0.

## 2026-11-16: OK-button keys, and stopping when the app is left

Andrew: the Flatpak does launch from the desktop (only Discover's Launch
button did nothing; not looked into further). Two new reports:

| Report | Fix | Checked |
|---|---|---|
| Some remotes' OK button sends Space, not Enter, and could not select | Enter, Space, Select and Accept all select while browsing (and on the on-screen keyboard) and play or pause on the picture | Unit tests. **No such remote here**: not checked with one |
| Video and previews must not carry on when the app is left | On losing focus: the playing video is paused with the site's own key, the app is muted, and a fullscreen window is minimised 0.7 s later if focus is still gone | Live site in the VM, by raising the window's events from the main process: a playing episode paused and muted on blur; a key press unmuted; on minimise the page became hidden, the episode paused and the site removed its home-page preview by itself; restore unmuted and left it paused. **Not checked:** a real switch to another app, and the automatic minimise (the VM's compositor would not blur the window on request) |

## 2026-11-16: Flatpak from v0.1.0 "does nothing" on Andrew's box (open)

Andrew installed the v0.1.0 Flatpak through Discover and Launch showed
nothing. **Not reproduced:** the same file, installed for the user in the VM
and started with the launcher's exact command plus `--automation`, opened and
fetched Widevine. The cause on his box is **unknown** until he runs
`flatpak run io.github.andrewgbest.TropicVideo` in a terminal and reports
what it prints.

One real defect found while looking, fixed after v0.1.0: the window was only
created after the Widevine component was ready, so a slow or stuck first-run
download showed nothing at all, and further launches quit silently behind
the first. The window now opens at once on a "Starting" notice and the site
loads when the component is ready or after 45 seconds. Whether this is what
he hit is a **guess**.

## 2026-11-16: first run on Andrew's TV box (his report) and the fixes

Andrew ran the CI-built AppImage on his Linux TV box and reported four
problems. What was done, and how each was checked:

| Report | Cause | Fix | Checked |
|---|---|---|---|
| Sign-in: no keyboard until Down is pressed | The page focuses its first field by itself; the layer only opened the keyboard for focus it had moved | The layer adopts a text field the page focuses (`focusin`) | End-to-end fixture only. The agent cannot open the sign-in page (the automation guard blocks the signed-out site), so **not checked on the real sign-in page** |
| The keyboard's last key says "search" | Fixed label | "enter", except in a search field | Fixture; label not asserted (closed shadow root) |
| Same on the password and two-step pages | Hard rule 9: the keyboard stays out of password and one-time-code fields | A message now says so. **Typing these with the remote needs Andrew to change rule 9**; not done | Not checked |
| Fullscreen button "does nothing" and the ring goes | The site puts its player in element fullscreen, where only that element and the top layer are drawn | The overlay is a manual popover, re-shown on each fullscreen change | Live site in the VM: ring visible and movable in fullscreen |
| Live video: cannot reach Pause or the 10-second skips | On the station tried (one free news station) the site disables those three buttons itself | None possible. Down now lands on the nearest enabled control instead of Close | Live site in the VM. On an on-demand title Pause and both skips are reachable |

Second round of reports the same day:

| Report | Cause | Fix | Checked |
|---|---|---|---|
| Live video shows buttons that cannot be used | The site disables them | A disabled button inside the player is hidden by the TV stylesheet (`[data-tropic-player] button:disabled`) | Live site in the VM: Pause, both skips and Speed hidden on the live station; all present on an on-demand title before the change |
| Fast scrolling "bugs out" or jumps to the top | Far down a long page one move took about 0.3 s (every control on the page was examined), so held presses queued and each restarted a smooth scroll; the selection ran through the loaded rows into the footer, and when a row was re-rendered focus restarted from the top bar | Moves look near the screen first; a held key scrolls instantly, stops at the last loaded row instead of entering the footer, and lost focus resumes from what is on screen | Live site in the VM, 200 Down then 120 Up at 40 ms: focus stays centred, waits while rows load, carries on, and stops at the top. A key held on a real remote on the TV box is **not checked** |
| The ring bounces while the page scrolls | The ring eased toward its target while the target was itself moving | The ring has no easing; it is placed on its target every frame | By reading the code; not judged by eye |

Third round, same day:

| Report | Cause | Fix | Checked |
|---|---|---|---|
| The ring still bounces while the page scrolls | It was placed on screen by script each frame, a frame behind the browser's own scrolling | The ring is placed in page coordinates and scrolls with the page | Live site in the VM: aligned after scrolling and in fullscreen. Smoothness **not judged by eye** |
| The ring stays after a selection until the video loads | Focus was only dropped once playback began | After Enter, the ring goes as soon as something screen-sized is in front of what was selected | Live station in the VM: gone 0.8 s after Enter, before the video had data |
| Live TV is slow to start | **Not reproduced.** In the VM the same station played 1.6 to 2.0 s after Enter (two tries). The app does nothing during loading and changes none of the site's requests | None | So the delay on the TV box is the box, its network or the service; which is unknown |
| No @ on the keyboard; symbols for emails and passwords | Search-only layout | Capitals and a symbols face with every printable ASCII character; `@ . - _` on the letters face; Hard rule 9 changed (see DECISIONS) | Fixture end-to-end. Real sign-in pages **not checked** |

Seen on the way, not fixed: a title page with a background trailer starts
with no focus and the first Down goes to the top bar, not the play button; a
station's pop-up puts first focus on its close button, not "Watch Live".

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

- TV scaling: page zoom chosen so the site sees a viewport of at least
  960x540, 2x at 1080p (`src/main/zoom.ts`); `--zoom=<factor>` overrides, `--zoom=1` turns it
  off. The layer's toast and the notice page use couch-sized type.
- Row memory: entering a sideways-scrolling row goes to where you last were in
  it, or to its first card on screen.

- Packaging: an original icon (`assets/icon.svg`, rendered to `icon.png`) and
  a desktop name, so the AppImage no longer carries Electron's default icon.

- Carousels: left or right past the last control presses the strip's own
  arrow (adapter revision 2), and focus follows to the new slide. Focus now
  ignores controls inside a transparent ancestor and backdrop links stretched
  behind other controls.

- Hard rule 6 changed by Andrew: the service's TV layout may be used as a
  reference; no assets or marks (see `DECISIONS.md` and `DESIGN.md` 6a).
- Focus zoom: the focused card grows by 8%, picture and all, as on a TV.
- Focus on the first screenful (bar and banner) shows the page from the very
  top, so the banner is never half under the bar. Checked on the live site.

- Player controls stay up while focus is on one (a pointer nudge every
  second, for up to 20 seconds without a key). Styled radio and checkbox
  options take focus through their label, so the subtitles list is usable.
  Back with a menu open closes the menu first, then the player.

- Menus that open only on hover (the profile menu and the other navigation
  bar dropdowns): Enter rests the pointer on the button when a click leaves it
  collapsed; Back closes the menu and returns focus to the button.

- On-screen keyboard (`src/shared/osk.ts`, drawn by the overlay): appears when
  focus lands on a text field, types through the shell as ordinary text
  input, and is put away by Back or by typing on a real keyboard.

- Direction set by Andrew: keep to the site's own interface, own UI only where
  a remote needs it (`DESIGN.md` 5.2, `DECISIONS.md`).
- A made-up player page (`test/fixtures/player.html`) now covers player
  control in the e2e run. It exposed and fixed two focus races.

- Remote coverage walk of the live site (title page, home, Movies, Live TV,
  Store), which led to: episodes reachable; one focus target per spot; rows
  must be strips; up/down prefer page content over pinned bars. Adapter
  revision 3 guards the Store banner's checkout button.

- Lists opened by a label tied to a hidden checkbox (the season selector) are
  focusable, and Back closes them. Controls parked far off screen are never
  focus targets.
- Pop-ups (modal dialogs): focus moves in, stays in, Back closes with the
  site's Escape handling and focus returns to what opened it. Focus follows
  when a control scrolls the page to another section.

- Remote feedback: the ring bumps toward an edge that cannot be passed and
  gives a short squeeze when the focused control is pressed. Checked in the
  e2e run; not yet judged by eye on a TV.

- About and help panel on the settings key (Ctrl+O, right stick click): the
  required non-affiliation notice, the version and the remote's keys. A test
  keeps its wording identical to the guardrails and the README.

- README brought up to date; a "Build packages" workflow builds the AppImage
  and tarball on request and keeps them as an artifact, without a release.

- Config file (`config.json` in the user data folder): key remapping and a
  zoom setting, validated by `src/shared/config.ts`. Documented in the README.
  Gamepad buttons can be remapped the same way (unit-tested only).

- "Cannot reach the streaming service" notice when a page fails to load, with
  automatic retry (5 s, 10 s, ... up to every 30 s).
- Common remote buttons mapped by default (Back, Stop, Search, Menu, Info).

- Flatpak bundle built by the "Build packages" workflow (runtime 25.08), with
  permissions limited to network, display, sound, input devices and the
  screensaver, power and media-player bus names.

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
| The live site keeps its layout at the 960x540 TV canvas | run at `--zoom=1.3333` in the 1280x720 window: home, a title page and the player looked at in screenshots; controls focused; Back worked |
| Zoom applies and the ring, player controls and Back still line up | same run: viewport 1024x576, screenshot looked at, player controls focused, Back stayed on the title page |
| The AppImage builds and runs | `npm run dist`, then launched with a throwaway profile under `--spike --automation`: Widevine component fetched at run time, notice page shown; the unpacked build contains no CDM |
| CI runs on GitHub | `gh run list`: check and e2e green on each push to `main` |
| Left/right change slide in the home page's top carousel | run on the live site: right from the last button showed the next slide with focus on its play button (screenshot looked at) |
| The focused card grows with its picture | live home page at the 960x540 canvas, screenshot looked at |
| Subtitles from the remote | live site: the subtitles button toggles them; more, then Subtitles, opens the language list and each option takes focus (no option was changed) |
| Controls stay up while focused, then let go | live site: focus held through 10 s of sampling; gone after 20 s without a key |
| Back with a player menu open | live site: first Back leaves the controls, second closes the menu, third closes the player and stays on the title page |
| The profile menu opens, is walkable and closes from the remote | live site: Enter expanded it, down moved through its entries, Back hid it. No profile was switched |
| Search from the remote, end to end | live site: search key, letters, space and delete typed with the on-screen keyboard, its search key loaded the results page, arrows moved through the results grid; also e2e on the fixture |
| Navigation bar dropdowns from the remote | live site: Enter on a link that carries a menu opened the menu instead of following the link; down and up walked its entries; left closed it and moved to the next item; Enter on an entry loaded its page. Back returned focus to the profile button |
| Title page walks down and back up through every section, episodes included | live site, focus recorded after each key: banner buttons, tabs, each episode, related rows, details links, footer, and the same path back up |
| Home, Movies, Live TV and Store pages have no traps for up/down | live site, nine to sixteen Down presses each; focus always moved and was on screen |
| Title page tabs: left/right along the strip; Enter on Details scrolls there and focus follows | live site, focus and scroll position read |
| My Stuff and a movie's title page have no traps | live site, Down and Right walks |
| Live TV programme pop-up from the remote | live site: Enter opened it with focus on its close button, Back closed it, focus returned to the programme |
| Season selector from the remote | live site, a multi-season title: Down reached the selector, Enter showed seven season links, Down moved onto one, Back closed the list and focus returned to the selector. No season was switched |
| A collection grid walks in all four directions | live site: column kept going down, edges stop, more cards load as you go |
| Live TV from the remote | live site: a station's pop-up, its play button, the live player's controls, and Back to the pop-up. Space did not pause the live stream (the site's choice, not checked further) |
| Packages build in CI | "Build packages" workflow run on GitHub: check, e2e and electron-builder all green, artifact `tropic-video-linux-x64` produced (AppImage and tarball). The artifact itself was not downloaded and run |
| Media keys and desktop media widgets (MPRIS) | live site: Chromium registered an MPRIS player while a title played (status Playing, can pause, can seek); its PlayPause paused and resumed the picture. No code of ours is involved |
| Sleep is held off during playback and released when paused | live site on KDE Wayland: the session's inhibition list had three entries from the app while playing (two from Chromium, one from `powerSaveBlocker`), none while paused or browsing, three again on resume |
| Unreachable service shows a notice and recovers | e2e: start page on a closed port showed the notice; when a server appeared on that port the page loaded by itself |
| The Flatpak bundle builds and runs | built in CI; the artifact was downloaded, installed for one user, and launched under `--spike --automation`: Widevine component fetched inside the sandbox, notice page shown. Removed again afterwards |

### Still not verified after session 2

- The cannot-connect notice against the real service (only a local closed
  port was tried), and losing the network in the middle of a session.
- Sleep inhibition under X11, GNOME and gamescope (only KDE Wayland was checked).

- Remote coverage still to walk: the rent or buy drawer on a movie page (not
  opened under automation).

- Sign-in pages with a remote. An agent-driven run must use `--automation`,
  which blocks the signed-out landing page, so only Andrew can try these.
- Switching profile.

- Playback in the packaged builds. The CI-built AppImage was launched with the
  signed-in data folder it shares with the dev build (`~/.config/tropic-video`)
  under `--spike --automation`: the home page loaded signed in at the TV scale
  and the remote moved focus. Nothing was played in it. An earlier note here
  said the folders differed and was wrong. The Flatpak has its own folder and
  needs one sign-in.
- The release workflow's last step (creating the draft release on a tag). Its
  build steps are the same as the "Build packages" workflow, which passes.
  Also the tarball, and how the icon looks in a desktop launcher.

- Automatic zoom on a real 1080p or 4K screen. It was run fullscreen on this
  VM's 1280x800 display (zoom 1.33, viewport 962x601, full navigation bar).

- Any resolution above 960x540, and playback on bare metal.
- Everything else in the "NOT verified" list below except the first item and
  the sign-in and user-agent parts of the second.

### Found, not fixed

- The on-screen keyboard has lower-case letters, digits and four symbols
  only: no capitals, accents or other scripts, so it suits search, not
  passwords. Sign-in still needs a real keyboard.

- During an advertisement the player's more menu does not open, and the
  reveal of controls was unreliable around the switch from advertisement to
  programme (seen once; eight of eight later).
- Up from the player's bottom row lands on the volume slider, not the button.
  The seek bar itself is not reachable (left/right seek instead).
- The audio menu and subtitle settings have not been walked (subtitles have).
- `sendInputEvent` needs the window to have focus. Fine on a TV; a desktop
  window in the background would ignore gamepad play/pause.
- Gamepad play/pause and seek are untested with a physical controller.

- Toasts for refused navigations are not rate-limited; a page that keeps
  trying to open other sites would keep showing them. Not seen on the live site.
- VA-API hardware decode fails to initialise in the VM (virtio GPU); decode is
  in software there.

### Next actions (replaces the list at the bottom)

1. Next-episode and skip prompts in the player; the audio menu.
2. Andrew: try signing in with only a remote or keyboard (signed-out pages cannot be driven by the agent).
3. First release: Andrew signs in to the packaged build and tags a version.

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
- (Checked in session 2 on KDE Wayland; see above. Gamescope still unchecked.)
- Packaging: `electron-builder --linux dir` produced an unpacked build in the
  cloud workspace, but that build was not launched, and no AppImage, tarball or
  Flatpak bundle has been made. The release workflow has never run.
- The CI workflows have not run on GitHub yet.
- Purchase-guard word list and URL patterns are heuristics, English only.

### Known gaps and rough edges

- (Resolved in session 2: TV scaling.)
- (Resolved in session 2: the settings key opens the About and help panel. There are still no settings to change.)
- Back in the player relies on history unless the adapter supplies a close control.
- The spend-word list will over-block in automation (for example "Sign up" links).

### Next actions

1. Andrew: create the GitHub repo and connect a VM (see `VM-SETUP.md`).
2. Agent on the VM: run the checks, then the spike with Andrew signing in.
3. Record the spike result; if playback fails, build the Chromium fallback shell.
4. Capture outlines from the live site and write adapter revision 1.
5. TV scaling and row memory.
