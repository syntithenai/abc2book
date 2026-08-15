import React, { useState, useEffect, useRef } from 'react';
import { Button, Form } from 'react-bootstrap';
import {
  formatSecondsToMs,
  parseMsToSeconds,
  normalizePlaybackLoops,
  createPlaybackLoop,
  syncLegacyLinkLoopFields,
} from '../mediaPlaybackUtils';
import { buildMediaSourceOptions } from '../mediaSourceMenuAccess';
import { getLinkSrcType } from '../checkTuneLinkPlayback';
import LinkPlayRangeModal from './LinkPlayRangeModal';
import PlayRangeButtonGroup from './PlayRangeButtonGroup';

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

export default function MediaPlaybackRegionPanel({
  tune,
  tunebook,
  mediaController,
  linkIndex,
  disabled = false,
  disabledMessage = 'Choose media to loop',
  token = null,
  login = null,
  dialogZIndex,
}) {
  const [loops, setLoops] = useState([]);
  const [showPlayRangeModal, setShowPlayRangeModal] = useState(false);
  const saveTimerRef = useRef(null);

  const tuneId = tune ? tune.id : null
  const linkAtIndex = tune && tune.links && linkIndex !== null ? tune.links[linkIndex] : null
  const playbackLoopsKey = linkAtIndex ? JSON.stringify(linkAtIndex.playbackLoops || []) : null
  const linkStartAt = linkAtIndex ? linkAtIndex.startAt : null
  const linkEndAt = linkAtIndex ? linkAtIndex.endAt : null
  useEffect(function() {
    if (!tune || linkIndex === null || !tune.links || !tune.links[linkIndex]) return;
    const normalized = normalizePlaybackLoops(tune.links[linkIndex]);
    setLoops(normalized.map(function(loop) {
      return Object.assign({}, loop, {
        startDisplay: formatLoopStartAt(loop.startAt),
        endDisplay: formatLoopEndAt(loop.endAt),
      });
    }));
  }, [tune, tuneId, linkIndex, playbackLoopsKey, linkStartAt, linkEndAt]);

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
    if (disabled) return;
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

  function canSeekToLoopStart(loop) {
    return !!(loop.startDisplay && String(loop.startDisplay).trim());
  }

  function handleSeekToLoopStart(loop) {
    if (!canSeekToLoopStart(loop)) return;
    if (!mediaController || !mediaController.seekToSeconds) return;
    const seconds = parseMsToSeconds(loop.startDisplay);
    const wasPlaying = !!mediaController.isPlaying;
    mediaController.seekToSeconds(seconds, {
      wasPlaying: wasPlaying,
      skipSeekOperation: !wasPlaying,
    });
  }

  if (!tune || linkIndex === null || !tune.links || !tune.links[linkIndex]) return null;

  const link = tune.links[linkIndex];
  const isYoutubeLink = tunebook && tunebook.utils && tunebook.utils.isYoutubeLink;
  const linkSrcType = getLinkSrcType(link, isYoutubeLink);
  const showPlayRangeButton = linkSrcType !== 'midifile';

  const mediaSourceOptions = buildMediaSourceOptions(tune, tunebook);
  const activeSource = mediaSourceOptions.find(function(option) {
    return option.kind === 'link' && option.linkIndex === linkIndex;
  });
  const mediaLinkLabel = activeSource
    ? activeSource.label
    : (link.title || ('Link ' + (linkIndex + 1)));

  function handleLinksUpdated(nextLinks) {
    if (!tune || !tunebook) return;
    tunebook.saveTune(Object.assign({}, tune, { links: nextLinks }));
  }

  return (
    <div className="media-playback-region-panel">
      <div className="media-playback-region-panel-header">
        {disabled ? (
          <p className="text-muted small mb-0">{disabledMessage}</p>
        ) : (
          <p className="scope-note mb-0">
            Loops apply to: <strong>{mediaLinkLabel}</strong>
          </p>
        )}
        {showPlayRangeButton ? (
          <PlayRangeButtonGroup
            link={link}
            disabled={disabled}
            className="media-playback-region-play-range-group"
            onClick={function() { setShowPlayRangeModal(true); }}
          />
        ) : null}
      </div>
      <p className="scope-note">
        Create named loops with start and end times (m:ss). Check a loop to enable looping for that region; uncheck to turn looping off.
      </p>

      {loops.map(function(loop) {
        return (
          <div key={loop.id} className="playback-loop-row">
            <Button
              variant="outline-secondary"
              size="sm"
              className="playback-loop-start"
              disabled={disabled || !canSeekToLoopStart(loop)}
              onClick={function() { handleSeekToLoopStart(loop); }}
              title="Seek to loop start"
            >
              Start
            </Button>
            <Form.Check
              type="checkbox"
              className="playback-loop-active"
              checked={!!loop.active}
              disabled={disabled}
              onChange={function() { handleActiveChange(loop.id); }}
              aria-label={'Active loop ' + (loop.name || loop.id)}
            />
            <Form.Control
              type="text"
              className="playback-loop-name"
              placeholder="Name"
              value={loop.name || ''}
              disabled={disabled}
              onChange={function(e) { updateLoop(loop.id, { name: e.target.value }); }}
            />
            <Form.Group className="region-field">
              <Form.Label>Start</Form.Label>
              <div className="region-field-row">
                <Form.Control
                  type="text"
                  placeholder="0:00"
                  value={loop.startDisplay || ''}
                  disabled={disabled}
                  onChange={function(e) { updateLoop(loop.id, { startDisplay: e.target.value }); }}
                />
                <Button variant="outline-secondary" size="sm" disabled={disabled} onClick={function() { handleSetStartFromCurrent(loop.id); }}>
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
                  disabled={disabled}
                  onChange={function(e) { updateLoop(loop.id, { endDisplay: e.target.value }); }}
                />
                <Button variant="outline-secondary" size="sm" disabled={disabled} onClick={function() { handleSetEndFromCurrent(loop.id); }}>
                  Set
                </Button>
              </div>
            </Form.Group>
            <Button
              variant="outline-danger"
              size="sm"
              className="playback-loop-remove"
              disabled={disabled}
              onClick={function() { handleRemoveLoop(loop.id); }}
              aria-label="Remove loop"
            >
              ×
            </Button>
          </div>
        );
      })}

      <Button variant="outline-primary" size="sm" disabled={disabled} onClick={handleAddLoop}>
        Add loop
      </Button>

      <LinkPlayRangeModal
        show={showPlayRangeModal}
        onHide={function() { setShowPlayRangeModal(false); }}
        link={link}
        linkIndex={linkIndex}
        links={tune.links}
        onLinksUpdated={handleLinksUpdated}
        tune={tune}
        tunebook={tunebook}
        token={token}
        login={login}
        icons={tunebook && tunebook.icons}
        dialogZIndex={dialogZIndex}
        mediaController={mediaController}
      />
    </div>
  );
}
