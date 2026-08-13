import { useNavigate, useParams } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import { Button } from 'react-bootstrap'
import axios from 'axios'
import { curatedScrapeUrl } from '../resourceBase'
import { findCuratedImportTitle } from '../curatedImportMatch'
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

const IMPORT_SOURCE_TIMEOUT_MS = 30000
const RESOLVER_HINT = 'Start the local resolver with `npm run start:resolver` (or `cd local-resolver && docker compose up`).'

function resolveImportSourceUrl(link) {
  return curatedScrapeUrl(link)
}

function looksLikeAbc(text) {
  if (!text || typeof text !== 'string') return false
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.indexOf('<!DOCTYPE html') !== -1 || trimmed.indexOf('<html') !== -1) return false
  return /^(%abc|X:|T:)/im.test(trimmed)
}

function buildNavigationPayload(routeParams, extras) {
  const extra = extras || {}
  if (extra.autoplay) {
    return Object.assign({}, routeParams, extra)
  }
  return Object.assign({}, buildImportLinkNavigateAfterImport(routeParams), extra)
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

export default function ImportLinkPage({
  tunebook,
  tunesHydrated,
  autoplay,
  setCurrentTuneBook,
  setTagFilter,
  setFilter,
  setNavigateAfterImport,
  setImportResults,
  importResults,
}) {
  var navigate = useNavigate()
  var params = useParams()

  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const [clickToStart, setClickToStart] = useState(false)

  const curatedTitle = useMemo(function() {
    return findCuratedImportTitle(
      tunebook && tunebook.curatedTuneBooks,
      params.link,
      params.bookName,
      params.tagName
    )
  }, [tunebook, params.link, params.bookName, params.tagName])

  const pageHeading = curatedTitle
    ? ('Importing curated book: ' + curatedTitle)
    : 'Importing shared tune book'

  useDocumentTitle(finished ? 'Review import' : (curatedTitle ? ('Import: ' + curatedTitle) : 'Import tune book'))

  useEffect(function() {
    if (!params.link) {
      navigate('/tunes')
      return
    }
    if (!tunesHydrated) {
      return
    }
    const sourceUrl = resolveImportSourceUrl(params.link)
    axios.get(sourceUrl, { timeout: IMPORT_SOURCE_TIMEOUT_MS }).then(function(res) {
      if (res.data && looksLikeAbc(res.data)) {
        var results = tunebook.importAbc(res.data, null, params.tuneId, params.bookName, params.tagName)
        const stampedResults = stampSrcUrlOnImportResults(results, sourceUrl)
        const navPayload = buildNavigationPayload(params, {
          autoplay: autoplay,
          curatedTitle: curatedTitle || null,
          importKind: curatedTitle ? 'curated' : 'shared',
        })
        const navHelpers = {
          navigate: navigate,
          tunebook: tunebook,
          setCurrentTuneBook: setCurrentTuneBook,
          setTagFilter: setTagFilter,
          setFilter: setFilter,
        }
        if (!tunebook.showImportWarning(stampedResults)) {
          tunebook.applyMergeData(stampedResults).then(function(mergedTunes) {
            registerSyncSourceAfterImport({
              url: sourceUrl,
              label: curatedTitle || 'Imported collection',
              scopeOption: importScopeOption(params),
              results: stampedResults,
            })
            navHelpers.tunes = mergedTunes
            handleImportNavigation(navPayload, navHelpers, !!autoplay)
          })
        } else {
          setPendingShareImportSourceRegistration({
            url: sourceUrl,
            label: curatedTitle || 'Imported collection',
            scopeOption: importScopeOption(params),
            results: stampedResults,
          })
          if (setNavigateAfterImport) {
            setNavigateAfterImport(navPayload)
          }
          if (setImportResults) setImportResults(stampedResults)
          setFinished(true)
        }
      } else {
        setError('Unable to load import source. ' + RESOLVER_HINT)
      }
    }).catch(function(e) {
      console.log(e)
      if (e && e.code === 'ECONNABORTED') {
        setError('Timed out loading import source. ' + RESOLVER_HINT)
      } else if (e && (e.code === 'ECONNREFUSED' || e.message === 'Network Error')) {
        setError('Cannot reach the local resolver. ' + RESOLVER_HINT)
      } else {
        setError('Error loading import source')
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- import once after tunes hydrate
  }, [tunesHydrated])

  // Review UI is owned by ImportWarningDialog; avoid a stray page heading under it.
  // importAbc also sets app-scoped importResults before local finished flips.
  if (finished || importResults) return null

  if (clickToStart) {
    return (
      <div style={{ width: '80%', margin: '5em', padding: '5em', backgroundColor: 'lightgreen' }}>
        <Button size="lg" variant="success" onClick={function() {
          setClickToStart(false)
          navigate('/tunes')
        }}>Start the Playlist</Button>
      </div>
    )
  }

  if (!(params.link && params.link.trim())) return null

  return (
    <div className="App-import">
      <h1>{pageHeading}</h1>
      {(!error) && <>Loading…</>}
      {(error) && <>{error}</>}
    </div>
  )
}
