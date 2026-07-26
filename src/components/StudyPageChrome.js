import StudyNavInline from './StudyNavInline'
import './StudyPageChrome.css'

export default function StudyPageChrome(props) {
  return (
    <div className="study-page-chrome" data-testid="study-page-chrome">
      {props.start ? (
        <div className="study-page-chrome__start">{props.start}</div>
      ) : null}
      <div className="study-page-chrome__actions" data-testid="study-page-chrome-actions">
        <StudyNavInline active={props.active} tunebook={props.tunebook} />
        {props.end}
      </div>
    </div>
  )
}
