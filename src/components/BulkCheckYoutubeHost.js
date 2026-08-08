import { useEffect, useState } from 'react'
import SafeYouTube from './SafeYouTube'
import {
  getBulkCheckYoutubeProbe,
  reportBulkCheckYoutubeError,
  reportBulkCheckYoutubeReady,
  reportBulkCheckYoutubeState,
  subscribeBulkCheckRunner,
} from '../bulkCheckRunner'

export default function BulkCheckYoutubeHost() {
  const [probe, setProbe] = useState(function() { return getBulkCheckYoutubeProbe() })

  useEffect(function() {
    return subscribeBulkCheckRunner(function() {
      setProbe(getBulkCheckYoutubeProbe())
    })
  }, [])

  if (!probe || !probe.videoId) return null

  return (
    <div style={{ position: 'absolute', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }} aria-hidden="true">
      <SafeYouTube
        key={probe.id + ':' + probe.videoId}
        videoId={probe.videoId}
        opts={{
          width: '1',
          height: '1',
          playerVars: {
            autoplay: 0,
            controls: 0,
            enablejsapi: 1,
          },
        }}
        onReady={function(e) { reportBulkCheckYoutubeReady(e.target) }}
        onStateChange={function(e) { reportBulkCheckYoutubeState(e.data) }}
        onError={function() { reportBulkCheckYoutubeError() }}
      />
    </div>
  )
}
