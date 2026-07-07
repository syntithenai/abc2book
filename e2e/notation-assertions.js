'use strict'

function pitchSummary(p) {
  if (!p) return '?'
  let s = p.step + String(p.octave != null ? p.octave : '')
  if (p.accidental) s += '#' + p.accidental
  return s
}

function durationBeats(ev) {
  if (typeof ev.durationBeats === 'number') return ev.durationBeats
  if (!ev.duration) return 1
  const num = ev.duration.num || 1
  const den = ev.duration.den || 1
  let beats = num / den
  if (ev.duration.dotted) beats *= 1.5
  return beats
}

function formatDurationSuffix(beats) {
  if (Math.abs(beats - 1) < 0.001) return ''
  return ':' + String(beats)
}

function eventSummary(ev) {
  if (!ev) return '?'
  if (ev.type === 'note') {
    const beats = durationBeats(ev)
    return 'note:' + pitchSummary(ev.pitch) + formatDurationSuffix(beats)
  }
  if (ev.type === 'chord') {
    const pitches = (ev.pitches || []).slice().sort(function(a, b) {
      const oa = a.octave || 0
      const ob = b.octave || 0
      if (oa !== ob) return oa - ob
      return String(a.step).localeCompare(String(b.step))
    })
    const beats = durationBeats(ev)
    return 'chord:' + pitches.map(pitchSummary).join('+') + formatDurationSuffix(beats)
  }
  if (ev.type === 'rest') {
    return 'rest:' + String(durationBeats(ev))
  }
  if (ev.type === 'barline') {
    return 'bar:' + (ev.barToken || '|')
  }
  if (ev.type === 'systemBreak') {
    return 'break'
  }
  return ev.type + ':' + (ev.id || '?')
}

function eventSummaries(state) {
  const events = state && state.events ? state.events : state
  if (!Array.isArray(events)) return []
  return events.map(eventSummary)
}

function noteStepsFromState(state) {
  return state.events
    .filter(function(ev) { return ev.type === 'note' || ev.type === 'chord' })
    .map(function(ev) {
      const p = ev.pitch || (ev.pitches && ev.pitches[0])
      if (!p) return '?'
      return p.step + (p.accidental ? ('#' + p.accidental) : '')
    })
}

function collapseAbcWhitespace(abc) {
  return String(abc || '').replace(/\s+/g, ' ').trim()
}

async function getSessionEventSummaries(page) {
  const events = await page.evaluate(function() {
    return window.__abc2bookNotationTest.getSessionEvents()
  })
  return eventSummaries({ events: events })
}

async function getNoteSteps(page) {
  const state = await page.evaluate(function() {
    return window.__abc2bookNotationTest.getSessionEvents()
  })
  return noteStepsFromState({ events: state })
}

async function assertNoteSteps(page, expected, label) {
  const got = await getNoteSteps(page)
  const want = expected.slice()
  if (got.length !== want.length || got.some(function(step, i) { return step !== want[i] })) {
    throw new Error(
      (label || 'note steps') + ': expected [' + want.join(' ') + '], got [' + got.join(' ') + ']'
    )
  }
}

async function assertEvents(page, expected, label) {
  const got = await getSessionEventSummaries(page)
  const want = expected.slice()
  if (got.length !== want.length || got.some(function(item, i) { return item !== want[i] })) {
    throw new Error(
      (label || 'events') + ': expected [' + want.join(', ') + '], got [' + got.join(', ') + ']'
    )
  }
}

async function assertVoiceAbc(page, expectedAbc, label) {
  const got = await page.evaluate(function() {
    return window.__abc2bookNotationTest.getVoiceAbc()
  })
  const want = collapseAbcWhitespace(expectedAbc)
  const gotNorm = collapseAbcWhitespace(got)
  if (gotNorm !== want) {
    throw new Error(
      (label || 'voice ABC') + ': expected "' + want + '", got "' + gotNorm + '"'
    )
  }
}

async function getCaretIndex(page) {
  return page.evaluate(function() {
    return window.__abc2bookNotationTest.getCaretIndex()
  })
}

module.exports = {
  pitchSummary,
  durationBeats,
  eventSummary,
  eventSummaries,
  noteStepsFromState,
  collapseAbcWhitespace,
  getSessionEventSummaries,
  getNoteSteps,
  assertNoteSteps,
  assertEvents,
  assertVoiceAbc,
  getCaretIndex,
}
