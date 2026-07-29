import { useCallback, useEffect, useRef, useState } from 'react';
import {
  advanceSnapcastSession,
  createSnapcastPlaybackSession,
  deleteSnapcastSession,
  getSnapcastSessionStatus,
  seekSnapcastSession,
} from '../snapcastPlaybackClient';

export default function useSnapcastPlayback({ mediaController, snapcastControl }) {
  const [routing, setRouting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const statusPollRef = useRef(null);

  const updateRemoteEngine = useCallback(function(state) {
    if (!mediaController || !mediaController.remoteOutputEngineRef) return;
    mediaController.remoteOutputEngineRef.current = state;
  }, [mediaController]);

  const stopStatusPoll = useCallback(function() {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  const startStatusPoll = useCallback(function(activeSessionId, groupId) {
    stopStatusPoll();
    const endedRef = { fired: false };
    statusPollRef.current = setInterval(function() {
      getSnapcastSessionStatus(activeSessionId).then(function(status) {
        updateRemoteEngine({
          mode: 'snapcast',
          connected: true,
          sessionId: activeSessionId,
          currentTime: status.currentTime || 0,
          duration: status.duration || 0,
          isPlaying: !!status.isPlaying,
          groupId: groupId,
        });
        if (mediaController && mediaController.setCurrentTime) {
          mediaController.setCurrentTime(status.currentTime || 0);
        }
        if (mediaController && mediaController.setDuration && status.duration) {
          mediaController.setDuration(status.duration);
        }
        if (!endedRef.fired
          && !status.isPlaying
          && status.duration > 0
          && status.currentTime >= status.duration - 1) {
          endedRef.fired = true;
          if (status.canGoNext) {
            advanceSnapcastSession(activeSessionId).then(function() {
              endedRef.fired = false;
            }).catch(function() {
              if (mediaController && mediaController.onEnded) mediaController.onEnded();
            });
          } else if (mediaController && mediaController.onEnded) {
            mediaController.onEnded();
          }
        }
      }).catch(function() {});
    }, 1000);
  }, [mediaController, stopStatusPoll, updateRemoteEngine]);

  const stopRouting = useCallback(async function() {
    stopStatusPoll();
    const activeId = sessionId;
    setSessionId(null);
    setRouting(false);
    updateRemoteEngine(null);
    if (activeId) {
      try { await deleteSnapcastSession(activeId); } catch (e) { /* ignore */ }
    }
  }, [sessionId, stopStatusPoll, updateRemoteEngine]);

  const startRouting = useCallback(async function(options) {
    const opts = options || {};
    const client = snapcastControl.client.current;
    const selectedGroupId = opts.groupId || snapcastControl.selectedGroupId;
    if (!mediaController || !client || !selectedGroupId) return false;
    const payload = opts.payload;
    const tune = mediaController.tune;
    if (!tune && !payload) return false;
    const startSeconds = payload && payload.startSeconds != null
      ? payload.startSeconds
      : (mediaController.getPlaybackProgress
        ? (mediaController.getPlaybackProgress().seconds || 0)
        : 0);
    const duration = payload && payload.duration != null
      ? payload.duration
      : (mediaController.duration || 0);
    setRouting(true);
    try {
      const stream = client.findStreamByName(snapcastControl.streamName);
      if (stream) await client.setGroupStream(selectedGroupId, stream.id);
      const session = await createSnapcastPlaybackSession(Object.assign({}, payload || {}, {
        groupId: selectedGroupId,
        startSeconds: startSeconds,
        duration: duration,
      }));
      const activeSessionId = session.sessionId;
      setSessionId(activeSessionId);
      if (mediaController.muteLocalOutputsForRemote) {
        mediaController.muteLocalOutputsForRemote();
      } else if (mediaController.pause) {
        mediaController.pause();
      }
      updateRemoteEngine({
        mode: 'snapcast',
        connected: true,
        sessionId: activeSessionId,
        currentTime: startSeconds,
        duration: duration,
        isPlaying: true,
        groupId: selectedGroupId,
        streamName: snapcastControl.streamName,
      });
      startStatusPoll(activeSessionId, selectedGroupId);
      return true;
    } catch (err) {
      setRouting(false);
      return false;
    }
  }, [mediaController, snapcastControl, startStatusPoll, updateRemoteEngine]);

  const seekRemote = useCallback(async function(seconds) {
    if (!sessionId) return;
    await seekSnapcastSession(sessionId, seconds);
  }, [sessionId]);

  return { routing, sessionId, startRouting, stopRouting, seekRemote };
}
