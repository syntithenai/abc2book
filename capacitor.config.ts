import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'net.tunebook.app',
  appName: 'Tunebook',
  webDir: 'build',
  android: {
    allowMixedContent: true,
    backgroundColor: '#1a1a2e',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    TunebookYoutube: {},
    TunebookMedia: {},
  },
};

export default config;
