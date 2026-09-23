import { type NativeStackScreenProps } from '@react-navigation/native-stack';

/** Routes owned by the projects module; the app registers them under these names. */
export type ProjectsStackParamList = {
  Projects: undefined;
  Project: { projectId: string; isNew?: boolean };
  Location: { projectId: string; locationId: string };
};

export type ProjectsScreenProps<Name extends keyof ProjectsStackParamList> = NativeStackScreenProps<
  ProjectsStackParamList,
  Name
>;
