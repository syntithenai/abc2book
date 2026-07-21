/**
 * Visual type metadata for Knowledge Feed cards.
 */

const TYPE_META = {
  quiz: { className: 'feed-card--quiz', label: 'Quiz' },
  theory_quiz: { className: 'feed-card--quiz', label: 'Quiz' },
  news: { className: 'feed-card--story', label: 'Article' },
  dyk: { className: 'feed-card--dyk', label: 'Did you know' },
  theory_lesson: { className: 'feed-card--theory', label: 'Theory' },
  singing_tip: { className: 'feed-card--singing', label: 'Singing tip' },
  warmup_idea: { className: 'feed-card--warmup', label: 'Warm-up' },
}

const DEFAULT_META = { className: 'feed-card--default', label: 'Story' }

export function feedCardTypeMeta(item) {
  if (!item || !item.type) return DEFAULT_META
  if (item.type === 'news'
      && (item.generation === 'wiki' || item.source === 'wikipedia')) {
    return { className: 'feed-card--wiki', label: 'Wiki' }
  }
  return TYPE_META[item.type] || DEFAULT_META
}

export function feedCardTypeClass(item) {
  return feedCardTypeMeta(item).className
}

export function feedCardTypeLabel(item) {
  return feedCardTypeMeta(item).label
}
