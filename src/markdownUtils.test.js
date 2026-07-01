import { parseInline, parseMarkdownBlocks } from './markdownUtils';

describe('parseInline', function() {
  test('parses bold, italic, and plain text', function() {
    const nodes = parseInline('A **bold** and _italic_ word');
    expect(nodes[0]).toEqual({ type: 'text', value: 'A ' });
    expect(nodes[1].type).toBe('strong');
    expect(nodes[1].children[0].value).toBe('bold');
    expect(nodes[3].type).toBe('em');
    expect(nodes[3].children[0].value).toBe('italic');
  });

  test('parses inline markdown links', function() {
    const nodes = parseInline('See [Wiki](https://en.wikipedia.org/wiki/X) now');
    const link = nodes.find(function(n) { return n.type === 'link'; });
    expect(link.href).toBe('https://en.wikipedia.org/wiki/X');
    expect(link.children[0].value).toBe('Wiki');
  });

  test('auto-links bare URLs', function() {
    const nodes = parseInline('Watch https://youtu.be/abc here');
    const link = nodes.find(function(n) { return n.type === 'link'; });
    expect(link.href).toBe('https://youtu.be/abc');
    expect(link.children[0].value).toBe('https://youtu.be/abc');
  });
});

describe('parseMarkdownBlocks', function() {
  test('parses headings', function() {
    const blocks = parseMarkdownBlocks('# Title\n## Subtitle');
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 2 });
  });

  test('parses unordered and ordered lists', function() {
    const blocks = parseMarkdownBlocks('- one\n- two\n\n1. first\n2. second');
    const ul = blocks.find(function(b) { return b.type === 'ul'; });
    const ol = blocks.find(function(b) { return b.type === 'ol'; });
    expect(ul.items).toHaveLength(2);
    expect(ol.items).toHaveLength(2);
  });

  test('groups consecutive lines into paragraphs split by blank lines', function() {
    const blocks = parseMarkdownBlocks('Line one\nLine two\n\nSecond para');
    const paragraphs = blocks.filter(function(b) { return b.type === 'paragraph'; });
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].lines).toHaveLength(2);
    expect(paragraphs[1].lines).toHaveLength(1);
  });

  test('handles empty input', function() {
    expect(parseMarkdownBlocks('')).toEqual([]);
  });
});
