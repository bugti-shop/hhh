import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flowist.app',
  appName: 'Flowist',
  webDir: 'dist',
  server: {
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      showSpinner: false,
    },
    SocialLogin: {
      google: {
        webClientId: '425291387152-u06impgmsgg286jg7odo4f40fu6pjmb5.apps.googleusercontent.com',
      },
    },
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: false,
    },
  },
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
    zoomEnabled: true,
  },
  ios: {
    scrollEnabled: true,
  },
};

export default config;
