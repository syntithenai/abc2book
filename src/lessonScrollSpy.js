const SECTION_SELECTOR = '.lesson-section[id], .lesson-key-points[id], .lesson-quiz[id]'

export function collectLessonSectionElements(root) {
  if (!root) return []
  return Array.prototype.slice.call(root.querySelectorAll(SECTION_SELECTOR))
}

export function pickActiveLessonSectionId(sectionEls, root) {
  if (!sectionEls.length) return null
  const rootRect = root && root.getBoundingClientRect ? root.getBoundingClientRect() : { top: 0 }
  const anchor = rootRect.top + 96
  let active = sectionEls[0]
  sectionEls.forEach(function(el) {
    const rect = el.getBoundingClientRect()
    if (rect.top <= anchor) active = el
  })
  return active && active.id ? active.id : null
}

export function scrollToLessonSection(sectionId) {
  const el = document.getElementById(sectionId)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

export function bindLessonSectionScrollSpy(root, onChange) {
  if (!root || typeof onChange !== 'function') return function() {}

  let sectionEls = collectLessonSectionElements(root)
  let frame = null

  function emitActive() {
    sectionEls = collectLessonSectionElements(root)
    const nextId = pickActiveLessonSectionId(sectionEls, root)
    onChange(nextId)
  }

  function schedule() {
    if (frame != null) return
    frame = window.requestAnimationFrame(function() {
      frame = null
      emitActive()
    })
  }

  const scrollTarget = window
  scrollTarget.addEventListener('scroll', schedule, { passive: true })
  window.addEventListener('resize', schedule)
  emitActive()

  return function cleanup() {
    scrollTarget.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
    if (frame != null) window.cancelAnimationFrame(frame)
  }
}
