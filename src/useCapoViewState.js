import { useState, useEffect } from 'react'
import { clampCapoOffset } from './capoViewUtils'

/**
 * Session capo toggle + offset. Restores remembered offset when toggled back on.
 */
export function useCapoViewState(tuneId, storedCapo) {
  const initial = clampCapoOffset(storedCapo)

  const [capoOffset, setCapoOffset] = useState(initial)
  const [capoEnabled, setCapoEnabled] = useState(initial > 0)
  const [rememberedOffset, setRememberedOffset] = useState(initial)

  useEffect(function() {
    const next = clampCapoOffset(storedCapo)
    setCapoOffset(next)
    setCapoEnabled(next > 0)
    setRememberedOffset(next)
  }, [tuneId, storedCapo])

  function toggleCapo() {
    if (capoEnabled) {
      setRememberedOffset(capoOffset)
      setCapoEnabled(false)
    } else {
      setCapoOffset(rememberedOffset)
      setCapoEnabled(true)
    }
  }

  function applyCapoOffset(offset) {
    const next = clampCapoOffset(offset)
    setCapoOffset(next)
    setRememberedOffset(next)
    setCapoEnabled(true)
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
