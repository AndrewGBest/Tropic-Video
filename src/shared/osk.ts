// On-screen keyboard: the layout and where the highlight goes. Pure, so it is
// unit-tested; drawing is in layer/ui/overlay.ts and typing is done by the
// shell as ordinary text input.
import type { Direction } from './actions';

export type OskKind = 'char' | 'space' | 'backspace' | 'submit' | 'shift' | 'symbols' | 'letters';

export interface OskKey {
  kind: OskKind;
  /** What is shown on the key. */
  label: string;
  /** What a char key types. */
  text?: string;
  /** Width in columns; the grid is COLUMNS wide. */
  span: number;
}

export const OSK_COLUMNS = 10;

/** The keyboard has three faces: small letters, capitals, and symbols. */
export type OskPage = 'lower' | 'upper' | 'symbols';

const chars = (s: string): OskKey[] => [...s].map((c) => ({ kind: 'char', label: c, text: c, span: 1 }));
const SPACE: OskKey = { kind: 'space', label: 'space', text: ' ', span: 2 };
const DELETE: OskKey = { kind: 'backspace', label: 'delete', span: 2 };
const SUBMIT: OskKey = { kind: 'submit', label: 'enter', span: 2 };

// Letters are in alphabetical order (see DECISIONS.md). The third row ends
// with what an email address needs, so signing in does not need the symbols face.
const letters = (shift: boolean): readonly (readonly OskKey[])[] => {
  const c = (s: string): OskKey[] => chars(shift ? s.toUpperCase() : s);
  return [
    c('abcdefghij'),
    c('klmnopqrst'),
    [...c('uvwxyz'), ...chars('@.-_')],
    chars('1234567890'),
    [{ kind: 'shift', label: shift ? 'SHIFT' : 'shift', span: 2 }, { kind: 'symbols', label: '!#?', span: 2 }, SPACE, DELETE, SUBMIT],
  ];
};

// Every printable ASCII symbol, so any password can be typed.
const SYMBOLS: readonly (readonly OskKey[])[] = [
  chars('1234567890'),
  chars('!@#$%^&*()'),
  chars('-_=+[]{}\\|'),
  chars(';:\'",.<>/?'),
  [{ kind: 'letters', label: 'abc', span: 2 }, ...chars('`~'), SPACE, DELETE, SUBMIT],
];

export const OSK_PAGES: Readonly<Record<OskPage, readonly (readonly OskKey[])[]>> = {
  lower: letters(false),
  upper: letters(true),
  symbols: SYMBOLS,
};

/** Left edge of each key in a row, in columns. */
function starts(row: readonly OskKey[]): number[] {
  let x = 0;
  return row.map((k) => {
    const start = x;
    x += k.span;
    return start;
  });
}

export class OskModel {
  page: OskPage = 'lower';
  row = 0;
  index = 0;

  get rows(): readonly (readonly OskKey[])[] {
    return OSK_PAGES[this.page];
  }

  get key(): OskKey {
    return this.rows[this.row]![this.index]!;
  }

  reset(): void {
    this.page = 'lower';
    this.row = 0;
    this.index = 0;
  }

  /**
   * Switches face for a shift, symbols or letters key and returns true; the
   * highlight stays on the key that was pressed. False for any other key.
   */
  switchPage(): boolean {
    const kind = this.key.kind;
    if (kind === 'shift') this.page = this.page === 'upper' ? 'lower' : 'upper';
    else if (kind === 'symbols') this.page = 'symbols';
    else if (kind === 'letters') this.page = 'lower';
    else return false;
    // Shift and the face keys are all first in the bottom row, or next to it.
    const row = this.rows[this.row]!;
    const want = kind === 'shift' ? 'shift' : kind === 'symbols' ? 'letters' : 'symbols';
    const i = row.findIndex((k) => k.kind === want);
    this.index = i === -1 ? 0 : i;
    return true;
  }

  /** Moves the highlight. Returns false at an edge (the caller may then close the keyboard or do nothing). */
  move(dir: Direction): boolean {
    const row = this.rows[this.row]!;
    if (dir === 'left' || dir === 'right') {
      const next = this.index + (dir === 'left' ? -1 : 1);
      if (next < 0 || next >= row.length) return false;
      this.index = next;
      return true;
    }
    const target = this.row + (dir === 'up' ? -1 : 1);
    if (target < 0 || target >= this.rows.length) return false;
    // Land on the key under the middle of the current one.
    const middle = starts(row)[this.index]! + this.key.span / 2;
    const targetRow = this.rows[target]!;
    const targetStarts = starts(targetRow);
    let best = 0;
    for (let i = 0; i < targetRow.length; i++) {
      if (middle >= targetStarts[i]!) best = i;
    }
    this.row = target;
    this.index = best;
    return true;
  }
}

/** Validates text the page side asks the shell to type: one short printable string, or null. */
export function typableText(text: unknown): string | null {
  if (typeof text !== 'string' || text.length === 0 || text.length > 4) return null;
  // No control characters: this is for typing, not for sending keys.
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }
  return text;
}

/**
 * True for password and one-time-code fields. A person may type these with
 * the on-screen keyboard, which passes each pick straight to the page and
 * keeps nothing. A scripted run never does (Hard rule 9): under --automation
 * the keyboard stays out of these fields.
 */
export function isSecretField(type: string | null, autocomplete: string | null): boolean {
  if ((type ?? '').toLowerCase() === 'password') return true;
  return /password|one-time-code/i.test(autocomplete ?? '');
}
