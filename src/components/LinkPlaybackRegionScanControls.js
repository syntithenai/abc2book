import { useEffect, useMemo, useState } from 'react';
import { Alert, Button } from 'react-bootstrap';
import useMediaResolverHealth from '../useMediaResolverHealth';
import usePlaybackRegionScan from '../usePlaybackRegionScan';
import SearchProgressBar from './SearchProgressBar';
import { isScannableLink } from '../linkPlaybackRegionScanUtils';
import { getGatedActionLabel } from '../resolverCreditAccess';
import { getLinkPlayRangeAccess } from '../midiExportNotationAccess';
import { resolveResolverAccessToken } from '../resolverAccessToken';

function getScanTitle(access, whisper, link) {
  if (!isScannableLink(link && link.link)) {
    return 'Enter a media link URL first';
  }
  if (!access.showButton) return 'Media resolver is not available';
  if (!whisper) return 'Playback region scan is not available on this resolver';
  if (access.needsLogin && access.loginWarning) return access.loginWarning.message;
  if (access.needsCredit && access.loginWarning) return access.loginWarning.message;
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
  login,
  accessToken,
}) {
    const { available: resolverAvailable, checked, status, features } = useMediaResolverHealth();
  const {
    isScanning,
    progress,
    error,
    requestScan,
    getStatusLabel,
  } = usePlaybackRegionScan(tune && tune.id, linkIndex);
  const [pendingScanAfterLogin, setPendingScanAfterLogin] = useState(false);

  const scanAccess = useMemo(function() {
    return getLinkPlayRangeAccess({
      resolverAvailable: resolverAvailable,
      resolverChecked: checked,
      resolverStatus: status,
      features: features,
      accessToken: accessToken,
    });
  }, [resolverAvailable, checked, status, features, accessToken]);

  const whisper = !!features.whisper;
  const scannable = isScannableLink(link && link.link);
  const canScan = scanAccess.canOpen && whisper && scannable;
  const resolvedAccessToken = resolveResolverAccessToken(accessToken);

  useEffect(function() {
    if (!pendingScanAfterLogin || !canScan || !resolvedAccessToken) return undefined;
    setPendingScanAfterLogin(false);
    requestScan(link, {
      currentLinks: currentLinks,
      onLinksUpdated: onLinksUpdated,
    });
    return undefined;
  }, [pendingScanAfterLogin, canScan, resolvedAccessToken, link, currentLinks, onLinksUpdated, requestScan]);

  if (!scannable || !checked || !scanAccess.showButton) {
    return null;
  }

  function startScan() {
    requestScan(link, {
      currentLinks: currentLinks,
      onLinksUpdated: onLinksUpdated,
    });
  }

  function handleClick() {
    if (isScanning) return;
    if (scanAccess.needsLogin) {
      if (typeof login !== 'function') return;
      setPendingScanAfterLogin(true);
      login().catch(function() {
        setPendingScanAfterLogin(false);
      });
      return;
    }
    if (scanAccess.needsCredit) {
      if (typeof window !== 'undefined') {
        window.location.assign('/settings?tab=providers&credit=1');
      }
      return;
    }
    if (!canScan) return;
    startScan();
  }

  const buttonLabel = isScanning
    ? (getStatusLabel() || 'Scanning...')
    : getGatedActionLabel(scanAccess, idleLabel);
  const title = getScanTitle(scanAccess, whisper, link);
  const enabled = !isScanning && (scanAccess.needsLogin || scanAccess.needsCredit || canScan);

  return (
    <div className={'link-playback-region-scan' + (className ? ' ' + className : '')}>
      <div className="link-playback-region-scan__button">
        <Button
          variant={isScanning ? 'warning' : 'outline-secondary'}
          size="sm"
          disabled={!enabled}
          title={title}
          onClick={handleClick}
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
