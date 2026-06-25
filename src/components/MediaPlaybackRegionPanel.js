import React, { useState, useEffect, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';
import {
  formatSecondsToMs,
  parseMsToSeconds,
  normalizePlaybackLoops,
  createPlaybackLoop,
  syncLegacyLinkLoopFields,
} from '../mediaPlaybackUtils';

function formatLoopStartAt(startAt) {
  if (!startAt && startAt !== 0) return '';
  const seconds = parseMsToSeconds(startAt);
  return seconds > 0 ? formatSecondsToMs(seconds) : '';
}

function formatLoopEndAt(endAt) {
  if (!endAt && endAt !== 0) return '';
  const seconds = parseMsToSeconds(endAt);
  return seconds > 0 ? formatSecondsToMs(seconds) : '';
}

function toStoredStartAt(displayValue) {
  const seconds = parseMsToSeconds(displayValue);
  return seconds > 0 ? String(seconds) : '';
}

function toStoredEndAt(displayValue) {
  const seconds = parseMsToSeconds(displayValue);
  return seconds > 0 ? String(seconds) : '';
}

export default function MediaPlaybackRegionPanel({ tune, tunebook, mediaController, linkIndex }) {
  const [loops, setLoops] = useState([]);
  const saveTimerRef = useRef(null);

  useEffect(function() {
    if (!tune || linkIndex === null || !tune.links || !tune.links[linkIndex]) return;
    const normalized = normalizePlaybackLoops(tune.links[linkIndex]);
    setLoops(normalized.map(function(loop) {
      return Object.assign({}, loop, {
        startDisplay: formatLoopStartAt(loop.startAt),
        endDisplay: formatLoopEndAt(loop.endAt),
      });
    }));
  }, [
    tune ? tune.id : null,
    linkIndex,
    tune && tune.links && linkIndex !== null && tune.links[linkIndex]
      ? JSON.stringify(tune.links[linkIndex].playbackLoops || [])
      : null,
    tune && tune.links && linkIndex !== null && tune.links[linkIndex] ? tune.links[linkIndex].startAt : null,
    tune && tune.links && linkIndex !== null && tune.links[linkIndex] ? tune.links[linkIndex].endAt : null,
  ]);

  function scheduleSave(nextLoops) {
    if (!tune || !tunebook || linkIndex === null) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(function() {
      const payload = nextLoops.map(function(loop) {
        return {
          id: loop.id,
          name: loop.name || '',
          startAt: toStoredStartAt(loop.startDisplay),
          endAt: toStoredEndAt(loop.endDisplay),
          active: !!loop.active,
        };
      });
      tunebook.saveTune(Object.assign({}, tune, {
        links: tune.links.map(function(link, idx) {
          if (idx !== linkIndex) return link;
          return syncLegacyLinkLoopFields(Object.assign({}, link, { playbackLoops: payload }));
        }),
      }));
    }, 400);
  }

  function applyLoops(nextLoops, options) {
    const opts = options || {};
    setLoops(nextLoops);
    const payload = nextLoops.map(function(loop) {
      return {
        id: loop.id,
        name: loop.name || '',
        startAt: toStoredStartAt(loop.startDisplay),
        endAt: toStoredEndAt(loop.endDisplay),
        active: !!loop.active,
      };
    });
    if (mediaController && mediaController.updateLinkPlaybackLoops) {
      mediaController.updateLinkPlaybackLoops(linkIndex, payload);
    }
    if (!opts.skipSave) scheduleSave(nextLoops);
  }

  function updateLoop(loopId, changes) {
    applyLoops(loops.map(function(loop) {
      if (loop.id !== loopId) return loop;
      return Object.assign({}, loop, changes);
    }));
  }

  function handleActiveChange(loopId) {
    const clicked = loops.find(function(loop) { return loop.id === loopId; });
    if (clicked && clicked.active) {
      applyLoops(loops.map(function(loop) {
        return Object.assign({}, loop, { active: false });
      }));
      return;
    }
    applyLoops(loops.map(function(loop) {
      return Object.assign({}, loop, { active: loop.id === loopId });
    }));
  }

  function handleAddLoop() {
    const next = loops.concat([Object.assign(createPlaybackLoop(), {
      startDisplay: '',
      endDisplay: '',
    })]);
    applyLoops(next);
  }

  function handleRemoveLoop(loopId) {
    applyLoops(loops.filter(function(loop) { return loop.id !== loopId; }));
  }

  function getCurrentPlaybackTimeFormatted() {
    const t = mediaController && mediaController.currentTime !== undefined && mediaController.currentTime !== null
      ? mediaController.currentTime
      : 0;
    return formatSecondsToMs(t);
  }

  function handleSetStartFromCurrent(loopId) {
    updateLoop(loopId, { startDisplay: getCurrentPlaybackTimeFormatted() });
  }

  function handleSetEndFromCurrent(loopId) {
    updateLoop(loopId, { endDisplay: getCurrentPlaybackTimeFormatted() });
  }

  if (!tune || linkIndex === null || !tune.links || !tune.links[linkIndex]) return null;

  return (
    <div className="media-playback-region-panel">
      <p className="scope-note">
        Create named loops with start and end times (m:ss). Check a loop to enable looping for that region; uncheck to turn looping off.
      </p>

      {loops.map(function(loop) {
        return (
          <div key={loop.id} className="playback-loop-row">
            <Form.Check
              type="checkbox"
              className="playback-loop-active"
              checked={!!loop.active}
              onChange={function() { handleActiveChange(loop.id); }}
              aria-label={'Active loop ' + (loop.name || loop.id)}
            />
            <Form.Control
              type="text"
              className="playback-loop-name"
              placeholder="Name"
              value={loop.name || ''}
              onChange={function(e) { updateLoop(loop.id, { name: e.target.value }); }}
            />
            <Form.Group className="region-field">
              <Form.Label>Start</Form.Label>
              <div className="region-field-row">
                <Form.Control
                  type="text"
                  placeholder="0:00"
                  value={loop.startDisplay || ''}
                  onChange={function(e) { updateLoop(loop.id, { startDisplay: e.target.value }); }}
                />
                <Button variant="outline-secondary" size="sm" onClick={function() { handleSetStartFromCurrent(loop.id); }}>
                  Set
                </Button>
              </div>
            </Form.Group>
            <Form.Group className="region-field">
              <Form.Label>End</Form.Label>
              <div className="region-field-row">
                <Form.Control
                  type="text"
                  placeholder="0:00"
                  value={loop.endDisplay || ''}
                  onChange={function(e) { updateLoop(loop.id, { endDisplay: e.target.value }); }}
                />
                <Button variant="outline-secondary" size="sm" onClick={function() { handleSetEndFromCurrent(loop.id); }}>
                  Set
                </Button>
              </div>
            </Form.Group>
            <Button
              variant="outline-danger"
              size="sm"
              className="playback-loop-remove"
              onClick={function() { handleRemoveLoop(loop.id); }}
              aria-label="Remove loop"
            >
              ×
            </Button>
          </div>
        );
      })}

      <Button variant="outline-primary" size="sm" onClick={handleAddLoop}>
        Add loop
      </Button>
    </div>
  );
}
