import { useMemo } from 'react'
import { toast } from 'react-toastify'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupResolverAccess } from '../fieldLookupResolverAccess'
import { useCreditAffordance } from '../useCreditAffordance'
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue'
import useBulkComposerDiscoveryQueue from '../useBulkComposerDiscoveryQueue'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import { lyricLinesToText } from '../wLinesUtils'
import { isCapabilityAvailable, loadProviderSettings } from '../providerSettings'
import { useAutoLinkPlaybackRegionScan } from '../useAutoLinkPlaybackRegionScan'
import { useTuneMediaAnalysisDeps } from '../useTuneMediaAnalysis'
import { getLinkedMediaSources } from '../mediaTranscriptionSources'
import EnhanceOptionsDropdown from './EnhanceOptionsDropdown'
import { startEnhanceJobs, enhanceStartToastMessage } from '../startEnhanceJobs'

/**
 * Control: pick and queue information enhancements for one tune.
 */
export default function TuneEnhanceButton({
  tune,
  tunebook,
  token,
  login,
  forceRefresh,
  className,
  toggleClassName,
  toggleLabel,
  labelClassName,
  hideLabel,
  onOpen,
  onAfterStart,
}) {
  const { available: resolverAvailable, checked, features } = useMediaResolverHealth()
  const resolverAccess = useFieldLookupResolverAccess(token)
  const composerAffordance = useCreditAffordance(token, 'composer_discovery')
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const backgroundQueue = useBulkBackgroundResearchQueue()
  const composerQueue = useBulkComposerDiscoveryQueue()
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
  const existingAnalysisDeps = useTuneMediaAnalysisDeps()
  const analysisDeps = existingAnalysisDeps || {
    tunebook: tunebook,
    tunes: tune && tune.id ? { [tune.id]: tune } : {},
    token: token,
    forceRefresh: forceRefresh,
    accessToken: token && token.access_token ? token.access_token : token,
  }
  const icons = tunebook && tunebook.icons ? tunebook.icons : null
  const title = tune && tune.name ? String(tune.name).trim() : ''
  const canEnhance = !!(tune && tune.id && title)
  const canResearchBackground = resolverAvailable
    && isCapabilityAvailable('llm', features, loadProviderSettings())
    && !resolverAccess.cannotAffordBackground
  const canAffordComposer = composerAffordance.creditUnlimited
    || !composerAffordance.checked
    || composerAffordance.affordable

  const mediaSources = useMemo(function() {
    return getLinkedMediaSources(tune, tunebook).map(function(source) {
      return {
        id: source.id,
        linkIndex: source.linkIndex,
        label: source.label,
      }
    })
  }, [tune, tunebook])
  const hasScannableLinkedMedia = mediaSources.length > 0

  function handleStart(selection, startOptions) {
    if (!canEnhance || !tunebook) return
    const audioLinkIndex = startOptions && startOptions.audioLinkIndex
    const result = startEnhanceJobs([tune], selection, {
      tunebook: tunebook,
      token: token,
      accessToken: token || '',
      checked: checked,
      resolverAvailable: resolverAvailable,
      features: features,
      canResearchBackground: canResearchBackground,
      canAffordComposer: canAffordComposer,
      hasScannableLinkedMedia: hasScannableLinkedMedia,
      needsLogin: !!resolverAccess.needsLogin,
      needsNetwork: !!resolverAccess.needsNetwork,
      needsCredit: !!resolverAccess.needsCredit,
      loginWarning: resolverAccess.loginWarning || null,
      fieldLookupQueue: fieldLookupQueue,
      composerQueue: composerQueue,
      backgroundQueue: backgroundQueue,
      lyricsForTune: lyricLinesToText,
      maybeAutoScan: maybeAutoScan,
      analysisDeps: analysisDeps,
      forceRefresh: forceRefresh,
      audioLinkIndex: audioLinkIndex,
    })
    const message = enhanceStartToastMessage(result)
    if (result.started > 0) {
      toast.success(message)
    } else {
      toast.info(message)
    }
    if (typeof onAfterStart === 'function') onAfterStart(result)
  }

  const availabilityContext = {
    resolverAvailable: resolverAvailable,
    features: features || {},
    canResearchBackground: canResearchBackground,
    canAffordComposer: canAffordComposer,
    hasScannableLinkedMedia: hasScannableLinkedMedia,
    needsLogin: !!resolverAccess.needsLogin,
    needsNetwork: !!resolverAccess.needsNetwork,
    needsCredit: !!resolverAccess.needsCredit,
    loginWarning: resolverAccess.loginWarning || null,
  }

  return (
    <EnhanceOptionsDropdown
      id="tune-enhance"
      className={className || 'tune-enhance-dropdown'}
      toggleClassName={toggleClassName}
      toggleLabel={toggleLabel}
      labelClassName={labelClassName}
      hideLabel={hideLabel}
      disabled={!canEnhance}
      title="Enhance information for this tune"
      icons={icons}
      availabilityContext={availabilityContext}
      mediaSources={mediaSources}
      onOpen={onOpen}
      onLogin={login}
      onStart={handleStart}
    />
  )
}
