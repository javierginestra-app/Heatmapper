import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { type CapabilityStatus } from '@/core';
import { CapabilityList, detectCapabilities } from '@/modules/capabilities';
import { colors, Muted, spacing } from '@/modules/ui';
import { type Container } from './container';

export function CapabilitiesScreen({ container }: { readonly container: Container }) {
  const [statuses, setStatuses] = useState<readonly CapabilityStatus[] | null>(null);

  useEffect(() => {
    container.settings
      .get()
      .then((settings) => detectCapabilities({ platform: container.platform, settings }, container.capabilityProbes))
      .then(setStatuses);
  }, [container]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Muted>Local database schema v{container.schemaVersion}</Muted>
      {statuses ? <CapabilityList statuses={statuses} /> : <Muted>Checking…</Muted>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
});
