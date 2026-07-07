import { useCallback, useEffect, useState } from 'react';
import { secondsToBeat, beatToSeconds } from '../notation/recordingGrid';

export function usePianoRollMediaSync(options) {
  const {
    mediaController,
    beatTimes,
    tempo,
    linkStartAt,
    linkEndAt,
    enabled,
  } = options || {};

  const [playheadBeat, setPlayheadBeat] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(function() {
    if (!enabled || !mediaController) {
      setPlayheadBeat(null);
      setIsPlaying(false);
      return undefined;
    }

    function tick() {
      const progress = mediaController.getPlaybackProgress ? mediaController.getPlaybackProgress() : null;
      if (!progress) return;
      setIsPlaying(!!mediaController.isPlaying);
      const seconds = Math.max(0, (progress.currentTime || 0) - (linkStartAt || 0));
      setPlayheadBeat(secondsToBeat(seconds, beatTimes, tempo));
    }

    tick();
    const id = window.setInterval(tick, 60);
    return function() { window.clearInterval(id); };
  }, [mediaController, beatTimes, tempo, linkStartAt, enabled]);

  const seekToBeat = useCallback(function(beat) {
    if (!mediaController || typeof beat !== 'number') return;
    const seconds = beatToSeconds(beat, beatTimes, tempo) + (linkStartAt || 0);
    if (mediaController.seekToSeconds) mediaController.seekToSeconds(seconds);
    else if (mediaController.seek && progressDuration()) {
      mediaController.seek(seconds / progressDuration());
    }
  }, [mediaController, beatTimes, tempo, linkStartAt]);

  function progressDuration() {
    if (!mediaController || !mediaController.getPlaybackProgress) return 0;
    const p = mediaController.getPlaybackProgress();
    return p && p.duration ? p.duration : 0;
  }

  const playbackRegion = (typeof linkStartAt === 'number' || typeof linkEndAt === 'number') ? {
    startBeat: secondsToBeat(linkStartAt || 0, beatTimes, tempo),
    endBeat: linkEndAt != null
      ? secondsToBeat(Math.max(0, linkEndAt - (linkStartAt || 0)), beatTimes, tempo)
      : null,
    startAt: linkStartAt || 0,
    endAt: linkEndAt,
  } : null;

  return {
    playheadBeat: playheadBeat,
    isPlaying: isPlaying,
    playbackRegion: playbackRegion,
    seekToBeat: seekToBeat,
  };
}
