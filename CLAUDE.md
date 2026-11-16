# Tropic Video: working rules

Read this file at the start of every session, and re-read the Hard rules before
any commit. Then read `docs/STATUS.md` for where things stand.

Tropic Video is an unofficial, open-source, TV-style front end for watching
Prime Video on Linux HTPCs. It is a Chromium shell that loads the service's
normal website and adds an original controller-driven layer on top. The owner
is Andrew (GitHub: AndrewGBest). Releases go out through GitHub Releases.

## Hard rules

These are not style preferences. A change that breaks one does not ship, even
if asked for casually. If a request conflicts with a rule, stop and say so.
The reasoning for each is in `docs/LEGAL-GUARDRAILS.md`.

1. **No third-party material in the repo.** No code, fonts, logos, artwork,
   sounds, screenshots or copied text from Amazon, Netflix, Google or any other
   service. The Widevine library is never committed or bundled.
2. **DRM is left alone.** Protected playback goes through the browser's
   standard EME interface with the unmodified CDM. Never extract keys, patch or
   wrap the CDM, inspect or replay licence traffic, record or download streams,
   or work around a resolution or output restriction.
3. **Honest identity.** The user agent is the embedded Chromium's real one with
   only the app tokens removed. Never claim to be a TV, console, phone, another
   OS or another browser. Never invent device IDs or serials.
4. **Do not modify the service's own behaviour.** No ad blocking or ad
   skipping, no region or VPN workarounds, no rewriting of the site's requests,
   responses, headers or scripts. The layer adds its own UI and sends ordinary
   input; that is all. It never calls `play()`, `pause()` or sets `currentTime`
   on the site's video: the site's player decides what a key press does.
5. **No trademarks in the name, app ID, icon or artwork.** "Prime", "Amazon"
   and their logos stay out. Plain-text descriptions of compatibility are fine,
   always with the non-affiliation notice.
6. **Familiar layout, original material.** The layout and interaction patterns
   of the service's TV app may be used as a reference (Andrew's decision,
   2026-11-14). Nothing of theirs is copied: no artwork, logos, icons, fonts,
   screenshots, text or code, and the app must never present itself as the
   official app. Work from public descriptions and from using the service,
   not from its app's files (rule 8).
7. **Selectors come from evidence.** Nothing is added to `adapters/*.json`
   without a diagnostics outline from the live site showing it. Never guess a
   selector from memory. Everything must still work, degraded, with an empty adapter.
8. **No reverse engineering of the service's apps.** The only inputs are pages
   served to a signed-in browser. No decompiling TV, mobile or desktop apps.
9. **Credentials are the user's business.** Sign-in happens on the service's
   own page. Never read, log or store passwords or one-time codes. The
   on-screen keyboard may pass a person's own key picks to those fields, as a
   real keyboard would (Andrew's decision, 2026-11-16); an agent or script
   never types them, and under `--automation` the keyboard stays out of them.
   Never commit cookies, profiles, HAR files or anything captured from a
   signed-in session.
10. **Automation never spends money.** Any agent- or script-driven run uses
    `--automation`, which blocks purchase, rental, subscription and sign-up
    controls. Never disable or weaken the guard to get a test through.
11. **Privacy by default.** No telemetry, analytics or crash upload. Diagnostics
    files contain structure only and are written locally; the user decides
    whether to share them.
12. **Least privilege in the shell.** Keep `contextIsolation: true`,
    `sandbox: true`, `nodeIntegration: false`, no `contextBridge` API exposed to
    the page, the navigation allowlist, and the permission allowlist.

`npm run check` enforces the mechanical parts of these (see `scripts/check-rules.mjs`).
Passing it is necessary, not sufficient.

## How to work

- **Verify before claiming.** Run `npm run check` before every commit. Run
  `npm run e2e` (under `xvfb-run -a` if headless) after touching the shell,
  preload, navigation or guard. Report results as they are, including failures.
- **Say what is verified and what is not.** Anything not exercised against the
  live site is unverified; record it in `docs/STATUS.md`, not as done.
- **Test first for logic.** Geometry, input mapping, the guard, the outline
  sanitiser and URL rules are pure and must have unit tests for every change.
- **Fixtures are invented.** Pages in `test/fixtures/` are made-up layouts.
  Outlines captured from the live site may be committed only after checking
  they contain no titles, names or IDs (the sanitiser has tests; still look).
- **Small dependencies.** Adding a runtime dependency needs a line in
  `docs/DECISIONS.md` saying why. Dev dependencies should stay few.
- **Record decisions.** Any choice that a future session might re-argue goes in
  `docs/DECISIONS.md` with the date and the reason.
- **Keep STATUS current.** Update `docs/STATUS.md` at the end of each session:
  what changed, what was verified and how, what is next.
- **Commits.** Small, one purpose each, imperative subject line. Do not push to
  `main` once others contribute; use a branch and a pull request.
- **Sources.** Andrew wants claims backed by sources and guesses labelled as
  guesses. Apply that to docs, commit messages and reports.

## Map

| Path | What |
|---|---|
| `src/main/` | Electron main process: window, allowlists, IPC, spike report |
| `src/preload/` | Sandboxed preload; boots the layer in the isolated world |
| `src/layer/` | The TV layer: spatial navigation, input, player, guard, diagnostics, overlay |
| `src/shared/` | Types shared by main and layer |
| `adapters/` | Site adapter data (selectors). Evidence-only, see rule 7 |
| `test/` | Unit tests (vitest), invented fixtures, CDP end-to-end harness |
| `scripts/` | Build and rule checks |
| `docs/` | Design, architecture, guardrails, roadmap, status, decisions, VM setup |

## Commands

```
npm run check        # typecheck + unit tests + build + rule checks
npm run e2e          # real app against the local fixture, driven over CDP
npm start            # dev window against the live site
npm run spike        # Phase 0: does protected playback work? writes spike-report.json
```
