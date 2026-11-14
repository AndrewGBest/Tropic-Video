import { describe, expect, it } from 'vitest';
import { actionFor, ACTION_NAMES, normaliseKey, parseConfig } from '../src/shared/config';
import { keyToAction } from '../src/layer/input/keys';

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
