import { registerPlugin } from '@capacitor/core';
import { isAndroidApp } from '../platformUtils';

export const TunebookYoutube = registerPlugin('TunebookYoutube', {
  web: function() {
    return import('./tunebookYoutubeWeb').then(function(m) { return new m.TunebookYoutubeWeb(); });
  },
});

export const TunebookMedia = registerPlugin('TunebookMedia', {
  web: function() {
    return import('./tunebookMediaWeb').then(function(m) { return new m.TunebookMediaWeb(); });
  },
});

export function isNativeYoutubeAvailable() {
  return isAndroidApp();
}

export function isNativeMediaPlayerAvailable() {
  return isAndroidApp();
}
