import LessonTrackRef from './components/LessonTrackRef'

const TRACK_MARKER_RE = /\[\[track:([a-z0-9_-]+)(?:\|([^\]]+))?\]\]/gi

export function splitLessonTrackMarkers(text) {
  const source = String(text || '')
  const parts = []
  let last = 0
  let match
  TRACK_MARKER_RE.lastIndex = 0
  while ((match = TRACK_MARKER_RE.exec(source)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', value: source.slice(last, match.index) })
    }
    parts.push({
      type: 'track',
      id: match[1],
      label: match[2] || '',
    })
    last = match.index + match[0].length
  }
  if (last < source.length) {
    parts.push({ type: 'text', value: source.slice(last) })
  }
  return parts
}

export function lessonTextHasTrackMarkers(text) {
  TRACK_MARKER_RE.lastIndex = 0
  return TRACK_MARKER_RE.test(String(text || ''))
}

function renderTrackPart(part, ctx, key) {
  const track = (ctx.tracksById || {})[part.id]
  const entityId = track && (track.entity_id || track.entityId)
  const entity = entityId ? (ctx.entitiesById || {})[entityId] : null
  return (
    <LessonTrackRef
      key={key}
      trackId={part.id}
      track={track}
      entity={entity}
      label={part.label || (track && track.label) || part.id}
      lesson={ctx.lesson}
      tunebook={ctx.tunebook}
      navigate={ctx.navigate}
      mediaController={ctx.mediaController}
    />
  )
}

export function renderLessonInlineParts(parts, ctx, renderText, keyPrefix) {
  return (parts || []).map(function(part, index) {
    const key = keyPrefix + '-' + index
    if (part.type === 'track') return renderTrackPart(part, ctx, key)
    if (typeof renderText === 'function') {
      const fragment = part.value || ''
      if (!fragment.trim()) return null
      return renderText(fragment, key)
    }
    return null
  })
}
