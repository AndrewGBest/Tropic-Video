// The About and help panel's words. The notice is the wording
// LEGAL-GUARDRAILS.md requires in every release; keep the two in step.
export const NOTICE =
  'Tropic Video is an unofficial, independent project. It is not affiliated with, endorsed by or supported by Amazon. ' +
  'Prime Video and Amazon are trademarks of Amazon.com, Inc. or its affiliates. A valid subscription is required. ' +
  'Tropic Video does not provide, unlock or bypass access to any content and does not remove or work around DRM.';

export const HELP: readonly (readonly [string, string])[] = [
  ['Arrows or D-pad', 'Move'],
  ['Enter or A', 'Select; play or pause in the player'],
  ['Backspace, Escape, Back or B', 'Back'],
  ['Up or Down in the player', "Show the player's controls"],
  ['Space or X', 'Play or pause'],
  ['Left, Right, LB or RB in the player', 'Skip back or forward'],
  ['/ or Y', 'Search'],
  ['Ctrl+O, Menu, Info or right stick click', 'This panel'],
  ['Ctrl+Q', 'Quit'],
];

export function aboutTitle(version: string | undefined): string {
  return version ? `Tropic Video ${version}` : 'Tropic Video';
}
