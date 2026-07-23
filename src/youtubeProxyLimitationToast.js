import React from 'react'
import { toast } from 'react-toastify'
import { audioFiltersAreNeutral, pitchShiftIsActive } from './pitchTempoUtils'
import { isChromiumDesktopBrowser } from './platformUtils'
import {
  isCloudYoutubeProxyBlocked,
} from './youtubeUnlock'
import { requestOpenYoutubeHelperInstall } from './youtubeHelperInstallOpen'

const TOAST_ID = 'youtube-cloud-proxy-limitation'

let lastNotifiedKey = ''

function settingsNeedYoutubeProxyBytes(settings) {
  if (!settings) return false
  if (pitchShiftIsActive(settings.pitch, settings.fineTune)) return true
  return !!(settings.audioFilters && !audioFiltersAreNeutral(settings.audioFilters))
}

export function resetYoutubeProxyLimitationNotify() {
  lastNotifiedKey = ''
}

export function maybeNotifyYoutubeProxyLimitation(options) {
  const opts = options || {}
  const settings = opts.settings
  const srcType = opts.srcType
  const features = opts.resolverFeatures || null
  if (!opts.activated) return
  if (!opts.externalPitchUnavailable) return
  if (opts.practiceNativeOnly) return
  if (srcType !== 'youtube') return
  if (!settingsNeedYoutubeProxyBytes(settings)) return
  if (!isCloudYoutubeProxyBlocked(features)) return

  const notifyKey = [
    'cloud-yt',
    opts.tuneId || '',
    opts.linkIndex != null ? String(opts.linkIndex) : '',
  ].join('|')
  if (notifyKey === lastNotifiedKey) return
  lastNotifiedKey = notifyKey

  if (isChromiumDesktopBrowser()) {
    toast.info(function(renderProps) {
      return (
        <div
          className="youtube-proxy-limitation-toast"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
        >
          <span>
            Pitch shift on YouTube needs the TuneBook Helper extension in this browser.
          </span>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="youtube-helper-install-toast"
            onClick={function() {
              requestOpenYoutubeHelperInstall()
              if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
            }}
          >
            Install instructions
          </button>
        </div>
      )
    }, {
      toastId: TOAST_ID,
      autoClose: 12000,
      closeOnClick: true,
    })
    return
  }

  toast.warning(
    'This cloud media resolver cannot download YouTube audio — hosted IPs are often blocked. '
      + 'Pitch shift and audio filters need downloaded cache, your home resolver, a residential proxy, '
      + 'or TuneBook Helper in Chrome on desktop.',
    {
      toastId: TOAST_ID,
      autoClose: 12000,
      closeOnClick: true,
    }
  )
}

if (typeof window !== 'undefined') {
  ;['youtubeHelperSettingsChanged', 'webshareProxySettingsChanged', 'mediaProxySettingsChanged'].forEach(
    function(eventName) {
      window.addEventListener(eventName, resetYoutubeProxyLimitationNotify)
    }
  )
}

export function __resetYoutubeProxyLimitationToastForTests() {
  lastNotifiedKey = ''
  toast.dismiss(TOAST_ID)
}
