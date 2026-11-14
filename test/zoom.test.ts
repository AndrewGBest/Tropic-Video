import { describe, expect, it } from 'vitest';
import { tvZoom } from '../src/main/zoom';

const hd = (height: number): { width: number; height: number } => ({ width: (height * 16) / 9, height });

describe('tvZoom', () => {
  it('scales 16:9 screens so the site sees a 960x540 viewport', () => {
    expect(tvZoom(hd(540))).toBe(1);
    expect(tvZoom(hd(720))).toBe(1.33);
    expect(tvZoom(hd(1080))).toBe(2);
    expect(tvZoom(hd(2160))).toBe(4);
  });

  // Seen on a 1280x800 screen: scaling by height alone left the site 865 wide and it collapsed its navigation.
  it('keeps the viewport at least 960 wide on narrower screens', () => {
    const zoom = tvZoom({ width: 1280, height: 800 });
    expect(zoom).toBe(1.33);
    expect(1280 / zoom).toBeGreaterThanOrEqual(960);
    expect(tvZoom({ width: 1080, height: 1920 })).toBe(1.12);
  });

  it('uses the height on wider screens', () => {
    expect(tvZoom({ width: 2560, height: 1080 })).toBe(2);
  });

  it('never shrinks a small window and never exceeds the maximum', () => {
    expect(tvZoom({ width: 640, height: 480 })).toBe(1);
    expect(tvZoom({ width: 0, height: 0 })).toBe(1);
    expect(tvZoom({ width: Number.NaN, height: 1080 })).toBe(1);
    expect(tvZoom(hd(4320))).toBe(4);
  });

  it('honours a valid override and ignores a bad one', () => {
    expect(tvZoom(hd(1080), '1')).toBe(1);
    expect(tvZoom(hd(720), '1.25')).toBe(1.25);
    expect(tvZoom(hd(720), '9')).toBe(4);
    expect(tvZoom(hd(1080), 'big')).toBe(2);
    expect(tvZoom(hd(1080), '-2')).toBe(2);
    expect(tvZoom(hd(1080), '')).toBe(2);
  });

  it('rounds down to two decimals', () => {
    expect(tvZoom(hd(1000))).toBe(1.85);
    expect(tvZoom(hd(1079))).toBe(1.99);
  });
});
