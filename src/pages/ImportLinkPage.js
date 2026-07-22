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

export default function ImportLinkPage({
  tunebook,
  autoplay,
  setCurrentTuneBook,
  setTagFilter,
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
    const sourceUrl = resolveImportSourceUrl(params.link)
    axios.get(sourceUrl, { timeout: IMPORT_SOURCE_TIMEOUT_MS }).then(function(res) {
      if (res.data && looksLikeAbc(res.data)) {
        var results = tunebook.importAbc(res.data, null, params.tuneId, params.bookName, params.tagName)
        const stampedResults = stampSrcUrlOnImportResults(results, sourceUrl)
        setCurrentTuneBook('')
        if (params.bookName) {
          setCurrentTuneBook(params.bookName)
        }
        setTagFilter([])
        if (params.tagName) {
          setTagFilter([params.tagName])
        }
        if (!tunebook.showImportWarning(stampedResults)) {
          tunebook.applyMergeData(stampedResults).then(function(mergedTunes) {
            registerSyncSourceAfterImport({
              url: sourceUrl,
              label: curatedTitle || 'Imported collection',
              scopeOption: {
                scope: params.tuneId ? 'tune' : (params.tagName ? 'tag' : (params.bookName ? 'book' : 'all')),
                tuneId: params.tuneId || null,
                bookName: params.bookName || null,
                tagName: params.tagName || null,
              },
              results: stampedResults,
            })
            if (autoplay && mergedTunes) {
              if (params.tuneId) {
                navigate('/tunes' + (params.tuneId ? '/' + params.tuneId + (autoplay ? '/playMedia' : '') : ''))
              } else {
                var firstTuneId = tunebook.fillMediaPlaylist(
                  params.bookName,
                  (Array.isArray(results) ? results.map(function(result) {
                    return result.id
                  }).join(',') : ''),
                  (params.tagName && params.tagName.trim() ? [params.tagName] : []),
                  mergedTunes
                )
                navigate('/tunes' + (firstTuneId ? '/' + firstTuneId + (autoplay ? '/playMedia' : '') : ''))
              }
            } else {
              if (params.tuneId) {
                navigate('/tunes/' + params.tuneId + (autoplay ? '/playMedia' : ''))
              } else if (params.bookName || params.tagName) {
                navigate('/tunes')
              } else {
                navigate('/books')
              }
            }
          })
        } else {
          setPendingShareImportSourceRegistration({
            url: sourceUrl,
            label: curatedTitle || 'Imported collection',
            scopeOption: {
              scope: params.tuneId ? 'tune' : (params.tagName ? 'tag' : (params.bookName ? 'book' : 'all')),
              tuneId: params.tuneId || null,
              bookName: params.bookName || null,
              tagName: params.tagName || null,
            },
            results: stampedResults,
          })
          setNavigateAfterImport(Object.assign({}, params, {
            autoplay: autoplay,
            curatedTitle: curatedTitle || null,
            importKind: curatedTitle ? 'curated' : 'shared',
          }))
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time import when link route mounts
  }, [])

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
