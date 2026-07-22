import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mydigitalcleaning.app',
  appName: 'My Cleaning',
  webDir: 'dist/public',

  // -------------------------------------------------------------------------
  // iOS-specific configuration
  // -------------------------------------------------------------------------
  ios: {
    // Allow the WKWebView to scroll; the app manages its own scroll areas
    scrollEnabled: true,
    // Prevents white flash on launch
    backgroundColor: '#F9F4EE',
    // Allow inline media playback (used for wardrobe image previews)
    allowsInlineMediaPlayback: true,
    // iOS privacy usage descriptions — all three are required for the camera
    // and photo-library flow; missing any one causes a TCC crash or silent refusal
    infoPlist: {
      NSCameraUsageDescription:
        'My Cleaning uses the camera so you can photograph clothing items and add them to your wardrobe.',
      NSPhotoLibraryUsageDescription:
        'My Cleaning reads your photo library so you can choose existing photos of your clothing items.',
      NSPhotoLibraryAddUsageDescription:
        'My Cleaning saves photos you take with the camera to your photo library.',
    },
  },

  plugins: {
    // Keep the splash screen visible until the React app signals it is ready
    SplashScreen: {
      launchShowDuration: 1800,
      launchAutoHide: true,
      backgroundColor: '#F9F4EE',
      iosSpinnerStyle: 'small',
      showSpinner: false,
    },

    // Overlay the status bar so the cream background shows through the notch
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#F9F4EE',
      overlaysWebView: true,
    },
  },
};

export default config;
