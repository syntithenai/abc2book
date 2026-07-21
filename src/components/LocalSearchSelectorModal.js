import {useState, useEffect, useCallback, useRef} from 'react'
import {Button, Form, Modal, ListGroup} from 'react-bootstrap'
import { useIsNarrowViewport } from '../useMediaQuery'
import Abc from './Abc'
import TuneImportFieldChooserModal from './TuneImportFieldChooserModal'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import VoiceFillInput from './VoiceFillInput'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { isMediaResolverInfrastructureError, isNotationSearchEmptyError } from '../mediaProxyClient'
import { searchNotation } from '../notationSearchClient'
import { isAbortError } from '../abortUtils'
import { useFieldLookupSearchJob } from '../useFieldLookupSearchJob'
import { applyFieldLookupChoice } from '../tuneFieldLookupQueue'
import {
  formatLocalSearchLabel,
  inferSongTypeFromRhythm,
  isStrongLocalMatch,
} from '../textSearchIndexUtils'
import { importedTuneFromNotationCandidate } from '../notationImportUtils'

const SONG_TYPE_OPTIONS = [
  { value: 'song', label: 'Song' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'traditional_tune', label: 'Traditional tune' },
  { value: 'choral', label: 'Choral' },
]

function defaultOptions() {
  return {}
}

function normalizeSearchText(value) {
  return String(value ?? '')
}

function mapRemoteProgress(onProgress, localBase, localRange) {
  return function(message, progress, stage) {
    if (typeof onProgress !== 'function') return
    const remote = typeof progress === 'number' && Number.isFinite(progress) ? progress : 0
    const overall = localBase + (remote * localRange)
    onProgress(message, overall, stage)
  }
}

function ExternalSearchLinks(props) {
  const { filter, tunebook } = props
  const query = (filter || '').trim()
  if (!query) return null
  return (
    <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap', marginTop: '0.75em' }}>
      <a target="_blank" rel="noreferrer" href={'https://www.google.com/search?q=' + encodeURIComponent('abc notation ' + query)}>
        <Button variant="outline-secondary" size="sm">{tunebook.icons.externallink} Google</Button>
      </a>
      <a target="_blank" rel="noreferrer" href={'https://thesession.org/tunes/search?q=' + encodeURIComponent(query)}>
        <Button variant="outline-secondary" size="sm">{tunebook.icons.externallink} TheSession.org</Button>
      </a>
    </div>
  )
}

function LocalSearchSelectorModal(props) {
  const {
    searchIndex,
    value,
    currentTune,
    tunebook,
    loadTuneTexts,
    onStageImport,
    token,
  } = props
  const narrow = useIsNarrowViewport()
  const { available: resolverAvailable, checked: resolverChecked, refreshMediaResolverHealth } = useMediaResolverHealth()
  const [show, setShow] = useState(false)
  const [filter, setFilter] = useState(function() { return normalizeSearchText(value) })
  const [options, setOptions] = useState(defaultOptions())
  const [settings, setSettings] = useState(null)
  const [scores, setScores] = useState({})
  const [pendingImport, setPendingImport] = useState(null)
  const [importSourceLabel, setImportSourceLabel] = useState('Import from collection')
  const [songType, setSongType] = useState('instrumental')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [resolverUnreachable, setResolverUnreachable] = useState(false)
  const searchGenerationRef = useRef(0)
  const abortRef = useRef(null)
  const applyRemoteRef = useRef(null)
  const tuneId = currentTune && currentTune.id

  const useUnifiedSearch = resolverChecked && resolverAvailable && !resolverUnreachable

  const lookup = useFieldLookupSearchJob({
    tuneId: tuneId,
    kind: 'notation',
    onAwaiting: function(job) {
      const candidates = Array.isArray(job.candidates) ? job.candidates : []
      if (candidates.length === 1) {
        if (typeof applyRemoteRef.current === 'function') {
          applyRemoteRef.current(candidates[0], job.id)
        }
      } else if (candidates.length > 1) {
        setPickerCandidates(candidates)
        setShowPicker(true)
      }
      setBusy(false)
      setProgressMessage('')
    },
    onError: function(job) {
      setError(job.error || 'Notation search failed')
      setBusy(false)
      setProgressMessage('')
    },
  })

  function cancelSearch() {
    searchGenerationRef.current += 1
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    if (lookup.busy) lookup.cancel()
    setBusy(false)
    setProgressMessage('')
    setProgressPercent(0)
  }

  const handleClose = function() {
    // Leave background notation lookup running; only clear local modal state.
    searchGenerationRef.current += 1
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setPendingImport(null)
    setShow(false)
    setBusy(false)
    setError('')
    setProgressMessage('')
    setProgressPercent(0)
    setShowPicker(false)
    setPickerCandidates([])
    setResolverUnreachable(false)
  }

  const handleShow = function() {
    setShow(true)
  }

  useEffect(function() {
    setFilter(normalizeSearchText(value))
  }, [value])

  function updateProgress(message, progress, stage) {
    setProgressMessage(message || '')
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))))
    }
    if (stage) {
      // stage is available for future UI if needed
    }
  }

  const runLocalSearch = useCallback(function(text) {
    return new Promise(function(resolve) {
      if (!searchIndex) {
        resolve([])
        return
      }
      searchIndex(text, function(searchRes) {
        resolve(Array.isArray(searchRes) ? searchRes : [])
      })
    })
  }, [searchIndex])

  function applyLocalResults(results) {
    const final = {}
    const sc = {}
    let lastScore = null
    results.forEach(function(result, rk) {
      final[result.ids.join(',')] = formatLocalSearchLabel(result)
      if (lastScore !== null && lastScore !== result.score) sc[rk] = true
      lastScore = result.score
    })
    setOptions(final)
    setScores(sc)
  }

  function beginImport(setting, sourceLabel, candidate) {
    if (!props.currentTune || !setting) return
    setImportSourceLabel(sourceLabel || 'Import from collection')
    const importedTune = candidate
      ? importedTuneFromNotationCandidate(props.tunebook.abcTools, setting, candidate)
      : props.tunebook.abcTools.abc2json(setting)
    setPendingImport({
      importedTune: importedTune,
      previewAbc: setting,
    })
  }

  function handleImportSave(mergedTune) {
    if (typeof props.onStageImport === 'function') {
      props.onStageImport(mergedTune)
      setPendingImport(null)
      setShow(false)
      return
    }
    props.tunebook.saveTune(mergedTune, false, { historyLabel: importSourceLabel })
    setPendingImport(null)
    setShow(false)
  }

  function handleImportClose() {
    setPendingImport(null)
  }

  function selectTune(key) {
    const tuneIds = key.split(',')
    props.loadTuneTexts(tuneIds).then(function(s) {
      setSettings(s)
    })
  }

  function sourceLabelForCandidate(candidate) {
    const source = candidate && candidate.source ? String(candidate.source) : ''
    if (source.indexOf('thesession') >= 0) return 'Import from The Session'
    if (source) return 'Import from ' + source
    return 'Import from web'
  }

  function applyRemoteCandidate(candidate, jobId) {
    if (!candidate || !candidate.abc) return
    if (jobId) applyFieldLookupChoice(jobId, candidate)
    beginImport(candidate.abc, sourceLabelForCandidate(candidate), candidate)
    setShowPicker(false)
    setPickerCandidates([])
  }
  applyRemoteRef.current = applyRemoteCandidate

  function handleResolverFailure(err, localResultCount) {
    if (isMediaResolverInfrastructureError(err)) {
      setResolverUnreachable(true)
      refreshMediaResolverHealth()
      setError(localResultCount > 0
        ? 'Online search is unavailable. Showing local collection matches below.'
        : 'Online search is unavailable. Try the external links below or start the local resolver.')
      return true
    }
    return false
  }

  function enqueueRemoteNotationSearch(queryText, activeSongType, forceLightweight) {
    if (!tuneId) {
      return Promise.reject(new Error('Tune id required for background notation search'))
    }
    lookup.startSearch({
      title: queryText,
      artist: currentTune && currentTune.composer ? currentTune.composer : '',
      tuneName: queryText,
      accessToken: token,
      options: { songType: activeSongType || songType },
      searchOptions: {
        resolverAvailable: forceLightweight ? false : (resolverChecked && resolverAvailable && !resolverUnreachable),
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      },
    })
  }

  async function runRemoteNotationSearch(queryText, activeSongType, signal, forceLightweight) {
    if (tuneId) {
      enqueueRemoteNotationSearch(queryText, activeSongType, forceLightweight)
      return
    }
    const result = await searchNotation({
      title: queryText,
      artist: currentTune && currentTune.composer ? currentTune.composer : '',
      songType: activeSongType || songType,
      accessToken: token,
      signal: signal,
      resolverAvailable: forceLightweight ? false : (resolverChecked && resolverAvailable && !resolverUnreachable),
      abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
      onProgress: mapRemoteProgress(updateProgress, 0.1, 0.9),
    })

    if (result.multiple && Array.isArray(result.candidates)) {
      if (result.candidates.length === 1) {
        applyRemoteCandidate(result.candidates[0])
      } else {
        setPickerCandidates(result.candidates)
        setShowPicker(true)
      }
      return
    }

    applyRemoteCandidate(result)
  }

  async function runUnifiedSearch(queryOverride, songTypeOverride) {
    const queryText = (queryOverride || filter || '').trim()
    const activeSongType = songTypeOverride || songType
    if (!queryText) return

    if (busy || lookup.busy) {
      cancelSearch()
      return
    }

    const generation = searchGenerationRef.current + 1
    searchGenerationRef.current = generation
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    setSettings(null)
    setShowPicker(false)
    setPickerCandidates([])
    updateProgress('Searching local collection...', 0.05, 'local')

    let localResultCount = 0
    let handedOffToQueue = false

    try {
      const results = await runLocalSearch(queryText)
      if (generation !== searchGenerationRef.current) return

      localResultCount = results.length
      applyLocalResults(results)
      updateProgress('Local search complete', 0.1, 'local')

      if (!useUnifiedSearch) {
        if (isStrongLocalMatch(queryText, results)) {
          return
        }
        await runRemoteNotationSearch(queryText, activeSongType, controller.signal, true)
        handedOffToQueue = !!tuneId
        return
      }

      if (isStrongLocalMatch(queryText, results)) {
        return
      }

      await runRemoteNotationSearch(queryText, activeSongType, controller.signal, false)
      handedOffToQueue = !!tuneId
    } catch (e) {
      if (generation !== searchGenerationRef.current) return
      if (isAbortError(e)) return
      if (handleResolverFailure(e, localResultCount)) {
        return
      }
      if (isNotationSearchEmptyError(e)) {
        if (localResultCount > 0) {
          setError('No notation found online. Showing local collection matches below.')
          return
        }
      }
      setError(e && e.message ? e.message : 'Search failed')
    } finally {
      if (generation === searchGenerationRef.current) {
        if (abortRef.current === controller) {
          abortRef.current = null
        }
        if (!handedOffToQueue) {
          setBusy(false)
          if (!showPicker) {
            setProgressMessage('')
          }
        } else {
          updateProgress('Searching online...', 0.2, 'remote')
        }
      }
    }
  }

  useEffect(function() {
    if (!lookup.busy) return
    setBusy(true)
    if (lookup.progressMessage) setProgressMessage(lookup.progressMessage)
    if (lookup.progressPercent) setProgressPercent(lookup.progressPercent)
  }, [lookup.busy, lookup.progressMessage, lookup.progressPercent])

  const filterChangeTimeout = useRef(null)
  function filterChange(e) {
    const next = e.target.value
    setFilter(next)
    if (!useUnifiedSearch) {
      if (next.trim() === '') {
        setOptions(defaultOptions())
      } else {
        if (filterChangeTimeout.current) clearTimeout(filterChangeTimeout.current)
        filterChangeTimeout.current = setTimeout(function() {
          runLocalSearch(next).then(function(results) {
            applyLocalResults(results)
          })
        }, 500)
      }
    }
    e.preventDefault()
    return false
  }

  useEffect(function() {
    if (!show) return
    const rhythm = currentTune && currentTune.rhythm ? currentTune.rhythm : ''
    const inferredSongType = inferSongTypeFromRhythm(rhythm)
    setSongType(inferredSongType)
    setSettings(null)
    setError('')
    setProgressMessage('')
    setProgressPercent(0)
    setShowPicker(false)
    setPickerCandidates([])
    setResolverUnreachable(false)

    const queryText = (filter || value || '').trim()
    if (!queryText) return
    runLocalSearch(queryText).then(function(results) {
      applyLocalResults(results)
    })
  }, [show])

  return (
    <>
      <Button onClick={handleShow} variant="primary" title="Search for notation">
        {props.tunebook.icons.search}
        {!narrow && <> Search</>}
      </Button>

      <Modal
        show={show}
        onHide={handleClose}
        size="lg"
        dialogClassName="local-search-selector-modal"
      >
        {settings !== null && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>Pick a setting</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <ListGroup style={{ clear: 'both', width: '100%' }}>
                {settings.map(function(setting, sk) {
                  const tune = props.tunebook.abcTools.abc2json(setting)
                  const useSetting = props.tunebook.abcTools.json2abc_cheatsheet(tune)
                  return (
                    <div key={sk}>
                      <Button
                        style={{ float: 'right' }}
                        onClick={function() { beginImport(setting, 'Import from collection') }}
                      >
                        Select
                      </Button>
                      <Abc abc={useSetting} tunebook={props.tunebook} />
                      <hr style={{ width: '100%' }} />
                    </div>
                  )
                })}
              </ListGroup>
            </Modal.Body>
          </>
        )}

        {settings === null && (
          <>
            <Modal.Header closeButton>
              <Modal.Title>{useUnifiedSearch ? 'Search for notation' : 'Search the collection'}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              {useUnifiedSearch ? (
                <>
                  <VoiceFillInput
                    type="text"
                    inputClassName="local-search-title-input"
                    value={filter}
                    onChange={filterChange}
                    placeholder="Tune title"
                    style={{ marginBottom: '0.75em' }}
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    token={props.token}
                    fieldKind="search"
                  />
                  <div style={{ display: 'flex', gap: '0.75em', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75em' }}>
                    <Form.Select
                      value={songType}
                      onChange={function(e) { setSongType(e.target.value) }}
                      style={{ flex: '1 1 12em', minWidth: '10em', maxWidth: '16em' }}
                      aria-label="Song type"
                    >
                      {SONG_TYPE_OPTIONS.map(function(option) {
                        return (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        )
                      })}
                    </Form.Select>
                    <Button
                      variant={busy ? 'warning' : 'primary'}
                      disabled={!normalizeSearchText(filter).trim()}
                      onClick={function() { runUnifiedSearch() }}
                    >
                      {busy ? 'Cancel' : 'Search'}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {(filter && filter.trim()) && (
                    <>
                      <ExternalSearchLinks filter={filter} tunebook={props.tunebook} />
                      <hr />
                    </>
                  )}
                  <VoiceFillInput
                    type="text"
                    inputClassName="local-search-title-input"
                    value={filter}
                    onChange={filterChange}
                    placeholder="Tune title"
                    setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
                    token={props.token}
                    fieldKind="search"
                  />
                </>
              )}

              <SearchProgressBar
                visible={busy}
                percent={progressPercent}
                message={progressMessage}
                defaultMessage="Searching..."
              />

              {error && (
                <div style={{ color: '#a94442', marginTop: '0.75em' }}>{error}</div>
              )}

              {(useUnifiedSearch && (resolverUnreachable || error)) && (
                <ExternalSearchLinks filter={filter} tunebook={props.tunebook} />
              )}
            </Modal.Body>

            <Modal.Footer>
              <ListGroup style={{ clear: 'both', width: '100%' }}>
                {Object.keys(options).map(function(option, tk) {
                  return (
                    <ListGroup.Item
                      key={option}
                      style={scores[tk] === true ? { borderTop: '3px solid black' } : {}}
                      className={(tk % 2 === 0) ? 'even' : 'odd'}
                      onClick={function() { selectTune(option) }}
                    >
                      {options[option]}
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </Modal.Footer>
          </>
        )}
      </Modal>

      <SearchResultPickerModal
        show={showPicker}
        title="Choose ABC notation"
        items={pickerCandidates}
        fallbackTitle={filter}
        emptyMessage="No notation results available."
        onSelect={function(candidate) {
          const jobId = lookup.activeJob && lookup.activeJob.status === 'awaiting'
            ? lookup.activeJob.id
            : null
          applyRemoteCandidate(candidate, jobId)
        }}
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
        }}
      />

      <TuneImportFieldChooserModal
        show={pendingImport !== null}
        originalTune={props.currentTune}
        importedTune={pendingImport ? pendingImport.importedTune : null}
        sourceLabel={importSourceLabel}
        onlyDiffering={true}
        onClose={handleImportClose}
        onSave={handleImportSave}
      />
    </>
  )
}

export default LocalSearchSelectorModal
