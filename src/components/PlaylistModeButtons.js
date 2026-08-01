import { Button, ButtonGroup, ToggleButton } from 'react-bootstrap'
import {
  cycleRepeatMode,
  getRepeatMode,
  setFollowTune,
  setShuffle,
  isLessonQueue,
} from '../nowPlayingQueue'

const SHUFFLE_ICON_PATH = 'M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z'
const REPEAT_ICON_PATH = 'M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z'

const REPEAT_MODE_TITLES = {
  off: 'No repeat',
  playlist: 'Repeat playlist',
  track: 'Repeat track',
}

function PlaylistToggleIcon({ path, className }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      className={'playlist-toggle-icon' + (className ? ' ' + className : '')}
    >
      <path fill="currentColor" d={path} />
    </svg>
  )
}

export function PlaylistRepeatIcon({ mode, className, size }) {
  const repeatMode = mode || 'off'
  const dimension = size || 18
  const active = repeatMode !== 'off'
  return (
    <svg
      viewBox="0 0 24 24"
      width={dimension}
      height={dimension}
      aria-hidden="true"
      className={'playlist-repeat-icon' + (active ? ' playlist-repeat-icon--active' : '') + (className ? ' ' + className : '')}
    >
      <g transform="translate(12 12) scale(0.82) translate(-12 -12)">
        <path fill="currentColor" d={REPEAT_ICON_PATH} />
      </g>
      {repeatMode === 'track' ? (
        <text
          x="12"
          y="13.5"
          textAnchor="middle"
          fontSize="8.5"
          fontWeight="700"
          fill="currentColor"
          className="playlist-repeat-icon-one"
        >
          1
        </text>
      ) : null}
    </svg>
  )
}

export function PlaylistRepeatButton({
  nowPlayingQueue,
  setNowPlayingQueue,
  className,
  variant = 'outline-secondary',
  size,
  testId = 'playlist-repeat-button',
}) {
  const repeatMode = getRepeatMode(nowPlayingQueue)
  const active = repeatMode !== 'off'
  const btnSize = size || undefined

  return (
    <Button
      type="button"
      variant={active ? 'secondary' : variant}
      size={btnSize}
      className={className}
      title={REPEAT_MODE_TITLES[repeatMode]}
      aria-label={REPEAT_MODE_TITLES[repeatMode]}
      aria-pressed={active}
      data-testid={testId}
      onClick={function() {
        setNowPlayingQueue(cycleRepeatMode(nowPlayingQueue))
      }}
    >
      <PlaylistRepeatIcon mode={repeatMode} size={btnSize === 'sm' ? 16 : 18} />
    </Button>
  )
}

export default function PlaylistModeButtons({
  nowPlayingQueue,
  setNowPlayingQueue,
  className,
  showShuffle = true,
  showRepeat = true,
  showFollow = true,
  size = 'sm',
  repeatTestId = 'playlist-repeat-button',
  compact = false,
}) {
  const isLesson = isLessonQueue(nowPlayingQueue)

  return (
    <ButtonGroup
      size={size}
      className={'playlist-mode-buttons' + (className ? ' ' + className : '')}
      role="group"
      aria-label="Playlist playback modes"
    >
      {showShuffle && !isLesson ? (
        <ToggleButton
          id="playlist-mode-shuffle"
          type="checkbox"
          variant="outline-secondary"
          checked={!!nowPlayingQueue.shuffle}
          value="shuffle"
          title="Shuffle playlist"
          data-testid="playlist-shuffle-button"
          onChange={function(e) {
            setNowPlayingQueue(setShuffle(nowPlayingQueue, e.currentTarget.checked))
          }}
        >
          <PlaylistToggleIcon path={SHUFFLE_ICON_PATH} />
          {compact ? null : 'Shuffle'}
        </ToggleButton>
      ) : null}
      {showRepeat && !isLesson ? (
        <Button
          id="playlist-mode-repeat"
          type="button"
          variant={getRepeatMode(nowPlayingQueue) !== 'off' ? 'secondary' : 'outline-secondary'}
          title={REPEAT_MODE_TITLES[getRepeatMode(nowPlayingQueue)]}
          aria-label={REPEAT_MODE_TITLES[getRepeatMode(nowPlayingQueue)]}
          aria-pressed={getRepeatMode(nowPlayingQueue) !== 'off'}
          data-testid={repeatTestId}
          onClick={function() {
            setNowPlayingQueue(cycleRepeatMode(nowPlayingQueue))
          }}
        >
          <PlaylistRepeatIcon mode={getRepeatMode(nowPlayingQueue)} />
          {compact ? null : 'Repeat'}
        </Button>
      ) : null}
      {showFollow && !isLesson ? (
        <ToggleButton
          id="playlist-mode-follow"
          type="checkbox"
          variant="outline-secondary"
          checked={!!nowPlayingQueue.followTune}
          value="follow"
          title="Navigate to each song when it starts playing"
          data-testid="playlist-follow-button"
          onChange={function(e) {
            setNowPlayingQueue(setFollowTune(nowPlayingQueue, e.currentTarget.checked))
          }}
        >
          {compact ? (
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="playlist-toggle-icon">
              <path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-3.58 3.59L12 18l6-6-6-6z" />
            </svg>
          ) : null}
          {compact ? null : 'Follow'}
        </ToggleButton>
      ) : null}
    </ButtonGroup>
  )
}
