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

function TitleBlock(props) {
  const displayTitle = props.displayTitle
  const displayArtist = props.displayArtist
  const sourceLabel = props.sourceLabel
  const browseable = props.browseable
  const onBrowse = props.onBrowse

  function handleBrowse(event) {
    if (!browseable || !onBrowse) return
    event.preventDefault()
    event.stopPropagation()
    onBrowse()
  }

  function handleBrowseKeyDown(event) {
    if (!browseable || !onBrowse) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onBrowse()
  }

  const titleInner = (
    <span className="tune-list-title-text">
      <span className="tune-list-title-name">{displayTitle}</span>
      {displayArtist ? (
        <span className="tune-list-title-composer">
          <span className="tune-list-title-sep" aria-hidden="true"> — </span>
          {displayArtist}
        </span>
      ) : null}
    </span>
  )

  return (
    <span className="tune-list-item-title">
      <span
        className={
          'tune-list-title-link tune-list-title-link--compact media-list-title-link'
          + (browseable ? ' media-list-title-link--browseable' : '')
        }
        role={browseable ? 'button' : undefined}
        tabIndex={browseable ? 0 : undefined}
        onClick={browseable ? handleBrowse : undefined}
        onKeyDown={browseable ? handleBrowseKeyDown : undefined}
        title={browseable ? 'Browse artist discography' : undefined}
      >
        {titleInner}
        <span className="tune-list-title-badge">{sourceLabel}</span>
      </span>
    </span>
  )
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
  const browseable = !!displayArtist && typeof props.onBrowseArtist === 'function'

  function handleBrowseArtist() {
    if (props.onBrowseArtist) props.onBrowseArtist(candidate)
  }

  const playButtons = (
    <MediaListPlaybackButtons
      candidate={candidate}
      tunebook={props.tunebook}
      mediaControllerRef={props.mediaControllerRef}
      mediaController={props.mediaController}
      tunes={props.tunes}
      setCurrentTune={props.setCurrentTune}
      nowPlayingTuneId={props.nowPlayingTuneId}
      nowPlayingQueue={props.nowPlayingQueue}
      setNowPlayingQueue={props.setNowPlayingQueue}
      onAddToTunebook={props.onAddToTunebook}
      onError={props.onMediaError}
      accessToken={props.accessToken}
      resolverAvailable={props.resolverAvailable}
      searchIndex={props.searchIndex}
      loadTuneTexts={props.loadTuneTexts}
      forceRefresh={props.forceRefresh}
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
            <TitleBlock
              displayTitle={displayTitle}
              displayArtist={displayArtist}
              sourceLabel={sourceLabel}
              browseable={browseable}
              onBrowse={handleBrowseArtist}
            />
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
        <div
          className={'media-list-item-details' + (browseable ? ' media-list-title-link--browseable' : '')}
          role={browseable ? 'button' : undefined}
          tabIndex={browseable ? 0 : undefined}
          onClick={browseable ? function(e) {
            e.preventDefault()
            handleBrowseArtist()
          } : undefined}
          onKeyDown={browseable ? function(e) {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleBrowseArtist()
            }
          } : undefined}
          title={browseable ? 'Browse artist discography' : undefined}
        >
          <MediaSearchResultDetails item={candidate} />
        </div>
        <div className="tune-list-item-meta">
          {playButtons}
        </div>
      </div>
    </ListGroup.Item>
  )
}
