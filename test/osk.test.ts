import { describe, expect, it } from 'vitest';
import { OSK_COLUMNS, OSK_ROWS, OskModel, typableText } from '../src/shared/osk';

describe('on-screen keyboard layout', () => {
  it('fills every row exactly', () => {
    for (const row of OSK_ROWS) expect(row.reduce((n, k) => n + k.span, 0)).toBe(OSK_COLUMNS);
  });

  it('has every letter and digit once, and the three action keys', () => {
    const typed = OSK_ROWS.flat().filter((k) => k.kind === 'char').map((k) => k.text);
    for (const c of 'abcdefghijklmnopqrstuvwxyz0123456789') expect(typed.filter((t) => t === c)).toHaveLength(1);
    expect(OSK_ROWS.flat().map((k) => k.kind).filter((k) => k !== 'char').sort()).toEqual(['backspace', 'space', 'submit']);
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
    m.index = 1; // "2", second column
    m.move('down');
    expect(m.key.kind).toBe('space');
    m.index = 2; // "search", columns 7 to 9
    expect(m.move('down')).toBe(false);
    m.move('up');
    expect(m.key.text).toBe('9');
    m.row = 3;
    m.index = 5; // "6", sixth column, above "delete"
    m.move('down');
    expect(m.key.kind).toBe('backspace');
  });

  it('reports the top edge', () => {
    expect(new OskModel().move('up')).toBe(false);
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
