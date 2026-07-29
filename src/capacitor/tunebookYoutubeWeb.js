import { WebPlugin } from '@capacitor/core';

export class TunebookYoutubeWeb extends WebPlugin {
  async ping() {
    return { ok: false, error: 'Not available on web' };
  }

  async fetchYoutubeAudio() {
    throw new Error('Native YouTube fetch is only available in the Android app');
  }

  async searchYoutubeVideos() {
    throw new Error('Native YouTube search is only available in the Android app');
  }
}
