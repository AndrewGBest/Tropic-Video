# Decision log

Newest last. Each entry: date, decision, reason, and what would reopen it.

## 2026-11-13: Wrap the website; do not run the service's TV bundle

**Reason:** the service has no hosted TV web app to point at, and running its
proprietary living-room bundle would mean redistributing or patching its code
and presenting a false device identity. Wrapping the public site with an
original layer avoids both. See `DESIGN.md` sections 2 to 4.
**Reopen if:** the service publishes an official web TV experience.

## 2026-11-13: TypeScript on castLabs Electron

**Reason:** protected playback needs Chromium with Widevine; stock Electron
has none and the castLabs build adds it, fetching the CDM at runtime so the
project never redistributes it. The layer must be JavaScript regardless, so one
language covers shell and layer. It is also the stack an AI agent can build and
test most completely.
**Reopen if:** the Phase 0 spike shows the service refuses playback in this
shell. Fallback: launch the user's installed Chromium and inject the layer over
the DevTools protocol. The layer code is shell-agnostic for this reason.

## 2026-11-13: Layer runs in the preload's isolated world

**Reason:** it needs the DOM but should neither be reachable by the site's
scripts nor modify them. This also sidesteps the page's content security
policy without rewriting response headers, which Hard rule 4 forbids.
**Reopen if:** something needs main-world access. Prefer finding another way.

## 2026-11-13: Honest Chromium user agent

**Reason:** there is no TV endpoint to unlock, so nothing is gained by posing
as a device, and doing so is where legal risk begins. Only the Electron and app
tokens are removed, which leaves the true engine, version and OS.
**Reopen if:** never for device spoofing. If the site rejects the shell for
lacking a brand token, discuss before changing anything.

## 2026-11-13: GitHub Releases, not Flathub

**Reason:** the app is written with AI assistance, and Flathub's 2026 policy
does not accept applications containing AI-generated or AI-assisted code.
Distribution is AppImage, tarball and a Flatpak bundle file on GitHub Releases.
**Reopen if:** Flathub's policy changes.

## 2026-11-13: No ad blocking, ever

**Reason:** Hard rule 4. It is the single feature most likely to turn a
tolerated front end into a target.
**Reopen if:** never.

## 2026-11-13: Purchase guard only in automation mode

**Reason:** real users may want to rent or buy from the couch; scripted and
agent-driven runs must never be able to. The guard errs toward blocking and
will over-block some harmless controls in automation, which is acceptable.
**Reopen if:** users ask for a "kids/guest lock" (then offer it as a setting).

## 2026-11-13: No end-to-end test framework dependency

**Reason:** the harness speaks the DevTools protocol directly with Node's
built-in WebSocket and fetch, so it runs anywhere the app runs and adds nothing
to install.
**Reopen if:** the harness grows past what is comfortable to maintain by hand.

## 2026-11-13: Project name is "Tropic Video"

**Reason:** Andrew's choice. It hints at the Amazon rainforest without using
any of the service's marks, and is easy to say, spell and type. "Canopy Video"
was rejected first: Kanopy is a registered mark for a video streaming service
and sounds identical. A web search and third-party trademark sites showed no
"Tropic Video" in streaming and no TROPIC mark for video streaming or media
software. Neighbours noted: Tropic (procurement software), Tropic Skincare
(US registration that includes the entertainment class), Tropico TV (a
Brazilian IPTV app), Topic (a streaming service one letter away).
**Not done:** a direct search of the USPTO, CIPO, EUIPO or UK registers.
**Reopen:** before promoting the project publicly, run those searches or have
a lawyer do a clearance. The working name before this was "Couchstream".

## 2026-11-13: Licence is GPL-3.0

**Reason:** Andrew's choice, so that anyone distributing a modified version
must publish their source under the same terms. The first local commits used
MIT; nothing was published under it. The `LICENSE` file is the one GitHub
generated when the repository was created. `package.json` says
`GPL-3.0-only`; whether to allow "or any later version" was not discussed.
**Note:** the licence covers the code, not the name. The README asks forks to
use a different name.
**Reopen if:** Andrew wants "or later", or a contributor needs a different licence.

## 2026-11-13: Phase 0 spike passed in the Fedora VM; keep the castLabs Electron shell

**Result:** protected playback works in the castLabs Electron 44.10.1 shell
(Chromium 152) inside Andrew's Fedora VM. Evidence, from
`spike-report.json` of a run Andrew launched and drove by hand:
Widevine component 4.10.3112.0 installed; `eme-access` ok; one video element
with MediaKeys attached, two `encrypted` events, `playing`, and `currentTime`
advancing from 0 to 100 s in ten-second samples at 960x540; a pause and
resume; no `video-error`. The site accepted the shell's user agent and the
sign-in flow completed in the window (Andrew's report).
**Decision:** the Chromium fallback shell is not needed for now.
Andrew confirmed by eye and ear that picture and sound were fine in that run
(the report sees element state, not pixels).
**Not shown:** any resolution above
960x540 (a guess: the service limits software-CDM browsers on Linux; nothing
will be done to work around it, Hard rule 2); bare-metal behaviour; hardware
video decode (VA-API failed to initialise in the VM, so decode was software).
**Reopen if:** the service starts refusing the shell, or a castLabs release
drops the component updater.

## 2026-11-13: The spike's first sign-in is a hand-driven run without `--automation`

**Reason:** a signed-out visit to the service's home page is redirected to
`/offers/nonprimehomepage` (seen as a 302 with `curl` and as a cancelled
navigation over DevTools). The automation guard refuses URLs matching
`/offers`, so under `--automation` the window stays blank and sign-in cannot
be reached. Rather than weaken the guard (Hard rule 10), Andrew launched
`npm run spike` himself and drove it entirely by hand; the agent did not
attach to that run and only read the report afterwards.
**Unverified guess:** with the signed-in profile the home page no longer
redirects there, so later `--automation` runs should load.
**Reopen if:** signed-in automation runs are also blocked; any narrowing of
the URL pattern needs evidence from the live site and unit tests.

## 2026-11-13: Refused navigations are shown by the shell, with one shell-to-layer message

**Decision:** when the allowlist or the automation guard refuses a navigation,
the main process logs it (reason, host and path; never the query), and either
sends the layer one line of text to show as a toast (`tropic:notice`) or, if
no page has loaded yet, loads a self-contained `data:` notice page.
**Reason:** a refused first load left a blank black window that looked like a
crash and cost a debugging session. The toast alone is not enough because it
fades and because there may be no page to host it.
**Constraints kept:** the message arrives in the preload's isolated world and
nothing is exposed to the page (Hard rule 12). The notice page has no scripts
or remote resources and its wording and look are original. The guard and the
allowlist themselves are unchanged (Hard rule 10).
**Reopen if:** the shell needs to tell the layer more than a line of text;
design a typed message list like `BridgeMessage` rather than adding channels.

## 2026-11-13: The player is controlled only by ordinary key presses

**Decision:** the layer no longer calls `play()`, `pause()` or sets
`currentTime` on the site's video element. For play/pause and seek it asks the
shell to press Space, Left or Right with `webContents.sendInputEvent`; a
physical Space or arrow key in the player is simply left for the site.
`npm run check` now fails on code that controls a video element directly.
**Reason:** found on the live site. The service plays advertisements inside
the same video element as the programme. Setting `currentTime` could jump
over one, which Hard rule 4 forbids, and calling `pause()`/`play()` behind the
site's player left it out of step (playback would not resume). With key
presses the site's player decides: during an advertisement it answered the
seek key with its own "Unavailable" message; afterwards the same key moved
ten seconds. Seen in an `--automation` run on 2026-11-13.
**Cost:** the seek step is whatever the site uses, and a site whose player
has no keyboard controls gets no seek from the layer.
**Reopen if:** never for direct control. A future HUD may read position and
duration, and click the site's own controls found through the adapter.

## 2026-11-13: Adapter revision 1, and two new adapter keys

**Decision:** `adapters/primevideo.json` revision 1 holds four selectors, each
shown by a trimmed outline in `test/fixtures/outlines/` and checked by
`test/adapter-evidence.test.ts`: the search input, the control that reveals
it (`searchOpen`, new key), the element the player lives in (`playerRoot`,
new key) and the "go ad free" upsell link as a purchase control.
**Reason:** live testing showed the generic heuristics handle browsing well
(cards, rows, sideways scrolling) but fail in three places: the search field
is hidden until its button is clicked; a title page's full-width background
trailer was taken for the player, so Enter paused the trailer instead of
selecting; and the upsell link's wording is not in the spend-word list.
**Left empty:** `playerClose`. The player's controls carry only hashed class
names and masked ids in the outline, so there is no evidence-based selector;
Back uses history, which leaves the player but lands on the home page rather
than the title page.
**Reopen if:** the site's markup changes (the evidence test only proves the
selectors matched on the capture date).
