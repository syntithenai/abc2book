import MusicCollectionArtImage from './MusicCollectionArtImage'
import {
  isBandcampResult,
  isDeviceFileResult,
  isEuropeanaResult,
  isInternetArchiveResult,
  isLocAudioResult,
  isMusicCollectionResult,
  mediaSearchResultArtist,
  mediaSearchResultRelativePath,
  mediaSearchPathStyle,
  mediaSearchSourceLabel,
} from '../mediaLinkSearchDisplay'

function sourceLabel(source) {
  return mediaSearchSourceLabel(source)
}

export function MediaSearchResultImage(props) {
  const item = props.item
  const style = props.style || {}
  if (!item || !item.image) return null

  if (isMusicCollectionResult(item)) {
    return (
      <MusicCollectionArtImage
        image={item.image}
        token={props.token}
        className={props.className}
        style={style}
      />
    )
  }

  return (
    <img
      alt=""
      src={item.image}
      className={props.className}
      style={style}
    />
  )
}

export function MediaSearchResultDetails(props) {
  const item = props.item
  if (!item) return null

  if (isMusicCollectionResult(item)) {
    const artist = mediaSearchResultArtist(item)
    const relativePath = mediaSearchResultRelativePath(item)
    return (
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fw-semibold text-truncate">{item.title || 'Track'}</div>
        {artist ? <div className="text-truncate">{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
        {relativePath ? (
          <div className="text-truncate mt-1" style={mediaSearchPathStyle}>{relativePath}</div>
        ) : null}
      </div>
    )
  }

  if (isDeviceFileResult(item)) {
    const artist = mediaSearchResultArtist(item)
    const relativePath = mediaSearchResultRelativePath(item)
    return (
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fw-semibold text-truncate">{item.title || 'Track'}</div>
        {artist ? <div className="text-truncate">{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
        {relativePath ? (
          <div className="text-truncate mt-1" style={mediaSearchPathStyle}>{relativePath}</div>
        ) : null}
      </div>
    )
  }

  if (isBandcampResult(item)) {
    const artist = mediaSearchResultArtist(item)
    return (
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fw-semibold text-truncate">{item.title || 'Track'}</div>
        {artist ? <div className="text-truncate">{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
      </div>
    )
  }

  if (isInternetArchiveResult(item) || isEuropeanaResult(item) || isLocAudioResult(item)) {
    const artist = mediaSearchResultArtist(item)
    return (
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="fw-semibold text-truncate">{item.title || 'Recording'}</div>
        {artist ? <div className="text-truncate">{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
      </div>
    )
  }

  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div className="fw-semibold text-truncate">{item.title || 'Video'}</div>
      {item.source ? (
        <div className="small text-muted">{sourceLabel(item.source)}</div>
      ) : null}
      {item.description ? (
        <div className="small text-muted" style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {item.description}
        </div>
      ) : null}
    </div>
  )
}

export function MediaSearchResultDetailsModal(props) {
  const item = props.item
  if (!item) return null

  if (isMusicCollectionResult(item)) {
    const artist = mediaSearchResultArtist(item)
    const relativePath = mediaSearchResultRelativePath(item)
    return (
      <>
        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{item.title || 'Track'}</div>
        {artist ? <div>{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
        {relativePath ? (
          <div className="mt-1" style={mediaSearchPathStyle}>{relativePath}</div>
        ) : null}
      </>
    )
  }

  if (isDeviceFileResult(item)) {
    const artist = mediaSearchResultArtist(item)
    const relativePath = mediaSearchResultRelativePath(item)
    return (
      <>
        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{item.title || 'Track'}</div>
        {artist ? <div>{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
        {relativePath ? (
          <div className="mt-1" style={mediaSearchPathStyle}>{relativePath}</div>
        ) : null}
      </>
    )
  }

  if (isBandcampResult(item)) {
    const artist = mediaSearchResultArtist(item)
    return (
      <>
        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{item.title || 'Track'}</div>
        {artist ? <div>{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
      </>
    )
  }

  if (isInternetArchiveResult(item) || isEuropeanaResult(item) || isLocAudioResult(item)) {
    const artist = mediaSearchResultArtist(item)
    return (
      <>
        <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{item.title || 'Recording'}</div>
        {artist ? <div>{artist}</div> : null}
        <div className="small text-muted">{sourceLabel(item.source)}</div>
      </>
    )
  }

  return (
    <>
      <div style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{item.title}</div>
      {item.source ? <div className="small text-muted">{sourceLabel(item.source)}</div> : null}
      {item.description ? <div>{item.description}</div> : null}
    </>
  )
}
