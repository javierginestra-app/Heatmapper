import { StyleSheet, Text } from 'react-native';
import { colors } from '@/modules/ui';
import { type AutosaveState } from '../useAutosave';

const TEXT = { idle: '', pending: 'Unsaved changes…', saving: 'Saving…', saved: 'Saved on this device', error: 'Not saved' } as const;

export function SaveIndicator({ state, invalid }: { readonly state: AutosaveState; readonly invalid: boolean }) {
  if (invalid) return <Text style={[styles.text, styles.error]}>Not saved — fix the highlighted fields</Text>;
  if (state.status === 'error') return <Text style={[styles.text, styles.error]}>Not saved: {state.error}</Text>;
  return <Text style={styles.text} accessibilityLiveRegion="polite">{TEXT[state.status]}</Text>;
}

const styles = StyleSheet.create({
  text: { color: colors.textMuted, fontSize: 12, minHeight: 16 },
  error: { color: colors.danger },
});
