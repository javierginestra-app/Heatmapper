import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';
import { type CapabilityStatus } from '@/core';
import { CapabilityList, detectCapabilities } from '@/modules/capabilities';
import { colors, spacing } from '@/modules/ui';
import { createContainer } from './container';

type BootState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly schemaVersion: number; readonly capabilities: readonly CapabilityStatus[] }
  | { readonly status: 'failed'; readonly message: string };

export default function App() {
  const [state, setState] = useState<BootState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const container = await createContainer();
      const settings = await container.settings.get();
      const capabilities = await detectCapabilities(
        { platform: container.platform, settings },
        container.capabilityProbes,
      );
      if (!cancelled) setState({ status: 'ready', schemaVersion: container.schemaVersion, capabilities });
    })().catch((error: unknown) => {
      if (!cancelled) setState({ status: 'failed', message: error instanceof Error ? error.message : String(error) });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Heat Mapper Live</Text>
        {state.status === 'loading' && <Text style={styles.muted}>Starting…</Text>}
        {state.status === 'failed' && <Text style={styles.error}>Startup failed: {state.message}</Text>}
        {state.status === 'ready' && (
          <>
            <Text style={styles.muted}>Local database ready (schema v{state.schemaVersion})</Text>
            <Text style={styles.section}>Device capabilities</Text>
            <CapabilityList statuses={state.capabilities} />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { color: colors.text, fontSize: 28, fontWeight: '700' },
  section: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: spacing.md },
  muted: { color: colors.textMuted, fontSize: 14 },
  error: { color: colors.danger, fontSize: 14 },
});
