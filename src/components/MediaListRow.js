import { ListGroup } from 'react-bootstrap'
import { MediaSearchResultDetails, MediaSearchResultImage } from './MediaSearchResultDetails'
import MediaListPlaybackButtons from './MediaListPlaybackButtons'
import {
  isDeviceFileResult,
  isMusicCollectionResult,
  mediaSearchSourceLabel,
} from '../mediaLinkSearchDisplay'
import './MediaListRow.css'

const RESULT_ART_STYLE = {
  width: 40,
  height: 40,
  objectFit: 'cover',
  borderRadius: 4,
  flexShrink: 0,
}

export default function MediaListRow(props) {
  const row = props.row
  const candidate = row && row.candidate
  const tk = props.index
  if (!candidate) return null

  const isCompact = props.isCompact
  const sourceClass = isDeviceFileResult(candidate)
    ? ' tune-list-item--device'
    : (isMusicCollectionResult(candidate) ? ' tune-list-item--collection' : '')
  const sourceLabel = mediaSearchSourceLabel(candidate.source)

  const playButtons = (
    <MediaListPlaybackButtons
      candidate={candidate}
      mediaController={props.mediaController}
      nowPlayingQueue={props.nowPlayingQueue}
      setNowPlayingQueue={props.setNowPlayingQueue}
      onAddToTunebook={props.onAddToTunebook}
      onError={props.onMediaError}
      playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
      className="media-list-item-play"
      buttonSize={props.showRowExtras ? 'lg' : undefined}
    />
  )

  return (
    <ListGroup.Item
      key={props.rowKey || ('media-' + tk)}
      className={'tune-list-item tune-list-item--media' + sourceClass + (isCompact ? ' tune-list-item-compact' : ' tune-list-item-detailed')}
      style={{ borderTop: '2px solid black', borderLeft: '2px solid black', borderRight: '2px solid black' }}
    >
      <div className="media-list-item-row">
        <MediaSearchResultImage
          item={candidate}
          token={props.accessToken}
          style={RESULT_ART_STYLE}
        />
        <div className="media-list-item-details">
          <MediaSearchResultDetails item={candidate} />
          <span className="media-list-source-badge">{sourceLabel}</span>
        </div>
        {playButtons}
      </div>
    </ListGroup.Item>
  )
}
