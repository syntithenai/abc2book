import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { Button } from 'react-bootstrap'
import axios from 'axios'
import { curatedScrapeUrl } from '../resourceBase'
import {
  findCuratedByTitle,
  resolveCuratedScrapeLinks,
} from '../curatedImportMatch'
import { useDocumentTitle } from '../pageTitle'
import {
  registerSyncSourceAfterImport,
  stampSrcUrlOnImportResults,
} from '../syncSourceImportUtils'
import { setPendingShareImportSourceRegistration } from '../shareImportSession'
import {
  buildImportLinkNavigateAfterImport,
  handleImportNavigation,
} from '../shareImportNavigation'
import { OFFLINE_MESSAGE, isNavigatorOffline } from '../offlineNetwork'

const IMPORT_SOURCE_TIMEOUT_MS = 30000
const RESOLVER_HINT = 'Start the local resolver with `npm run start:resolver` (or `cd local-resolver && docker compose up`).'

function looksLikeAbc(text) {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.indexOf('<!DOCTYPE html') !== -1 || trimmed.indexOf('<html') !== -1) return false
  return /^(%abc|X:|T:)/im.test(trimmed)
}

function importScopeOption(routeParams) {
  const params = routeParams || {}
  return {
    scope: params.tuneId ? 'tune' : (params.tagName ? 'tag' : (params.bookName ? 'book' : 'all')),
    tuneId: params.tuneId || null,
    bookName: params.bookName || null,
    tagName: params.tagName || null,
  }
}

function bucketCount(bucket) {
  if (!bucket) return 0
  if (Array.isArray(bucket)) return bucket.length
  return Object.keys(bucket).length
}

function importChangeCount(results) {
  if (!results) return 0
  return bucketCount(results.inserts)
    + bucketCount(results.updates)
    + bucketCount(results.localUpdates)
    + bucketCount(results.duplicates)
    + bucketCount(results.deletes)
}

function mergeImportResults(into, next) {
  if (!into) return next
  if (!next) return into
  const out = Object.assign({}, into)
  ;['inserts', 'updates', 'localUpdates', 'duplicates', 'deletes'].forEach(function(key) {
    const a = into[key]
    const b = next[key]
    if (!a && !b) return
    if (Array.isArray(a) || Array.isArray(b)) {
      out[key] = [].concat(a || [], b || [])
      return
    }
    out[key] = Object.assign({}, a || {}, b || {})
  })
  return out
}

export default function ImportCuratedPage({
  tunebook,
  tunesHydrated,
  autoplay,
  setCurrentTuneBook,
  setTagFilter,
  setFilter,
  setNavigateAfterImport,
  setImportResults,
}) {
  const navigate = useNavigate()
  const params = useParams()
  const title = params.title ? decodeURIComponent(params.title) : ''

  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [merging, setMerging] = useState(false)
  const [mergeSummary, setMergeSummary] = useState('')
  const [progress, setProgress] = useState('')

  const curatedMeta = useMemo(function() {
    return findCuratedByTitle(tunebook && tunebook.curatedTuneBooks, title)
  }, [tunebook, title])

  const curatedTitle = curatedMeta ? curatedMeta.title : title
  const bookName = params.bookName || (curatedMeta && curatedMeta.book) || null
  const tagName = params.tagName || (curatedMeta && curatedMeta.tag) || null

  useDocumentTitle(finished ? 'Review import' : ('Import: ' + (curatedTitle || 'collection')))

  useEffect(function() {
    if (!title) {
      navigate('/tunes')
      return
    }
    if (!tunesHydrated) return
    if (!curatedMeta) {
      setError('Unknown curated collection: ' + title)
      return
    }
    if (isNavigatorOffline()) {
      setError(OFFLINE_MESSAGE)
      return
    }

    const links = resolveCuratedScrapeLinks(curatedMeta)
    if (!links.length) {
      setError('No scrape files configured for this collection.')
      return
    }

    let cancelled = false

    async function run() {
      let combined = null
      const sourceUrls = []
      for (let i = 0; i < links.length; i += 1) {
        if (cancelled) return
        setProgress('Fetching ' + (i + 1) + '/' + links.length + '…')
        const sourceUrl = curatedScrapeUrl(links[i])
        sourceUrls.push(sourceUrl)
        let res
        try {
          res = await axios.get(sourceUrl, { timeout: IMPORT_SOURCE_TIMEOUT_MS })
        } catch (e) {
          console.log(e)
          if (e && e.code === 'ECONNABORTED') {
            setError('Timed out loading ' + links[i] + '. ' + RESOLVER_HINT)
          } else if (e && (e.code === 'ECONNREFUSED' || e.message === 'Network Error')) {
            setError(isNavigatorOffline() ? OFFLINE_MESSAGE : ('Cannot reach the local resolver. ' + RESOLVER_HINT))
          } else {
            setError('Error loading ' + links[i])
          }
          return
        }
        if (!(res.data && looksLikeAbc(res.data))) {
          // Missing specialty files (e.g. eurosession.abc not published yet) are skippable.
          console.warn('Skipping non-ABC or missing curated source', sourceUrl)
          continue
        }
        let results
        try {
          results = tunebook.importAbc(
            res.data,
            null,
            null,
            bookName,
            tagName,
            null,
            {
              allowDuplicateTitles: !!(curatedMeta && curatedMeta.allowDuplicateTitles),
            }
          )
        } catch (importErr) {
          console.error(importErr)
          setError('Error parsing ' + links[i])
          return
        }
        combined = mergeImportResults(combined, stampSrcUrlOnImportResults(results, sourceUrl))
      }

      if (cancelled) return
      if (!combined) {
        setError('Unable to load import sources. ' + RESOLVER_HINT)
        return
      }

      setProgress('')
      const primaryUrl = sourceUrls[0] || ''
      const routeParams = {
        bookName: bookName,
        tagName: tagName,
      }
      const navPayload = Object.assign({}, buildImportLinkNavigateAfterImport(routeParams), {
        autoplay: autoplay,
        curatedTitle: curatedTitle || null,
        importKind: 'curated',
      })
      const navHelpers = {
        navigate: navigate,
        tunebook: tunebook,
        setCurrentTuneBook: setCurrentTuneBook,
        setTagFilter: setTagFilter,
        setFilter: setFilter,
      }

      if (!tunebook.showImportWarning(combined)) {
        const changeCount = importChangeCount(combined)
        setMergeSummary(changeCount > 0
          ? ('Importing ' + changeCount + ' tune' + (changeCount === 1 ? '' : 's') + ' into your library…')
          : 'Finishing import…')
        setMerging(true)
        try {
          const mergedTunes = await tunebook.applyMergeData(combined)
          registerSyncSourceAfterImport({
            url: primaryUrl,
            label: curatedTitle || 'Imported collection',
            scopeOption: importScopeOption(routeParams),
            results: combined,
            tunes: mergedTunes,
          })
          navHelpers.tunes = mergedTunes
          handleImportNavigation(navPayload, navHelpers, !!autoplay)
        } catch (mergeErr) {
          console.error(mergeErr)
          if (setImportResults) setImportResults(null)
          setMerging(false)
          setError('Error applying import.')
        }
      } else {
        setPendingShareImportSourceRegistration({
          url: primaryUrl,
          label: curatedTitle || 'Imported collection',
          scopeOption: importScopeOption(routeParams),
          results: combined,
        })
        if (setNavigateAfterImport) setNavigateAfterImport(navPayload)
        if (setImportResults) setImportResults(combined)
        setFinished(true)
      }
    }

    run()
    return function() { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- import once after tunes hydrate
  }, [tunesHydrated, title])

  if (finished) return null

  return (
    <div className="App-import">
      <h1>{'Importing curated book: ' + (curatedTitle || title)}</h1>
      {progress ? <>{progress}</> : null}
      {merging && mergeSummary ? <>{mergeSummary}</> : null}
      {(!error && !merging && !progress) && <>Loading…</>}
      {(error) && <>{error}</>}
    </div>
  )
}
