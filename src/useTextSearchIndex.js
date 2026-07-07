import { useState } from 'react'
import useAbcTools from './useAbcTools'
import {
  loadTextSearchIndexFromResource,
  loadAbcTextsFromIndexIds,
  searchLocalCollection,
} from './localAbcCollectionSearch'

/**
 * Static index of bundled ABC resource files — search and load helpers.
 */
export default function useTextSearchIndex() {
  const [textSearchIndex, setTextSearchIndex] = useState({})
  const abcTools = useAbcTools()

  function loadTextSearchIndex(index) {
    return loadTextSearchIndexFromResource(index).then(function(loaded) {
      setTextSearchIndex(loaded)
      return loaded
    })
  }

  function searchIndex(text, callback) {
    callback(searchLocalCollection(text, textSearchIndex))
  }

  function loadTuneTexts(tuneIds) {
    return loadAbcTextsFromIndexIds(tuneIds, abcTools)
  }

  return { textSearchIndex, setTextSearchIndex, loadTextSearchIndex, searchIndex, loadTuneTexts }
}
