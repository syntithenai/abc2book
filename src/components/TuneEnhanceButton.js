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
import EnhanceOptionsDropdown from './EnhanceOptionsDropdown'
import { startEnhanceJobs, enhanceStartToastMessage } from '../startEnhanceJobs'

/**
 * Header control: pick and queue information enhancements for one tune.
 */
export default function TuneEnhanceButton({
  tune,
  tunebook,
  token,
  forceRefresh,
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

  function handleStart(selection) {
    if (!canEnhance || !tunebook) return
    const result = startEnhanceJobs([tune], selection, {
      tunebook: tunebook,
      token: token,
      accessToken: token || '',
      checked: checked,
      resolverAvailable: resolverAvailable,
      features: features,
      canResearchBackground: canResearchBackground,
      canAffordComposer: canAffordComposer,
      fieldLookupQueue: fieldLookupQueue,
      composerQueue: composerQueue,
      backgroundQueue: backgroundQueue,
      lyricsForTune: lyricLinesToText,
      maybeAutoScan: maybeAutoScan,
      analysisDeps: analysisDeps,
      forceRefresh: forceRefresh,
    })
    const message = enhanceStartToastMessage(result)
    if (result.started > 0) {
      toast.success(message)
    } else {
      toast.info(message)
    }
  }

  return (
    <EnhanceOptionsDropdown
      id="tune-enhance"
      className="tune-enhance-dropdown"
      disabled={!canEnhance}
      title="Enhance information for this tune"
      icons={icons}
      onStart={handleStart}
    />
  )
}
