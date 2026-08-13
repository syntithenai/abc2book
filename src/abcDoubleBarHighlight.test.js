import { buildAbcDoubleBarHighlightParts } from './abcDoubleBarHighlight';

describe('buildAbcDoubleBarHighlightParts', function() {
  test('marks trailing section || as doubleBar', function() {
    const parts = buildAbcDoubleBarHighlightParts('"Am"zzzz|"E7"zzzz||');
    expect(parts).toEqual([
      { type: 'text', text: '"Am"zzzz|"E7"zzzz' },
      { type: 'doubleBar', text: '||' },
    ]);
  });

  test('marks every-bar || as midBlockDoubleBar', function() {
    const parts = buildAbcDoubleBarHighlightParts(
      '"D"zzzzzzzz||"G"zzzzzzzz||"A"zzzzzzzz||'
    );
    expect(parts.filter(function(p) { return p.type === 'midBlockDoubleBar'; })).toHaveLength(3);
    expect(parts.some(function(p) { return p.type === 'doubleBar'; })).toBe(false);
  });

  test('preserves newlines across lines', function() {
    const parts = buildAbcDoubleBarHighlightParts('A B||\nC D||');
    expect(parts.map(function(p) { return p.text; }).join('')).toBe('A B||\nC D||');
    expect(parts.filter(function(p) { return p.type === 'doubleBar'; })).toHaveLength(2);
  });
});
