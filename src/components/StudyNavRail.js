import { Link } from 'react-router-dom'
import './StudyNavRail.css'

function NavItem(props) {
  return (
    <Link
      to={props.to}
      className="study-nav-rail-item"
      title={props.label}
      aria-label={props.label}
      data-testid={props.testId}
    >
      <span className="study-nav-rail-icon" aria-hidden="true">{props.icon}</span>
      <span className="study-nav-rail-label">{props.label}</span>
    </Link>
  )
}

export default function StudyNavRail(props) {
  const active = props.active || 'feed'
  const icons = props.tunebook && props.tunebook.icons ? props.tunebook.icons : {}
  const bookIcon = icons.bookheader || icons.book
  const quizIcon = icons.question
  const feedIcon = icons.list

  return (
    <nav className="study-nav-rail" aria-label="Study navigation" data-testid="study-nav-rail">
      {active !== 'feed' ? (
        <NavItem
          to="/feed"
          label="Feed"
          icon={feedIcon}
          testId="study-nav-feed"
        />
      ) : null}
      {active !== 'lessons' ? (
        <NavItem
          to="/lessons"
          label="Lessons"
          icon={bookIcon}
          testId={active === 'feed' ? 'feed-lessons-link' : 'study-nav-lessons'}
        />
      ) : null}
      {active !== 'quizzes' ? (
        <NavItem
          to="/quizzes"
          label="Quizzes"
          icon={quizIcon}
          testId={active === 'feed' ? 'feed-quizzes-link' : 'study-nav-quizzes'}
        />
      ) : null}
    </nav>
  )
}
