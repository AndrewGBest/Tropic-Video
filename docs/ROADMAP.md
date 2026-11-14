# Roadmap

Each phase lists what "done" means. Tick items only when verified, and note
how in `STATUS.md`.

## Phase 0: playback spike (blocks everything else)

- [x] Minimal shell that loads the site with spike probes (`npm run spike`)
- [x] Run on a real Linux desktop: sign in, start a title, read `spike-report.json`
- [x] Record the outcome in `DECISIONS.md`: castLabs Electron works, or switch to driving installed Chromium

**Done when:** a title plays in the shell, or the fallback shell is chosen with evidence.

## Phase 1: navigable shell

- [x] Spatial navigation engine with tests
- [x] Keyboard, remote-as-keyboard and gamepad input with repeat
- [x] Focus ring overlay
- [x] Navigation and permission allowlists, sandboxed preload
- [x] Purchase guard for automation
- [x] Diagnostics outline (Ctrl+Shift+D)
- [x] End-to-end harness against a fixture
- [x] Capture outlines from the live site: home, detail, player (search and profile menu were driven live without needing selectors)
- [x] First evidence-based adapter revision
- [ ] TV scaling (page zoom) tuned on a real 1080p TV
- [x] Row memory: returning to a row restores the last focused card

**Done when:** home → title → play using only a controller, on the live site.

## Phase 2: player and text entry

- [x] The site's own player controls reachable and usable from the remote (no separate HUD; see `DESIGN.md` 5.2)
- [x] Subtitle and audio selection through the site's controls
- [ ] Skip intro / next episode focus
- [x] On-screen keyboard for search
- [x] Profile menu and navigation dropdowns from the remote (switching profile itself not yet tried)
- [x] Reliable back from the player

**Done when:** an episode is watched and the next one started from the couch.

## Phase 3: HTPC polish

- [x] Config file with key remapping and zoom (edited by hand; no settings screen)
- [x] Gamepad button remapping in the config file (unit-tested; no physical controller tried)
- [x] MPRIS and media keys (Chromium's own; verified, nothing to build)
- [ ] CEC helper (optional, separate process)
- [ ] Idle inhibit verified under Wayland (done on KDE), X11 and gamescope
- [ ] Hardware decode flags
- [ ] Adapter update channel (signed data file, fetched from the project's GitHub only)
- [x] About panel with the non-affiliation notice
- [x] Offline message with automatic retry (the notice page)

**Done when:** it runs for a week as the daily driver on one HTPC.

## Phase 4: packaging and release

- [x] AppImage build verified locally and in CI (tarball built, not run)
- [x] Flatpak bundle built in CI and launched once (attaching it to a release waits for the first tag)
- [ ] Release workflow on tag
- [ ] README install guide, screenshots that show no third-party artwork
- [x] Original icon
- [ ] Lawyer review of `LEGAL-GUARDRAILS.md` before promoting the project

**Done when:** a clean install works on a fresh Fedora Kinoite machine.

## Phase 5: upkeep

- [x] Live-site walk an agent can run on the VM (`npm run live:walk`, see `VM-SETUP.md`)
- [ ] Remote coverage checklist: every page type and control walked with a D-pad, gaps listed in `STATUS.md`
- [ ] Issue template for "the site changed" reports with an outline attached
- [ ] Contributor guide
