import { parseLessonMarkdownBlocks, parseLessonMarkdownInline } from './lessonMarkdownUtils'

describe('lessonMarkdownUtils', function() {
  test('parses markdown tables', function() {
    const text = [
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n')
    const blocks = parseLessonMarkdownBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('table')
    expect(blocks[0].header).toHaveLength(2)
    expect(blocks[0].rows).toHaveLength(1)
  })

  test('parses images', function() {
    const blocks = parseLessonMarkdownBlocks('![Caption](https://example.com/a.jpg)')
    expect(blocks[0].type).toBe('image')
    expect(blocks[0].src).toContain('example.com')
  })

  test('parses mermaid fenced blocks', function() {
    const text = [
      '```mermaid',
      'flowchart TD',
      '  A --> B',
      '```',
    ].join('\n')
    const blocks = parseLessonMarkdownBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('mermaid')
    expect(blocks[0].code).toContain('flowchart TD')
  })

  test('parseLessonMarkdownInline strips list markers for inline flow', function() {
    const blocks = parseLessonMarkdownInline('- **Brendan Bowyer** and **"The Hucklebuck"**')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[0].lines).toHaveLength(1)
    expect(blocks[0].lines[0][0].type).toBe('strong')
    expect(blocks[0].lines[0][0].children[0].value).toBe('Brendan Bowyer')
  })
})
