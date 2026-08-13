import { getPracticeTrackAccess } from './practiceTrackAccess';
import { isTaskAvailable } from './audioGenerationPresets';
import { isMusicGenerationAdmin } from './musicGenerationAdmin';

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
  const practiceFromBackends = isTaskAvailable(backends, 'practice_track');
  const coverFromBackends = isTaskAvailable(backends, 'linked_cover');

  const practiceAvailable = practiceFromBackends || base.hasCapability || featureEnabled || backendsOk;
  const coverAvailable = coverFromBackends || base.hasCapability || featureEnabled || backendsOk;

  const cannotAfford = !!base.cannotAfford

  const canGenerate = (
    base.canGenerate
    || backendsOk
    || (featureEnabled && resolverAvailable && resolverChecked)
  ) && !base.needsLogin && !base.needsCredit && !cannotAfford;

  // Admin-only UI: show Generate/Regenerate as soon as resolver health has been
  // checked, including after login while availability is still catching up.
  const showButton = resolverChecked;

  return Object.assign({}, base, {
    practiceTrackAvailable: practiceAvailable || showButton,
    linkedCoverAvailable: coverAvailable || showButton,
    hasAnyTask: practiceAvailable || coverAvailable || showButton,
    showButton: showButton,
    canGenerate: canGenerate,
  });
}

export { getPracticeTrackAccess, getPracticeTrackGenerateLabel } from './practiceTrackAccess';
