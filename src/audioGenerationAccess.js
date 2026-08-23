import { getPracticeTrackAccess } from './practiceTrackAccess';
import { isTaskAvailable } from './audioGenerationPresets';
import { isMusicGenerationAdmin } from './musicGenerationAdmin';
import { normalizeAccessToken } from './resolverCreditAccess';

function hiddenAudioGenerationAccess(base) {
  return Object.assign({}, base, {
    practiceTrackAvailable: false,
    linkedCoverAvailable: false,
    hasAnyTask: false,
    showButton: false,
    canGenerate: false,
  });
}

export function getAudioGenerationAccess(context) {
  const opts = context || {};
  const base = getPracticeTrackAccess(opts);
  if (!isMusicGenerationAdmin(opts.user, opts.resolverStatus)) {
    return hiddenAudioGenerationAccess(base);
  }
  const backends = opts.backends || null;
  const features = opts.features || {};
  const resolverChecked = opts.resolverChecked !== false;
  const resolverAvailable = opts.resolverAvailable !== false;
  const featureEnabled = features.practiceTrack === true;
  const backendsOk = !!(backends && backends.ok);
  const backendsKnownDown = !!(backends && backends.ok === false);
  const practiceFromBackends = isTaskAvailable(backends, 'practice_track');
  const coverFromBackends = isTaskAvailable(backends, 'linked_cover');

  const practiceAvailable = practiceFromBackends || base.hasCapability || featureEnabled || backendsOk;
  const coverAvailable = coverFromBackends || base.hasCapability || featureEnabled || backendsOk;

  const cannotAfford = !!base.cannotAfford
  // Admin Generate can show while /health is still login_required after GIS login.
  // If we already have a bearer, do not keep the Login CTA — that opens a null-token
  // probe and surfaces a confusing "Login to continue" toast while logged in.
  const hasBearer = !!normalizeAccessToken(opts.accessToken);
  const needsLogin = backendsKnownDown ? false : (!!base.needsLogin && !hasBearer);

  const canGenerate = (
    base.canGenerate
    || backendsOk
    || (featureEnabled && resolverAvailable && resolverChecked)
  ) && !needsLogin && !base.needsCredit && !cannotAfford && !backendsKnownDown;

  // Admin-only UI: show Generate/Regenerate as soon as resolver health has been
  // checked, including after login while availability is still catching up.
  const showButton = resolverChecked;

  return Object.assign({}, base, {
    practiceTrackAvailable: practiceAvailable || showButton,
    linkedCoverAvailable: coverAvailable || showButton,
    hasAnyTask: practiceAvailable || coverAvailable || showButton,
    showButton: showButton,
    needsLogin: needsLogin,
    canGenerate: canGenerate,
    providerUnavailable: backendsKnownDown,
  });
}

export { getPracticeTrackAccess, getPracticeTrackGenerateLabel } from './practiceTrackAccess';
