import { createContext, useContext, useMemo, useCallback, useRef } from 'react'

const TunesContext = createContext(null)

export function TunesProvider({ tunes, tunesContentRevision, children }) {
  const tunesRef = useRef(tunes || {})
  tunesRef.current = tunes || {}

  const getTune = useCallback(function(tuneId) {
    if (!tuneId) return null
    return tunesRef.current[tuneId] || null
  }, [])

  const tuneIds = useMemo(function() {
    return Object.keys(tunes || {})
  }, [tunes, tunesContentRevision])

  const value = useMemo(function() {
    return {
      tunes: tunes || {},
      tunesContentRevision: tunesContentRevision || 0,
      tuneIds: tuneIds,
      getTune: getTune,
    }
  }, [tunes, tunesContentRevision, tuneIds, getTune])

  return (
    <TunesContext.Provider value={value}>
      {children}
    </TunesContext.Provider>
  )
}

export function useTunesContext() {
  return useContext(TunesContext)
}

export function useTuneIds() {
  const ctx = useTunesContext()
  return ctx ? ctx.tuneIds : []
}

export function useGetTune() {
  const ctx = useTunesContext()
  return ctx ? ctx.getTune : function() { return null }
}

export default TunesContext
