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

export const TunebookLocalMedia = registerPlugin('TunebookLocalMedia', {
  web: function() {
    return import('./tunebookLocalMediaWeb').then(function(m) { return new m.TunebookLocalMediaWeb(); });
  },
});

export const TunebookMediaCache = registerPlugin('TunebookMediaCache', {
  web: function() {
    return {
      registerEntry: async function() { return { ok: false }; },
      removeEntry: async function() { return { ok: false }; },
      clearAll: async function() { return { ok: false }; },
      hasEntry: async function() { return { cached: false }; },
      hashKey: async function(opts) {
        return { fileName: String((opts && opts.cacheKey) || '') };
      },
    };
  },
});

export const TunebookVoiceListen = registerPlugin('TunebookVoiceListen', {
  web: function() {
    return {
      ensurePermissions: async function() { return { granted: false }; },
      isAvailable: async function() { return { available: false }; },
      listen: async function() {
        return { transcript: '', partial: false, reason: 'unavailable' };
      },
      stop: async function() {},
      cancel: async function() {},
      addListener: async function() {
        return { remove: async function() {} };
      },
    };
  },
});

export function isNativeYoutubeAvailable() {
  return isAndroidApp();
}

export function isNativeMediaPlayerAvailable() {
  return isAndroidApp();
}

export function isNativeLocalMediaAvailable() {
  return isAndroidApp();
}

export function isNativeVoiceListenAvailable() {
  return isAndroidApp();
}
