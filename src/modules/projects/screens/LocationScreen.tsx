import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { breadcrumbPath, descendantsOf, LIMITS, type Location, type Project, type SessionSummary } from '@/core';
import { Button, colors, Muted, Section, spacing, TextField } from '@/modules/ui';
import { Breadcrumbs, type Crumb } from '../components/Breadcrumbs';
import { LocationList } from '../components/LocationList';
import { SaveIndicator } from '../components/SaveIndicator';
import { SessionHistory } from '../components/SessionHistory';
import { describeCascade, KIND_LABEL } from '../deletionSummary';
import { type ProjectsScreenProps } from '../routes';
import { useProjectsServices } from '../services';
import { useAutosave } from '../useAutosave';

interface Data {
  readonly project: Project | null;
  readonly locations: readonly Location[];
  readonly history: readonly SessionSummary[];
}

export function LocationScreen({ navigation, route }: ProjectsScreenProps<'Location'>) {
  const { projects } = useProjectsServices();
  const { projectId, locationId } = route.params;
  const [data, setData] = useState<Data | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      projects.getProject(projectId),
      projects.listLocations(projectId),
      projects.listSessionHistory({ projectId, locationId }),
    ]).then(([project, locations, history]) => setData({ project, locations, history }));
  }, [projects, projectId, locationId]);
  useFocusEffect(reload);
  const setTitle = useCallback((title: string) => navigation.setOptions({ title }), [navigation]);

  const location = data?.locations.find((l) => l.id === locationId);
  if (data === null) return <View style={styles.screen} />;
  if (!data.project || !location) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Muted>This location no longer exists.</Muted>
      </View>
    );
  }

  const crumbs: Crumb[] = [
    { key: 'projects', label: 'Projects', onPress: () => navigation.popToTop() },
    { key: projectId, label: data.project.name, onPress: () => navigation.popTo('Project', { projectId }) },
    ...breadcrumbPath(data.locations, locationId).map((l) => ({
      key: l.id,
      label: l.name,
      onPress: l.id === locationId ? undefined : () => navigation.popTo('Location', { projectId, locationId: l.id }),
    })),
  ];

  function confirmDelete() {
    const cascade = describeCascade(descendantsOf(data!.locations, locationId), data!.history.length);
    Alert.alert(`Delete ${KIND_LABEL[location!.kind].toLowerCase()} "${location!.name}"?`, cascade ?? 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await projects.deleteLocation(locationId);
          navigation.goBack();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Breadcrumbs crumbs={crumbs} />
        <LocationNameEditor key={location.id} location={location} onTitle={setTitle} navigation={navigation} />

        <Section title={location.kind === 'room' ? 'Contents' : 'Inside this ' + KIND_LABEL[location.kind].toLowerCase()}>
          <LocationList
            projectId={projectId}
            parent={location}
            locations={data.locations}
            onOpen={(child) => navigation.push('Location', { projectId, locationId: child.id })}
            onChanged={reload}
          />
        </Section>

        <Section title="Survey history">
          <SessionHistory sessions={data.history} />
        </Section>

        <View style={styles.danger}>
          <Button title={`Delete ${KIND_LABEL[location.kind].toLowerCase()}`} variant="danger" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LocationNameEditor(props: {
  location: Location;
  onTitle: (title: string) => void;
  navigation: ProjectsScreenProps<'Location'>['navigation'];
}) {
  const { location, onTitle, navigation } = props;
  const { projects, now } = useProjectsServices();
  const [name, setName] = useState(location.name);
  const trimmed = name.trim();
  const valid = trimmed !== '' && trimmed.length <= LIMITS.name;
  const initial = useMemo(() => location.name.trim(), [location.name]);
  const save = useCallback(
    async (value: string) => {
      // Re-read so a rename queued before a delete cannot recreate the location.
      const current = (await projects.listLocations(location.projectId)).find((l) => l.id === location.id);
      if (current) await projects.saveLocation({ ...current, name: value, updatedAtMs: now() });
    },
    [projects, location.projectId, location.id, now],
  );
  const state = useAutosave(valid ? trimmed : null, initial, save);
  const { flush } = state;
  useEffect(() => navigation.addListener('beforeRemove', () => void flush()), [navigation, flush]);

  useEffect(() => onTitle(trimmed || KIND_LABEL[location.kind]), [trimmed, location.kind, onTitle]);

  return (
    <>
      <SaveIndicator state={state} invalid={!valid} />
      <TextField
        label={`${KIND_LABEL[location.kind]} name`}
        value={name}
        onChangeText={setName}
        error={valid ? null : 'Required'}
        maxLength={LIMITS.name}
      />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  danger: { marginTop: spacing.xl },
});
