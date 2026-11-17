import { describe, expect, it } from 'vitest';
import { isSecretField, OSK_COLUMNS, OSK_PAGES, oskDock, OskModel, typableText } from '../src/shared/osk';

describe('on-screen keyboard layout', () => {
  const pages = Object.values(OSK_PAGES);

  it('fills every row exactly, on every face', () => {
    for (const rows of pages) for (const row of rows) expect(row.reduce((n, k) => n + k.span, 0)).toBe(OSK_COLUMNS);
  });

  it('has every letter and digit once on the letters face, and what an email address needs', () => {
    const typed = OSK_PAGES.lower.flat().filter((k) => k.kind === 'char').map((k) => k.text);
    for (const c of 'abcdefghijklmnopqrstuvwxyz0123456789@.-_') expect(typed.filter((t) => t === c)).toHaveLength(1);
  });

  it('can type every printable ASCII character across its faces', () => {
    const typed = new Set(pages.flat(2).map((k) => k.text));
    for (let code = 0x20; code < 0x7f; code++) expect(typed.has(String.fromCharCode(code)), String.fromCharCode(code)).toBe(true);
  });

  it('has space, delete and enter on every face', () => {
    for (const rows of pages) {
      const kinds = rows.flat().map((k) => k.kind);
      for (const kind of ['space', 'backspace', 'submit']) expect(kinds).toContain(kind);
    }
  });
});

describe('OskModel', () => {
  it('starts on the first key and walks a row, stopping at its ends', () => {
    const m = new OskModel();
    expect(m.key.text).toBe('a');
    expect(m.move('left')).toBe(false);
    for (let i = 0; i < 9; i++) expect(m.move('right')).toBe(true);
    expect(m.key.text).toBe('j');
    expect(m.move('right')).toBe(false);
  });

  it('keeps its column between letter rows', () => {
    const m = new OskModel();
    m.move('right');
    m.move('right');
    m.move('down');
    expect(m.key.text).toBe('m');
    m.move('down');
    m.move('down');
    expect(m.key.text).toBe('3');
    expect(m.move('up')).toBe(true);
    expect(m.key.text).toBe('w');
  });

  it('lands on the wide key under the current one, and comes back up under its middle', () => {
    const m = new OskModel();
    m.row = 3;
    m.index = 4; // "5", fifth column
    m.move('down');
    expect(m.key.kind).toBe('space');
    m.index = 4; // "enter", the last two columns
    expect(m.move('down')).toBe(false);
    m.move('up');
    expect(m.key.text).toBe('0');
    m.row = 3;
    m.index = 6; // "7", seventh column, above "delete"
    m.move('down');
    expect(m.key.kind).toBe('backspace');
  });

  it('reports the top edge', () => {
    expect(new OskModel().move('up')).toBe(false);
  });

  it('shift gives capitals and back, keeping the highlight on shift', () => {
    const m = new OskModel();
    expect(m.switchPage()).toBe(false); // "a" is not a face key
    m.row = 4;
    m.index = 0;
    expect(m.switchPage()).toBe(true);
    expect(m.page).toBe('upper');
    expect(m.key.kind).toBe('shift');
    expect(m.rows[0]![0]!.text).toBe('A');
    m.switchPage();
    expect(m.page).toBe('lower');
  });

  it('goes to symbols and back, with the highlight on the key that returns', () => {
    const m = new OskModel();
    m.row = 4;
    m.index = 1;
    m.switchPage();
    expect(m.page).toBe('symbols');
    expect(m.key.kind).toBe('letters');
    m.switchPage();
    expect(m.page).toBe('lower');
    expect(m.key.kind).toBe('symbols');
  });

  it('opens on small letters again after a reset', () => {
    const m = new OskModel();
    m.page = 'symbols';
    m.reset();
    expect(m.page).toBe('lower');
  });
});

describe('typableText', () => {
  it('accepts short printable text', () => {
    expect(typableText('a')).toBe('a');
    expect(typableText(' ')).toBe(' ');
    expect(typableText('é')).toBe('é');
  });

  it('refuses control characters, long strings and non-strings', () => {
    for (const bad of ['', '\n', '\u0008', 'a\tb', 'hello', 5, null, undefined, {}]) expect(typableText(bad)).toBeNull();
  });
});

describe('isSecretField', () => {
  it('recognises passwords and one-time codes', () => {
    expect(isSecretField('password', null)).toBe(true);
    expect(isSecretField('PASSWORD', '')).toBe(true);
    expect(isSecretField('text', 'current-password')).toBe(true);
    expect(isSecretField('tel', 'one-time-code')).toBe(true);
  });

  it('allows ordinary fields', () => {
    expect(isSecretField('search', 'off')).toBe(false);
    expect(isSecretField(null, null)).toBe(false);
    expect(isSecretField('email', 'username')).toBe(false);
  });
});

describe('oskDock', () => {
  const vh = 540;
  it('sits at the bottom when the field is in the upper part of the screen', () => {
    expect(oskDock({ top: 40, bottom: 80 }, vh)).toBe('bottom');
  });
  it('moves to the top when it would cover the field', () => {
    // The email field of the sign-in page of Steamboat's service, as measured in its shell: 334 to 394 of 541.
    expect(oskDock({ top: 334, bottom: 394 }, vh)).toBe('top');
    expect(oskDock({ top: 480, bottom: 530 }, vh)).toBe('top');
  });
  it('covers as little as it can of a field in the middle', () => {
    expect(oskDock({ top: 250, bottom: 300 }, vh)).toBe('top');
    expect(oskDock({ top: 240, bottom: 290 }, vh)).toBe('bottom');
  });
  it('stays at the bottom when there is nothing to measure', () => {
    expect(oskDock({ top: 0, bottom: 0 }, 0)).toBe('bottom');
    expect(oskDock({ top: 2000, bottom: 2040 }, vh)).toBe('bottom');
  });
});
