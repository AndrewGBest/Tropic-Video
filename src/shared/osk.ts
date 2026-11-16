// On-screen keyboard: the layout and where the highlight goes. Pure, so it is
// unit-tested; drawing is in layer/ui/overlay.ts and typing is done by the
// shell as ordinary text input.
import type { Direction } from './actions';

export type OskKind = 'char' | 'space' | 'backspace' | 'submit';

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

const chars = (s: string): OskKey[] => [...s].map((c) => ({ kind: 'char', label: c, text: c, span: 1 }));

export const OSK_ROWS: readonly (readonly OskKey[])[] = [
  chars('abcdefghij'),
  chars('klmnopqrst'),
  chars("uvwxyz'-&."),
  chars('1234567890'),
  [
    { kind: 'space', label: 'space', text: ' ', span: 4 },
    { kind: 'backspace', label: 'delete', span: 3 },
    { kind: 'submit', label: 'enter', span: 3 },
  ],
];

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
  row = 0;
  index = 0;

  get key(): OskKey {
    return OSK_ROWS[this.row]![this.index]!;
  }

  reset(): void {
    this.row = 0;
    this.index = 0;
  }

  /** Moves the highlight. Returns false at an edge (the caller may then close the keyboard or do nothing). */
  move(dir: Direction): boolean {
    const row = OSK_ROWS[this.row]!;
    if (dir === 'left' || dir === 'right') {
      const next = this.index + (dir === 'left' ? -1 : 1);
      if (next < 0 || next >= row.length) return false;
      this.index = next;
      return true;
    }
    const target = this.row + (dir === 'up' ? -1 : 1);
    if (target < 0 || target >= OSK_ROWS.length) return false;
    // Land on the key under the middle of the current one.
    const middle = starts(row)[this.index]! + this.key.span / 2;
    const targetRow = OSK_ROWS[target]!;
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
 * True for fields the on-screen keyboard must stay out of: passwords and
 * one-time codes. Credentials are typed by the user on a real keyboard,
 * never by the app (Hard rule 9).
 */
export function isSecretField(type: string | null, autocomplete: string | null): boolean {
  if ((type ?? '').toLowerCase() === 'password') return true;
  return /password|one-time-code/i.test(autocomplete ?? '');
}
