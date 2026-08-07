import {Button, ButtonGroup} from 'react-bootstrap'
import MediaPlayerOptionsModal from './MediaPlayerOptionsModal'
import {useNavigate, useLocation} from 'react-router-dom'
import {useEffect, useState} from 'react'
import {
  startTunePlayback,
  resumeTunePlayback,
  resolvePlaybackTarget,
} from '../tunePlaybackActions'
import { getCurrentTuneId } from '../nowPlayingQueue'
import { isNavigatorOffline, isTuneOfflinePlayable } from '../offlinePlayback'
import { getViewedTuneIdFromPath, isTuneListPath } from '../playbackNavigationUtils'

function useOfflinePlayDisabled(mediaController, tunebook, location, viewedTune) {
  const [playDisabled, setPlayDisabled] = useState(false)
  const tuneId = viewedTune && viewedTune.id ? viewedTune.id : null
  const pathname = location.pathname
  const linkNum = mediaController.mediaLinkNumber

  useEffect(function() {
    let cancelled = false

    function refresh() {
      if (!isNavigatorOffline()) {
        if (!cancelled) setPlayDisabled(false)
        return
      }
      const tune = viewedTune
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
  }, [mediaController, tunebook, location, tuneId, pathname, linkNum, viewedTune])

  return playDisabled
}

function viewedTuneIsPlayable(tunebook, tune) {
  if (!tune) return false
  return tunebook.hasNotesOrChords(tune)
    || (Array.isArray(tune.links) && tune.links.length > 0)
}

function resolveViewedTuneForHeader(tunebook, tunes, viewedTuneId, currentTuneBook) {
  if (!viewedTuneId) return null
  if (tunes && tunes[viewedTuneId]) return tunes[viewedTuneId]
  if (tunebook && currentTuneBook && typeof tunebook.fromBook === 'function') {
    const bookTunes = tunebook.fromBook(currentTuneBook)
    if (Array.isArray(bookTunes)) {
      for (let i = 0; i < bookTunes.length; i++) {
        const candidate = bookTunes[i]
        if (candidate && candidate.id === viewedTuneId) return candidate
      }
    }
  }
  return null
}

export default function MediaPlayerButtons({
  mediaController,
  tunebook,
  buttonSize,
  nowPlayingQueue,
  setNowPlayingQueue,
  currentTuneBook,
  tagFilter,
  genreFilter,
  artistFilter,
  selected,
  onOpenNowPlaying,
  user,
  tunes,
}) {
   var useButtonSize=(buttonSize ? buttonSize : 'lg')
   const location = useLocation()
   const navigate = useNavigate()
   const viewedTuneId = getViewedTuneIdFromPath(location.pathname)
   const viewedTune = resolveViewedTuneForHeader(tunebook, tunes, viewedTuneId, currentTuneBook)
   const searchListIds = tunebook.getSearchListOrderedIds
     ? tunebook.getSearchListOrderedIds()
     : []
   const firstSearchTuneId = Array.isArray(searchListIds) && searchListIds.length > 0
     ? searchListIds[0]
     : null
   const firstSearchTune = firstSearchTuneId && tunes ? tunes[firstSearchTuneId] : null
   const onTuneList = isTuneListPath(location.pathname)
   const canPlayFirstSearchResult = !!(
     !viewedTuneId
     && onTuneList
     && firstSearchTune
     && viewedTuneIsPlayable(tunebook, firstSearchTune)
   )
   const playTargetTune = viewedTune || (canPlayFirstSearchResult ? firstSearchTune : null)
   const playDisabledOffline = useOfflinePlayDisabled(mediaController, tunebook, location, playTargetTune)

   if (!viewedTuneId) {
     if (!canPlayFirstSearchResult) {
       return null
     }
   } else if (!viewedTuneIsPlayable(tunebook, viewedTune)) {
     return null
   }

   function startPlayback() {
       const tune = playTargetTune
       if (!tune) return
       startTunePlayback(mediaController, tunebook, navigate, location, {
         nowPlayingQueue: nowPlayingQueue,
         setNowPlayingQueue: setNowPlayingQueue,
         tunes: tunes,
         playTuneId: tune.id,
       })
   }

   function handlePlayPress() {
       if (!viewedTuneId) {
         startPlayback()
         return
       }
       if (!resumeTunePlayback(mediaController, viewedTuneId, { queue: nowPlayingQueue })) {
           startPlayback()
       }
   }

   function handlePausePress() {
       mediaController.pause()
   }

   const canResumeViewed = mediaController.canResumePlayback
     && mediaController.canResumePlayback()
     && mediaController.tune
     && mediaController.tune.id === viewedTuneId
   const playLabel = canResumeViewed ? 'Resume' : 'Play'
   const playTitle = playDisabledOffline
     ? 'Media is not cached for offline playback'
     : playLabel

   return (
     <ButtonGroup>
       {mediaController.isLoading ? (
         <Button
           size={useButtonSize}
           variant="secondary"
           className="header-playback-play-btn"
           title="Cancel loading"
           onClick={function() {
             mediaController.pause()
             mediaController.setIsLoading(false)
             mediaController.setIsReady(false)
           }}
         >
           {tunebook.icons.waiting}
         </Button>
       ) : mediaController.isPlaying ? (
         <Button
           size={useButtonSize}
           variant="warning"
           className="header-playback-play-btn"
           data-testid="media-pause-button"
           title="Pause"
           aria-label="Pause"
           onClick={handlePausePress}
         >
           {tunebook.icons.pause}
         </Button>
       ) : (
         <Button
           size={useButtonSize}
           variant={playDisabledOffline ? 'secondary' : 'success'}
           className="header-playback-play-btn"
           data-testid="media-play-button"
           disabled={playDisabledOffline}
           title={playTitle}
           aria-label={playLabel}
           onClick={handlePlayPress}
         >
           {tunebook.icons.play}
         </Button>
       )}
       <MediaPlayerOptionsModal
         user={user}
         currentTuneBook={currentTuneBook}
         tagFilter={tagFilter}
         selected={selected}
         mediaController={mediaController}
         tunebook={tunebook}
         buttonSize={buttonSize}
         tunes={tunes}
         nowPlayingQueue={nowPlayingQueue}
         setNowPlayingQueue={setNowPlayingQueue}
         onOpenNowPlaying={onOpenNowPlaying}
       />
     </ButtonGroup>
   )
}
