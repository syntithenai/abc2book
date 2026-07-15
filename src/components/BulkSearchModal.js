import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, ButtonGroup, Dropdown, Modal, Spinner } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { toast } from 'react-toastify'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue'
import useBulkComposerDiscoveryQueue from '../useBulkComposerDiscoveryQueue'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import useStemCreateQueue from '../useStemCreateQueue'
import { lyricLinesToText } from '../wLinesUtils'
import { requestTuneMediaAnalysis } from '../useTuneMediaAnalysis'
import { tuneHasAudioForFix } from '../bulkCheckFixActions'
import { useAutoLinkPlaybackRegionScan } from '../useAutoLinkPlaybackRegionScan'
import { isScannableLink } from '../linkPlaybackRegionScanUtils'
import { getMediaResolverHealthState } from '../mediaResolverHealthStore'
import BulkComposerDiscoveryModal from './BulkComposerDiscoveryModal'
import { capitalizeSongTitle, isSongTitleCapitalized } from '../titleCaseUtils'
import { primaryArtist } from '../tuneBibliographicUtils'

function formatPreviewSummary(preview) {
  const parts = []
  if (preview.willResearch > 0) {
    parts.push(preview.willResearch + ' to research')
  }
  if (preview.reasons['has-background'] > 0) {
    parts.push(preview.reasons['has-background'] + ' already have background info')
  }
  if (preview.reasons['no-title'] > 0) {
    parts.push(preview.reasons['no-title'] + ' missing a title')
  }
  return parts.join(' · ')
}

function ResolverStatusMessage({ checked, resolverAvailable, features, onRetry, retrying }) {
  if (!checked) {
    return (
      <div className="bulk-search-resolver-status">
        <Spinner animation="border" size="sm" role="status" className="me-2" />
        Checking media resolver…
      </div>
    )
  }

  if (!resolverAvailable) {
    return (
      <Alert variant="warning">
        <p style={{ marginBottom: '0.5em' }}>
          No media resolver is reachable. Set the resolver URL in{' '}
          <Link to="/settings">Settings</Link> (for example <code>http://localhost:8787</code>)
          and make sure it is running.
        </p>
        <Button variant="outline-primary" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Checking…' : 'Check again'}
        </Button>
      </Alert>
    )
  }

  if (!features.llm) {
    return (
      <Alert variant="warning">
        <p style={{ marginBottom: '0.5em' }}>
          The resolver is running, but the LLM for background research is not available.
          Start LM Studio (or your OpenAI-compatible LLM) and ensure the resolver can reach it.
        </p>
        <p style={{ marginBottom: '0.5em', fontSize: '0.95em' }}>
          If the resolver runs in Docker on Linux, LM Studio usually listens only on{' '}
          <code>127.0.0.1:1234</code>. Use the <code>llm-bridge</code> service in{' '}
          <code>local-resolver/docker-compose.yml</code> and set{' '}
          <code>RESEARCH_LLM_BASE_URL=http://host.docker.internal:12340/v1</code> in{' '}
          <code>local-resolver/.env</code>, then restart the resolver.
        </p>
        <p style={{ marginBottom: '0.75em', fontSize: '0.95em' }}>
          See <Link to="/help#media-resolver">Media resolver</Link> help for more detail.
        </p>
        <Button variant="outline-primary" size="sm" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Checking…' : 'Check again'}
        </Button>
      </Alert>
    )
  }

  return null
}

const FIELD_LOOKUP_LABELS = {
  lyrics: 'lyrics',
  chords: 'chords',
  notation: 'notation',
  composer: 'artist',
  links: 'link',
}

export default function BulkSearchModal({
  tunebook,
  selected,
  selectedCount,
  token,
  forceRefresh,
}) {
  const icons = tunebook.icons
  const [backgroundShow, setBackgroundShow] = useState(false)
  const [artistsShow, setArtistsShow] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const queue = useBulkBackgroundResearchQueue()
  const composerQueue = useBulkComposerDiscoveryQueue()
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const stemCreateQueue = useStemCreateQueue()
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
  const {
    available: resolverAvailable,
    checked,
    features,
    refreshMediaResolverHealth,
  } = useMediaResolverHealth()
  const canResearchBackground = resolverAvailable && features.llm

  const analysisDeps = useMemo(function() {
    const tunes = {}
    const selectedTunesList = tunebook.fromSelection(selected)
    selectedTunesList.forEach(function(tune) {
      if (tune && tune.id) tunes[tune.id] = tune
    })
    return {
      tunebook: tunebook,
      tunes: tunes,
      token: token,
      forceRefresh: forceRefresh,
      accessToken: token && token.access_token ? token.access_token : token,
    }
  }, [tunebook, selected, token, forceRefresh])

  useEffect(function() {
    if (!backgroundShow) return
    refreshMediaResolverHealth()
  }, [backgroundShow, refreshMediaResolverHealth])

  function selectedTunes() {
    return tunebook.fromSelection(selected)
  }

  function accessToken() {
    return token && token.access_token ? token.access_token : null
  }

  function preview() {
    return queue.previewEnqueueTunes(selectedTunes())
  }

  function handleBackgroundClose() {
    setBackgroundShow(false)
  }

  function handleBackgroundStart() {
    const tunes = selectedTunes()
    queue.enqueueTunes(tunes, {
      accessToken: accessToken(),
      lyricsForTune: lyricLinesToText,
    })
    queue.start()
    setBackgroundShow(false)
  }

  async function handleRetryHealth() {
    setRetrying(true)
    try {
      await refreshMediaResolverHealth()
    } finally {
      setRetrying(false)
    }
  }

  function enqueueFieldLookups(kinds) {
    const tunes = selectedTunes()
    const tokenValue = accessToken()
    let queued = 0
    let skippedNoTitle = 0
    kinds.forEach(function(kind) {
      tunes.forEach(function(tune) {
        const title = tune && tune.name ? String(tune.name).trim() : ''
        if (!title) {
          skippedNoTitle += 1
          return
        }
        const id = fieldLookupQueue.enqueueLookup({
          tuneId: tune.id,
          kind: kind,
          title: title,
          artist: primaryArtist(tune),
          tuneName: title,
          accessToken: tokenValue,
          options: kind === 'links' ? { alwaysPick: true } : undefined,
          searchOptions: {
            resolverAvailable: checked ? resolverAvailable : undefined,
            abcTools: tunebook.abcTools || null,
            isYoutubeLink: tunebook.utils && tunebook.utils.isYoutubeLink
              ? tunebook.utils.isYoutubeLink
              : null,
          },
        })
        if (id) queued += 1
      })
    })
    if (queued > 0) {
      const kindLabels = kinds.map(function(kind) {
        return FIELD_LOOKUP_LABELS[kind] || kind
      }).join(', ')
      toast.success(
        'Queued ' + queued + ' ' + kindLabels + ' search' + (queued === 1 ? '' : 'es')
        + '. Review choices in Review or Settings → Background jobs → Active searches.'
      )
    } else {
      toast.info(
        skippedNoTitle > 0
          ? 'No searches queued — selected tunes need a title.'
          : 'No new searches queued (duplicates may already be running).'
      )
    }
  }

  function handleAudioAnalysis() {
    const tunes = selectedTunes()
    let started = 0
    let skippedNoAudio = 0
    tunes.forEach(function(tune) {
      if (!tuneHasAudioForFix(tune, tunebook)) {
        skippedNoAudio += 1
        return
      }
      requestTuneMediaAnalysis(analysisDeps, tune.id, {
        tune: tune,
        force: true,
      })
      started += 1
    })
    if (started > 0) {
      toast.success(
        'Started audio analysis for ' + started + ' tune' + (started === 1 ? '' : 's')
        + ' (tempo, key, notation, chords, lyrics). Progress is in Settings → Background jobs → Media analysis.'
      )
    } else {
      toast.info(
        skippedNoAudio > 0
          ? 'No linked audio found on the selected tunes.'
          : 'No audio analysis jobs started.'
      )
    }
  }

  function handleStems() {
    const tunes = selectedTunes()
    const health = getMediaResolverHealthState()
    const ids = stemCreateQueue.enqueueTunesStemCreateJobs(tunes, {
      utils: tunebook.utils,
      accessToken: accessToken(),
      demucsModel: health.status && health.status.demucsModel ? health.status.demucsModel : 'htdemucs',
    })
    stemCreateQueue.start()
    const count = Array.isArray(ids) ? ids.length : (ids ? 1 : 0)
    if (count > 0) {
      toast.success('Queued stems for ' + count + ' tune' + (count === 1 ? '' : 's') + '.')
    } else {
      toast.info('No stems queued — selected tunes need a playable link.')
    }
  }

  function handlePlaybackRegions() {
    const tunes = selectedTunes()
    let started = 0
    let skipped = 0
    tunes.forEach(function(tune) {
      const links = Array.isArray(tune.links) ? tune.links : []
      let tuneStarted = false
      links.forEach(function(link, linkIndex) {
        const url = link && link.link ? String(link.link).trim() : ''
        if (!isScannableLink(url)) return
        maybeAutoScan(tune.id, linkIndex, link, {
          force: true,
          currentLinks: links,
        })
        started += 1
        tuneStarted = true
      })
      if (!tuneStarted) skipped += 1
    })
    if (started > 0) {
      toast.success(
        'Started playback region scan for ' + started + ' link' + (started === 1 ? '' : 's')
        + '. Progress is in Settings → Background jobs → Playback scans.'
      )
    } else {
      toast.info(
        skipped > 0
          ? 'No scannable links found on the selected tunes.'
          : 'No playback region scans started.'
      )
    }
  }

  function handleAllWebLookups() {
    const tunes = selectedTunes()
    let capitalized = 0
    tunes.forEach(function(tune) {
      if (!tune || !tune.id || !tune.name) return
      if (isSongTitleCapitalized(tune.name)) return
      const next = Object.assign({}, tune, { name: capitalizeSongTitle(tune.name) })
      tunebook.saveTune(next, false, { historyLabel: 'Capitalise title', immediate: true })
      capitalized += 1
    })
    if (capitalized > 0) {
      toast.success(
        'Capitalised ' + capitalized + ' title' + (capitalized === 1 ? '' : 's') + '.'
      )
    }
    enqueueFieldLookups(['lyrics', 'chords', 'notation', 'links'])
    const discoveryPreview = composerQueue.previewEnqueueTunes(tunes)
    if (discoveryPreview.willDiscover > 0) {
      composerQueue.enqueueTunes(tunes, {
        accessToken: accessToken(),
      })
      composerQueue.start()
      toast.success(
        'Queued artist discovery for ' + discoveryPreview.willDiscover
        + ' tune' + (discoveryPreview.willDiscover === 1 ? '' : 's') + '.'
      )
    }
    setBackgroundShow(true)
  }

  const previewSummary = backgroundShow && canResearchBackground ? preview() : null
  const statusMessage = backgroundShow && !canResearchBackground
    ? (
      <ResolverStatusMessage
        checked={checked}
        resolverAvailable={resolverAvailable}
        features={features}
        onRetry={handleRetryHealth}
        retrying={retrying}
      />
    )
    : null

  return (
    <>
      <Dropdown as={ButtonGroup} className="bulk-ops-search-dropdown">
        <Dropdown.Toggle
          variant="warning"
          className="bulk-ops-action-btn"
          id="bulk-ops-enhance"
          aria-label="Enhance selected tunes"
          title="Enhance selected tunes"
        >
          {icons.search}
          <span className="bulk-ops-btn-label"> Enhance</span>
        </Dropdown.Toggle>
        <Dropdown.Menu>
          <Dropdown.Item onClick={function() { setArtistsShow(true) }}>
            Artist
          </Dropdown.Item>
          <Dropdown.Item onClick={function() { enqueueFieldLookups(['lyrics']) }}>
            Lyrics
          </Dropdown.Item>
          <Dropdown.Item onClick={function() { enqueueFieldLookups(['chords']) }}>
            Chords
          </Dropdown.Item>
          <Dropdown.Item onClick={function() { enqueueFieldLookups(['chords', 'lyrics']) }}>
            Chords and lyrics
          </Dropdown.Item>
          <Dropdown.Item onClick={function() { enqueueFieldLookups(['notation']) }}>
            Notation
          </Dropdown.Item>
          <Dropdown.Item onClick={function() { setBackgroundShow(true) }}>
            Background info
          </Dropdown.Item>
          <Dropdown.Item onClick={function() { enqueueFieldLookups(['links']) }}>
            Links
            <span className="bulk-ops-search-item-hint">check links, suggest YouTube when empty or invalid</span>
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={handleAudioAnalysis}>
            Audio analysis
            <span className="bulk-ops-search-item-hint">tempo, key, notation, chords, lyrics</span>
          </Dropdown.Item>
          <Dropdown.Item onClick={handlePlaybackRegions}>
            Playback regions
          </Dropdown.Item>
          <Dropdown.Item onClick={handleStems}>
            Stems
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item onClick={handleAllWebLookups}>
            All web lookups
            <span className="bulk-ops-search-item-hint">artist, lyrics, chords, notation, links, background</span>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <BulkComposerDiscoveryModal
        tunebook={tunebook}
        selected={selected}
        selectedCount={selectedCount}
        token={token}
        show={artistsShow}
        onHide={function() { setArtistsShow(false) }}
        hideTrigger
      />

      <Modal
        show={backgroundShow}
        onHide={handleBackgroundClose}
        size="xl"
        scrollable
        className="bulk-search-modal"
        backdropClassName="bulk-search-backdrop"
        dialogClassName="bulk-search-modal-dialog"
        contentClassName="bulk-search-modal-content"
      >
        <Modal.Header closeButton>
          <Modal.Title>Search background for {selectedCount} selected tune{selectedCount === 1 ? '' : 's'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {statusMessage}
          {canResearchBackground && (
            <>
              <p>
                Research background information for selected tunes using web search and AI summarization.
                Tunes that already have background info are skipped.
              </p>
              {previewSummary && (
                <p className="text-muted" style={{ marginBottom: 0 }}>
                  {formatPreviewSummary(previewSummary) || 'No tunes eligible for research.'}
                </p>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleBackgroundClose}>Cancel</Button>
          {canResearchBackground && (
            <Button
              variant="primary"
              disabled={!previewSummary || previewSummary.willResearch === 0}
              onClick={handleBackgroundStart}
            >
              Start research
            </Button>
          )}
        </Modal.Footer>
      </Modal>
    </>
  )
}
