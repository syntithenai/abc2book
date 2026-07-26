import { useEffect, useState } from 'react'
import { Form } from 'react-bootstrap'
import { buildAbcFromTune, NotationPreview } from '../SuggestionPreviewDialog'
import { getScratchpadBlob } from '../../scratchpadBlobs'
import { resolveScratchpadItemAudioBlob, getScratchpadItemDuration } from '../../scratchpadAudioInsert'
import { useWaveformPeaks } from '../../hooks/useWaveformPeaks'
import { formatMarkerTime } from '../../scratchpadAudioMarkers'

function typeLabel(type) {
  if (type === 'text') return 'Text'
  if (type === 'image') return 'Image'
  if (type === 'notation') return 'Notation'
  if (type === 'audio') return 'Audio'
  return type
}

function AudioWaveformPreview(props) {
  const item = props.item
  const [url, setUrl] = useState(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const waveform = useWaveformPeaks(url, !!url)

  useEffect(function() {
    let objectUrl = null
    let cancelled = false
    setLoadFailed(false)
    setUrl(null)
    if (!item || item.type !== 'audio') return undefined
    resolveScratchpadItemAudioBlob(item, { source: 'mixdown' })
      .then(function(blob) {
        if (cancelled || !blob) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(function() {
        if (!cancelled) setLoadFailed(true)
      })
    return function() {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item])

  if (loadFailed) {
    return <div className="scratchpad-card-preview-placeholder">Audio</div>
  }

  if (!waveform.peaks || !waveform.peaks.length) {
    return <div className="scratchpad-card-preview-audio-placeholder">Audio</div>
  }

  const peaks = waveform.peaks
  const maxH = 48
  return (
    <div className="scratchpad-card-preview-audio">
      <svg className="scratchpad-card-waveform" viewBox={'0 0 ' + peaks.length + ' ' + maxH} preserveAspectRatio="none" aria-hidden="true">
        {peaks.map(function(p, i) {
          const h = Math.max(1, (p.max - p.min) * maxH * 0.85)
          return (
            <rect
              key={i}
              x={i}
              y={(maxH - h) / 2}
              width={1}
              height={h}
              fill="currentColor"
            />
          )
        })}
      </svg>
    </div>
  )
}

export default function ScratchpadItemCard(props) {
  const item = props.item
  const [imageUrl, setImageUrl] = useState(null)
  const [audioDuration, setAudioDuration] = useState(0)

  useEffect(function() {
    let objectUrl = null
    let cancelled = false
    if (item.type !== 'image' || !item.image || !item.image.blobKey) {
      setImageUrl(null)
      return undefined
    }
    getScratchpadBlob(item.image.blobKey).then(function(blob) {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setImageUrl(objectUrl)
    })
    return function() {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [item])

  useEffect(function() {
    let cancelled = false
    if (item.type !== 'audio' || !item.audio) {
      setAudioDuration(0)
      return undefined
    }
    getScratchpadItemDuration(item).then(function(duration) {
      if (!cancelled) setAudioDuration(duration || 0)
    }).catch(function() {
      if (!cancelled) setAudioDuration(0)
    })
    return function() { cancelled = true }
  }, [item])

  function renderPreview() {
    if (item.type === 'text') {
      const lines = String(item.previewText || item.text && item.text.body || '').split('\n').slice(0, 5)
      return (
        <div className="scratchpad-card-preview-text">
          {lines.map(function(line, i) {
            return <div key={i} className="scratchpad-card-text-line">{line || '\u00a0'}</div>
          })}
        </div>
      )
    }
    if (item.type === 'image') {
      if (imageUrl) {
        return <img src={imageUrl} alt="" className="scratchpad-card-preview-image" />
      }
      return <div className="scratchpad-card-preview-placeholder">Image</div>
    }
    if (item.type === 'notation') {
      const tune = item.notation && item.notation.tuneSnapshot
      const abc = buildAbcFromTune(tune)
      if (!abc) {
        return <div className="scratchpad-card-preview-placeholder">Notation</div>
      }
      return (
        <div className="scratchpad-card-preview-notation">
          <NotationPreview
            abc={abc}
            fitWidth={true}
            wrapToWidth={true}
            maxHeight={null}
            className="scratchpad-card-notation-preview"
          />
        </div>
      )
    }
    if (item.type === 'audio' && item.audio) {
      return <AudioWaveformPreview item={item} />
    }
    return <div className="scratchpad-card-preview-placeholder">{typeLabel(item.type)}</div>
  }

  return (
    <div
      className={'scratchpad-card-wrap' + (props.selected ? ' scratchpad-card-wrap--selected' : '')}
      data-testid={'scratchpad-card-wrap-' + item.id}
    >
      <Form.Check
        type="checkbox"
        className="scratchpad-card-select"
        checked={!!props.selected}
        aria-label={'Select ' + (item.title || 'scratchpad item')}
        onChange={function(e) {
          e.stopPropagation()
          if (props.onToggleSelect) props.onToggleSelect()
        }}
        onClick={function(e) { e.stopPropagation() }}
      />
      <button
        type="button"
        className="scratchpad-card"
        onClick={props.onClick}
        data-testid={'scratchpad-card-' + item.id}
      >
        <div className="scratchpad-card-preview">
          {renderPreview()}
        </div>
        <div className="scratchpad-card-footer">
          <span className="scratchpad-card-type">
            {typeLabel(item.type)}
            {item.type === 'audio' && audioDuration > 0 ? (
              <span className="scratchpad-card-duration"> · {formatMarkerTime(audioDuration)}s</span>
            ) : null}
          </span>
          <span className="scratchpad-card-title">{item.title}</span>
        </div>
      </button>
    </div>
  )
}
