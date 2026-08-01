import { ListGroup } from 'react-bootstrap'
import { MediaSearchResultDetails, MediaSearchResultImage } from './MediaSearchResultDetails'
import MediaListPlaybackButtons from './MediaListPlaybackButtons'
import {
  isDeviceFileResult,
  isMusicCollectionResult,
  mediaSearchResultDisplayArtist,
  mediaSearchResultDisplayTitle,
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
  const displayTitle = mediaSearchResultDisplayTitle(candidate)
  const displayArtist = mediaSearchResultDisplayArtist(candidate)

  const playButtons = (
    <MediaListPlaybackButtons
      candidate={candidate}
      tunebook={props.tunebook}
      mediaController={props.mediaController}
      nowPlayingQueue={props.nowPlayingQueue}
      setNowPlayingQueue={props.setNowPlayingQueue}
      onAddToTunebook={props.onAddToTunebook}
      onError={props.onMediaError}
      playIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.play : null}
      pauseIcon={props.tunebook && props.tunebook.icons ? props.tunebook.icons.pause : null}
      className="tune-list-item-play"
      buttonSize={props.showRowExtras ? 'lg' : undefined}
    />
  )

  if (isCompact) {
    return (
      <ListGroup.Item
        key={props.rowKey || ('media-' + tk)}
        className={'tune-list-item tune-list-item--media' + sourceClass + ' tune-list-item-compact'}
        style={{ borderTop: '2px solid black', borderLeft: '2px solid black', borderRight: '2px solid black' }}
      >
        <div className="tune-list-item-row media-list-item-row">
          <div className="tune-list-item-title-block">
            <span className="tune-list-item-title">
              <span className="tune-list-title-link tune-list-title-link--compact media-list-title-link">
                <span className="tune-list-title-text">
                  <span className="tune-list-title-name">{displayTitle}</span>
                  {displayArtist ? (
                    <span className="tune-list-title-composer">
                      <span className="tune-list-title-sep" aria-hidden="true"> — </span>
                      {displayArtist}
                    </span>
                  ) : null}
                </span>
                <span className="tune-list-title-badge">{sourceLabel}</span>
              </span>
            </span>
          </div>
          <div className="tune-list-item-meta">
            {playButtons}
          </div>
        </div>
      </ListGroup.Item>
    )
  }

  return (
    <ListGroup.Item
      key={props.rowKey || ('media-' + tk)}
      className={'tune-list-item tune-list-item--media' + sourceClass + ' tune-list-item-detailed'}
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
        </div>
        <div className="tune-list-item-meta">
          {playButtons}
        </div>
      </div>
    </ListGroup.Item>
  )
}
