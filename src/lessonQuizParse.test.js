import { parseLessonQuizMarkdown, lessonQuizBundleFromLesson } from './lessonQuizParse'

const SAMPLE_QUIZ = `
### Q1. In a typical Irish session, which description best fits the music-making?

- A) Musicians play sets of tunes by ear, often led informally with unwritten etiquette
- B) A conductor assigns parts from full orchestral scores
- C) Only harp is permitted as melody instrument
- D) Tunes must be performed exactly as written in O'Neill's 1903 edition

**Answer:** A

### Q2. "Celtic music" and "Irish traditional music" are identical terms.

**Answer:** False — Celtic is a broader regional family; Irish trad is one tradition within it.
`

describe('lessonQuizParse', function() {
  test('parses MCQ and true/false questions', function() {
    const questions = parseLessonQuizMarkdown(SAMPLE_QUIZ)
    expect(questions.length).toBe(2)
    expect(questions[0].type).toBe('mcq')
    expect(questions[0].choices.length).toBe(4)
    expect(questions[0].choices[0].correct).toBe(true)
    expect(questions[1].type).toBe('truefalse')
    expect(questions[1].explain).toMatch(/Celtic/)
  })

  test('builds shuffled quiz bundle from lesson', function() {
    const lesson = {
      id: 'test-lesson',
      title: 'Test',
      quiz_questions: [
        {
          id: 'q1',
          prompt: 'Pick one',
          choices: [
            { id: 'a', text: 'Wrong', correct: false },
            { id: 'b', text: 'Right', correct: true },
            { id: 'c', text: 'Also wrong', correct: false },
          ],
          explain: 'Because right.',
        },
      ],
    }
    const bundle = lessonQuizBundleFromLesson(lesson, { shuffle: true })
    expect(bundle).not.toBeNull()
    expect(bundle.questions.length).toBe(1)
    const correctChoices = bundle.questions[0].choices.filter(function(c) { return c.correct })
    expect(correctChoices.length).toBe(1)
    expect(correctChoices[0].text).toBe('Right')
  })

  test('true/false choice ids stay stable when bundle is built once', function() {
    const lesson = {
      id: 'tf-lesson',
      title: 'TF',
      quiz_questions: [
        {
          id: 'q1',
          type: 'truefalse',
          prompt: 'Sessions are social.',
          choices: [
            { id: 'a', text: 'True', correct: true },
            { id: 'b', text: 'False', correct: false },
          ],
          explain: 'Yes.',
        },
      ],
    }
    const bundle = lessonQuizBundleFromLesson(lesson, { shuffle: true })
    const trueChoice = bundle.questions[0].choices.find(function(c) { return c.text === 'True' })
    const falseChoice = bundle.questions[0].choices.find(function(c) { return c.text === 'False' })
    expect(trueChoice.correct).toBe(true)
    expect(falseChoice.correct).toBe(false)
  })
})
