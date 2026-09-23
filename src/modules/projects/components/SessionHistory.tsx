import { StyleSheet, Text, View } from 'react-native';
import { type SessionSummary } from '@/core';
import { colors, Muted, spacing } from '@/modules/ui';

const MODE = { signal: 'Signal (RSSI)', performance: 'Performance' } as const;
const STATUS = { recording: 'Recording', paused: 'Paused', completed: 'Completed' } as const;

export function SessionHistory({ sessions }: { readonly sessions: readonly SessionSummary[] }) {
  if (sessions.length === 0) return <Muted>No surveys recorded yet.</Muted>;
  return (
    <View style={styles.list}>
      {sessions.map((s) => (
        <View key={s.id} style={styles.row}>
          <Text style={styles.title}>
            {new Date(s.startedAtMs).toLocaleString()} · {MODE[s.mode]}
          </Text>
          <Muted>
            {s.locationName} · {STATUS[s.status]} · {s.sampleCount} {s.sampleCount === 1 ? 'sample' : 'samples'}
          </Muted>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: 2 },
  title: { color: colors.text, fontSize: 15 },
});
