import { getLinkSrcType } from './checkTuneLinkPlayback'

/**
 * Icon + Bootstrap variant for a linked-media play button in media controls.
 */
export function resolveMediaLinkPlaybackButton(link, isYoutubeLink) {
  const srcType = getLinkSrcType(link, isYoutubeLink)
  if (srcType === 'midifile') {
    return {
      variant: 'info',
      iconKey: 'midi',
      className: 'media-controls-link-btn media-controls-link-btn--midi',
      label: 'MIDI',
    }
  }
  return {
    variant: 'danger',
    iconKey: 'link',
    className: 'media-controls-link-btn media-controls-link-btn--media',
    label: null,
  }
}

export function mediaLinkPlaybackIcon(tunebook, iconKey) {
  if (!tunebook || !tunebook.icons) return null
  return tunebook.icons[iconKey] || tunebook.icons.link
}
