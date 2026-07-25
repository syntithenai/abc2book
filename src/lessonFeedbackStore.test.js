import {
  LESSON_FEEDBACK_STORAGE_KEY,
  clearAllLessonFeedback,
  getAllLessonFeedback,
  getLessonFeedbackEntry,
  upsertLessonFeedback,
} from './lessonFeedbackStore'
import {
  compileLessonFeedbackText,
  lessonContentFeedbackId,
  lessonQuizFeedbackId,
  locateTextInSource,
  resolveBlockSourceFromLesson,
  formatLessonFeedbackPosition,
} from './lessonFeedbackUtils'

describe('lessonFeedbackUtils', function() {
  it('builds stable content and quiz ids', function() {
    expect(lessonContentFeedbackId('lesson-1', 'section-a', 'Selected text'))
      .toMatch(/^lesson-1:content:section-a:/)
    expect(lessonQuizFeedbackId('lesson-1', 'q3')).toBe('lesson-1:quiz:q3')
  })

  it('compiles selected text, presets, and notes', function() {
    const text = compileLessonFeedbackText({
      selectedText: 'The Dubliners formed in 1962.',
      presets: ['factually_wrong', 'should_be_linked'],
      notes: 'Link to a recording instead.',
    })
    expect(text).toMatch(/Selected:/)
    expect(text).toMatch(/Factually wrong/)
    expect(text).toMatch(/Should be linked/)
    expect(text).toMatch(/Link to a recording/)
  })

  it('locates source offsets and formats position', function() {
    const source = 'Walk into a pub in Ennis. The session starts at nine.'
    const located = locateTextInSource(source, 'session', 20)
    expect(located.sourceStart).toBe(source.indexOf('session'))
    expect(located.sourceEnd).toBe(located.sourceStart + 'session'.length)
    expect(located.sourceExcerpt).toMatch(/session/)

    const lesson = {
      path: '10-regions/celtic/ireland/01-overview.md',
      sections: [{
        id: 'overview',
        blocks: [{ type: 'markdown', text: source }],
      }],
    }
    const blockText = resolveBlockSourceFromLesson(lesson, 'overview', 0, 'markdown', 0)
    expect(blockText).toBe(source)

    const positionLine = formatLessonFeedbackPosition({
      lessonPath: lesson.path,
      sectionId: 'overview',
      blockIndex: 0,
      blockType: 'markdown',
      sourceStart: located.sourceStart,
      sourceEnd: located.sourceEnd,
    })
    expect(positionLine).toMatch(/01-overview\.md/)
    expect(positionLine).toMatch(/§ overview/)
    expect(positionLine).toMatch(/\[/)
  })
})

describe('lessonFeedbackStore', function() {
  beforeEach(function() {
    localStorage.removeItem(LESSON_FEEDBACK_STORAGE_KEY)
  })

  it('autosaves lesson content feedback', function() {
    const itemId = lessonContentFeedbackId('regions-celtic-ireland-01-overview', 'overview', 'Sean-nós')
    upsertLessonFeedback({
      itemId: itemId,
      lessonId: 'regions-celtic-ireland-01-overview',
      type: 'lesson_content',
      title: 'Overview',
      selectedText: 'Sean-nós',
      position: {
        lessonPath: '10-regions/celtic/ireland/01-overview.md',
        sectionId: 'overview',
        blockIndex: 0,
        blockType: 'markdown',
        sourceStart: 12,
        sourceEnd: 20,
      },
      presets: ['bad_phrasing'],
      notes: 'Too vague.',
    })
    const entry = getLessonFeedbackEntry(itemId)
    expect(entry.notes).toBe('Too vague.')
    expect(entry.presets).toEqual(['bad_phrasing'])
    expect(entry.feedback).toMatch(/Bad phrasing/)
    expect(entry.position.sectionId).toBe('overview')
    expect(entry.position.sourceStart).toBe(12)
  })

  it('autosaves quiz feedback keyed by question', function() {
    const itemId = lessonQuizFeedbackId('lesson-1', 'q2')
    upsertLessonFeedback({
      itemId: itemId,
      lessonId: 'lesson-1',
      type: 'lesson_quiz',
      title: 'Quiz',
      questionId: 'q2',
      questionPrompt: 'Which instrument leads a session?',
      presets: ['not_useful'],
      notes: 'Distractors are too obvious.',
    })
    expect(getAllLessonFeedback()).toHaveLength(1)
    expect(getLessonFeedbackEntry(itemId).questionPrompt).toMatch(/instrument/)
  })

  it('clears all lesson feedback', function() {
    upsertLessonFeedback({
      itemId: 'lesson-1:content:general:abc',
      lessonId: 'lesson-1',
      type: 'lesson_content',
      title: 'Lesson',
      selectedText: 'Test',
      notes: 'One',
    })
    clearAllLessonFeedback()
    expect(getAllLessonFeedback()).toHaveLength(0)
  })
})
