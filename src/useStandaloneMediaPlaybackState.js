import { useEffect, useState } from 'react';
import {
  isStandaloneMediaCandidatePlaying,
  subscribeStandaloneMediaPlayback,
  syncStandaloneMediaPlaybackState,
} from './standaloneMediaPlayback';
import { isMediaCandidateCurrentQueueItem } from './mediaSearchQueuePlayback';

export function useStandaloneMediaPlaybackState(candidate, nowPlayingQueue) {
  const [, setRevision] = useState(0);

  useEffect(function() {
    syncStandaloneMediaPlaybackState();
    return subscribeStandaloneMediaPlayback(function() {
      setRevision(function(value) { return value + 1; });
    });
  }, []);

  useEffect(function() {
    setRevision(function(value) { return value + 1; });
  }, [nowPlayingQueue && nowPlayingQueue.id, nowPlayingQueue && nowPlayingQueue.currentIndex]);

  const isCurrentQueueItem = isMediaCandidateCurrentQueueItem(candidate, nowPlayingQueue);
  const isPlaying = isCurrentQueueItem && isStandaloneMediaCandidatePlaying(candidate);

  return { isPlaying: isPlaying };
}
