import { useEffect, useRef, useState } from 'react'
import { Button, Form, InputGroup, Modal } from 'react-bootstrap'
import YouTube from 'react-youtube'
import LinkPlaybackRegionScanControls from './LinkPlaybackRegionScanControls'
import { FormLabelWithHelp } from './FormFieldHelp'
import { LINKS_FIELD_HELP } from '../formFieldHelpText'
import { getLinkSrcType } from '../checkTuneLinkPlayback'
import { fetchDirectOrProxy } from '../mediaProxyClient'
import {
  isOwnedMediaLinkUri,
  resolveRecordingLinkAudio,
} from '../linkRecording'
import useGoogleDocument from '../useGoogleDocument'
import './LinkPlayRangeModal.css'

const YT_PLAYING = 1
const YT_PAUSED = 2
const YT_ENDED = 0

function parseBoundarySeconds(value) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  if (!trimmed) return null
  const parsed = parseFloat(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function formatBoundarySeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const rounded = Math.round(seconds * 100) / 100
  return String(rounded)
}

function formatClock(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0))
  const minutes = Math.floor(total / 60)
  const remainder = total % 60
  return minutes + ':' + String(remainder).padStart(2, '0')
}

function DualRangeSlider({ duration, startSeconds, endSeconds, onChangeStart, onChangeEnd, onSeek, disabled }) {
  const trackRef = useRef(null)
  const activeThumbRef = useRef(null)
  const startRef = useRef(0)
  const endRef = useRef(0)

  const max = duration > 0 ? duration : 1
  const start = Math.max(0, Math.min(max, startSeconds != null ? startSeconds : 0))
  const end = Math.max(start, Math.min(max, endSeconds != null ? endSeconds : max))
  startRef.current = start
  endRef.current = end
  const startPct = (start / max) * 100
  const endPct = (end / max) * 100
  const inactive = disabled || !(duration > 0)

  function commitStart(raw) {
    const next = parseFloat(raw)
    if (!Number.isFinite(next)) return
    const clamped = Math.max(0, Math.min(next, endRef.current))
    onChangeStart(clamped)
    if (onSeek) onSeek(clamped)
  }

  function commitEnd(raw) {
    const next = parseFloat(raw)
    if (!Number.isFinite(next)) return
    const clamped = Math.min(max, Math.max(next, startRef.current))
    onChangeEnd(clamped)
    if (onSeek) onSeek(clamped)
  }

  function valueFromClientX(clientX) {
    const el = trackRef.current
    if (!el) return 0
    const rect = el.getBoundingClientRect()
    if (!(rect.width > 0)) return 0
    const ratio = (clientX - rect.left) / rect.width
    return Math.max(0, Math.min(max, ratio * max))
  }

  function applyClosest(value) {
    const distStart = Math.abs(value - startRef.current)
    const distEnd = Math.abs(value - endRef.current)
    if (distStart <= distEnd) {
      activeThumbRef.current = 'start'
      commitStart(value)
    } else {
      activeThumbRef.current = 'end'
      commitEnd(value)
    }
  }

  function handleTrackPointerDown(e) {
    if (inactive) return
    if (e.button != null && e.button !== 0) return
    e.preventDefault()
    applyClosest(valueFromClientX(e.clientX))
    if (e.currentTarget.setPointerCapture) {
      e.currentTarget.setPointerCapture(e.pointerId)
    }
  }

  function handleTrackPointerMove(e) {
    if (inactive || !activeThumbRef.current) return
    const value = valueFromClientX(e.clientX)
    if (activeThumbRef.current === 'start') commitStart(value)
    else commitEnd(value)
  }

  function handleTrackPointerUp() {
    activeThumbRef.current = null
  }

  return (
    <div
      ref={trackRef}
      className="link-play-range-dual"
      aria-disabled={inactive}
      onPointerDown={handleTrackPointerDown}
      onPointerMove={handleTrackPointerMove}
      onPointerUp={handleTrackPointerUp}
      onPointerCancel={handleTrackPointerUp}
    >
      <div className="link-play-range-dual__track">
        <div
          className="link-play-range-dual__active"
          style={{ left: startPct + '%', width: Math.max(0, endPct - startPct) + '%' }}
        />
      </div>
      <button
        type="button"
        className="link-play-range-dual__thumb link-play-range-dual__thumb--start"
        style={{ left: startPct + '%' }}
        disabled={inactive}
        aria-label="Play range start"
        onPointerDown={function(e) {
          if (inactive) return
          e.stopPropagation()
          activeThumbRef.current = 'start'
          if (onSeek) onSeek(startRef.current)
          if (e.currentTarget.parentElement && e.currentTarget.parentElement.setPointerCapture) {
            e.currentTarget.parentElement.setPointerCapture(e.pointerId)
          }
        }}
      />
      <button
        type="button"
        className="link-play-range-dual__thumb link-play-range-dual__thumb--end"
        style={{ left: endPct + '%' }}
        disabled={inactive}
        aria-label="Play range end"
        onPointerDown={function(e) {
          if (inactive) return
          e.stopPropagation()
          activeThumbRef.current = 'end'
          if (onSeek) onSeek(endRef.current)
          if (e.currentTarget.parentElement && e.currentTarget.parentElement.setPointerCapture) {
            e.currentTarget.parentElement.setPointerCapture(e.pointerId)
          }
        }}
      />
    </div>
  )
}

export default function LinkPlayRangeModal({
  show,
  onHide,
  link,
  linkIndex,
  links,
  onLinksUpdated,
  tune,
  tunebook,
  token,
  icons,
}) {
  const driveDocs = useGoogleDocument(token, function() {})
  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink
  const youtubeGetId = tunebook && tunebook.utils && tunebook.utils.YouTubeGetID

  const audioRef = useRef(null)
  const youtubePlayerRef = useRef(null)
  const blobUrlRef = useRef(null)
  const pollRef = useRef(null)

  const [warning, setWarning] = useState('')
  const [loading, setLoading] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioSrc, setAudioSrc] = useState(null)
  const [youtubeVideoId, setYoutubeVideoId] = useState(null)

  const srcType = getLinkSrcType(link, isYoutubeLink)
  const isYoutube = srcType === 'youtube'
  const isAudioLike = srcType === 'audio' || srcType === 'recording'
  const canPreview = isYoutube || isAudioLike

  const startSeconds = parseBoundarySeconds(link && link.startAt)
  const endSeconds = parseBoundarySeconds(link && link.endAt)

  function clearBlobUrl() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }

  function stopPoll() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function stopPlayback() {
    stopPoll()
    const audio = audioRef.current
    if (audio) {
      try {
        audio.pause()
      } catch (e) {}
    }
    const player = youtubePlayerRef.current
    if (player) {
      try {
        player.pauseVideo()
      } catch (e) {}
    }
    setPlaying(false)
  }

  function resetMediaState() {
    stopPlayback()
    youtubePlayerRef.current = null
    clearBlobUrl()
    setAudioSrc(null)
    setYoutubeVideoId(null)
    setDuration(0)
    setCurrentTime(0)
    setWarning('')
    setLoading(false)
  }

  function updateLinkFields(changes) {
    if (!Array.isArray(links) || linkIndex == null || !links[linkIndex]) return
    const next = links.map(function(item, idx) {
      if (idx !== linkIndex) return item
      return Object.assign({}, item, changes)
    })
    onLinksUpdated(next)
  }

  function setStartFromSeconds(seconds) {
    updateLinkFields({ startAt: formatBoundarySeconds(seconds) })
  }

  function setEndFromSeconds(seconds) {
    updateLinkFields({ endAt: formatBoundarySeconds(seconds) })
  }

  function getPlayheadSeconds() {
    if (isYoutube && youtubePlayerRef.current) {
      try {
        return youtubePlayerRef.current.getCurrentTime() || 0
      } catch (e) {
        return currentTime
      }
    }
    const audio = audioRef.current
    if (audio) return audio.currentTime || 0
    return currentTime
  }

  function startTimePoll() {
    stopPoll()
    pollRef.current = setInterval(function() {
      const now = getPlayheadSeconds()
      setCurrentTime(now)
      if (isYoutube && youtubePlayerRef.current) {
        try {
          const dur = youtubePlayerRef.current.getDuration()
          if (dur > 0) setDuration(dur)
        } catch (e) {}
      }
    }, 200)
  }

  async function resolveAudioSrc(mediaLink, options) {
    const src = String(mediaLink.link).trim()
    const type = getLinkSrcType(mediaLink, isYoutubeLink)
    if (type === 'recording') {
      const tuneId = tune && tune.id
      if (!tuneId) {
        throw new Error('Save the tune before previewing recordings.')
      }
      const resolved = await resolveRecordingLinkAudio(mediaLink, tuneId, linkIndex, {
        accessToken: token,
        driveApi: driveDocs,
        forPlayback: true,
      })
      if (!resolved || !resolved.blob) {
        throw new Error('Recording is not available for preview.')
      }
      clearBlobUrl()
      const blobUrl = URL.createObjectURL(resolved.blob)
      blobUrlRef.current = blobUrl
      return blobUrl
    }
    if (src.indexOf('data:audio/') === 0 || isOwnedMediaLinkUri(src) || src.indexOf('blob:') === 0) {
      return src
    }
    if (!options || !options.forceFetch) {
      return src
    }
    const response = await fetchDirectOrProxy({
      src: src,
      srcType: type,
      youtubeGetId: youtubeGetId,
      accessToken: token,
    }).then(function(result) { return result.response })
    const blob = await response.blob()
    clearBlobUrl()
    const blobUrl = URL.createObjectURL(blob)
    blobUrlRef.current = blobUrl
    return blobUrl
  }

  useEffect(function() {
    if (!show) {
      resetMediaState()
      return undefined
    }

    let cancelled = false

    async function loadPreview() {
      if (!link || !link.link || !String(link.link).trim()) {
        setWarning('Enter a media link first.')
        return
      }
      if (!canPreview) {
        setWarning('This link type cannot be previewed.')
        return
      }

      setLoading(true)
      setWarning('')
      setPlaying(false)
      setCurrentTime(0)
      setDuration(0)

      try {
        if (isYoutube) {
          const videoId = youtubeGetId ? youtubeGetId(String(link.link).trim()) : null
          if (!videoId) throw new Error('Invalid YouTube link.')
          if (!cancelled) {
            setAudioSrc(null)
            setYoutubeVideoId(videoId)
          }
        } else {
          const src = await resolveAudioSrc(link)
          if (!cancelled) {
            setYoutubeVideoId(null)
            setAudioSrc(src)
          }
        }
      } catch (e) {
        if (!cancelled) {
          setWarning(e && e.message ? e.message : 'Could not load preview.')
          setAudioSrc(null)
          setYoutubeVideoId(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPreview()

    return function() {
      cancelled = true
      stopPlayback()
      clearBlobUrl()
    }
    // Intentionally re-run when the modal opens or the link URL/type changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, link && link.link, srcType, linkIndex])

  useEffect(function() {
    return function() {
      stopPoll()
      clearBlobUrl()
    }
  }, [])

  function onAudioLoadedMetadata() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.duration && isFinite(audio.duration)) {
      setDuration(audio.duration)
    }
  }

  function onAudioTimeUpdate() {
    const audio = audioRef.current
    if (!audio) return
    setCurrentTime(audio.currentTime || 0)
  }

  function onAudioPlay() {
    setPlaying(true)
    startTimePoll()
  }

  function onAudioPause() {
    setPlaying(false)
    stopPoll()
  }

  function onAudioEnded() {
    setPlaying(false)
    stopPoll()
  }

  function onAudioError() {
    const audio = audioRef.current
    const failedSrc = audio && audio.src
    if (!failedSrc || failedSrc.indexOf('blob:') === 0 || !link) {
      setWarning('Could not load this audio link.')
      return
    }
    resolveAudioSrc(link, { forceFetch: true }).then(function(src) {
      setAudioSrc(src)
      setWarning('')
    }).catch(function(e) {
      setWarning(e && e.message ? e.message : 'Could not load this audio link.')
    })
  }

  function onYoutubeReady(event) {
    youtubePlayerRef.current = event.target
    try {
      const dur = event.target.getDuration()
      if (dur > 0) setDuration(dur)
      setCurrentTime(event.target.getCurrentTime() || 0)
    } catch (e) {}
  }

  function onYoutubeStateChange(event) {
    if (event.data === YT_PLAYING) {
      setPlaying(true)
      startTimePoll()
      return
    }
    if (event.data === YT_PAUSED || event.data === YT_ENDED) {
      setPlaying(false)
      stopPoll()
      if (event.data === YT_ENDED) {
        try {
          setCurrentTime(event.target.getCurrentTime() || 0)
        } catch (e) {}
      }
    }
  }

  function togglePlay() {
    if (!canPreview || loading || warning) return

    if (playing) {
      stopPlayback()
      return
    }

    if (isYoutube) {
      const player = youtubePlayerRef.current
      if (!player) return
      try {
        player.playVideo()
        setPlaying(true)
        startTimePoll()
      } catch (e) {
        setWarning('Could not play this YouTube link.')
      }
      return
    }

    const audio = audioRef.current
    if (!audio || !audioSrc) return
    audio.play().then(function() {
      setPlaying(true)
      startTimePoll()
    }).catch(function() {
      setWarning('Could not play this audio link.')
      setPlaying(false)
    })
  }

  function handleStartInputChange(e) {
    updateLinkFields({ startAt: e.target.value })
  }

  function handleEndInputChange(e) {
    updateLinkFields({ endAt: e.target.value })
  }

  function handleSetStart() {
    setStartFromSeconds(getPlayheadSeconds())
  }

  function handleSetEnd() {
    setEndFromSeconds(getPlayheadSeconds())
  }

  function handleClearStart() {
    updateLinkFields({ startAt: '' })
  }

  function handleClearEnd() {
    updateLinkFields({ endAt: '' })
  }

  function seekPreviewTo(seconds) {
    if (!Number.isFinite(seconds)) return
    const next = Math.max(0, seconds)
    if (isYoutube && youtubePlayerRef.current) {
      try {
        youtubePlayerRef.current.seekTo(next, true)
      } catch (e) {}
      setCurrentTime(next)
      return
    }
    const audio = audioRef.current
    if (audio) {
      try {
        audio.currentTime = next
      } catch (e) {}
      setCurrentTime(next)
    }
  }

  function handleSliderStart(seconds) {
    setStartFromSeconds(seconds)
  }

  function handleSliderEnd(seconds) {
    setEndFromSeconds(seconds)
  }

  const playIcon = icons && (icons.play || icons.playwhite)
  const pauseIcon = icons && icons.pause
  const title = (link && link.title && String(link.title).trim())
    || (link && link.link && String(link.link).trim())
    || 'Link'

  return (
    <Modal show={show} onHide={onHide} centered dialogClassName="link-play-range-modal-dialog">
      <Modal.Header closeButton>
        <Modal.Title>Play Range</Modal.Title>
      </Modal.Header>
      <Modal.Body className="link-play-range-modal-body">
        <div className={'link-play-range-preview' + (isAudioLike ? ' link-play-range-preview--audio' : '')}>
          {loading && <div className="link-play-range-preview__placeholder">Loading preview…</div>}
          {!loading && isYoutube && youtubeVideoId && (
            <div className="link-play-range-preview__youtube">
              <YouTube
                key={youtubeVideoId + ':' + linkIndex}
                videoId={youtubeVideoId}
                opts={{
                  width: '100%',
                  height: '100%',
                  playerVars: {
                    controls: 1,
                    enablejsapi: 1,
                    rel: 0,
                  },
                }}
                onReady={onYoutubeReady}
                onStateChange={onYoutubeStateChange}
                onError={function() {
                  setWarning('Could not load this YouTube link.')
                }}
              />
            </div>
          )}
          {!loading && isAudioLike && audioSrc && (
            <>
              <div className="link-play-range-preview__audio-label">{title}</div>
              <audio
                ref={audioRef}
                src={audioSrc}
                preload="metadata"
                onLoadedMetadata={onAudioLoadedMetadata}
                onTimeUpdate={onAudioTimeUpdate}
                onPlay={onAudioPlay}
                onPause={onAudioPause}
                onEnded={onAudioEnded}
                onError={onAudioError}
                style={{ display: 'none' }}
              />
            </>
          )}
          {!loading && !youtubeVideoId && !audioSrc && (
            <div className="link-play-range-preview__placeholder">
              {warning || 'No preview available'}
            </div>
          )}
        </div>

        <div className="link-play-range-transport">
          <Button
            variant={playing ? 'warning' : 'success'}
            onClick={togglePlay}
            disabled={!canPreview || loading || (!youtubeVideoId && !audioSrc)}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            title={playing ? 'Pause preview' : 'Play preview'}
          >
            {playing ? (pauseIcon || 'Pause') : (playIcon || 'Play')}
          </Button>
          <span className="link-play-range-time">
            {formatClock(currentTime)}
            {duration > 0 ? ' / ' + formatClock(duration) : ''}
          </span>
          <div className="link-play-range-scan">
            <LinkPlaybackRegionScanControls
              tune={tune}
              linkIndex={linkIndex}
              link={link}
              currentLinks={links}
              onLinksUpdated={onLinksUpdated}
            />
          </div>
        </div>

        {warning && (
          <p className="link-play-range-warning text-danger">{warning}</p>
        )}

        <div className="link-play-range-slider-wrap">
          <input
            className="link-play-range-seek"
            type="range"
            min={0}
            max={duration > 0 ? duration : 1}
            step={0.01}
            value={duration > 0 ? Math.min(currentTime, duration) : 0}
            disabled={!(duration > 0)}
            aria-label="Seek playback"
            onInput={function(e) {
              const next = parseFloat(e.target.value)
              if (!Number.isFinite(next)) return
              seekPreviewTo(next)
            }}
            onChange={function(e) {
              const next = parseFloat(e.target.value)
              if (!Number.isFinite(next)) return
              seekPreviewTo(next)
            }}
          />
          <div className="link-play-range-slider-labels">
            <span>{formatClock(startSeconds != null ? startSeconds : 0)}</span>
            <span>{duration > 0 ? formatClock(endSeconds != null ? endSeconds : duration) : '—'}</span>
          </div>
          <DualRangeSlider
            duration={duration}
            startSeconds={startSeconds}
            endSeconds={endSeconds}
            onChangeStart={handleSliderStart}
            onChangeEnd={handleSliderEnd}
            onSeek={seekPreviewTo}
          />
        </div>

        <div className="link-play-range-fields">
          <Form.Group className="link-play-range-field">
            <FormLabelWithHelp
              label="Start"
              helpBody={LINKS_FIELD_HELP.startAt.body}
              helpTitle={LINKS_FIELD_HELP.startAt.title}
            />
            <InputGroup size="sm">
              <Button
                variant="outline-secondary"
                onClick={handleClearStart}
                disabled={!(link && link.startAt != null && String(link.startAt).trim())}
                title="Clear start"
                aria-label="Clear start"
              >
                ×
              </Button>
              <Form.Control
                type="text"
                value={link && link.startAt != null ? link.startAt : ''}
                onChange={handleStartInputChange}
                placeholder="seconds"
              />
              <Button
                variant="outline-secondary"
                onClick={handleSetStart}
                title="Set start to current play position"
              >
                Set
              </Button>
            </InputGroup>
          </Form.Group>
          <Form.Group className="link-play-range-field">
            <FormLabelWithHelp
              label="End"
              helpBody={LINKS_FIELD_HELP.endAt.body}
              helpTitle={LINKS_FIELD_HELP.endAt.title}
            />
            <InputGroup size="sm">
              <Button
                variant="outline-secondary"
                onClick={handleClearEnd}
                disabled={!(link && link.endAt != null && String(link.endAt).trim())}
                title="Clear end"
                aria-label="Clear end"
              >
                ×
              </Button>
              <Form.Control
                type="text"
                value={link && link.endAt != null ? link.endAt : ''}
                onChange={handleEndInputChange}
                placeholder="seconds"
              />
              <Button
                variant="outline-secondary"
                onClick={handleSetEnd}
                title="Set end to current play position"
              >
                Set
              </Button>
            </InputGroup>
          </Form.Group>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
