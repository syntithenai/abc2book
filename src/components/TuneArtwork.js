import { useEffect, useState } from 'react'
import MusicCollectionArtImage from './MusicCollectionArtImage'
import {
  getTuneArtworkUrl,
  isMusicCollectionArtworkUrl,
  isYoutubeArtworkUrl,
  needsOwnedRecordingArtwork,
  youtubeArtworkMaxResUrl,
} from '../nowPlayingArtwork'
import { getOwnedRecordingArtworkUrl } from '../ownedRecordingArtwork'

function normalizeLinkIndex(linkIndex) {
  if (linkIndex === null || linkIndex === undefined || linkIndex === '') return null
  const parsed = parseInt(linkIndex, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function activeLink(tune, linkIndex) {
  if (!tune || !Array.isArray(tune.links)) return null
  const index = normalizeLinkIndex(linkIndex)
  if (index == null || index < 0 || index >= tune.links.length) return null
  return tune.links[index] || null
}

export default function TuneArtwork({
  tune,
  tunebook,
  className,
  linkIndex,
  alt = '',
  onHidden,
  token,
}) {
  const [hidden, setHidden] = useState(false)
  const [imgSrc, setImgSrc] = useState('')
  const [ownedArtUrl, setOwnedArtUrl] = useState('')
  const url = getTuneArtworkUrl(tune, tunebook, { linkIndex: linkIndex })
  const link = activeLink(tune, linkIndex)
  const wantsOwnedArt = !url && needsOwnedRecordingArtwork(link)

  useEffect(function() {
    setHidden(false)
    if (!url) {
      setImgSrc('')
      return
    }
    if (isYoutubeArtworkUrl(url)) {
      setImgSrc(youtubeArtworkMaxResUrl(url) || url)
      return
    }
    setImgSrc(url)
  }, [url, tune && tune.id, linkIndex])

  useEffect(function() {
    if (!wantsOwnedArt || !link) {
      setOwnedArtUrl('')
      return undefined
    }

    let cancelled = false
    getOwnedRecordingArtworkUrl(link, tune && tune.id, normalizeLinkIndex(linkIndex))
      .then(function(objectUrl) {
        if (cancelled) return
        setOwnedArtUrl(objectUrl || '')
        if (!objectUrl) {
          setHidden(true)
          if (onHidden) onHidden()
        }
      })
      .catch(function() {
        if (cancelled) return
        setOwnedArtUrl('')
        setHidden(true)
        if (onHidden) onHidden()
      })

    return function() {
      cancelled = true
    }
  }, [wantsOwnedArt, link, tune && tune.id, linkIndex, onHidden])

  if (hidden) return null

  if (url && isMusicCollectionArtworkUrl(url)) {
    return (
      <MusicCollectionArtImage
        image={url}
        token={token}
        className={className}
      />
    )
  }

  if (ownedArtUrl) {
    return (
      <img
        src={ownedArtUrl}
        alt={alt}
        className={className}
        onError={function() {
          setHidden(true)
          if (onHidden) onHidden()
        }}
      />
    )
  }

  if (!imgSrc) return null

  return (
    <img
      src={imgSrc}
      alt={alt}
      className={className}
      onError={function() {
        if (isYoutubeArtworkUrl(url) && imgSrc.indexOf('maxresdefault') >= 0) {
          setImgSrc(url)
          return
        }
        setHidden(true)
        if (onHidden) onHidden()
      }}
    />
  )
}
