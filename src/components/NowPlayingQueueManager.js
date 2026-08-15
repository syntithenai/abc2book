import { useEffect, useState } from 'react'
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
import {
  getActiveResolverAccessToken,
  getMediaResolverHealthState,
  subscribeMediaResolverHealth,
} from '../mediaResolverHealthStore'
import {
  getTuneMediaLinkPlayBlock,
  isQueueItemFullyPlayable,
} from '../playlistPlaybackResilience'
import { useNavigatorOnline, OFFLINE_PLAYBACK_MESSAGE } from '../offlineNetwork'

function mediaLinkPlayBlockKey(tuneId, linkIndex) {
  return String(tuneId) + ':' + String(linkIndex)
}

function resolveSessionAccessToken(token) {
  if (token && token.access_token) return token.access_token
  if (typeof token === 'string' && token.trim()) return token
  return null
}

function useQueueMediaLinkPlayBlocks(queue, tunes, token, online) {
  const [blocks, setBlocks] = useState({})
  const [health, setHealth] = useState(function() {
    return getMediaResolverHealthState() || {}
  })

  useEffect(function() {
    setHealth(getMediaResolverHealthState() || {})
    return subscribeMediaResolverHealth(function(next) {
      setHealth(next || {})
    })
  }, [])

  useEffect(function() {
    let cancelled = false
    const healthState = health || {}

    async function refresh() {
      const next = {}
      const items = queue && Array.isArray(queue.items) ? queue.items : []
      const opts = {
        resolverStatus: healthState.status,
        resolverHealth: healthState,
        // Prefer the live Google session. When the parent passes token (including
        // null after logout), do not fall back to a stale health-store token.
        accessToken: token !== undefined
          ? resolveSessionAccessToken(token)
          : getActiveResolverAccessToken(),
      }
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const tune = item && item.tuneId && tunes ? tunes[item.tuneId] : null
        if (!tune || !tune.id || !Array.isArray(tune.links)) continue
        for (let lk = 0; lk < tune.links.length; lk++) {
          const block = await getTuneMediaLinkPlayBlock(tune, lk, opts)
          if (block) next[mediaLinkPlayBlockKey(tune.id, lk)] = block
        }
      }
      if (!cancelled) setBlocks(next)
    }

    refresh()
    return function() { cancelled = true }
  }, [queue, tunes, health, token, online])

  return blocks
}

function useQueueItemFullyPlayable(queue, tunes, tunebook, token, online) {
  const [playableByIndex, setPlayableByIndex] = useState({})

  useEffect(function() {
    let cancelled = false
    const healthState = getMediaResolverHealthState() || {}
    const opts = {
      resolverStatus: healthState.status,
      resolverHealth: healthState,
      accessToken: token !== undefined
        ? resolveSessionAccessToken(token)
        : getActiveResolverAccessToken(),
      isYoutubeLink: tunebook && tunebook.utils && tunebook.utils.isYoutubeLink,
    }

    async function refresh() {
      const next = {}
      const items = queue && Array.isArray(queue.items) ? queue.items : []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const tune = item && item.tuneId && tunes ? tunes[item.tuneId] : null
        next[i] = await isQueueItemFullyPlayable(tune, item, tunebook, opts)
      }
      if (!cancelled) setPlayableByIndex(next)
    }

    refresh()
    return function() { cancelled = true }
  }, [queue, tunes, tunebook, token, online])

  return playableByIndex
}

export default function NowPlayingQueueManager(props) {
  const [filter, setFilter] = useState('')
  const navigate = useNavigate()
  const queue = props.nowPlayingQueue
  const tunes = props.tunes || {}
  const currentId = getCurrentTuneId(queue)
  const navigatorOnline = useNavigatorOnline()
  const mediaLinkPlayBlocks = useQueueMediaLinkPlayBlocks(queue, tunes, props.token, navigatorOnline)
  const itemFullyPlayable = useQueueItemFullyPlayable(queue, tunes, props.tunebook, props.token, navigatorOnline)

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
          const defaultPlayable = itemFullyPlayable[index] !== false
          const titleDisabled = !defaultPlayable
          const titleDisableMessage = titleDisabled ? OFFLINE_PLAYBACK_MESSAGE : undefined

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
                  disabled={titleDisabled}
                  title={titleDisableMessage}
                  data-testid={'playlist-item-title-' + index}
                  onClick={function() { if (!titleDisabled) jumpToItem() }}
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
                  disabled={titleDisabled}
                  title={titleDisableMessage}
                  data-testid={'playlist-item-title-' + index}
                  onClick={function() { if (!titleDisabled) jumpToItem() }}
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
                    title={titleDisabled ? OFFLINE_PLAYBACK_MESSAGE : 'Play'}
                    disabled={titleDisabled}
                    data-testid={'playlist-external-play-' + index}
                    onClick={function() { if (!titleDisabled) jumpToItem() }}
                  >
                    {props.tunebook.icons.play}
                  </Button>
                ) : null}
                {tune ? links.map(function(link, lk) {
                  const isYoutubeLink = props.tunebook.utils && props.tunebook.utils.isYoutubeLink
                  const buttonProps = resolveMediaLinkPlaybackButton(link, isYoutubeLink)
                  const playBlock = mediaLinkPlayBlocks[mediaLinkPlayBlockKey(tune.id, lk)]
                  const playDisabled = !!playBlock
                  const titleBase = buttonProps.label
                    ? buttonProps.label + ' link ' + lk
                    : 'Media link ' + lk
                  return (
                    <Button
                      key={lk}
                      style={{ marginRight: '0.1em' }}
                      variant={playDisabled ? 'secondary' : buttonProps.variant}
                      className={buttonProps.className}
                      disabled={playDisabled}
                      title={playDisabled && playBlock.message ? playBlock.message : titleBase}
                      data-testid={'playlist-media-play-' + index + '-' + lk}
                      onClick={function() {
                        if (playDisabled) return
                        jumpToItem({ prefer: 'media', linkIndex: lk })
                      }}
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
                    data-testid={'playlist-midi-play-' + index}
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
