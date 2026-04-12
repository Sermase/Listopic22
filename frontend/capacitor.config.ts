import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.listopic.web',
  appName: 'Listopic',
  webDir: 'dist',
  backgroundColor: '#0b1021',
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com'],
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0b1021',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'none',
      style: 'DARK',
    },
  },
};

export default config;
