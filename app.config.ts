import { type ExpoConfig } from 'expo/config';

// Bundle identifiers are placeholders until the store listing is registered (Stage 6).
const config: ExpoConfig = {
  name: 'Heat Mapper Live',
  slug: 'heat-mapper-live',
  version: '0.0.1',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  ios: { bundleIdentifier: 'app.heatmapperlive', supportsTablet: true },
  android: { package: 'app.heatmapperlive' },
  plugins: [
    [
      'expo-location',
      { locationWhenInUsePermission: 'Heat Mapper Live uses your location to tag a project with where it was surveyed.' },
    ],
  ],
};

export default config;
