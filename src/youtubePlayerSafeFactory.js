/**
 * Null-safe wrapper around youtube-player.
 *
 * react-youtube can call the factory with a null container after unmount /
 * destroy-then-recreate races. youtube-player treats null as an object
 * (typeof null === 'object') and crashes on `null.playVideo`.
 *
 * Webpack/Jest alias exact `youtube-player` → this module. The real package
 * is loaded via subpath so ModuleScopePlugin still allows node_modules.
 */

const originalModule = require('youtube-player/dist/index.js')
const originalFactory = typeof originalModule === 'function'
  ? originalModule
  : originalModule.default

const PLAYER_METHODS = [
  'cueVideoById', 'loadVideoById', 'cueVideoByUrl', 'loadVideoByUrl',
  'playVideo', 'pauseVideo', 'stopVideo', 'getVideoLoadedFraction',
  'cuePlaylist', 'loadPlaylist', 'nextVideo', 'previousVideo', 'playVideoAt',
  'setShuffle', 'setLoop', 'getPlaylist', 'getPlaylistIndex', 'setOption',
  'mute', 'unMute', 'isMuted', 'setVolume', 'getVolume', 'seekTo',
  'getPlayerState', 'getPlaybackRate', 'setPlaybackRate',
  'getAvailablePlaybackRates', 'getPlaybackQuality', 'setPlaybackQuality',
  'getAvailableQualityLevels', 'getCurrentTime', 'getDuration',
  'removeEventListener', 'getVideoUrl', 'getVideoEmbedCode', 'getOptions',
  'getOption', 'addEventListener', 'destroy', 'setSize', 'getIframe',
]

function createDetachedNoOpPlayer() {
  const api = {
    on: function() {},
    off: function() {},
  }
  PLAYER_METHODS.forEach(function(name) {
    api[name] = function() {
      return Promise.resolve(null)
    }
  })
  api.destroy = function() {
    return Promise.resolve()
  }
  return api
}

function isMissingPlayerTarget(maybeElementId) {
  return maybeElementId == null
}

function safeYouTubePlayer(maybeElementId, options, strictState) {
  if (isMissingPlayerTarget(maybeElementId)) {
    return createDetachedNoOpPlayer()
  }
  return originalFactory(maybeElementId, options, strictState)
}

module.exports = safeYouTubePlayer
module.exports.default = safeYouTubePlayer
module.exports.createDetachedNoOpPlayer = createDetachedNoOpPlayer
module.exports.isMissingPlayerTarget = isMissingPlayerTarget
