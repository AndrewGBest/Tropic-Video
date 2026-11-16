# TV-style Prime Video client for Linux HTPCs: design document

13 November 2026 · Draft 1 · Project name: **Tropic Video**. This is the original design study; later decisions are in `DECISIONS.md` and current state in `STATUS.md`.

Labels used throughout: **[Sourced]** means I read it in a source or in the repo code. **[Guess]** means my own reasoning with no source. I am not a lawyer; the legal section is a risk map, not legal advice.

## 1. Summary

**Recommendation:** build it the VacuumTube way, not the Vacuumflix way. A thin Chromium-based shell loads the normal primevideo.com site, and an original "10-foot layer" (your own code and CSS) adds controller navigation, a TV-scale layout, a player HUD and an on-screen keyboard.

**What this delivers:** a native-feeling, controller-driven Prime Video app for an HTPC, installable as a Flatpak, with no Amazon code in the repo and no DRM tampering.

**What it does not deliver:** Amazon's actual living-room interface. Getting that one means running Amazon's proprietary TV bundle the way Vacuumflix runs Netflix's, and every route to that carries the legal problems you asked to avoid (section 4, option C).

**Playback quality:** standard definition. Amazon's own help page limits non-Windows, non-macOS computers to SD [Sourced].

## 2. Prior art: what the two repos actually do

I cloned both repos and read the code.

### VacuumTube (shy1132/VacuumTube, MIT)

- **Shell:** stock Electron 44, about 1,600 lines in the main process [Sourced: package.json, src/].
- **UI source:** loads `https://www.youtube.com/tv`, Google's own hosted TV web app. Nothing of YouTube's is stored in the repo [Sourced: src/index.js].
- **Identity:** sends a user agent in the format of Cobalt, the engine TV YouTube apps run on, but with its own brand name "VacuumTube" in the device field [Sourced: src/ua.js].
- **Controller:** polls the browser Gamepad API every frame, prefers the Steam Input virtual pad, applies a 500 ms repeat delay and 100 ms repeat interval, and emits synthetic key events the page already understands [Sourced: src/preload/util/controller.js].
- **Extras:** about 40 preload modules (settings overlay, userstyles, volume, speed, touch), plus response-header edits to relax the page's content security policy [Sourced].
- **Packaging:** Flatpak on Flathub, AppImage, deb, tarball [Sourced].

**Why it is the clean pattern:** it wraps a page the service itself hosts, and adds its own code on top.

### Vacuumflix (Ciphay/Vacuumflix, MIT)

- **Runtime:** a Node.js host (`port2/runtime/host.js`, about 1,500 lines) that runs Netflix's TV scripts inside a `vm` context and fakes the device platform they expect, plus an SDL2/OpenGL ES renderer in C and a C++ process that loads the Widevine library directly [Sourced].
- **What is in the repo:** Netflix's TV UI JavaScript (pinned release, tens of MB), Netflix Sans font files, Netflix icons, the boot animation, and Google's `libwidevinecdm.so` binary (21 MB) [Sourced: tvui/, port2/assets/, port2/cdm/].
- **Other things I saw:** the desktop entry names the app "Netflix", the host patches the downloaded Netflix script before running it, and it generates its own device serial with a Netflix-style prefix [Sourced: host.js].

**Why it is the pattern to avoid:** the engineering is impressive, but it redistributes another company's code, fonts and logo, redistributes Google's CDM, uses the service's name as the app name, and presents itself to the server as a device class it is not. Its README disclaimer acknowledges the bundled material belongs to Netflix and Google [Sourced].

## 3. What Prime Video gives us to build on

- **Web player on Linux is officially supported**, at SD [Sourced: Prime Video system requirements].
- **The TV app is not a web page.** Amazon describes a C++ engine installed on the device plus a bundle downloaded at launch, now a Rust UI compiled to WebAssembly [Sourced: Amazon Science, QCon talk]. There is no public equivalent of youtube.com/tv to point a wrapper at [Guess: I found none; absence is not proof].
- **Widevine in Electron:** stock Electron has none. castLabs' Electron fork (ECS) adds it and fetches the CDM at runtime through Chromium's component updater [Sourced]. On Linux the CDM reports an unverified platform status and has no persistent licences [Sourced: castLabs release notes].
- **Risk:** the prime-wine author reported that Electron plus Widevine was "quite tricky" with Prime specifically [Sourced]. Whether Prime issues a licence to ECS on Linux is the single biggest unknown, so it is the first thing to test.
- **Existing alternative today:** the community Kodi add-on for Prime Video already gives a remote-driven interface on Linux, using Kodi's own UI and the Widevine library [Sourced]. If you just want something working this week, that is it. The rest of this document assumes you want a standalone app.

## 4. Approach options

| | A. Wrap the website + original TV layer | B. Fully original UI on Amazon's private APIs | C. Run Amazon's real TV bundle |
|---|---|---|---|
| Model | VacuumTube | Kodi add-on | Vacuumflix |
| Amazon code in your repo | None | None | Yes, or fetched and patched at runtime |
| DRM path | Browser's own EME + stock CDM | Your own CDM host | Your own CDM host + device impersonation |
| Looks like a TV app | Mostly (restyled web UI) | Yes (your design) | Yes (Amazon's design) |
| Breaks when Amazon changes things | Selectors break; fixable in hours | API calls break; fixable in days | Engine interface breaks; weeks |
| Legal exposure [Guess] | Lowest | Medium: undocumented API use, terms of use | Highest: copyright, anti-circumvention, trademark |
| Effort [Guess] | 4 to 8 weeks part-time | 3 to 6 months | 6+ months, specialist reverse engineering |

**Choice: A.** A later step toward B's look (an own home screen) was considered in the first version and dropped on 2026-11-14: the site's interface with zoom is good enough on a TV (section 5.2).

## 5. Recommended architecture

```
┌──────────────────────────────────────────────────────────┐
│ Shell (main process)                                     │
│  window/fullscreen · profile dir · idle inhibit · MPRIS  │
│  CEC helper · config · updater for the site adapter      │
├──────────────────────────────────────────────────────────┤
│ Chromium web view  →  https://www.primevideo.com         │
│  stock Widevine CDM via EME (untouched)                  │
├──────────────────────────────────────────────────────────┤
│ Remote layer (injected, all original code)               │
│  input router → spatial navigation → focus ring          │
│  page zoom · on-screen keyboard · short messages         │
│  site adapter (selectors.json)                           │
└──────────────────────────────────────────────────────────┘
```

### 5.1 Shell: two candidates, decided by a spike

1. **castLabs Electron (ECS).** One self-contained app, same structure as VacuumTube, and the CDM is downloaded from Google at first run so you never redistribute it [Sourced].
2. **Fallback: drive the user's installed Chromium or Chrome.** Launch it in app/kiosk mode with a dedicated profile and inject the layer over the DevTools protocol. This is exactly the browser Amazon says it supports on Linux, so playback should behave as it does today [Guess]. Cost: depends on a system browser, and is less tidy to package.

**Identity:** send an honest browser user agent. Unlike YouTube, there is no TV endpoint to unlock, so there is nothing to gain from posing as a TV, and posing as one is where option C's legal trouble starts.

### 5.2 The remote layer

**Direction (Andrew, 2026-11-14): the service's own interface is the
interface.** With page zoom it already reads well on a TV, so the app does not
build a second one. The effort goes into remote coverage: every screen and
control reachable with a D-pad, focus that is always visible and predictable,
and clear feedback. The layer draws something of its own only where the
site's interface cannot be used with a remote at all.

What the layer does:

- **Spatial navigation.** Collect focusable elements (links, buttons, cards, styled options) and on each direction press pick the nearest by geometry. Rows remember where you were. Carousels turn at their edge. Hidden duplicates and backdrop links are ignored. Generic first; the adapter only where generic fails.
- **Scale.** Ordinary page zoom to a 960x540 canvas (2x at 1080p). No restyling of the site.
- **Focus feedback.** One ring, drawn by the layer, and a slight growth of the focused card. Short messages (a toast) when something is refused or saved.
- **The site's player, driven by the remote.** Play, pause and seek are real key presses the site's player acts on. Up or down reveals the site's own control bar and menus and moves focus through them. Back closes a menu, then the player. No separate transport bar.
- **Menus that need a pointer.** Hover-only menus are opened by resting the pointer on them.
- **Site adapter.** One small data file of selectors, each backed by an outline from the live site, for the few things the generic rules cannot find (search opener, player container, carousel arrows, purchase controls).

What the layer draws itself, and why each is necessary:

| Own UI | Why the site's interface cannot do it |
|---|---|
| Focus ring, focused-card growth, edge bump and press pulse | The site shows focus for a mouse or Tab key, not for a D-pad at a distance, and gives no sign that a key was heard when nothing can move. |
| On-screen keyboard | A remote has no letters; without it search is unusable. |
| Toast messages | Somewhere to say "blocked" or "saved" from the layer. |
| "Page blocked" notice | Shown when nothing has loaded, so the window is not blank. |
| About and help panel | The non-affiliation notice must be shown in the app, and a remote user needs to be told the keys. |

What is deliberately not built (changed from the first version of this document):

- **No player HUD.** The site's control bar is used as it is.
- **No home screen, splash or restyled pages.** No trimming of the site's header and no forcing or hiding of its menus with CSS.
- **Settings, About and exit confirmation** stay as small as they can be when they are built; they are needed for remapping and the non-affiliation notice, not as a showcase.

A new piece of own UI needs the same justification as the rows in the table:
name the thing a remote user cannot do with the site's interface.

Sign-in happens on the service's own page. The on-screen keyboard can type
into its fields, passwords and one-time codes included, so a TV box with only
a remote can sign in. Each pick is passed to the page as typed text and
nothing is read back, stored or logged. Scripted runs (`--automation`) never
type into password or code fields.

### 5.3 System integration

- Inhibit screensaver and idle while video plays. Vacuumflix needed a fix for exactly this under Steam's Game Mode [Sourced: v1.5.1 notes].
- Detect gamescope/Steam and start fullscreen; `--fullscreen` flag for HTPC autostart.
- MPRIS so media keys and desktop widgets work.
- VA-API hardware decode flags, exposed as a setting.

## 6. TV controls

| Action | Gamepad | Keyboard / IR remote (acts as keyboard) | HDMI-CEC |
|---|---|---|---|
| Move focus | D-pad, left stick | Arrows | Arrows |
| Select | A | Enter | OK |
| Back | B | Backspace, Esc | Back |
| Play/pause | X, or A in player | Space, media key | Play, Pause |
| Seek ±10 s | LB / RB, or left/right in player | Left / Right in player | Rewind, Fast-forward |
| Search | Y | / | (coloured key) |
| Settings | R3 | Ctrl+O | (coloured key) |
| Subtitles/audio | Up in player | C | Subtitle |
| Volume | Right stick, or leave to the AVR | + / − | TV handles it |
| Exit | Hold B | Ctrl+Q | Exit |

- **Gamepad:** Gamepad API polling in the page, Steam Input pad preferred, repeat delay and interval as in VacuumTube.
- **CEC:** a small optional helper using libcec that turns remote presses into key events. Most mini PCs need a USB CEC adapter for this [Guess].
- **All mappings** live in a config file and are remappable in settings.

## 6a. TV layout reference (added 2026-11-14)

What the service's TV app looks like, from published descriptions, used as
the reference for layout under guardrail 2 below. No image of it is kept here.

- A navigation bar runs across the top with Home, Movies, TV Shows, Sports and
  Live TV, then a destination for what the membership includes, then add-on
  subscriptions [Sourced: Engadget, July 2024].
- Below the bar is a rotating banner ("hero rotator") for the selected
  section; on living-room devices video plays in it automatically while
  browsing [Sourced: Engadget].
- Under that, rows of cards. The 2024 update added animations, quicker page
  transitions and zoom effects [Sourced: Engadget, quoting Amazon].
- The previous (2022) design had the menu down the left side instead
  [Sourced: search summary of coverage; not read in full].

The website the app loads already has this structure (bar, banner, rows), as
seen on the live site in session 2. So the layer's job is the TV behaviour on
top: remote navigation, couch-sized scale, a focused card that stands out and
grows, banner and rows that move with the remote. How the TV app handles
focus in detail (whether a focused card expands into a panel) was not found
in a source and is not assumed.

## 7. Legal guardrails

Design rules, each with the reason. Have a lawyer check anything you plan to distribute widely.

1. **Ship none of Amazon's material.** No scripts, fonts, logos, artwork, sounds or screenshots of their UI in the repo or the package. Everything Amazon-owned arrives from Amazon's servers into the user's own session, as in any browser.
2. **Borrow layout, never material.** (Changed 2026-11-14; this rule first said not to copy the look at all.) The layout and interaction patterns of Amazon's TV app may be used as a reference. None of its artwork, logos, icons, fonts, screenshots, text or code is copied, and the app must not pass itself off as the official one. See `DECISIONS.md`.
3. **Leave DRM completely alone.** Use the stock CDM through the browser's standard interface. No key extraction, no patched CDM, no device-level spoofing to unlock HD, no recording or download feature. Canada's Copyright Act prohibits circumventing protection measures; its interoperability exception is written around lawfully obtained computer programs and is lost if the act infringes copyright [Sourced: s. 41.12]. Do not design anything that would need to lean on that exception.
4. **Do not redistribute Widevine.** Let the shell fetch it from Google, or use the system browser's copy.
5. **Keep Amazon's marks out of the name, app ID and icon.** Amazon's trademark guidelines list use in an application name as prohibited [Sourced], and Flathub requires a distinct name and icon [Sourced]. Describe compatibility in plain text only ("an unofficial TV-style front end for watching Prime Video"), with a clear non-affiliation notice.
6. **No ad blocking or ad skipping, and no region workarounds.** Prime's terms say you may not disguise your location [Sourced]. Ad blocking on a paid, ad-tiered service is the feature most likely to draw a response [Guess]. This is a deliberate difference from VacuumTube.
7. **No reverse engineering of Amazon's apps.** Write the site adapter only from the pages served to a logged-in browser. Do not decompile the Fire TV or Android TV app.
8. **Be honest on the wire.** Real user agent, no fake device IDs, no automated or bulk requests; the app only does what the user does with the controller.
9. **Account and terms-of-use risk stays with each user, and say so.** Amazon decides what counts as a compatible device and can change it [Sourced]. I did not read every clause of the terms, so treat "is a restyled browser session permitted" as unconfirmed.
10. **Repo hygiene.** Permissive or GPL licence, disclaimer in the README, no telemetry, and a stated contact for rights-holder complaints.

## 8. Packaging and distribution

- **Flatpak first** (fits Fedora Kinoite, Bazzite and SteamOS), plus AppImage.
- **Flathub caveats:** content must be legally redistributable, with non-redistributable parts fetched as extra data [Sourced]. Flathub also updated its policy in 2026 to reject apps and submissions made with generative AI [Sourced: Linuxiac, GamingOnLinux]. If AI tools help write this app, plan on your own Flatpak remote or GitHub releases instead.
- **Autostart:** desktop entry with `--fullscreen`; optional non-Steam shortcut for Game Mode.

## 9. Build plan

| Phase | Goal | Done when |
|---|---|---|
| 0. Spike (2 evenings) | Does ECS Electron sign in and play a title on Linux? Does the Chromium + DevTools route? | One shell chosen, with the licence result written down |
| 1. Navigable shell | Fullscreen window, spatial navigation, gamepad + keyboard, focus ring, TV zoom | Browse home → title → play using only a controller |
| 2. Player and text entry | The site's player and its menus driven by the remote, on-screen keyboard for search, profile menu, skip and next-episode prompts | A full episode watched and the next one started from the couch |
| 3. HTPC polish | Settings overlay, remapping, userstyles, idle inhibit, MPRIS, CEC helper, adapter auto-update | Runs for a week as the daily driver on one box |
| 4. Packaging | Flatpak, AppImage, README, disclaimers | Clean install on a fresh Kinoite machine |
| 5. Upkeep | Selector smoke test you run against the live site | A site change is detected and patched without a new build |

## 10. Open questions and unverified points

- Whether Prime grants a playback licence to ECS Electron on Linux. Phase 0 answers it.
- Whether a TV-oriented web build of Prime Video exists at any reachable address. I found no evidence of one.
- Whether branded Chrome still accepts the launch flags the fallback shell needs; Chromium may be required.
- How stable primevideo.com's markup is, which sets the upkeep burden. Unknown until the adapter exists.
- The exact Prime Video terms on modified or automated clients. I read the device and location clauses only.
- Effort estimates in section 4 are my own guesses.
- I could not read Vacuumflix's minified Netflix bundle in any meaningful way, and did not try to; conclusions about it come from the host code and file listing.

## 11. Sources

- Engadget, "Prime Video gets a much-needed UI overhaul with a new content bar and AI recommendations" (July 2024): https://www.engadget.com/prime-video-gets-a-much-needed-ui-overhaul-with-a-new-content-bar-and-ai-recommendations-120019397.html


- VacuumTube repo (code read directly): https://github.com/shy1132/VacuumTube
- Vacuumflix repo (code read directly): https://github.com/Ciphay/Vacuumflix
- Vacuumflix 1.5.1 release notes: https://github.com/Ciphay/Vacuumflix/releases/tag/V1.5.1
- Prime Video system requirements for computers: https://www.primevideo.com/help?nodeId=GUX9FYHU5D8LC9EJ
- Amazon Science, how Prime Video updates its app for 8,000+ device types: https://amazon.science/blog/how-prime-video-updates-its-app-for-more-than-8-000-device-types
- InfoQ, Rebuilding Prime Video UI with Rust and WebAssembly: https://www.infoq.com/presentations/prime-video-rust
- castLabs Electron releases (Widevine, Linux limits): https://github.com/castlabs/electron-releases/releases
- Parachord issue on stock Electron vs ECS Widevine: https://github.com/Parachord/parachord/issues/988
- prime-wine: https://codeberg.org/NelloKudo/prime-wine
- Kodi Prime Video add-on README: https://github.com/Sandmann79/xbmc
- Copyright Act (Canada) s. 41.12: https://laws-lois.justice.gc.ca/eng/acts/C-42/section-41.12.html
- Amazon Trademark Guidelines: https://affiliate-program.amazon.com/help/operating/amazonmarks/
- Prime Video Terms of Use: https://www.primevideo.com/tou
- Flathub app requirements: https://documentation-962.pages.dev/docs/for-app-authors/requirements
- Flathub generative AI policy coverage: https://linuxiac.com/flathub-now-rejects-ai-assisted-apps-and-submissions/
