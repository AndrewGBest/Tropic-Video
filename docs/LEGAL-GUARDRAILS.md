# Legal guardrails

This explains the reasoning behind the Hard rules in `CLAUDE.md`. It is a risk
map written by a non-lawyer, not legal advice. Before a wide public release,
have a lawyer review it. Items marked **[Guess]** are reasoning without a source.

## The position this project takes

Tropic Video is a web browser with a different remote control. It loads the
service's public website in a Chromium engine, the user signs in on the
service's own page, and video plays through the browser's standard protected
media path. On top, the app draws its own focus ring and menus and turns
controller presses into ordinary focus changes and clicks.

Everything risky that similar projects do is deliberately absent. The contrast
case is a client that bundles a service's TV scripts, fonts, logo and the
Widevine binary, names itself after the service, and presents an invented
device serial (see `DESIGN.md` section 2 for what was found in one such repo).

## Rule by rule

| Rule | Risk it avoids | Basis |
|---|---|---|
| 1. No third-party material | Copyright infringement by redistribution | Copying another party's code, fonts or artwork into a public repo is reproduction and distribution of their work. |
| 2. DRM left alone | Anti-circumvention law | Canada's Copyright Act prohibits circumventing technological protection measures (s. 41.1). Its interoperability exception (s. 41.12) concerns lawfully obtained computer programs and is lost where the act infringes copyright. The US has a comparable prohibition (17 USC 1201; from general knowledge, not re-checked for this document). The project never needs an exception because it never circumvents. |
| 3. Honest identity | Misrepresentation to obtain service not offered to this device class | The service states that computers other than Windows and macOS get standard definition. Posing as another device to get more would be the kind of workaround rule 2 forbids. **[Guess]** on how a court would characterise it; the rule avoids the question. |
| 4. No modification of the service | Terms-of-use breach; interference claims | The service's terms forbid disguising location. Ad blocking on a paid, ad-supported tier is the feature most likely to provoke a response. **[Guess]** |
| 5. No trademarks in name or icon | Trademark infringement, confusion about origin | Amazon's trademark guidelines list use of its marks in an application name as prohibited. Naming compatibility in plain text is the usual nominative-use approach; a lawyer should confirm the wording. |
| 6. Familiar layout, original material | Copyright in the service's artwork, icons, fonts and text; confusion about who made the app | Changed by Andrew on 2026-11-14 from "original design only". Layout and interaction conventions (a top bar, a banner, rows of cards, a highlighted focused card) are common to TV apps and are used as a reference. Everything the layer draws is made for this project, and rules 1 and 5 still keep the service's material and marks out. **[Guess]** that this leaves little risk; see the trade-dress note below. |
| 7. Evidence-based selectors | None legal; reliability | Guessed selectors silently break. |
| 8. No reverse engineering of apps | Licence breach; anti-circumvention if apps are protected | Reading a web page your browser was sent is ordinary use. Decompiling a TV app is not. |
| 9. Credentials untouched | Privacy harm, account compromise | The app never needs them; the cookie jar stays on the user's disk. The on-screen keyboard only passes key picks through, like a keyboard. |
| 10. Automation never spends | Unauthorised charges on a real account | Enforced in the layer and by URL in the main process. |
| 11. No telemetry | Privacy law exposure; user trust | Nothing leaves the machine except traffic to the service itself. |
| 12. Least privilege | Security of the user's machine | The page is untrusted code; it gets no path into the app. |

## What remains uncertain

- **Terms of use.** Whether a restyled browser session is a permitted way to
  use the service has not been confirmed. The service decides what a
  compatible device is and can change that. Account risk sits with each user
  and the README says so. The full terms have not been reviewed clause by clause.
- **Injecting a stylesheet and focus handling** is the same class of activity
  as a browser extension or user style. **[Guess]** that it is treated the same.
- **Look and feel.** Rule 6 now allows the service's TV layout as a
  reference. Copyright does not protect an arrangement as an idea, but a
  distinctive overall appearance can be claimed as trade dress where it
  identifies the source and copying it confuses users. **[Guess]**, from
  general knowledge and not checked against a source: the risk is low while
  the app uses none of the service's assets, keeps its own name and icon, and
  carries the non-affiliation notice. This is Andrew's call as owner; a lawyer
  should confirm before a wide release.
- **Jurisdiction.** Reasoning above leans on Canadian and US law. Users
  elsewhere are subject to their own.
- **Takedown.** If the rights holder objects, the project responds promptly
  and in good faith. A contact route is listed in the README.

## Required wording

Every release, the README and the About screen carry:

> Tropic Video is an unofficial, independent project. It is not affiliated
> with, endorsed by or supported by Amazon. Prime Video and Amazon are
> trademarks of Amazon.com, Inc. or its affiliates. A valid subscription is
> required. Tropic Video does not provide, unlock or bypass access to any
> content and does not remove or work around DRM.

## Sources

- Copyright Act (Canada), s. 41.12: https://laws-lois.justice.gc.ca/eng/acts/C-42/section-41.12.html
- Amazon Trademark Guidelines: https://affiliate-program.amazon.com/help/operating/amazonmarks/
- Prime Video Terms of Use: https://www.primevideo.com/tou
- Prime Video system requirements for computers: https://www.primevideo.com/help?nodeId=GUX9FYHU5D8LC9EJ
