import { useSwipeable } from 'react-swipeable'
import { Link } from 'react-router-dom'
import { Button } from 'react-bootstrap'

export default function FeedCard(props) {
  const item = props.item || {}
  const expanded = !!props.expanded
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
    if (e && e.target && e.target.closest && e.target.closest('a, .feed-quiz-choice, [data-testid^="feed-quiz-choice"]')) return
    if (typeof props.onExpand === 'function') props.onExpand(item)
  }

  return (
    <article
      {...handlers}
      className={'feed-card' + (expanded ? ' feed-card-expanded' : '') + (item.isNew ? ' feed-card-new' : '')}
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
            <h2 className="feed-card-headline" data-testid="feed-card-headline">{item.headline}</h2>
            {item.isNew ? <span className="feed-new-badge" data-testid="feed-new-badge">New</span> : null}
          </div>
          {!expanded ? (
            <p className="feed-card-teaser" data-testid="feed-card-teaser">{item.teaser}</p>
          ) : null}
        </button>
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
      {item.source ? <div className="feed-card-source-chip">{item.source}{item.generation ? ' · ' + item.generation : ''}</div> : null}
      {expanded ? (
        <div className="feed-card-body" data-testid="feed-card-body">
          {item.body ? <div className="feed-card-body-text">{item.body}</div> : null}
          {item.tryThis ? <p className="feed-card-trythis"><strong>Try this:</strong> {item.tryThis}</p> : null}
          {item.quiz ? (
            <div className="feed-quiz" data-testid="feed-quiz">
              <p className="feed-quiz-prompt">{item.quiz.prompt}</p>
              <div className="feed-quiz-choices">
                {(item.quiz.choices || []).map(function(choice) {
                  return (
                    <Button
                      key={choice.id}
                      size="sm"
                      variant={props.answeredChoiceId === choice.id ? (choice.correct ? 'success' : 'danger') : 'outline-secondary'}
                      className="feed-quiz-choice"
                      data-testid={'feed-quiz-choice-' + choice.id}
                      disabled={!!props.answeredChoiceId}
                      onClick={function() { if (props.onAnswer) props.onAnswer(item, choice) }}
                    >
                      {choice.text}
                    </Button>
                  )
                })}
              </div>
              {props.answeredChoiceId && item.quiz.explain ? (
                <p className="feed-quiz-explain" data-testid="feed-quiz-explain">{item.quiz.explain}</p>
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
            {(item.type === 'singing_tip' || item.type === 'warmup_idea') ? (
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
