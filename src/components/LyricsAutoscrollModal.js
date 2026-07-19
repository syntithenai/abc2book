import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const triggerRef = useRef(null);
  const ignoreBlurUntilRef = useRef(0);

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

  const handleClose = useCallback(function() {
    autoscroll.stop();
    setShow(false);
    if (props.onAutoClose) props.onAutoClose();
  }, [autoscroll.stop, props.onAutoClose]);

  useEffect(function() {
    if (isInline || !show || !barRef.current) return;
    ignoreBlurUntilRef.current = Date.now() + 300;
    barRef.current.focus({ preventScroll: true });
  }, [show, isInline]);

  // Close when pointer is outside the floating bar (blur alone fails on mobile).
  useEffect(function() {
    if (isInline || !show) return undefined;

    function handlePointerDown(event) {
      const target = event.target;
      if (barRef.current && barRef.current.contains(target)) return;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      handleClose();
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return function() {
      document.removeEventListener('pointerdown', handlePointerDown, true);
    };
  }, [show, isInline, handleClose]);

  function handleShow(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    ignoreBlurUntilRef.current = Date.now() + 300;
    setShow(true);
  }

  function handleBarBlur(event) {
    if (Date.now() < ignoreBlurUntilRef.current) return;
    const next = event.relatedTarget;
    if (!barRef.current) return;
    if (next && barRef.current.contains(next)) return;
    // Defer so in-bar button clicks (relatedTarget often null on mobile) settle.
    window.setTimeout(function() {
      if (!barRef.current) return;
      if (barRef.current.contains(document.activeElement)) return;
      if (Date.now() < ignoreBlurUntilRef.current) return;
      handleClose();
    }, 0);
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

  const floatingBar = show ? (
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
  ) : null;

  return (
    <>
      <span ref={triggerRef} className="lyrics-autoscroll-trigger-wrap">
        <Button
          variant={props.buttonVariant || 'outline-secondary'}
          size={props.buttonSize || undefined}
          className="music-toolbar-btn"
          aria-label="Lyrics autoscroll"
          aria-expanded={show}
          onClick={handleShow}
        >
          {props.tunebook.icons.stopwatch}
        </Button>
      </span>

      {floatingBar && typeof document !== 'undefined'
        ? createPortal(floatingBar, document.body)
        : null}
    </>
  );
}
