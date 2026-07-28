import { Button } from 'react-bootstrap'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  mediaLinkPlaybackIcon,
  resolveMediaLinkPlaybackButton,
} from '../mediaLinkPlaybackButton'

export default function MediaSourcePlaybackButtons({
  tune,
  tunebook,
  mediaController,
  suppressRouteNavigation = false,
}) {
  const navigate = useNavigate()
  const location = useLocation()

  if (!tune) return null

  const hasMusic = !!(tunebook.hasNotesOrChords && tunebook.hasNotesOrChords(tune))
  const hasLinks = !!(tunebook.hasLinks && tunebook.hasLinks(tune))

  function startPlaybackFromGesture(options) {
    if (mediaController.playFromUserGesture) {
      mediaController.playFromUserGesture(options)
    } else if (options && options.restart && mediaController.restartPlaybackFromStart) {
      mediaController.restartPlaybackFromStart()
    } else {
      mediaController.play()
    }
  }

  function cancelPendingPlayback() {
    if (mediaController.abortPlayingIntent) {
      mediaController.abortPlayingIntent()
    } else {
      mediaController.pause()
      mediaController.setIsLoading(false)
    }
    mediaController.setIsReady(false)
  }

  function requestPlaybackForTarget(target) {
    if (!mediaController.requestPlayback) return false
    return mediaController.requestPlayback({
      tuneId: tune.id,
      playState: target.playState,
      linkNum: target.linkNum,
      fromUserGesture: true,
      fresh: target.fresh,
      restart: target.restart,
    })
  }

  function applyRouteForTarget(target) {
    if (!mediaController.applyPlaybackRoute) return
    const linkParam = target.playState === 'playMedia'
      ? String(target.linkNum != null ? target.linkNum : 0)
      : '0'
    mediaController.applyPlaybackRoute(target.playState, linkParam, tune, tunebook)
  }

  function handleLinkPlayback(linkKey) {
    if (mediaController.setTune) {
      mediaController.setTune(tune)
    }
    const sameSource = mediaController.isMediaPlaybackRoute
      && mediaController.isMediaPlaybackRoute()
      && mediaController.mediaLinkNumber === linkKey
    const path = '/tunes/' + tune.id + '/playMedia/' + linkKey
    applyRouteForTarget({
      playState: 'playMedia',
      linkNum: linkKey,
    })
    if (!requestPlaybackForTarget({
      playState: 'playMedia',
      linkNum: linkKey,
      fresh: !sameSource,
    })) {
      startPlaybackFromGesture(sameSource ? {} : { fresh: true })
    }
    if (!suppressRouteNavigation && location.pathname !== path) {
      navigate(path)
    }
  }

  function handleMidiPlayback() {
    if (mediaController.setTune) {
      mediaController.setTune(tune)
    }
    const sameSource = mediaController.isMidiPlaybackRoute
      && mediaController.isMidiPlaybackRoute()
    const kickoffActive = mediaController.isMidiKickoffActiveRef
      && mediaController.isMidiKickoffActiveRef.current
      && mediaController.isMidiKickoffActiveRef.current()
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0569dc'},body:JSON.stringify({sessionId:'0569dc',hypothesisId:'H1',location:'MediaSourcePlaybackButtons.js:handleMidiPlayback',message:'midi button click',data:{tuneId:tune&&tune.id,sameSource:!!sameSource,kickoffActive:!!kickoffActive,isLoading:!!mediaController.isLoading,hasPlayMidiRef:!!(mediaController.playMidiRef&&mediaController.playMidiRef.current)},timestamp:Date.now()})}).catch(function(){})
    // #endregion
    if (kickoffActive || (sameSource && mediaController.isLoading)) {
      return
    }
    const path = '/tunes/' + tune.id + '/playMidi'
    applyRouteForTarget({ playState: 'playMidi' })
    if (!requestPlaybackForTarget({
      playState: 'playMidi',
      fresh: !sameSource,
      restart: true,
    })) {
      startPlaybackFromGesture({ fresh: true, restart: true })
    }
    if (!suppressRouteNavigation && location.pathname !== path) {
      navigate(path)
    }
  }

  if (!hasLinks && !hasMusic) return null

  return (
    <>
      {mediaController.isLoading ? (
        <Button
          variant="secondary"
          title="Cancel loading"
          aria-label="Cancel loading"
          onClick={cancelPendingPlayback}
        >
          {tunebook.icons.waiting}
        </Button>
      ) : mediaController.isPlaying ? (
        <Button
          variant="warning"
          title="Pause"
          aria-label="Pause"
          onClick={function() { mediaController.pause() }}
        >
          {tunebook.icons.pause} Pause
        </Button>
      ) : (
        <>
          {hasLinks ? tune.links.map(function(link, linkKey) {
            if (!link || !link.link || !String(link.link).trim()) return null
            const isYoutubeLink = tunebook.utils && tunebook.utils.isYoutubeLink
            const buttonProps = resolveMediaLinkPlaybackButton(link, isYoutubeLink)
            const isActiveLink = mediaController.isMediaPlaybackRoute
              && mediaController.isMediaPlaybackRoute()
              && mediaController.mediaLinkNumber === linkKey
            return (
              <Button
                key={linkKey}
                style={{ marginLeft: '0.1em' }}
                variant={isActiveLink ? buttonProps.variant : 'outline-' + buttonProps.variant}
                className={buttonProps.className}
                title={buttonProps.label
                  ? buttonProps.label + ' link ' + (linkKey + 1)
                  : 'Media link ' + (linkKey + 1)}
                onClick={function() { handleLinkPlayback(linkKey) }}
              >
                {mediaLinkPlaybackIcon(tunebook, buttonProps.iconKey)}
                {' '}
                {tunebook.icons.play}
                {' '}
                {linkKey + 1}
              </Button>
            )
          }) : null}
          {hasMusic ? (
            <Button
              style={{ marginLeft: '0.1em' }}
              variant="success"
              onClick={handleMidiPlayback}
            >
              {tunebook.icons.music} {tunebook.icons.play}
            </Button>
          ) : null}
        </>
      )}
    </>
  )
}
