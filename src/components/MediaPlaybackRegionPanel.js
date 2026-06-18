import React, { useState, useEffect, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';
import { formatSecondsToMs, parseMsToSeconds, isPlaybackLoopEnabled } from '../mediaPlaybackUtils';

export default function MediaPlaybackRegionPanel({ tune, tunebook, mediaController, linkIndex }) {
  const [startMs, setStartMs] = useState('');
  const [endMs, setEndMs] = useState('');
  const [loopEnabled, setLoopEnabled] = useState(false);
  const saveTimerRef = useRef(null);

  useEffect(function() {
    if (!tune || linkIndex === null || !tune.links || !tune.links[linkIndex]) return;
    const link = tune.links[linkIndex];
    setStartMs(link.startAt ? formatSecondsToMs(parseMsToSeconds(link.startAt)) : '');
    setEndMs(link.endAt ? formatSecondsToMs(parseMsToSeconds(link.endAt)) : '');
    setLoopEnabled(isPlaybackLoopEnabled(link));
  }, [
    tune ? tune.id : null,
    linkIndex,
    tune && tune.links && linkIndex !== null && tune.links[linkIndex] ? tune.links[linkIndex].startAt : null,
    tune && tune.links && linkIndex !== null && tune.links[linkIndex] ? tune.links[linkIndex].endAt : null,
    tune && tune.links && linkIndex !== null && tune.links[linkIndex] ? tune.links[linkIndex].playbackLoop : null,
  ]);

  function scheduleSave(nextStart, nextEnd, nextLoop) {
    if (!tune || !tunebook || linkIndex === null) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(function() {
      const links = tune.links.map(function(link, idx) {
        if (idx !== linkIndex) return link;
        return Object.assign({}, link, {
          startAt: nextStart,
          endAt: nextEnd,
          playbackLoop: nextLoop,
        });
      });
      const updated = Object.assign({}, tune, { links: links });
      tunebook.saveTune(updated);
    }, 400);
  }

  function applyRegion(nextStart, nextEnd, nextLoop) {
    setStartMs(nextStart);
    setEndMs(nextEnd);
    setLoopEnabled(nextLoop);
    const startSeconds = parseMsToSeconds(nextStart);
    const endSeconds = parseMsToSeconds(nextEnd);
    if (mediaController && mediaController.updateLinkPlaybackRegion) {
      mediaController.updateLinkPlaybackRegion(linkIndex, startSeconds, endSeconds, nextLoop);
    }
    scheduleSave(startSeconds > 0 ? String(startSeconds) : '', endSeconds > 0 ? String(endSeconds) : '', nextLoop);
  }

  function handleStartChange(value) {
    applyRegion(value, endMs, loopEnabled);
  }

  function handleEndChange(value) {
    applyRegion(startMs, value, loopEnabled);
  }

  function handleLoopToggle() {
    applyRegion(startMs, endMs, !loopEnabled);
  }

  if (!tune || linkIndex === null || !tune.links || !tune.links[linkIndex]) return null;

  return (
    <div className="media-playback-region-panel">
      <h6>Playback region</h6>
      <p className="scope-note">Start and end in minutes:seconds. Loop repeats the selected region.</p>
      <div className="region-inputs">
        <Form.Group className="region-field">
          <Form.Label>Start</Form.Label>
          <Form.Control
            type="text"
            placeholder="0:00"
            value={startMs}
            onChange={(e) => handleStartChange(e.target.value)}
          />
        </Form.Group>
        <Form.Group className="region-field">
          <Form.Label>End</Form.Label>
          <Form.Control
            type="text"
            placeholder="0:00"
            value={endMs}
            onChange={(e) => handleEndChange(e.target.value)}
          />
        </Form.Group>
        <Form.Group className="region-field region-loop">
          <Form.Label>Loop</Form.Label>
          <Button
            variant={loopEnabled ? 'primary' : 'outline-secondary'}
            size="sm"
            onClick={handleLoopToggle}
            aria-pressed={loopEnabled}
          >
            {loopEnabled ? 'On' : 'Off'}
          </Button>
        </Form.Group>
      </div>
    </div>
  );
}
