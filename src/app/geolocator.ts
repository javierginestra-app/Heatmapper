import * as ExpoLocation from 'expo-location';
import { type Geolocator } from '@/modules/projects';

export const expoGeolocator: Geolocator = {
  async currentPosition() {
    const { status } = await ExpoLocation.requestForegroundPermissionsAsync();
    if (status !== 'granted') throw new Error('Location permission was not granted. You can still enter an address.');
    const position = await ExpoLocation.getCurrentPositionAsync({ accuracy: ExpoLocation.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  },
};
