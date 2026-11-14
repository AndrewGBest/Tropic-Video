# Tropic Video

An unofficial TV-style front end for watching Prime Video on a Linux HTPC,
driven by a game controller, remote or keyboard.

**Status: early development. Not usable yet.** Protected playback has not been
confirmed in this shell. See [docs/STATUS.md](docs/STATUS.md).

> Tropic Video is an unofficial, independent project. It is not affiliated
> with, endorsed by or supported by Amazon. Prime Video and Amazon are
> trademarks of Amazon.com, Inc. or its affiliates. A valid subscription is
> required. Tropic Video does not provide, unlock or bypass access to any
> content and does not remove or work around DRM.

## What it is

A small Chromium-based app that opens the service's normal website and adds a
couch-friendly layer on top: directional focus, a visible focus ring, and
controller and remote input. You sign in on the service's own page, exactly as
in a browser.

## What it is not

- Not the service's own TV app. Its layout follows familiar TV conventions,
  including that app's, but it contains none of the service's artwork, logos,
  fonts or code.
- Not a way to get higher quality than a Linux browser gets. The service limits
  Linux computers to standard definition.
- Not an ad blocker, downloader or region unlocker, and it never will be.

## Controls

| Action | Gamepad | Keyboard / remote |
|---|---|---|
| Move | D-pad, left stick | Arrows |
| Select | A | Enter |
| Back | B | Backspace, Esc |
| Play/pause | X (A in the player) | Space |
| Seek 10 s | LB / RB (left/right in the player) | Left / Right in the player |
| Search | Y | / |
| Quit | | Ctrl+Q |
| Save a page outline for bug reports | | Ctrl+Shift+D |

## Building from source

Needs Node.js 22+ and git.

```
git clone <this repo>
cd tropic-video
npm ci
npm run check     # typecheck, tests, build, rule checks
npm start         # opens a development window
```

## Your account

Using any unofficial client is at your own risk. The service decides which
devices and apps it supports and may change that at any time.

## Privacy

No telemetry, no analytics, no crash upload. The app talks only to the
service. The page-outline file made by Ctrl+Shift+D stays on your disk and
contains page structure only (no titles, names, links or text).

## Contributing

Read [CLAUDE.md](CLAUDE.md) first: its Hard rules apply to every contributor,
human or AI. Design and reasoning are in [docs/](docs/).

## Rights holders

If you represent a rights holder and have a concern, please open an issue on
this repository and it will be addressed promptly.

## Licence

GPL-3.0. See [LICENSE](LICENSE). You are free to use, study, share and change
this software; if you distribute a modified version, you must make its source
available under the same licence.

The licence covers the code, not the project's name. If you publish a fork,
please give it a different name so users can tell the two apart.
