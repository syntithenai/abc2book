import { WebPlugin } from '@capacitor/core';

export class TunebookMediaWeb extends WebPlugin {
  async load() {
    throw new Error('Native media player is only available in the Android app');
  }

  async play() {}
  async pause() {}
  async seekTo() {}
  async setPlaybackSpeed() {}
  async getState() {
    return { isPlaying: false, positionMs: 0, durationMs: 0 };
  }
  async stop() {}
  async openBatterySettings() {}
}
