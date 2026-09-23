import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  allowedChildKinds,
  childrenOf,
  nextSortOrder,
  type Location,
  type LocationKind,
} from '@/core';
import { Button, colors, ListRow, Muted, spacing, TextField } from '@/modules/ui';
import { KIND_LABEL } from '../deletionSummary';
import { useProjectsServices } from '../services';

interface Props {
  readonly projectId: string;
  readonly parent: Location | null;
  readonly locations: readonly Location[];
  readonly onOpen: (location: Location) => void;
  readonly onChanged: () => void;
}

/** Children of `parent` (or of the project when null) plus a form to add one. */
export function LocationList({ projectId, parent, locations, onOpen, onChanged }: Props) {
  const { projects, newId, now } = useProjectsServices();
  const kinds = allowedChildKinds(parent?.kind ?? null);
  const [kind, setKind] = useState<LocationKind | undefined>(kinds[0]);
  const [name, setName] = useState('');
  const children = childrenOf(locations, parent?.id ?? null);

  async function add() {
    if (!kind) return;
    const time = now();
    try {
      await projects.saveLocation({
        id: newId(),
        projectId,
        parentId: parent?.id ?? null,
        kind,
        name,
        sortOrder: nextSortOrder(locations, parent?.id ?? null),
        createdAtMs: time,
        updatedAtMs: time,
      });
      setName('');
      onChanged();
    } catch (error) {
      Alert.alert('Could not add location', error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <View style={styles.container}>
      {children.length === 0 ? <Muted>Nothing here yet.</Muted> : null}
      {children.map((child) => (
        <ListRow
          key={child.id}
          title={child.name}
          subtitle={`${KIND_LABEL[child.kind]} · ${childrenOf(locations, child.id).length} inside`}
          onPress={() => onOpen(child)}
        />
      ))}
      {kind ? (
        <View style={styles.addBox}>
          <View style={styles.kinds} accessibilityRole="radiogroup">
            {kinds.map((k) => (
              <Pressable
                key={k}
                accessibilityRole="radio"
                accessibilityState={{ checked: k === kind }}
                onPress={() => setKind(k)}
                style={[styles.chip, k === kind && styles.chipSelected]}
              >
                <Text style={styles.chipText}>{KIND_LABEL[k]}</Text>
              </Pressable>
            ))}
          </View>
          <TextField label={`New ${KIND_LABEL[kind].toLowerCase()} name`} value={name} onChangeText={setName} maxLength={120} />
          <Button title={`Add ${KIND_LABEL[kind].toLowerCase()}`} onPress={add} disabled={name.trim() === ''} variant="secondary" />
        </View>
      ) : (
        <Muted>Rooms are the smallest level; nothing can be nested inside.</Muted>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  addBox: { gap: spacing.sm, marginTop: spacing.sm },
  kinds: { flexDirection: 'row', gap: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 16, paddingVertical: 6, paddingHorizontal: spacing.md },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.surface },
  chipText: { color: colors.text, fontSize: 14 },
});
