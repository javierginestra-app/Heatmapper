import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors, spacing } from '@/modules/ui';
import { createContainer, type Container } from './container';
import { AppNavigation } from './navigation';

type BootState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly container: Container }
  | { readonly status: 'failed'; readonly message: string };

export default function App() {
  const [state, setState] = useState<BootState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    createContainer()
      .then((container) => !cancelled && setState({ status: 'ready', container }))
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {state.status === 'ready' ? (
        <AppNavigation container={state.container} />
      ) : (
        <View style={styles.boot}>
          <Text style={state.status === 'failed' ? styles.error : styles.muted}>
            {state.status === 'failed' ? `Startup failed: ${state.message}` : 'Starting…'}
          </Text>
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', padding: spacing.lg },
  muted: { color: colors.textMuted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
});
