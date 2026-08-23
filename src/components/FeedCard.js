import { useEffect, useState } from 'react'
import { useSwipeable } from 'react-swipeable'
import { Link } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { buildQuizBundle } from '../feedQuizUtils'
import { isFeedFeedbackAdmin, getExampleDisplayCaption } from '../feedFeedbackUtils'
import AbcSnippetPreview from './AbcSnippetPreview'
import TheoryLessonNotation from './TheoryLessonNotation'
import FeedCardFeedbackModal from './FeedCardFeedbackModal'
import { feedCardTypeClass, feedCardTypeLabel } from '../feedCardStyle'
import { PRACTICE_MODE_ENABLED } from '../practiceModeEnabled'

export default function FeedCard(props) {
  const item = props.item || {}
  const expanded = !!props.expanded
  const tunes = props.tunes || {}
  const tunebook = props.tunebook
  const [quizStep, setQuizStep] = useState(0)
  const [choiceId, setChoiceId] = useState(null)
  const [results, setResults] = useState([])
  const [summary, setSummary] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const showFeedbackControls = isFeedFeedbackAdmin(props.user, props.resolverStatus)

  const quizBundle = item.quiz ? buildQuizBundle(item.quiz, { shuffle: false }) : null
  const questions = quizBundle && quizBundle.questions ? quizBundle.questions : []
  const currentQ = questions[quizStep] || null

  const tune = item.tuneId != null ? tunes[item.tuneId] : null
  const hasLyrics = !!(item.lyrics && String(item.lyrics).trim())
    || String(item.body || '').indexOf('## Lyrics') !== -1
  let notationAbc = ''
  if (expanded && item.showNotation && !hasLyrics && tune && tunebook && tunebook.abcTools && typeof tunebook.abcTools.json2abc === 'function') {
    try {
      notationAbc = tunebook.abcTools.json2abc(tune) || ''
    } catch (e) {
      notationAbc = ''
    }
  }

  useEffect(function() {
    setQuizStep(0)
    setChoiceId(null)
    setResults([])
    setSummary(false)
  }, [item.id])

  const handlers = useSwipeable({
    onSwipedLeft: function() {
      if (typeof props.onDismiss === 'function') props.onDismiss(item)
    },
    trackMouse: false,
    trackTouch: true,
    delta: 80,
  })

  function onExpandClick(e) {
    if (e && e.target && e.target.closest && e.target.closest('[data-testid="feed-card-dismiss"]')) return
    if (e && e.target && e.target.closest && e.target.closest('[data-testid="feed-card-feedback"]')) return
    if (e && e.target && e.target.closest && e.target.closest(
      'a, .feed-quiz-choice, [data-testid^="feed-quiz-choice"], [data-testid="feed-quiz-next"], [data-testid="feed-quiz-summary"]'
    )) return
    if (typeof props.onExpand === 'function') props.onExpand(item)
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
    if (typeof props.onQuizComplete === 'function') {
      const totalCorrect = results.filter(function(r) { return r.correct }).length
      props.onQuizComplete(item, {
        correctCount: totalCorrect,
        total: questions.length,
        results: results,
      })
    }
  }

  const misses = results.filter(function(r) { return !r.correct })
  const correctCount = results.filter(function(r) { return r.correct }).length
  const typeClass = feedCardTypeClass(item)
  const typeLabel = feedCardTypeLabel(item)
  const hasLessonExample = item.type === 'theory_lesson'
    && !!(item.exampleAbc || item.exampleImageUrl)
  const lessonImage = !!(item.exampleImageUrl && !item.exampleAbc)
  const lessonNotation = !!(item.exampleAbc && !item.exampleImageUrl)
  const exampleLabel = getExampleDisplayCaption(item)

  return (
    <article
      {...handlers}
      className={'feed-card ' + typeClass
        + (expanded ? ' feed-card-expanded' : '')
        + (item.isNew ? ' feed-card-new' : '')}
      data-testid="feed-card"
      data-feed-id={item.id}
      data-feed-type={item.type}
      data-feed-generation={item.generation || ''}
      data-feed-source={item.source || ''}
    >
      <div className="feed-card-header">
        <button
          type="button"
          className="feed-card-expand-btn"
          data-testid="feed-card-expand"
          onClick={onExpandClick}
        >
          <div className="feed-card-title-row">
            <span className="feed-card-type-badge" data-testid="feed-card-type-badge">{typeLabel}</span>
            <h2 className="feed-card-headline" data-testid="feed-card-headline">{item.headline}</h2>
            {item.isNew ? <span className="feed-new-badge" data-testid="feed-new-badge">New</span> : null}
          </div>
          {item.artist ? (
            <p className="feed-card-artist" data-testid="feed-card-artist">{item.artist}</p>
          ) : null}
          {!expanded ? (
            <p className="feed-card-teaser" data-testid="feed-card-teaser">{item.teaser}</p>
          ) : null}
          {!expanded && hasLessonExample && lessonImage ? (
            <div className="feed-card-example feed-card-example--collapsed" data-testid="feed-card-example">
              <img
                className="feed-card-example-image feed-card-example-image--thumb"
                src={item.exampleImageUrl}
                alt=""
                loading="lazy"
              />
              {exampleLabel ? (
                <p className="feed-card-example-label">
                  {exampleLabel}
                </p>
              ) : null}
            </div>
          ) : null}
          {!expanded && hasLessonExample && lessonNotation ? (
            <div
              className="feed-card-example feed-card-example--collapsed feed-card-example--notation-thumb"
              data-testid="feed-card-example-notation"
            >
              <TheoryLessonNotation abc={item.exampleAbc} compact measuresPerLine={2} />
              {exampleLabel ? (
                <p className="feed-card-example-label">
                  {exampleLabel}
                </p>
              ) : null}
            </div>
          ) : null}
        </button>
        {showFeedbackControls ? (
          <button
            type="button"
            className="feed-card-feedback"
            data-testid="feed-card-feedback"
            aria-label="Feedback"
            title="Feedback"
            onClick={function() { setShowFeedback(true) }}
          >
            ✎
          </button>
        ) : null}
        <button
          type="button"
          className="feed-card-dismiss"
          data-testid="feed-card-dismiss"
          aria-label="Dismiss"
          onClick={function() { if (props.onDismiss) props.onDismiss(item) }}
        >
          ×
        </button>
      </div>
      {showFeedbackControls ? (
        <FeedCardFeedbackModal
          show={showFeedback}
          item={item}
          feedbackSyncKey={props.feedbackSyncKey}
          onChanged={props.onFeedbackChange}
          onHide={function() { setShowFeedback(false) }}
        />
      ) : null}
      {item.source ? <div className="feed-card-source-chip">{item.source}{item.generation ? ' · ' + item.generation : ''}</div> : null}
      {expanded ? (
        <div className="feed-card-body" data-testid="feed-card-body">
          {hasLessonExample ? (
            <div className="feed-card-example feed-card-example--expanded" data-testid="feed-card-example-expanded">
              {item.exampleAbc ? (
                <TheoryLessonNotation abc={item.exampleAbc} />
              ) : item.exampleImageUrl ? (
                <img
                  className="feed-card-example-image feed-card-example-image--portrait"
                  src={item.exampleImageUrl}
                  alt=""
                  loading="lazy"
                />
              ) : null}
              {exampleLabel ? (
                <p className="feed-card-example-label">
                  {exampleLabel}
                </p>
              ) : null}
            </div>
          ) : null}
          {(function() {
            const images = Array.isArray(item.imageUrls) && item.imageUrls.length
              ? item.imageUrls
              : (item.imageUrl && !item.exampleImageUrl ? [item.imageUrl] : [])
            if (!images.length) return null
            return (
              <div className="feed-card-images" data-testid="feed-card-images">
                {images.map(function(src) {
                  return (
                    <img
                      key={src}
                      className="feed-card-image"
                      src={src}
                      alt=""
                      loading="lazy"
                      onError={function(e) { e.target.style.display = 'none' }}
                    />
                  )
                })}
              </div>
            )
          })()}
          {item.body ? <div className="feed-card-body-text" data-testid="feed-card-body-text">{item.body}</div> : null}
          {item.lyrics && String(item.body || '').indexOf('## Lyrics') === -1 ? (
            <div className="feed-card-lyrics" data-testid="feed-card-lyrics">
              <h3 className="feed-card-lyrics-heading">Lyrics</h3>
              <pre className="feed-card-lyrics-text">{item.lyrics}</pre>
            </div>
          ) : null}
          {!hasLyrics && notationAbc ? (
            <div className="feed-card-notation" data-testid="feed-card-notation">
              <AbcSnippetPreview abc={notationAbc} maxBars={16} />
            </div>
          ) : null}
          {item.tryThis ? <p className="feed-card-trythis"><strong>Try this:</strong> {item.tryThis}</p> : null}
          {quizBundle && questions.length ? (
            <div className="feed-quiz" data-testid="feed-quiz">
              {summary ? (
                <div className="feed-quiz-summary" data-testid="feed-quiz-summary">
                  <p className="feed-quiz-summary-score" data-testid="feed-quiz-summary-score">
                    You got {correctCount} of {questions.length}
                  </p>
                  {misses.length ? (
                    <ul className="feed-quiz-misses" data-testid="feed-quiz-misses">
                      {misses.map(function(m) {
                        return (
                          <li key={m.questionId || m.prompt}>
                            {m.prompt}
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="feed-quiz-perfect">Nice — all correct.</p>
                  )}
                </div>
              ) : currentQ ? (
                <>
                  <p className="feed-quiz-progress" data-testid="feed-quiz-progress">
                    Question {quizStep + 1} of {questions.length}
                  </p>
                  <p className="feed-quiz-prompt" data-testid="feed-quiz-prompt">{currentQ.prompt}</p>
                  <div className="feed-quiz-choices">
                    {(currentQ.choices || []).map(function(choice) {
                      var variant = 'outline-secondary'
                      if (choiceId) {
                        if (choice.id === choiceId) {
                          variant = choice.correct ? 'success' : 'danger'
                        } else if (choice.correct) {
                          variant = 'success'
                        }
                      }
                      return (
                        <Button
                          key={choice.id}
                          size="sm"
                          variant={variant}
                          className="feed-quiz-choice"
                          data-testid={'feed-quiz-choice-' + choice.id}
                          disabled={!!choiceId}
                          onClick={function() { handleChoice(choice) }}
                        >
                          {choice.text}
                        </Button>
                      )
                    })}
                  </div>
                  {choiceId && currentQ.explain ? (
                    <p className="feed-quiz-explain" data-testid="feed-quiz-explain">{currentQ.explain}</p>
                  ) : null}
                  {choiceId ? (
                    <Button
                      size="sm"
                      variant="primary"
                      className="feed-quiz-next"
                      data-testid="feed-quiz-next"
                      onClick={handleNext}
                    >
                      {quizStep + 1 < questions.length ? 'Next' : 'See results'}
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          <div className="feed-card-ctas">
            {item.tuneId ? (
              <Link
                className="btn btn-sm btn-primary"
                to={'/tunes/' + encodeURIComponent(item.tuneId)}
                data-testid="feed-cta-open-tune"
              >
                Open tune
              </Link>
            ) : null}
            {(item.type === 'singing_tip' || item.type === 'warmup_idea') && PRACTICE_MODE_ENABLED ? (
              <Link className="btn btn-sm btn-outline-primary" to="/practice" data-testid="feed-cta-practice">
                Start Practice
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  )
}
