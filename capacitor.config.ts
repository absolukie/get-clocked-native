import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Bundle ID / application ID. Change this ONLY together with the Xcode
  // "Bundle Identifier" and the Android package + the Kotlin plugin's
  // `package` line — they must all match.
  // (The Store product ID boygames.getclocked.remove_ads is separate and
  // stays exactly as-is; see README "Store products".)
  appId: 'com.butterworks.getclocked',
  appName: 'Get Clocked',
  webDir: 'web',
  server: {
    androidScheme: 'https',
  },
};

export default config;
