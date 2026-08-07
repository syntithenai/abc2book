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
  const mediaControllerRef = useRef(mediaController);
  mediaControllerRef.current = mediaController;

  const updateEngine = useCallback(function(next) {
    const mc = mediaControllerRef.current;
    if (!mc || !mc.remoteOutputEngineRef) return;
    mc.remoteOutputEngineRef.current = next;
    setConnected(!!(next && next.connected));
    setMode(next ? next.mode : null);
  }, []);

  const disconnectCast = useCallback(function() {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    updateEngine(null);
  }, [updateEngine]);

  const startAirPlay = useCallback(function() {
    const el = getNativeAudioElement(mediaControllerRef.current);
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
  }, [disconnectCast, updateEngine]);

  const startRemotePlayback = useCallback(function() {
    const el = getNativeAudioElement(mediaControllerRef.current);
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
  }, [disconnectCast, startAirPlay, updateEngine]);

  const startCastHandoff = useCallback(function() {
    if (!canCastNativeAudio(mediaControllerRef.current)) return Promise.resolve(false);
    if (isRemotePlaybackSupported()) {
      return startRemotePlayback();
    }
    if (isAirPlaySupported()) {
      return Promise.resolve(startAirPlay());
    }
    return Promise.resolve(false);
  }, [startAirPlay, startRemotePlayback]);

  useEffect(function() {
    return function() {
      disconnectCast();
    };
  }, [disconnectCast]);

  return {
    connected,
    mode,
    canCast: canCastNativeAudio(mediaControllerRef.current),
    disabledReason: getCastDisabledReason(mediaControllerRef.current),
    isAirPlaySupported: isAirPlaySupported(),
    isRemotePlaybackSupported: isRemotePlaybackSupported(),
    startCastHandoff,
    disconnectCast,
  };
}
