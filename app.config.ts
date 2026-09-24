import { type ExpoConfig } from 'expo/config';
import { withAndroidManifest, type ConfigPlugin } from 'expo/config-plugins';

/**
 * Owned test endpoints on a LAN usually speak plain HTTP. Requests go only to
 * endpoints the user enters for performance tests.
 */
const withCleartextForTestEndpoints: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });

// Bundle identifiers are placeholders until the store listing is registered (Stage 6).
const config: ExpoConfig = {
  name: 'Heat Mapper Live',
  slug: 'heat-mapper-live',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.heatmapperlive',
    supportsTablet: true,
    infoPlist: {
      NSLocalNetworkUsageDescription: 'Heat Mapper Live runs performance tests against a test endpoint on your local network.',
      NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
    },
  },
  android: { package: 'app.heatmapperlive' },
  plugins: [
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Heat Mapper Live uses your location to tag a project with where it was surveyed and, on Android, to read the Wi-Fi network name and access point of each reading.',
      },
    ],
  ],
};

export default withCleartextForTestEndpoints(config);
