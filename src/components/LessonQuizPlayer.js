import { useEffect, useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import { lessonQuizBundleFromLesson } from '../lessonQuizParse'
import { saveLessonQuizResult } from '../lessonQuizProgressStore'
import './LessonQuizPlayer.css'

export default function LessonQuizPlayer(props) {
  const lesson = props.lesson
  const [quizStep, setQuizStep] = useState(0)
  const [choiceId, setChoiceId] = useState(null)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(false)
  const [started, setStarted] = useState(!!props.autoStart)

  const bundle = useMemo(function() {
    return lesson ? lessonQuizBundleFromLesson(lesson, { shuffle: true }) : null
  }, [lesson && lesson.id])
  const questions = bundle && bundle.questions ? bundle.questions : []
  const currentQ = questions[quizStep] || null

  useEffect(function() {
    setQuizStep(0)
    setChoiceId(null)
    setResults([])
    setSummary(false)
    setStarted(!!props.autoStart)
  }, [lesson && lesson.id, props.autoStart])

  if (!bundle || !questions.length) {
    return props.hideEmpty ? null : (
      <p className="lesson-quiz-empty text-muted">No quiz available for this lesson yet.</p>
    )
  }

  function handleChoice(choice) {
    if (!choice || choiceId || summary) return
    setChoiceId(choice.id)
    setResults(function(prev) {
      return prev.concat([{
        questionId: currentQ && currentQ.id,
        prompt: currentQ && currentQ.prompt,
        choiceId: choice.id,
        correct: !!choice.correct,
        explain: currentQ && currentQ.explain,
      }])
    })
  }

  function handleNext() {
    if (!choiceId) return
    if (quizStep + 1 < questions.length) {
      setQuizStep(quizStep + 1)
      setChoiceId(null)
      return
    }
    setSummary(true)
    const priorCorrect = results.filter(function(r) { return r.correct }).length
    const lastChoice = (currentQ.choices || []).find(function(c) { return c.id === choiceId })
    const finalCorrect = priorCorrect + (lastChoice && lastChoice.correct ? 1 : 0)
    const payload = {
      correctCount: finalCorrect,
      total: questions.length,
      results: results,
      completed: true,
    }
    if (lesson && lesson.id) saveLessonQuizResult(lesson.id, payload)
    if (typeof props.onComplete === 'function') props.onComplete(payload)
  }

  function handleRestart() {
    setQuizStep(0)
    setChoiceId(null)
    setResults([])
    setSummary(false)
    setStarted(true)
  }

  const correctCount = results.filter(function(r) { return r.correct }).length
  const misses = results.filter(function(r) { return !r.correct })
  const progressPct = summary ? 100 : Math.round((quizStep / questions.length) * 100)
  const selectedChoice = choiceId && currentQ
    ? (currentQ.choices || []).find(function(c) { return c.id === choiceId })
    : null
  const answeredCorrectly = !!(selectedChoice && selectedChoice.correct)

  if (!started && !props.autoStart) {
    return (
      <div className="lesson-quiz-player lesson-quiz-player--intro" data-testid="lesson-quiz-intro">
        <h2>Quiz</h2>
        <p>{questions.length} questions — one at a time, with explanations after each answer.</p>
        <Button variant="primary" data-testid="lesson-quiz-start" onClick={function() { setStarted(true) }}>
          Start quiz
        </Button>
      </div>
    )
  }

  return (
    <div className="lesson-quiz-player" data-testid="lesson-quiz-player">
      <div className="lesson-quiz-progress-bar" aria-hidden="true">
        <div className="lesson-quiz-progress-fill" style={{ width: progressPct + '%' }} />
      </div>

      {summary ? (
        <div className="lesson-quiz-summary" data-testid="lesson-quiz-summary">
          <h2>Quiz complete</h2>
          <p className="lesson-quiz-summary-score">
            You scored <strong>{correctCount}</strong> of <strong>{questions.length}</strong>
          </p>
          {misses.length ? (
            <div className="lesson-quiz-review">
              <h3>Review</h3>
              <ul>
                {misses.map(function(m) {
                  return (
                    <li key={m.questionId || m.prompt}>
                      <strong>{m.prompt}</strong>
                      {m.explain ? <p className="lesson-quiz-review-explain">{m.explain}</p> : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <p className="lesson-quiz-perfect">Excellent — every answer correct.</p>
          )}
          <div className="lesson-quiz-summary-actions">
            <Button variant="outline-primary" onClick={handleRestart}>Try again</Button>
            {props.onDone ? (
              <Button variant="primary" onClick={props.onDone}>Done</Button>
            ) : null}
          </div>
        </div>
      ) : currentQ ? (
        <>
          <div className="lesson-quiz-feedback-row">
            <p className="lesson-quiz-progress-label" data-testid="lesson-quiz-progress">
              Question {quizStep + 1} of {questions.length}
            </p>
            {props.onQuizFeedback ? (
              <button
                type="button"
                className="lesson-feedback-inline-btn"
                data-testid="lesson-quiz-feedback"
                data-no-lesson-feedback
                aria-label="Question feedback"
                title="Feedback"
                onClick={function() {
                  const choices = (currentQ.choices || []).map(function(c) {
                    return c.text
                  }).join(' / ')
                  props.onQuizFeedback({
                    questionId: currentQ.id,
                    questionPrompt: currentQ.prompt,
                    context: [
                      currentQ.prompt,
                      choices ? 'Choices: ' + choices : '',
                      currentQ.explain ? 'Explain: ' + currentQ.explain : '',
                    ].filter(Boolean).join('\n'),
                  })
                }}
              >
                ✎
              </button>
            ) : null}
          </div>
          <p className="lesson-quiz-prompt" data-testid="lesson-quiz-prompt">{currentQ.prompt}</p>
          <div className="lesson-quiz-choices">
            {(currentQ.choices || []).map(function(choice) {
              let variant = 'outline-secondary'
              if (choiceId) {
                if (choice.id === choiceId) variant = choice.correct ? 'success' : 'danger'
                else if (choice.correct) variant = 'success'
              }
              return (
                <Button
                  key={choice.id}
                  variant={variant}
                  className="lesson-quiz-choice"
                  data-testid={'lesson-quiz-choice-' + choice.id}
                  disabled={!!choiceId}
                  onClick={function() { handleChoice(choice) }}
                >
                  {choice.text}
                </Button>
              )
            })}
          </div>
          {choiceId ? (
            <div
              className={'lesson-quiz-verdict' + (answeredCorrectly ? ' lesson-quiz-verdict--correct' : ' lesson-quiz-verdict--incorrect')}
              data-testid="lesson-quiz-verdict"
              role="status"
            >
              {answeredCorrectly ? 'Correct!' : 'Not quite.'}
            </div>
          ) : null}
          {choiceId && currentQ.explain ? (
            <p className="lesson-quiz-explain" data-testid="lesson-quiz-explain">{currentQ.explain}</p>
          ) : null}
          {choiceId && !currentQ.explain ? (
            <p className="lesson-quiz-explain lesson-quiz-explain--missing text-muted">
              Refer back to the lesson text for more context on this answer.
            </p>
          ) : null}
          {choiceId ? (
            <Button
              variant="primary"
              className="lesson-quiz-next"
              data-testid="lesson-quiz-next"
              onClick={handleNext}
            >
              {quizStep + 1 < questions.length ? 'Next question' : 'See results'}
            </Button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
