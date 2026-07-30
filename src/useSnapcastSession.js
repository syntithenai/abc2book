import useSnapcastControl from './hooks/useSnapcastControl';
import useSnapcastPlayback from './hooks/useSnapcastPlayback';

export default function useSnapcastSession({
  mediaController,
  mediaResolverStatus,
}) {
  const snapcastControl = useSnapcastControl(mediaResolverStatus);
  const snapcastPlayback = useSnapcastPlayback({
    mediaController: mediaController,
    snapcastControl: snapcastControl,
  });

  return {
    connected: snapcastControl.connected,
    reconnecting: snapcastControl.reconnecting,
    connectError: snapcastControl.connectError,
    server: snapcastControl.server,
    controlUrl: snapcastControl.controlUrl,
    streamName: snapcastControl.streamName,
    selectedGroupId: snapcastControl.selectedGroupId,
    setSelectedGroupId: snapcastControl.setSelectedGroupId,
    routing: snapcastPlayback.routing,
    sessionId: snapcastPlayback.sessionId,
    routingError: snapcastPlayback.routingError,
    connect: snapcastControl.connect,
    disconnect: snapcastControl.disconnect,
    startRouting: snapcastPlayback.startRouting,
    startRoutingWithConnect: snapcastPlayback.startRoutingWithConnect,
    stopRouting: snapcastPlayback.stopRouting,
    setClientVolume: snapcastControl.setClientVolume,
    seekRemote: snapcastPlayback.seekRemote,
    groups: snapcastControl.groups,
    streams: snapcastControl.streams,
  };
}
