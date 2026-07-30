import { createContext, useContext, useEffect } from 'react';
import useSnapcastSession from './useSnapcastSession';
import useMediaCastSession from './useMediaCastSession';
import useRemoteCastPlayback from './useRemoteCastPlayback';
import { postSnapcastPluginAction } from './snapcastPlaybackClient';

const RemoteOutputContext = createContext(null);

export function RemoteOutputProvider({ children, mediaController }) {
  const snapcast = useSnapcastSession({
    mediaController: mediaController,
    mediaResolverStatus: mediaController && mediaController.mediaResolverStatus
      ? mediaController.mediaResolverStatus
      : null,
  });
  const castSession = useMediaCastSession({ mediaController: mediaController });
  const airplayCast = useRemoteCastPlayback({ mediaController: mediaController });

  useEffect(function() {
    if (!mediaController || !mediaController.setSnapcastOutputHandlers) return undefined;
    mediaController.setSnapcastOutputHandlers({
      seekRemote: snapcast.seekRemote,
      pauseSnapcast: function() {
        postSnapcastPluginAction('pause').catch(function() {});
      },
      resumeSnapcast: function() {
        postSnapcastPluginAction('play').catch(function() {});
      },
      stopSnapcast: snapcast.stopRouting,
    });
    return function() {
      mediaController.setSnapcastOutputHandlers(null);
    };
  }, [
    mediaController,
    snapcast.seekRemote,
    snapcast.stopRouting,
  ]);

  useEffect(function() {
    if (!mediaController || !mediaController.setRemoteOutputHandlers) return undefined;
    mediaController.setRemoteOutputHandlers({
      seekRemote: function(seconds) {
        if (castSession.connected) castSession.castSeek(seconds);
      },
      pauseCast: castSession.castPause,
      resumeCast: castSession.castPlay,
      stopCast: castSession.stopCast,
      disconnectCast: airplayCast.disconnectCast,
    });
    return function() {
      mediaController.setRemoteOutputHandlers(null);
    };
  }, [
    airplayCast.disconnectCast,
    castSession.castPause,
    castSession.castPlay,
    castSession.castSeek,
    castSession.connected,
    castSession.stopCast,
    mediaController,
  ]);

  const value = {
    snapcast: snapcast,
    castSession: castSession,
    airplayCast: airplayCast,
  };

  return (
    <RemoteOutputContext.Provider value={value}>
      {children}
    </RemoteOutputContext.Provider>
  );
}

/** @deprecated Use RemoteOutputProvider */
export const SnapcastProvider = RemoteOutputProvider;

function useRemoteOutputContext() {
  const context = useContext(RemoteOutputContext);
  if (!context) {
    throw new Error('useSnapcast must be used within RemoteOutputProvider');
  }
  return context;
}

export function useSnapcast() {
  return useRemoteOutputContext().snapcast;
}

export function useCastSession() {
  return useRemoteOutputContext().castSession;
}

export function useAirplayCast() {
  return useRemoteOutputContext().airplayCast;
}
