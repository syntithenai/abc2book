import { Alert, Button } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import usePlaybackRegionScan from '../usePlaybackRegionScan';
import SearchProgressBar from './SearchProgressBar';
import { isScannableLink } from '../linkPlaybackRegionScanUtils';

function getUnavailableTitle(checked, available, whisper, link) {
  if (!checked) return 'Checking media resolver...';
  if (!available) return 'Media resolver is not available';
  if (!whisper) return 'Playback region scan is not available on this resolver';
  if (!isScannableLink(link && link.link)) return 'Enter a media link URL first';
  return 'Detect intro/outro speech and set Start At and End At';
}

export default function LinkPlaybackRegionScanControls({
  tune,
  linkIndex,
  link,
  currentLinks,
  onLinksUpdated,
  className,
  idleLabel = 'Scan Range',
}) {
  const { available: resolverAvailable, checked, features } = useMediaResolverHealth();
  const {
    isScanning,
    progress,
    error,
    requestScan,
    getStatusLabel,
  } = usePlaybackRegionScan(tune && tune.id, linkIndex);

  const whisper = !!features.whisper;
  const canScan = checked && resolverAvailable && whisper && isScannableLink(link && link.link);
  const buttonLabel = isScanning ? (getStatusLabel() || 'Scanning...') : idleLabel;
  const title = getUnavailableTitle(checked, resolverAvailable, whisper, link);

  return (
    <div className={'link-playback-region-scan' + (className ? ' ' + className : '')}>
      <div className="link-playback-region-scan__button">
        <Button
          variant={isScanning ? 'warning' : 'outline-secondary'}
          size="sm"
          disabled={!canScan || isScanning}
          title={title}
          onClick={function() {
            if (!canScan) return;
            requestScan(link, {
              currentLinks: currentLinks,
              onLinksUpdated: onLinksUpdated,
            });
          }}
        >
          {buttonLabel}
        </Button>
      </div>
      {(isScanning || error) && (
        <div className="link-playback-region-scan__status">
          <SearchProgressBar
            visible={isScanning}
            percent={progress}
            message={getStatusLabel()}
            defaultMessage="Scanning for intro/outro speech..."
          />
          {error && <Alert variant="danger" style={{ marginTop: '0.35em' }}>{error}</Alert>}
        </div>
      )}
    </div>
  );
}
