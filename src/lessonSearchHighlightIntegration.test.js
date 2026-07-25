/**
 * @jest-environment jsdom
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import LessonMarkdown from './components/LessonMarkdown'
import LessonContent from './components/LessonContent'

describe('lesson search highlight integration', function() {
  let container

  beforeEach(function() {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(function() {
    document.body.removeChild(container)
    container = null
  })

  function render(ui) {
    const root = createRoot(container)
    act(function() {
      root.render(ui)
    })
    return root
  }

  test('LessonMarkdown highlights block paragraphs with newlines', function() {
    const text = 'Walk into a pub.\n\nThe session starts at nine.'
    render(
      <LessonMarkdown text={text} highlightTerm="session" />
    )
    const marks = container.querySelectorAll('mark.lesson-search-highlight')
    expect(marks.length).toBeGreaterThan(0)
    expect(marks[0].textContent.toLowerCase()).toBe('session')
  })

  test('LessonContent highlights section body text', function() {
    const lesson = {
      id: 'test-lesson',
      title: 'Test',
      sections: [{
        id: 'overview',
        title: 'Overview',
        level: 2,
        blocks: [{
          type: 'markdown',
          text: 'Walk into a pub.\n\nThe session starts at nine.',
        }],
      }],
    }
    render(
      <LessonContent
        lesson={lesson}
        highlightQuery="session"
        tunebook={{ icons: {} }}
        navigate={function() {}}
        mediaController={null}
      />
    )
    const marks = container.querySelectorAll('mark.lesson-search-highlight')
    expect(marks.length).toBeGreaterThan(0)
  })
})
