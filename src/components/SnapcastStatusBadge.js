import { Badge } from 'react-bootstrap';
import { snapcastAvailableFromHealth } from '../snapcastSupport';

function countSnapcastClients(groups) {
  let total = 0;
  (groups || []).forEach(function(group) {
    total += (group.clients || []).length;
  });
  return total;
}

export default function SnapcastStatusBadge({
  snapcastEnabled,
  healthStatus,
  connected,
  reconnecting,
  routing,
  groups,
  className,
}) {
  const snapcast = healthStatus && healthStatus.snapcast ? healthStatus.snapcast : null;
  const pcmLinked = !!(snapcast && snapcast.pcmLinked);
  const clientCount = countSnapcastClients(groups);

  let variant = 'secondary';
  let label = 'Snapcast off';

  if (!snapcastEnabled) {
    label = 'Snapcast off';
  } else if (snapcast && snapcast.enabled && !snapcastAvailableFromHealth(healthStatus)) {
    variant = 'warning';
    label = 'Snapcast unreachable';
  } else if (reconnecting) {
    variant = 'info';
    label = 'Reconnecting…';
  } else if (routing) {
    variant = pcmLinked ? 'success' : 'warning';
    label = pcmLinked ? 'Routing to speakers' : 'Routing (PCM not linked)';
  } else if (connected) {
    variant = 'primary';
    label = clientCount > 0
      ? 'Connected (' + clientCount + ' speaker' + (clientCount === 1 ? '' : 's') + ')'
      : 'Connected';
  } else if (snapcast && snapcast.enabled) {
    variant = 'light';
    label = 'Snapcast ready';
  }

  return (
    <Badge bg={variant} className={className || ''} text={variant === 'light' ? 'dark' : undefined}>
      {label}
    </Badge>
  );
}

export function snapcastStatusSummary(healthStatus, groups, options) {
  const snapcast = healthStatus && healthStatus.snapcast ? healthStatus.snapcast : null;
  if (!snapcast || !snapcast.enabled) {
    return 'Snapcast is not enabled on your resolver.';
  }
  const routing = !!(options && options.routing);
  const clientCount = countSnapcastClients(groups);
  const parts = [];
  if (clientCount > 0) {
    parts.push(clientCount + ' speaker' + (clientCount === 1 ? '' : 's') + ' connected');
  } else {
    parts.push('No snapclients connected yet');
  }
  if (snapcast.pcmLinked) {
    parts.push('resolver linked to snapserver');
  } else if (!snapcast.reachable) {
    parts.push('snapserver not reachable');
  } else if (routing) {
    parts.push('PCM not reaching snapserver — check docker logs on the resolver');
  } else {
    parts.push('idle — PCM link activates when you press Play on Snapcast');
  }
  return parts.join(' · ');
}
