import { Button } from 'react-bootstrap'
import { buildArtUrl } from '../collectionCuratorUtils'
import {
  mediaSearchPathStyle,
  mediaSearchResultDisplayArtist,
  mediaSearchResultDisplayTitle,
} from '../mediaLinkSearchDisplay'
import { buildMusicCollectionCandidateFromEntry } from '../musicCollectionCandidateUtils'
import { ensureMediaSearchTune } from '../mediaSearchTuneMaterialize'
import MediaListPlaybackButtons from './MediaListPlaybackButtons'
import { MediaSearchResultImage } from './MediaSearchResultDetails'

export default function MusicCollectionTrackRow(props) {
  const entry = props.entry || {}
  const resolverBase = props.resolverBase || ''
  const candidate = buildMusicCollectionCandidateFromEntry(entry, resolverBase)
  const title = mediaSearchResultDisplayTitle(entry)
  const artist = mediaSearchResultDisplayArtist(entry)
  const album = String(entry.album || '').trim()
  const artItem = {
    source: 'music-collection',
    image: buildArtUrl(entry.id, resolverBase),
    title: title,
  }

  async function handleAdd() {
    if (!candidate) return
    try {
      await ensureMediaSearchTune(candidate, props.tunebook, {
        tunes: props.tunes,
        accessToken: props.token,
        forceRefresh: props.forceRefresh,
      })
    } catch (err) {
      if (props.onError) props.onError(err)
    }
  }

  return (
    <div className="library-track-row d-flex gap-2 align-items-start">
      <MediaSearchResultImage
        item={artItem}
        token={props.token}
        style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
      />
      <div className="flex-grow-1" style={{ minWidth: 0 }}>
        <div className="library-track-row-title fw-semibold text-truncate">{title}</div>
        {artist ? <div className="small text-muted text-truncate">{artist}{album ? ' · ' + album : ''}</div> : null}
        <div style={mediaSearchPathStyle} className="text-muted text-truncate">{entry.path}</div>
        <div className="d-flex flex-wrap gap-2 align-items-center mt-1">
          <MediaListPlaybackButtons
            candidate={candidate}
            tunebook={props.tunebook}
            tunes={props.tunes}
            accessToken={props.token}
            mediaController={props.mediaController}
            nowPlayingQueue={props.nowPlayingQueue}
            setNowPlayingQueue={props.setNowPlayingQueue}
            nowPlayingTuneId={props.nowPlayingTuneId}
            forceRefresh={props.forceRefresh}
            onError={props.onError}
            playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
            playVariant="success"
          />
          <Button size="sm" variant="outline-primary" onClick={handleAdd}>
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
