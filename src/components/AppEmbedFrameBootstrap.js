import { useLayoutEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { isEmbeddedAppFrame } from '../embedFrameUtils'

/** Apply embed-frame document class as early as possible (before paint). */
export default function AppEmbedFrameBootstrap() {
  const [searchParams] = useSearchParams()
  const embedded = isEmbeddedAppFrame(searchParams)

  useLayoutEffect(function() {
    document.documentElement.classList.toggle('app-embed-frame', embedded)
    return function() {
      document.documentElement.classList.remove('app-embed-frame')
    }
  }, [embedded])

  return null
}
