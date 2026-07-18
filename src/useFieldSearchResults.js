import { useEffect, useState } from 'react'
import {
  getFieldSearchResults,
  subscribeFieldSearchResults,
  targetKeyForFieldSearch,
} from './fieldSearchResultCache'

/**
 * Subscribe to cached search results for a tune/candidate + kind.
 */
export function useFieldSearchResults(tuneId, candidateId, kind) {
  const targetKey = targetKeyForFieldSearch(tuneId, candidateId)
  const [candidates, setCandidates] = useState(function() {
    return getFieldSearchResults(targetKey, kind)
  })

  useEffect(function() {
    function sync() {
      setCandidates(getFieldSearchResults(targetKey, kind))
    }
    sync()
    return subscribeFieldSearchResults(sync)
  }, [targetKey, kind])

  return candidates
}
