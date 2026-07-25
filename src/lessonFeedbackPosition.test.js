/**
 * @jest-environment jsdom
 */

import {
  findLessonSelectionPosition,
  getRangeOffsetsWithin,
} from './lessonFeedbackUtils'

describe('lessonFeedbackPosition', function() {
  it('captures block index and source offsets from a DOM selection', function() {
    const root = document.createElement('div')
    root.innerHTML = [
      '<section id="overview" class="lesson-section">',
      '  <div class="lesson-section-body">',
      '    <div class="lesson-block-position" data-lesson-block-index="0" data-lesson-block-type="markdown">',
      '      <p>Walk into a pub. The session starts at nine.</p>',
      '    </div>',
      '  </div>',
      '</section>',
    ].join('')
    document.body.appendChild(root)

    const paragraph = root.querySelector('p')
    const textNode = paragraph.firstChild
    const range = document.createRange()
    range.setStart(textNode, 21)
    range.setEnd(textNode, 28)
    const selection = {
      rangeCount: 1,
      isCollapsed: false,
      toString: function() { return range.toString() },
      getRangeAt: function() { return range },
      anchorNode: textNode,
    }

    const lesson = {
      path: '10-regions/celtic/ireland/01-overview.md',
      sections: [{
        id: 'overview',
        blocks: [{ type: 'markdown', text: 'Walk into a pub. The session starts at nine.' }],
      }],
    }

    const info = findLessonSelectionPosition(root, selection, lesson)
    expect(info.sectionId).toBe('overview')
    expect(info.position.blockIndex).toBe(0)
    expect(info.position.blockType).toBe('markdown')
    expect(info.position.sourceStart).toBe(21)
    expect(info.position.sourceEnd).toBe(28)
    expect(info.position.lessonPath).toMatch(/01-overview\.md/)

    document.body.removeChild(root)
  })

  it('computes range offsets within a container', function() {
    const container = document.createElement('div')
    container.textContent = 'Hello world'
    const textNode = container.firstChild
    const range = document.createRange()
    range.setStart(textNode, 6)
    range.setEnd(textNode, 11)
    expect(getRangeOffsetsWithin(container, range)).toEqual({ start: 6, end: 11 })
  })
})
