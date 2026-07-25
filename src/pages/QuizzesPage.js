import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Form } from 'react-bootstrap'
import { useDocumentTitle } from '../pageTitle'
import LessonQuizPlayer from '../components/LessonQuizPlayer'
import LessonFeedbackHost from '../components/LessonFeedbackHost'
import StudyNavRail from '../components/StudyNavRail'
import { loadLessonById } from '../lessonSearch'
import {
  loadQuizzesIndex,
  flattenQuizzesIndex,
  searchQuizzes,
  groupQuizzesByUnit,
  summarizeQuizActivity,
} from '../lessonQuizCatalog'
import './QuizzesPage.css'

function QuizRow(props) {
  const row = props.row
  const active = props.active
  const pct = row.questionCount
    ? Math.round(((row.bestCorrect || 0) / row.questionCount) * 100)
    : 0
  return (
    <Link
      to={'/quizzes/' + row.id}
      className={'quizzes-row' + (active ? ' quizzes-row--active' : '')}
      data-testid={'quiz-row-' + row.id}
    >
      <span className="quizzes-row-title">{row.title}</span>
      <span className="quizzes-row-meta">
        {row.questionCount} questions
        {row.attempted ? (
          <> · best {row.bestCorrect || 0}/{row.questionCount} ({pct}%)</>
        ) : (
          <> · not started</>
        )}
      </span>
    </Link>
  )
}

export default function QuizzesPage(props) {
  const params = useParams()
  const navigate = useNavigate()
  const lessonId = params.lessonId
  const [index, setIndex] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [query, setQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [expandedUnits, setExpandedUnits] = useState({})
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [progressTick, setProgressTick] = useState(0)

  useDocumentTitle(lesson && lesson.title ? lesson.title + ' quiz' : 'Quizzes')

  useEffect(function() {
    let cancelled = false
    setLoading(true)
    loadQuizzesIndex()
      .then(function(data) {
        if (!cancelled) {
          setIndex(data)
          setLoading(false)
        }
      })
      .catch(function(err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load quizzes')
          setLoading(false)
        }
      })
    return function() { cancelled = true }
  }, [])

  useEffect(function() {
    if (!lessonId) {
      setLesson(null)
      return
    }
    let cancelled = false
    loadLessonById(lessonId)
      .then(function(data) {
        if (!cancelled) setLesson(data)
      })
      .catch(function(err) {
        if (!cancelled) setError(err.message || 'Quiz not found')
      })
    return function() { cancelled = true }
  }, [lessonId])

  const flat = flattenQuizzesIndex(index)
  const filtered = query ? searchQuizzes(flat, query, 50) : flat
  const summary = summarizeQuizActivity(flat)
  const groups = groupQuizzesByUnit(filtered)

  useEffect(function() {
    if (!index || lessonId || loading) return
    if (flat.length) navigate('/quizzes/' + flat[0].id, { replace: true })
  }, [index, lessonId, loading, navigate, flat.length])

  function toggleUnit(unitId) {
    setExpandedUnits(function(prev) {
      const next = Object.assign({}, prev)
      next[unitId] = !(prev[unitId] ?? true)
      return next
    })
  }

  function handleQuizComplete() {
    setProgressTick(function(n) { return n + 1 })
  }

  if (loading) return <div className="quizzes-page"><p>Loading quizzes…</p></div>
  if (error) return <div className="quizzes-page"><p className="text-danger">{error}</p></div>

  return (
    <div className="quizzes-page" data-testid="quizzes-page" key={'tick-' + progressTick}>
      <StudyNavRail active="quizzes" tunebook={props.tunebook} />
      <header className="quizzes-hero">
        <div className="quizzes-hero-top">
          <h1>Quizzes</h1>
        </div>
        <Form.Control
          type="search"
          className="quizzes-search"
          placeholder="Search quizzes by lesson, unit, or topic…"
          value={query}
          onChange={function(e) { setQuery(e.target.value) }}
          data-testid="quizzes-search"
        />
      </header>

      <section className="quizzes-dashboard" data-testid="quizzes-dashboard">
        <div className="quizzes-stat">
          <span className="quizzes-stat-value">{summary.quizCount}</span>
          <span className="quizzes-stat-label">Quizzes</span>
        </div>
        <div className="quizzes-stat">
          <span className="quizzes-stat-value">{summary.attempted}/{summary.quizCount}</span>
          <span className="quizzes-stat-label">Attempted</span>
        </div>
        <div className="quizzes-stat">
          <span className="quizzes-stat-value">{summary.overallPct}%</span>
          <span className="quizzes-stat-label">Best score</span>
        </div>
        {summary.interests.length ? (
          <div className="quizzes-interests">
            <h2>Areas covered</h2>
            <ul>
              {summary.interests.slice(0, 4).map(function(unit) {
                return (
                  <li key={unit.label}>
                    <strong>{unit.label}</strong> — {unit.count} quiz{unit.count === 1 ? '' : 'zes'}
                    {unit.total ? <> · {unit.pct}% best</> : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </section>

      <div className={'quizzes-layout' + (sidebarCollapsed ? ' quizzes-layout--collapsed' : '')}>
        <aside className="quizzes-sidebar">
          <button
            type="button"
            className="quizzes-sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand quiz index' : 'Collapse quiz index'}
            onClick={function() { setSidebarCollapsed(!sidebarCollapsed) }}
          >
            {sidebarCollapsed ? '›' : '‹'}
          </button>
          {!sidebarCollapsed ? (
            <nav className="quizzes-index" data-testid="quizzes-index">
              {groups.map(function(group) {
                const open = expandedUnits[group.id] ?? true
                return (
                  <div key={group.id} className="quizzes-index-unit">
                    <button
                      type="button"
                      className="quizzes-index-unit-toggle"
                      onClick={function() { toggleUnit(group.id) }}
                      aria-expanded={open}
                    >
                      {open ? '▾' : '▸'} {group.label}
                    </button>
                    {open ? (
                      <div className="quizzes-index-lessons">
                        {attachRowsProgress(group.quizzes, summary.rows).map(function(row) {
                          return <QuizRow key={row.id} row={row} active={row.id === lessonId} />
                        })}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </nav>
          ) : null}
        </aside>

        <main className="quizzes-main">
          {lesson ? (
            <>
              <header className="quizzes-lesson-header">
                <h2>{lesson.title}</h2>
                <Link to={'/lessons/' + lesson.id} className="quizzes-lesson-link">
                  Open lesson →
                </Link>
              </header>
              <LessonFeedbackHost lesson={lesson} user={props.user}>
                {function(feedback) {
                  return (
                    <LessonQuizPlayer
                      lesson={lesson}
                      autoStart
                      onComplete={handleQuizComplete}
                      onQuizFeedback={feedback.enabled ? feedback.openQuizFeedback : null}
                    />
                  )
                }}
              </LessonFeedbackHost>
            </>
          ) : (
            <p className="text-muted">Select a quiz from the index.</p>
          )}
        </main>
      </div>
    </div>
  )
}

function attachRowsProgress(rows, summaryRows) {
  const byId = {}
  ;(summaryRows || []).forEach(function(row) {
    byId[row.id] = row
  })
  return (rows || []).map(function(row) {
    return byId[row.id] ? byId[row.id] : row
  })
}
