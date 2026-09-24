import { NativeModule, requireOptionalNativeModule } from 'expo';
import { type AndroidWifiBridge, type NativeWifiPoll, type NativeWifiStatus } from './bridge';

type Events = {
  onPoll: (poll: NativeWifiPoll) => void;
  onError: (error: { message: string }) => void;
};

declare class HmAndroidWifiNative extends NativeModule<Events> {
  getStatus(): Promise<NativeWifiStatus>;
  start(intervalMs: number): void;
  stop(): void;
}

/** Null when the native module is not in this build (iOS, Expo Go, or a stale dev client). */
export function loadAndroidWifiBridge(): AndroidWifiBridge | null {
  const native = requireOptionalNativeModule<HmAndroidWifiNative>('HmAndroidWifi');
  if (!native) return null;
  return {
    getStatus: () => native.getStatus(),
    start: (intervalMs) => native.start(intervalMs),
    stop: () => native.stop(),
    addPollListener: (listener) => native.addListener('onPoll', listener),
    addErrorListener: (listener) => native.addListener('onError', listener),
  };
}
