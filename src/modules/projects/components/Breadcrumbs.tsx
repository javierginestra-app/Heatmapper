import { Fragment } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '@/modules/ui';

export interface Crumb {
  readonly key: string;
  readonly label: string;
  /** Omitted for the current screen. */
  readonly onPress?: () => void;
}

export function Breadcrumbs({ crumbs }: { readonly crumbs: readonly Crumb[] }) {
  return (
    <View style={styles.row} accessibilityRole="header">
      {crumbs.map((crumb, i) => (
        <Fragment key={crumb.key}>
          {i > 0 && <Text style={styles.separator}>›</Text>}
          {crumb.onPress ? (
            <Pressable accessibilityRole="link" onPress={crumb.onPress} hitSlop={8}>
              <Text style={styles.link}>{crumb.label}</Text>
            </Pressable>
          ) : (
            <Text style={styles.current}>{crumb.label}</Text>
          )}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  separator: { color: colors.textMuted },
  link: { color: colors.accent, fontSize: 14 },
  current: { color: colors.text, fontSize: 14, fontWeight: '600' },
});
