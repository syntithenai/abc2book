import {
  assignBackgroundBlocksToPages,
  expandBackgroundBlocksForPrint,
  extractLinksFromListItems,
  getBackgroundContinuationPageFontSize,
  groupMarkdownBlocksIntoLayoutSections,
  groupMarkdownBlocksIntoSections,
  isBoldOnlySectionTitleBlock,
  isSectionStartBlock,
  pageContentFitsAvailable,
  resolveBackgroundPageLayout,
  resolveBackgroundSectionFontSize,
  scaleBackgroundContentHeight,
  shouldBackgroundStartOnNewPrintPage,
  splitBackgroundBlocksForPrint,
} from './printBackgroundInfoLayout';

describe('groupMarkdownBlocksIntoSections', function() {
  test('groups blocks under headings into sections', function() {
    const blocks = [
      { type: 'paragraph', lines: [] },
      { type: 'heading', level: 2, children: [] },
      { type: 'paragraph', lines: [] },
      { type: 'heading', level: 2, children: [] },
      { type: 'ul', items: [] },
    ];
    expect(groupMarkdownBlocksIntoSections(blocks)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  test('treats bold-only paragraphs as section starts', function() {
    const blocks = [
      { type: 'paragraph', lines: [[{ type: 'text', value: 'Intro' }]] },
      { type: 'paragraph', lines: [[{ type: 'strong', children: [{ type: 'text', value: 'Overview and alternative names' }] }]] },
      { type: 'paragraph', lines: [[{ type: 'text', value: 'Details here.' }]] },
    ];
    expect(groupMarkdownBlocksIntoSections(blocks)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 2 },
    ]);
    expect(isBoldOnlySectionTitleBlock(blocks[1])).toBe(true);
    expect(isSectionStartBlock(blocks[1])).toBe(true);
  });
});

describe('shouldBackgroundStartOnNewPrintPage', function() {
  test('returns true when lyrics share the tune page with background info', function() {
    expect(shouldBackgroundStartOnNewPrintPage({
      canSplitBackground: true,
      showLyrics: true,
      showChordsBlockColumn: false,
      showNotation: false,
    })).toBe(true);
  });

  test('returns false for background-info-only pages', function() {
    expect(shouldBackgroundStartOnNewPrintPage({
      canSplitBackground: false,
      showLyrics: false,
      showChordsBlockColumn: false,
      showNotation: false,
    })).toBe(false);
  });
});

describe('resolveBackgroundPageLayout', function() {
  test('moves all blocks to continuation pages when page 0 was reserved empty', function() {
    expect(resolveBackgroundPageLayout([[], [0, 1, 2]], true)).toEqual({
      mainBlockIndices: null,
      continuationPages: [[0, 1, 2]],
    });
  });

  test('treats a single packed page as continuation-only when forced to a new page', function() {
    expect(resolveBackgroundPageLayout([[0, 1, 2, 3]], true)).toEqual({
      mainBlockIndices: null,
      continuationPages: [[0, 1, 2, 3]],
    });
  });

  test('keeps the first page on the main tune page when not forced', function() {
    expect(resolveBackgroundPageLayout([[0, 1], [2, 3]], false)).toEqual({
      mainBlockIndices: [0, 1],
      continuationPages: [[2, 3]],
    });
  });
});

describe('assignBackgroundBlocksToPages', function() {
  const blocks = [
    { type: 'heading', level: 2, children: [] },
    { type: 'paragraph', lines: [] },
    { type: 'heading', level: 2, children: [] },
    { type: 'paragraph', lines: [] },
  ];
  const heights = [40, 100, 40, 100];

  test('packs multiple sections onto one page when they fit', function() {
    expect(assignBackgroundBlocksToPages(heights, blocks, {
      getAvailableForPage: function() { return 400; },
    })).toEqual([[0, 1, 2, 3]]);
  });

  test('starts a new page when the next section would not fit even at min font', function() {
    expect(assignBackgroundBlocksToPages(heights, blocks, {
      getAvailableForPage: function() { return 170; },
      baseFontPx: 14,
      minFontPx: 9,
    })).toEqual([[0, 1], [2, 3]]);
  });

  test('packs sections using font-shrink headroom before starting a new page', function() {
    expect(assignBackgroundBlocksToPages(heights, blocks, {
      getAvailableForPage: function() { return 250; },
      baseFontPx: 14,
      minFontPx: 9,
    })).toEqual([[0, 1, 2, 3]]);
  });

  test('starts on a continuation page when the first section does not fit the main tune slot', function() {
    expect(assignBackgroundBlocksToPages(heights, blocks, {
      getAvailableForPage: function(pageIndex) {
        return pageIndex === 0 ? 50 : 400;
      },
      baseFontPx: 14,
      minFontPx: 9,
      skipMainPageWhenSectionDoesNotFit: true,
    })).toEqual([[], [0, 1, 2, 3]]);
  });

  test('skips the main tune page entirely when forced to continuation pages', function() {
    expect(assignBackgroundBlocksToPages(heights, blocks, {
      getAvailableForPage: function() { return 400; },
      forceBackgroundContinuationOnly: true,
    })).toEqual([[], [0, 1, 2, 3]]);
  });

  test('never splits a section across pages', function() {
    const tallBlocks = [
      { type: 'heading', level: 2, children: [] },
      { type: 'paragraph', lines: [] },
    ];
    const tallHeights = [40, 500];
    const pages = assignBackgroundBlocksToPages(tallHeights, tallBlocks, {
      getAvailableForPage: function() { return 200; },
    });
    expect(pages).toEqual([[0, 1]]);
  });
});

describe('expandBackgroundBlocksForPrint', function() {
  test('expands notable recordings list items into atomic print blocks', function() {
    const blocks = [
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'YouTube' }] },
      { type: 'ul', items: [[{ type: 'link', href: 'https://youtu.be/abc', children: [{ type: 'text', value: 'Live' }] }]] },
    ];
    expect(expandBackgroundBlocksForPrint(blocks)).toEqual([
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'YouTube' }] },
      { type: 'printRecordingLink', href: 'https://youtu.be/abc', label: 'Live' },
    ]);
  });
});

describe('groupMarkdownBlocksIntoLayoutSections', function() {
  test('treats each recording link block as its own layout section', function() {
    const blocks = [
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'YouTube' }] },
      { type: 'printRecordingLink', href: 'https://youtu.be/a', label: 'A' },
      { type: 'printRecordingLink', href: 'https://youtu.be/b', label: 'B' },
    ];
    expect(groupMarkdownBlocksIntoLayoutSections(blocks)).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
      { start: 2, end: 2 },
    ]);
  });
});

describe('splitBackgroundBlocksForPrint', function() {
  test('keeps record labels and notable recordings on the main tune page', function() {
    const blocks = [
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'Overview' }] },
      { type: 'paragraph', lines: [[{ type: 'text', value: 'Intro.' }]] },
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'Record labels and releases' }] },
      { type: 'paragraph', lines: [[{ type: 'text', value: 'Vanguard.' }]] },
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'YouTube' }] },
      { type: 'ul', items: [[{ type: 'link', href: 'https://youtu.be/abc', children: [{ type: 'text', value: 'Live' }] }]] },
      { type: 'heading', level: 2, children: [{ type: 'text', value: 'Historical anecdotes' }] },
      { type: 'paragraph', lines: [[{ type: 'text', value: 'Festivals.' }]] },
    ];
    expect(splitBackgroundBlocksForPrint(blocks)).toEqual({
      mainBlockIndices: [0, 1, 2, 3, 4, 5],
      suffixBlockIndices: [6, 7],
    });
  });
});

describe('extractLinksFromListItems', function() {
  test('extracts href and label from markdown list items', function() {
    expect(extractLinksFromListItems([
      [{ type: 'link', href: 'https://youtu.be/abc', children: [{ type: 'text', value: 'Live' }] }],
    ])).toEqual([{ href: 'https://youtu.be/abc', label: 'Live' }]);
  });
});

describe('pageContentFitsAvailable', function() {
  test('allows tighter packing when min-font scaling fits', function() {
    expect(pageContentFitsAvailable(280, 250, { baseFontPx: 14, minFontPx: 9 })).toBe(true);
    expect(scaleBackgroundContentHeight(280, 9, 14)).toBe(180);
  });
});

describe('resolveBackgroundSectionFontSize', function() {
  test('shrinks section text when it exceeds the available height', function() {
    expect(resolveBackgroundSectionFontSize(400, 250, 14, 9)).toBe(9);
  });
});
