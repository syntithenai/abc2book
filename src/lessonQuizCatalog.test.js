import { summarizeQuizActivity } from './lessonQuizCatalog'
import { saveLessonQuizResult } from './lessonQuizProgressStore'

const QUIZ_ROWS = [
  { id: 'quiz-a', title: 'Quiz A', questionCount: 16, unitLabel: 'Unit 1' },
  { id: 'quiz-b', title: 'Quiz B', questionCount: 10, unitLabel: 'Unit 1' },
  { id: 'quiz-c', title: 'Quiz C', questionCount: 8, unitLabel: 'Unit 2' },
]

describe('lessonQuizCatalog', function() {
  beforeEach(function() {
    localStorage.clear()
  })

  test('overallPct is best score among attempted quizzes, not diluted by catalog size', function() {
    saveLessonQuizResult('quiz-a', { correctCount: 16, total: 16, completed: true })

    const summary = summarizeQuizActivity(QUIZ_ROWS)

    expect(summary.attempted).toBe(1)
    expect(summary.overallPct).toBe(100)
  })

  test('overallPct uses the highest percentage when multiple quizzes were attempted', function() {
    saveLessonQuizResult('quiz-a', { correctCount: 8, total: 16, completed: true })
    saveLessonQuizResult('quiz-b', { correctCount: 10, total: 10, completed: true })

    const summary = summarizeQuizActivity(QUIZ_ROWS)

    expect(summary.attempted).toBe(2)
    expect(summary.overallPct).toBe(100)
  })

  test('overallPct is zero when no quizzes were attempted', function() {
    const summary = summarizeQuizActivity(QUIZ_ROWS)

    expect(summary.attempted).toBe(0)
    expect(summary.overallPct).toBe(0)
  })
})
