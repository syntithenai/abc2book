import { useState } from 'react'
import { getTuneArtworkUrl } from '../nowPlayingArtwork'

export default function TuneArtwork({
  tune,
  tunebook,
  className,
  linkIndex,
  alt = '',
}) {
  const [hidden, setHidden] = useState(false)
  const url = getTuneArtworkUrl(tune, tunebook, { linkIndex: linkIndex })
  if (!url || hidden) return null
  return (
    <img
      src={url}
      alt={alt}
      className={className}
      onError={function() { setHidden(true) }}
    />
  )
}
