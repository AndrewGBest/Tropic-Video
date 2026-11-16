# Tropic Video

An unofficial TV-style front end for watching Prime Video on a Linux HTPC,
driven by a game controller, remote or keyboard.

**Status: early development, usable for testing.** Browsing, search, playback
and the player's controls work from a keyboard-style remote on the two setups
tried so far (a Fedora virtual machine and the owner's Linux TV box). It has
not been tried with a physical game controller. See
[docs/STATUS.md](docs/STATUS.md) for exactly what has and has not been checked.

> Tropic Video is an unofficial, independent project. It is not affiliated
> with, endorsed by or supported by Amazon. Prime Video and Amazon are
> trademarks of Amazon.com, Inc. or its affiliates. A valid subscription is
> required. Tropic Video does not provide, unlock or bypass access to any
> content and does not remove or work around DRM.

## What it is

A small Chromium-based app that opens the service's normal website and makes
it work from the couch. The interface you see is the service's own, enlarged
for a TV. The app adds what a remote needs:

- directional movement with a visible focus ring, through the site's pages,
  menus, pop-ups and the player's own controls;
- an on-screen keyboard for search;
- play, pause and seek from the remote, sent to the site's player as ordinary
  key presses.

You sign in on the service's own page, exactly as in a browser, with a real
keyboard or the on-screen one. What you type goes to the page as typed text;
the app does not read, store or log it.

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
| Select | A | Enter, Space, or a remote's OK |
| Back | B | Backspace, Esc |
| Play/pause | X (A in the player) | Space |
| Skip back or forward | LB / RB (left/right in the player) | Left / Right in the player |
| Player controls and menus | Up or Down in the player | Up or Down in the player |
| Search | Y | / |
| About and key help | Right stick click | Ctrl+O |
| Quit | | Ctrl+Q |
| Save a page outline for bug reports | | Ctrl+Shift+D |

When another app comes to the front, playback is paused and the app goes
silent; in fullscreen its window is also minimised, which stops the site's
previews. Launching the app again brings it back. Playback stays paused
until you press play.

## Installing

Download from the repository's
[Releases page](https://github.com/AndrewGBest/Tropic-Video/releases): an
AppImage, a tarball and a Flatpak bundle, for 64-bit Intel/AMD Linux. Or build
it yourself (below).

- **AppImage:** make it executable and run it.
- **Flatpak bundle:** `flatpak install --user TropicVideo-x86_64.flatpak`,
  with the Flathub remote set up so its runtime can be fetched. It can reach
  the network, the display, sound and game controllers, and none of your files.

The app downloads the Widevine component from Google the first time it runs;
it is not included in the package. Playback needs that download to succeed.

## Building from source

Needs Node.js 22+ and git.

```
git clone https://github.com/AndrewGBest/Tropic-Video.git
cd Tropic-Video
npm ci
npm run check     # typecheck, tests, build, rule checks
npm start         # opens a development window
npm run dist      # builds release/TropicVideo-x86_64.AppImage and a tarball
```

## Options

| Option | What it does |
|---|---|
| `--fullscreen` | Start fullscreen (the packaged app always does). |
| `--zoom=<factor>` | Override the TV scale. The default fits the site to a 960x540 canvas: 2 on a 1080p screen. `--zoom=1` turns scaling off. |
| `--automation` | For scripted runs: blocks purchase, rental, subscription and sign-up controls. |

## Remapping keys

Remotes send all sorts of keys. To map one, create `config.json` in the app's
data folder and restart. The folder is `~/.config/tropic-video/`, or
`~/.var/app/io.github.andrewgbest.TropicVideo/config/tropic-video/` for the
Flatpak:

```json
{
  "zoom": 2,
  "keys": {
    "MediaStop": "back",
    "ContextMenu": "about",
    "F1": "search",
    "Ctrl+h": "none"
  },
  "buttons": {
    "8": "about",
    "9": "playPause"
  }
}
```

A key is the name the keyboard or remote sends (a `KeyboardEvent.key` value),
optionally with `Ctrl+` in front. Actions: `up`, `down`, `left`, `right`,
`select`, `back`, `playPause`, `seekBack`, `seekForward`, `search`, `about`,
`quit`, and `none` to switch a built-in key off. `zoom` sets the TV scale.
Mistakes in the file are reported in the terminal and ignored.

`buttons` does the same for a game controller, by button number in the
browser's standard layout (0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 8 Select, 9 Start,
10 and 11 the stick clicks, 12 to 15 the D-pad).

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
