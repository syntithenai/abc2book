/** Cross-component request to open TuneBook Helper install instructions. */

export const OPEN_YOUTUBE_HELPER_INSTALL_EVENT = 'abc2book:open-youtube-helper-install'

export function requestOpenYoutubeHelperInstall() {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
  window.dispatchEvent(new CustomEvent(OPEN_YOUTUBE_HELPER_INSTALL_EVENT))
}

export function subscribeOpenYoutubeHelperInstall(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') {
    return function() {}
  }
  function onEvent() {
    handler()
  }
  window.addEventListener(OPEN_YOUTUBE_HELPER_INSTALL_EVENT, onEvent)
  return function() {
    window.removeEventListener(OPEN_YOUTUBE_HELPER_INSTALL_EVENT, onEvent)
  }
}
