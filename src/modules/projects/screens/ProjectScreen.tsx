import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { DEFAULT_RSSI_TARGET_DBM, type Location, type Project, type SessionSummary } from '@/core';
import { Button, colors, Muted, Section, spacing, TextField } from '@/modules/ui';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { LocationList } from '../components/LocationList';
import { SaveIndicator } from '../components/SaveIndicator';
import { SessionHistory } from '../components/SessionHistory';
import { describeCascade } from '../deletionSummary';
import { draftFromProject, draftIssues, projectFromDraft, type ProjectCandidate, type ProjectDraft } from '../projectDraft';
import { type ProjectsScreenProps } from '../routes';
import { useProjectsServices } from '../services';
import { useAutosave } from '../useAutosave';

export function ProjectScreen(props: ProjectsScreenProps<'Project'>) {
  const { projects } = useProjectsServices();
  const { projectId, isNew = false } = props.route.params;
  const [loaded, setLoaded] = useState<{ project: Project | null } | null>(null);

  useEffect(() => {
    projects.getProject(projectId).then((project) => setLoaded({ project }));
  }, [projects, projectId]);

  if (loaded === null) return <View style={styles.screen} />;
  if (loaded.project === null && !isNew) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Muted>This project no longer exists.</Muted>
      </View>
    );
  }
  return <ProjectEditor {...props} initial={loaded.project} />;
}

function ProjectEditor({ navigation, route, initial }: ProjectsScreenProps<'Project'> & { initial: Project | null }) {
  const { projects, now, geolocator } = useProjectsServices();
  const { projectId } = route.params;
  const base = useRef({ id: projectId, createdAtMs: initial?.createdAtMs ?? now() }).current;
  const [draft, setDraft] = useState<ProjectDraft>(() => draftFromProject(initial));
  const [exists, setExists] = useState(initial !== null);
  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [history, setHistory] = useState<readonly SessionSummary[]>([]);

  const candidate = useMemo(() => projectFromDraft(draft, base), [draft, base]);
  const issues = useMemo(() => draftIssues(candidate), [candidate]);
  const issueFor = (field: string) => issues.find((i) => i.field === field)?.message ?? null;
  const initialCandidate = useMemo(() => (initial ? projectFromDraft(draftFromProject(initial), base) : null), [initial, base]);

  const save = useCallback(
    async (value: ProjectCandidate) => {
      await projects.saveProject({ ...value, updatedAtMs: now() });
      setExists(true);
    },
    [projects, now],
  );
  const saveState = useAutosave(issues.length === 0 ? candidate : null, initialCandidate, save);
  const { flush, cancel } = saveState;
  useEffect(() => navigation.addListener('beforeRemove', () => void flush()), [navigation, flush]);

  const reload = useCallback(() => {
    projects.listLocations(projectId).then(setLocations);
    projects.listSessionHistory({ projectId, locationId: null }).then(setHistory);
  }, [projects, projectId]);
  useFocusEffect(reload);

  useEffect(() => {
    navigation.setOptions({ title: draft.name.trim() || 'New project' });
  }, [navigation, draft.name]);

  const update = (patch: Partial<ProjectDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function useCurrentLocation() {
    try {
      const { latitude, longitude } = await geolocator.currentPosition();
      update({ latitude, longitude });
    } catch (error) {
      Alert.alert('Location unavailable', error instanceof Error ? error.message : String(error));
    }
  }

  function confirmDelete() {
    const cascade = describeCascade(locations, history.length);
    Alert.alert(`Delete "${candidate.name || 'project'}"?`, cascade ?? 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          cancel();
          await projects.deleteProject(projectId);
          navigation.popToTop();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Breadcrumbs
          crumbs={[
            { key: 'projects', label: 'Projects', onPress: () => navigation.popToTop() },
            { key: projectId, label: candidate.name || 'New project' },
          ]}
        />
        <SaveIndicator state={saveState} invalid={issues.length > 0 && (exists || draft.name.trim() !== '')} />

        <TextField label="Project name" value={draft.name} onChangeText={(name) => update({ name })} error={issueFor('name')} maxLength={120} />
        <TextField label="Address" value={draft.address} onChangeText={(address) => update({ address })} error={issueFor('address')} />
        <View style={styles.coordinates}>
          <Muted>
            {draft.latitude !== null && draft.longitude !== null
              ? `GPS ${draft.latitude.toFixed(5)}, ${draft.longitude.toFixed(5)}`
              : 'No GPS position set'}
          </Muted>
          <View style={styles.buttons}>
            <Button title="Use current location" variant="secondary" onPress={useCurrentLocation} />
            {draft.latitude !== null && (
              <Button title="Clear" variant="secondary" onPress={() => update({ latitude: null, longitude: null })} />
            )}
          </View>
          {issueFor('coordinates') ? <Muted>{issueFor('coordinates')}</Muted> : null}
        </View>
        <TextField
          label="Description"
          value={draft.description}
          onChangeText={(description) => update({ description })}
          error={issueFor('description')}
          multiline
        />
        <TextField
          label={`RSSI pass target (dBm, blank = ${DEFAULT_RSSI_TARGET_DBM})`}
          value={draft.rssiTarget}
          onChangeText={(rssiTarget) => update({ rssiTarget })}
          error={issueFor('rssiTargetDbm')}
          keyboardType="numbers-and-punctuation"
          placeholder={String(DEFAULT_RSSI_TARGET_DBM)}
        />

        <Section title="Buildings, floors and rooms">
          {exists ? (
            <LocationList
              projectId={projectId}
              parent={null}
              locations={locations}
              onOpen={(location) => navigation.push('Location', { projectId, locationId: location.id })}
              onChanged={reload}
            />
          ) : (
            <Muted>Name the project to add buildings, floors and rooms.</Muted>
          )}
        </Section>

        <Section title="Survey history">
          <SessionHistory sessions={history} />
        </Section>

        {exists && (
          <View style={styles.danger}>
            <Button title="Delete project" variant="danger" onPress={confirmDelete} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  coordinates: { gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm },
  danger: { marginTop: spacing.xl },
});
