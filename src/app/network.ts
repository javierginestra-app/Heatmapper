import * as Network from 'expo-network';

/** True only when the active connection is Wi-Fi; unknown counts as not Wi-Fi. */
export async function isOnWifi(): Promise<boolean> {
  const state = await Network.getNetworkStateAsync();
  return state.type === Network.NetworkStateType.WIFI && state.isConnected === true;
}
