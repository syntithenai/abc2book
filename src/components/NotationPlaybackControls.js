import React, { useEffect, useRef, useState } from 'react';
import { Button, ButtonGroup, Form } from 'react-bootstrap';
import {
  resolvePlaybackSessionWithSelection,
  startNotationPlayback,
  stopNotationPlayback,
} from '../notation/notationPlayback';

function parseTuneTempo(tempo) {
  const raw = String(tempo == null ? '' : tempo).trim();
  if (!raw) return 120;
  const parts = raw.split('=');
  const parsed = parseInt(parts[parts.length - 1], 10);
  return parsed > 0 ? parsed : 120;
}

export default function NotationPlaybackControls(props) {
  const {
    mediaController,
    tune,
    tunebook,
    session,
    getSession,
    getLastNoteSelection,
    tempo,
    playbackContext,
    playbackControlRef,
    onTempoChange,
    onRefresh,
  } = props;
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tempoBpm, setTempoBpm] = useState(parseTuneTempo(tempo));
  const saveTimeoutRef = useRef(null);

  useEffect(function() {
    setTempoBpm(parseTuneTempo(tempo));
  }, [tempo, tune && tune.id]);

  useEffect(function() {
    return function() {
      if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  useEffect(function() {
    if (!mediaController) {
      setIsPlaying(false);
      setIsLoading(false);
      return undefined;
    }
    function sync() {
      setIsPlaying(!!mediaController.isPlaying);
      setIsLoading(!!mediaController.isLoading);
    }
    sync();
    const id = window.setInterval(sync, 200);
    return function() { window.clearInterval(id); };
  }, [
    mediaController,
    mediaController && mediaController.isPlaying,
    mediaController && mediaController.isLoading,
  ]);

  if (!mediaController) return null;

  const icons = tunebook && tunebook.icons ? tunebook.icons : {};
  const showStop = isPlaying || isLoading;

  function persistTempo(nextBpm) {
    if (!tune || !tunebook || typeof tunebook.saveTune !== 'function') return;
    const saved = Object.assign({}, tune, { tempo: nextBpm, id: tune.id });
    tunebook.saveTune(saved, false, { historyLabel: 'Edit tempo' }).then(function() {
      if (typeof onRefresh === 'function') onRefresh();
    }).catch(function() {
      if (typeof onRefresh === 'function') onRefresh();
    });
    if (typeof onTempoChange === 'function') onTempoChange(nextBpm);
  }

  function handleTempoChange(e) {
    const next = Math.max(20, Math.min(300, parseInt(e.target.value, 10) || 120));
    setTempoBpm(next);
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(function() {
      saveTimeoutRef.current = null;
      persistTempo(next);
    }, 400);
  }

  function resolveSession() {
    const base = typeof getSession === 'function' ? getSession() : session;
    const lastSel = typeof getLastNoteSelection === 'function' ? getLastNoteSelection() : null;
    return resolvePlaybackSessionWithSelection(base, lastSel);
  }

  return (
    <ButtonGroup className="notation-playback-controls" aria-label="Playback">
      {showStop ? (
        <Button
          size="lg"
          variant="danger"
          title="Stop"
          aria-label="Stop"
          data-testid="notation-playback-stop"
          onClick={function() {
            stopNotationPlayback(mediaController, playbackControlRef);
          }}
          onMouseDown={function(e) { e.preventDefault(); }}
        >
          {icons.stop || icons.stopsmall || 'Stop'}
        </Button>
      ) : (
        <Button
          size="lg"
          variant="success"
          title="Play selection"
          aria-label="Play selection"
          data-testid="notation-playback-play"
          onClick={function() {
            startNotationPlayback(
              mediaController,
              tune,
              tunebook,
              resolveSession(),
              tempoBpm,
              playbackContext,
              playbackControlRef
            );
          }}
          onMouseDown={function(e) { e.preventDefault(); }}
        >
          {icons.play}
        </Button>
      )}
      <Form.Control
        type="number"
        size="sm"
        min={20}
        max={300}
        step={1}
        className="notation-playback-tempo"
        aria-label="Tempo BPM"
        title="Tempo (BPM)"
        data-testid="notation-playback-tempo"
        value={tempoBpm}
        onChange={handleTempoChange}
      />
    </ButtonGroup>
  );
}
