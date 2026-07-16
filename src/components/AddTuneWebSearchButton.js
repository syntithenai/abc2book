import { useState, useRef } from 'react'
import { Alert, Button, ListGroup, Modal } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useAbcjsParser from '../useAbcjsParser'
import { useIsNarrowViewport } from '../useMediaQuery'
import { isMediaResolverInfrastructureError, isNotationSearchEmptyError } from '../mediaProxyClient'
import { isAbortError } from '../abortUtils'
import { searchNotation } from '../notationSearchClient'
import { searchChords } from '../chordsSearchClient'
import { searchLyrics } from '../lyricsSearchClient'
import { researchTuneBackground } from '../tuneBackgroundResearchClient'
import {
  formatLocalSearchLabel,
  inferNotationSongType,
  isStrongLocalMatch,
} from '../textSearchIndexUtils'
import { importedTuneFromNotationCandidate } from '../notationImportUtils'
import Abc from './Abc'
import SearchProgressBar from './SearchProgressBar'
import SearchResultPickerModal from './SearchResultPickerModal'
import TuneImportFieldChooserModal from './TuneImportFieldChooserModal'
import { maybeOfferGenreFromSearchResult } from '../genreSideSuggestions'

export default function AddTuneWebSearchButton({
  title,
  artist,
  rhythm,
  currentGenre,
  onGenreAccept,
  lyrics,
  token,
  tunebook,
  currentTune,
  searchIndex,
  loadTuneTexts,
  onTuneImported,
  onLyrics,
  onChordsMerged,
  onBackgroundInfo,
  disabled,
}) {
  const narrow = useIsNarrowViewport()
  const { available: resolverAvailable, checked: resolverChecked, refreshMediaResolverHealth, features } = useMediaResolverHealth()
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [progressMessage, setProgressMessage] = useState('')
  const [progressPercent, setProgressPercent] = useState(0)
  const [pickerCandidates, setPickerCandidates] = useState([])
  const [showPicker, setShowPicker] = useState(false)
  const [pendingImport, setPendingImport] = useState(null)
  const [localResults, setLocalResults] = useState([])
  const [showLocalPicker, setShowLocalPicker] = useState(false)
  const [localSettings, setLocalSettings] = useState(null)
  const [auxPicker, setAuxPicker] = useState(null)
  const skipSupplementaryOnPickerCloseRef = useRef(false)
  const abortRef = useRef(null)

  function beginJob() {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    return controller
  }

  function cancelJob() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setBusy(false)
    setProgressMessage('')
    setProgressPercent(0)
  }

  function finishJob(controller) {
    if (abortRef.current === controller) {
      abortRef.current = null
    }
    setBusy(false)
    setProgressMessage('')
  }

  async function startSupplementarySearches(searchTitle, searchArtist, notationMiss) {
    const controller = beginJob()
    setBusy(true)
    setError('')
    try {
      await runSupplementarySearches(searchTitle, searchArtist, notationMiss, controller.signal)
    } finally {
      finishJob(controller)
    }
  }

  function isAuthSearchError(error) {
    const message = error && error.message ? String(error.message) : ''
    return message.indexOf('Media proxy error 401') >= 0
      || message.indexOf('Media proxy error 403') >= 0
      || message.indexOf('Missing Authorization') >= 0
  }

  function promptSearchPicker(pickerTitle, candidates) {
    return new Promise(function(resolve) {
      setAuxPicker({
        title: pickerTitle,
        candidates: candidates,
        resolve: resolve,
      })
    })
  }

  async function resolveSearchWithPicker(result, pickerTitle) {
    if (!result || !result.multiple || !Array.isArray(result.candidates)) {
      return result
    }
    if (result.candidates.length === 0) {
      throw new Error('No results')
    }
    if (result.candidates.length === 1) {
      return result.candidates[0]
    }
    return promptSearchPicker(pickerTitle, result.candidates)
  }

  function handleAuxPickerSelect(candidate) {
    if (auxPicker && typeof auxPicker.resolve === 'function') {
      auxPicker.resolve(candidate)
    }
    setAuxPicker(null)
  }

  function handleAuxPickerHide() {
    if (auxPicker && typeof auxPicker.resolve === 'function') {
      auxPicker.resolve(null)
    }
    setAuxPicker(null)
  }

  function updateProgress(message, progress) {
    setProgressMessage(message || '')
    if (typeof progress === 'number' && Number.isFinite(progress)) {
      setProgressPercent(Math.max(0, Math.min(100, Math.round(progress * 100))))
    }
  }

  function maybeSuggestGenre(result, extras) {
    maybeOfferGenreFromSearchResult({
      result: result,
      title: title,
      artist: artist,
      rhythm: rhythm,
      currentGenre: currentGenre,
      onGenreAccept: onGenreAccept,
      extras: extras,
    })
  }

  function beginFieldChooser(abcText, sourceLabel, candidate) {
    skipSupplementaryOnPickerCloseRef.current = true
    const importedTune = candidate
      ? importedTuneFromNotationCandidate(tunebook.abcTools, abcText, candidate)
      : tunebook.abcTools.abc2json(abcText)
    setPendingImport({
      importedTune: importedTune,
      previewAbc: abcText,
      sourceLabel: sourceLabel || 'Import from search',
    })
    maybeSuggestGenre(candidate || {}, {
      abc: abcText,
      tuneMeta: candidate && candidate.tuneMeta ? candidate.tuneMeta : null,
      source: candidate && candidate.source ? candidate.source : '',
      sourceUrl: candidate && candidate.sourceUrl ? candidate.sourceUrl : '',
    })
  }

  function runLocalSearch(queryText) {
    return new Promise(function(resolve) {
      if (!searchIndex) {
        resolve([])
        return
      }
      searchIndex(queryText, function(searchRes) {
        resolve(Array.isArray(searchRes) ? searchRes : [])
      })
    })
  }

  async function selectLocalResult(result) {
    if (!result || !loadTuneTexts || !Array.isArray(result.ids)) return
    updateProgress('Loading notation...', 0.15)
    const settings = await loadTuneTexts(result.ids)
    if (!settings || settings.length === 0) {
      throw new Error('No notation settings found for that match.')
    }
    if (settings.length === 1) {
      beginFieldChooser(settings[0], 'Import from collection')
      return
    }
    setLocalSettings(settings)
  }

  async function runLyricsAndChords(searchTitle, searchArtist, signal) {
    await refreshMediaResolverHealth()
    updateProgress('Searching for chords...', 0.55)
    let chordText = ''
    let lyricLines = []

    try {
      const chordRaw = await searchChords({
        title: searchTitle,
        artist: searchArtist || '',
        accessToken: token,
        signal: signal,
        resolverAvailable: resolverAvailable,
        abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
        renderChords: function(abc) { return abcjsParser.renderChords(abc, true) },
        onProgress: function(message, progress) {
          const scaled = 0.55 + ((typeof progress === 'number' ? progress : 0) * 0.25)
          updateProgress(message || 'Searching for chords...', scaled)
        },
      })
      const chordResult = await resolveSearchWithPicker(chordRaw, 'Choose chord sheet')
      if (chordResult) {
        chordText = chordResult.chordText || ''
        lyricLines = Array.isArray(chordResult.lyricLines) ? chordResult.lyricLines : []
        maybeSuggestGenre(chordResult)
      }
    } catch (chordError) {
      if (isAbortError(chordError)) throw chordError
      if (isAuthSearchError(chordError)) {
        throw chordError
      }
      updateProgress('Searching for lyrics...', 0.75)
      try {
        const lyricRaw = await searchLyrics({
          title: searchTitle,
          artist: searchArtist || '',
          accessToken: token,
          signal: signal,
          resolverAvailable: resolverAvailable,
          abcTools: tunebook && tunebook.abcTools ? tunebook.abcTools : null,
          onProgress: function(message, progress) {
            const scaled = 0.75 + ((typeof progress === 'number' ? progress : 0) * 0.2)
            updateProgress(message || 'Searching for lyrics...', scaled)
          },
        })
        const lyricResult = await resolveSearchWithPicker(lyricRaw, 'Choose lyrics version')
        if (lyricResult) {
          lyricLines = Array.isArray(lyricResult.lines)
            ? lyricResult.lines
            : String(lyricResult.text || '').replace(/\r\n/g, '\n').split('\n')
          maybeSuggestGenre(lyricResult)
        }
      } catch (lyricError) {
        if (isAbortError(lyricError)) throw lyricError
        if (isMediaResolverInfrastructureError(lyricError)) {
          refreshMediaResolverHealth()
          return { lyricText: '', chordText: '' }
        }
        if (isAuthSearchError(lyricError)) {
          throw lyricError
        }
        return { lyricText: '', chordText: '' }
      }
    }

    const lyricText = lyricLines.join('\n')
    if (lyricText && typeof onLyrics === 'function') {
      onLyrics(lyricText)
    }
    if (chordText.trim() && typeof onChordsMerged === 'function') {
      onChordsMerged(chordText)
    }
    updateProgress('Search complete', 0.9)
    return { lyricText: lyricText, chordText: chordText }
  }

  async function runSupplementarySearches(searchTitle, searchArtist, notationMiss, signal) {
    setError('')
    let researchLyrics = lyrics || ''
    let gotLyricsOrChords = false
    try {
      const lyricsResult = await runLyricsAndChords(searchTitle, searchArtist, signal)
      if (lyricsResult && (lyricsResult.lyricText || lyricsResult.chordText)) {
        gotLyricsOrChords = true
      }
      if (lyricsResult && lyricsResult.lyricText) {
        researchLyrics = lyricsResult.lyricText
      }
      await runBackgroundResearch(searchTitle, searchArtist, researchLyrics, signal)
    } catch (e) {
      if (isAbortError(e)) return
      if (isAuthSearchError(e)) {
        setError(e.message + ' Sign in with Google to search for chords and lyrics.')
      } else if (!isMediaResolverInfrastructureError(e)) {
        setError(e && e.message ? e.message : 'Search failed')
      } else {
        refreshMediaResolverHealth()
      }
      try {
        await runBackgroundResearch(searchTitle, searchArtist, researchLyrics, signal)
      } catch (backgroundError) {
        if (isAbortError(backgroundError)) return
        if (!isMediaResolverInfrastructureError(backgroundError) && !isAuthSearchError(backgroundError)) {
          setError(backgroundError && backgroundError.message ? backgroundError.message : 'Background research failed')
        }
      }
    } finally {
      if (notationMiss && !gotLyricsOrChords && !(signal && signal.aborted)) {
        setError(notationMiss)
      }
    }
  }

  async function runBackgroundResearch(researchTitle, researchArtist, researchLyrics, signal) {
    if (typeof onBackgroundInfo !== 'function' || !features.llm) return
    await refreshMediaResolverHealth()
    updateProgress('Researching background information...', 0.92)
    const existingBackground = currentTune && typeof currentTune.backgroundInfo === 'string'
      ? currentTune.backgroundInfo
      : ''
    const result = await researchTuneBackground({
      title: researchTitle,
      artist: researchArtist || '',
      lyrics: researchLyrics || '',
      backgroundInfo: existingBackground,
      accessToken: token,
      signal: signal,
      onProgress: function(message, progress) {
        const scaled = 0.92 + ((typeof progress === 'number' ? progress : 0) * 0.08)
        updateProgress(message || 'Researching background information...', scaled)
      },
    })
    onBackgroundInfo(result)
    maybeSuggestGenre(result)
    updateProgress('Search complete', 1)
  }

  function notationSourceLabel(candidate) {
    const source = candidate && candidate.source ? String(candidate.source) : ''
    if (source === 'thesession.org') return 'Import from The Session'
    if (source) return 'Import from ' + source
    return 'Import from search'
  }

  async function runResolverNotationSearch(signal) {
    await refreshMediaResolverHealth()
    const songType = inferNotationSongType(rhythm || '', artist || '')
    const result = await searchNotation({
      title: title,
      artist: artist || '',
      songType: songType,
      accessToken: token,
      signal: signal,
      onProgress: function(message, progress) {
        const scaled = 0.1 + ((typeof progress === 'number' ? progress : 0) * 0.35)
        updateProgress(message || 'Searching online for notation...', scaled)
      },
    })

    if (result.multiple && Array.isArray(result.candidates)) {
      if (result.candidates.length === 1) {
        beginFieldChooser(
          result.candidates[0].abc,
          notationSourceLabel(result.candidates[0]),
          result.candidates[0]
        )
        return true
      }
      setPickerCandidates(result.candidates)
      setShowPicker(true)
      return true
    }

    if (result && result.abc) {
      beginFieldChooser(result.abc, notationSourceLabel(result), result)
      return true
    }
    return false
  }

  async function presentLocalResults(queryText, results) {
    if (!results || results.length === 0) {
      return false
    }
    if (results.length === 1 || isStrongLocalMatch(queryText, results)) {
      await selectLocalResult(results[0])
      return true
    }
    setShowLocalPicker(true)
    return true
  }

  async function run() {
    if (!title) return
    if (busy) {
      cancelJob()
      return
    }

    const controller = beginJob()
    setBusy(true)
    setError('')
    setProgressMessage('')
    setProgressPercent(0)
    setShowPicker(false)
    setPickerCandidates([])
    setShowLocalPicker(false)
    setLocalSettings(null)
    skipSupplementaryOnPickerCloseRef.current = false

    const queryText = String(title || '').trim()
    const signal = controller.signal

    try {
      updateProgress('Searching local collection...', 0.05)
      const results = await runLocalSearch(queryText)
      if (signal.aborted) return
      setLocalResults(results)

      if (isStrongLocalMatch(queryText, results)) {
        await presentLocalResults(queryText, results)
        return
      }

      if (resolverChecked && resolverAvailable) {
        try {
          const foundOnline = await runResolverNotationSearch(signal)
          if (signal.aborted) return
          if (foundOnline) {
            return
          }
        } catch (onlineError) {
          if (isAbortError(onlineError)) return
          if (!isMediaResolverInfrastructureError(onlineError)
              && !isNotationSearchEmptyError(onlineError)) {
            throw onlineError
          }
          refreshMediaResolverHealth()
        }
      }

      if (await presentLocalResults(queryText, results)) {
        return
      }

      await runSupplementarySearches(queryText, artist || '', 'No notation found in your collection or online.', signal)
    } catch (e) {
      if (isAbortError(e)) return
      if (isMediaResolverInfrastructureError(e) || isNotationSearchEmptyError(e)) {
        refreshMediaResolverHealth()
        const hadLocal = await presentLocalResults(queryText, await runLocalSearch(queryText))
        if (!hadLocal) {
          await runSupplementarySearches(
            queryText,
            artist || '',
            isNotationSearchEmptyError(e)
              ? 'No notation found online.'
              : (e && e.message ? e.message : 'Search failed'),
            signal
          )
        }
      } else {
        setError(e && e.message ? e.message : 'Search failed')
      }
    } finally {
      finishJob(controller)
    }
  }

  function handleRemotePickerSelect(candidate) {
    setShowPicker(false)
    setPickerCandidates([])
    if (candidate && candidate.abc) {
      beginFieldChooser(candidate.abc, notationSourceLabel(candidate), candidate)
    }
  }

  function handleSkipNotation() {
    skipSupplementaryOnPickerCloseRef.current = true
    setShowPicker(false)
    setPickerCandidates([])
    startSupplementarySearches(title, artist || '', 'No notation selected.')
  }

  async function handleLocalPickerSelect(result) {
    setShowLocalPicker(false)
    try {
      await selectLocalResult(result)
    } catch (e) {
      setError(e && e.message ? e.message : 'Could not load notation')
      setBusy(false)
      setProgressMessage('')
    }
  }

  async function handleImportSave(mergedTune) {
    setPendingImport(null)
    if (typeof onTuneImported === 'function') {
      onTuneImported(mergedTune)
    }
    await startSupplementarySearches(mergedTune.name || title, mergedTune.composer || artist || '', '')
  }

  function handleImportClose() {
    setPendingImport(null)
    startSupplementarySearches(title, artist || '', '')
  }

  const label = busy ? 'Cancel' : 'Search'

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <Button
        variant={busy ? 'warning' : 'primary'}
        disabled={!title || disabled}
        onClick={run}
        title={busy ? 'Cancel search' : 'Search online for notation, lyrics, chords, and background information'}
      >
        {tunebook.icons.search}
        {!narrow && <> {label}</>}
      </Button>
      <SearchProgressBar
        visible={busy}
        percent={progressPercent}
        message={progressMessage}
        defaultMessage="Searching..."
      />
      {error && (
        <Alert variant="danger" style={{ marginTop: '0.5em', maxWidth: '28em' }}>{error}</Alert>
      )}

      <Modal show={showLocalPicker} onHide={function() {
        setShowLocalPicker(false)
        if (!skipSupplementaryOnPickerCloseRef.current) {
          startSupplementarySearches(title, artist || '', 'No notation found in your collection.')
        }
        skipSupplementaryOnPickerCloseRef.current = false
      }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Choose a local match</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <ListGroup variant="flush">
            {localResults.map(function(result, index) {
              return (
                <ListGroup.Item
                  key={(result.ids && result.ids.join(',')) || index}
                  action
                  onClick={function() { handleLocalPickerSelect(result) }}
                >
                  {formatLocalSearchLabel(result)}
                </ListGroup.Item>
              )
            })}
          </ListGroup>
          <div style={{ marginTop: '0.75em' }}>
            <Button
              variant="outline-primary"
              size="sm"
              disabled={busy}
              onClick={async function() {
                setShowLocalPicker(false)
                const controller = beginJob()
                setBusy(true)
                setError('')
                try {
                  const foundOnline = await runResolverNotationSearch(controller.signal)
                  if (!foundOnline) {
                    await runSupplementarySearches(title, artist || '', 'No notation found online for this title.', controller.signal)
                  }
                } catch (e) {
                  if (!isAbortError(e)) {
                    setError(e && e.message ? e.message : 'Online search failed')
                  }
                } finally {
                  finishJob(controller)
                }
              }}
            >
              Search online instead
            </Button>
          </div>
        </Modal.Body>
      </Modal>

      <Modal show={localSettings !== null} onHide={function() {
        setLocalSettings(null)
        if (!skipSupplementaryOnPickerCloseRef.current) {
          startSupplementarySearches(title, artist || '', 'No notation setting selected.')
        }
        skipSupplementaryOnPickerCloseRef.current = false
      }} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>Pick a setting</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {Array.isArray(localSettings) && localSettings.map(function(setting, sk) {
            const tune = tunebook.abcTools.abc2json(setting)
            const useSetting = tunebook.abcTools.json2abc_cheatsheet(tune)
            return (
              <div key={sk}>
                <Button
                  style={{ float: 'right' }}
                  onClick={function() {
                    setLocalSettings(null)
                    beginFieldChooser(setting, 'Import from collection')
                  }}
                >
                  Select
                </Button>
                <Abc abc={useSetting} tunebook={tunebook} />
                <hr style={{ width: '100%' }} />
              </div>
            )
          })}
        </Modal.Body>
      </Modal>

      <SearchResultPickerModal
        show={showPicker}
        title="Choose ABC notation"
        items={pickerCandidates}
        fallbackTitle={title}
        emptyMessage="No notation results available."
        onSelect={handleRemotePickerSelect}
        onSkip={handleSkipNotation}
        skipLabel="Skip Notation"
        onHide={function() {
          setShowPicker(false)
          setPickerCandidates([])
          if (!skipSupplementaryOnPickerCloseRef.current) {
            startSupplementarySearches(title, artist || '', 'No notation selected.')
          }
          skipSupplementaryOnPickerCloseRef.current = false
        }}
      />

      <SearchResultPickerModal
        show={auxPicker !== null}
        title={auxPicker ? auxPicker.title : 'Choose a result'}
        items={auxPicker ? auxPicker.candidates : []}
        fallbackTitle={title}
        emptyMessage="No results available."
        onSelect={handleAuxPickerSelect}
        onHide={handleAuxPickerHide}
      />

      <TuneImportFieldChooserModal
        show={pendingImport !== null}
        originalTune={currentTune}
        importedTune={pendingImport ? pendingImport.importedTune : null}
        sourceLabel={pendingImport ? pendingImport.sourceLabel : 'Import from search'}
        onlyDiffering={true}
        onClose={handleImportClose}
        onSave={handleImportSave}
      />
    </div>
  )
}
