import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getLessonIndexSections, findLessonManifestLocation } from '../lessonIndexSections'

function scrollIndexItemToTop(container, el) {
  if (!container || !el) return
  const containerTop = container.getBoundingClientRect().top
  const elTop = el.getBoundingClientRect().top
  container.scrollTop += elTop - containerTop
}

function scrollIndexItemAfterRender(container, el) {
  if (!container || !el) return
  requestAnimationFrame(function() {
    scrollIndexItemToTop(container, el)
  })
}

export default function LessonsIndex(props) {
  const manifest = props.manifest
  const currentId = props.lessonId
  const lesson = props.lesson
  const activeSectionId = props.activeSectionId
  const indexRef = useRef(null)
  const scrollTargetRef = useRef(null)
  const [openUnitId, setOpenUnitId] = useState(null)
  const [openLessonId, setOpenLessonId] = useState(null)

  useEffect(function() {
    if (!manifest || !currentId) return
    const location = findLessonManifestLocation(manifest, currentId)
    if (!location) return
    setOpenUnitId(location.unitId)
    setOpenLessonId(currentId)
  }, [manifest, currentId])

  useEffect(function() {
    const el = scrollTargetRef.current
    if (!el || !indexRef.current) return
    scrollTargetRef.current = null
    scrollIndexItemAfterRender(indexRef.current, el)
  }, [openUnitId, openLessonId])

  function queueScroll(el) {
    scrollTargetRef.current = el
  }

  if (!manifest || !manifest.tracks) return null

  function toggleUnit(unitId, el) {
    const location = findLessonManifestLocation(manifest, currentId)
    const isCurrentUnit = location && location.unitId === unitId
    setOpenUnitId(function(current) {
      if (current === unitId) {
        if (isCurrentUnit) {
          scrollIndexItemAfterRender(indexRef.current, el)
          return current
        }
        return null
      }
      queueScroll(el)
      return unitId
    })
  }

  function handleLessonClick(lessonId, el) {
    setOpenLessonId(lessonId)
    const location = findLessonManifestLocation(manifest, lessonId)
    if (location) setOpenUnitId(location.unitId)
    if (el) queueScroll(el)
    if (typeof props.onLessonNavigate === 'function') props.onLessonNavigate(lessonId)
  }

  function handleLessonExpand(lessonId, el) {
    handleLessonClick(lessonId, el)
  }

  function handleSectionClick(sectionId, e) {
    e.preventDefault()
    const row = e.currentTarget.closest('li')
    scrollIndexItemAfterRender(indexRef.current, row)
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
                        const isLessonExpanded = isCurrent && openLessonId === lessonItem.id
                        const sections = isLessonExpanded ? currentSections : []
                        return (
                          <li key={lessonItem.id} className={'lessons-index-lesson' + (isCurrent ? ' lessons-index-lesson--current' : '')}>
                            <div className="lessons-index-lesson-row">
                              <button
                                type="button"
                                className="lessons-index-lesson-expand"
                                aria-expanded={isLessonExpanded}
                                aria-label={isLessonExpanded ? 'Collapse headings' : 'Expand headings'}
                                onClick={function(e) {
                                  e.preventDefault()
                                  handleLessonExpand(lessonItem.id, e.currentTarget.closest('li'))
                                }}
                              >
                                {isLessonExpanded ? '▾' : '▸'}
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
                            {isLessonExpanded && sections.length ? (
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
