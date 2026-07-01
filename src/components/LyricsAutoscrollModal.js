import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import useLyricsAutoscroll from '../useLyricsAutoscroll';
import {
  formatScrollDurationLabel,
  formatSpeedPercent,
} from '../lyricsAutoscrollUtils';

export default function LyricsAutoscrollModal(props) {
  const [show, setShow] = useState(false);
  const barRef = useRef(null);

  const saveScrollSpeed = useCallback(function(speedMultiplier) {
    const tune = props.tune;
    if (!tune || !props.tunebook) return;
    tune.lyricsScrollSpeed = speedMultiplier;
    props.tunebook.saveTune(tune);
  }, [props.tune, props.tunebook]);

  const autoscroll = useLyricsAutoscroll({
    tune: props.tune,
    mediaController: props.mediaController,
    mediaLinkNumber: props.mediaLinkNumber,
    onSpeedChange: saveScrollSpeed,
  });

  useEffect(function() {
    if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(show);
    return function() {
      if (props.setBlockKeyboardShortcuts) props.setBlockKeyboardShortcuts(false);
    };
  }, [show, props.setBlockKeyboardShortcuts]);

  useEffect(function() {
    if (!show || !barRef.current) return;
    barRef.current.focus();
  }, [show]);

  useEffect(function() {
    const musicSingle = document.querySelector('.music-single');
    if (!musicSingle) return undefined;
    if (show) musicSingle.classList.add('lyrics-autoscroll-active');
    else musicSingle.classList.remove('lyrics-autoscroll-active');
    return function() {
      musicSingle.classList.remove('lyrics-autoscroll-active');
    };
  }, [show]);

  function handleClose() {
    autoscroll.stop();
    setShow(false);
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

  const baseDuration = autoscroll.getBaseDurationSeconds();
  const speedLabel = formatSpeedPercent(autoscroll.speedMultiplier);
  const durationLabel = formatScrollDurationLabel(baseDuration, autoscroll.speedMultiplier);

  return (
    <>
      <Button
        variant="outline-secondary"
        className="music-toolbar-btn"
        aria-label="Lyrics autoscroll"
        onClick={handleShow}
      >
        {props.tunebook.icons.scrollDown}
      </Button>

      {show ? (
        <div
          ref={barRef}
          className="lyrics-autoscroll-bar"
          tabIndex={-1}
          onBlur={handleBarBlur}
          onClick={function(e) { e.stopPropagation(); }}
        >
          <div className="lyrics-autoscroll-bar-inner">
            <span className="lyrics-autoscroll-title">Scroll</span>
            <Button
              size="sm"
              variant={autoscroll.isScrolling ? 'danger' : 'success'}
              className="lyrics-autoscroll-bar-btn"
              aria-label={autoscroll.isScrolling ? 'Stop lyrics scroll' : 'Start lyrics scroll'}
              onClick={function() {
                if (autoscroll.isScrolling) autoscroll.stop();
                else autoscroll.start();
              }}
            >
              {autoscroll.isScrolling ? props.tunebook.icons.pause : props.tunebook.icons.play}
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              className="lyrics-autoscroll-bar-btn"
              aria-label="Rewind to top of lyrics"
              onClick={autoscroll.rewind}
            >
              {props.tunebook.icons.arrowgoback}
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
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
              size="sm"
              variant="outline-secondary"
              className="lyrics-autoscroll-speed-btn"
              aria-label="Faster scroll"
              onClick={autoscroll.increaseSpeed}
            >
              +
            </Button>
            {autoscroll.nothingToScroll ? (
              <span className="lyrics-autoscroll-hint">Fits on screen</span>
            ) : null}
            <Button
              size="sm"
              variant="outline-secondary"
              className="lyrics-autoscroll-bar-btn lyrics-autoscroll-close-btn"
              aria-label="Close lyrics scroll controls"
              onClick={handleClose}
            >
              {props.tunebook.icons.closecircle}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
