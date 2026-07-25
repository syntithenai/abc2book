import { useEffect, useState, useRef, useMemo } from 'react'
import { Link, useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { Button, Form } from 'react-bootstrap'
import { useDocumentTitle } from '../pageTitle'
import LessonsIndex from '../components/LessonsIndex'
import LessonContent from '../components/LessonContent'
import LessonEntitiesModal from '../components/LessonEntitiesModal'
import LessonFeedbackHost from '../components/LessonFeedbackHost'
import StudyNavInline from '../components/StudyNavInline'
import {
  loadLessonManifest,
  loadLessonById,
  loadLessonSearchIndex,
  searchLessons,
  flattenManifestLessons,
  findManifestLesson,
} from '../lessonSearch'
import {
  normalizeHighlightTerm,
  resolveLessonHighlightQuery,
  scrollToLessonSearchHighlight,
  writeStoredLessonSearchHighlight,
  clearStoredLessonSearchHighlight,
} from '../lessonSearchHighlight'
import { bindLessonSectionScrollSpy, scrollToLessonSection } from '../lessonScrollSpy'
import { startLessonPlaylist } from '../lessonPlaylist'
import './LessonsPage.css'

export default function LessonsPage(props) {
  const params = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const lessonId = params.lessonId
  const lessonContentRef = useRef(null)
  const [manifest, setManifest] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [mobileIndexOpen, setMobileIndexOpen] = useState(false)
  const [showEntities, setShowEntities] = useState(false)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lessonLoading, setLessonLoading] = useState(false)
  const [pendingSearchHighlight, setPendingSearchHighlight] = useState(null)
  const [activeSectionId, setActiveSectionId] = useState(null)
  const highlightQuery = useMemo(function() {
    return resolveLessonHighlightQuery({
      lesson: lesson,
      lessonId: lessonId,
      pending: pendingSearchHighlight,
      location: location,
      searchParams: searchParams,
    })
  }, [lesson, lessonId, pendingSearchHighlight, location, searchParams])

  useDocumentTitle(lesson && lesson.title ? lesson.title : 'Lessons')

  function clearSearchHighlight() {
    setPendingSearchHighlight(null)
    clearStoredLessonSearchHighlight()
  }

  useEffect(function() {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadLessonManifest()
      .then(function(manifestData) {
        if (cancelled) return
        const flat = flattenManifestLessons(manifestData)
        if (!flat.length) {
          throw new Error('No lessons in manifest. Run: python3 scripts/lesson_plans/export_lessons.py --ireland-only')
        }
        setManifest(manifestData)
        setLoading(false)
      })
      .catch(function(err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load lessons')
          setLoading(false)
        }
      })
    return function() { cancelled = true }
  }, [])

  useEffect(function() {
    if (!lessonId) {
      setLesson(null)
      setLessonLoading(false)
      return
    }
    let cancelled = false
    setLessonLoading(true)
    const manifestEntry = findManifestLesson(manifest, lessonId)
    loadLessonById(lessonId, {
      manifestEntry: manifestEntry,
      region: manifestEntry && manifestEntry.region,
    })
      .then(function(data) {
        if (!cancelled) {
          setLesson(data)
          setLessonLoading(false)
        }
      })
      .catch(function(err) {
        if (!cancelled) {
          setError(err.message || 'Lesson not found')
          setLesson(null)
          setLessonLoading(false)
        }
      })
    return function() { cancelled = true }
  }, [lessonId, manifest])

  useEffect(function() {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearchError(null)
      setSearchLoading(false)
      return
    }
    let cancelled = false
    setSearchLoading(true)
    setSearchError(null)
    loadLessonSearchIndex()
      .then(function(index) {
        if (cancelled) return
        setResults(searchLessons(index, trimmed, 20))
        setSearchLoading(false)
      })
      .catch(function(err) {
        if (!cancelled) {
          setSearchError(err.message || 'Search unavailable')
          setResults([])
          setSearchLoading(false)
        }
      })
    return function() { cancelled = true }
  }, [query])

  useEffect(function() {
    if (!lesson || lessonLoading) {
      setActiveSectionId(null)
      return undefined
    }
    return bindLessonSectionScrollSpy(lessonContentRef.current, setActiveSectionId)
  }, [lesson, lessonLoading, lessonId, highlightQuery])

  useEffect(function() {
    setMobileIndexOpen(false)
  }, [lessonId])

  function handleSearchResultClick(row) {
    const term = normalizeHighlightTerm(query)
    setQuery('')
    setResults([])
    const payload = { lessonId: row.id, term: term }
    setPendingSearchHighlight(payload)
    writeStoredLessonSearchHighlight(row.id, term)
    navigate('/lessons/' + row.id, {
      state: { lessonSearchHighlight: term, lessonSearchHighlightLessonId: row.id },
    })
  }

  useEffect(function() {
    if (!lesson || lessonLoading || !highlightQuery) return undefined
    let cancelled = false
    let attempts = 0
    let retryTimer = null
    function tryScroll() {
      if (cancelled) return
      if (scrollToLessonSearchHighlight({ root: lessonContentRef.current })) return
      attempts += 1
      if (attempts < 25) {
        retryTimer = window.setTimeout(tryScroll, 80)
      }
    }
    retryTimer = window.setTimeout(tryScroll, 0)
    return function() {
      cancelled = true
      if (retryTimer) window.clearTimeout(retryTimer)
    }
  }, [lesson, lessonLoading, highlightQuery, lessonId])

  useEffect(function() {
    if (!manifest || lessonId || loading) return
    const flat = flattenManifestLessons(manifest)
    if (flat.length) navigate('/lessons/' + flat[0].id, { replace: true })
  }, [manifest, lessonId, loading, navigate])

  function handlePlayAll() {
    if (!lesson || !lesson.playlist || !lesson.playlist.length) return
    startLessonPlaylist(lesson, 0, {
      tunebook: props.tunebook,
      navigate: navigate,
      mediaController: props.mediaController,
    })
  }

  function handleSectionNavigate(sectionId) {
    scrollToLessonSection(sectionId)
    setMobileIndexOpen(false)
  }

  const hasPlaylist = !!(lesson && lesson.playlist && lesson.playlist.length)

  const searchPanel = (
    <div className="lessons-sidebar-search">
      <Form.Control
        type="search"
        className="lessons-search"
        placeholder="Search lessons…"
        value={query}
        onChange={function(e) { setQuery(e.target.value) }}
        data-testid="lessons-search"
      />
      {query && searchLoading ? (
        <p className="lessons-search-status" data-testid="lessons-search-loading">Searching…</p>
      ) : null}
      {query && searchError ? (
        <p className="text-danger lessons-search-status">{searchError}</p>
      ) : null}
      {query && !searchLoading && !searchError && results.length ? (
        <ul className="lessons-search-results" data-testid="lessons-search-results">
          {results.map(function(row) {
            return (
              <li key={row.id}>
                <Link
                  to={'/lessons/' + row.id}
                  onClick={function(e) {
                    e.preventDefault()
                    handleSearchResultClick(row)
                  }}
                >
                  <strong>{row.title}</strong>
                  <span className="lessons-search-snippet">{row.snippet}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )

  function renderTopChrome(feedbackToolbar) {
    return (
      <div className="lessons-top-chrome">
        <button
          type="button"
          className="lessons-index-toggle d-md-none"
          data-testid="lessons-index-toggle"
          aria-expanded={mobileIndexOpen}
          onClick={function() { setMobileIndexOpen(function(open) { return !open }) }}
        >
          Index
        </button>
        <div className="lessons-study-actions" data-testid="lessons-study-actions">
          <StudyNavInline active="lessons" tunebook={props.tunebook} />
          {feedbackToolbar ? (
            <div className="lessons-study-feedback" data-testid="lessons-study-bar-feedback">
              {feedbackToolbar}
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div className="lessons-page">
      {mobileIndexOpen ? (
        <button
          type="button"
          className="lessons-sidebar-backdrop"
          aria-label="Close lesson index"
          onClick={function() { setMobileIndexOpen(false) }}
        />
      ) : null}

      <LessonFeedbackHost lesson={lesson} user={props.user} inlineToolbar>
        {function(feedback) {
          return (
            <div className="lessons-layout">
        <aside className={'lessons-sidebar' + (mobileIndexOpen ? ' lessons-sidebar--open' : '')}>
          <div className="lessons-sidebar-sticky">
            <div className="lessons-sidebar-head">
              <h1 className="lessons-sidebar-title">Lessons</h1>
              <button
                type="button"
                className="lessons-sidebar-close d-md-none"
                aria-label="Close lesson index"
                onClick={function() { setMobileIndexOpen(false) }}
              >
                ×
              </button>
            </div>
            {searchPanel}
            <LessonsIndex
              manifest={manifest}
              lessonId={lessonId}
              lesson={lesson}
              activeSectionId={activeSectionId}
              onLessonNavigate={function() {
                clearSearchHighlight()
                setMobileIndexOpen(false)
              }}
              onSectionNavigate={handleSectionNavigate}
            />
          </div>
        </aside>

        <main className="lessons-main">
          {renderTopChrome(feedback.toolbar)}
          {loading ? <p>Loading lessons…</p> : null}
          {error ? <p className="text-danger lessons-error">{error}</p> : null}
          {!loading && !error && lessonId && lessonLoading ? <p>Loading lesson…</p> : null}
          {lesson ? (
            <>
              <div className="lessons-toolbar">
                {hasPlaylist ? (
                  <Button variant="success" size="sm" data-testid="lesson-play-all" onClick={handlePlayAll}>
                    {props.tunebook.icons.play} Play all
                  </Button>
                ) : null}
                <Button
                  variant="outline-secondary"
                  size="sm"
                  data-testid="lesson-entities-button"
                  onClick={function() { setShowEntities(true) }}
                >
                  Entities
                </Button>
                <h2 className="lessons-lesson-title">{lesson.title}</h2>
                {lesson.tier != null ? <span className="badge bg-secondary">Tier {lesson.tier}</span> : null}
              </div>
              <div ref={lessonContentRef}>
                <LessonContent
                  key={'lesson-content-' + lesson.id + '-' + highlightQuery}
                  lesson={lesson}
                  highlightQuery={highlightQuery}
                  tunebook={props.tunebook}
                  navigate={navigate}
                  mediaController={props.mediaController}
                  onQuizFeedback={feedback.enabled ? feedback.openQuizFeedback : null}
                />
              </div>
              <LessonEntitiesModal
                show={showEntities}
                onHide={function() { setShowEntities(false) }}
                lesson={lesson}
                tunebook={props.tunebook}
                navigate={navigate}
                mediaController={props.mediaController}
              />
            </>
          ) : null}
        </main>
            </div>
          )
        }}
      </LessonFeedbackHost>
    </div>
  )
}
