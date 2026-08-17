import { useState, useEffect } from 'react'
import { clampCapoOffset } from './capoViewUtils'

/** Per-tune session: capo on/off survives navigating away and back. */
const capoViewSessionByTuneId = {}

export function resetCapoViewSessionForTests() {
  Object.keys(capoViewSessionByTuneId).forEach(function(key) {
    delete capoViewSessionByTuneId[key]
  })
}

function sessionKey(tuneId) {
  return String(tuneId == null ? '' : tuneId)
}

function readCapoSession(tuneId) {
  const key = sessionKey(tuneId)
  if (!key) return null
  return capoViewSessionByTuneId[key] || null
}

function persistCapoSession(tuneId, enabled, offset) {
  const key = sessionKey(tuneId)
  if (!key) return
  capoViewSessionByTuneId[key] = {
    enabled: !!enabled,
    offset: clampCapoOffset(offset),
  }
}

function capoStateFromStored(tuneId, storedCapo) {
  const next = clampCapoOffset(storedCapo)
  const saved = readCapoSession(tuneId)
  const offset = next > 0 ? next : (saved ? saved.offset : next)
  return {
    offset: offset,
    enabled: saved ? saved.enabled : next > 0,
    remembered: offset,
  }
}

/**
 * Session capo toggle + offset. Restores remembered offset when toggled back on.
 * Enabled/disabled is remembered per tune for the SPA session.
 */
export function useCapoViewState(tuneId, storedCapo) {
  const initial = capoStateFromStored(tuneId, storedCapo)

  const [capoOffset, setCapoOffset] = useState(initial.offset)
  const [capoEnabled, setCapoEnabled] = useState(initial.enabled)
  const [rememberedOffset, setRememberedOffset] = useState(initial.remembered)

  useEffect(function() {
    const next = capoStateFromStored(tuneId, storedCapo)
    setCapoOffset(next.offset)
    setCapoEnabled(next.enabled)
    setRememberedOffset(next.remembered)
  }, [tuneId, storedCapo])

  function toggleCapo() {
    if (capoEnabled) {
      setRememberedOffset(capoOffset)
      setCapoEnabled(false)
      persistCapoSession(tuneId, false, capoOffset)
    } else {
      setCapoOffset(rememberedOffset)
      setCapoEnabled(true)
      persistCapoSession(tuneId, true, rememberedOffset)
    }
  }

  function applyCapoOffset(offset) {
    const next = clampCapoOffset(offset)
    setCapoOffset(next)
    setRememberedOffset(next)
    setCapoEnabled(true)
    persistCapoSession(tuneId, true, next)
  }

  const effectiveCapo = capoEnabled ? capoOffset : 0

  return {
    capoOffset,
    capoEnabled,
    effectiveCapo,
    toggleCapo,
    applyCapoOffset,
  }
}
