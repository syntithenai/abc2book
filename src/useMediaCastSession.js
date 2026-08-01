import { useCallback, useEffect, useRef, useState } from 'react';
import { getCastAppId } from './mediaCastSupport';
import { isCastWebSdkSupported } from './platformUtils';
import {
  advanceCastSession,
  buildCastHlsUrl,
  buildCastMediaUrl,
  createCastPlaybackSession,
  deleteCastSession,
  getCastSessionStatus,
  resolveCastContentUrl,
  seekCastSession,
  sendCastSessionHeartbeat,
  waitForCastPlaylistReady,
} from './castPlaybackClient';
import {
  canRouteToCastSdk,
  needsCastHlsSession,
} from './remoteOutputSupport';
import { getChromecastOutputEnabled } from './preferredRemoteOutputSettings';
import { enrichPayloadWithYoutubeAudioPrefetch } from './youtubeRemoteAudioPrefetch';
import { normalizeRemotePlaybackPayload } from './youtubePlaybackUri';

const CAST_STORAGE_KEY = 'abc2book.castSession';

let castFrameworkPromise = null;

function withAsyncTimeout(promise, timeoutMs, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise(function(_, reject) {
      timer = setTimeout(function() {
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]).finally(function() {
    if (timer) clearTimeout(timer);
  });
}

/** Cast Framework APIs return promises; legacy chrome.cast used callbacks. */
function invokeCastSdk(tryPromise, tryCallbacks) {
  const direct = tryPromise();
  if (direct && typeof direct.then === 'function') return direct;
  return new Promise(tryCallbacks);
}

function requestCastSession(context) {
  return withAsyncTimeout(
    invokeCastSdk(
      function() { return context.requestSession(); },
      function(resolve, reject) { context.requestSession(resolve, reject); }
    ),
    120000,
    'Chromecast device selection timed out'
  );
}

function loadCastMedia(session, request) {
  return withAsyncTimeout(
    invokeCastSdk(
      function() { return session.loadMedia(request); },
      function(resolve, reject) { session.loadMedia(request, resolve, reject); }
    ),
    60000,
    'Timed out loading media on Chromecast'
  );
}

function getCastPlayerIdleState() {
  if (window.chrome && window.chrome.cast && window.chrome.cast.media && window.chrome.cast.media.PlayerState) {
    return window.chrome.cast.media.PlayerState.IDLE;
  }
  return 'IDLE';
}

function readRemotePlayerState(player, castContext) {
  if (!player) return null;
  let currentTime = player.currentTime || 0;
  let duration = player.duration || 0;
  if (castContext) {
    try {
      const session = castContext.getCurrentSession();
      const media = session && session.getMediaSession ? session.getMediaSession() : null;
      if (media && typeof media.getEstimatedTime === 'function') {
        currentTime = media.getEstimatedTime();
      }
      if (media && media.media && media.media.duration) {
        duration = media.media.duration;
      }
    } catch (e) { /* ignore */ }
  }
  return {
    currentTime: currentTime,
    duration: duration,
    isPlaying: !player.isPaused,
    playerState: player.playerState,
  };
}

function readStoredCastMeta() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(CAST_STORAGE_KEY) || 'null');
  } catch (e) {
    return null;
  }
}

function writeStoredCastMeta(meta) {
  if (typeof localStorage === 'undefined') return;
  if (!meta) localStorage.removeItem(CAST_STORAGE_KEY);
  else localStorage.setItem(CAST_STORAGE_KEY, JSON.stringify(meta));
}

function loadCastFramework() {
  if (!isCastWebSdkSupported()) {
    return Promise.reject(new Error('Chromecast is not available in the mobile app. Use Snapcast in Settings → Audio.'));
  }
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Cast unavailable'));
  }
  if (window.cast && window.cast.framework && window.chrome && window.chrome.cast) {
    return Promise.resolve(window.cast.framework);
  }
  if (castFrameworkPromise) return castFrameworkPromise;
  castFrameworkPromise = new Promise(function(resolve, reject) {
    window.__onGCastApiAvailable = function(isAvailable) {
      if (isAvailable && window.cast && window.cast.framework && window.chrome && window.chrome.cast) {
        resolve(window.cast.framework);
      } else {
        reject(new Error('Cast framework unavailable'));
      }
    };
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.onerror = function() { reject(new Error('Failed to load Cast SDK')); };
    document.head.appendChild(script);
  });
  return castFrameworkPromise;
}

function buildCastQueueItems(queue, startSeconds, castOptions) {
  if (!Array.isArray(queue) || queue.length === 0) return null;
  if (!window.chrome || !window.chrome.cast || !window.chrome.cast.media) return null;
  const items = queue.map(function(entry, index) {
    const url = buildCastMediaUrl(entry.source, castOptions);
    if (!url) return null;
    const mediaInfo = new window.chrome.cast.media.MediaInfo(url, 'audio/mpeg');
    mediaInfo.streamType = window.chrome.cast.media.StreamType.BUFFERED;
    mediaInfo.metadata = new window.chrome.cast.media.MusicTrackMediaMetadata();
    mediaInfo.metadata.title = entry.title || '';
    mediaInfo.metadata.artist = entry.artist || '';
    const item = new window.chrome.cast.media.QueueItem(mediaInfo);
    if (index === 0 && startSeconds > 0) item.startTime = startSeconds;
    return item;
  }).filter(Boolean);
  if (items.length === 0) return null;
  const queueData = new window.chrome.cast.media.QueueData();
  queueData.items = items;
  queueData.startIndex = 0;
  return queueData;
}

export default function useMediaCastSession({ mediaController }) {
  const [connected, setConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [joinable, setJoinable] = useState(false);
  const [storedCastTitle, setStoredCastTitle] = useState('');
  const castContextRef = useRef(null);
  const remotePlayerRef = useRef(null);
  const remoteControllerRef = useRef(null);
  const statusPollRef = useRef(null);
  const heartbeatPollRef = useRef(null);
  const seekInFlightRef = useRef(false);
  const queueRef = useRef([]);
  const endedHandledRef = useRef(false);
  const castHandoffInFlightRef = useRef(false);
  const castMediaLoadedRef = useRef(false);
  const userStopCastRef = useRef(false);
  const mediaControllerRef = useRef(mediaController);
  mediaControllerRef.current = mediaController;

  const castRequestOptions = useCallback(function(extra) {
    const mc = mediaControllerRef.current;
    const linked = mc && mc.getLinkedMediaResolveOptions
      ? mc.getLinkedMediaResolveOptions()
      : null;
    return Object.assign({
      accessToken: linked && linked.accessToken,
      healthStatus: mc && mc.mediaResolverStatus ? mc.mediaResolverStatus : null,
    }, extra || {});
  }, []);

  const updateEngine = useCallback(function(patch) {
    if (!mediaController || !mediaController.remoteOutputEngineRef) return;
    if (!patch) {
      mediaController.remoteOutputEngineRef.current = null;
      setConnected(false);
      setDeviceName('');
      setSessionId(null);
      return;
    }
    const prev = mediaController.remoteOutputEngineRef.current || {};
    const next = Object.assign({}, prev, patch, { mode: 'cast', subMode: patch.subMode || 'sdk' });
    mediaController.remoteOutputEngineRef.current = next;
    if (patch.connected === true && prev.connected !== true) {
      if (mediaController.muteLocalOutputsForRemote) {
        mediaController.muteLocalOutputsForRemote();
      }
    }
    setConnected(!!next.connected);
    setDeviceName(next.deviceName || '');
    setSessionId(next.sessionId || null);
  }, [mediaController]);

  const stopHeartbeatPoll = useCallback(function() {
    if (heartbeatPollRef.current) {
      clearInterval(heartbeatPollRef.current);
      heartbeatPollRef.current = null;
    }
  }, []);

  const startHeartbeatPoll = useCallback(function(activeSessionId) {
    stopHeartbeatPoll();
    if (!activeSessionId) return;
    heartbeatPollRef.current = setInterval(function() {
      const mc = mediaControllerRef.current;
      const seconds = mc && mc.getPlaybackProgress
        ? (mc.getPlaybackProgress().seconds || 0)
        : 0;
      sendCastSessionHeartbeat(activeSessionId, seconds, castRequestOptions()).catch(function() {});
    }, 30000);
  }, [castRequestOptions, stopHeartbeatPoll]);

  const stopStatusPoll = useCallback(function() {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
    stopHeartbeatPoll();
  }, [stopHeartbeatPoll]);

  const handlePlaybackEnded = useCallback(async function() {
    if (endedHandledRef.current) return;
    if (!castMediaLoadedRef.current) return;
    endedHandledRef.current = true;
    const mc = mediaControllerRef.current;
    const activeSessionId = sessionId;
    const queue = queueRef.current || [];
    const requestOpts = castRequestOptions();
    try {
      if (activeSessionId && queue.length > 1) {
        const status = await getCastSessionStatus(activeSessionId, requestOpts).catch(function() { return null; });
        if (status && status.canGoNext) {
          await advanceCastSession(activeSessionId, requestOpts);
          const context = castContextRef.current;
          const contentUrl = buildCastHlsUrl(activeSessionId, requestOpts);
          if (context && contentUrl) {
            const tune = mc.tune;
            await loadMediaOnCastRef.current(context, contentUrl, {
              title: tune && tune.name,
              artist: tune && tune.composer,
            }, 0);
            endedHandledRef.current = false;
            return;
          }
        }
      }
      if (mc && mc.onEnded) mc.onEnded();
    } catch (e) {
      if (mc && mc.onEnded) mc.onEnded();
    }
  }, [sessionId, castRequestOptions]);

  const loadMediaOnCastRef = useRef(null);

  const startStatusPoll = useCallback(function(activeSessionId) {
    stopStatusPoll();
    statusPollRef.current = setInterval(function() {
      const player = remotePlayerRef.current;
      if (player) {
        const playback = readRemotePlayerState(player, castContextRef.current) || {};
        const currentTime = playback.currentTime || 0;
        const duration = playback.duration || 0;
        const isPlaying = !!playback.isPlaying;
        const playerState = playback.playerState;
        updateEngine({
          connected: true,
          sessionId: activeSessionId,
          currentTime: currentTime,
          duration: duration,
          isPlaying: isPlaying,
        });
        const mc = mediaControllerRef.current;
        if (mc && mc.setCurrentTime) mc.setCurrentTime(currentTime || 0);
        if (mc && mc.setDuration && duration) mc.setDuration(duration);
        if (playerState === getCastPlayerIdleState()
          && duration > 0
          && currentTime >= Math.max(0, duration - 1.5)) {
          handlePlaybackEnded();
        }
        return;
      }
      if (!activeSessionId) return;
      const requestOpts = castRequestOptions();
      getCastSessionStatus(activeSessionId, requestOpts).then(function(status) {
        updateEngine({
          connected: true,
          sessionId: activeSessionId,
          currentTime: status.currentTime || 0,
          duration: status.duration || 0,
          isPlaying: !!status.isPlaying,
        });
        if (!status.isPlaying && status.duration > 0 && status.currentTime >= status.duration - 1) {
          handlePlaybackEnded();
        }
      }).catch(function(err) {
        if (err && String(err.message || err).indexOf('404') >= 0) {
          failCastPlaybackRef.current('Chromecast session ended on the resolver');
        }
      });
    }, 1000);
  }, [castRequestOptions, handlePlaybackEnded, stopStatusPoll, updateEngine]);

  const failCastPlaybackRef = useRef(function() {});

  const endCastSdkSession = useCallback(function() {
    const context = castContextRef.current;
    if (!context) return;
    try {
      const session = context.getCurrentSession();
      if (session) {
        if (session.endSession) {
          session.endSession(true);
        } else if (session.stop) {
          session.stop();
        }
      }
    } catch (e) { /* ignore */ }
  }, []);

  const failCastPlayback = useCallback(function(message) {
    if (userStopCastRef.current) return;
    stopStatusPoll();
    castMediaLoadedRef.current = false;
    castHandoffInFlightRef.current = false;
    writeStoredCastMeta(null);
    updateEngine(null);
    endCastSdkSession();
    setError(message || 'Chromecast playback stopped');
    const mc = mediaControllerRef.current;
    if (mc && mc.silencePlaybackOutputs) {
      mc.silencePlaybackOutputs();
    }
  }, [endCastSdkSession, stopStatusPoll, updateEngine]);
  failCastPlaybackRef.current = failCastPlayback;

  const stopCast = useCallback(async function(endSession) {
    userStopCastRef.current = true;
    stopStatusPoll();
    const activeId = sessionId;
    const shouldEnd = endSession !== false;
    setSessionId(null);
    setConnected(false);
    setDeviceName('');
    queueRef.current = [];
    endedHandledRef.current = false;
    writeStoredCastMeta(null);
    updateEngine(null);
    const context = castContextRef.current;
    if (context) {
      try {
        const session = context.getCurrentSession();
        if (session) {
          if (shouldEnd && session.stop) {
            session.stop();
          } else if (session.endSession) {
            session.endSession(false);
          }
        }
      } catch (e) { /* ignore */ }
    }
    if (activeId && shouldEnd) {
      try { await deleteCastSession(activeId, castRequestOptions()); } catch (e) { /* ignore */ }
    }
    userStopCastRef.current = false;
    castMediaLoadedRef.current = false;
    castHandoffInFlightRef.current = false;
  }, [castRequestOptions, sessionId, stopStatusPoll, updateEngine]);

  const loadMediaOnCast = useCallback(async function(context, contentUrl, metadata, startSeconds) {
    const session = context.getCurrentSession();
    if (!session) throw new Error('No Cast session');
    const isHls = String(contentUrl).indexOf('.m3u8') >= 0;
    const mediaInfo = new window.chrome.cast.media.MediaInfo(
      contentUrl,
      isHls ? 'application/x-mpegURL' : 'audio/mpeg'
    );
    mediaInfo.streamType = window.chrome.cast.media.StreamType.BUFFERED;
    if (metadata) {
      mediaInfo.metadata = new window.chrome.cast.media.MusicTrackMediaMetadata();
      mediaInfo.metadata.title = metadata.title || '';
      mediaInfo.metadata.artist = metadata.artist || '';
    }
    const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
    const startAt = startSeconds != null
      ? startSeconds
      : (mediaController.getPlaybackProgress
        ? (mediaController.getPlaybackProgress().seconds || 0)
        : 0);
    request.currentTime = startAt;
    endedHandledRef.current = false;
    await loadCastMedia(session, request);
    castMediaLoadedRef.current = true;
  }, [mediaController]);
  loadMediaOnCastRef.current = loadMediaOnCast;

  const bindRemotePlayer = useCallback(function(framework, controller) {
    controller.addEventListener(
      framework.RemotePlayerEventType.IS_PAUSED_CHANGED,
      function() {
        updateEngine({ isPlaying: !controller.isPaused });
      }
    );
    controller.addEventListener(
      framework.RemotePlayerEventType.CURRENT_TIME_CHANGED,
      function(event) {
        if (seekInFlightRef.current) return;
        const mc = mediaControllerRef.current;
        const drift = Math.abs((event.value || 0) - ((mc && mc.currentTime) || 0));
        if (drift > 0.5 && mc && mc.setCurrentTime) {
          mc.setCurrentTime(event.value || 0);
        }
        updateEngine({ currentTime: event.value || 0 });
      }
    );
    controller.addEventListener(
      framework.RemotePlayerEventType.PLAYER_STATE_CHANGED,
      function(event) {
        if (event.value === getCastPlayerIdleState()) {
          const playback = readRemotePlayerState(remotePlayerRef.current, castContextRef.current) || {};
          const duration = playback.duration || 0;
          const currentTime = playback.currentTime || 0;
          if (duration > 0 && currentTime >= Math.max(0, duration - 1.5)) {
            handlePlaybackEnded();
          }
        }
      }
    );
  }, [handlePlaybackEnded, updateEngine]);

  const initCast = useCallback(async function() {
    if (!getChromecastOutputEnabled()) {
      return null;
    }
    if (!isCastWebSdkSupported()) {
      return null;
    }
    const framework = await loadCastFramework();
    const chromeCast = window.chrome && window.chrome.cast;
    if (!chromeCast || !chromeCast.AutoJoinPolicy) {
      throw new Error('Cast base API unavailable');
    }
    const context = framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: getCastAppId(),
      autoJoinPolicy: chromeCast.AutoJoinPolicy.ORIGIN_SCOPED,
    });
    castContextRef.current = context;
    if (!remotePlayerRef.current) {
      const player = new framework.RemotePlayer();
      const controller = new framework.RemotePlayerController(player);
      remotePlayerRef.current = player;
      remoteControllerRef.current = controller;
      bindRemotePlayer(framework, controller);
    }
    context.addEventListener(
      framework.CastContextEventType.SESSION_STATE_CHANGED,
      function(event) {
        const session = context.getCurrentSession();
        if (event.sessionState === framework.SessionState.SESSION_RESUMED && session) {
          if (castHandoffInFlightRef.current) return;
          const stored = readStoredCastMeta();
          if (!stored || (!stored.sessionId && !stored.title)) return;
          const device = session.getCastDevice ? session.getCastDevice() : null;
          updateEngine({
            connected: true,
            deviceName: device && device.friendlyName ? device.friendlyName : 'Chromecast',
            sessionId: stored && stored.sessionId ? stored.sessionId : null,
            subMode: 'sdk',
          });
          startStatusPoll(stored && stored.sessionId ? stored.sessionId : null);
        }
        if (event.sessionState === framework.SessionState.SESSION_ENDED) {
          castMediaLoadedRef.current = false;
          castHandoffInFlightRef.current = false;
          if (!userStopCastRef.current) {
            failCastPlaybackRef.current('Chromecast disconnected');
          } else {
            updateEngine(null);
            writeStoredCastMeta(null);
          }
        }
      }
    );
    const existing = context.getCurrentSession();
    const stored = readStoredCastMeta();
    if (existing && stored && (stored.sessionId || stored.title)) {
      const device = existing.getCastDevice ? existing.getCastDevice() : null;
      const deviceLabel = device && device.friendlyName ? device.friendlyName : 'Chromecast';
      updateEngine({
        connected: true,
        deviceName: deviceLabel,
        sessionId: stored && stored.sessionId ? stored.sessionId : null,
        subMode: 'sdk',
      });
      startStatusPoll(stored && stored.sessionId ? stored.sessionId : null);
    } else if (stored && (stored.deviceName || stored.title)) {
      setJoinable(true);
      setDeviceName(stored.deviceName || 'Chromecast');
      setStoredCastTitle(stored.title || '');
    }
    return context;
  }, [bindRemotePlayer, startStatusPoll, updateEngine]);

  const joinCast = useCallback(async function() {
    setLoading(true);
    setError(null);
    try {
      const context = castContextRef.current || await initCast();
      if (!context.getCurrentSession()) {
        await requestCastSession(context);
      }
      const castSession = context.getCurrentSession();
      const device = castSession && castSession.getCastDevice ? castSession.getCastDevice() : null;
      const stored = readStoredCastMeta();
      if (mediaController.muteLocalOutputsForRemote) {
        mediaController.muteLocalOutputsForRemote();
      }
      setJoinable(false);
      setConnected(true);
      setDeviceName(device && device.friendlyName ? device.friendlyName : 'Chromecast');
      setSessionId(stored && stored.sessionId ? stored.sessionId : null);
      updateEngine({
        connected: true,
        sessionId: stored && stored.sessionId ? stored.sessionId : null,
        deviceName: device && device.friendlyName ? device.friendlyName : 'Chromecast',
        subMode: 'sdk',
      });
      startStatusPoll(stored && stored.sessionId ? stored.sessionId : null);
      return true;
    } catch (err) {
      setError(String(err.message || err));
      return false;
    } finally {
      setLoading(false);
    }
  }, [initCast, mediaController, startStatusPoll, updateEngine]);

  const startCast = useCallback(async function(options) {
    const opts = options || {};
    const payload = opts.payload;
    if (!payload && !canRouteToCastSdk(mediaController)) return false;
    setLoading(true);
    setError(null);
    userStopCastRef.current = false;
    castMediaLoadedRef.current = false;
    queueRef.current = Array.isArray(payload && payload.queue) ? payload.queue : (Array.isArray(opts.queue) ? opts.queue : []);
    endedHandledRef.current = false;
    let activeSessionId = null;
    const requestOpts = castRequestOptions();
    try {
      const context = castContextRef.current || await initCast();
      const tune = mediaController.tune;
      const startSeconds = payload && payload.startSeconds != null
        ? payload.startSeconds
        : (mediaController.getPlaybackProgress
          ? (mediaController.getPlaybackProgress().seconds || 0)
          : 0);
      const duration = payload && payload.duration != null
        ? payload.duration
        : (mediaController.duration || 0);
      let contentUrl = null;
      let sessionPayload = Object.assign({}, payload || {}, {
        accessToken: requestOpts.accessToken,
      });
      const youtubeGetId = mediaController.youtubeGetId
        || (mediaController.tunebook && mediaController.tunebook.utils
          ? mediaController.tunebook.utils.YouTubeGetID
          : null);
      if (payload) {
        sessionPayload = normalizeRemotePlaybackPayload(sessionPayload, youtubeGetId);
        if (sessionPayload.sourceType === 'youtube') {
          sessionPayload = await enrichPayloadWithYoutubeAudioPrefetch(sessionPayload, youtubeGetId);
        }
      }
      const useHlsSession = !!(payload && needsCastHlsSession(mediaController, payload));
      if (useHlsSession) {
        const session = await createCastPlaybackSession(sessionPayload);
        activeSessionId = session.sessionId;
        await waitForCastPlaylistReady(activeSessionId, requestOpts);
        contentUrl = resolveCastContentUrl(payload.source, activeSessionId, requestOpts);
      } else if (payload) {
        contentUrl = resolveCastContentUrl(payload.source, null, requestOpts);
      } else {
        throw new Error('No media payload for Cast');
      }
      castHandoffInFlightRef.current = true;
      await requestCastSession(context);
      const castSession = context.getCurrentSession();
      const device = castSession && castSession.getCastDevice ? castSession.getCastDevice() : null;
      if (mediaController.muteLocalOutputsForRemote) {
        mediaController.muteLocalOutputsForRemote();
      } else if (mediaController.pause) {
        mediaController.pause();
      }
      if (!useHlsSession && queueRef.current.length > 1 && castSession) {
        const queueData = buildCastQueueItems(queueRef.current, startSeconds, requestOpts);
        if (queueData) {
          const request = new window.chrome.cast.media.LoadRequest(queueData.items[0].media);
          request.queueData = queueData;
          request.currentTime = startSeconds;
          await loadCastMedia(castSession, request);
          castMediaLoadedRef.current = true;
        } else {
          await loadMediaOnCast(context, contentUrl, { title: tune.name, artist: tune.composer }, startSeconds);
        }
      } else {
        await loadMediaOnCast(context, contentUrl, { title: tune.name, artist: tune.composer }, startSeconds);
      }
      castHandoffInFlightRef.current = false;
      setJoinable(false);
      setSessionId(activeSessionId);
      writeStoredCastMeta({
        sessionId: activeSessionId,
        deviceName: device && device.friendlyName ? device.friendlyName : '',
        title: (payload && payload.title) || (tune && tune.name) || '',
      });
      updateEngine({
        connected: true,
        sessionId: activeSessionId,
        deviceName: device && device.friendlyName ? device.friendlyName : 'Chromecast',
        currentTime: startSeconds,
        duration: duration,
        isPlaying: true,
      });
      startStatusPoll(activeSessionId);
      if (activeSessionId) startHeartbeatPoll(activeSessionId);
      return true;
    } catch (err) {
      castHandoffInFlightRef.current = false;
      castMediaLoadedRef.current = false;
      userStopCastRef.current = true;
      if (activeSessionId) {
        try { await deleteCastSession(activeSessionId, requestOpts); } catch (e) { /* ignore */ }
      }
      endCastSdkSession();
      updateEngine(null);
      writeStoredCastMeta(null);
      setError(String(err.message || err));
      if (mediaController.silencePlaybackOutputs) {
        mediaController.silencePlaybackOutputs();
      }
      userStopCastRef.current = false;
      return false;
    } finally {
      setLoading(false);
    }
  }, [castRequestOptions, initCast, loadMediaOnCast, mediaController, startHeartbeatPoll, startStatusPoll, updateEngine, endCastSdkSession]);

  const castPlay = useCallback(function() {
    const context = castContextRef.current;
    if (!context) return;
    const session = context.getCurrentSession();
    if (!session || !session.getMediaSession) return;
    const media = session.getMediaSession();
    if (media && media.play) media.play(null, function() {});
  }, []);

  const castPause = useCallback(function() {
    const context = castContextRef.current;
    if (!context) return;
    const session = context.getCurrentSession();
    if (!session || !session.getMediaSession) return;
    const media = session.getMediaSession();
    if (media && media.pause) media.pause(null, function() {});
  }, []);

  const castSeek = useCallback(async function(seconds) {
    seekInFlightRef.current = true;
    try {
      const controller = remoteControllerRef.current;
      if (controller) {
        controller.seek(seconds);
      } else if (sessionId) {
        await seekCastSession(sessionId, seconds, castRequestOptions());
      }
      updateEngine({ currentTime: seconds });
    } finally {
      setTimeout(function() { seekInFlightRef.current = false; }, 500);
    }
  }, [castRequestOptions, sessionId, updateEngine]);

  useEffect(function() {
    initCast().catch(function() {});
    return function() {
      stopStatusPoll();
    };
  }, [initCast, stopStatusPoll]);

  return {
    connected,
    deviceName,
    sessionId,
    loading,
    error,
    canCast: canRouteToCastSdk(mediaController) && isCastWebSdkSupported(),
    startCast,
    stopCast,
    castPlay,
    castPause,
    castSeek,
    joinCast,
    joinable,
    storedCastTitle,
    resumeCast: initCast,
  };
}
