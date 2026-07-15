import {
  normalizePerformanceSetItems,
  exportPerformanceSetText,
  savePerformanceSet,
  getPerformanceSet,
  appendTunesToPerformanceSet,
} from './performanceSetStore';

describe('appendTunesToPerformanceSet', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('appends tunes to an existing set', function() {
    const saved = savePerformanceSet({
      name: 'Gig',
      items: [{ type: 'tune', tuneId: 'a' }],
    });
    const updated = appendTunesToPerformanceSet(saved.id, ['b', 'c']);
    expect(updated.items).toEqual([
      { type: 'tune', tuneId: 'a' },
      { type: 'tune', tuneId: 'b' },
      { type: 'tune', tuneId: 'c' },
    ]);
    expect(getPerformanceSet(saved.id).items).toEqual(updated.items);
  });

  test('returns null for missing set', function() {
    expect(appendTunesToPerformanceSet('missing', ['a'])).toBeNull();
  });
});

describe('normalizePerformanceSetItems', function() {
  test('migrates standalone notes onto adjacent tunes', function() {
    const items = [
      { type: 'note', text: 'Intro' },
      { type: 'tune', tuneId: 'a' },
      { type: 'note', text: 'Slow down' },
      { type: 'tune', tuneId: 'b', note: 'Encore' },
    ];
    expect(normalizePerformanceSetItems(items)).toEqual([
      { type: 'tune', tuneId: 'a', note: 'Intro · Slow down' },
      { type: 'tune', tuneId: 'b', note: 'Encore' },
    ]);
  });

  test('keeps tune-only items unchanged', function() {
    expect(normalizePerformanceSetItems([
      { type: 'tune', tuneId: 'a' },
    ])).toEqual([
      { type: 'tune', tuneId: 'a' },
    ]);
  });
});

describe('exportPerformanceSetText', function() {
  test('includes per-tune notes in export', function() {
    const text = exportPerformanceSetText({
      name: 'Gig',
      items: [{ type: 'tune', tuneId: 'a', note: 'Capo 2' }],
    }, {
      a: { id: 'a', name: 'Tune A' },
    });
    expect(text).toContain('Tune A [Capo 2]');
  });
});
