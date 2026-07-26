import { useEffect, useState } from 'react'
import { fetchViaMediaProxy } from '../mediaProxyClient'
import { getActiveResolverAccessToken } from '../mediaResolverHealthStore'
import { musicCollectionArtProxyPathFromUrl } from '../musicCollectionLinkUtils'
import { resolveResolverAccessToken } from '../resolverAccessToken'

export default function MusicCollectionArtImage(props) {
  const path = musicCollectionArtProxyPathFromUrl(props.image)
  const [src, setSrc] = useState('')

  useEffect(function() {
    if (!path) {
      setSrc('')
      return undefined
    }

    let objectUrl = ''
    let cancelled = false
    const token = resolveResolverAccessToken(props.token) || getActiveResolverAccessToken() || ''

    fetchViaMediaProxy(path, token)
      .then(function(response) { return response.blob() })
      .then(function(blob) {
        if (cancelled || !blob || !blob.size) return
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(function() {
        if (!cancelled) setSrc('')
      })

    return function() {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, props.token, props.image])

  if (!src) return null

  return (
    <img
      alt=""
      src={src}
      className={props.className}
      style={props.style}
    />
  )
}
