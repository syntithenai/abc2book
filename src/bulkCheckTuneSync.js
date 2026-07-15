function copyLink(link) {
  return link ? Object.assign({}, link) : {}
}

export function getLiveTune(tuneId, opts) {
  if (tuneId == null || !opts) return null

  if (opts.tunebook && typeof opts.tunebook.fromSelection === 'function') {
    const selection = {}
    selection[String(tuneId)] = true
    const matches = opts.tunebook.fromSelection(selection)
    if (matches && matches[0]) {
      return JSON.parse(JSON.stringify(matches[0]))
    }
  }

  const tunes = typeof opts.getTunes === 'function' ? opts.getTunes() : opts.tunes
  if (!tunes) return null
  const live = tunes[tuneId] || tunes[String(tuneId)]
  return live ? JSON.parse(JSON.stringify(live)) : null
}

export function mergeLinksPreferLive(draftLinks, liveLinks) {
  const draft = Array.isArray(draftLinks) ? draftLinks : []
  const live = Array.isArray(liveLinks) ? liveLinks : []
  if (live.length === 0) return draft.map(copyLink)
  if (draft.length === 0) return live.map(copyLink)

  const merged = []
  const count = Math.max(draft.length, live.length)
  for (let i = 0; i < count; i += 1) {
    const draftLink = draft[i] || {}
    const liveLink = live[i] || {}
    merged.push(Object.assign({}, draftLink, liveLink, {
      link: liveLink.link || draftLink.link || '',
      title: liveLink.title || draftLink.title || draftLink.name || '',
      startAt: liveLink.startAt || draftLink.startAt || '',
      endAt: liveLink.endAt || draftLink.endAt || '',
      recordingId: liveLink.recordingId || draftLink.recordingId || '',
      googleId: liveLink.googleId || draftLink.googleId || '',
    }))
  }
  return merged
}

export function syncTuneFromStore(draft, opts) {
  if (!draft || draft.id == null) return draft ? Object.assign({}, draft) : draft
  const live = getLiveTune(draft.id, opts)
  if (!live) return Object.assign({}, draft)

  return Object.assign({}, draft, {
    links: mergeLinksPreferLive(draft.links, live.links),
    key: draft.key || live.key || null,
    tempo: draft.tempo || live.tempo || null,
    meter: draft.meter || live.meter || null,
    noteLength: draft.noteLength || live.noteLength || null,
  })
}
