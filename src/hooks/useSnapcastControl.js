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
  const [reconnecting, setReconnecting] = useState(false);
  const [connectError, setConnectError] = useState(null);
  const [server, setServer] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const clientRef = useRef(null);
  const wantsConnectedRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const reconnectAttemptRef = useRef(0);
  const selectedGroupIdRef = useRef('');
  const healthStatus = mediaResolverStatus || null;

  selectedGroupIdRef.current = selectedGroupId;
  const controlUrl = resolveSnapcastControlUrl(healthStatus, getStoredSnapcastControlUrl());
  const streamName = snapcastStreamNameFromHealth(healthStatus);

  const clearReconnectTimer = useCallback(function() {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connectInternalRef = useRef(null);

  const scheduleReconnect = useCallback(function() {
    if (!wantsConnectedRef.current) return;
    clearReconnectTimer();
    const attempt = reconnectAttemptRef.current;
    const delayMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    reconnectAttemptRef.current = attempt + 1;
    setReconnecting(true);
    reconnectTimerRef.current = setTimeout(function() {
      if (connectInternalRef.current) connectInternalRef.current();
    }, delayMs);
  }, [clearReconnectTimer]);

  const disconnect = useCallback(function() {
    wantsConnectedRef.current = false;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    setReconnecting(false);
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    setConnected(false);
    setServer(null);
  }, [clearReconnectTimer]);

  connectInternalRef.current = async function connectInternal(overrideUrl) {
    const url = resolveSnapcastControlUrl(healthStatus, overrideUrl || getStoredSnapcastControlUrl());
    const nextWs = controlUrlToJsonRpcWs(url);
    if (!nextWs) {
      setConnectError('Snapcast control URL not configured');
      setReconnecting(false);
      return false;
    }
    if (overrideUrl) setStoredSnapcastControlUrl(overrideUrl);
    if (clientRef.current) {
      clientRef.current.disconnect();
    }
    const client = new SnapcastClient(nextWs);
    client.onServerChange = function(nextServer) { setServer(nextServer); };
    client.onConnectionChange = function(isConnected, error) {
      setConnected(isConnected);
      if (isConnected) {
        setReconnecting(false);
        reconnectAttemptRef.current = 0;
        setConnectError(null);
      } else if (wantsConnectedRef.current) {
        if (error) setConnectError(String(error.message || error));
        scheduleReconnect();
      }
    };
    clientRef.current = client;
    try {
      await client.connect();
      setConnectError(null);
      setReconnecting(false);
      reconnectAttemptRef.current = 0;
      const groups = client.listGroups();
      if (!selectedGroupIdRef.current && groups.length > 0) {
        setSelectedGroupId(groups[0].id);
      }
      return true;
    } catch (err) {
      setConnectError(String(err.message || err));
      if (wantsConnectedRef.current) scheduleReconnect();
      return false;
    }
  };

  const connect = useCallback(async function(overrideUrl) {
    wantsConnectedRef.current = true;
    reconnectAttemptRef.current = 0;
    clearReconnectTimer();
    return connectInternalRef.current(overrideUrl);
  }, [clearReconnectTimer]);

  const setClientVolume = useCallback(async function(clientId, percent, mute) {
    if (!clientRef.current) return;
    await clientRef.current.setVolume(clientId, percent, mute);
  }, []);

  const setGroupStream = useCallback(async function(groupId, streamId) {
    if (!clientRef.current) return;
    await clientRef.current.setGroupStream(groupId, streamId);
  }, []);

  useEffect(function() {
    return function() {
      wantsConnectedRef.current = false;
      clearReconnectTimer();
      if (clientRef.current) {
        clientRef.current.disconnect();
        clientRef.current = null;
      }
    };
  }, [clearReconnectTimer]);

  return {
    client: clientRef,
    connected,
    reconnecting,
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
