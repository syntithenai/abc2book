import { isFeedFeedbackAdmin } from './feedFeedbackUtils'
import { lessonFeedbackPresetLabel } from './lessonFeedbackPresets'

export function isLessonFeedbackAdmin(user) {
  return isFeedFeedbackAdmin(user)
}

function simpleHash(text) {
  let hash = 0
  const s = String(text || '')
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function lessonContentFeedbackId(lessonId, sectionId, selectedText) {
  const section = sectionId || 'general'
  const snippet = String(selectedText || '').trim().slice(0, 48)
  return String(lessonId || 'lesson') + ':content:' + section + ':' + simpleHash(snippet)
}

export function lessonQuizFeedbackId(lessonId, questionId) {
  return String(lessonId || 'lesson') + ':quiz:' + String(questionId || 'question')
}

export function compileLessonFeedbackText(entry) {
  const parts = []
  const selected = String(entry && entry.selectedText || '').trim()
  if (selected) parts.push('Selected: ' + selected)
  const positionLine = formatLessonFeedbackPosition(entry && entry.position)
  if (positionLine) parts.push('Position: ' + positionLine)
  const presets = Array.isArray(entry && entry.presets) ? entry.presets : []
  if (presets.length) {
    parts.push('Tags: ' + presets.map(lessonFeedbackPresetLabel).join(', '))
  }
  const notes = String(entry && entry.notes || '').trim()
  if (notes) parts.push(notes)
  return parts.join('\n\n').trim()
}

function normalizeLessonFeedbackPosition(position) {
  if (!position || typeof position !== 'object') return null
  const blockIndex = Number(position.blockIndex)
  const blockEndIndex = Number(position.blockEndIndex)
  const sourceStart = Number(position.sourceStart)
  const sourceEnd = Number(position.sourceEnd)
  const blockPlainStart = Number(position.blockPlainStart)
  const blockPlainEnd = Number(position.blockPlainEnd)
  const matchIndex = Number(position.matchIndex)
  return {
    lessonPath: String(position.lessonPath || ''),
    sectionId: String(position.sectionId || ''),
    blockIndex: Number.isFinite(blockIndex) ? blockIndex : -1,
    blockEndIndex: Number.isFinite(blockEndIndex) ? blockEndIndex : -1,
    blockType: String(position.blockType || ''),
    blockPlainStart: Number.isFinite(blockPlainStart) ? blockPlainStart : -1,
    blockPlainEnd: Number.isFinite(blockPlainEnd) ? blockPlainEnd : -1,
    sourceStart: Number.isFinite(sourceStart) ? sourceStart : -1,
    sourceEnd: Number.isFinite(sourceEnd) ? sourceEnd : -1,
    matchIndex: Number.isFinite(matchIndex) ? matchIndex : -1,
    sourceExcerpt: String(position.sourceExcerpt || ''),
  }
}

export function buildLessonFeedbackSnapshot(draft) {
  const d = draft || {}
  const itemId = d.itemId || ''
  const entry = {
    itemId: itemId,
    lessonId: d.lessonId || '',
    type: d.type || 'lesson_content',
    title: d.title || '',
    sectionId: d.sectionId || '',
    sectionTitle: d.sectionTitle || '',
    questionId: d.questionId || '',
    questionPrompt: d.questionPrompt || '',
    selectedText: String(d.selectedText || '').trim(),
    context: String(d.context || '').trim(),
    position: normalizeLessonFeedbackPosition(d.position),
    presets: Array.isArray(d.presets) ? d.presets.slice() : [],
    notes: String(d.notes || ''),
  }
  entry.feedback = compileLessonFeedbackText(entry)
  return entry
}

export function findLessonSelectionContext(rootEl, selection) {
  const root = rootEl
  const sel = selection
  if (!root || !sel || sel.rangeCount < 0) {
    return { sectionId: '', sectionTitle: '', context: '' }
  }
  let node = sel.anchorNode
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement
  const sectionEl = node && node.closest ? node.closest('.lesson-section, .lesson-key-points, .lesson-quiz-player') : null
  const sectionId = sectionEl && sectionEl.id ? sectionEl.id : ''
  let sectionTitle = ''
  if (sectionEl) {
    const heading = sectionEl.querySelector('h2, h3, .lesson-quiz-prompt')
    sectionTitle = heading ? String(heading.textContent || '').trim() : ''
  }
  let context = ''
  if (sectionEl) {
    const article = sectionEl.closest('.lesson-content')
    if (article && sectionEl.classList.contains('lesson-section')) {
      context = String(sectionEl.textContent || '').trim().slice(0, 1200)
    }
  }
  return { sectionId: sectionId, sectionTitle: sectionTitle, context: context }
}

function stripSimpleMarkdown(text) {
  return String(text || '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\[\[(?:track|entity):[^\]]+\]\]/g, ' ')
}

function plainLengthAtSourceOffset(source, sourceOffset) {
  return stripSimpleMarkdown(String(source || '').slice(0, Math.max(0, sourceOffset))).length
}

export function locateTextInSource(sourceText, selectedText, plainHintStart) {
  const source = String(sourceText || '')
  const selected = String(selectedText || '').trim()
  if (!source || !selected) {
    return { sourceStart: -1, sourceEnd: -1, matchIndex: -1, sourceExcerpt: '' }
  }
  const lowerSource = source.toLowerCase()
  const lowerSelected = selected.toLowerCase()
  const matches = []
  let idx = 0
  while (idx < source.length) {
    const found = lowerSource.indexOf(lowerSelected, idx)
    if (found === -1) break
    matches.push(found)
    idx = found + 1
  }
  if (!matches.length) {
    return { sourceStart: -1, sourceEnd: -1, matchIndex: -1, sourceExcerpt: '' }
  }
  let chosen = matches[0]
  let matchIndex = 0
  if (matches.length > 1 && typeof plainHintStart === 'number' && plainHintStart >= 0) {
    let bestDistance = Infinity
    matches.forEach(function(found, i) {
      const plainAt = plainLengthAtSourceOffset(source, found)
      const distance = Math.abs(plainAt - plainHintStart)
      if (distance < bestDistance) {
        bestDistance = distance
        chosen = found
        matchIndex = i
      }
    })
  }
  const sourceStart = chosen
  const sourceEnd = chosen + selected.length
  const excerptPad = 60
  const excerptStart = Math.max(0, sourceStart - excerptPad)
  const excerptEnd = Math.min(source.length, sourceEnd + excerptPad)
  return {
    sourceStart: sourceStart,
    sourceEnd: sourceEnd,
    matchIndex: matchIndex,
    sourceExcerpt: source.slice(excerptStart, excerptEnd),
  }
}

export function getRangeOffsetsWithin(container, range) {
  if (!container || !range || typeof document === 'undefined') return null
  try {
    const preRange = range.cloneRange()
    preRange.selectNodeContents(container)
    preRange.setEnd(range.startContainer, range.startOffset)
    const start = preRange.toString().length
    preRange.setEnd(range.endContainer, range.endOffset)
    const end = preRange.toString().length
    return { start: start, end: end }
  } catch (e) {
    return null
  }
}

export function resolveBlockSourceFromLesson(lesson, sectionId, blockIndex, blockType, blockEndIndex) {
  if (!lesson || blockIndex == null || blockIndex < 0) return ''
  if (blockType === 'key_point') {
    return String((lesson.key_points || [])[blockIndex] || '')
  }
  const section = (lesson.sections || []).find(function(s) { return s && s.id === sectionId })
  if (!section) return ''
  const blocks = section.blocks || []
  if (blockType === 'inlineGroup' && blockEndIndex != null && blockEndIndex >= blockIndex) {
    const parts = []
    for (let i = blockIndex; i <= blockEndIndex; i += 1) {
      parts.push(resolveBlockSourceFromLesson(lesson, sectionId, i, blocks[i] && blocks[i].type, null))
    }
    return parts.filter(Boolean).join(' ')
  }
  const block = blocks[blockIndex]
  if (!block) return ''
  if (block.type === 'markdown') return String(block.text || '')
  if (block.type === 'entity') {
    const ent = (lesson.entities || []).find(function(e) { return e && e.id === block.id })
    return ent && ent.name ? String(ent.name) : String(block.id || '')
  }
  if (block.type === 'track') return String(block.label || block.id || '')
  return ''
}

export function formatLessonFeedbackPosition(position) {
  const pos = position || {}
  const parts = []
  if (pos.lessonPath) parts.push(pos.lessonPath)
  if (pos.sectionId) parts.push('§ ' + pos.sectionId)
  if (pos.blockIndex != null && pos.blockIndex >= 0) {
    let blockLabel = 'block ' + pos.blockIndex
    if (pos.blockType) blockLabel += ' (' + pos.blockType + ')'
    parts.push(blockLabel)
  }
  if (pos.sourceStart != null && pos.sourceStart >= 0 && pos.sourceEnd != null && pos.sourceEnd > pos.sourceStart) {
    parts.push('[' + pos.sourceStart + ':' + pos.sourceEnd + ']')
  } else if (pos.blockPlainStart != null && pos.blockPlainStart >= 0 && pos.blockPlainEnd != null && pos.blockPlainEnd > pos.blockPlainStart) {
    parts.push('plain ' + pos.blockPlainStart + ':' + pos.blockPlainEnd)
  }
  return parts.join(' ').trim()
}

export function findLessonSelectionPosition(rootEl, selection, lesson) {
  const base = findLessonSelectionContext(rootEl, selection)
  if (!selection || selection.rangeCount < 1) {
    return Object.assign({ position: null }, base)
  }
  const range = selection.getRangeAt(0)
  let node = range.commonAncestorContainer
  if (node && node.nodeType === Node.TEXT_NODE) node = node.parentElement
  const blockEl = node && node.closest ? node.closest('[data-lesson-block-index]') : null
  if (!blockEl) {
    return Object.assign({ position: null }, base)
  }

  const blockIndex = parseInt(blockEl.getAttribute('data-lesson-block-index'), 10)
  const blockEndIndexRaw = blockEl.getAttribute('data-lesson-block-end-index')
  const blockEndIndex = blockEndIndexRaw != null ? parseInt(blockEndIndexRaw, 10) : blockIndex
  const blockType = blockEl.getAttribute('data-lesson-block-type') || ''
  const selectedText = String(selection.toString() || '').trim()
  const offsets = getRangeOffsetsWithin(blockEl, range)
  const sectionId = base.sectionId || (blockEl.closest('.lesson-section, .lesson-key-points') || {}).id || ''

  const sourceText = resolveBlockSourceFromLesson(
    lesson,
    sectionId,
    blockIndex,
    blockType,
    Number.isFinite(blockEndIndex) ? blockEndIndex : blockIndex
  )
  const sourceRange = locateTextInSource(sourceText, selectedText, offsets && offsets.start)

  const position = {
    lessonPath: lesson && lesson.path ? String(lesson.path) : '',
    sectionId: sectionId,
    blockIndex: Number.isFinite(blockIndex) ? blockIndex : -1,
    blockEndIndex: Number.isFinite(blockEndIndex) ? blockEndIndex : blockIndex,
    blockType: blockType,
    blockPlainStart: offsets ? offsets.start : -1,
    blockPlainEnd: offsets ? offsets.end : -1,
    sourceStart: sourceRange.sourceStart,
    sourceEnd: sourceRange.sourceEnd,
    matchIndex: sourceRange.matchIndex,
    sourceExcerpt: sourceRange.sourceExcerpt,
  }

  return Object.assign({ position: position }, base)
}
