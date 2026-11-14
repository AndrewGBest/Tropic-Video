import { describe, expect, it } from 'vitest';
import { tvZoom } from '../src/main/zoom';

describe('tvZoom', () => {
  it('scales so the site sees a 720-high viewport', () => {
    expect(tvZoom(720)).toBe(1);
    expect(tvZoom(1080)).toBe(1.5);
    expect(tvZoom(1440)).toBe(2);
    expect(tvZoom(2160)).toBe(3);
  });

  it('never shrinks a small window and never exceeds the maximum', () => {
    expect(tvZoom(480)).toBe(1);
    expect(tvZoom(0)).toBe(1);
    expect(tvZoom(Number.NaN)).toBe(1);
    expect(tvZoom(4320)).toBe(3);
  });

  it('honours a valid override and ignores a bad one', () => {
    expect(tvZoom(1080, '1')).toBe(1);
    expect(tvZoom(720, '1.25')).toBe(1.25);
    expect(tvZoom(720, '9')).toBe(3);
    expect(tvZoom(1080, 'big')).toBe(1.5);
    expect(tvZoom(1080, '-2')).toBe(1.5);
    expect(tvZoom(1080, '')).toBe(1.5);
  });

  it('rounds to two decimals', () => {
    expect(tvZoom(1000)).toBe(1.39);
  });
});
