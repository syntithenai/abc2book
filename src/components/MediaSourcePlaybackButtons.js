import { Button, Form } from 'react-bootstrap'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  mediaLinkPlaybackIcon,
  resolveMediaLinkPlaybackButton,
} from '../mediaLinkPlaybackButton'
import {
  buildMediaSourceOptions,
  getActiveMediaSourceId,
  mediaSourceNeedsLogin,
} from '../mediaSourceMenuAccess'
import { getMediaPlaybackSettings } from '../pitchTempoUtils'

export default function MediaSourcePlaybackButtons({
  tune,
  tunebook,
  mediaController,
  suppressRouteNavigation = false,
  presentation = 'buttons',
  login,
  accessToken,
  className,
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
      if (!mediaController.hasPendingPlayRequest || !mediaController.hasPendingPlayRequest()) {
        startPlaybackFromGesture(sameSource ? {} : { fresh: true })
      }
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
      if (!mediaController.hasPendingPlayRequest || !mediaController.hasPendingPlayRequest()) {
        startPlaybackFromGesture({ fresh: true, restart: true })
      }
    }
    if (!suppressRouteNavigation && location.pathname !== path) {
      navigate(path)
    }
  }

  function handleSourceSelect(sourceId) {
    if (!sourceId) return
    if (sourceId === 'midi') {
      handleMidiPlayback()
      return
    }
    if (sourceId.indexOf('link-') === 0) {
      const linkKey = parseInt(sourceId.slice(5), 10)
      if (!isNaN(linkKey)) handleLinkPlayback(linkKey)
    }
  }

  function renderSourceLinkButtons() {
    return (
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
            variant={
              mediaController.isMidiPlaybackRoute && mediaController.isMidiPlaybackRoute()
                ? 'success'
                : 'outline-success'
            }
            onClick={handleMidiPlayback}
          >
            {tunebook.icons.music} {tunebook.icons.play}
          </Button>
        ) : null}
      </>
    )
  }

  function renderSourceSelect(selectClassName) {
    const options = buildMediaSourceOptions(tune, tunebook)
    if (options.length === 0) return null
    const activeId = getActiveMediaSourceId(mediaController)
    const selectedOption = options.find(function(option) { return option.id === activeId }) || options[0]
    const loginGate = mediaSourceNeedsLogin(
      selectedOption,
      mediaController.mediaResolverStatus,
      accessToken,
      mediaController.resolverFeatures,
      getMediaPlaybackSettings(tune)
    )

    if (options.length === 1) {
      return (
        <div className={'media-source-select' + (selectClassName ? ' ' + selectClassName : '')}>
          <span className="media-source-select-single">{options[0].label}</span>
        </div>
      )
    }

    return (
      <div className={'media-source-select' + (selectClassName ? ' ' + selectClassName : '')}>
        <Form.Select
          size="sm"
          className="media-source-select-input"
          aria-label="Audio source"
          value={activeId || options[0].id}
          onChange={function(e) { handleSourceSelect(e.target.value) }}
        >
          {options.map(function(option) {
            return (
              <option key={option.id} value={option.id}>{option.label}</option>
            )
          })}
        </Form.Select>
        {loginGate ? (
          <Button
            size="sm"
            variant="primary"
            className="media-source-select-login"
            onClick={function() {
              if (typeof login === 'function') login()
            }}
          >
            Login to play YouTube
          </Button>
        ) : null}
      </div>
    )
  }

  if (!hasLinks && !hasMusic) return null

  if (presentation === 'both') {
    return (
      <div className={'media-source-both' + (className ? ' ' + className : '')}>
        <div className="media-source-buttons-row">
          {renderSourceLinkButtons()}
        </div>
        {renderSourceSelect('media-source-both-select')}
      </div>
    )
  }

  if (presentation === 'select') {
    return renderSourceSelect(className)
  }

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
        renderSourceLinkButtons()
      )}
    </>
  )
}
