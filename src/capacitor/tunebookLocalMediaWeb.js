import { WebPlugin } from '@capacitor/core';

export class TunebookLocalMediaWeb extends WebPlugin {
  async requestAudioPermission() {
    return { granted: false, permission: '' };
  }

  async searchLocalAudio() {
    return { candidates: [], count: 0 };
  }

  async getLocalAudioStats() {
    return { granted: false, trackCount: 0, lastScanAt: 0 };
  }

  async openAudioFileForImport() {
    throw new Error('Local media import is only available in the Android app');
  }

  async openPermissionSettings() {}
}
