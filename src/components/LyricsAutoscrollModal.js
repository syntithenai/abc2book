import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, ButtonGroup } from 'react-bootstrap';
import useLyricsAutoscroll from '../useLyricsAutoscroll';
import {
  formatScrollDurationLabel,
  formatSpeedPercent,
  getTuneLyricsScrollSpeed,
} from '../lyricsAutoscrollUtils';

function AutoscrollControls(props) {
  const autoscroll = props.autoscroll;
  const tunebook = props.tunebook;
  const buttonVariant = props.buttonVariant || 'outline-secondary';
  const buttonSize = props.buttonSize || 'sm';
  const showClose = !!props.showClose;
  const onClose = props.onClose;
  const groupSpeedControls = !!props.groupSpeedControls;

  const baseDuration = autoscroll.getBaseDurationSeconds();
  const speedLabel = formatSpeedPercent(autoscroll.speedMultiplier);
  const durationLabel = formatScrollDurationLabel(baseDuration, autoscroll.speedMultiplier);

  const speedControls = groupSpeedControls ? (
    <>
      <ButtonGroup size={buttonSize} className="lyrics-autoscroll-speed-group">
        <Button
          variant={buttonVariant}
          className="lyrics-autoscroll-speed-btn"
          aria-label="Slower scroll"
          onClick={autoscroll.decreaseSpeed}
        >
          −
        </Button>
        <Button
          variant={buttonVariant}
          disabled
          className="lyrics-autoscroll-speed-readout"
          aria-label={'Scroll speed ' + speedLabel}
        >
          {speedLabel}
        </Button>
        <Button
          variant={buttonVariant}
          className="lyrics-autoscroll-speed-btn"
          aria-label="Faster scroll"
          onClick={autoscroll.increaseSpeed}
        >
          +
        </Button>
      </ButtonGroup>
      <span className="lyrics-autoscroll-duration-label">~{durationLabel}</span>
    </>
  ) : (
    <>
      <Button
        size={buttonSize}
        variant={buttonVariant}
        className="lyrics-autoscroll-speed-btn"
        aria-label="Slower scroll"
        onClick={autoscroll.decreaseSpeed}
      >
        −
      </Button>
      <span className="lyrics-autoscroll-speed-label" aria-live="polite">
        {speedLabel}
        <span className="lyrics-autoscroll-duration-label"> ~{durationLabel}</span>
      </span>
      <Button
        size={buttonSize}
        variant={buttonVariant}
        className="lyrics-autoscroll-speed-btn"
        aria-label="Faster scroll"
        onClick={autoscroll.increaseSpeed}
      >
        +
      </Button>
    </>
  );

  return (
    <>
      <span className="lyrics-autoscroll-title">Scroll</span>
      <Button
        size={buttonSize}
        variant={autoscroll.isScrolling ? 'danger' : 'success'}
        className="lyrics-autoscroll-bar-btn lyrics-autoscroll-play-btn"
        aria-label={autoscroll.isScrolling ? 'Stop lyrics scroll' : 'Start lyrics scroll'}
        onClick={function() {
          if (autoscroll.isScrolling) autoscroll.stop();
          else autoscroll.start();
        }}
      >
        {autoscroll.isScrolling ? tunebook.icons.pause : tunebook.icons.play}
      </Button>
      <Button
        size={buttonSize}
        variant={buttonVariant}
        className="lyrics-autoscroll-bar-btn"
        aria-label="Rewind to top of lyrics"
        onClick={autoscroll.rewind}
      >
        {tunebook.icons.arrowgoback}
      </Button>
      {speedControls}
      {autoscroll.nothingToScroll ? (
        <span className="lyrics-autoscroll-hint">Fits on screen</span>
      ) : null}
      {showClose ? (
        <Button
          size={buttonSize}
          variant={buttonVariant}
          className="lyrics-autoscroll-bar-btn lyrics-autoscroll-close-btn"
          aria-label="Close lyrics scroll controls"
          onClick={onClose}
        >
          {tunebook.icons.closecircle}
        </Button>
      ) : null}
    </>
  );
}

export default function LyricsAutoscrollModal(props) {
  const [show, setShow] = useState(false);
  const barRef = useRef(null);

  const tuneRef = useRef(props.tune);
  tuneRef.current = props.tune;
  const saveTune = props.tunebook && props.tunebook.saveTune;

  const saveScrollSpeed = useCallback(function(speedMultiplier) {
    const tune = tuneRef.current;
    if (!tune || !tune.id || typeof saveTune !== 'function') return;
    if (getTuneLyricsScrollSpeed(tune) === speedMultiplier) return;
    // Persist outside React state updaters so saveTune's setState calls
    // cannot nest into an update-depth loop.
    saveTune(
      Object.assign({}, tune, {
        id: tune.id,
        lyricsScrollSpeed: speedMultiplier,
      }),
      false,
      { skipHistory: true }
    );
  }, [saveTune]);

  const musicSingleSelector = props.musicSingleSelector || '.music-single';

  const autoscroll = useLyricsAutoscroll({
    tune: props.tune,
    mediaController: props.mediaController,
    mediaLinkNumber: props.mediaLinkNumber,
    onSpeedChange: saveScrollSpeed,
    musicSingleSelector: musicSingleSelector,
  });

  const barLayout = props.barLayout || 'default';
  const isInline = barLayout === 'gig-inline';

  useEffect(function() {
    if (props.autoOpen) setShow(true);
  }, [props.autoOpen]);

  useEffect(function() {
    if (isInline || !props.setBlockKeyboardShortcuts) return undefined;
    props.setBlockKeyboardShortcuts(show);
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false);
    };
  }, [show, props.setBlockKeyboardShortcuts, isInline]);

  useEffect(function() {
    if (isInline || !show || !barRef.current) return;
    barRef.current.focus();
  }, [show, isInline]);

  function handleClose() {
    autoscroll.stop();
    setShow(false);
    if (props.onAutoClose) props.onAutoClose();
  }

  function handleShow(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShow(true);
  }

  function handleBarBlur(event) {
    const next = event.relatedTarget;
    if (!barRef.current) return;
    if (next && barRef.current.contains(next)) return;
    handleClose();
  }

  const barClassName = 'lyrics-autoscroll-bar'
    + (barLayout === 'gig' ? ' lyrics-autoscroll-bar--gig' : '')
    + (isInline ? ' lyrics-autoscroll-bar--inline' : '');

  const controlProps = {
    autoscroll: autoscroll,
    tunebook: props.tunebook,
    buttonVariant: props.buttonVariant || 'outline-secondary',
    buttonSize: props.buttonSize || 'sm',
    groupSpeedControls: isInline,
  };

  if (isInline) {
    return (
      <div className={barClassName}>
        <div className="lyrics-autoscroll-bar-panel lyrics-autoscroll-bar-panel--inline">
          <div className="lyrics-autoscroll-bar-inner">
            <AutoscrollControls {...controlProps} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Button
        variant={props.buttonVariant || 'outline-secondary'}
        size={props.buttonSize || undefined}
        className="music-toolbar-btn"
        aria-label="Lyrics autoscroll"
        onClick={handleShow}
      >
        {props.tunebook.icons.stopwatch}
      </Button>

      {show ? (
        <div
          ref={barRef}
          className={barClassName}
          tabIndex={-1}
          onBlur={handleBarBlur}
          onClick={function(e) { e.stopPropagation(); }}
        >
          <div className="lyrics-autoscroll-bar-panel">
            <div className="lyrics-autoscroll-bar-inner">
              <AutoscrollControls {...controlProps} showClose={true} onClose={handleClose} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
