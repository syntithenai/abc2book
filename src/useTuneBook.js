import React from 'react'
import {useState, useEffect, useRef, useCallback} from 'react'
import axios from 'axios'
import useUtils from './useUtils'
import { getAudioFilterSettings } from './pitchTempoUtils'
import useAbcTools from './useAbcTools'
import useIndexes from './useIndexes'
import { allArtists, allTitles, tuneMatchesArtistFilter, tuneMatchesGenreFilter } from './tuneBibliographicUtils'
import { tuneMatchesPdfSnapshotSearch } from './pdfSnapshotIndex'
import { matchesMainSearchText } from './searchTextUtils'
import {icons} from './Icons'
import curatedTuneBooks from './CuratedTuneBooks'
import abcjs from "abcjs";
import { syncLegacyLinkLoopFields } from './mediaPlaybackUtils'
import { linkUriString } from './tuneLinkUri'
import { getLyricLines } from './wLinesUtils'
import { buildNotationWLines } from './noteSpacingUtils'
import { filterTunes } from './tuneListFilter'
import { resolveCandidateTuneIds } from './tuneCandidateFilter'
import { PLAYLIST_MAX_ITEMS } from './tuneScaleConstants'
import { compareTuneBooks, createTombstone, mergeDeletedTuneMaps, parseDeletedTunesFromAbc, tombstoneAllTunes } from './tuneBookSync'
import { applyDuplicateBookMerges } from './importDuplicateBooks'
import { importTitlesMatchForDeduping, tuneImportTitle } from './importTitleMatch'
import { matchesShareImportScope } from './shareTunebookUtils'
import {
  createQueue,
  isQueueActive,
  getCurrentItem,
  getCurrentTuneId,
  advanceQueue,
  setQueueIndex,
  sortTunesForQueue,
  tuneIdsFromTunes,
  clampTuneIds,
  shouldSuppressFollowNavigate,
  resolvePlaybackForItem,
  isLessonQueue,
  isExternalQueueItem,
  isLessonExternalMedia,
} from './nowPlayingQueue'
import {
  playQueueItem,
  playCurrentQueueItem,
  navigateToQueueTune,
  handleQueueAdvanceOnEnded,
  advanceQueueToPlayableAndStart,
} from './nowPlayingQueuePlayback'
import { playExternalMediaItem } from './standaloneMediaPlayback'
import { advanceQueueToNextPlayable, stopPlaylistPlayback } from './playlistPlaybackResilience'
import { announcePlaylistTrack } from './playlistTitleAnnouncement'
import { announceFootPedalOpeningTune } from './footPedalOpeningToast'
import { playLessonYoutube, isLessonYoutubePlaying } from './lessonYoutubePlayer'
import { enqueueAutoCacheForTuneLinks, startMediaLinkAutoCacheQueue } from './mediaLinkAutoCache'
import {
  tuneHasPendingOwnedMediaUpload,
  uploadOwnedMediaLinksForTune,
} from './linkRecording'
import { getActiveResolverAccessToken } from './mediaResolverHealthStore'
import { requestNavigatePlayback } from './tunePlaybackActions'
import { playTuneNow } from './tunePlaybackActions'
import {
  isQueuePlaybackEngaged,
  shouldUseQueueNavigationForAdjacent,
  shouldPreservePlaylistAudioDuringSearchBrowse,
  shouldStartPlaybackWhenAdvancing,
} from './playbackNavigationUtils'
import {
  isNavigatorOffline,
  playbackModeFromPathname,
  findNextOfflinePlayableListIndex,
} from './offlinePlayback'
import { parseTempoBpm, tempoRangeLabel } from './tempoRange'
import { noteLinesHaveRealMelody } from './timedImportFinalizer'
import { buildOrderedSearchListIds, compareSearchGroupKeys } from './searchListOrder'
import {
  purgeTuneFromSecondaryStores,
  getTuneSync,
  rememberTuneBody,
  saveTuneToRepository,
} from './tuneRepository'

var useTuneBook = ({importResults, setImportResults, tunes, setTunes, tunesHydrated, deletedTunes, setDeletedTunes, isLoggedIn, ownedMediaUpload, currentTune, setCurrentTune, currentTuneBook, setCurrentTuneBook,tagFilter, setTagFilter, genreFilter, setGenreFilter, artistFilter, setArtistFilter, starredFilter, setStarredFilter, filter, setFilter, groupBy, setGroupBy, filtered, grouped, forceRefresh, textSearchIndex, tunesHash, setTunesHash, updateSheet, indexes, updateTunesHash, buildTunesHash, pauseSheetUpdates, nowPlayingQueue, setNowPlayingQueue, setPlaylist, setSetPlaylist, forceNav, setForceNav, editHistory, flushActiveEditor, practiceSessionActiveRef}) => {
  const utils = useUtils()
  const abcTools = useAbcTools()
  // from old data
  var dbTunes = {}
  var saveOnlineTimeout = null
  const persistedTunesRef = useRef({})
  const saveTuneInProgressRef = useRef(false)

  function syncTuneToCatalogStores(tune) {
    if (!tune || tune.id == null) return
    rememberTuneBody(tune)
    saveTuneToRepository(tune).catch(function() {})
  }
  //indexes.resetBookIndex()
  //var tunesFrom = Object.values(utils.loadLocalObject('abc2book_tunes')).map(function(tune) {
    //tune.id = utils.generateObjectId()
    //indexes.indexTune(tune)
    //dbTunes[tune.id] = tune
  //})
  var navTimeout = null

  function stopSingleViewPlayback(mediaController) {
    if (mediaController && typeof mediaController.stop === 'function') {
      mediaController.stop()
    }
  }

  function playbackApi() {
    return { hasNotesOrChords: hasNotesOrChords, hasLinks: hasLinks }
  }

  function maybeAnnounceFootPedalOpening(opts, tuneOrId) {
    if (!opts || !opts.announceOpening) return
    var tune = typeof tuneOrId === 'string' ? lookupTune(tuneOrId) : tuneOrId
    announceFootPedalOpeningTune(tune)
  }

  function navigateSetPlaylistStep(direction, currentSongId, failCallback, locationPathname, options) {
    if (!setPlaylist || !setPlaylist.tunes || setPlaylist.tunes.length === 0) return false
    var opts = options || {}
    var mediaController = opts.mediaController
    var startPlayback = !!opts.startPlayback
    var currentIndex = typeof setPlaylist.currentIndex === 'number' ? setPlaylist.currentIndex : 0
    if (currentSongId) {
      var foundIndex = setPlaylist.tunes.findIndex(function(t) { return t && t.id === currentSongId })
      if (foundIndex !== -1) currentIndex = foundIndex
    }

    function applyPlaylistIndex(nextIndex) {
      if (nextIndex < 0 || nextIndex >= setPlaylist.tunes.length) {
        if (failCallback) failCallback(direction > 0 ? 'end' : 'start')
        return
      }
      var newPL = Object.assign({}, setPlaylist, { currentIndex: nextIndex })
      setSetPlaylist(newPL)
      var nextTune = newPL.tunes[nextIndex]
      if (nextTune && nextTune.id) {
        maybeAnnounceFootPedalOpening(opts, tunes && tunes[nextTune.id] ? tunes[nextTune.id] : nextTune)
        setCurrentTune(nextTune.id)
        if (mediaController && startPlayback) {
          var fullTune = tunes && tunes[nextTune.id] ? tunes[nextTune.id] : nextTune
          playTuneNow(mediaController, playbackApi(), navigate, fullTune)
          return
        }
        if (mediaController && !startPlayback) {
          navigate('/tunes/' + nextTune.id)
          return
        }
        var playUrl = ''
        if (locationPathname && locationPathname.indexOf('/playMidi') !== -1) {
          playUrl = '/playMidi'
        } else if (locationPathname && locationPathname.indexOf('/playMedia') !== -1) {
          playUrl = '/playMedia'
        }
        navigate('/tunes/' + nextTune.id + playUrl)
      }
    }

    if (isNavigatorOffline()) {
      var playbackMode = playbackModeFromPathname(locationPathname)
      var tunebookApi = playbackApi()
      findNextOfflinePlayableListIndex(
        setPlaylist.tunes,
        currentIndex,
        direction,
        null,
        tunebookApi,
        utils.isYoutubeLink,
        playbackMode
      ).then(function(nextIndex) {
        applyPlaylistIndex(nextIndex)
      })
      return true
    }

    applyPlaylistIndex(currentIndex + direction)
    return true
  }

  function isPracticeSessionActive() {
    return !!(practiceSessionActiveRef && practiceSessionActiveRef.current)
  }

  function navigate(to) {
      setForceNav(to)
  }

  function buildQueueTunesFromContext(book, selected, filterTags, mergedTunes, options) {
    var opts = options || {}
    var filterGenres = opts.genreFilter
    var filterArtists = opts.artistFilter
    var fillTunes = []
    var useBook = book
    var selectedArray = selected && selected.split ? selected.split(",").filter(function(v) { return !!v }) : []
    if (selectedArray.length > 0) {
      fillTunes = mediaFromSelection(utils.uniquifyArray(selectedArray).join(","), mergedTunes).filter(function(tune) {
        if (book && tune.books && tune.books.indexOf(book) !== -1) return true
        if (filterTags && filterTags.length > 0 && tune.tags) {
          for (var i = 0; i < filterTags.length; i++) {
            if (tune.tags.indexOf(filterTags[i]) !== -1) return true
          }
          return false
        }
        if (filterGenres && filterGenres.length > 0) {
          return tuneMatchesGenreFilter(tune, filterGenres)
        }
        if (filterArtists && filterArtists.length > 0) {
          return tuneMatchesArtistFilter(tune, filterArtists)
        }
        if (book || (filterTags && filterTags.length > 0) || (filterGenres && filterGenres.length > 0) || (filterArtists && filterArtists.length > 0)) return false
        return true
      })
      shuffleArray(fillTunes)
      useBook = 'Selection'
    } else {
      fillTunes = mediaFromSearch('', book, filterTags, mergedTunes, filterGenres, filterArtists)
      shuffleArray(fillTunes)
    }
    if (opts.mediaOnly) {
      fillTunes = fillTunes.filter(function(tune) {
        return tune && Array.isArray(tune.links) && tune.links.length > 0
      })
    }
    fillTunes = sortTunesForQueue(fillTunes, hasNotesOrChords, hasLinks)
    var limit = typeof opts.limit === 'number' ? opts.limit : PLAYLIST_MAX_ITEMS
    return { tunes: fillTunes.slice(0, limit), name: useBook || opts.name || 'Playlist' }
  }

  function startNowPlayingQueue(queue, navigateFn, options) {
    if (!isQueueActive(queue)) return null
    setNowPlayingQueue(queue)
    var item = getCurrentItem(queue)
    if (!item) return null
    if (isExternalQueueItem(item)) {
      var opts = options || {}
      if (isLessonExternalMedia(item.externalMedia)) {
        return 'lesson:' + item.externalMedia.youtubeId
      }
      if (opts.startPlayback && opts.mediaController) {
        if (opts.mediaController.abortPlayingIntent) {
          opts.mediaController.abortPlayingIntent()
        }
        playExternalMediaItem(item.externalMedia, opts.mediaController, { play: true, fromUserGesture: true })
      }
      return 'media:' + (item.externalMedia.uri || item.externalMedia.mediaLink || item.externalMedia.collectionLink || item.externalMedia.title || 'track')
    }
    var tuneId = item && item.tuneId ? item.tuneId : null
    if (!tuneId) return null
    setCurrentTune(tuneId)
    var opts = options || {}
    var tune = tunes[tuneId]
    if (opts.startPlayback && opts.mediaController && tune && item) {
      if (opts.mediaController.preparePlaybackFromUserGesture) {
        opts.mediaController.preparePlaybackFromUserGesture()
      }
      const target = resolvePlaybackForItem(tune, item, playbackApi())
      if (target && target.type !== 'external') {
        const normalizedTarget = target.type === 'midi'
          ? { type: 'midi' }
          : { type: 'media', linkNum: target.linkNum != null ? target.linkNum : 0 }
        if (opts.navigate !== false && navigateFn) {
          requestNavigatePlayback(
            opts.mediaController,
            playbackApi(),
            navigateFn,
            tune,
            normalizedTarget
          )
        } else {
          playQueueItem(opts.mediaController, playbackApi(), tune, item, { fromUserGesture: true })
        }
      } else if (opts.navigate !== false && navigateFn) {
        navigateToQueueTune(navigateFn, tuneId, item, { hasNotesOrChords: hasNotesOrChords, hasLinks: hasLinks }, tunes)
      }
    } else if (opts.navigate !== false && navigateFn) {
      if (tune) {
        navigateToQueueTune(navigateFn, tuneId, item, { hasNotesOrChords: hasNotesOrChords, hasLinks: hasLinks }, tunes)
      } else {
        navigateFn('/tunes/' + tuneId + '/playMedia')
      }
    }
    return tuneId
  }

  function queueItemTuneId(item) {
    return item && item.tuneId != null ? String(item.tuneId) : null
  }

  function sameTuneId(a, b) {
    if (a == null || b == null) return false
    return String(a) === String(b)
  }

  function lookupTune(tuneId) {
    if (tuneId == null || !tunes) return null
    return tunes[tuneId] || tunes[String(tuneId)] || null
  }

  function isCurrentTuneInQueue(queue, currentSongId) {
    if (!isQueueActive(queue)) return false
    if (isLessonQueue(queue)) return true
    if (!currentSongId) return false
    return queue.items.some(function(item) {
      return sameTuneId(queueItemTuneId(item), currentSongId)
    })
  }

  function navigateQueueStep(direction, currentSongId, failCallback, navigateFn, locationPathname, options) {
    if (!isQueueActive(nowPlayingQueue) || !setNowPlayingQueue) return false
    var opts = options || {}
    var mediaController = opts.mediaController
    var forceNavigate = !!opts.forceNavigate
    var startPlayback = !!opts.startPlayback
    var syncIndex = nowPlayingQueue.currentIndex
    if (currentSongId) {
      var found = nowPlayingQueue.items.findIndex(function(item) {
        return sameTuneId(queueItemTuneId(item), currentSongId)
      })
      if (found === -1) return false
      syncIndex = found
    }
    var synced = Object.assign({}, nowPlayingQueue, {
      currentIndex: syncIndex,
      previewOnce: forceNavigate ? null : nowPlayingQueue.previewOnce,
    })
    var stepDirection = direction >= 0 ? 1 : -1
    var playbackMode = playbackModeFromPathname(locationPathname)
    var tunebookApi = playbackApi()

    advanceQueueToNextPlayable(synced, tunes, tunebookApi, {
      direction: stepDirection,
      advanceFirst: true,
      isYoutubeLink: utils.isYoutubeLink,
      playbackMode: playbackMode,
      wrapManualNavigation: true,
    }).then(function(result) {
      if (result.atEnd || !result.item) {
        if (startPlayback) stopPlaylistPlayback(mediaController)
        if (failCallback) failCallback(stepDirection > 0 ? 'end' : 'start')
        return
      }

      var nextQueue = result.queue
      var item = result.item
      var tune = result.tune
      var tuneId = queueItemTuneId(item)
      var isExternal = isExternalQueueItem(item)

      setNowPlayingQueue(nextQueue)
      if (isExternal) {
        if (mediaController && startPlayback && mediaController.abortPlayingIntent) {
          mediaController.abortPlayingIntent()
        }
        if (startPlayback) {
          if (isLessonExternalMedia(item.externalMedia)) {
            playLessonYoutube({ fromUserGesture: true })
          } else {
            playExternalMediaItem(item.externalMedia, mediaController, { play: true, fromUserGesture: true })
          }
        }
        return
      }
      if (!tuneId) return

      maybeAnnounceFootPedalOpening(opts, tune)

      if (mediaController && startPlayback && tune) {
        playQueueItem(mediaController, tunebookApi, tune, item, { fromUserGesture: true })
        announcePlaylistTrack(tune)
      }

      var shouldFollow = forceNavigate || nextQueue.followTune
      var allowFollow = forceNavigate
        ? !isPracticeSessionActive()
        : !shouldSuppressFollowNavigate({
          pathname: locationPathname,
          setPlaylist: setPlaylist,
          practiceSessionActive: isPracticeSessionActive(),
        })
      var nav = navigateFn || navigate
      if (shouldFollow && nav && allowFollow) {
        setCurrentTune(tuneId)
        if (startPlayback || !forceNavigate) {
          navigateToQueueTune(nav, tuneId, item, tunebookApi, tunes)
        } else {
          nav('/tunes/' + tuneId)
        }
      }
    })
    return true
  }

  function buildSearchListOrderedIds() {
    // Prefer the list IndexLayout last rendered (includes tuneStatus groups, etc.).
    var fromListState = buildOrderedSearchListIds(filtered, grouped, groupBy)
    if (fromListState && fromListState.length > 0) return fromListState

    var useTunes = fromSearch(filter, currentTuneBook, tagFilter, genreFilter, artistFilter, starredFilter)
    useTunes.sort(function(a, b) {
      return (a.name && b.name && a.name.toLowerCase().trim() < b.name.toLowerCase().trim()) ? -1 : 1
    })
    if (!groupBy || groupBy === 'tuneStatus') {
      // tuneStatus groups are computed in IndexLayout; without list state, fall back to alpha order.
      return useTunes.map(function(t) { return t && t.id ? t.id : null }).filter(Boolean)
    }
    var rebuiltGroups = groupTunes(useTunes, groupBy)
    var orderedIds = []
    Object.keys(rebuiltGroups).sort(function(a, b) {
      return compareSearchGroupKeys(groupBy, a, b)
    }).forEach(function(groupKey) {
      var indexes = rebuiltGroups[groupKey]
      if (!Array.isArray(indexes) || indexes.length === 0) return
      indexes.forEach(function(itemIndex) {
        if (useTunes[itemIndex] && useTunes[itemIndex].id) orderedIds.push(useTunes[itemIndex].id)
      })
    })
    return orderedIds
  }

  function isEditorPath(locationPathname) {
    return (locationPathname && locationPathname.indexOf('/editor/') !== -1)
      || (typeof window !== 'undefined' && window.location.hash.indexOf('/editor/') !== -1)
  }

  function getEditorViewFromPath(locationPathname) {
    var path = locationPathname || ''
    if (!path && typeof window !== 'undefined') {
      path = window.location.hash.replace(/^#/, '')
    }
    var match = path.match(/\/editor\/[^/?#]+\/([^/?#]+)/)
    return match && match[1] ? match[1] : null
  }

  function buildEditorPathForTune(tuneId, locationPathname) {
    var id = encodeURIComponent(String(tuneId))
    var view = getEditorViewFromPath(locationPathname)
    if (view && view !== 'info') {
      return '/editor/' + id + '/' + encodeURIComponent(view)
    }
    return '/editor/' + id
  }

  function navigateToSearchListTune(tuneId, navigateFn, locationPathname, mediaController, startPlayback) {
    if (tuneId == null || tuneId === '') return
    var id = String(tuneId)
    setCurrentTune(id)
    var nav = navigateFn || navigate
    if (isEditorPath(locationPathname)) {
      nav(buildEditorPathForTune(id, locationPathname))
      return
    }
    if (mediaController && startPlayback && lookupTune(id)) {
      playTuneNow(mediaController, playbackApi(), nav, lookupTune(id))
      return
    }
    var playUrl = ''
    if (locationPathname && locationPathname.indexOf('/playMidi') !== -1) {
      playUrl = '/playMidi'
    } else if (locationPathname && locationPathname.indexOf('/playMedia') !== -1) {
      playUrl = '/playMedia'
    } else if (typeof window !== 'undefined') {
      if (window.location.hash.indexOf('/playMidi') !== -1) {
        playUrl = '/playMidi'
      } else if (window.location.hash.indexOf('/playMedia') !== -1) {
        playUrl = '/playMedia'
      }
    }
    nav('/tunes/' + id + playUrl)
  }

  function runAdjacentSongNavigation(direction, currentSongId, failCallback, navigateFn, locationPathname, options) {
    var opts = options || {}
    var mediaController = opts.mediaController
    var useQueueNavigation = shouldUseQueueNavigationForAdjacent(opts, mediaController, nowPlayingQueue)
    // Capture before stop() clears intent/playing state.
    var startPlayback = shouldStartPlaybackWhenAdvancing(
      mediaController,
      isLessonQueue(nowPlayingQueue) && isLessonYoutubePlaying()
    )
    // Header / media-controls skip walks search results. An active playlist
    // keeps playing in the background — do not stop it or restart the queue tune.
  // Playlist next/prev uses useQueueNavigation on the transport bar.
    var preservePlaylistAudio = shouldPreservePlaylistAudioDuringSearchBrowse(
      opts,
      nowPlayingQueue,
      mediaController
    )
    if (preservePlaylistAudio) {
      startPlayback = false
    } else if (mediaController) {
      stopSingleViewPlayback(mediaController)
    }
    // Explicit next/prev always moves the view, even when followTune is off.
    var stepOpts = {
      forceNavigate: true,
      startPlayback: startPlayback,
    }
    if (mediaController) stepOpts.mediaController = mediaController
    if (!isEditorPath(locationPathname)) {
      if (useQueueNavigation && setPlaylist && setPlaylist.tunes && setPlaylist.tunes.length > 0) {
        if (navigateSetPlaylistStep(direction, currentSongId, failCallback, locationPathname, stepOpts)) return
      }
      if (useQueueNavigation && isCurrentTuneInQueue(nowPlayingQueue, currentSongId)) {
        if (navigateQueueStep(direction, currentSongId, failCallback, navigateFn, locationPathname, stepOpts)) return
      }
    }

    var orderedIds = buildSearchListOrderedIds()
    if (!orderedIds || orderedIds.length === 0) {
      if (failCallback) failCallback()
      return
    }
    var idx = currentSongId
      ? orderedIds.findIndex(function(id) { return sameTuneId(id, currentSongId) })
      : -1
    // Fresh search / list with no current tune: land on first (next) or last (prev).
    if (idx === -1) {
      var fallbackIdx = direction > 0 ? 0 : orderedIds.length - 1
      maybeAnnounceFootPedalOpening(opts, orderedIds[fallbackIdx])
      navigateToSearchListTune(
        orderedIds[fallbackIdx],
        navigateFn,
        locationPathname,
        mediaController,
        startPlayback
      )
      return
    }

    if (direction > 0 && isNavigatorOffline()) {
      var orderedTunes = orderedIds.map(function(id) { return lookupTune(id) }).filter(Boolean)
      findNextOfflinePlayableListIndex(
        orderedTunes,
        idx,
        1,
        null,
        playbackApi(),
        utils.isYoutubeLink,
        playbackModeFromPathname(locationPathname)
      ).then(function(nextListIndex) {
        if (nextListIndex === -1) {
          if (failCallback) failCallback('end')
          return
        }
        var nextTune = orderedTunes[nextListIndex]
        maybeAnnounceFootPedalOpening(opts, nextTune)
        navigateToSearchListTune(
          nextTune && nextTune.id ? nextTune.id : null,
          navigateFn,
          locationPathname,
          mediaController,
          startPlayback
        )
      })
      return
    }

    var nextIdx = direction > 0
      ? (idx + 1) % orderedIds.length
      : (idx - 1 + orderedIds.length) % orderedIds.length
    maybeAnnounceFootPedalOpening(opts, orderedIds[nextIdx])
    navigateToSearchListTune(orderedIds[nextIdx], navigateFn, locationPathname, mediaController, startPlayback)
  }

  function navigateToNextSong(currentSongId, failCallback, navigateFn, locationPathname, options) {
      var opts = options || {}
      // Run immediately when continuing playback so the click stays a user gesture.
      if (opts.mediaController) {
        clearTimeout(navTimeout)
        runAdjacentSongNavigation(1, currentSongId, failCallback, navigateFn, locationPathname, opts)
        return
      }
      clearTimeout(navTimeout)
      navTimeout = setTimeout(function() {
        runAdjacentSongNavigation(1, currentSongId, failCallback, navigateFn, locationPathname, opts)
      }, 300)
  }
  
  function navigateToPreviousSong(currentSongId, navigateFn, locationPathname, options) {
     var opts = options || {}
     if (opts.mediaController) {
       clearTimeout(navTimeout)
       runAdjacentSongNavigation(-1, currentSongId, null, navigateFn, locationPathname, opts)
       return
     }
     clearTimeout(navTimeout)
      navTimeout = setTimeout(function() {
        runAdjacentSongNavigation(-1, currentSongId, null, navigateFn, locationPathname, opts)
      }, 300)
  }
  
  function createTune(tune = null, skipTimestampUpdate = false) {
      if (!tune) tune = {} 
      if (!tune.id) {
        tune.id = utils.generateObjectId()
      }
      if (skipTimestampUpdate) {
        // only if missing
        if (!tune.lastUpdated) tune.lastUpdated = new Date().getTime() 
      } else {
        tune.lastUpdated = new Date().getTime() 
      }
      tune.books = Array.isArray(tune.books) ? tune.books : []
      tune.albums = Array.isArray(tune.albums) ? tune.albums : []
      tune.voices = tune.voices ? tune.voices : {}
      tune.capo = (tune.capo === undefined || tune.capo === null || tune.capo === '') ? 0 : parseInt(tune.capo, 10) || 0
      tune.playbackTempo = tune.playbackTempo > 0 ? parseFloat(tune.playbackTempo) : 1
      tune.playbackPitch = tune.playbackPitch !== undefined && tune.playbackPitch !== null && tune.playbackPitch !== ''
        ? parseInt(tune.playbackPitch, 10) || 0 : 0
      tune.playbackFineTune = tune.playbackFineTune !== undefined && tune.playbackFineTune !== null && tune.playbackFineTune !== ''
        ? parseInt(tune.playbackFineTune, 10) || 0 : 0
      tune.lyricsScrollSpeed = tune.lyricsScrollSpeed > 0 ? parseFloat(tune.lyricsScrollSpeed) : 1
      tune.zoom = tune.zoom > 0 ? parseFloat(tune.zoom) : undefined
      tune.playbackAudioFilters = getAudioFilterSettings(tune)
      tune.backgroundInfo = typeof tune.backgroundInfo === 'string' ? tune.backgroundInfo : ''
      if (Array.isArray(tune.links)) {
        tune.links = tune.links.map(syncLegacyLinkLoopFields)
      }
      return tune
  }

  function cloneTuneSnapshot(tune) {
      if (!tune) return null
      return JSON.parse(JSON.stringify(tune))
  }

  function getPersistedTuneSnapshot(tuneId) {
      if (!tuneId || !persistedTunesRef.current[tuneId]) return null
      return cloneTuneSnapshot(persistedTunesRef.current[tuneId])
  }

  function savePersistedTuneSnapshot(tune) {
      if (tune && tune.id) {
          persistedTunesRef.current[tune.id] = cloneTuneSnapshot(tune)
      }
  }

  function deletePersistedTuneSnapshot(tuneId) {
      if (tuneId && persistedTunesRef.current[tuneId]) {
          delete persistedTunesRef.current[tuneId]
      }
  }

  const refreshPersistedTuneSnapshots = useCallback(function(nextTunes) {
      var nextSnapshots = {}
      Object.values(nextTunes || {}).forEach(function(nextTune) {
          if (nextTune && nextTune.id) {
              nextSnapshots[nextTune.id] = cloneTuneSnapshot(nextTune)
          }
      })
      persistedTunesRef.current = nextSnapshots
  }, [])

  function recordHistoryChange(change) {
      if (editHistory && typeof editHistory.recordChange === 'function') {
          editHistory.recordChange(change)
      }
  }

  function setTombstoneStateForTune(tuneId, tombstone) {
      if (!setDeletedTunes || !tuneId) return
      var nextDeleted = Object.assign({}, deletedTunes || {})
      if (tombstone) {
          nextDeleted[tuneId] = JSON.parse(JSON.stringify(tombstone))
      } else {
          delete nextDeleted[tuneId]
      }
      setDeletedTunes(nextDeleted)
  }

  function applyTuneSnapshot(tuneId, snapshot, options = {}) {
      if (!tuneId || !tunes) return null
      pauseSheetUpdates.current = true
      if (snapshot) {
          var restoredTune = createTune(cloneTuneSnapshot(snapshot), true)
          tunes[tuneId] = restoredTune
          indexes.indexTune(restoredTune)
          updateTunesHash(restoredTune)
          savePersistedTuneSnapshot(restoredTune)
          syncTuneToCatalogStores(restoredTune)
          if (options.hasOwnProperty('tombstone')) {
              setTombstoneStateForTune(tuneId, options.tombstone)
          }
          setTunes(Object.assign({}, tunes))
          saveTunesOnline()
          return restoredTune
      }
      if (tunes[tuneId]) {
          indexes.removeTune(tunes[tuneId], indexes.bookIndex)
      }
      delete tunes[tuneId]
      deletePersistedTuneSnapshot(tuneId)
      if (options.hasOwnProperty('tombstone')) {
          setTombstoneStateForTune(tuneId, options.tombstone)
      }
      setTunes(Object.assign({}, tunes))
      saveTunesOnline()
      return null
  }

  function applyHistoryEntry(entry, direction = 'undo') {
      if (!entry) return false
      var snapshot = direction === 'redo' ? entry.after : entry.before
      var meta = entry.meta || {}
      var tombstone = direction === 'redo' ? meta.tombstoneAfter : meta.tombstoneBefore
      var tuneId = entry.after && entry.after.id ? entry.after.id : (entry.before && entry.before.id ? entry.before.id : null)
      applyTuneSnapshot(tuneId, snapshot, {skipHistory: true, tombstone: tombstone})
      return true
  }

  function undoTuneEdits(tuneId) {
      if (!editHistory || typeof editHistory.undoTune !== 'function') return false
      return editHistory.undoTune(tuneId, applyHistoryEntry)
  }

  function redoTuneEdits(tuneId) {
      if (!editHistory || typeof editHistory.redoTune !== 'function') return false
      return editHistory.redoTune(tuneId, applyHistoryEntry)
  }

  useEffect(function() {
      refreshPersistedTuneSnapshots(tunes)
  }, [tunes, refreshPersistedTuneSnapshots])

  useEffect(function() {
      if (!editHistory || typeof editHistory.pruneHistory !== 'function') return
      if (!editHistory.isLoaded || !tunesHydrated) return
      editHistory.pruneHistory(Object.keys(tunes || {}))
  // eslint-disable-next-line react-hooks/exhaustive-deps -- prune when tunes change; editHistory is a new object each render
  }, [tunes, tunesHydrated, editHistory && editHistory.isLoaded])
  
  function saveTune(tune, skipTimestampUpdate = false, options = {}) {
      
    if (!tune || !tunes) return tune
    if (saveTuneInProgressRef.current) return tune
    saveTuneInProgressRef.current = true
    try {
      pauseSheetUpdates.current = true
      var before = getPersistedTuneSnapshot(tune.id)
      var tombstoneBefore = deletedTunes && tune.id ? JSON.parse(JSON.stringify(deletedTunes[tune.id] || null)) : null
      tune = createTune(tune, skipTimestampUpdate) 
      //var cleanTune = JSON.parse(JSON.stringify(tune))
      //cleanTune.lastHash = null
      //tune.lastHash = utils.hash(JSON.stringify(cleanTune))
      // clear invalid links
      tune.links = Array.isArray(tune.links) ? tune.links.filter(function(link) {
          return (link && (link.title || link.link || link.startAt || link.endAt))
      }) : [] 
      tunes[tune.id] = tune
      indexes.indexTune(tune)
      updateTunesHash(tune)
      savePersistedTuneSnapshot(tune)
      syncTuneToCatalogStores(tune)
      if (!options.skipHistory) {
        recordHistoryChange({
          tuneId: tune.id,
          before: before,
          after: tune,
          label: options.historyLabel || 'Edit',
          immediate: !!options.immediate,
          meta: {
            tombstoneBefore: tombstoneBefore,
            tombstoneAfter: tombstoneBefore,
          },
        })
      }
      setTunes(Object.assign({}, tunes))
      saveTunesOnline()
      if (tune.id && Array.isArray(tune.links) && tune.links.length > 0) {
        const cacheJobs = enqueueAutoCacheForTuneLinks(tune, {
          isYoutubeLink: utils.isYoutubeLink,
          youtubeGetId: utils.YouTubeGetID,
          accessToken: getActiveResolverAccessToken(),
        })
        if (cacheJobs.length > 0) {
          startMediaLinkAutoCacheQueue()
        }
      }
      if (isLoggedIn && ownedMediaUpload && ownedMediaUpload.driveApi && tuneHasPendingOwnedMediaUpload(tune)) {
        uploadOwnedMediaLinksForTune(tune, {
          token: ownedMediaUpload.token,
          driveApi: ownedMediaUpload.driveApi,
          googleDocumentId: ownedMediaUpload.googleDocumentId,
          onlyPendingUploads: true,
        }).then(function(result) {
          if (!result || !result.tune || result.uploaded === 0) return
          saveTune(result.tune, true, { skipHistory: true })
        }).catch(function() {})
      }
    } finally {
      saveTuneInProgressRef.current = false
    }
    return tune
  }
  
  // Record tombstones for one or more deleted tunes in a single state update.
  // entries: array of { id, name }. Batching is required because setDeletedTunes
  // is async, so calling it once per tune inside a loop would only persist the
  // last tombstone (every call rebuilds from the same stale deletedTunes closure).
  function commitTombstones(entries) {
    // deletes made while logged out are a local-only reset; the remote copy
    // re-populates them on next login, so we do not record a tombstone.
    if (!setDeletedTunes || !isLoggedIn || !Array.isArray(entries) || entries.length === 0) return
    var next = Object.assign({}, deletedTunes || {})
    entries.forEach(function(entry) {
      if (entry && entry.id) next[entry.id] = createTombstone(entry.id, entry.name)
    })
    setDeletedTunes(next)
    return next
  }

  function recordTombstone(tuneId, name) {
    if (!tuneId) return
    return commitTombstones([{id: tuneId, name: name}])
  }

  function purgeDeletedTuneStorage(tuneId) {
    if (!tuneId) return
    purgeTuneFromSecondaryStores(tuneId).catch(function() {})
  }

  function deleteTune(tuneId) {
    pauseSheetUpdates.current = true
    var tune = tunes[tuneId]
    var before = getPersistedTuneSnapshot(tuneId)
    var tombstoneBefore = deletedTunes && tuneId ? JSON.parse(JSON.stringify(deletedTunes[tuneId] || null)) : null
    var tombstoneAfter = tune ? createTombstone(tuneId, tune.name) : null
    if (tune) {
      if (indexes.unindexTune) indexes.unindexTune(tune)
      else indexes.removeTune(tune, indexes.bookIndex)
      recordTombstone(tuneId, tune.name)
    } else if (tuneId && indexes.unindexTune) {
      indexes.unindexTune({ id: tuneId })
    }
    purgeDeletedTuneStorage(tuneId)

    delete tunes[tuneId]
    deletePersistedTuneSnapshot(tuneId)
    recordHistoryChange({
      tuneId: tuneId,
      before: before,
      after: null,
      label: 'Delete tune',
      immediate: true,
      meta: {
        tombstoneBefore: tombstoneBefore,
        tombstoneAfter: tombstoneAfter,
      },
    })
    setTunes(tunes)
    saveTunesOnline()
    if (typeof forceRefresh === 'function') forceRefresh()
  }
  
    
  function deleteTunes(tuneIds) {
    if (Array.isArray(tuneIds)) {
      pauseSheetUpdates.current = true
      var tombstones = []
      var historyChanges = []
      tuneIds.forEach(function(tuneId) {
        var existing = tunes[tuneId]
        if (existing) {
          if (indexes.unindexTune) indexes.unindexTune(existing)
          else indexes.removeTune(existing, indexes.bookIndex)
          tombstones.push({id: tuneId, name: existing.name})
          historyChanges.push({
            tuneId: tuneId,
            before: getPersistedTuneSnapshot(tuneId),
            after: null,
            label: 'Delete tune',
            immediate: true,
            meta: {
              tombstoneBefore: deletedTunes && tuneId ? JSON.parse(JSON.stringify(deletedTunes[tuneId] || null)) : null,
              tombstoneAfter: createTombstone(tuneId, existing.name),
            },
          })
        } else if (tuneId && indexes.unindexTune) {
          indexes.unindexTune({ id: tuneId })
        }
        purgeDeletedTuneStorage(tuneId)
        delete tunes[tuneId]
        deletePersistedTuneSnapshot(tuneId)
      })
      commitTombstones(tombstones)
      historyChanges.forEach(function(change) {
        recordHistoryChange(change)
      })
      setTunes(tunes)
      saveTunesOnline()
      if (typeof forceRefresh === 'function') forceRefresh()
    }
  }
  
  // 5 seconds debounce on online save
  // allow 10 seconds after save before polling for more updates
  function saveTunesOnline() {
       return updateSheet(5000).then(function() {
          setTimeout(function() {
            pauseSheetUpdates.current = false
          },10000)
        }) 
}
  
  
  function addTunesToBook(tuneIds,book) {
    if (Array.isArray(tuneIds) && book && book.trim()) {
       pauseSheetUpdates.current = true
       tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var books = Array.isArray(tunes[id].books) ? tunes[id].books : []
          if (books.indexOf(book) === -1) {
            books.push(book.trim())
            tunes[id].books = books
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  function removeTunesFromBook(tuneIds,book) {
    if (Array.isArray(tuneIds) && book && book.trim()) {
      pauseSheetUpdates.current = true
      tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var books = Array.isArray(tunes[id].books) ? tunes[id].books : []
          if (books.indexOf(book) !== -1) {
            books.splice(books.indexOf(book),1)
            tunes[id].books = books
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  
  function addTunesToTag(tuneIds,tag) {
    if (Array.isArray(tuneIds) && tag && tag.trim()) {
       pauseSheetUpdates.current = true
       tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var tags = Array.isArray(tunes[id].tags) ? tunes[id].tags : []
          if (tags.indexOf(tag) === -1) {
            tags.push(tag.trim())
            tunes[id].tags = tags
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  function removeTunesFromTag(tuneIds,tag) {
    if (Array.isArray(tuneIds) && tag && tag.trim()) {
      pauseSheetUpdates.current = true
      tuneIds.forEach(function(id) {
        if (tunes[id]) {
          var tags = Array.isArray(tunes[id].tags) ? tunes[id].tags : []
          if (tags.indexOf(tag) !== -1) {
            tags.splice(tags.indexOf(tag),1)
            tunes[id].tags = tags
          }
        }
      })
      setTunes(tunes)
      saveTunesOnline()
    }
  }
  
  //props.tunebook.bulkChangeTunes(Object.keys(props.selected), key, value)
  // Second argument may be a single field key or an array of { key, value } changes.
  function bulkChangeTunes(tuneIds, keyOrChanges, value) {
    var changes = []
    if (Array.isArray(keyOrChanges)) {
      changes = keyOrChanges.filter(function(change) {
        return change && change.key
      })
    } else if (keyOrChanges) {
      changes = [{ key: keyOrChanges, value: value }]
    }

    if (Array.isArray(tuneIds)) {
      pauseSheetUpdates.current = true
      var historyChanges = []
      tuneIds.forEach(function(id) {
        if (!changes.length) return
        var tune = tunes[id] || getTuneSync(id)
        if (!tune) return
        if (!tunes[id]) tunes[id] = tune
        var before = getPersistedTuneSnapshot(id)
        changes.forEach(function(change) {
          var key = change.key
          var nextValue = change.value
          if (change.replace) {
              tunes[id][key] = Array.isArray(nextValue) ? nextValue.slice() : nextValue
          } else if (Array.isArray(tunes[id][key]) && Array.isArray(nextValue)) {
              nextValue.forEach(function(v) {
                  tunes[id][key].push(v)
              })
          } else {
              tunes[id][key] = nextValue
          }
        })
        tunes[id] = createTune(tunes[id])
        indexes.indexTune(tunes[id])
        updateTunesHash(tunes[id])
        savePersistedTuneSnapshot(tunes[id])
        syncTuneToCatalogStores(tunes[id])
        historyChanges.push({
              tuneId: id,
              before: before,
              after: cloneTuneSnapshot(tunes[id]),
              label: changes.length > 1 ? ('Bulk change (' + changes.length + ' fields)') : 'Bulk change',
              immediate: true,
              meta: {
                tombstoneBefore: deletedTunes && id ? JSON.parse(JSON.stringify(deletedTunes[id] || null)) : null,
                tombstoneAfter: deletedTunes && id ? JSON.parse(JSON.stringify(deletedTunes[id] || null)) : null,
              },
            })
      })
      historyChanges.forEach(function(change) {
        recordHistoryChange(change)
      })
      setTunes(Object.assign({}, tunes))
      
    }
    return saveTunesOnline()
  }
  
  /**
   * The two functions, applyMergeData and applyImportData, have similar purposes, which is to update the data stored in a database or some sort of data storage. They both take an object data as an argument and perform updates to it based on certain conditions.

The main difference between the two functions is the additional condition in applyImportData for handling the forceBook property of the data object, which is not present in applyMergeData. This forceBook property seems to be related to adding a book to a tune in the data. If forceBook is present, the functions will update the tune's books to include this new book. In applyImportData, this is done for both the updates and inserts keys, as well as for localUpdates and skippedUpdates, while in applyMergeData it is not done at all.
* */
  function applyDeletedTunes(tunes, deleteMap, remoteDeleted) {
    var nextTunes = tunes
    var nextDeleted = Object.assign({}, deletedTunes || {})
    Object.keys(deleteMap || {}).forEach(function(tuneId) {
      if (nextTunes[tuneId]) {
        indexes.removeTune(nextTunes[tuneId], indexes.bookIndex)
        delete nextTunes[tuneId]
      }
      if (remoteDeleted && remoteDeleted[tuneId]) {
        nextDeleted[tuneId] = remoteDeleted[tuneId]
      } else {
        nextDeleted[tuneId] = createTombstone(tuneId, deleteMap[tuneId] && deleteMap[tuneId].name)
      }
    })
    if (setDeletedTunes) setDeletedTunes(nextDeleted)
    return nextTunes
  }

  function tuneIdsFromBucket(bucket) {
    if (Array.isArray(bucket)) {
      return bucket.map(function(tune) { return tune && tune.id ? tune.id : null }).filter(Boolean)
    }
    return Object.keys(bucket || {})
  }

  function reindexImportBuckets(data, beforeSnapshots) {
    if (!indexes) return
    var changedIds = tuneIdsFromBucket(data.updates)
      .concat(tuneIdsFromBucket(data.inserts))
      .concat(tuneIdsFromBucket(data.localUpdates))
      .concat(tuneIdsFromBucket(data.skippedUpdates))
      .concat(tuneIdsFromBucket(data.duplicates))
    Object.keys(data.deletes || {}).forEach(function(id) {
      var snapshot = beforeSnapshots && beforeSnapshots[id]
      if (snapshot && indexes.unindexTune) {
        indexes.unindexTune(snapshot)
      } else if (tunes[id] && indexes.unindexTune) {
        indexes.unindexTune(tunes[id])
      }
    })
    if (indexes.indexChangedTunes) {
      indexes.indexChangedTunes(tunes, changedIds)
    } else if (indexes.indexTunes) {
      indexes.indexTunes(tunes)
    }
  }

  function clearTombstonesForTunes(tuneIds) {
    if (!setDeletedTunes || !tuneIds || tuneIds.length === 0) return
    var nextDeleted = Object.assign({}, deletedTunes || {})
    var changed = false
    tuneIds.forEach(function(tuneId) {
      if (nextDeleted[tuneId]) {
        delete nextDeleted[tuneId]
        changed = true
      }
    })
    if (changed) setDeletedTunes(nextDeleted)
  }

  function flushEditorBeforeMerge(tuneIds) {
      if (!currentTune || !Array.isArray(tuneIds) || tuneIds.indexOf(currentTune) === -1) return
      if (typeof flushActiveEditor === 'function') {
          flushActiveEditor(currentTune)
      } else if (editHistory && typeof editHistory.flushPendingTune === 'function') {
          editHistory.flushPendingTune(currentTune)
      }
  }

  function applyMergeData(data, forceDuplicates=false, discardLocalUpdates = false) {
    return new Promise(function(resolve,reject) {
        var {inserts, updates, duplicates, localUpdates, deletes, remoteDeleted} = data
        var affectedTuneIds = tuneIdsFromBucket(updates)
          .concat(tuneIdsFromBucket(inserts))
          .concat(tuneIdsFromBucket(deletes))
        if (discardLocalUpdates) {
          affectedTuneIds = affectedTuneIds.concat(tuneIdsFromBucket(localUpdates))
        }
        flushEditorBeforeMerge(affectedTuneIds)

        var beforeSnapshots = {}
        Object.keys(updates || {}).forEach(function(id) {
          beforeSnapshots[id] = getPersistedTuneSnapshot(id)
        })
        Object.keys(inserts || {}).forEach(function(id) {
          beforeSnapshots[id] = getPersistedTuneSnapshot(id)
        })
        Object.keys(deletes || {}).forEach(function(id) {
          beforeSnapshots[id] = getPersistedTuneSnapshot(id)
        })
        if (discardLocalUpdates) {
          Object.keys(localUpdates || {}).forEach(function(id) {
            beforeSnapshots[id] = getPersistedTuneSnapshot(id)
          })
        }

        utils.loadLocalforageObject('bookstorage_tunes').then(function(tunes) {
            var deleteSnapshots = {}
            Object.keys(deletes || {}).forEach(function(id) {
              if (tunes[id]) deleteSnapshots[id] = tunes[id]
            })
            if (deletes && Object.keys(deletes).length > 0) {
              tunes = applyDeletedTunes(tunes, deletes, remoteDeleted)
            }
            Object.keys(updates).map(function(u)  {
              if (updates[u] && updates[u].id) {
                // preserve boost
                //if (tunes[updates[u].id]) updates[u].boost = tunes[updates[u].id].boost
                tunes[updates[u].id] = updates[u]
              }
            })
            
            
            Object.values(inserts).forEach(function(tune) {
              // keep timestamps on import
              //var lastUpdated = tunes[tune.id] ? tunes[tune.id].lastUpdated : null
              //if (lastUpdated) tune.lastUpdated = lastUpdated
              var newTune = createTune(tune,true)
              tunes[tune.id] = newTune
            })
            // any more recent changes locally get saved online
            if (discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) {
              Object.values(localUpdates).forEach(function(tune) {
                //tune.id = null
                //var newTune = saveTune(tune)
                tunes[tune.id] =tune
              })
              //updateSheet(0)
            } 
            // any more recent changes locally get saved online
            var bookMergesChanged = false
            var bookMerge = null
            if (forceDuplicates && duplicates && Object.keys(duplicates).length > 0) {
              Object.values(duplicates).forEach(function(tune) {
                tune.id = null
                var newTune = createTune(tune)
                tunes[tune.id] = newTune
              })
              //updateSheet(0)
            } else if (duplicates && Object.keys(duplicates).length > 0) {
              bookMerge = applyDuplicateBookMerges({
                tunes: tunes,
                duplicates: duplicates,
                importhashes: (tunesHash && tunesHash.importhashes) || {},
                getTuneImportHash: abcTools.getTuneImportHash,
                uniquifyArray: utils.uniquifyArray,
              })
              bookMergesChanged = bookMerge.mergedTuneIds.length > 0
            }
            clearTombstonesForTunes(
              tuneIdsFromBucket(updates).concat(tuneIdsFromBucket(inserts))
            )
            if ((discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) || (forceDuplicates &&  duplicates && Object.keys(duplicates).length > 0)|| bookMergesChanged || (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0) || (deletes && Object.keys(deletes).length > 0)) {
              Object.keys(updates || {}).forEach(function(id) {
                recordHistoryChange({
                  tuneId: id,
                  before: beforeSnapshots[id] || null,
                  after: tunes[id] || null,
                  label: 'Sync from Drive',
                  immediate: true,
                  meta: {
                    tombstoneBefore: null,
                    tombstoneAfter: null,
                  },
                })
              })
              Object.keys(inserts || {}).forEach(function(id) {
                recordHistoryChange({
                  tuneId: id,
                  before: beforeSnapshots[id] || null,
                  after: tunes[id] || null,
                  label: 'Sync from Drive',
                  immediate: true,
                  meta: {
                    tombstoneBefore: null,
                    tombstoneAfter: null,
                  },
                })
              })
              if (bookMergesChanged && bookMerge && bookMerge.mergedTuneIds) {
                bookMerge.mergedTuneIds.forEach(function(id) {
                  beforeSnapshots[id] = beforeSnapshots[id] || getPersistedTuneSnapshot(id)
                  recordHistoryChange({
                    tuneId: id,
                    before: beforeSnapshots[id] || null,
                    after: tunes[id] || null,
                    label: 'Sync from Drive',
                    immediate: true,
                    meta: {
                      tombstoneBefore: null,
                      tombstoneAfter: null,
                    },
                  })
                })
              }
              if (discardLocalUpdates) {
                Object.keys(localUpdates || {}).forEach(function(id) {
                  recordHistoryChange({
                    tuneId: id,
                    before: beforeSnapshots[id] || null,
                    after: tunes[id] || null,
                    label: 'Sync from Drive',
                    immediate: true,
                    meta: {
                      tombstoneBefore: null,
                      tombstoneAfter: null,
                    },
                  })
                })
              }
              Object.keys(deletes || {}).forEach(function(id) {
                recordHistoryChange({
                  tuneId: id,
                  before: beforeSnapshots[id] || null,
                  after: null,
                  label: 'Sync from Drive',
                  immediate: true,
                  meta: {
                    tombstoneBefore: deletedTunes && id ? JSON.parse(JSON.stringify(deletedTunes[id] || null)) : null,
                    tombstoneAfter: remoteDeleted && remoteDeleted[id] ? remoteDeleted[id] : createTombstone(id, deletes[id] && deletes[id].name),
                  },
                })
              })
              refreshPersistedTuneSnapshots(tunes)
              Object.keys(updates || {}).concat(Object.keys(inserts || {}))
                .concat(Object.keys(localUpdates || {}))
                .forEach(function(id) {
                  if (tunes[id]) syncTuneToCatalogStores(tunes[id])
                })
              Object.keys(deletes || {}).forEach(function(id) {
                purgeDeletedTuneStorage(id)
              })
              setTunes(tunes)
              buildTunesHash()
              reindexImportBuckets({ updates: updates, inserts: inserts, localUpdates: localUpdates, duplicates: duplicates, deletes: deletes }, deleteSnapshots)
              setImportResults(null)
              saveTunesOnline()
              resolve(tunes)
              //updateSheet(5000)
            } else {
                resolve(tunes)
            }
        })
    })
  }
  
  function applyImportData(data, forceDuplicates=false, discardLocalUpdates = false) {
    return new Promise(function(resolve,reject) {
            var beforeSnapshots = {}
            var {inserts, updates, duplicates, localUpdates, skippedUpdates, forceBook, deletes, remoteDeleted} = data
            Object.keys(updates || {}).forEach(function(id) {
              beforeSnapshots[id] = getPersistedTuneSnapshot(id)
            })
            Object.keys(inserts || {}).forEach(function(id) {
              beforeSnapshots[id] = getPersistedTuneSnapshot(id)
            })
            Object.keys(localUpdates || {}).forEach(function(id) {
              beforeSnapshots[id] = getPersistedTuneSnapshot(id)
            })
            Object.keys(skippedUpdates || {}).forEach(function(id) {
              beforeSnapshots[id] = getPersistedTuneSnapshot(id)
            })
            Object.keys(deletes || {}).forEach(function(id) {
              beforeSnapshots[id] = getPersistedTuneSnapshot(id)
            })
            if (deletes && Object.keys(deletes).length > 0) {
              tunes = applyDeletedTunes(tunes, deletes, remoteDeleted)
            }
            Object.keys(updates).map(function(u)  {
              if (updates[u] && updates[u].id) {
                // preserve boost
                //if (tunes[updates[u].id]) updates[u].boost = tunes[updates[u].id].boost
                tunes[updates[u].id] = updates[u]
                if (forceBook) {
                    var books = Array.isArray(tunes[updates[u].id].books) ? tunes[updates[u].id].books : []
                    books.push(forceBook)
                    tunes[updates[u].id].books = utils.uniquifyArray(books)
                    
                }
              }
            })
            
            
            Object.values(inserts).forEach(function(tune) {
              // keep timestamps on import
              //var lastUpdated = tunes[tune.id] ? tunes[tune.id].lastUpdated : null
              //if (lastUpdated) tune.lastUpdated = lastUpdated
              var newTune = createTune(tune,true)
              if (forceBook) {
                    var books = Array.isArray(newTune.books) ? newTune.books : []
                    books.push(forceBook)
                    newTune.books = utils.uniquifyArray(books)
              }
              tunes[tune.id] = newTune
             
                    
            })
            // any more recent changes locally get saved online
            if (localUpdates && Object.keys(localUpdates).length > 0) {
                if (discardLocalUpdates) {
                  Object.values(localUpdates).forEach(function(tune) {
                    //tune.id = null
                    //var newTune = saveTune(tune)
                    if (forceBook) {
                        var books = Array.isArray(tune.books) ? tune.books : []
                        books.push(forceBook)
                        tune.books = utils.uniquifyArray(books)
                    }
                    tunes[tune.id] = tune
                  })
                  //updateSheet(0)
                }  else {
                    if (forceBook) {
                        Object.values(localUpdates).forEach(function(tune) {
                            var books = Array.isArray(tunes[tune.id].books) ? tunes[tune.id].books : []
                            books.push(forceBook)
                            tunes[tune.id].books = utils.uniquifyArray(books)
                        })
                    }
                }
            }
            if (forceBook && skippedUpdates && Object.keys(skippedUpdates).length > 0) {
                Object.values(skippedUpdates).forEach(function(tune) {
                    if (forceBook) {
                        var books = Array.isArray(tunes[tune.id].books) ? tunes[tune.id].books : []
                        books.push(forceBook)
                        tunes[tune.id].books = utils.uniquifyArray(books)
                    }
                })
            }
            // any more recent changes locally get saved online
            if (forceDuplicates && duplicates && Object.keys(duplicates).length > 0) {
              Object.values(duplicates).forEach(function(tune) {
                tune.id = null
                var newTune = createTune(tune)
                if (forceBook) {
                    var books = Array.isArray(newTune.books) ? newTune.books : []
                    books.push(forceBook)
                    newTune.books = utils.uniquifyArray(books)
                }
                tunes[tune.id] = newTune
              })
              //updateSheet(0)
            } else if (duplicates && Object.keys(duplicates).length > 0) {
              // Content-hash duplicate: keep one tune; merge missing books onto it.
              var bookMerge = applyDuplicateBookMerges({
                tunes: tunes,
                duplicates: duplicates,
                importhashes: (tunesHash && tunesHash.importhashes) || {},
                getTuneImportHash: abcTools.getTuneImportHash,
                forceBook: forceBook,
                uniquifyArray: utils.uniquifyArray,
              })
              bookMerge.mergedTuneIds.forEach(function(id) {
                beforeSnapshots[id] = beforeSnapshots[id] || getPersistedTuneSnapshot(id)
                if (tunes[id]) savePersistedTuneSnapshot(tunes[id])
              })
              data._bookMerge = bookMerge
            }
            clearTombstonesForTunes(
              tuneIdsFromBucket(updates).concat(tuneIdsFromBucket(inserts))
            )
            Object.keys(updates || {}).forEach(function(id) {
              if (tunes[id]) savePersistedTuneSnapshot(tunes[id])
            })
            Object.keys(inserts || {}).forEach(function(id) {
              if (tunes[id]) savePersistedTuneSnapshot(tunes[id])
            })
            Object.keys(localUpdates || {}).forEach(function(id) {
              if (tunes[id]) savePersistedTuneSnapshot(tunes[id])
            })
            Object.keys(skippedUpdates || {}).forEach(function(id) {
              if (tunes[id]) savePersistedTuneSnapshot(tunes[id])
            })
            Object.keys(deletes || {}).forEach(function(id) {
              deletePersistedTuneSnapshot(id)
            })
             
                      
            var bookMergeResult = data && data._bookMerge
            var bookMergesChanged = !!(bookMergeResult && bookMergeResult.mergedTuneIds && bookMergeResult.mergedTuneIds.length > 0)
            if (forceBook || bookMergesChanged || (discardLocalUpdates && localUpdates && Object.keys(localUpdates).length > 0) || (forceDuplicates &&  duplicates && Object.keys(duplicates).length > 0)|| (updates && Object.keys(updates).length > 0)|| (inserts && Object.keys(inserts).length > 0) || (deletes && Object.keys(deletes).length > 0)) {
              Object.keys(updates || {}).forEach(function(id) {
                recordHistoryChange({
                  tuneId: id,
                  before: beforeSnapshots[id] || null,
                  after: tunes[id] || null,
                  label: 'Import',
                  immediate: true,
                  meta: {
                    tombstoneBefore: null,
                    tombstoneAfter: null,
                  },
                })
              })
              Object.keys(inserts || {}).forEach(function(id) {
                recordHistoryChange({
                  tuneId: id,
                  before: beforeSnapshots[id] || null,
                  after: tunes[id] || null,
                  label: 'Import',
                  immediate: true,
                  meta: {
                    tombstoneBefore: null,
                    tombstoneAfter: null,
                  },
                })
              })
              if (bookMergesChanged) {
                bookMergeResult.mergedTuneIds.forEach(function(id) {
                  recordHistoryChange({
                    tuneId: id,
                    before: beforeSnapshots[id] || null,
                    after: tunes[id] || null,
                    label: 'Import merge books',
                    immediate: true,
                    meta: {
                      tombstoneBefore: null,
                      tombstoneAfter: null,
                    },
                  })
                })
              }
              if (discardLocalUpdates || forceBook) {
                Object.keys(localUpdates || {}).forEach(function(id) {
                  recordHistoryChange({
                    tuneId: id,
                    before: beforeSnapshots[id] || null,
                    after: tunes[id] || null,
                    label: 'Import',
                    immediate: true,
                    meta: {
                      tombstoneBefore: null,
                      tombstoneAfter: null,
                    },
                  })
                })
              }
              if (forceBook) {
                Object.keys(skippedUpdates || {}).forEach(function(id) {
                  recordHistoryChange({
                    tuneId: id,
                    before: beforeSnapshots[id] || null,
                    after: tunes[id] || null,
                    label: 'Import',
                    immediate: true,
                    meta: {
                      tombstoneBefore: null,
                      tombstoneAfter: null,
                    },
                  })
                })
              }
              Object.keys(deletes || {}).forEach(function(id) {
                recordHistoryChange({
                  tuneId: id,
                  before: beforeSnapshots[id] || null,
                  after: null,
                  label: 'Import',
                  immediate: true,
                  meta: {
                    tombstoneBefore: deletedTunes && id ? JSON.parse(JSON.stringify(deletedTunes[id] || null)) : null,
                    tombstoneAfter: remoteDeleted && remoteDeleted[id] ? remoteDeleted[id] : createTombstone(id, deletes[id] && deletes[id].name),
                  },
                })
              })
              refreshPersistedTuneSnapshots(tunes)
              Object.keys(updates || {}).concat(Object.keys(inserts || {}))
                .concat(Object.keys(localUpdates || {}))
                .concat(Object.keys(skippedUpdates || {}))
                .forEach(function(id) {
                  if (tunes[id]) syncTuneToCatalogStores(tunes[id])
                })
              Object.keys(deletes || {}).forEach(function(id) {
                purgeDeletedTuneStorage(id)
              })
              setTunes(tunes)
              buildTunesHash()
              reindexImportBuckets({ updates: updates, inserts: inserts, localUpdates: localUpdates, skippedUpdates: skippedUpdates, duplicates: duplicates, deletes: deletes }, beforeSnapshots)
              setImportResults(null)
              saveTunesOnline()
              resolve(tunes)
              //updateSheet(5000)
            } else {
                resolve(tunes)
            }
        })
  }
  
  function applyImport(forceDuplicates=false, discardLocalUpdates = false) {
      return applyImportData(importResults, forceDuplicates, discardLocalUpdates)
  }
  

  //useEffect(function() {
      //var filtered = Object.values(props.tunes).filter(filterSearch)
      //setFiltered(filtered)
      //var tuneStatus = {}
      ////setTimeout(function() {
          //filtered.forEach(function(tune) {
            //var hasNotes = false
            //var hasChords = false
            //if (tune.voices) {
                //Object.values(tune.voices).forEach(function(voice) {
                    //if (Array.isArray(voice.notes)) {
                        //for (var i=0 ; i < voice.notes.length; i++) {
                            //if (voice.notes[i]) {
                                //hasNotes = true
                                //if (voice.notes[i].indexOf('"' !== -1)) {
                                    //hasChords = true
                                //}
                                //if (hasNotes &&  hasChords) {
                                    //break;
                                //} 
                            //}
                        //}
                    //}
                //})
            //}
            //tuneStatus[tune.id] = {
              //hasLyrics:hasLyrics(tune),
              //hasNotes: hasNotes,
              //hasChords: hasChords
            //}
          //})
          //setTuneStatus(tuneStatus)
      ////},100)
    //},[filter,props.currentTuneBook])
    function hasLinks(tune) {
        var first = tune && Array.isArray(tune.links) && tune.links.length > 0 ? tune.links[0] : null
        if (!first) return false
        return (
            linkUriString(first).trim().length > 0
            || (first.title && String(first.title).trim().length > 0)
            || (first.startAt && String(first.startAt).trim().length > 0)
            || (first.endAt && String(first.endAt).trim().length > 0)
        )
        
        //return true
        //(
            //Array.isArray(tune.links) && 
            //tune.links.length > 0 && 
            //((tune.links[0].link && tune.links[0].trim()) || (tune.links[0].title && tune.links[0].title.trim()) || (tune.links[0].startAt && tune.links[0].startAt.trim()) || (tune.links[0].endAt && tune.links[0].endAt.trim())))
    }
    
    function hasLyrics(tune) {
        if (!tune) return false
        return getLyricLines(tune).some(function(line) {
            return line && line.trim().length > 0
        })
    }
    
    
     
    function hasNotes(tune) {
        if (!tune || !tune.voices) return false
        return Object.values(tune.voices).some(function(voice) {
            return noteLinesHaveRealMelody(voice && voice.notes)
        })
    }
  
  
  function showImportWarning(importResults) {
      //return false
    //if (sheetUpdateResults) return true
    //return false 
    if (importResults !== null) {
        if (localStorage.getItem('bookstorage_mergewarnings') === "true")  {
          if (importResults.deletes && Object.keys(importResults.deletes).length > 0) {
            return true
          }
          if (importResults.updates && Object.keys(importResults.updates).length > 0) {
            return true
          }
          if (importResults.inserts && Object.keys(importResults.inserts).length > 0) {
            return true
          }
        }
        if (importResults.localUpdates && Object.keys(importResults.localUpdates).length > 0) {
          return true
        } 
    }
    return false
  }
  
  function importScopeMatch(tune, limitToTuneId, limitToBookName, limitToTagName, limitToTuneIds) {
    return matchesShareImportScope(tune, {
      limitToTuneId: limitToTuneId,
      limitToBookName: limitToBookName,
      limitToTagName: limitToTagName,
      limitToTuneIds: limitToTuneIds,
    })
  }

  /** 
   * import songs to a tunebook from an abc file 
   * set results {updates, inserts, duplicates} into app scoped importResults
   * Pass options.classifyOnly to classify without setting importResults or saving online.
   */
  function importAbc(abc, forceBook = null, limitToTuneId=null, limitToBookName=null, limitToTagName=null, limitToTuneIds=null, options) {
      var opts = options && typeof options === 'object' ? options : {}
      var classifyOnly = !!opts.classifyOnly
      var currentTunesHash = buildTunesHash(tunes) || tunesHash
      var duplicates=[]
      var inserts=[]
      var updates=[]
      var localUpdates=[]
      var skippedUpdates=[]
      var deletes={}
      var remoteDeleted = parseDeletedTunesFromAbc(abc)
      var importedActiveIds = {}
      var tuneStatus = {updates:[],inserts:[],localUpdates:[],skippedUpdates:[],duplicates:[],deletes:[]}
      if (abc) {
        var intunes = abcTools.abc2Tunebook(abc)
        intunes.forEach(function(tune) { 
            
          if (importScopeMatch(tune, limitToTuneId, limitToBookName, limitToTagName, limitToTuneIds))  {
              if (tune.id) importedActiveIds[tune.id] = true
              var localTomb = deletedTunes && tune.id ? deletedTunes[tune.id] : null
              var localTombAt = localTomb ? parseInt(localTomb.deletedAt, 10) || 0 : 0
              var remoteTuneAt = parseInt(tune.lastUpdated, 10) || 0
              if (localTombAt > 0 && localTombAt >= remoteTuneAt) {
                return
              }
            var hasNotes = false
            var hasChords = false
            tune.boost = 0 // reset boost on import
            if (tune.voices) {
                Object.values(tune.voices).forEach(function(voice) {
                    if (Array.isArray(voice.notes)) {
                        for (var i=0 ; i < voice.notes.length; i++) {
                            if (voice.notes[i]) {
                                hasNotes = true
                                if (voice.notes[i].indexOf('"' !== -1)) {
                                    hasChords = true
                                }
                                if (hasNotes &&  hasChords) {
                                    break;
                                } 
                            }
                        }
                    }
                })
            }
            
            
            
            
            // existing tunes are updated
            if (tune.id && tunes[tune.id]) {
              //if (forceBook) {
                //var books = Array.isArray(tune.books) ? tune.books : []
                //books.push(forceBook)
                //tune.books = utils.uniquifyArray(books)
              //}
              // preserve boost
              //tune.boost = tunes[tune.id].boost
              if (tune.lastUpdated > tunes[tune.id].lastUpdated) {
                updates.push(tune)
                tuneStatus.updates.push({
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                })
              } else if (tune.lastUpdated < tunes[tune.id].lastUpdated) {
                localUpdates.push(tune)
                tuneStatus.localUpdates.push({
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                })
              } else {
                skippedUpdates.push(tune)
                tuneStatus.skippedUpdates.push({
                  hasLyrics:hasLyrics(tune),
                  hasNotes: hasNotes,
                  hasChords: hasChords
                })
              }
              
              //saveTune(tune)
              //updates.push(tune.id)
            // new tunes 
            } else {
              //if (forceDuplicates) {
                //if (forceBook) {
                  //tune.books.push(forceBook)
                  //tune.books = utils.uniquifyArray(tune.books)
                //}
                ////var newTune = saveTune(tune)
                //inserts.push(tune)
              //} else {
                var hash = abcTools.getTuneImportHash(tune)
                //utils.hash(tune.notes.join("\n"))
                var existingImportIds = []
                if (currentTunesHash && currentTunesHash.importhashes && currentTunesHash.importhashes[hash]) {
                  var hashEntry = currentTunesHash.importhashes[hash]
                  existingImportIds = Array.isArray(hashEntry) ? hashEntry : [hashEntry]
                }
                var titleMatchedExisting = existingImportIds.some(function(existingId) {
                  var existingTune = tunes[existingId]
                  return existingTune && importTitlesMatchForDeduping(
                    tuneImportTitle(tune),
                    tuneImportTitle(existingTune)
                  )
                })
                if (existingImportIds.length > 0 && titleMatchedExisting) {
                  duplicates.push(tune)
                  tuneStatus.duplicates.push({
                    hasLyrics:hasLyrics(tune),
                    hasNotes: hasNotes,
                    hasChords: hasChords
                  })
                } else {
                  //if (forceBook) {
                    //tune.books.push(forceBook)
                    //tune.books = utils.uniquifyArray(tune.books)
                  //}
                  //var newTune = saveTune(tune)
                  inserts.push(tune) //newTune.id)
                  tuneStatus.inserts.push({
                    hasLyrics:hasLyrics(tune),
                    hasNotes: hasNotes,
                    hasChords: hasChords
                  })
                }
            }
          }
          
          
        })
        Object.keys(tunes).forEach(function(tuneId) {
          var localTune = tunes[tuneId]
          if (!importScopeMatch(localTune, limitToTuneId, limitToBookName, limitToTagName, limitToTuneIds)) return
          if (importedActiveIds[tuneId]) return
          var remoteTomb = remoteDeleted[tuneId]
          if (!remoteTomb) return
          var remoteTombAt = parseInt(remoteTomb.deletedAt, 10) || 0
          var localTuneAt = parseInt(localTune.lastUpdated, 10) || 0
          if (remoteTombAt >= localTuneAt) {
            deletes[tuneId] = localTune
            tuneStatus.deletes.push({
              hasLyrics: hasLyrics(localTune),
              hasNotes: hasNotes(localTune),
              hasChords: false
            })
          }
        })
      }
      var final = {inserts, updates, duplicates, skippedUpdates, localUpdates, deletes, remoteDeleted, tuneStatus, forceBook: forceBook}
      if (!classifyOnly) {
        saveTunesOnline()
        setImportResults(final)
      }
      return final
  }
  
 
  
  //function importCollection(title) {
    //return importAbc(curatedTuneBooks[title], title)
  //}
  
  
  
  function getTuneBookOptions() {
      var final = {}
      Object.keys(indexes.bookIndex).forEach(function(tuneBookKey) {
          final[tuneBookKey] = tuneBookKey
      })
      return final
  }
  
  function getSearchTuneBookOptions(filter) {
      var opts = getTuneBookOptions()
      var filtered = {}
      Object.keys(opts).forEach(function(key) {
          var val = opts[key]
          if (val && val.indexOf(filter) !== -1) {
              filtered[key] = val
          }
      })
      return filtered
  }
  
  
  
    function getTuneTagOptions() {
      var final = {}
      Object.keys(indexes.tagIndex).forEach(function(tuneTagKey) {
          final[tuneTagKey] = tuneTagKey
      })
      return final
  }
  
  function getSearchTuneTagOptions(filter) {
      var opts = getTuneTagOptions()
      var filtered = {}
      Object.keys(opts).forEach(function(key) {
          var val = opts[key]
          if (val && val.indexOf(filter) !== -1) {
              filtered[key] = val
          }
      })
      return filtered
  }

  function getTuneGenreOptions() {
      var final = {}
      Object.keys(indexes.genreIndex || {}).forEach(function(tuneGenreKey) {
          final[tuneGenreKey] = tuneGenreKey
      })
      return final
  }

  function getSearchTuneGenreOptions(filter) {
      var opts = getTuneGenreOptions()
      var filtered = {}
      Object.keys(opts).forEach(function(key) {
          var val = opts[key]
          if (val && val.indexOf(filter) !== -1) {
              filtered[key] = val
          }
      })
      return filtered
  }

  function getTuneArtistOptions() {
      var final = {}
      Object.keys(indexes.artistIndex || {}).forEach(function(tuneArtistKey) {
          if (tuneArtistKey && String(tuneArtistKey).trim()) {
              final[tuneArtistKey] = tuneArtistKey
          }
      })
      // Always include composer + artists so the list stays complete
      // even when the artist index is empty or stale.
      Object.values(tunes || {}).forEach(function(tune) {
          allArtists(tune).forEach(function(artist) {
              final[artist] = artist
          })
      })
      return final
  }

  function getSearchTuneArtistOptions(filter) {
      var opts = getTuneArtistOptions()
      var filtered = {}
      Object.keys(opts).forEach(function(key) {
          var val = opts[key]
          if (val && val.indexOf(filter) !== -1) {
              filtered[key] = val
          }
      })
      return filtered
  }
    
  function resetTuneBook() {
    pauseSheetUpdates.current = true
    setTunes({})
    indexes.resetBookIndex()
    indexes.resetTagIndex()
    if (indexes.resetGenreIndex) indexes.resetGenreIndex()
    if (indexes.resetArtistIndex) indexes.resetArtistIndex()
    buildTunesHash()
    saveTunesOnline()
  }
    
  function deleteTuneBook(book) {
    pauseSheetUpdates.current = true
    var final = {}
    var tombstones = []
    Object.values(tunes).map(function(tune) {
      if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
        if (tune.books.length > 1) {
          //,tune.books.indexOf(book),JSON.parse(JSON.stringify(tune.books)),JSON.parse(JSON.stringify(tune.books.splice(tune.books.indexOf(book),1))) )
          tune.books.splice(tune.books.indexOf(book),1)
          final[tune.id] = tune
        } else {
          tombstones.push({id: tune.id, name: tune.name})
        }
      } else {
        final[tune.id] = tune
      }
    })
    commitTombstones(tombstones)
    indexes.removeBookFromIndex(book)
    setTunes(final)
    buildTunesHash(final)
    saveTunesOnline()
    setCurrentTuneBook(null)
    forceRefresh()
  }
  
  function deleteAll() {
    if (setDeletedTunes) {
      if (isLoggedIn) {
        // logged in: propagate the purge to other devices via tombstones
        setDeletedTunes(mergeDeletedTuneMaps(deletedTunes, tombstoneAllTunes(tunes)))
      } else {
        // logged out: local reset only. Clear tombstones so re-login re-pulls
        // a clean copy from Google Drive instead of suppressing inserts.
        setDeletedTunes({})
      }
    }
    setTunes({})
    resetTuneBook()
    setCurrentTuneBook(null)
  }
  
  function copyTuneBookAbc(book) {
    utils.copyText(toAbc(book))
  }

  function downloadTuneBookAbc(book) {
    var name = book ? book+'.abc' : 'tunebook.abc'
    utils.download(name,toAbc(book))
  }
  
  function clearBoost() {
    //pauseSheetUpdates.current = true
    //const final = {}
    //Object.values(tunes).forEach(function(tune) {
      //tune.boost = 0
      //final[tune.id] = tune
    //})
    
    //setTunes(final)
    //buildTunesHash(final)
    //saveTunesOnline() 
    ////forceRefresh()
    
  }

  function fromBook(book) {
    const candidateIds = resolveCandidateTuneIds(
      { currentTuneBook: book },
      indexes && indexes.getIndexBundle ? indexes.getIndexBundle() : null,
      tunes ? Object.keys(tunes) : []
    )
    return filterTunes(tunes, function(tune) { return true }, candidateIds)
  }
  
  function fromSearch(filter, bookFilter, tagFilter, genreFilter, artistFilter, starredOnly) {
    const candidateIds = resolveCandidateTuneIds(
      {
        currentTuneBook: bookFilter,
        tagFilter: tagFilter,
        genreFilter: genreFilter,
        artistFilter: artistFilter,
        starredFilter: starredOnly,
      },
      indexes && indexes.getIndexBundle ? indexes.getIndexBundle() : null,
      tunes ? Object.keys(tunes) : []
    )
    return filterTunes(tunes, function(tune) {
      return filterSearch(tune, filter, bookFilter, tagFilter, genreFilter, artistFilter, starredOnly)
    }, candidateIds)
  }
  
  function fromSelection(selection) {
    var res = Object.values(tunes).filter(function(tune) {
        if (selection[tune.id]) {
          return true
        } else {
          return false
        }
    })
    return res
  }
  
  // create an index of list items collated by groupBy
    function groupTunes(items, groupBy) {
        var collated = {}
        if (groupBy) {
            items.forEach(function(item,itemKey) {
                var key = ''
                if (groupBy === 'tempoRange') {
                    key = tempoRangeLabel(parseTempoBpm(item.tempo))
                } else if (Array.isArray(item[groupBy])) {
                    key = item[groupBy].sort().filter(function(a) { return (currentTuneBook && a != currentTuneBook)  }).join(", ")
                } else {
                    key = item[groupBy]
                    if (key > 0) {
                        key = parseInt(key)
                    } else if (key && key.trim && key.trim) {
                        key = key.trim()
                    } else {
                        key = ''
                    }
                }
                if (key) {
                    if (!collated.hasOwnProperty(key)) {
                        collated[key] = []
                        collated[key].push(itemKey)
                    } else {
                        collated[key].push(itemKey)
                    }
                } else {
                    if (!collated.hasOwnProperty('')) {
                        collated[''] = []
                    }
                    collated[''].push(itemKey)  
                }
            })
        }
        
        return collated
    }
  
  
  function shuffle(array) {
      let currentIndex = array.length,  randomIndex;

      // While there remain elements to shuffle.
      while (currentIndex != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        var tmp = array[randomIndex]
        array[randomIndex] = array[currentIndex]  
        array[currentIndex] = tmp
        //[array[currentIndex], array[randomIndex]] = [
          //array[randomIndex], array[currentIndex]];
      }

      return array;
    }
  function mediaFromBook(book, useTunes) {
    if (!useTunes) useTunes = tunes
    var res = Object.values(useTunes).filter(function(tune) {
        if (book) {
          if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
            if (tune.links && tune.links.length > 0) {
                var found = false
                tune.links.forEach(function(link) {
                  if (linkUriString(link).trim()) {
                      found = true
                  }
                })
                return found
            } else {
                return false
            }
          } else {
            return false
          }
        } else {
          if (tune.links && tune.links.length > 0) {
                var found = false
                tune.links.forEach(function(link) {
                  if (linkUriString(link).trim()) {
                      found = true
                  }
                })
                return found
            } else {
                return false
            }
        }
    })
    res = shuffle(res)
    return res
  }
  
  function filterSearch(tune, filter, bookFilter, tagFilter = [], genreFilter = [], artistFilter = [], starredOnly = false) {
        var filterOk = false
        var bookFilterOk = false
        var tagFilterOk = false
        var genreFilterOk = false
        var artistFilterOk = false
        var tagFilterClean = Array.isArray(tagFilter) ? tagFilter.filter(function(t) {
            return (t) ? true : false
        }) : []
        var genreFilterClean = Array.isArray(genreFilter) ? genreFilter.filter(function(g) {
            return (g) ? true : false
        }) : []
        var artistFilterClean = Array.isArray(artistFilter) ? artistFilter.filter(function(a) {
            return (a) ? true : false
        }) : []
        // no filters means show tunes with NO book selected
        if (!bookFilter && (!filter) && (!tagFilter || tagFilter.length === 0) && (!genreFilter || genreFilter.length === 0) && (!artistFilter || artistFilter.length === 0) && !starredOnly) {
            if (tune.books && tune.books.length > 0) {
                return false
            } else {
                return true
            }
        }  else {
            if (!filter || filter.trim().length === 0) {
                filterOk = true
            } else {
                if (tune) {
                    const searchableText = allTitles(tune).concat(allArtists(tune))
                    if (matchesMainSearchText(searchableText, filter.trim())) {
                        filterOk = true
                    } else if (tuneMatchesPdfSnapshotSearch(tune, filter.trim())) {
                        filterOk = true
                    }
                }
            }
            if (!bookFilter || bookFilter.trim().length === 0) {
                bookFilterOk = true
            } else {
                if (tune && tune.books && tune.books.length > 0 && bookFilter.length > 0) {
                    tune.books.forEach(function(book) {
                        if (book && book.toLowerCase && bookFilter && bookFilter.toLowerCase &&  book.toLowerCase() === bookFilter.toLowerCase()) {
                            bookFilterOk = true
                        }
                    })
                } 
            }
            if (!Array.isArray(tagFilterClean) || tagFilterClean.length === 0) {
                tagFilterOk = true
            } else {
                if (tune && tune.tags && tune.tags.length > 0 && Array.isArray(tagFilterClean) && tagFilterClean.length > 0) {
                    tagFilterOk = true
                    var tuneTagsLower = tune.tags.map(function(t) {
                        return (t && t.toLowerCase) ? t.toLowerCase() : t
                    })
                    tagFilterClean.forEach(function(tag) {
                        if (tag && tag.toLowerCase && tuneTagsLower.indexOf(tag.toLowerCase()) !== -1) {
                            //tagFilterOk = true
                        } else {
                            tagFilterOk = false
                        }
                    })
                } 
            }
            if (!Array.isArray(genreFilterClean) || genreFilterClean.length === 0) {
                genreFilterOk = true
            } else {
                genreFilterOk = tuneMatchesGenreFilter(tune, genreFilterClean)
            }
            if (!Array.isArray(artistFilterClean) || artistFilterClean.length === 0) {
                artistFilterOk = true
            } else {
                artistFilterOk = tuneMatchesArtistFilter(tune, artistFilterClean)
            }
            var starredFilterOk = !starredOnly || !!(tune && tune.starred)
            return (filterOk && bookFilterOk && tagFilterOk && genreFilterOk && artistFilterOk && starredFilterOk)
        }
    }
  
  function mediaFromSearch(filter, bookFilter, tagFilter, useTunes = null, genreFilter = [], artistFilter = [], starredOnly = false) {
    if (!useTunes) useTunes = tunes
    var res = Object.values(useTunes).filter(function(tune) {
        return filterSearch(tune, filter, bookFilter, tagFilter, genreFilter, artistFilter, starredOnly)
    })
    res = shuffle(res)
    return res
  }
  
  function mediaFromSelection(selection, mergedTunes) {
    var final = []
    if (selection && selection.split) {
        var res = selection.split(",").forEach(function(tuneId) {
            var useTunes = mergedTunes != null ? mergedTunes : tunes
            if (useTunes[tuneId]) {
                  var tune = useTunes[tuneId]
                  if (hasLinks(tune)) {
                        //tune.links.forEach(function(link) {
                          //if (link.link && link.link.trim()) {
                              final.push(tune)
                          //}
                        //})
                  }
            }
        })
    //res = shuffle(res)
        
    }
    return final
  }
  
  function toAbc(book) {
    var res = Object.values(tunes).filter(function(tune) {
        if (book) {
          if (Array.isArray(tune.books) && tune.books.indexOf(book) !== -1) {
            return true
          } else {
            return false
          }
        } else {
          return true
        }
    }).map(function(tune, k) {
      //var newTune = tune
      if (tune && tune.meta) tune.meta.X = k
      return abcTools.json2abc(tune)
    }).join("\n")
    return res 

  }
  
  
  function fillMediaPlaylist(book = null, selectedIds = null, filterTags = null, mergedTunes = null, navigateFn, filterGenres = null, filterArtists = null) {
        var built = buildQueueTunesFromContext(book, selectedIds, filterTags, mergedTunes, { mediaOnly: true, limit: PLAYLIST_MAX_ITEMS, genreFilter: filterGenres, artistFilter: filterArtists })
        if (!built.tunes.length) return null
        var queue = createQueue({
          tuneIds: tuneIdsFromTunes(built.tunes, PLAYLIST_MAX_ITEMS),
          name: built.name,
          source: selectedIds ? 'selection' : 'filter',
        })
        return startNowPlayingQueue(queue, navigateFn)
  }
    
    //function fillMediaPlaylistFromTag(tag) {
        //var fillTunes = mediaFromSearch('','',[tag])
        //fillTunes = fillTunes.filter(function(tune) {
              //var ret = false
              //if (tune.links && tune.links.length > 0) {
                    //tune.links.forEach(function(link) {
                      //if (link.link && link.link.trim()) {
                          //ret = true
                      //}
                    //})
              //}
              //return ret
        //})
        //shuffleArray(fillTunes)
        //if (Array.isArray(fillTunes)) {
            //fillTunes = fillTunes.sort(function(a,b) {
                //return (a && b && a.boost && b.boost && a.boost > b.boost) ? 1 : -1
            //})
            //setMediaPlaylist({currentTune: 0, book:'', tunes:fillTunes.slice(0,20)})
        //}
        //setAbcPlaylist(null)
    //}
    
    
    
    function shuffleArray(array) {
        for (var i = array.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = array[i];
            array[i] = array[j];
            array[j] = temp;
        }
    }

    function fillAbcPlaylist(book, selected, tagFilter, navigateFn, filterGenres, filterArtists) {
        var built = buildQueueTunesFromContext(book, selected, tagFilter, null, { limit: PLAYLIST_MAX_ITEMS, genreFilter: filterGenres, artistFilter: filterArtists })
        var midiTunes = built.tunes.filter(function(tune) { return hasNotesOrChords(tune) })
        if (!midiTunes.length) return null
        var queue = createQueue({
          tuneIds: tuneIdsFromTunes(midiTunes, PLAYLIST_MAX_ITEMS),
          name: built.name,
          source: selected ? 'selection' : 'filter',
        })
        queue.items = queue.items.map(function(item) {
          return Object.assign({}, item, { prefer: 'midi' })
        })
        return startNowPlayingQueue(queue, navigateFn)
    }
    
    function fillAnyPlaylist(book, selected, tagFilter, navigateFn, filterGenres, filterArtists) {
        var built = buildQueueTunesFromContext(book, selected, tagFilter, null, { limit: PLAYLIST_MAX_ITEMS, genreFilter: filterGenres, artistFilter: filterArtists })
        if (!built.tunes.length) return null
        var queue = createQueue({
          tuneIds: tuneIdsFromTunes(built.tunes, PLAYLIST_MAX_ITEMS),
          name: built.name,
          source: selected ? 'selection' : 'filter',
        })
        return startNowPlayingQueue(queue, navigateFn)
    }

    function clearNowPlayingQueue() {
      setNowPlayingQueue(null)
    }

    function createQueueFromTuneIds(tuneIds, options) {
      var opts = options || {}
      var queue = createQueue({
        tuneIds: clampTuneIds(tuneIds),
        name: opts.name || 'Playlist',
        source: opts.source || 'manual',
        followTune: opts.followTune !== undefined ? !!opts.followTune : false,
      })
      setNowPlayingQueue(queue)
      return queue
    }
    
    function hasNotesOrChords(tune) {
        return (tune && (hasNotes(tune) || abcTools.hasChords(abcTools.getNotes(tune)))) ? true : false
    }
    
    function getExportAbc(tune, options) {
        if (!tune) return null
        var opts = options || {}
        var useTune = JSON.parse(JSON.stringify(tune))
        if (opts.expandRepeats !== false && useTune.repeats > 1 && useTune.voices && Object.keys(useTune.voices).length > 0) {
            var newVoices = {}
            Object.keys(useTune.voices).map(function(vKey) {
              newVoices[vKey] = useTune.voices[vKey]
              var lines = Array.isArray(newVoices[vKey].notes)
                ? newVoices[vKey].notes.slice()
                : [String(newVoices[vKey].notes || '')]
              var expanded = []
              for (var repeatIndex = 0; repeatIndex < useTune.repeats; repeatIndex++) {
                expanded = expanded.concat(lines)
              }
              newVoices[vKey].notes = expanded
            })
            useTune.voices = newVoices
        }
        var abc = abcTools.json2abc(useTune)
        if (useTune.transpose !== 0) {
            var visualObj = abcjs.renderAbc("transpose_render", abc);
            try {
                abc = abcjs.strTranspose(abc, visualObj, tune.transpose)
            } catch (e) {
            }
        }
        return abc
    }

    function getNotationExportAbc(tune) {
        return getExportAbc(tune, { expandRepeats: false })
    }

    function getMusicXmlExportAbc(tune) {
        if (!tune) return null
        var useTune = JSON.parse(JSON.stringify(tune))
        useTune.wLines = buildNotationWLines(useTune)
        useTune.words = []
        var abc = abcTools.json2abc(useTune)
        if (useTune.transpose !== 0) {
            var visualObj = abcjs.renderAbc("transpose_render", abc);
            try {
                abc = abcjs.strTranspose(abc, visualObj, tune.transpose)
            } catch (e) {
            }
        }
        return abc
    }

    function getMidiData(tune, outputType, options) {
        if (tune) {
            var opts = options || {}
            var abc = getExportAbc(tune)
            if (!abc) return null
            var midiOpts = {
                chordsOff: !!opts.notationFriendly,
                midiOutputType: outputType || "binary",
            }
            var midi = abcjs.synth.getMidiFile(abc, midiOpts);
            return midi
        }
    }

    function downloadMidi(tune, options) {
            var opts = options || {}
            var midi = getMidiData(tune, "binary", opts)
            if (!midi) {
                throw new Error('Could not generate MIDI for "' + (tune && tune.name ? tune.name : 'tune') + '"')
            }
            var suffix = opts.notationFriendly ? ".notation.mid" : ".midi"
            var url = window.URL.createObjectURL(new Blob(midi, {type: 'audio/midi'}));
            var a = document.createElement("a");
            document.body.appendChild(a);
            a.style = "display: none";
            a.href = url;
            a.download = (tune.name ? tune.name : 'download') + suffix;
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
    

  return {deleteTunes,  removeTunesFromBook, addTunesToBook, addTunesToTag, removeTunesFromTag, clearBoost,applyImport, importAbc, toAbc, fromBook, fromSearch,fromSelection, mediaFromBook, mediaFromSearch, mediaFromSelection, deleteTuneBook, copyTuneBookAbc, downloadTuneBookAbc, resetTuneBook, saveTune, utils, abcTools, icons,  curatedTuneBooks, getTuneBookOptions, getSearchTuneBookOptions, deleteAll, deleteTune, buildTunesHash, updateTunesHash , setTunes, setCurrentTune, setCurrentTuneBook, setTunesHash, forceRefresh, indexes, textSearchIndex, navigate, navigateToPreviousSong,navigateToNextSong, getSearchListOrderedIds: buildSearchListOrderedIds, hasLinks,  hasLyrics, hasNotes, showImportWarning, applyImportData, applyMergeData, createTune, fillAbcPlaylist, fillAnyPlaylist, fillMediaPlaylist, clearNowPlayingQueue, createQueueFromTuneIds, startNowPlayingQueue, bulkChangeTunes , getTuneTagOptions, getSearchTuneTagOptions, getTuneGenreOptions, getSearchTuneGenreOptions, getTuneArtistOptions, getSearchTuneArtistOptions,filterSearch ,groupTunes , hasNotesOrChords  , downloadMidi, getMidiData, getExportAbc, getNotationExportAbc, getMusicXmlExportAbc, applyTuneSnapshot, applyHistoryEntry, undoTuneEdits, redoTuneEdits, canUndoTuneEdits: function(tuneId) { return editHistory && typeof editHistory.canUndo === 'function' ? editHistory.canUndo(tuneId) : false }, canRedoTuneEdits: function(tuneId) { return editHistory && typeof editHistory.canRedo === 'function' ? editHistory.canRedo(tuneId) : false }, getUndoTuneEditLabel: function(tuneId) { return editHistory && typeof editHistory.getUndoLabel === 'function' ? editHistory.getUndoLabel(tuneId) : '' }, getRedoTuneEditLabel: function(tuneId) { return editHistory && typeof editHistory.getRedoLabel === 'function' ? editHistory.getRedoLabel(tuneId) : '' }};
}
export default useTuneBook
