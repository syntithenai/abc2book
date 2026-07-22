import { useEffect, useState } from 'react'
import Abc from '../Abc'
import { getScratchpadBlob } from '../../scratchpadBlobs'
import { getNotationPreviewAbc } from '../../scratchpadStore'
import { useWaveformPeaks } from '../../hooks/useWaveformPeaks'

function typeLabel(type) {
  if (type === 'text') return 'Text'
  if (type === 'image') return 'Image'
  if (type === 'notation') return 'Notation'
  if (type === 'audio') return 'Audio'
  return type
}

function AudioWaveformPreview(props) {
  const [url, setUrl] = useState(null)
  const waveform = useWaveformPeaks(url, !!url)

  useEffect(function() {
    let objectUrl = null
    let cancelled = false
    if (!props.blobKey) {
      setUrl(null)
      return undefined
    }
    getScratchpadBlob(props.blobKey).then(function(blob) {
      if (cancelled || !blob) return
      objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
    })
    return function() {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [props.blobKey])

  if (!waveform.peaks || !waveform.peaks.length) {
    return <div className="scratchpad-card-preview-audio-placeholder">Audio</div>
  }

  const peaks = waveform.peaks
  const maxH = 40
  return (
    <svg className="scratchpad-card-waveform" viewBox={'0 0 ' + peaks.length + ' ' + maxH} preserveAspectRatio="none">
      {peaks.map(function(p, i) {
        const h = Math.max(1, (p.max - p.min) * maxH * 0.8)
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
  )
}

export default function ScratchpadItemCard(props) {
  const item = props.item
  const [imageUrl, setImageUrl] = useState(null)

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
      const abc = getNotationPreviewAbc(item)
      return (
        <div className="scratchpad-card-preview-notation">
          <Abc abc={abc} tunebook={props.tunebook} />
        </div>
      )
    }
    if (item.type === 'audio' && item.audio) {
      return <AudioWaveformPreview blobKey={item.audio.blobKey} />
    }
    return <div className="scratchpad-card-preview-placeholder">{typeLabel(item.type)}</div>
  }

  return (
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
        <span className="scratchpad-card-type">{typeLabel(item.type)}</span>
        <span className="scratchpad-card-title">{item.title}</span>
      </div>
    </button>
  )
}
