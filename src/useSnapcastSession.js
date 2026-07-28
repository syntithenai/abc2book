import { useCallback, useEffect, useRef, useState } from 'react';
import { SnapcastClient } from './snapcastClient';
import {
  controlUrlToJsonRpcWs,
  getStoredSnapcastControlUrl,
  resolveSnapcastControlUrl,
  setStoredSnapcastControlUrl,
  snapcastStreamNameFromHealth,
} from './snapcastSupport';
import {
  createSnapcastPlaybackSession,
  deleteSnapcastSession,
  getSnapcastSessionStatus,
  postSnapcastPluginAction,
  seekSnapcastSession,
} from './snapcastPlaybackClient';

export default function useSnapcastSession({
  mediaController,
  mediaResolverStatus,
}) {
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [server, setServer] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [routing, setRouting] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const clientRef = useRef(null);
  const statusPollRef = useRef(null);
  const healthStatus = mediaResolverStatus || null;

  const controlUrl = resolveSnapcastControlUrl(healthStatus, getStoredSnapcastControlUrl());
  const streamName = snapcastStreamNameFromHealth(healthStatus);
  const wsUrl = controlUrlToJsonRpcWs(controlUrl);

  const updateRemoteEngine = useCallback(function(state) {
    if (!mediaController || !mediaController.remoteOutputEngineRef) return;
    mediaController.remoteOutputEngineRef.current = state;
  }, [mediaController]);

  const disconnectClient = useCallback(function() {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setConnected(false);
    setServer(null);
  }, []);

  const connect = useCallback(async function(overrideUrl) {
    const url = resolveSnapcastControlUrl(healthStatus, overrideUrl || getStoredSnapcastControlUrl());
    const nextWs = controlUrlToJsonRpcWs(url);
    if (!nextWs) {
      setConnectError('Snapcast control URL not configured');
      return false;
    }
    if (overrideUrl) {
      setStoredSnapcastControlUrl(overrideUrl);
    }
    disconnectClient();
    const client = new SnapcastClient(nextWs);
    client.onServerChange = function(nextServer) {
      setServer(nextServer);
    };
    client.onConnectionChange = function(isConnected, error) {
      setConnected(isConnected);
      if (error) setConnectError(String(error.message || error));
    };
    clientRef.current = client;
    try {
      await client.connect();
      setConnectError(null);
      const groups = client.listGroups();
      if (!selectedGroupId && groups.length > 0) {
        setSelectedGroupId(groups[0].id);
      }
      return true;
    } catch (err) {
      setConnectError(String(err.message || err));
      return false;
    }
  }, [disconnectClient, healthStatus, selectedGroupId]);

  const stopStatusPoll = useCallback(function() {
    if (statusPollRef.current) {
      clearInterval(statusPollRef.current);
      statusPollRef.current = null;
    }
  }, []);

  const startStatusPoll = useCallback(function(activeSessionId) {
    stopStatusPoll();
    statusPollRef.current = setInterval(function() {
      getSnapcastSessionStatus(activeSessionId).then(function(status) {
        updateRemoteEngine({
          mode: 'snapcast',
          connected: true,
          sessionId: activeSessionId,
          currentTime: status.currentTime || 0,
          duration: status.duration || 0,
          isPlaying: !!status.isPlaying,
          groupId: status.groupId || selectedGroupId,
        });
        if (mediaController && mediaController.setCurrentTime) {
          mediaController.setCurrentTime(status.currentTime || 0);
        }
        if (mediaController && mediaController.setDuration && status.duration) {
          mediaController.setDuration(status.duration);
        }
      }).catch(function() {
        // ignore transient poll errors
      });
    }, 1000);
  }, [mediaController, selectedGroupId, stopStatusPoll, updateRemoteEngine]);

  const stopRouting = useCallback(async function() {
    stopStatusPoll();
    const activeId = sessionId;
    setSessionId(null);
    setRouting(false);
    updateRemoteEngine(null);
    if (activeId) {
      try {
        await deleteSnapcastSession(activeId);
      } catch (e) {
        // ignore
      }
    }
  }, [sessionId, stopStatusPoll, updateRemoteEngine]);

  const startRouting = useCallback(async function() {
    if (!mediaController || !clientRef.current || !selectedGroupId) return false;
    const tune = mediaController.tune;
    if (!tune) return false;
    const linkIndex = mediaController.mediaLinkNumber;
    const src = mediaController.getSrc(tune, linkIndex);
    const activeLink = tune.links && tune.links[linkIndex] ? tune.links[linkIndex] : null;
    const srcType = mediaController.getSrcType(src, activeLink);
    const startSeconds = mediaController.getPlaybackProgress
      ? (mediaController.getPlaybackProgress().seconds || 0)
      : 0;
    const duration = mediaController.duration || 0;
    setRouting(true);
    try {
      const stream = clientRef.current.findStreamByName(streamName);
      if (stream) {
        await clientRef.current.setGroupStream(selectedGroupId, stream.id);
      }
      const session = await createSnapcastPlaybackSession({
        source: src,
        sourceType: srcType,
        startSeconds: startSeconds,
        duration: duration,
        groupId: selectedGroupId,
        title: tune.name || '',
        artist: tune.composer || '',
      });
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
        streamName: streamName,
      });
      startStatusPoll(activeSessionId);
      return true;
    } catch (err) {
      setRouting(false);
      setConnectError(String(err.message || err));
      return false;
    }
  }, [mediaController, selectedGroupId, startStatusPoll, streamName, updateRemoteEngine]);

  const setClientVolume = useCallback(async function(clientId, percent, mute) {
    if (!clientRef.current) return;
    await clientRef.current.setVolume(clientId, percent, mute);
  }, []);

  const seekRemote = useCallback(async function(seconds) {
    if (!sessionId) return;
    await seekSnapcastSession(sessionId, seconds);
  }, [sessionId]);

  useEffect(function() {
    if (!mediaController || !mediaController.setRemoteOutputHandlers) return undefined;
    mediaController.setRemoteOutputHandlers({
      seekRemote: seekRemote,
      pauseSnapcast: function() {
        postSnapcastPluginAction('pause').catch(function() {});
      },
      resumeSnapcast: function() {
        postSnapcastPluginAction('play').catch(function() {});
      },
      stopSnapcast: stopRouting,
    });
    return function() {
      if (mediaController.setRemoteOutputHandlers) {
        mediaController.setRemoteOutputHandlers(null);
      }
    };
  }, [mediaController, seekRemote, stopRouting]);

  useEffect(function() {
    return function() {
      stopStatusPoll();
      disconnectClient();
    };
  }, [disconnectClient, stopStatusPoll]);

  return {
    connected,
    connectError,
    server,
    controlUrl,
    streamName,
    selectedGroupId,
    setSelectedGroupId,
    routing,
    sessionId,
    connect,
    disconnect: disconnectClient,
    startRouting,
    stopRouting,
    setClientVolume,
    seekRemote,
    groups: server && Array.isArray(server.groups) ? server.groups : [],
    streams: server && Array.isArray(server.streams) ? server.streams : [],
  };
}
