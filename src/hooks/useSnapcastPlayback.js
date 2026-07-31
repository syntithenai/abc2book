import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  advanceSnapcastSession,
  createSnapcastPlaybackSession,
  deleteSnapcastSession,
  getSnapcastSessionStatus,
  prefetchSnapcastSession,
  resolveSnapcastAccessToken,
  seekSnapcastSession,
} from '../snapcastPlaybackClient';
import { enrichPayloadWithYoutubeAudioPrefetch } from '../youtubeRemoteAudioPrefetch';

const POLL_MS = 1000;
const POLL_BACKOFF_MAX_MS = 10000;

export default function useSnapcastPlayback({ mediaController, snapcastControl }) {
  const [routing, setRouting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [routingError, setRoutingError] = useState(null);
  const statusPollRef = useRef(null);
  const stopRoutingRef = useRef(null);
  const pollBackoffRef = useRef(POLL_MS);
  const pollPausedRef = useRef(false);

  const updateRemoteEngine = useCallback(function(state) {
    if (!mediaController || !mediaController.remoteOutputEngineRef) return;
    mediaController.remoteOutputEngineRef.current = state;
  }, [mediaController]);

  const stopStatusPoll = useCallback(function() {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
    pollBackoffRef.current = POLL_MS;
  }, []);

  const stopRouting = useCallback(async function() {
    stopStatusPoll();
    const activeId = sessionId;
    setSessionId(null);
    setRouting(false);
    setRoutingError(null);
    updateRemoteEngine(null);
    if (activeId) {
      try { await deleteSnapcastSession(activeId); } catch (e) { /* ignore */ }
    }
  }, [sessionId, stopStatusPoll, updateRemoteEngine]);

  stopRoutingRef.current = stopRouting;

  const pollOnce = useCallback(function(activeSessionId, groupId, endedRef) {
    if (pollPausedRef.current) return;
    getSnapcastSessionStatus(activeSessionId).then(function(status) {
      setRoutingError(null);
      pollBackoffRef.current = POLL_MS;
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
          }).catch(function(err) {
            setRoutingError(String(err.message || err));
            if (mediaController && mediaController.onEnded) mediaController.onEnded();
          });
        } else if (mediaController && mediaController.onEnded) {
          mediaController.onEnded();
        }
      }
    }).catch(function(err) {
      const status = err && err.status;
      if (status === 404) {
        setRoutingError('Snapcast session ended');
        if (stopRoutingRef.current) stopRoutingRef.current();
        return;
      }
      pollBackoffRef.current = Math.min(POLL_BACKOFF_MAX_MS, pollBackoffRef.current * 2);
      setRoutingError(String(err.message || 'Snapcast status unavailable'));
    });
  }, [mediaController, updateRemoteEngine]);

  const startStatusPoll = useCallback(function(activeSessionId, groupId) {
    stopStatusPoll();
    const endedRef = { fired: false };
    const tick = function() {
      pollOnce(activeSessionId, groupId, endedRef);
    };
    statusPollRef.current = setInterval(tick, POLL_MS);
    tick();
  }, [pollOnce, stopStatusPoll]);

  const startRouting = useCallback(async function(options) {
    const opts = options || {};
    const client = snapcastControl.client.current;
    const selectedGroupId = opts.groupId || snapcastControl.selectedGroupId;
    if (!mediaController || !client || !selectedGroupId) return false;
    const payload = opts.payload;
    const tune = mediaController.tune;
    if (!tune && !payload) return false;
    const linkedOpts = mediaController.getLinkedMediaResolveOptions
      ? mediaController.getLinkedMediaResolveOptions()
      : null;
    const accessToken = resolveSnapcastAccessToken({
      accessToken: linkedOpts && linkedOpts.accessToken,
    });
    const startSeconds = payload && payload.startSeconds != null
      ? payload.startSeconds
      : (mediaController.getPlaybackProgress
        ? (mediaController.getPlaybackProgress().seconds || 0)
        : 0);
    const duration = payload && payload.duration != null
      ? payload.duration
      : (mediaController.duration || 0);
    setRouting(true);
    setRoutingError(null);

    async function beginSession() {
      const stream = client.findStreamByName(snapcastControl.streamName);
      if (stream) await client.setGroupStream(selectedGroupId, stream.id);
      let sessionPayload = Object.assign({}, payload || {}, {
        groupId: selectedGroupId,
        startSeconds: startSeconds,
        duration: duration,
        accessToken: accessToken,
      });
      if (payload && payload.sourceType === 'youtube') {
        const youtubeGetId = mediaController.youtubeGetId
          || (mediaController.tunebook && mediaController.tunebook.utils
            ? mediaController.tunebook.utils.YouTubeGetID
            : null);
        sessionPayload = await enrichPayloadWithYoutubeAudioPrefetch(sessionPayload, youtubeGetId);
      }
      return createSnapcastPlaybackSession(sessionPayload);
    }

    try {
      let session;
      try {
        session = await beginSession();
      } catch (err) {
        const message = String(err && err.message ? err.message : err);
        if (message.indexOf('Maximum concurrent Snapcast sessions') >= 0) {
          const remote = mediaController.remoteOutputEngineRef
            && mediaController.remoteOutputEngineRef.current;
          const staleId = sessionId
            || (remote && remote.mode === 'snapcast' ? remote.sessionId : null);
          if (staleId) {
            try { await deleteSnapcastSession(staleId); } catch (e) { /* ignore */ }
          }
          session = await beginSession();
        } else {
          throw err;
        }
      }
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
      prefetchSnapcastSession(activeSessionId).catch(function() {});
      return true;
    } catch (err) {
      setRouting(false);
      const message = String(err.message || err);
      setRoutingError(message);
      toast.error(message, { autoClose: 8000 });
      return false;
    }
  }, [mediaController, snapcastControl, sessionId, startStatusPoll, updateRemoteEngine]);

  const startRoutingWithConnect = useCallback(async function(options) {
    const opts = options || {};
    if (routing && sessionId) {
      if (!opts.skipReplaceConfirm) {
        const replace = typeof window !== 'undefined'
          && window.confirm('Replace active Snapcast playback?');
        if (!replace) return false;
      }
      await stopRouting();
    } else if (opts.skipReplaceConfirm) {
      const remote = mediaController && mediaController.remoteOutputEngineRef
        && mediaController.remoteOutputEngineRef.current;
      const staleId = remote && remote.mode === 'snapcast' ? remote.sessionId : null;
      if (staleId) {
        try { await deleteSnapcastSession(staleId); } catch (e) { /* ignore */ }
      }
    }
    if (!snapcastControl.connected) {
      const ok = await snapcastControl.connect();
      if (!ok) return false;
    }
    let groupId = opts.groupId || snapcastControl.selectedGroupId;
    const client = snapcastControl.client.current;
    const groups = client ? client.listGroups() : snapcastControl.groups || [];
    if (!groupId && groups.length > 0) {
      groupId = groups[0].id;
      snapcastControl.setSelectedGroupId(groupId);
    }
    if (!groupId) {
      setRoutingError('No Snapcast group selected');
      return false;
    }
    return startRouting(Object.assign({}, opts, { groupId: groupId }));
  }, [routing, sessionId, snapcastControl, mediaController, startRouting, stopRouting]);

  const seekRemote = useCallback(async function(seconds) {
    if (!sessionId) return;
    await seekSnapcastSession(sessionId, seconds);
  }, [sessionId]);

  useEffect(function() {
    function onVisibilityChange() {
      pollPausedRef.current = document.visibilityState === 'hidden';
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }
    return function() {
      stopStatusPoll();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }, [stopStatusPoll]);

  return {
    routing,
    sessionId,
    routingError,
    startRouting,
    startRoutingWithConnect,
    stopRouting,
    seekRemote,
  };
}
