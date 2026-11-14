# Roadmap

Each phase lists what "done" means. Tick items only when verified, and note
how in `STATUS.md`.

## Phase 0: playback spike (blocks everything else)

- [x] Minimal shell that loads the site with spike probes (`npm run spike`)
- [ ] Run on a real Linux desktop: sign in, start a title, read `spike-report.json`
- [ ] Record the outcome in `DECISIONS.md`: castLabs Electron works, or switch to driving installed Chromium

**Done when:** a title plays in the shell, or the fallback shell is chosen with evidence.

## Phase 1: navigable shell

- [x] Spatial navigation engine with tests
- [x] Keyboard, remote-as-keyboard and gamepad input with repeat
- [x] Focus ring overlay
- [x] Navigation and permission allowlists, sandboxed preload
- [x] Purchase guard for automation
- [x] Diagnostics outline (Ctrl+Shift+D)
- [x] End-to-end harness against a fixture
- [ ] Capture outlines from the live site: home, detail, search, profile picker, player
- [ ] First evidence-based adapter revision
- [ ] TV scaling (page zoom) tuned on a real 1080p TV
- [ ] Row memory: returning to a row restores the last focused card

**Done when:** home → title → play using only a controller, on the live site.

## Phase 2: player and text entry

- [ ] Player HUD (own transport bar, position, seek feedback)
- [ ] Subtitle and audio selection through the site's controls
- [ ] Skip intro / next episode focus
- [ ] On-screen keyboard for search
- [ ] Profile picker handling
- [ ] Reliable back from the player

**Done when:** an episode is watched and the next one started from the couch.

## Phase 3: HTPC polish

- [ ] Settings overlay; config file; button remapping
- [ ] User style sheets
- [ ] MPRIS integration and media keys
- [ ] CEC helper (optional, separate process)
- [ ] Idle inhibit verified under Wayland, X11 and gamescope
- [ ] Hardware decode flags
- [ ] Adapter update channel (signed data file, fetched from the project's GitHub only)
- [ ] About screen with the non-affiliation notice
- [ ] Exit confirmation, offline and error screens

**Done when:** it runs for a week as the daily driver on one HTPC.

## Phase 4: packaging and release

- [ ] AppImage and tarball build verified
- [ ] Flatpak bundle file attached to GitHub releases (not Flathub; see `DECISIONS.md`)
- [ ] Release workflow on tag
- [ ] README install guide, screenshots that show no third-party artwork
- [ ] Original icon
- [ ] Lawyer review of `LEGAL-GUARDRAILS.md` before promoting the project

**Done when:** a clean install works on a fresh Fedora Kinoite machine.

## Phase 5: upkeep

- [ ] Live-site smoke test an agent can run on the VM
- [ ] Issue template for "the site changed" reports with an outline attached
- [ ] Contributor guide
