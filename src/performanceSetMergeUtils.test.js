import {
  applyPerformanceSetSelections,
  buildPerformanceSetFieldRows,
  formatPerformanceSetItemsForDisplay,
  performanceSetItemsEqual,
} from './performanceSetMergeUtils';
import {
  applyPerformanceSetMergeWithSelections,
  preparePerformanceSetMergeFromAbc,
} from './performanceSetIncomingMergeUtils';
import { renderPerformanceSetsToAbc } from './performanceSetSync';

describe('performanceSetMergeUtils', function() {
  const tunesById = {
    t1: { id: 't1', name: 'Tune One', composer: 'Me' },
    t2: { id: 't2', name: 'Tune Two' },
  };

  test('formatPerformanceSetItemsForDisplay lists tune names', function() {
    const text = formatPerformanceSetItemsForDisplay([
      { type: 'tune', tuneId: 't1', note: 'Opener' },
      { type: 'tune', tuneId: 't2', capo: 2 },
    ], tunesById);
    expect(text).toContain('1. Tune One — Me — Opener');
    expect(text).toContain('2. Tune Two (capo 2)');
  });

  test('buildPerformanceSetFieldRows shows playlist differences', function() {
    const rows = buildPerformanceSetFieldRows(
      { name: 'Gig', items: [{ type: 'tune', tuneId: 't1' }] },
      { name: 'Gig', items: [{ type: 'tune', tuneId: 't2' }] },
      tunesById
    );
    const itemsRow = rows.find(function(row) { return row.key === 'items'; });
    expect(itemsRow.differs).toBe(true);
    expect(itemsRow.originalDisplay).toContain('Tune One');
    expect(itemsRow.importedDisplay).toContain('Tune Two');
  });

  test('applyPerformanceSetSelections imports only selected fields', function() {
    const merged = applyPerformanceSetSelections(
      { id: 's1', name: 'Local', items: [{ type: 'tune', tuneId: 't1' }] },
      { id: 's1', name: 'Remote', items: [{ type: 'tune', tuneId: 't2' }] },
      { name: false, items: true }
    );
    expect(merged.name).toBe('Local');
    expect(performanceSetItemsEqual(merged.items, [{ type: 'tune', tuneId: 't2' }])).toBe(true);
  });
});

describe('performanceSetIncomingMergeUtils', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('preparePerformanceSetMergeFromAbc skips when local set list is newer', function() {
    localStorage.setItem('bookstorage_performance_sets', JSON.stringify({
      s1: {
        name: 'Local gig',
        date: '',
        notes: '',
        items: [{ type: 'tune', tuneId: 't1' }],
        updatedAt: 500,
      },
    }));
    const abc = renderPerformanceSetsToAbc({
      s1: {
        id: 's1',
        name: 'Remote gig',
        date: '',
        notes: '',
        items: [{ type: 'tune', tuneId: 't2' }],
        updatedAt: 100,
      },
    }, {});
    const prepared = preparePerformanceSetMergeFromAbc(abc, {});
    expect(prepared.hasIncoming).toBe(false);
  });

  test('applyPerformanceSetMergeWithSelections merges selected playlist fields', function() {
    localStorage.setItem('bookstorage_performance_sets', JSON.stringify({
      s1: {
        name: 'Local gig',
        date: '',
        notes: '',
        items: [{ type: 'tune', tuneId: 't1' }],
        updatedAt: 100,
      },
    }));
    const abc = renderPerformanceSetsToAbc({
      s1: {
        id: 's1',
        name: 'Remote gig',
        date: '2026-07-05',
        notes: 'Bring capo',
        items: [{ type: 'tune', tuneId: 't2' }],
        updatedAt: 500,
      },
    }, {});
    const prepared = preparePerformanceSetMergeFromAbc(abc, {});
    expect(prepared.records).toHaveLength(1);
    applyPerformanceSetMergeWithSelections(prepared, {
      s1: {
        accept: true,
        fieldSelections: { name: false, date: true, notes: false, items: true },
      },
    });
    const stored = JSON.parse(localStorage.getItem('bookstorage_performance_sets'));
    expect(stored.s1.name).toBe('Local gig');
    expect(stored.s1.date).toBe('2026-07-05');
    expect(stored.s1.items[0].tuneId).toBe('t2');
  });
});
