import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLessonIndexSections, findLessonManifestLocation } from '../lessonIndexSections'

function scrollIndexItemToTop(container, el) {
  if (!container || !el) return
  const containerTop = container.getBoundingClientRect().top
  const elTop = el.getBoundingClientRect().top
  container.scrollTop += elTop - containerTop
}

export default function LessonsIndex(props) {
  const manifest = props.manifest
  const currentId = props.lessonId
  const lesson = props.lesson
  const activeSectionId = props.activeSectionId
  const indexRef = useRef(null)
  const [openUnitId, setOpenUnitId] = useState(null)
  const [openLessonId, setOpenLessonId] = useState(null)

  useEffect(function() {
    if (!manifest || !currentId) return
    const location = findLessonManifestLocation(manifest, currentId)
    if (!location) return
    setOpenUnitId(location.unitId)
    setOpenLessonId(currentId)
  }, [manifest, currentId])

  if (!manifest || !manifest.tracks) return null

  function toggleUnit(unitId, el) {
    const location = findLessonManifestLocation(manifest, currentId)
    const isCurrentUnit = location && location.unitId === unitId
    setOpenUnitId(function(current) {
      if (current === unitId) {
        if (isCurrentUnit) {
          if (el) scrollIndexItemToTop(indexRef.current, el)
          return current
        }
        return null
      }
      if (el) scrollIndexItemToTop(indexRef.current, el)
      return unitId
    })
  }

  function toggleLesson(lessonId, el) {
    if (lessonId !== currentId) {
      handleLessonClick(lessonId, el)
      return
    }
    setOpenLessonId(function(current) {
      const next = current === lessonId ? null : lessonId
      if (next && el) scrollIndexItemToTop(indexRef.current, el)
      return next
    })
  }

  function handleLessonClick(lessonId, el) {
    setOpenLessonId(lessonId)
    const location = findLessonManifestLocation(manifest, lessonId)
    if (location) setOpenUnitId(location.unitId)
    if (el) scrollIndexItemToTop(indexRef.current, el)
    if (typeof props.onLessonNavigate === 'function') props.onLessonNavigate(lessonId)
  }

  function handleSectionClick(sectionId, e) {
    e.preventDefault()
    const row = e.currentTarget.closest('li')
    scrollIndexItemToTop(indexRef.current, row)
    if (typeof props.onSectionNavigate === 'function') props.onSectionNavigate(sectionId)
  }

  const currentSections = lesson && lesson.id === currentId ? getLessonIndexSections(lesson) : []

  return (
    <nav className="lessons-index" ref={indexRef} aria-label="Lessons">
      {manifest.tracks.map(function(track) {
        return (
          <div key={track.id} className="lessons-index-track">
            <h2 className="lessons-index-track-title">{track.label}</h2>
            {(track.units || []).map(function(unit) {
              const isUnitOpen = openUnitId === unit.id
              return (
                <div key={unit.id} className="lessons-index-unit">
                  <button
                    type="button"
                    className="lessons-index-unit-toggle"
                    aria-expanded={isUnitOpen}
                    onClick={function(e) {
                      toggleUnit(unit.id, e.currentTarget.closest('.lessons-index-unit'))
                    }}
                  >
                    <span className="lessons-index-chevron" aria-hidden="true">{isUnitOpen ? '▾' : '▸'}</span>
                    {unit.label}
                  </button>
                  {isUnitOpen ? (
                    <ul className="lessons-index-lessons">
                      {(unit.lessons || []).map(function(lessonItem) {
                        const isCurrent = lessonItem.id === currentId
                        const isLessonOpen = openLessonId === lessonItem.id
                        const sections = isLessonOpen && isCurrent ? currentSections : []
                        return (
                          <li key={lessonItem.id} className={'lessons-index-lesson' + (isCurrent ? ' lessons-index-lesson--current' : '')}>
                            <div className="lessons-index-lesson-row">
                              <button
                                type="button"
                                className="lessons-index-lesson-expand"
                                aria-expanded={isLessonOpen}
                                aria-label={isLessonOpen ? 'Collapse headings' : 'Expand headings'}
                                onClick={function(e) {
                                  toggleLesson(lessonItem.id, e.currentTarget.closest('li'))
                                }}
                              >
                                {isLessonOpen ? '▾' : '▸'}
                              </button>
                              <Link
                                to={'/lessons/' + lessonItem.id}
                                className={isCurrent ? 'active' : ''}
                                onClick={function(e) {
                                  handleLessonClick(lessonItem.id, e.currentTarget.closest('li'))
                                }}
                              >
                                {lessonItem.title}
                              </Link>
                            </div>
                            {isLessonOpen && sections.length ? (
                              <ul className="lessons-index-sections">
                                {sections.map(function(section) {
                                  const isActive = activeSectionId === section.id
                                  return (
                                    <li
                                      key={section.id}
                                      className={'lessons-index-section' + (isActive ? ' lessons-index-section--active' : '')}
                                    >
                                      <a
                                        href={'#' + section.id}
                                        onClick={function(e) { handleSectionClick(section.id, e) }}
                                      >
                                        {section.title}
                                      </a>
                                    </li>
                                  )
                                })}
                              </ul>
                            ) : null}
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </div>
              )
            })}
          </div>
        )
      })}
    </nav>
  )
}
