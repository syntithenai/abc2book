import {
  clearAllLessonFeedback,
  downloadLessonFeedbackJson,
  getAllLessonFeedback,
} from '../lessonFeedbackStore'
import { icons } from '../Icons'
import './LessonFeedback.css'

export default function LessonFeedbackToolbar(props) {
  const count = typeof props.count === 'number' ? props.count : getAllLessonFeedback().length
  const selectionDraft = props.selectionDraft
  const hasSelection = !!(selectionDraft && selectionDraft.itemId)
  if (!props.show || (!count && !hasSelection)) return null

  function handleClear() {
    if (!count) return
    if (!window.confirm('Clear all saved lesson feedback? This cannot be undone.')) return
    clearAllLessonFeedback()
    if (typeof props.onChanged === 'function') props.onChanged()
  }

  return (
    <div className="lesson-feedback-toolbar" data-testid="lesson-feedback-toolbar">
      {hasSelection ? (
        <button
          type="button"
          className="lesson-feedback-suggest btn btn-primary"
          data-testid="lesson-selection-feedback-btn"
          onClick={function() {
            if (typeof props.onSuggest === 'function') props.onSuggest()
          }}
        >
          Suggest Feedback
        </button>
      ) : null}
      <button
        type="button"
        className="lesson-feedback-download"
        data-testid="lesson-feedback-download"
        title="Download feedback JSON"
        aria-label="Download feedback JSON"
        disabled={!count}
        onClick={function() { downloadLessonFeedbackJson('lesson-feedback.json') }}
      >
        <span className="lesson-feedback-download-icon" aria-hidden="true">{icons.save}</span>
      </button>
      {count ? (
        <button
          type="button"
          className="lesson-feedback-clear"
          data-testid="lesson-feedback-clear"
          title="Clear all feedback"
          aria-label="Clear all feedback"
          onClick={handleClear}
        >
          ×
        </button>
      ) : null}
    </div>
  )
}
