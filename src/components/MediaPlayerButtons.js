import {Button, ButtonGroup} from 'react-bootstrap'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
import PlaylistModal from './PlaylistModal'
import {useNavigate, useLocation} from 'react-router-dom'
import {useEffect, useState, useRef} from 'react'
import { startTunePlayback, resumeTunePlayback, resolvePlaybackTarget } from '../tunePlaybackActions'
import { isQueueActive } from '../nowPlayingQueue'
import { isNavigatorOffline, isTuneOfflinePlayable } from '../offlinePlayback'

function useOfflinePlayDisabled(mediaController, tunebook, location) {
  const [playDisabled, setPlayDisabled] = useState(false)
  const tuneId = mediaController.tune && mediaController.tune.id ? mediaController.tune.id : null
  const pathname = location.pathname
  const linkNum = mediaController.mediaLinkNumber

  useEffect(function() {
    let cancelled = false

    function refresh() {
      if (!isNavigatorOffline()) {
        if (!cancelled) setPlayDisabled(false)
        return
      }
      const tune = mediaController.tune
      if (!tune) {
        if (!cancelled) setPlayDisabled(true)
        return
      }
      const target = resolvePlaybackTarget(mediaController, tunebook, location, tune)
      if (!target) {
        if (!cancelled) setPlayDisabled(true)
        return
      }
      isTuneOfflinePlayable(
        tune,
        target,
        tunebook,
        tunebook.utils && tunebook.utils.isYoutubeLink
      ).then(function(ok) {
        if (!cancelled) setPlayDisabled(!ok)
      })
    }

    refresh()
    window.addEventListener('offline', refresh)
    window.addEventListener('online', refresh)
    return function() {
      cancelled = true
      window.removeEventListener('offline', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [mediaController, tunebook, location, tuneId, pathname, linkNum])

  return playDisabled
}

export default function MediaPlayerButtons({
  mediaController,
  tunebook,
  buttonSize,
  nowPlayingQueue,
  setNowPlayingQueue,
  queuePlayConfirm,
  setQueuePlayConfirm,
  currentTuneBook,
  tagFilter,
  genreFilter,
  artistFilter,
  selected,
  user,
  tunes,
}) {
   var useButtonSize=(buttonSize ? buttonSize : 'lg')
   const location = useLocation()
   const navigate = useNavigate()
   const [showButtons, setShowButtons] = useState(false)
   const clickTimeoutRef = useRef(null)
   const playDisabledOffline = useOfflinePlayDisabled(mediaController, tunebook, location)

   useEffect(function() {
       return function() {
           if (clickTimeoutRef.current) {
               clearTimeout(clickTimeoutRef.current)
               clickTimeoutRef.current = null
           }
       }
   }, [])

   function startPlayback() {
       startTunePlayback(mediaController, tunebook, navigate, location, {
         nowPlayingQueue: nowPlayingQueue,
         setQueuePlayConfirm: setQueuePlayConfirm,
         setNowPlayingQueue: setNowPlayingQueue,
         currentTuneBook: currentTuneBook,
         tagFilter: tagFilter,
         genreFilter: genreFilter,
         artistFilter: artistFilter,
         selected: selected,
         tunes: tunes,
       })
   }
   const mcTuneKey = mediaController.tune ? JSON.stringify(mediaController.tune) : null
   useEffect(function() {
           if (mediaController.tune && (tunebook.hasNotesOrChords(mediaController.tune) || (Array.isArray(mediaController.tune.links) && mediaController.tune.links.length > 0))) {
              setShowButtons(true)
           } else {
               setShowButtons(false)
           }
   },[mcTuneKey, mediaController.tune, tunebook])
   
   function showPlaybackControls() {
       // Play/pause for the current tune on any page (e.g. settings while a queue plays).
       return !!mediaController.tune
   }

   function restartFromStart() {
       if (mediaController.restartPlaybackFromStart) {
           mediaController.restartPlaybackFromStart()
       }
   }

   function armDoubleClickWindow() {
       if (clickTimeoutRef.current) {
           clearTimeout(clickTimeoutRef.current)
       }
       clickTimeoutRef.current = setTimeout(function() {
           clickTimeoutRef.current = null
       }, 400)
   }

   function getViewedTuneId() {
       const match = location.pathname.match(/\/(?:tunes|editor)\/([^/]+)/)
       return match ? decodeURIComponent(match[1]) : null
   }

   function handlePlayPress() {
       // Defer single-click play/resume so a double-click can restart from the
       // start without racing a resume that leaves the waiting spinner stuck.
       if (clickTimeoutRef.current) {
           clearTimeout(clickTimeoutRef.current)
           clickTimeoutRef.current = null
           restartFromStart()
           return
       }
       clickTimeoutRef.current = setTimeout(function() {
           clickTimeoutRef.current = null
           if (!resumeTunePlayback(mediaController, getViewedTuneId())) {
               startPlayback()
           }
       }, 400)
   }

   function handlePausePress() {
       // Pause immediately. A second click within the window (on the play
       // button that replaces pause) restarts from the start.
       if (clickTimeoutRef.current) {
           clearTimeout(clickTimeoutRef.current)
           clickTimeoutRef.current = null
       }
       mediaController.pause()
       armDoubleClickWindow()
   }
   
   if (showPlaybackControls()) {
       return <ButtonGroup>
                <>
                    <PlaylistModal
                      isPlaying={mediaController.isPlaying}
                      tunebook={tunebook}
                      buttonSize={buttonSize}
                      nowPlayingQueue={nowPlayingQueue}
                      setNowPlayingQueue={setNowPlayingQueue}
                      tunes={tunes || {}}
                    />
                    {(showButtons && mediaController.isLoading) && <Button size={useButtonSize} variant="secondary" className="header-playback-play-btn" onClick={function() {
                        if (clickTimeoutRef.current) {
                            clearTimeout(clickTimeoutRef.current)
                            clickTimeoutRef.current = null
                        }
                        mediaController.pause()
                        mediaController.setIsLoading(false)
                        mediaController.setIsReady(false)
                    }} >{tunebook.icons.waiting}</Button>}
                    {(showButtons  && !mediaController.isLoading) && <>
                        {(mediaController.isPlaying) 
                            ? <Button size={useButtonSize} variant="warning" className="header-playback-play-btn" data-testid="media-pause-button" onClick={handlePausePress} >{tunebook.icons.pause}</Button>
                           
                            : <Button size={useButtonSize} variant={playDisabledOffline ? 'secondary' : 'success'} className="header-playback-play-btn" data-testid="media-play-button" disabled={playDisabledOffline} title={playDisabledOffline ? 'Media is not cached for offline playback' : undefined} onClick={handlePlayPress} >{tunebook.icons.play}</Button>}
                    </>}
                    <MediaPlayerOptionsModal user={user} currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} tunes={tunes} setNowPlayingQueue={setNowPlayingQueue} />
                </>
            </ButtonGroup>
    } else {
        return <ButtonGroup>
            <PlaylistModal
              isPlaying={mediaController.isPlaying}
              tunebook={tunebook}
              buttonSize={buttonSize}
              nowPlayingQueue={nowPlayingQueue}
              setNowPlayingQueue={setNowPlayingQueue}
              tunes={tunes || {}}
            />
            <Button size={useButtonSize} variant="success" className="header-playback-play-btn" onClick={function() { tunebook.fillAnyPlaylist(currentTuneBook,selected,tagFilter , navigate, genreFilter, artistFilter)}} >{tunebook.icons.play}</Button>
            <MediaPlayerOptionsModal user={user} variant="success" currentTuneBook={currentTuneBook} tagFilter={tagFilter} selected={selected} mediaController={mediaController} tunebook={tunebook} buttonSize={buttonSize} tunes={tunes} setNowPlayingQueue={setNowPlayingQueue} />
        </ButtonGroup>
    }
}
