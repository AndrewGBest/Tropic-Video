import { describe, expect, it } from 'vitest';
import { actionFor, ACTION_NAMES, normaliseKey, parseConfig } from '../src/shared/config';
import { keyToAction } from '../src/layer/input/keys';
import { Btn, buttonToAction } from '../src/layer/input/gamepad';

describe('parseConfig', () => {
  it('treats a missing file as empty', () => {
    expect(parseConfig(undefined)).toEqual({ config: { keys: {} }, problems: [] });
  });

  it('reads zoom and key mappings', () => {
    const { config, problems } = parseConfig({ zoom: 1.5, keys: { F1: 'search', 'ctrl + H': 'none', Space: 'playPause' } });
    expect(problems).toEqual([]);
    expect(config).toEqual({ zoom: 1.5, keys: { F1: 'search', 'Ctrl+h': 'none', ' ': 'playPause' } });
  });

  it('drops what it cannot use and says why, keeping the rest', () => {
    const { config, problems } = parseConfig({
      zoom: 'big',
      keys: { F2: 'explode', 'Alt+x': 'back', F3: 'back', '': 'back' },
      telemetry: true,
    });
    expect(config).toEqual({ keys: { F3: 'back' } });
    expect(problems).toHaveLength(5);
    expect(problems.join('\n')).toMatch(/zoom/);
    expect(problems.join('\n')).toMatch(/unknown setting "telemetry"/);
  });

  it('rejects files that are not an object', () => {
    expect(parseConfig([1, 2]).problems).toHaveLength(1);
    expect(parseConfig('x').problems).toHaveLength(1);
    expect(parseConfig({ keys: [] }).problems).toHaveLength(1);
  });

  it('does not treat inherited names as mappings', () => {
    const { config } = parseConfig(JSON.parse('{"keys": {"__proto__": "back", "constructor": "back"}}'));
    expect(Object.hasOwn(config.keys, 'constructor')).toBe(true);
    expect(keyToAction({ key: 'toString' }, 'browse', config.keys)).toBeNull();
  });
});

describe('normaliseKey', () => {
  it('keeps the case of plain keys and lowers single letters after Ctrl', () => {
    expect(normaliseKey('MediaStop')).toBe('MediaStop');
    expect(normaliseKey('A')).toBe('A');
    expect(normaliseKey('Ctrl+H')).toBe('Ctrl+h');
    expect(normaliseKey('CTRL+F5')).toBe('Ctrl+F5');
    expect(normaliseKey('Shift+x')).toBeNull();
  });
});

describe('actionFor', () => {
  it('covers every action name', () => {
    for (const name of ACTION_NAMES) {
      const action = actionFor(name);
      if (name === 'none') expect(action).toBeNull();
      else expect(action).toHaveProperty('type');
    }
  });
});

describe('key overrides', () => {
  const keys = { F1: 'search', MediaStop: 'back', 'Ctrl+o': 'none', a: 'select', Enter: 'back' } as const;

  it('win over the built-in table', () => {
    expect(keyToAction({ key: 'F1' }, 'browse', keys)).toEqual({ type: 'search' });
    expect(keyToAction({ key: 'MediaStop' }, 'player', keys)).toEqual({ type: 'back' });
    expect(keyToAction({ key: 'Enter' }, 'browse', keys)).toEqual({ type: 'back' });
  });

  it('can switch a built-in key off', () => {
    expect(keyToAction({ key: 'o', ctrlKey: true }, 'browse')).toEqual({ type: 'settings' });
    expect(keyToAction({ key: 'o', ctrlKey: true }, 'browse', keys)).toBeNull();
  });

  it('never take a letter away from a text field', () => {
    expect(keyToAction({ key: 'a' }, 'browse', keys)).toEqual({ type: 'select' });
    expect(keyToAction({ key: 'a' }, 'text', keys)).toBeNull();
    expect(keyToAction({ key: 'MediaStop' }, 'text', keys)).toEqual({ type: 'back' });
  });

  it('leave unmapped keys as they were', () => {
    expect(keyToAction({ key: 'ArrowLeft' }, 'browse', keys)).toEqual({ type: 'move', dir: 'left' });
  });
});

describe('gamepad button overrides', () => {
  it('are read from the config and validated', () => {
    const { config, problems } = parseConfig({ buttons: { '8': 'about', '09': 'playPause', '40': 'back', x: 'back', '3': 'fly' } });
    expect(config.buttons).toEqual({ '8': 'about', '9': 'playPause' });
    expect(problems).toHaveLength(3);
  });

  it('win over the built-in table and can switch a button off', () => {
    const buttons = { [String(Btn.Y)]: 'about', [String(Btn.X)]: 'none' } as const;
    expect(buttonToAction(Btn.Y, 'browse')).toEqual({ type: 'search' });
    expect(buttonToAction(Btn.Y, 'browse', buttons)).toEqual({ type: 'settings' });
    expect(buttonToAction(Btn.X, 'browse', buttons)).toBeNull();
    expect(buttonToAction(Btn.A, 'browse', buttons)).toEqual({ type: 'select' });
  });

  it('reads hardwareDecode as a plain switch', () => {
    expect(parseConfig({ hardwareDecode: true }).config.hardwareDecode).toBe(true);
    const bad = parseConfig({ hardwareDecode: 'yes' });
    expect(bad.config.hardwareDecode).toBeUndefined();
    expect(bad.problems.join()).toMatch(/hardwareDecode/);
  });
});
