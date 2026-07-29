import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canCastNativeAudio,
  getCastDisabledReason,
  getNativeAudioElement,
  isAirPlaySupported,
  isRemotePlaybackSupported,
  promptAirPlay,
  promptRemotePlayback,
  watchRemotePlaybackConnection,
} from './mediaCastSupport';

export default function useRemoteCastPlayback({ mediaController }) {
  const [connected, setConnected] = useState(false);
  const [mode, setMode] = useState(null);
  const cleanupRef = useRef(null);

  const updateEngine = useCallback(function(next) {
    if (!mediaController || !mediaController.remoteOutputEngineRef) return;
    mediaController.remoteOutputEngineRef.current = next;
    setConnected(!!(next && next.connected));
    setMode(next ? next.mode : null);
  }, [mediaController]);

  const disconnectCast = useCallback(function() {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    updateEngine(null);
  }, [updateEngine]);

  const startAirPlay = useCallback(function() {
    const el = getNativeAudioElement(mediaController);
    if (!el) return false;
    if (cleanupRef.current) cleanupRef.current();
    cleanupRef.current = watchRemotePlaybackConnection(el, {
      onConnect: function() {
        updateEngine({ mode: 'airplay', connected: true, subMode: 'remotePlayback' });
      },
      onDisconnect: function() {
        disconnectCast();
      },
    });
    if (isAirPlaySupported()) {
      promptAirPlay(el);
      updateEngine({ mode: 'cast', connected: false, subMode: 'airplay', pending: true });
      return true;
    }
    return false;
  }, [disconnectCast, mediaController, updateEngine]);

  const startRemotePlayback = useCallback(function() {
    const el = getNativeAudioElement(mediaController);
    if (!el) return false;
    if (cleanupRef.current) cleanupRef.current();
    cleanupRef.current = watchRemotePlaybackConnection(el, {
      onConnect: function() {
        updateEngine({ mode: 'cast', connected: true, subMode: 'remotePlayback' });
      },
      onDisconnect: function() {
        disconnectCast();
      },
    });
    return promptRemotePlayback(el).then(function(ok) {
      if (ok) return true;
      return startAirPlay();
    });
  }, [disconnectCast, mediaController, startAirPlay, updateEngine]);

  const startCastHandoff = useCallback(function() {
    if (!canCastNativeAudio(mediaController)) return Promise.resolve(false);
    if (isRemotePlaybackSupported()) {
      return startRemotePlayback();
    }
    if (isAirPlaySupported()) {
      return Promise.resolve(startAirPlay());
    }
    return Promise.resolve(false);
  }, [mediaController, startAirPlay, startRemotePlayback]);

  useEffect(function() {
    return function() {
      disconnectCast();
    };
  }, [disconnectCast]);

  return {
    connected,
    mode,
    canCast: canCastNativeAudio(mediaController),
    disabledReason: getCastDisabledReason(mediaController),
    isAirPlaySupported: isAirPlaySupported(),
    isRemotePlaybackSupported: isRemotePlaybackSupported(),
    startCastHandoff,
    disconnectCast,
  };
}
