import { useCallback, useEffect, useRef, useState } from 'react';
import { SnapcastClient } from '../snapcastClient';
import {
  controlUrlToJsonRpcWs,
  getStoredSnapcastControlUrl,
  resolveSnapcastControlUrl,
  setStoredSnapcastControlUrl,
  snapcastStreamNameFromHealth,
} from '../snapcastSupport';

export default function useSnapcastControl(mediaResolverStatus) {
  const [connected, setConnected] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [server, setServer] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const clientRef = useRef(null);
  const healthStatus = mediaResolverStatus || null;

  const controlUrl = resolveSnapcastControlUrl(healthStatus, getStoredSnapcastControlUrl());
  const streamName = snapcastStreamNameFromHealth(healthStatus);

  const disconnect = useCallback(function() {
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
    if (overrideUrl) setStoredSnapcastControlUrl(overrideUrl);
    disconnect();
    const client = new SnapcastClient(nextWs);
    client.onServerChange = function(nextServer) { setServer(nextServer); };
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
  }, [disconnect, healthStatus, selectedGroupId]);

  const setClientVolume = useCallback(async function(clientId, percent, mute) {
    if (!clientRef.current) return;
    await clientRef.current.setVolume(clientId, percent, mute);
  }, []);

  const setGroupStream = useCallback(async function(groupId, streamId) {
    if (!clientRef.current) return;
    await clientRef.current.setGroupStream(groupId, streamId);
  }, []);

  useEffect(function() {
    return function() { disconnect(); };
  }, [disconnect]);

  return {
    client: clientRef,
    connected,
    connectError,
    server,
    controlUrl,
    streamName,
    selectedGroupId,
    setSelectedGroupId,
    connect,
    disconnect,
    setClientVolume,
    setGroupStream,
    groups: server && Array.isArray(server.groups) ? server.groups : [],
    streams: server && Array.isArray(server.streams) ? server.streams : [],
  };
}
