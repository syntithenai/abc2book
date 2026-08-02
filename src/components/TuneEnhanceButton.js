import { Button } from 'react-bootstrap'
import { toast } from 'react-toastify'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { useFieldLookupResolverAccess } from '../fieldLookupResolverAccess'
import { useCreditAffordance } from '../useCreditAffordance'
import useBulkBackgroundResearchQueue from '../useBulkBackgroundResearchQueue'
import useBulkComposerDiscoveryQueue from '../useBulkComposerDiscoveryQueue'
import useTuneFieldLookupQueue from '../useTuneFieldLookupQueue'
import { lyricLinesToText } from '../wLinesUtils'
import { capitalizeSongTitle, isSongTitleCapitalized } from '../titleCaseUtils'
import { primaryArtist } from '../tuneBibliographicUtils'
import { isTuneFieldEmptyForKind } from '../fieldLookupApplyUtils'
import { enrichTuneMetadataFromMusicBrainz } from '../tuneMetadataEnhance'

const ENHANCE_KINDS = ['chords', 'lyrics', 'notation', 'links']
const METADATA_KINDS = ['composer', 'artists', 'albums', 'genre']

/**
 * Header control: queue every available information enhancement for one tune.
 */
export default function TuneEnhanceButton({
  tune,
  tunebook,
  token,
  forceRefresh,
}) {
  const { available: resolverAvailable, checked } = useMediaResolverHealth()
  const resolverAccess = useFieldLookupResolverAccess(token)
  const composerAffordance = useCreditAffordance(token, 'composer_discovery')
  const fieldLookupQueue = useTuneFieldLookupQueue()
  const backgroundQueue = useBulkBackgroundResearchQueue()
  const composerQueue = useBulkComposerDiscoveryQueue()
  const icons = tunebook && tunebook.icons ? tunebook.icons : null
  const title = tune && tune.name ? String(tune.name).trim() : ''
  const canEnhance = !!(tune && tune.id && title)

  function accessToken() {
    return token || ''
  }

  function runEnhance() {
    if (!canEnhance || !tunebook) return

    if (!isSongTitleCapitalized(tune.name)) {
      const next = Object.assign({}, tune, { name: capitalizeSongTitle(tune.name) })
      tunebook.saveTune(next, false, { historyLabel: 'Capitalise title', immediate: true })
      if (typeof forceRefresh === 'function') forceRefresh()
    }

    const tokenValue = accessToken()
    let queued = 0
    const needsMetadata = METADATA_KINDS.some(function(kind) {
      return isTuneFieldEmptyForKind(tune, kind)
    })
    if (needsMetadata) {
      queued += 1
      enrichTuneMetadataFromMusicBrainz(tune, {
        title: title,
        artist: primaryArtist(tune),
        accessToken: tokenValue,
        resolverAvailable: checked ? resolverAvailable : undefined,
      }).then(function(result) {
        const applied = result && result.applied ? result.applied : {}
        if (Object.keys(applied).length) {
          tunebook.saveTune(tune, false, { historyLabel: 'Enhance metadata', immediate: true })
          if (typeof forceRefresh === 'function') forceRefresh()
        }
      }).catch(function(e) {
        console.log(e)
      })
    }

    ENHANCE_KINDS.forEach(function(kind) {
      if (kind !== 'links' && !isTuneFieldEmptyForKind(tune, kind)) return
      const id = fieldLookupQueue.enqueueLookup({
        tuneId: tune.id,
        kind: kind,
        title: title,
        artist: primaryArtist(tune),
        tuneName: title,
        accessToken: tokenValue,
        options: kind === 'links' ? { alwaysPick: true } : undefined,
        searchOptions: {
          resolverAvailable: checked ? resolverAvailable : undefined,
          abcTools: tunebook.abcTools || null,
          isYoutubeLink: tunebook.utils && tunebook.utils.isYoutubeLink
            ? tunebook.utils.isYoutubeLink
            : null,
        },
      })
      if (id) queued += 1
    })

    const discoveryPreview = composerQueue.previewEnqueueTunes([tune])
    const canAffordComposer = composerAffordance.creditUnlimited
      || !composerAffordance.checked
      || composerAffordance.affordable
    if (!needsMetadata && discoveryPreview.willDiscover > 0 && canAffordComposer) {
      composerQueue.enqueueTunes([tune], { accessToken: tokenValue })
      composerQueue.start()
    }

    const backgroundPreview = backgroundQueue.previewEnqueueTunes
      ? backgroundQueue.previewEnqueueTunes([tune])
      : null
    const willResearch = backgroundPreview
      ? backgroundPreview.willResearch
      : 1
    const canAffordBackground = !resolverAccess.cannotAffordBackground
    if (willResearch > 0 && canAffordBackground) {
      backgroundQueue.enqueueTunes([tune], {
        accessToken: tokenValue,
        lyricsForTune: lyricLinesToText,
      })
      backgroundQueue.start()
    }

    const queuedBackground = willResearch > 0 && canAffordBackground
    if (queued > 0
      || (!needsMetadata && discoveryPreview.willDiscover > 0 && canAffordComposer)
      || queuedBackground) {
      toast.success('Queued enhancements for this tune.')
    } else {
      toast.info('No new enhancements queued (fields already filled or jobs already running).')
    }
  }

  return (
    <Button
      variant="warning"
      title="Enhance all available information for this tune"
      aria-label="Enhance tune"
      disabled={!canEnhance}
      onClick={runEnhance}
    >
      {icons && icons.search ? icons.search : null}
      <> Enhance</>
    </Button>
  )
}
