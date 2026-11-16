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

## 2026-11-14: Player controls are the site's own, reached by revealing them

**Decision:** there is no separate HUD yet. Up or down in the player asks the
shell to sweep the pointer a few pixels across the picture, which makes the
site's player show its controls; the layer then moves its focus ring among
those controls, scoped to the player. Back closes the player by sending the
site an Escape key press; `history.back()` is only a fallback.
**Reason:** it keeps to ordinary input (Hard rule 4), needs no selectors for
the controls (their class names are hashed and unstable), and gives the
remote every control the site offers, including ones added later.
**Found on the way:** the pointer sweep must be several movements spread over
time; movements sent together are merged into one and the site ignores it.
**Reopen if:** the controls' five-second auto-hide makes this too fiddly on a
real remote; then build the HUD from DESIGN.md on top of the same key presses.

## 2026-11-14: TV scaling is ordinary page zoom to a 720-high viewport

**Decision:** the shell sets the page zoom so the site sees a viewport about
720 CSS pixels high (1.5 at 1080p, 2 at 1440p, 3 at 4K, never below 1).
`--zoom=<factor>` overrides it.
**Reason:** at 1280x720 the live site lays out about four cards to a row with
large text, which reads well from a couch. Zoom is the browser's own feature,
so the site lays itself out and nothing of its styling is rewritten (Hard
rule 4), and it needs no selectors.
**Not verified:** the automatic value on a real 1080p or 4K screen.
**Reopen if:** the site switches to a phone layout at the zoomed width, or
Andrew prefers a different density on a real TV; change the target height.

## 2026-11-14: TV scale target is a 540-high viewport; the TV look stays original

**Decision:** the zoom target moves from 720 to 540 CSS pixels of height
(2x at 1080p, 4x at 4K), and the layer's toast and the notice page use
larger type. Supersedes the 720 target in the entry above.
**Reason:** Andrew asked for a big UI readable from the couch. 960x540 is the
conventional canvas for TV layouts (from memory of Android TV's design
guidance, which treats 1080p as 960x540dp; not re-checked against the
source). Checked on the live site at that viewport: home, a title page and
the player keep their layout, four cards to a row, with larger text, buttons
and player controls.
**Declined:** Andrew also asked to pull images from the service's official
TV app and use them as the basis for the UI. Not done: Hard rule 1 keeps
third-party artwork and screenshots out of the repo and Hard rule 6 forbids
imitating the look of the service's TV app. The content on screen is the
service's own website, shown as it serves it; everything the layer adds is
original.
**Reopen if:** on a real TV the 540 target is too large or too small; change
`TARGET_VIEWPORT_HEIGHT`, or use `--zoom=`.

## 2026-11-14: The zoom target has a width floor as well

**Decision:** zoom is the smaller of width/960 and height/540, rounded down.
**Reason:** fullscreen on a 1280x800 display, scaling by height alone left
the site a viewport 865 wide and it collapsed its navigation bar into a
"Menu" dropdown with three cards to a row. At 962 wide it shows the full bar.
The exact width where the site switches was not measured; it is somewhere
between 865 and 962.
**Reopen if:** the site moves that breakpoint above 960.

## 2026-11-14: Adapter revision 2: carousel arrows are pressed at the edge, not focused

**Decision:** new adapter keys `rowPrev` and `rowNext` name a strip's arrow
buttons (evidence: `test/fixtures/outlines/home-carousels.txt`). They are
never focus targets. When left or right has nowhere to go, the layer clicks
the arrow of the strip the focus is in, then moves focus to the first control
shown if the old one disappeared. Two generic rules were added with it: a
control inside a fully transparent ancestor is not a focus target, and
neither is a link that wholly covers other controls and is at least four
times their size.
**Reason:** on the live site the top carousel stacks its slides in one place
(hidden ones in a transparent wrapper) under a banner-sized link, so focus
bounced between invisible duplicates and the backdrop and never changed slide.
**Reopen if:** the backdrop rule hides something a user needs to reach; it
has only been watched on the home, title and player pages.

## 2026-11-14: Hard rule 6 loosened: the service's TV layout may be a reference

**Decision (Andrew):** drawing inspiration and layout from the official TV
app is allowed; the earlier "original design only" rule was overly cautious.
No copyrighted or trademarked material goes into the application. `CLAUDE.md`
rule 6, `LEGAL-GUARDRAILS.md`, `DESIGN.md` and the README were changed to
match. This supersedes the "Declined" paragraph in the entry of the same date
above, as far as layout goes; pulling the service's images into the repo is
still out (rule 1).
**How it is applied:** `DESIGN.md` section 6a describes the TV layout from
published sources. Rules 1, 5 and 8 are unchanged: no assets, no marks, and
no working from the app's own files.
**Residual risk, recorded not argued:** trade dress (see
`LEGAL-GUARDRAILS.md`, "Look and feel"). A lawyer should look before a wide
release.

## 2026-11-14: Hover-only menus are opened by resting the pointer on them

**Decision:** when Enter on a button that reports `aria-expanded="false"`
leaves it collapsed, the layer asks the shell to move the pointer onto the
button (`hover` message; coordinates validated and scaled in the main
process). Back, or focus leaving the menu, moves the pointer to the window's
corner again.
**Reason:** on the live site the profile menu ignores a click and opens on
hover. Moving the pointer is ordinary input (Hard rule 4) and needs no
selectors.
**Not done:** pointer-follows-focus everywhere. It would trigger the site's
hover previews on every card; decide after seeing it on a TV.

## 2026-11-14: On-screen keyboard types through the shell

**Decision:** the layer draws its own keyboard (original layout: four rows of
ten, then space, delete, search) when its focus lands on a text field. Keys
are typed by the main process with `webContents.insertText`, and delete and
search are real Backspace and Enter key presses. The layer never sets a
field's value itself.
**Reason:** a remote has no letters, so search was unusable from the couch.
Typing as input, not by writing to the site's field, keeps to Hard rule 4 and
lets the site's own suggestions and form handling work unchanged.
**Found on the way:** an Enter key press needs its character event as well,
or the site's search form does not submit.
**Limits:** lower-case letters, digits and four symbols. Deliberately not a
password keyboard: sign-in is the user's business on the service's own page
(Hard rule 9), with a real keyboard. (Superseded 2026-11-16, below.)
**Reopen if:** users need other scripts or capitals for search.

## 2026-11-14: The site's interface is the interface; own UI only where a remote needs it

**Decision (Andrew):** the standard interface works well on a TV with the
zoom, so extra HUDs are kept to what is required. Effort goes into remote
coverage, good navigation and feedback, staying with the default interface
unless it is really bad for TVs or remotes.
**What changed:** `DESIGN.md` 5.2 is rewritten around this. The planned
player HUD, own home screen, splash and CSS restyling of the site are dropped.
The layer's own UI is the focus ring, the on-screen keyboard, toasts and the
blocked-page notice, each listed with the reason it is needed. The roadmap is
updated to match.
**Test for anything new:** name what a remote user cannot do with the site's
own interface. If there is nothing, do not draw it.
**Reopen if:** a part of the site turns out unusable from a remote even with
focus, keys and pointer help.

## 2026-11-14: Settings are a hand-edited config file, not a screen

**Decision:** `config.json` in the user data folder holds key mappings and a
zoom value. It is read at start, validated (`src/shared/config.ts`), and
anything wrong is reported in the terminal and ignored. There is no settings
screen.
**Reason:** remotes send different keys, so remapping is needed; a screen for
it would be new own UI with no need a file does not meet (see the test in
`DESIGN.md` 5.2). Ctrl+Q stays a quit key whatever the file says, so a bad
mapping cannot trap the user.
**Not done:** gamepad button remapping; reloading the file without a restart.
**Reopen if:** users who cannot edit a file need remapping; then a "press the
key you want" flow, not a general settings screen.

## 2026-11-14: Flatpak bundle permissions

**Decision:** the bundle is built against the freedesktop 25.08 runtime with
the Electron base app, and is allowed: network, Wayland and X11, sound, all
devices, talking to the screensaver and power-management services, and owning
the Chromium media-player bus name. It gets no access to the user's files.
**Reason:** `--device=all` is the only Flatpak permission that lets the
browser see game controllers; it is broader than wanted and is the one to
revisit. Everything else is what playback, sleep inhibition and media keys
need.
**Checked:** the bundle starts, fetches the Widevine component inside the
sandbox and loads the site. Playback, a controller, sleep inhibition and
media keys inside the sandbox were not tried.
**Reopen if:** Flatpak gains a narrower input-device permission that
controllers work with.

## 2026-11-16: Hide player buttons the site has disabled

**Decision (Andrew's request):** inside the player, a button the site itself
has disabled is hidden by the TV stylesheet. On a live station the site
disables pause and the skip buttons; a remote cannot reach them, and showing
them invites trying.
**Why this is within Hard rule 4:** it is a user style on the page, like the
focus outline rule. Nothing the site does changes: the buttons were already
unusable, and they come back the moment the site enables them.
**Reopen if:** the site starts using disabled buttons to tell the user
something (a reason shown on them).

## 2026-11-16: The on-screen keyboard may type passwords and codes

**Decision (Andrew):** after trying to sign in on his TV box with only a
remote, Andrew asked for the keyboard to come up on the sign-in, password
and two-step pages, and then that it "needs to have all symbols for passwords
and emails". Hard rule 9 used to say the app never types passwords or codes;
it now says the app never reads, logs or stores them, and that the keyboard
may pass a person's picks through. (Reading his two messages as the decision
is the agent's interpretation; he was told the rule stood in the way first.)
**How:** the keyboard gained capitals and a symbols face with every printable
ASCII character. A pick goes layer to shell to `webContents.insertText`, the
same path as search; nothing reads the field and the shell does not log the text.
**What did not change:** agents and scripts never type credentials. Under
`--automation` the keyboard does not open on password or one-time-code fields.
**Known cost:** the highlighted key is visible to anyone looking at the TV.
**Not verified:** the real sign-in pages; the agent cannot open them.


## 2026-11-16: Which characters the on-screen keyboard must cover

**Checked (Andrew's request):** what the service allows in sign-in emails and
passwords. **No published list was found** for consumer accounts. The
sign-in and registration pages state only a minimum length (six characters).
The one precise symbol list found (`! @ # $ % ^ & * () <> [] {} | _ + - =`)
is from the AWS account documentation, a different kind of account.
**Decision:** cover all 95 printable ASCII characters (letters in both
cases, digits, space and all 32 symbols), which is everything a standard US
keyboard types and a superset of that list. A unit test in `test/osk.test.ts`
checks every one is on some face of the keyboard.
**Not covered:** anything outside ASCII (accented letters, £, €, other
scripts). A password or address containing those needs a real keyboard.
**Reopen if:** a user reports a character they cannot type.

## 2026-11-16: Leaving the app pauses, mutes and (in fullscreen) minimises

**Decision (Andrew's request):** nothing keeps playing when the app is not
the one in front.
**How, within Hard rule 4:** the layer never calls `pause()`. The playing
video is paused with the site's own play/pause key, sent only if it is
playing (the key is a toggle). Previews cannot be paused by a key, so the
window is muted, and in fullscreen it is minimised: the page is then hidden
and the site stops its own previews (seen on the live site).
**Risks accepted:** a window that loses focus for any reason (a system
dialog) is minimised; launching the app again restores it. If the desktop
never reports focus returning, the first key press in the window unmutes.
**Reopen if:** the minimise misfires on some desktop (make it a config
option), or the site stops pausing on Space.

