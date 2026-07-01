import { Alert, Button } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import usePlaybackRegionScan from '../usePlaybackRegionScan';
import SearchProgressBar from './SearchProgressBar';

function isScannableLink(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:')) return false;
  return trimmed.indexOf('http://') === 0 || trimmed.indexOf('https://') === 0;
}

export default function LinkPlaybackRegionScanControls({
  tune,
  linkIndex,
  link,
  currentLinks,
  onLinksUpdated,
}) {
  const { available: resolverAvailable, features } = useMediaResolverHealth();
  const {
    isScanning,
    progress,
    error,
    requestScan,
    getStatusLabel,
  } = usePlaybackRegionScan(tune && tune.id, linkIndex);

  if (!resolverAvailable || !features.whisper || !isScannableLink(link && link.link)) {
    return error
      ? <Alert variant="danger" style={{ marginTop: '0.35em' }}>{error}</Alert>
      : null;
  }

  const buttonLabel = isScanning ? (getStatusLabel() || 'Scanning...') : 'Scan';

  return (
    <div className="link-playback-region-scan">
      <Button
        variant={isScanning ? 'warning' : 'outline-secondary'}
        size="sm"
        onClick={function() {
          requestScan(link, {
            currentLinks: currentLinks,
            onLinksUpdated: onLinksUpdated,
          });
        }}
      >
        {buttonLabel}
      </Button>
      <SearchProgressBar
        visible={isScanning}
        percent={progress}
        message={getStatusLabel()}
        defaultMessage="Scanning for intro/outro speech..."
      />
      {error && <Alert variant="danger" style={{ marginTop: '0.35em' }}>{error}</Alert>}
    </div>
  );
}
