import { useCallback, useEffect, useMemo, useState } from 'react'
import LessonContent from '@app/components/LessonContent'
import LessonFeedbackHost from '@app/components/LessonFeedbackHost'
import {
  findManifestLesson,
  loadLessonById,
  loadLessonManifest,
} from '@app/lessonSearch'
import LessonPreviewIndex from './LessonPreviewIndex'
import LessonPreviewMediaPanel from './LessonPreviewMediaPanel'
import { createPreviewTunebook } from './previewTunebook'
import {
  isLessonContentComplete,
  setLessonContentComplete,
} from './lessonPreviewCompleteStore'

function getLessonIdFromHash() {
  const hash = window.location.hash || ''
  const match = hash.match(/^#\/lesson\/(.+)$/)
  return match ? decodeURIComponent(match[1]) : ''
}

function setLessonHash(lessonId) {
  const next = lessonId ? '#/lesson/' + encodeURIComponent(lessonId) : ''
  if (window.location.hash !== next) {
    window.location.hash = next
  }
}

export default function LessonPreviewApp() {
  const [lessonId, setLessonId] = useState(getLessonIdFromHash)
  const [manifest, setManifest] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [loading, setLoading] = useState(true)
  const [lessonLoading, setLessonLoading] = useState(false)
  const [error, setError] = useState(null)
  const [nowPlayingQueue, setNowPlayingQueue] = useState(null)
  const [showCompleteLessons, setShowCompleteLessons] = useState(true)
  const [completeRevision, setCompleteRevision] = useState(0)

  const tunebook = useMemo(function() {
    return createPreviewTunebook(setNowPlayingQueue)
  }, [])

  const navigate = useCallback(function() {}, [])

  useEffect(function() {
    function onHashChange() {
      setLessonId(getLessonIdFromHash())
    }
    window.addEventListener('hashchange', onHashChange)
    return function() {
      window.removeEventListener('hashchange', onHashChange)
    }
  }, [])

  useEffect(function() {
    let cancelled = false
    setLoading(true)
    setError(null)
    loadLessonManifest()
      .then(function(data) {
        if (cancelled) return
        setManifest(data)
        setLoading(false)
        if (!getLessonIdFromHash() && data && data.tracks) {
          let firstId = ''
          for (let ti = 0; ti < (data.tracks || []).length && !firstId; ti += 1) {
            const track = data.tracks[ti]
            for (let ui = 0; ui < (track.units || []).length && !firstId; ui += 1) {
              const lessons = track.units[ui].lessons || []
              if (lessons[0] && lessons[0].id) firstId = lessons[0].id
            }
            if (!firstId && track.lessons && track.lessons[0]) {
              firstId = track.lessons[0].id
            }
          }
          if (firstId) setLessonHash(firstId)
        }
      })
      .catch(function(err) {
        if (cancelled) return
        setError(err && err.message ? err.message : 'Failed to load manifest')
        setLoading(false)
      })
    return function() { cancelled = true }
  }, [])

  useEffect(function() {
    if (!lessonId || !manifest) {
      setLesson(null)
      return undefined
    }
    let cancelled = false
    setLessonLoading(true)
    setError(null)
    const manifestEntry = findManifestLesson(manifest, lessonId)
    loadLessonById(lessonId, {
      manifestEntry: manifestEntry || undefined,
      region: manifestEntry && manifestEntry.region,
    })
      .then(function(data) {
        if (cancelled) return
        setLesson(data)
        setLessonLoading(false)
        setNowPlayingQueue(null)
      })
      .catch(function(err) {
        if (cancelled) return
        setError(err && err.message ? err.message : 'Failed to load lesson')
        setLesson(null)
        setLessonLoading(false)
      })
    return function() { cancelled = true }
  }, [lessonId, manifest])

  function handleSelectLesson(id) {
    setLessonHash(id)
    setLessonId(id)
  }

  const contentComplete = lesson && lesson.id ? isLessonContentComplete(lesson.id) : false

  function handleContentCompleteChange(e) {
    if (!lesson || !lesson.id) return
    setLessonContentComplete(lesson.id, !!e.target.checked)
    setCompleteRevision(function(n) { return n + 1 })
  }

  return (
    <div className="lesson-preview-page">
      <LessonFeedbackHost lesson={lesson} forceEnabled inlineToolbar>
        {function(feedback) {
          return (
            <>
              <header className="lesson-preview-header">
                <div className="lesson-preview-header-main">
                  <h1 className="lesson-preview-brand">Lesson Preview</h1>
                  {lesson && lesson.title ? (
                    <p className="lesson-preview-lesson-heading">{lesson.title}</p>
                  ) : null}
                </div>
                <div className="lesson-preview-header-feedback" data-testid="lesson-preview-feedback-toolbar">
                  {feedback.toolbar}
                </div>
              </header>

              <div className="lesson-preview-layout">
                <aside className="lesson-preview-sidebar">
                  {loading ? <p className="text-muted small">Loading index…</p> : null}
                  {error && !lesson ? <p className="text-danger small">{error}</p> : null}
                  <LessonPreviewIndex
                    manifest={manifest}
                    lessonId={lessonId}
                    onSelect={handleSelectLesson}
                    showComplete={showCompleteLessons}
                    completeRevision={completeRevision}
                    onToggleShowComplete={function() {
                      setShowCompleteLessons(function(v) { return !v })
                    }}
                  />
                </aside>

                <main className="lesson-preview-main">
                  {lessonLoading ? <p>Loading lesson…</p> : null}
                  {error && lessonId && !lesson && !lessonLoading ? (
                    <p className="text-danger">{error}</p>
                  ) : null}
                  {lesson ? (
                    <>
                      <label className="lesson-preview-complete-checkbox" data-testid="lesson-preview-content-complete">
                        <input
                          type="checkbox"
                          checked={contentComplete}
                          onChange={handleContentCompleteChange}
                        />
                        Content complete
                      </label>
                      <LessonContent
                      key={'lesson-preview-' + lesson.id}
                      lesson={lesson}
                      tunebook={tunebook}
                      navigate={navigate}
                      mediaController={null}
                      onQuizFeedback={feedback.enabled ? feedback.openQuizFeedback : null}
                    />
                    </>
                  ) : null}
                </main>

                <LessonPreviewMediaPanel
                  nowPlayingQueue={nowPlayingQueue}
                  setNowPlayingQueue={setNowPlayingQueue}
                />
              </div>
            </>
          )
        }}
      </LessonFeedbackHost>
    </div>
  )
}
