import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, spacing } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

export function Button(props: {
  readonly title: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
}) {
  const { title, onPress, variant = 'primary', disabled = false } = props;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], (pressed || disabled) && styles.dimmed]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.secondaryText]}>{title}</Text>
    </Pressable>
  );
}

export function TextField(props: TextInputProps & { readonly label: string; readonly error?: string | null }) {
  const { label, error, style, ...input } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null, style]}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Section({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ListRow(props: { readonly title: string; readonly subtitle?: string | null; readonly onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={props.onPress} style={({ pressed }) => [styles.row, pressed && styles.dimmed]}>
      <Text style={styles.rowTitle}>{props.title}</Text>
      {props.subtitle ? <Text style={styles.muted}>{props.subtitle}</Text> : null}
    </Pressable>
  );
}

export function Muted({ children }: { readonly children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  button: { borderRadius: 8, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: 'center' },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  danger: { backgroundColor: colors.danger },
  dimmed: { opacity: 0.6 },
  buttonText: { color: '#FFFFFF', fontWeight: '600', fontSize: 15 },
  secondaryText: { color: colors.text },
  field: { gap: spacing.xs },
  label: { color: colors.textMuted, fontSize: 13 },
  input: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: spacing.md,
    fontSize: 16,
  },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 13 },
  section: { gap: spacing.sm, marginTop: spacing.lg },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  row: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: spacing.md, gap: 2 },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '500' },
  muted: { color: colors.textMuted, fontSize: 13 },
});
