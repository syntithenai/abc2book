import h from 'virtual-dom/h'
import ScrollHook from 'waveform-playlist/lib/render/ScrollHook'
import { pixelsToSeconds } from 'waveform-playlist/lib/utils/conversions'
import Playlist from 'waveform-playlist/lib/Playlist'

let patched = false

/**
 * Replace all playlist lanes. Upstream load() appends tracks; DAW reloads need a full replace.
 */
export async function reloadWaveformPlaylistTracks(playlist, trackList) {
  if (!playlist) return undefined
  if ((playlist.tracks || []).length) {
    await playlist.clear()
  }
  return playlist.load(trackList || [])
}

/**
 * Patches waveform-playlist to honor per-track laneHeight and lane metadata from load specs.
 */
export default function ensureWaveformPlaylistTrackHeightPatch() {
  if (patched) return
  patched = true

  const proto = Playlist.prototype
  const originalLoad = proto.load

  proto.load = function patchedLoad(trackList) {
    const self = this
    return originalLoad.call(this, trackList).then(function(result) {
      if (Array.isArray(trackList) && Array.isArray(self.tracks)) {
        trackList.forEach(function(info, index) {
          const track = self.tracks[index]
          if (!track || !info) return
          track.laneHeight = info.laneHeight
          track.laneRole = info.laneRole
          track.trackId = info.trackId
          track.takeId = info.takeId
          track.activeTake = !!info.activeTake
        })
      }
      return result
    })
  }

  proto.renderTrackSection = function patchedRenderTrackSection() {
    const self = this
    const trackElements = this.tracks.map(function(track) {
      const collapsed = self.collapsedTracks.indexOf(track) > -1
      const height = collapsed
        ? self.collapsedWaveHeight
        : (track.laneHeight != null ? track.laneHeight : self.waveHeight)
      return track.render(self.getTrackRenderData({
        isActive: self.isActiveTrack(track),
        shouldPlay: self.shouldTrackPlay(track),
        soloed: self.soloedTracks.indexOf(track) > -1,
        muted: self.mutedTracks.indexOf(track) > -1,
        collapsed: collapsed,
        height: height,
        barGap: self.barGap,
        barWidth: self.barWidth,
      }))
    })
    return h('div.playlist-tracks', {
      attributes: {
        style: 'overflow: auto;',
      },
      onscroll: function(e) {
        self.scrollLeft = pixelsToSeconds(e.target.scrollLeft, self.samplesPerPixel, self.sampleRate)
        self.ee.emit('scroll')
      },
      hook: new ScrollHook(this),
    }, trackElements)
  }
}
