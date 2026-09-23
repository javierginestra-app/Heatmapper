import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { type Project } from '@/core';
import { Button, colors, ListRow, Muted, spacing } from '@/modules/ui';
import { type ProjectsScreenProps } from '../routes';
import { useProjectsServices } from '../services';

export function ProjectListScreen({ navigation }: ProjectsScreenProps<'Projects'>) {
  const { projects, newId } = useProjectsServices();
  const [list, setList] = useState<readonly Project[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      projects.listProjects().then((items) => active && setList(items));
      return () => {
        active = false;
      };
    }, [projects]),
  );

  return (
    <View style={styles.screen}>
      <FlatList
        data={list ?? []}
        keyExtractor={(p) => p.id}
        contentContainerStyle={styles.content}
        ListEmptyComponent={list === null ? null : <Muted>No projects yet. Create one to start a survey.</Muted>}
        renderItem={({ item }) => (
          <ListRow
            title={item.name}
            subtitle={[item.address, `Updated ${new Date(item.updatedAtMs).toLocaleDateString()}`].filter(Boolean).join(' · ')}
            onPress={() => navigation.navigate('Project', { projectId: item.id })}
          />
        )}
      />
      <View style={styles.footer}>
        <Button title="New project" onPress={() => navigation.navigate('Project', { projectId: newId(), isNew: true })} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  footer: { padding: spacing.lg },
});
