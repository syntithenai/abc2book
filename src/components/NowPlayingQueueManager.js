import { useState } from 'react'
import { Button, ListGroup } from 'react-bootstrap'
import { useNavigate } from 'react-router-dom'
import {
  getCurrentTuneId,
  setQueueIndex,
  setQueueItemPlayback,
  removeQueueItem,
} from '../nowPlayingQueue'
import { navigateToQueueTune } from '../nowPlayingQueuePlayback'

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
      <input
        type="text"
        className="form-control mb-2"
        value={filter}
        onChange={function(e) { setFilter(e.target.value) }}
        placeholder="Filter playlist"
      />
      <ListGroup style={{ clear: 'both', width: '100%', backgroundColor: 'white' }}>
        {queue.items.map(function(item, index) {
          const tune = item && item.tuneId ? tunes[item.tuneId] : null
          const tuneName = tune && tune.name
            ? tune.name
            : (item && item.tuneId ? 'Missing tune (' + item.tuneId + ')' : 'Missing tune')
          if (filter && filter.trim().length > 0 && tuneName.toLowerCase().indexOf(filter.toLowerCase()) === -1) {
            return null
          }
          const isCurrent = !!(tune && tune.id === currentId)
          const links = tune && Array.isArray(tune.links) ? tune.links : []
          const hasMusic = tune && props.tunebook.hasNotesOrChords(tune)

          function jumpToItem(playbackPatch) {
            if (!tune) return
            let nextQueue = setQueueIndex(queue, index)
            if (playbackPatch) {
              nextQueue = setQueueItemPlayback(nextQueue, index, playbackPatch)
            }
            props.setNowPlayingQueue(nextQueue)
            const nextItem = nextQueue.items[index]
            navigateToQueueTune(navigate, tune.id, nextItem, props.tunebook, tunes)
            setFilter('')
            if (props.handleClose) props.handleClose()
          }

          return (
            <ListGroup.Item
              key={(item && item.tuneId ? item.tuneId : 'item') + '-' + index}
              className={index % 2 === 0 ? 'even' : 'odd'}
              style={{ border: isCurrent ? '2px solid blue' : 'none' }}
            >
              {tune ? (
                <Button
                  variant="link"
                  className="p-0 align-baseline"
                  style={{ marginRight: '1em', fontWeight: 'bold', textDecoration: 'none' }}
                  onClick={function() {
                    // Update playlist position so transport play/next/prev use this item.
                    props.setNowPlayingQueue(setQueueIndex(queue, index))
                    navigate('/tunes/' + tune.id)
                    setFilter('')
                    if (props.handleClose) props.handleClose()
                  }}
                >
                  {tuneName}
                </Button>
              ) : (
                <span className="text-muted" style={{ marginRight: '1em', fontWeight: 'bold' }}>
                  {tuneName}
                </span>
              )}
              <div style={{ float: 'right' }}>
                {links.map(function(link, lk) {
                  return (
                    <Button
                      key={lk}
                      style={{ marginRight: '0.1em' }}
                      variant="danger"
                      onClick={function() { jumpToItem({ prefer: 'media', linkIndex: lk }) }}
                    >
                      {props.tunebook.icons.link} {props.tunebook.icons.play} {lk}
                    </Button>
                  )
                })}
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
