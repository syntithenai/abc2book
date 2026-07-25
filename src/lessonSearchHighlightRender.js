import { splitTextByHighlight, normalizeHighlightTerm } from './lessonSearchHighlight'

export function renderHighlightedPlainText(text, term, keyPrefix, highlightState) {
  const parts = splitTextByHighlight(text, term)
  if (!normalizeHighlightTerm(term)) {
    return [<span key={keyPrefix}>{text}</span>]
  }
  return parts.map(function(part, index) {
    const key = keyPrefix + '-hl-' + index
    if (!part.match) return <span key={key}>{part.text}</span>
    const isFirst = highlightState && !highlightState.firstAssigned
    if (isFirst) highlightState.firstAssigned = true
    return (
      <mark
        key={key}
        className={'lesson-search-highlight' + (isFirst ? ' lesson-search-highlight--scroll' : '')}
      >
        {part.text}
      </mark>
    )
  })
}
