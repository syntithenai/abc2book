import { withDropdownPositionFix } from './reactBootstrapDropdownPatch';

describe('withDropdownPositionFix', function() {
  test('adds a post-paint reposition modifier', function() {
    const config = withDropdownPositionFix({ strategy: 'fixed' });
    expect(config.strategy).toBe('fixed');
    expect(config.modifiers.some(function(m) { return m.name === 'abc2bookDropdownPositionFix'; })).toBe(true);
  });

  test('preserves existing modifiers', function() {
    const config = withDropdownPositionFix({
      modifiers: [{ name: 'offset', options: { offset: [0, 4] } }],
    });
    expect(config.modifiers).toHaveLength(2);
    expect(config.modifiers[0].name).toBe('offset');
  });

  test('does not duplicate the fix modifier', function() {
    const first = withDropdownPositionFix({});
    const second = withDropdownPositionFix(first);
    expect(second.modifiers.filter(function(m) { return m.name === 'abc2bookDropdownPositionFix'; })).toHaveLength(1);
  });

  test('wraps function popperConfig', function() {
    const wrapped = withDropdownPositionFix(function() {
      return { strategy: 'absolute' };
    });
    const config = wrapped({});
    expect(config.strategy).toBe('absolute');
    expect(config.modifiers.some(function(m) { return m.name === 'abc2bookDropdownPositionFix'; })).toBe(true);
  });
});
