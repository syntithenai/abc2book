import { useState } from 'react'
import { Button, ListGroup } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import { resolveMediaLinkPlaybackButton, mediaLinkPlaybackIcon } from '../mediaLinkPlaybackButton'
import VoiceFillInput from './VoiceFillInput'
import {
  getCurrentTuneId,
  setQueueIndex,
  setQueueItemPlayback,
  removeQueueItem,
  getQueueItemLabel,
  isExternalQueueItem,
} from '../nowPlayingQueue'
import { navigateToQueueTune, playQueueItem } from '../nowPlayingQueuePlayback'
import { playLessonYoutube } from '../lessonYoutubePlayer'

export default function NowPlayingQueueManager(props) {
  const [filter, setFilter] = useState('')
  const navigate = useNavigate()
  const queue = props.nowPlayingQueue
  const tunes = props.tunes || {}
  const currentId = getCurrentTuneId(queue)

  if (!queue || !Array.isArray(queue.items) || queue.items.length === 0) {
    return null
  }

  function removeItem(index) {
    const nextQueue = removeQueueItem(queue, index)
    props.setNowPlayingQueue(nextQueue)
    if (!nextQueue && props.handleClose) props.handleClose()
  }

  return (
    <div>
      <VoiceFillInput
        layout="wrap"
        className="mb-2"
        inputClassName="form-control"
        useFormControl={false}
        type="text"
        value={filter}
        onChange={function(e) { setFilter(e.target.value) }}
        placeholder="Filter playlist"
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        token={props.token}
        fieldKind="search"
      />
      <ListGroup style={{ clear: 'both', width: '100%', backgroundColor: 'white' }}>
        {queue.items.map(function(item, index) {
          const tune = item && item.tuneId ? tunes[item.tuneId] : null
          const tuneName = getQueueItemLabel(item, tunes)
          const composer = tune && tune.composer ? String(tune.composer).trim() : ''
          const filterText = (tuneName + (composer ? ' ' + composer : '')).toLowerCase()
          if (filter && filter.trim().length > 0 && filterText.indexOf(filter.toLowerCase()) === -1) {
            return null
          }
          const isCurrent = isExternalQueueItem(item)
            ? index === (typeof queue.currentIndex === 'number' ? queue.currentIndex : 0)
            : !!(tune && tune.id === currentId)
          const links = tune && Array.isArray(tune.links) ? tune.links : []
          const hasMusic = tune && props.tunebook.hasNotesOrChords(tune)

          function jumpToItem(playbackPatch) {
            let nextQueue = setQueueIndex(queue, index)
            if (playbackPatch) {
              nextQueue = setQueueItemPlayback(nextQueue, index, playbackPatch)
            }
            props.setNowPlayingQueue(nextQueue)
            const nextItem = nextQueue.items[index]
            if (isExternalQueueItem(nextItem)) {
              playLessonYoutube({ fromUserGesture: true })
              setFilter('')
              if (props.handleClose) props.handleClose()
              return
            }
            if (!tune) return
            if (props.mediaController && props.mediaController.preparePlaybackFromUserGesture) {
              props.mediaController.preparePlaybackFromUserGesture()
            }
            playQueueItem(props.mediaController, props.tunebook, tune, nextItem, { fromUserGesture: true })
            navigateToQueueTune(navigate, tune.id, nextItem, props.tunebook, tunes)
            setFilter('')
            if (props.handleClose) props.handleClose()
          }

          return (
            <ListGroup.Item
              key={(item && item.tuneId ? item.tuneId : 'ext-' + index) + '-' + index}
              className={index % 2 === 0 ? 'even' : 'odd'}
              style={{ border: isCurrent ? '2px solid blue' : 'none' }}
            >
              {tune ? (
                <Button
                  variant="link"
                  className="p-0 align-baseline"
                  style={{ marginRight: '1em', fontWeight: 'bold', textDecoration: 'none' }}
                  onClick={function() {
                    props.setNowPlayingQueue(setQueueIndex(queue, index))
                    navigate('/tunes/' + tune.id)
                    setFilter('')
                    if (props.handleClose) props.handleClose()
                  }}
                >
                  {tuneName}
                  {composer ? (
                    <span className="now-playing-queue-item-composer"> — {composer}</span>
                  ) : null}
                </Button>
              ) : isExternalQueueItem(item) ? (
                <Button
                  variant="link"
                  className="p-0 align-baseline"
                  style={{ marginRight: '1em', fontWeight: 'bold', textDecoration: 'none' }}
                  onClick={function() { jumpToItem() }}
                >
                  {tuneName}
                  {composer ? (
                    <span className="now-playing-queue-item-composer"> — {composer}</span>
                  ) : null}
                </Button>
              ) : (
                <span className="text-muted" style={{ marginRight: '1em', fontWeight: 'bold' }}>
                  {tuneName}
                </span>
              )}
              <div style={{ float: 'right' }}>
                {isExternalQueueItem(item) ? (
                  <Button
                    variant="link"
                    size="sm"
                    title="Play"
                    onClick={function() { jumpToItem() }}
                  >
                    {props.tunebook.icons.play}
                  </Button>
                ) : null}
                {tune ? links.map(function(link, lk) {
                  const isYoutubeLink = props.tunebook.utils && props.tunebook.utils.isYoutubeLink
                  const buttonProps = resolveMediaLinkPlaybackButton(link, isYoutubeLink)
                  return (
                    <Button
                      key={lk}
                      style={{ marginRight: '0.1em' }}
                      variant={buttonProps.variant}
                      className={buttonProps.className}
                      title={buttonProps.label ? buttonProps.label + ' link ' + lk : 'Media link ' + lk}
                      onClick={function() { jumpToItem({ prefer: 'media', linkIndex: lk }) }}
                    >
                      {mediaLinkPlaybackIcon(props.tunebook, buttonProps.iconKey)}
                      {' '}
                      {props.tunebook.icons.play}
                      {' '}
                      {lk}
                    </Button>
                  )
                }) : null}
                {hasMusic && (
                  <Button
                    style={{ marginRight: '0.1em' }}
                    variant="success"
                    onClick={function() { jumpToItem({ prefer: 'midi' }) }}
                  >
                    {props.tunebook.icons.music} {props.tunebook.icons.play}
                  </Button>
                )}
                <Button
                  variant="outline-danger"
                  size="sm"
                  title="Remove from playlist"
                  data-testid={'remove-playlist-item-' + index}
                  onClick={function() { removeItem(index) }}
                >
                  {props.tunebook.icons.deletebin}
                </Button>
              </div>
            </ListGroup.Item>
          )
        })}
      </ListGroup>
    </div>
  )
}
