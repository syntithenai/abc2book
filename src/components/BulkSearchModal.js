import { useMemo, useState } from 'react'
import { toast } from 'react-toastify'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupResolverAccess } from '../fieldLookupResolverAccess'
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue'
import useBulkComposerDiscoveryQueue from '../useBulkComposerDiscoveryQueue'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import { lyricLinesToText } from '../wLinesUtils'
import { useAutoLinkPlaybackRegionScan } from '../useAutoLinkPlaybackRegionScan'
import { isCapabilityAvailable, loadProviderSettings } from '../providerSettings'
import EnhanceOptionsDropdown from './EnhanceOptionsDropdown'
import BulkComposerDiscoveryQueueModal from './BulkComposerDiscoveryQueueModal'
import BulkBackgroundResearchQueueModal from './BulkBackgroundResearchQueueModal'
import TuneFieldLookupQueueModal from './TuneFieldLookupQueueModal'
import { startEnhanceJobs, enhanceStartToastMessage } from '../startEnhanceJobs'

export default function BulkSearchModal({
  tunebook,
  selected,
  selectedCount,
  token,
  forceRefresh,
}) {
  const icons = tunebook.icons
  const [showFieldLookupQueue, setShowFieldLookupQueue] = useState(false)
  const [showResearchQueue, setShowResearchQueue] = useState(false)
  const [showComposerQueue, setShowComposerQueue] = useState(false)
  const queue = useBulkBackgroundResearchQueue()
  const composerQueue = useBulkComposerDiscoveryQueue()
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const { maybeAutoScan } = useAutoLinkPlaybackRegionScan()
  const {
    available: resolverAvailable,
    checked,
    features,
  } = useMediaResolverHealth()
  const resolverAccess = useFieldLookupResolverAccess(token)
  const canResearchBackground = resolverAvailable
    && isCapabilityAvailable('llm', features, loadProviderSettings())
    && !resolverAccess.cannotAffordBackground

  const analysisDeps = useMemo(function() {
    const tunes = {}
    const selectedTunesList = tunebook.fromSelection(selected)
    selectedTunesList.forEach(function(tune) {
      if (tune && tune.id) tunes[tune.id] = tune
    })
    return {
      tunebook: tunebook,
      tunes: tunes,
      token: token,
      forceRefresh: forceRefresh,
      accessToken: token && token.access_token ? token.access_token : token,
    }
  }, [tunebook, selected, token, forceRefresh])

  function selectedTunes() {
    return tunebook.fromSelection(selected)
  }

  function accessToken() {
    return token && token.access_token ? token.access_token : null
  }

  function handleStart(selection) {
    const result = startEnhanceJobs(selectedTunes(), selection, {
      tunebook: tunebook,
      token: token,
      accessToken: accessToken(),
      checked: checked,
      resolverAvailable: resolverAvailable,
      features: features,
      canResearchBackground: canResearchBackground,
      fieldLookupQueue: fieldLookupQueue,
      composerQueue: composerQueue,
      backgroundQueue: queue,
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
    if (result.fieldLookups > 0 || result.youtube > 0) setShowFieldLookupQueue(true)
    if (result.background > 0) setShowResearchQueue(true)
    if (result.composer > 0) setShowComposerQueue(true)
  }

  return (
    <>
      <EnhanceOptionsDropdown
        id="bulk-ops-enhance"
        className="bulk-ops-search-dropdown"
        toggleClassName="bulk-ops-action-btn"
        toggleLabel=" Enhance"
        icons={icons}
        title={
          'Enhance '
          + (selectedCount || 0)
          + ' selected tune'
          + (selectedCount === 1 ? '' : 's')
        }
        onStart={handleStart}
      />

      <TuneFieldLookupQueueModal
        show={showFieldLookupQueue}
        onHide={function() { setShowFieldLookupQueue(false) }}
        tunebook={tunebook}
      />
      <BulkBackgroundResearchQueueModal
        show={showResearchQueue}
        onHide={function() { setShowResearchQueue(false) }}
        tunebook={tunebook}
      />
      <BulkComposerDiscoveryQueueModal
        show={showComposerQueue}
        onHide={function() { setShowComposerQueue(false) }}
        tunebook={tunebook}
      />
    </>
  )
}
