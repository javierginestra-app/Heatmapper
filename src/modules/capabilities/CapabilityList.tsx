import { StyleSheet, Text, View } from 'react-native';
import { type CapabilityStatus } from '@/core';
import { availabilityColor, colors, spacing } from '@/modules/ui';
import { capabilityLabel } from './detect';

const AVAILABILITY_TEXT = {
  available: 'Available',
  unsupported: 'Unsupported',
  disabled: 'Disabled',
  not_implemented: 'Not implemented',
  unknown: 'Unknown',
} as const;

export function CapabilityList({ statuses }: { readonly statuses: readonly CapabilityStatus[] }) {
  return (
    <View style={styles.list}>
      {statuses.map((status) => (
        <View key={status.id} style={styles.row} accessibilityLabel={`${capabilityLabel(status.id)}: ${AVAILABILITY_TEXT[status.availability]}`}>
          <View style={styles.header}>
            <Text style={styles.label}>{capabilityLabel(status.id)}</Text>
            <Text style={[styles.badge, { color: availabilityColor[status.availability] }]}>
              {AVAILABILITY_TEXT[status.availability]}
            </Text>
          </View>
          <Text style={styles.reason}>{status.reason}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.text, fontSize: 16, fontWeight: '600' },
  badge: { fontSize: 13, fontWeight: '700' },
  reason: { color: colors.textMuted, fontSize: 13, marginTop: spacing.xs },
});
